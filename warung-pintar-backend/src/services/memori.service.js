import { query } from '../db.js';

// Memori jangka panjang Mang AI, PER AKUN WARUNG.
//
// Riwayat obrolan (lihat bersihkanRiwayat di asisten.routes.js) cuma 8 turn terakhir & disimpen di HP - begitu
// ganti HP / reset chat / obrolannya kepanjangan, Mang AI lupa semua yang pernah diceritain pemilik (nama
// panggilan, supplier langganan, jam buka, kebiasaan warung). Memori ini nyimpen FAKTA PENDEK yang berguna
// lintas obrolan, di server, jadi kebawa ke semua HP yang login pakai akun yang sama.
//
// Cara ngisinya NGGAK nambah panggilan AI: model yang lagi jawab chat sekalian ngisi field "ingat"/"lupakan"
// di jawaban JSON-nya (lihat ATURAN_MEMORI di bawah). Biaya tokennya cuma daftar catatan yang ikut di konteks
// (dibatasi MEMORI_KONTEKS_MAKS_HURUF).
export const MEMORI_MAKS = 50; // per warung - yang paling lama dibuang duluan kalau lewat
export const ISI_MAKS = 200; // huruf per catatan
const MEMORI_KONTEKS_MAKS_HURUF = 3000;

// Ditempel ke system prompt Gemini & OpenRouter (satu sumber, biar dua-duanya nurut aturan yang sama).
export const ATURAN_MEMORI = `MEMORI (field "ingat" & "lupakan"): kamu punya catatan jangka panjang tentang warung & pemiliknya
(lihat "Memori" di data di bawah) dari obrolan-obrolan sebelumnya. PAKAI catatan itu buat nyesuain jawaban
(nama panggilan, kebiasaan, supplier langganan, jam buka, dst) - jangan dibacain ulang satu-satu kalau nggak ditanya.
- "ingat": daftar 0-3 kalimat pendek (maks ~120 huruf, sudut pandang orang ketiga, misal "Pemilik minta
  dipanggil Bu Idah", "Supplier beras langganan: Toko Makmur, kirim tiap Senin") KALAU user nyebut
  fakta/kebiasaan/preferensi yang bakal berguna di obrolan LAIN, atau jelas minta diingat ("ingat ya ...").
  JANGAN diisi buat hal sesaat (angka penjualan/stok/untung/kasbon - itu udah ada di data real-time),
  JANGAN nyimpen yang udah ada di Memori, JANGAN PERNAH nyimpen PIN/kata sandi/kode OTP/nomor kartu.
  Kosongin (array kosong) kalau nggak ada yang perlu diingat - mayoritas obrolan emang kosong.
- Kalau info baru NGGANTIIN catatan lama (misal supplier ganti), taruh id catatan lama di "lupakan" dan tulis
  versi barunya di "ingat".
- "lupakan": daftar id catatan (disalin PERSIS dari Memori) yang user minta dilupain / udah nggak bener.
- Kalau kamu nyimpen atau ngehapus catatan, bilang singkat aja di "jawaban" (misal "Siap, Mang catet ya").`;

let tabelSiap = null;
// Tabel dibikin otomatis kalau belum ada - deploy di VPS cuma git pull + build + restart, nggak jalanin migrate.
export function pastikanTabelMemori() {
  if (!tabelSiap) {
    tabelSiap = (async () => {
      await query(`CREATE TABLE IF NOT EXISTS ai_memori (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        warung_id UUID NOT NULL REFERENCES warung(id) ON DELETE CASCADE,
        isi TEXT NOT NULL,
        sumber TEXT NOT NULL DEFAULT 'ai',
        created_at TIMESTAMPTZ DEFAULT now()
      )`);
      await query('CREATE INDEX IF NOT EXISTS idx_ai_memori_warung ON ai_memori (warung_id, created_at DESC)');
    })().catch((e) => {
      tabelSiap = null;
      throw e;
    });
  }
  return tabelSiap;
}

