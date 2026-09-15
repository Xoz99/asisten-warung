import { query } from '../db.js';

// Profil usaha: jawaban "kenalan dulu" pas akun baru pertama masuk (jenis usaha, siapa yang jaga, kebutuhan
// utama, barang ber-barcode apa nggak). Sengaja pilihan tetap, BUKAN obrolan AI - nggak makan token sama sekali,
// dan hasilnya pasti bisa dipakai aturan di kode (margin, contoh barang, langkah awal di Beranda).
//
// Dipakai Mang AI lewat profilUntukKonteks() - satu blok pendek (~60 token) di konteks chat, biar saran harga &
// daftar belanjanya nyambung sama jenis usahanya (toko bangunan nggak disaranin jual rokok & mie instan).

// Kisaran margin = persen dari harga jual (rumus yang sama dipakai di prompt & layar detail stok).
export const JENIS_USAHA = {
  kelontong: { label: 'warung / toko kelontong', margin: [25, 40], pakai: 30, contoh: 'sembako, rokok, minuman, jajanan, sabun & kebutuhan dapur' },
  bangunan: { label: 'toko bangunan', margin: [10, 25], pakai: 15, contoh: 'semen, pasir, cat, paku, pipa, kabel & alat listrik, keramik' },
  konter: { label: 'konter HP & pulsa', margin: [5, 40], pakai: 20, contoh: 'pulsa & kuota (untung tipis), voucher, casing, charger, earphone (untung tebal)' },
  pertanian: { label: 'toko pertanian / pakan ternak', margin: [10, 25], pakai: 15, contoh: 'pupuk, benih, obat hama, pakan ternak & ikan, alat tani' },
  kosmetik: { label: 'toko kosmetik & perawatan', margin: [25, 45], pakai: 30, contoh: 'skincare, sabun muka, make up, parfum, sampo & perawatan rambut' },
  makanan: { label: 'warung makan / kedai minuman', margin: [40, 65], pakai: 50, contoh: 'makanan & minuman siap saji, bahan baku dapur' },
  lainnya: { label: 'usaha lainnya', margin: [20, 40], pakai: 30, contoh: '' },
};
const PENJAGA = { sendiri: 'dijaga pemilik sendiri', keluarga: 'dijaga gantian sama keluarga', karyawan: 'punya karyawan yang jaga' };
const KEBUTUHAN = {
  jualan: 'catat penjualan',
  stok: 'stok & kulakan',
  kasbon: 'kasbon / utang pelanggan',
  laporan: 'laporan untung',
  harga: 'nentuin harga jual',
  qris: 'terima bayar QRIS',
};
const BARCODE = { banyak: 'kebanyakan barang ada barcode', campur: 'barcode campur (sebagian ada, sebagian nggak)', jarang: 'barang jarang ada barcode' };

let kolomSiap = null;
// Kolom dibikin otomatis kalau belum ada - deploy di VPS nggak jalanin `npm run migrate`.
export function pastikanKolomProfil() {
  if (!kolomSiap) {
    kolomSiap = query('ALTER TABLE warung ADD COLUMN IF NOT EXISTS profil_usaha JSONB').catch((e) => {
      kolomSiap = null;
      throw e;
    });
  }
  return kolomSiap;
}

export async function ambilProfilUsaha(warungId) {
  await pastikanKolomProfil();
  const { rows } = await query('SELECT profil_usaha FROM warung WHERE id=$1', [warungId]);
  return rows[0]?.profil_usaha || null;
}

// Balikin profil yang udah dibersihin, atau null kalau isiannya nggak valid. Field yang nggak dikenal dibuang.
export function bersihkanProfil(b) {
  if (!b || typeof b !== 'object') return null;
  const diisiPada = new Date().toISOString();
  if (b.dilewati === true) return { versi: 1, dilewati: true, diisiPada };
  if (!JENIS_USAHA[b.jenis]) return null;
  const teks = (x, n) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, n) : '');
  const profil = {
    versi: 1,
    jenis: b.jenis,
    penjaga: PENJAGA[b.penjaga] ? b.penjaga : 'sendiri',
    kebutuhan: [...new Set((Array.isArray(b.kebutuhan) ? b.kebutuhan : []).filter((k) => KEBUTUHAN[k]))],
    barcode: BARCODE[b.barcode] ? b.barcode : 'campur',
    diisiPada,
  };
  if (b.jenis === 'lainnya') {
    const lain = teks(b.jenisLain, 40);
    if (lain) profil.jenisLain = lain;
  }
  const panggilan = teks(b.namaPanggilan, 40);
  if (panggilan) profil.namaPanggilan = panggilan;
  return profil;
}

export function profilUntukKonteks(profil) {
  if (!profil || profil.dilewati || !JENIS_USAHA[profil.jenis]) {
    return 'Profil usaha: belum diisi pemilik - anggap warung kelontong (margin wajar 25%-40%, pakai 30% kalau user nggak nyebut).';
  }
  const j = JENIS_USAHA[profil.jenis];
  const jenis = profil.jenis === 'lainnya' && profil.jenisLain ? profil.jenisLain : j.label;
  const bagian = [
    `Profil usaha (diisi pemilik): jenisnya ${jenis}`,
    PENJAGA[profil.penjaga],
    profil.kebutuhan?.length ? `paling butuh bantuan: ${profil.kebutuhan.map((k) => KEBUTUHAN[k]).join(', ')}` : null,
    BARCODE[profil.barcode],
  ].filter(Boolean);
  let teks = `${bagian.join('; ')}.`;
  if (j.contoh) teks += ` Barang khas usaha jenis ini: ${j.contoh}.`;
  teks += ` Margin wajar buat jenis usaha ini ${j.margin[0]}%-${j.margin[1]}% (pakai ${j.pakai}% kalau user nggak nyebut).`;
  return teks;
}