export async function ambilMemori(warungId) {
  await pastikanTabelMemori();
  const { rows } = await query(
    'SELECT id, isi, sumber, created_at FROM ai_memori WHERE warung_id=$1 ORDER BY created_at DESC LIMIT $2',
    [warungId, MEMORI_MAKS]
  );
  return rows;
}

// Data rahasia nggak boleh jadi memori - catatan ini ikut kekirim ke penyedia AI di tiap obrolan.
const POLA_RAHASIA = /\b(pin|kata ?sandi|password|sandi|otp|kode verifikasi|cvv|nomor kartu|no\.? kartu)\b/i;

export function bersihkanIsi(isi) {
  const teks = String(isi ?? '').replace(/\s+/g, ' ').trim().slice(0, ISI_MAKS);
  if (teks.length < 3 || POLA_RAHASIA.test(teks)) return null;
  return teks;
}

// Balikin baris yang BENERAN kesimpen (yang kosong/dobel/rahasia dilewat).
export async function simpanMemori(warungId, daftar, sumber = 'ai') {
  if (!Array.isArray(daftar) || !daftar.length) return [];
  const ada = await ambilMemori(warungId);
  const sudah = new Set(ada.map((r) => r.isi.toLowerCase()));
  const baru = [];
  for (const calon of daftar.slice(0, 5)) {
    const isi = bersihkanIsi(calon);
    if (!isi || sudah.has(isi.toLowerCase())) continue;
    sudah.add(isi.toLowerCase());
    const { rows } = await query(
      'INSERT INTO ai_memori (warung_id, isi, sumber) VALUES ($1,$2,$3) RETURNING id, isi, sumber, created_at',
      [warungId, isi, sumber]
    );
    baru.push(rows[0]);
  }
  if (baru.length) {
    await query(
      `DELETE FROM ai_memori WHERE warung_id=$1 AND id NOT IN (
         SELECT id FROM ai_memori WHERE warung_id=$1 ORDER BY created_at DESC LIMIT $2)`,
      [warungId, MEMORI_MAKS]
    );
  }
  return baru;
}

const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// warung_id ikut di WHERE - id catatan warung lain nggak bisa kehapus walau id-nya ditebak/dikarang AI.
export async function hapusMemori(warungId, ids) {
  const valid = (Array.isArray(ids) ? ids : []).filter((id) => typeof id === 'string' && POLA_UUID.test(id));
  if (!valid.length) return 0;
  await pastikanTabelMemori();
  const { rowCount } = await query('DELETE FROM ai_memori WHERE warung_id=$1 AND id = ANY($2::uuid[])', [warungId, valid]);
  return rowCount;
}

export async function hapusSemuaMemori(warungId) {
  await pastikanTabelMemori();
  const { rowCount } = await query('DELETE FROM ai_memori WHERE warung_id=$1', [warungId]);
  return rowCount;
}

export function memoriUntukKonteks(rows) {
  if (!rows.length) return 'Memori: belum ada catatan tentang warung/pemiliknya.';
  let teks = 'Memori jangka panjang tentang warung & pemiliknya (id | catatan), dari obrolan sebelumnya:\n';
  for (const r of rows) {
    const baris = `- ${r.id} | ${r.isi}\n`;
    if (teks.length + baris.length > MEMORI_KONTEKS_MAKS_HURUF) break;
    teks += baris;
  }
  return teks.trim();
}

// Perintah eksplisit "ingat ...", "tolong ingetin ...", "catat bahwa ..." - dipakai sebagai jaring pengaman
// (tetap kesimpen walau AI lagi mati / model lupa ngisi field "ingat"). "catat" doang SENGAJA nggak
// dihitung - "catat modal 5 juta" itu perintah aksi, bukan minta diingat.
export function perintahIngat(teks) {
  const m = /^\s*(?:tolong\s+|mang\s*,?\s*)?(?:ingat(?:in|kan)?|inget(?:in)?|catat(?:in)?\s+bahwa)\b\s*(?:ya|yah|dong|ini)?\s*[:,-]?\s*(.{3,})$/i.exec(
    teks || ''
  );
  return m ? m[1].trim() : null;
}
