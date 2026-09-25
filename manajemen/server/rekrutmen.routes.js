import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { catatLog, query, pool } from './db.js';
import { normalisasiNoHp } from './utils/noHp.js';
import { DOKUMEN_DIR } from './utils/fotoLamaran.js';

// Rekrutmen Sales Partner (PRD v0.2 §7-10): orang (identitas seumur hidup, D-59), lamaran (satu siklus, D-30),
// tahap + attempt (riwayat percobaan nggak pernah hilang), kampanye & titik sebar (sumber per titik, D-73), dan
// form daftar publik (?s=KODE). Belum dibangun (NOT VERIFIED / menyusul): cohort (§9), bonus rekrutmen (§10),
// pembayaran referral (§7.7), bank soal Product Test berversi, retensi data (§25), pembagian peran Owner/Recruiter (§22).

// Urutan tahap (D-77, tidak berubah). HIRING_DECISION = peristiwa, bukan status (§8.2): lamaran yang lulus Closing
// Test tetap di 'closing_test' sampai keputusan manusia dicatat.
// 'pelajari_produk' (revisi Sep 2026): setelah lolos screening kandidat dikirimin paket materi + link APK + kuis online;
// selesai pakai APK dan kuis benar semua -> otomatis ke Interview (lihat rekrutmenAlur.js).
export const TAHAP = ['new', 'screening', 'screening_passed', 'pelajari_produk', 'product_test', 'interview', 'field_test_24h', 'closing_test', 'hired'];
export const KELUAR = ['rejected', 'withdrawn', 'no_response', 'on_hold', 'talent_pool'];
// Tahap yang majunya lewat attempt yang lulus (bukan tombol "maju" biasa).
const TAHAP_DENGAN_TES = ['product_test', 'interview', 'field_test_24h', 'closing_test'];
const HARI_NO_RESPONSE = 3; // D-32
export const HARI_CLOSING_TEST = 6; // D-33
const KANAL = {
  JOB: 'Job portal',
  SLS: 'Sales warung',
  FB: 'Grup Facebook',
  OJOL: 'Komunitas ojol',
  WA: 'Komunitas WhatsApp',
  PST: 'Poster QR',
  IG: 'Instagram',
  WEB: 'Halaman sendiri',
  REF: 'Referral',
  LAIN: 'Lainnya',
};
// Pilihan "Tahu Konsulin dari mana?" - sumber keyakinan RENDAH (D-72), dilaporkan terpisah.
export const DROPDOWN_SUMBER = ['Facebook', 'WhatsApp', 'Instagram', 'TikTok', 'Poster', 'Teman / keluarga', 'Lainnya'];

// Hash satu arah nomor HP, disimpan PERMANEN (D-35) - buat nolak orang ganda & nanti bonus sekali seumur hidup,
// tetap jalan walau data pribadinya dihapus retensi (D-60). Garamnya konstanta: jangan diganti, hash lama jadi nggak cocok.
const hashHp = (hp) => crypto.createHash('sha256').update('konsulin-hp-v1:' + hp).digest('hex');
const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const teks = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const salah = (pesan, status = 400) => Object.assign(new Error(pesan), { status });

let siap = null;
export function pastikanTabelRekrutmen() {
  if (!siap) {
    siap = (async () => {
      await query(`CREATE TABLE IF NOT EXISTS mj_rek_kampanye (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nama TEXT NOT NULL, area TEXT, mulai DATE, selesai DATE,
        biaya NUMERIC NOT NULL DEFAULT 0, catatan TEXT, arsip BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT now()
      )`);
      // Titik sebar = satu tempat posting (satu grup FB, satu poster). Kodenya unik & jadi ?s= di link daftar (§7.2).
      await query(`CREATE TABLE IF NOT EXISTS mj_rek_titik (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        kampanye_id UUID NOT NULL REFERENCES mj_rek_kampanye(id) ON DELETE CASCADE,
        kode TEXT UNIQUE NOT NULL, kanal TEXT NOT NULL, deskripsi TEXT,
        biaya NUMERIC NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'queued', -- queued | ready | posted | failed | skipped | expired (§7.5)
        bukti_url TEXT, diposting_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT now()
      )`);
      // Biaya yang ditambah di tengah kampanye (boost iklan, cetak poster lagi, dll) - riwayatnya disimpan.
      await query(`CREATE TABLE IF NOT EXISTS mj_rek_biaya (
        id BIGSERIAL PRIMARY KEY,
        kampanye_id UUID NOT NULL REFERENCES mj_rek_kampanye(id) ON DELETE CASCADE,
        titik_id UUID REFERENCES mj_rek_titik(id) ON DELETE SET NULL,
        jumlah NUMERIC NOT NULL, catatan TEXT, oleh TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      )`);
      await query(`CREATE TABLE IF NOT EXISTS mj_orang (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        hp_hash TEXT UNIQUE NOT NULL,
        nama TEXT, no_hp TEXT, email TEXT, domisili TEXT,
        kode_ref TEXT UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      )`);
      await query(`CREATE TABLE IF NOT EXISTS mj_lamaran (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nomor BIGSERIAL,
        orang_id UUID NOT NULL REFERENCES mj_orang(id),
        status TEXT NOT NULL DEFAULT 'new',
        status_sejak TIMESTAMPTZ NOT NULL DEFAULT now(),
        -- Sumber nempel di LAMARAN, bukan di orang (§7.3) - retry nggak nimpa riwayat.
        sumber_kode TEXT, sumber_titik_id UUID REFERENCES mj_rek_titik(id) ON DELETE SET NULL,
        sumber_dropdown TEXT, keyakinan TEXT NOT NULL DEFAULT 'unknown', -- tinggi | rendah | unknown
        referrer_orang_id UUID REFERENCES mj_orang(id),
        alasan_keluar TEXT,
        terakhir_followup TIMESTAMPTZ, terakhir_respon TIMESTAMPTZ,
        closing_mulai TIMESTAMPTZ,
        dibuat_oleh TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      )`);
      await query('CREATE INDEX IF NOT EXISTS idx_mj_lamaran_orang ON mj_lamaran (orang_id, created_at DESC)');
      // Satu orang cuma boleh punya satu lamaran yang lagi jalan.
      await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_mj_lamaran_aktif ON mj_lamaran (orang_id)
        WHERE status NOT IN ('hired','rejected','withdrawn','no_response','on_hold','talent_pool')`);
      await query(`CREATE TABLE IF NOT EXISTS mj_rek_attempt (
        id BIGSERIAL PRIMARY KEY,
        lamaran_id UUID NOT NULL REFERENCES mj_lamaran(id) ON DELETE CASCADE,
        tahap TEXT NOT NULL,
        hasil TEXT NOT NULL, -- lulus | gagal | dijadwalkan | berjalan
        data JSONB, catatan TEXT, pewawancara TEXT, jadwal TIMESTAMPTZ,
        aktor TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      )`);
      // Jawaban form lamaran (data diri, pengalaman, kesiapan) - per LAMARAN, karena bisa beda tiap kali melamar.
      await query('ALTER TABLE mj_lamaran ADD COLUMN IF NOT EXISTS jawaban JSONB');
      // CV & foto diri yang diunggah pelamar. Filenya di disk server (DOKUMEN_DIR), bukan di database.
      await query(`CREATE TABLE IF NOT EXISTS mj_lamaran_dokumen (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lamaran_id UUID NOT NULL REFERENCES mj_lamaran(id) ON DELETE CASCADE,
        jenis TEXT NOT NULL, -- cv | foto
        nama_file TEXT, mime TEXT NOT NULL, ukuran INT NOT NULL, lokasi TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      )`);
      // Semua peristiwa (ganti status, follow-up, catatan, keputusan) - aktor, waktu, nilai lama/baru, alasan (§23).
      await query(`CREATE TABLE IF NOT EXISTS mj_lamaran_event (
        id BIGSERIAL PRIMARY KEY,
        lamaran_id UUID NOT NULL REFERENCES mj_lamaran(id) ON DELETE CASCADE,
        jenis TEXT NOT NULL, dari TEXT, ke TEXT, isi TEXT,
        aktor TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      )`);
    })().catch((e) => {
      siap = null;
      throw e;
    });
  }
  return siap;
}

const kodeRefBaru = () => 'REF-' + crypto.randomBytes(3).toString('hex').toUpperCase();

export async function catatEvent(c, lamaranId, jenis, { dari = null, ke = null, isi = null }, aktor) {
  await c.query('INSERT INTO mj_lamaran_event (lamaran_id, jenis, dari, ke, isi, aktor) VALUES ($1,$2,$3,$4,$5,$6)', [lamaranId, jenis, dari, ke, isi, aktor]);
}

export async function transaksi(fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

// ---------------- Formulir lamaran ----------------
// Pilihan tetap (biar bisa disaring & dihitung), bukan teks bebas.
export const PILIHAN = {
  jenisKelamin: ['Laki-laki', 'Perempuan'],
  pendidikan: ['SD', 'SMP', 'SMA / SMK', 'D3', 'S1', 'S2 ke atas'],
  pekerjaan: ['Belum bekerja', 'Karyawan', 'Wiraswasta / punya usaha', 'Pelajar / mahasiswa', 'Freelance', 'Ibu rumah tangga', 'Lainnya'],
  pengalamanSales: ['Belum pernah', 'Kurang dari 1 tahun', '1-3 tahun', 'Lebih dari 3 tahun'],
  waktuKerja: ['Full time', 'Part time'],
  kendaraan: ['Motor sendiri', 'Mobil sendiri', 'Nggak punya kendaraan'],
  kenalWarung: ['Belum kenal', '1-5 warung', '6-20 warung', 'Lebih dari 20 warung'],
  skemaKerja: ['Full komisi berbasis performa + passive income', 'Gaji pokok', 'Saya punya skema lain (nanti saya diskusikan)'],
  waktuHubungi: ['Pagi (09.00-12.00)', 'Siang (12.00-15.00)', 'Sore (15.00-18.00)', 'Malam (setelah 18.00)'],
  tempatProspek: [
    'Langsung datang ke sentra bisnis atau ruko di sekitar lokasi saya',
    'Relasi pribadi atau teman yang memiliki usaha',
    'Komunitas bisnis atau asosiasi UMKM',
    'Platform marketplace atau forum diskusi bisnis',
    'Media sosial (Facebook Groups, LinkedIn, Instagram)',
    'Saya memiliki ide lain',
  ],
};
export const PROSPEK_LAIN = 'Saya memiliki ide lain';

// Bersihin jawaban form publik. `wajib` = true buat form daftar publik (semua isian penting wajib); input manual
// recruiter boleh sebagian.
function bersihkanJawaban(b, wajib) {
  const j = {};
  const pilih = (k) => {
    if (PILIHAN[k].includes(b[k])) j[k] = b[k];
    else if (wajib) throw salah(`Pilih ${LABEL[k].toLowerCase()}`);
  };
  const isian = (k, n, min = 1) => {
    const v = teks(b[k], n);
    if (v.length >= min) j[k] = v;
    else if (wajib && min > 0) throw salah(min > 1 ? `${LABEL[k]} minimal ${min} huruf` : `${LABEL[k]} wajib diisi`);
  };
  if (/^\d{4}-\d{2}-\d{2}$/.test(b.tanggalLahir || '')) {
    // Nggak ada batas umur minimal - cuma dicek tanggalnya masuk akal (bukan tanggal depan / salah ketik tahun).
    const umur = (Date.now() - new Date(b.tanggalLahir).getTime()) / (365.25 * 86400000);
    if (!(umur > 0 && umur <= 100)) throw salah('Tanggal lahir nggak valid, cek lagi tahunnya');
    j.tanggalLahir = b.tanggalLahir;
  } else if (wajib) throw salah('Tanggal lahir wajib diisi');
  pilih('jenisKelamin');
  isian('kota', 60);
  isian('kecamatan', 60);
  pilih('pendidikan');
  pilih('pekerjaan');
  pilih('pengalamanSales');
  isian('bidangPengalaman', 200, 0);
  pilih('waktuKerja');
  isian('ketersediaan', 120);
  pilih('kendaraan');
  if (typeof b.hpAndroid === 'boolean') j.hpAndroid = b.hpAndroid;
  else if (wajib) throw salah('Jawab dulu soal HP Android');
  isian('area', 200);
  pilih('kenalWarung');
  isian('alasan', 1000, 20);
  isian('sosmed', 200, 0);
  pilih('skemaKerja');
  pilih('waktuHubungi');
  // Tempat cari calon pelanggan: pilih 1-2. "Ide lain" wajib ditulis idenya.
  const prospek = Array.isArray(b.tempatProspek) ? [...new Set(b.tempatProspek)].filter((x) => PILIHAN.tempatProspek.includes(x)) : [];
  if (prospek.length > 2) throw salah('Tempat cari pelanggan maksimal pilih 2');
  if (prospek.length) j.tempatProspek = prospek;
  else if (wajib) throw salah('Pilih tempat terbaik buat nemuin pemilik usaha (maksimal 2)');
  if (prospek.includes(PROSPEK_LAIN)) isian('tempatProspekLain', 200, 5);
  if (wajib && b.setujuData !== true) throw salah('Centang persetujuan pemakaian data dulu');
  j.setujuData = b.setujuData === true;
  j.setujuWa = b.setujuWa === true;
  return j;
}
export const LABEL = {
  jenisKelamin: 'Jenis kelamin', pendidikan: 'Pendidikan terakhir', pekerjaan: 'Pekerjaan sekarang', pengalamanSales: 'Pengalaman jualan',
  waktuKerja: 'Waktu kerja', kendaraan: 'Kendaraan', kenalWarung: 'Jumlah warung yang dikenal', kota: 'Kota / kabupaten', kecamatan: 'Kecamatan',
  ketersediaan: 'Hari & jam tersedia', area: 'Area yang mau digarap', alasan: 'Alasan tertarik', bidangPengalaman: 'Bidang pengalaman', sosmed: 'Link sosmed',
  skemaKerja: 'Skema kerja yang diinginkan', waktuHubungi: 'Waktu terbaik dihubungi', tempatProspek: 'Tempat cari pelanggan', tempatProspekLain: 'Ide tempat cari pelanggan',
};
// Link form lamaran yang dibagiin ke calon pelamar. Di produksi form-nya di landing page (konsulin.com/karir), bukan
// di domain internal makalin - lihat README.
export const DAFTAR_URL = (process.env.DAFTAR_URL || '').replace(/\/+$/, '');

const MAKS_DOKUMEN = 3 * 1024 * 1024;
// Jenis file dicek dari ISI filenya (tanda tangan byte), bukan dari nama/klaim browser.
function kenaliFile(buf) {
  if (buf.subarray(0, 4).toString() === '%PDF') return { mime: 'application/pdf', ext: 'pdf' };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  // Foto & CV gambar dikonversi ke WEBP di browser sebelum dikirim (lihat lib/gambar di form lamaran).
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}
function bacaDokumen(d, jenis) {
  if (!d) return null;
  const m = /^data:[\w/+.-]+;base64,(.+)$/.exec(d.data || '');
  if (!m) throw salah(`File ${jenis === 'cv' ? 'CV' : 'foto'} nggak kebaca`);
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > MAKS_DOKUMEN) throw salah(`File ${jenis === 'cv' ? 'CV' : 'foto'} maksimal 3 MB`);
  const k = kenaliFile(buf);
  if (!k || (jenis === 'foto' && k.ext === 'pdf')) throw salah(jenis === 'cv' ? 'CV harus PDF atau gambar (JPG, PNG, WEBP)' : 'Foto harus JPG, PNG, atau WEBP');
  return { buf, ...k, nama: teks(d.nama, 120) || `${jenis}.${k.ext}` };
}

// Bikin lamaran baru (dari form publik atau input recruiter). Orang dikenali dari hash nomor HP (D-35/D-59).
// `lengkapi` (form publik): kalau orangnya udah punya lamaran jalan yang belum ada isian form-nya (ditambah manual
// recruiter, mis. kandidat dari Glints), isian + CV/foto + sumber link-nya dipakai buat ngelengkapin lamaran itu.
// Dulu ditolak 409 - kandidat udah ngisi form lewat link, tapi datanya ilang dan titik sebarnya nggak kehitung.
async function buatLamaran({ nama, noHp, email, domisili, s, dropdown, referral, jawaban = null, dokumen = [], lengkapi = false }, aktor) {
  const hp = normalisasiNoHp(noHp || '');
  if (!teks(nama, 80)) throw salah('Nama wajib diisi');
  if (!hp) throw salah('Nomor HP nggak valid. Contoh: 0812-3456-7890');
  // Rantai sumber (§7.3): ?s= (tinggi) -> kode referral (tinggi) -> dropdown (rendah) -> unknown.
  let titik = null;
  const kode = teks(s, 30).toUpperCase();
  if (kode) {
    const { rows } = await query('SELECT id, kode FROM mj_rek_titik WHERE kode=$1', [kode]);
    titik = rows[0] || null;
  }
  let referrer = null;
  const ref = teks(referral, 20).toUpperCase();
  if (ref) {
    const { rows } = await query('SELECT id, hp_hash FROM mj_orang WHERE kode_ref=$1', [ref]);
    if (!rows.length) throw salah('Kode referral nggak dikenal');
    if (rows[0].hp_hash === hashHp(hp)) throw salah('Nggak bisa mereferensikan diri sendiri');
    referrer = rows[0];
  }
  const pilihan = DROPDOWN_SUMBER.includes(dropdown) ? dropdown : null;
  const keyakinan = titik || referrer ? 'tinggi' : pilihan ? 'rendah' : 'unknown';

  return transaksi(async (c) => {
    const h = hashHp(hp);
    let { rows: o } = await c.query('SELECT * FROM mj_orang WHERE hp_hash=$1 FOR UPDATE', [h]);
    if (!o.length) {
      ({ rows: o } = await c.query(
        'INSERT INTO mj_orang (hp_hash, nama, no_hp, email, domisili, kode_ref) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
        [h, teks(nama, 80), hp, teks(email, 120) || null, teks(domisili, 80) || null, kodeRefBaru()]
      ));
    } else {
      await c.query('UPDATE mj_orang SET nama=$2, no_hp=$3, email=COALESCE($4,email), domisili=COALESCE($5,domisili) WHERE id=$1', [
        o[0].id,
        teks(nama, 80),
        hp,
        teks(email, 120) || null,
        teks(domisili, 80) || null,
      ]);
    }
    const orang = o[0];
    const { rows: aktif } = await c.query(
      `SELECT id, status, jawaban IS NOT NULL AS ada_jawaban, keyakinan FROM mj_lamaran
       WHERE orang_id=$1 AND status NOT IN ('rejected','withdrawn','no_response','on_hold','talent_pool') FOR UPDATE`,
      [orang.id]
    );
    if (aktif.some((a) => a.status === 'hired')) throw salah('Orang ini udah jadi Sales Partner. Sales yang masih aktif nggak bisa daftar lagi (D-34).', 409);
    if (referrer && referrer.id === orang.id) throw salah('Nggak bisa mereferensikan diri sendiri');
    const kosong = lengkapi && jawaban ? aktif.find((a) => !a.ada_jawaban) : null;
    if (aktif.length && !kosong) throw salah('Orang ini masih punya lamaran yang lagi jalan.', 409);
    let l;
    if (kosong) {
      // Sumber dari link/referral (keyakinan tinggi) ngalahin sumber yang ditebak waktu ditambah manual.
      const pakaiSumber = keyakinan === 'tinggi' || kosong.keyakinan === 'unknown';
      ({ rows: l } = await c.query(
        `UPDATE mj_lamaran SET jawaban=$2,
           sumber_kode = CASE WHEN $3 THEN $4 ELSE sumber_kode END, sumber_titik_id = CASE WHEN $3 THEN $5::uuid ELSE sumber_titik_id END,
           sumber_dropdown = CASE WHEN $3 THEN $6 ELSE sumber_dropdown END, keyakinan = CASE WHEN $3 THEN $7 ELSE keyakinan END,
           referrer_orang_id = CASE WHEN $3 THEN $8::uuid ELSE referrer_orang_id END
         WHERE id=$1 RETURNING *`,
        [kosong.id, JSON.stringify(jawaban), pakaiSumber, titik?.kode || (kode || null), titik?.id || null, pilihan, keyakinan, referrer?.id || null]
      ));
    } else {
      ({ rows: l } = await c.query(
        `INSERT INTO mj_lamaran (orang_id, sumber_kode, sumber_titik_id, sumber_dropdown, keyakinan, referrer_orang_id, dibuat_oleh, jawaban)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [orang.id, titik?.kode || (kode || null), titik?.id || null, pilihan, keyakinan, referrer?.id || null, aktor, jawaban ? JSON.stringify(jawaban) : null]
      ));
    }
    // File ditulis di dalam transaksi: kalau nyimpen barisnya gagal, file yang udah ketulis dihapus lagi.
    const ditulis = [];
    try {
      for (const d of dokumen) {
        fs.mkdirSync(DOKUMEN_DIR, { recursive: true });
        const lokasi = `${l[0].id}-${d.jenis}-${crypto.randomBytes(4).toString('hex')}.${d.ext}`;
        fs.writeFileSync(path.join(DOKUMEN_DIR, lokasi), d.buf);
        ditulis.push(lokasi);
        await c.query('INSERT INTO mj_lamaran_dokumen (lamaran_id, jenis, nama_file, mime, ukuran, lokasi) VALUES ($1,$2,$3,$4,$5,$6)', [
          l[0].id, d.jenis, d.nama, d.mime, d.buf.length, lokasi,
        ]);
      }
    } catch (e) {
      for (const f of ditulis) fs.rmSync(path.join(DOKUMEN_DIR, f), { force: true });
      throw e;
    }
    const sumberTeks = titik?.kode || (referrer ? 'referral ' + ref : pilihan || 'tidak diketahui');
    if (kosong) await catatEvent(c, l[0].id, 'catatan', { isi: `Kandidat ngisi form lamaran sendiri (sumber: ${sumberTeks}) - data form, CV & foto kelengkap` }, aktor);
    else await catatEvent(c, l[0].id, 'status', { ke: 'new', isi: `Lamaran masuk (sumber: ${sumberTeks})` }, aktor);
    return { lamaran: l[0], orang };
  });
}

// ---------------- Form daftar publik (tanpa login) ----------------
export const publikRouter = Router();
// Kiriman dari server landing page (konsulin.com, jalan di mesin yang sama) datang dari loopback dan bawa IP asli
// pelamar di X-Pelamar-IP. Header itu cuma dipercaya kalau koneksinya beneran dari loopback.
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
export const ipPelamar = (req) => {
  const h = req.get('x-pelamar-ip');
  return h && LOOPBACK.has(req.socket.remoteAddress) ? String(h).slice(0, 64) : req.ip;
};
const daftarLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  // Yang dihitung cuma kiriman yang beneran masuk. Isian kurang / nomor dobel (400/409) nggak ngabisin jatah -
  // pelamar yang benerin form-nya berkali-kali nggak ikut kekunci.
  skipFailedRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(ipPelamar(req)),
  message: { error: 'Terlalu banyak percobaan. Coba lagi nanti.' },
});

publikRouter.get('/daftar/info', async (req, res, next) => {
  try {
    await pastikanTabelRekrutmen();
    const kode = teks(req.query.s, 30).toUpperCase();
    let kampanye = null;
    if (kode) {
      const { rows } = await query('SELECT k.nama, k.area FROM mj_rek_titik t JOIN mj_rek_kampanye k ON k.id=t.kampanye_id WHERE t.kode=$1', [kode]);
      kampanye = rows[0] || null;
    }
    res.json({ kampanye, pilihanSumber: DROPDOWN_SUMBER, pilihan: PILIHAN });
  } catch (e) {
    next(e);
  }
});

publikRouter.post('/daftar', daftarLimiter, async (req, res, next) => {
  try {
    await pastikanTabelRekrutmen();
    const b = req.body || {};
    // "Tahu dari mana" wajib kalau nggak datang lewat link berkode yang dikenal / referral (§7.3).
    const kodeS = teks(b.s, 30).toUpperCase();
    const adaTitik = kodeS ? (await query('SELECT 1 FROM mj_rek_titik WHERE kode=$1', [kodeS])).rows.length > 0 : false;
    if (!adaTitik && !teks(b.referral, 20) && !DROPDOWN_SUMBER.includes(b.dropdown)) {
      return res.status(400).json({ error: 'Pilih dulu tahu Konsulin dari mana' });
    }
    const jawaban = bersihkanJawaban(b, true);
    if (!b.cv) return res.status(400).json({ error: 'Upload CV kamu dulu' });
    const dokumen = [
      b.cv ? { jenis: 'cv', ...bacaDokumen(b.cv, 'cv') } : null,
      b.foto ? { jenis: 'foto', ...bacaDokumen(b.foto, 'foto') } : null,
    ].filter(Boolean);
    await buatLamaran({ ...b, domisili: [teks(b.kecamatan, 60), teks(b.kota, 60)].filter(Boolean).join(', '), jawaban, dokumen, lengkapi: true }, 'form daftar');
    res.status(201).json({ ok: true });
  } catch (e) {
    if (e.status === 409) return res.status(409).json({ error: 'Nomor ini udah terdaftar dan lagi diproses. Tim kami bakal ngehubungin kamu.' });
    next(e);
  }
});

// ---------------- Admin ----------------
const router = Router();
router.use(async (req, res, next) => {
  try {
    await pastikanTabelRekrutmen();
    next();
  } catch (e) {
    next(e);
  }
});

// D-32: 3 hari setelah di-follow-up nggak ada respons -> NO_RESPONSE, dijalanin sistem tiap kali data dibaca.
export async function tandaiNoResponse() {
  const { rows } = await query(
    `UPDATE mj_lamaran SET status='no_response', status_sejak=now(), alasan_keluar='Nggak membalas ${HARI_NO_RESPONSE} hari setelah di-follow-up (D-32)'
     WHERE status NOT IN ('hired','rejected','withdrawn','no_response','on_hold','talent_pool')
       AND terakhir_followup IS NOT NULL AND terakhir_followup < now() - interval '${HARI_NO_RESPONSE} days'
       AND (terakhir_respon IS NULL OR terakhir_respon < terakhir_followup)
     RETURNING id`
  );
  for (const r of rows) await query("INSERT INTO mj_lamaran_event (lamaran_id, jenis, ke, isi, aktor) VALUES ($1,'status','no_response',$2,'sistem')", [r.id, `Otomatis: nggak membalas ${HARI_NO_RESPONSE} hari (D-32)`]);
}

export const KOLOM_LAMARAN = `l.*, 'KD-' || lpad(l.nomor::text, 4, '0') AS kode, o.nama, o.no_hp, o.email, o.domisili, o.kode_ref,
  t.kanal AS sumber_kanal, k.nama AS kampanye_nama, ro.nama AS referrer_nama,
  (SELECT count(*)::int FROM mj_lamaran l2 WHERE l2.orang_id = l.orang_id) AS jumlah_lamaran,
  (SELECT row_to_json(a) FROM (SELECT hasil, jadwal, pewawancara, created_at FROM mj_rek_attempt a WHERE a.lamaran_id=l.id AND a.tahap=l.status ORDER BY a.id DESC LIMIT 1) a) AS attempt_terakhir`;
export const JOIN_LAMARAN = `FROM mj_lamaran l JOIN mj_orang o ON o.id = l.orang_id
  LEFT JOIN mj_rek_titik t ON t.id = l.sumber_titik_id LEFT JOIN mj_rek_kampanye k ON k.id = t.kampanye_id
  LEFT JOIN mj_orang ro ON ro.id = l.referrer_orang_id`;

router.get('/rekrutmen/ringkasan', async (req, res, next) => {
  try {
    await tandaiNoResponse();
    const [{ rows: status }, { rows: minggu }, { rows: jadwal }, { rows: waktu }, { rows: perluFu }] = await Promise.all([
      query('SELECT status, count(*)::int AS n FROM mj_lamaran GROUP BY status'),
      query(`SELECT count(*)::int AS n FROM mj_lamaran WHERE created_at >= now() - interval '7 days'`),
      query(
        `SELECT a.jadwal, a.pewawancara, o.nama, l.id AS lamaran_id FROM mj_rek_attempt a JOIN mj_lamaran l ON l.id=a.lamaran_id JOIN mj_orang o ON o.id=l.orang_id
         WHERE a.hasil='dijadwalkan' AND l.status='interview' AND a.jadwal >= now() - interval '2 hours'
           AND NOT EXISTS (SELECT 1 FROM mj_rek_attempt b WHERE b.lamaran_id=a.lamaran_id AND b.tahap='interview' AND b.id > a.id)
         ORDER BY a.jadwal LIMIT 1`
      ),
      query(`SELECT round(avg(EXTRACT(EPOCH FROM (status_sejak - created_at)) / 86400))::int AS hari, count(*)::int AS n FROM mj_lamaran WHERE status='hired'`),
      query(
        `SELECT count(*)::int AS n FROM mj_lamaran WHERE status NOT IN ('hired','rejected','withdrawn','no_response','on_hold','talent_pool')
         AND COALESCE(terakhir_followup, created_at) < now() - interval '2 days'`
      ),
    ]);
    const per = Object.fromEntries(status.map((r) => [r.status, r.n]));
    res.json({
      linkDaftar: DAFTAR_URL,
      perStatus: per,
      aktif: TAHAP.filter((t) => t !== 'hired').reduce((a, t) => a + (per[t] || 0), 0),
      mingguIni: minggu[0].n,
      jadwalTerdekat: jadwal[0] || null,
      rataHariHired: waktu[0].n ? waktu[0].hari : null,
      jumlahHired: per.hired || 0,
      perluFollowup: perluFu[0].n,
      pilihanSumber: DROPDOWN_SUMBER,
    });
  } catch (e) {
    next(e);
  }
});

router.get('/rekrutmen/lamaran', async (req, res, next) => {
  try {
    await tandaiNoResponse();
    const mode = req.query.mode === 'arsip' ? 'arsip' : 'aktif';
    const q = teks(req.query.q, 60);
    const pola = q ? '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%' : null;
    const { rows } = await query(
      `SELECT ${KOLOM_LAMARAN} ${JOIN_LAMARAN}
       WHERE ${mode === 'arsip' ? `l.status IN ('rejected','withdrawn','no_response','on_hold','talent_pool','hired')` : `l.status NOT IN ('rejected','withdrawn','no_response','on_hold','talent_pool','hired')`}
         AND ($1::text IS NULL OR o.nama ILIKE $1 OR o.no_hp ILIKE $1 OR l.sumber_kode ILIKE $1)
       ORDER BY l.status_sejak DESC LIMIT 500`,
      [pola]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.post('/rekrutmen/lamaran', async (req, res, next) => {
  try {
    const r = await buatLamaran(req.body || {}, req.admin.nama);
    await catatLog(req, 'rekrutmen.lamaran.tambah', { nama: r.orang.nama, sumber: r.lamaran.sumber_kode || r.lamaran.sumber_dropdown || '-' });
    res.status(201).json(r.lamaran);
  } catch (e) {
    next(e);
  }
});

router.get('/rekrutmen/lamaran/:id', async (req, res, next) => {
  try {
    if (!POLA_UUID.test(req.params.id)) return res.status(404).json({ error: 'Lamaran tidak ditemukan' });
    const { rows } = await query(`SELECT ${KOLOM_LAMARAN} ${JOIN_LAMARAN} WHERE l.id=$1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Lamaran tidak ditemukan' });
    const l = rows[0];
    const [{ rows: attempt }, { rows: event }, { rows: riwayat }, { rows: dokumen }] = await Promise.all([
      query('SELECT * FROM mj_rek_attempt WHERE lamaran_id=$1 ORDER BY id DESC', [l.id]),
      query('SELECT * FROM mj_lamaran_event WHERE lamaran_id=$1 ORDER BY id DESC', [l.id]),
      query(`SELECT id, 'KD-' || lpad(nomor::text, 4, '0') AS kode, status, created_at, status_sejak, sumber_kode, alasan_keluar FROM mj_lamaran WHERE orang_id=$1 AND id<>$2 ORDER BY created_at DESC`, [
        l.orang_id,
        l.id,
      ]),
      query('SELECT id, jenis, nama_file, mime, ukuran, created_at FROM mj_lamaran_dokumen WHERE lamaran_id=$1 ORDER BY created_at', [l.id]),
    ]);
    res.json({ lamaran: l, attempt, event, riwayat, dokumen, label: LABEL, hariNoResponse: HARI_NO_RESPONSE, hariClosing: HARI_CLOSING_TEST });
  } catch (e) {
    next(e);
  }
});

export async function ambilLamaran(c, id) {
  if (!POLA_UUID.test(id)) throw salah('Lamaran tidak ditemukan', 404);
  const { rows } = await c.query('SELECT l.*, o.nama FROM mj_lamaran l JOIN mj_orang o ON o.id=l.orang_id WHERE l.id=$1 FOR UPDATE OF l', [id]);
  if (!rows.length) throw salah('Lamaran tidak ditemukan', 404);
  return rows[0];
}

export async function ganti(c, l, ke, isi, aktor, ekstra = '') {
  await c.query(`UPDATE mj_lamaran SET status=$2, status_sejak=now()${ekstra} WHERE id=$1`, [l.id, ke]);
  await catatEvent(c, l.id, 'status', { dari: l.status, ke, isi }, aktor);
}

// Maju satu tahap (tahap tanpa tes): new -> screening -> screening_passed -> product_test. Nggak boleh lompat (§8.2).
router.post('/rekrutmen/lamaran/:id/maju', async (req, res, next) => {
  try {
    const hasil = await transaksi(async (c) => {
      const l = await ambilLamaran(c, req.params.id);
      const i = TAHAP.indexOf(l.status);
      if (i < 0 || TAHAP_DENGAN_TES.includes(l.status) || l.status === 'hired') throw salah('Tahap ini majunya lewat hasil tes, bukan tombol maju');
      const ke = TAHAP[i + 1];
      await ganti(c, l, ke, teks(req.body.catatan, 300) || null, req.admin.nama);
      return { nama: l.nama, dari: l.status, ke };
    });
    await catatLog(req, 'rekrutmen.lamaran.maju', hasil);
    res.json({ ok: true, ke: hasil.ke });
  } catch (e) {
    next(e);
  }
});

// Catat attempt di tahap bertes. Aturan lulus (D-33):
//  product_test  : semua soal kuis aktif benar + setuju bagi hasil
//  interview     : keputusan manusia (lulus/gagal) + pewawancara + alasan; bisa dijadwalkan dulu
//  field_test_24h: 3 warung dikunjungi + laporan terkirim
//  closing_test  : 3 warung jadi customer, maksimal 6 hari sejak closing test dimulai
router.post('/rekrutmen/lamaran/:id/attempt', async (req, res, next) => {
  try {
    const b = req.body || {};
    const hasil = await transaksi(async (c) => {
      const l = await ambilLamaran(c, req.params.id);
      if (!TAHAP_DENGAN_TES.includes(l.status)) throw salah('Tahap ini nggak punya tes');
      let lulus;
      let data = null;
      let catatan = teks(b.catatan, 1000) || null;
      let pewawancara = null;
      let jadwal = null;
      if (l.status === 'product_test') {
        // Jumlah soal = semua soal kuis aktif (sama kayak kuis online), kecuali admin nyebut sendiri.
        const { rows: aktif } = await query('SELECT count(*)::int AS n FROM mj_rek_soal WHERE aktif').catch(() => ({ rows: [{ n: 5 }] }));
        const dari = Math.max(1, Math.min(100, Math.floor(Number(b.dari)) || aktif[0].n || 5));
        const benar = Math.max(0, Math.min(dari, Math.floor(Number(b.benar))));
        if (!Number.isFinite(benar)) throw salah(`Isi jumlah jawaban benar (0-${dari})`);
        data = { benar, dari, setujuBagiHasil: !!b.setujuBagiHasil };
        lulus = benar === dari && !!b.setujuBagiHasil;
      } else if (l.status === 'interview') {
        pewawancara = teks(b.pewawancara, 80);
        if (!pewawancara) throw salah('Isi nama pewawancara');
        if (b.jadwalkan) {
          jadwal = new Date(b.jadwal);
          if (Number.isNaN(jadwal.getTime())) throw salah('Isi jadwal interview');
          await c.query('INSERT INTO mj_rek_attempt (lamaran_id, tahap, hasil, pewawancara, jadwal, catatan, aktor) VALUES ($1,$2,$3,$4,$5,$6,$7)', [
            l.id, 'interview', 'dijadwalkan', pewawancara, jadwal, catatan, req.admin.nama,
          ]);
          await catatEvent(c, l.id, 'jadwal', { isi: `Interview dijadwalkan ${jadwal.toISOString()} dengan ${pewawancara}` }, req.admin.nama);
          return { nama: l.nama, tahap: l.status, hasil: 'dijadwalkan' };
        }
        if (!['lulus', 'gagal'].includes(b.hasil)) throw salah('Pilih hasil interview: lulus atau gagal');
        if (!teks(b.alasan, 500)) throw salah('Alasan keputusan interview wajib diisi');
        lulus = b.hasil === 'lulus';
        data = { alasan: teks(b.alasan, 500) };
      } else if (l.status === 'field_test_24h') {
        const warung = Math.max(0, Math.floor(Number(b.warung) || 0));
        data = { warung, laporan: !!b.laporan };
        lulus = warung >= 3 && !!b.laporan;
      } else if (l.status === 'closing_test') {
        const customer = Math.max(0, Math.floor(Number(b.customer) || 0));
        const mulai = l.closing_mulai || l.status_sejak;
        const hari = (Date.now() - new Date(mulai).getTime()) / 86400000;
        data = { customer, hariBerjalan: Math.round(hari * 10) / 10 };
        if (customer >= 3) lulus = hari <= HARI_CLOSING_TEST;
        else if (hari > HARI_CLOSING_TEST) lulus = false;
        else throw salah(`Baru ${customer} customer. Closing test masih jalan (${Math.floor(hari)} dari ${HARI_CLOSING_TEST} hari) - catat lagi pas udah 3 atau pas tenggat lewat.`);
      }
      await c.query('INSERT INTO mj_rek_attempt (lamaran_id, tahap, hasil, data, catatan, pewawancara, aktor) VALUES ($1,$2,$3,$4,$5,$6,$7)', [
        l.id, l.status, lulus ? 'lulus' : 'gagal', JSON.stringify(data), catatan, pewawancara, req.admin.nama,
      ]);
      await catatEvent(c, l.id, 'attempt', { dari: l.status, ke: lulus ? 'lulus' : 'gagal', isi: JSON.stringify(data) }, req.admin.nama);
      // Lulus -> maju ke tahap berikutnya. Closing test yang lulus nunggu keputusan hiring (peristiwa, bukan status).
      if (lulus && l.status !== 'closing_test') {
        const ke = TAHAP[TAHAP.indexOf(l.status) + 1];
        await ganti(c, l, ke, 'Lulus ' + l.status, req.admin.nama, ke === 'closing_test' ? ', closing_mulai=now()' : '');
      }
      return { nama: l.nama, tahap: l.status, hasil: lulus ? 'lulus' : 'gagal' };
    });
    await catatLog(req, 'rekrutmen.attempt', hasil);
    res.json({ ok: true, ...hasil });
  } catch (e) {
    next(e);
  }
});

// Keputusan hiring (§8.2): peristiwa manusia dengan pembuat, tanggal, keputusan, alasan. Cuma setelah Closing Test lulus.
router.post('/rekrutmen/lamaran/:id/keputusan', async (req, res, next) => {
  try {
    const keputusan = req.body.keputusan;
    const alasan = teks(req.body.alasan, 500);
    if (!['terima', 'tolak'].includes(keputusan)) throw salah('Pilih terima atau tolak');
    if (!alasan) throw salah('Alasan keputusan wajib diisi');
    const hasil = await transaksi(async (c) => {
      const l = await ambilLamaran(c, req.params.id);
      if (l.status !== 'closing_test') throw salah('Keputusan hiring cuma bisa setelah Closing Test');
      const { rows } = await c.query("SELECT 1 FROM mj_rek_attempt WHERE lamaran_id=$1 AND tahap='closing_test' AND hasil='lulus' LIMIT 1", [l.id]);
      if (!rows.length) throw salah('Closing Test belum lulus');
      await catatEvent(c, l.id, 'keputusan', { ke: keputusan, isi: alasan }, req.admin.nama);
      if (keputusan === 'terima') await ganti(c, l, 'hired', 'Diterima: ' + alasan, req.admin.nama);
      else {
        await c.query('UPDATE mj_lamaran SET alasan_keluar=$2 WHERE id=$1', [l.id, alasan]);
        await ganti(c, l, 'rejected', 'Ditolak setelah Closing Test: ' + alasan, req.admin.nama);
      }
      return { nama: l.nama, keputusan, alasan };
    });
    await catatLog(req, 'rekrutmen.keputusan_hiring', hasil);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/rekrutmen/lamaran/:id/keluar', async (req, res, next) => {
  try {
    const ke = req.body.status;
    const alasan = teks(req.body.alasan, 500);
    if (!KELUAR.includes(ke)) throw salah('Status keluar nggak dikenal');
    if (!alasan) throw salah('Alasan wajib diisi');
    const hasil = await transaksi(async (c) => {
      const l = await ambilLamaran(c, req.params.id);
      if (KELUAR.includes(l.status) || l.status === 'hired') throw salah('Lamaran ini udah selesai');
      await c.query('UPDATE mj_lamaran SET alasan_keluar=$2 WHERE id=$1', [l.id, alasan]);
      await ganti(c, l, ke, alasan, req.admin.nama);
      return { nama: l.nama, dari: l.status, ke, alasan };
    });
    await catatLog(req, 'rekrutmen.lamaran.keluar', hasil);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// D-31: balik dari no_response / on_hold (atau retry setelah ditolak, D-30) = LAMARAN BARU dari NEW; hasil lama nggak berlaku.
router.post('/rekrutmen/lamaran/:id/lamar-ulang', async (req, res, next) => {
  try {
    if (!POLA_UUID.test(req.params.id)) throw salah('Lamaran tidak ditemukan', 404);
    const { rows } = await query('SELECT l.*, o.nama, o.no_hp FROM mj_lamaran l JOIN mj_orang o ON o.id=l.orang_id WHERE l.id=$1', [req.params.id]);
    if (!rows.length) throw salah('Lamaran tidak ditemukan', 404);
    if (!KELUAR.includes(rows[0].status)) throw salah('Cuma lamaran yang udah keluar yang bisa dilamar ulang');
    const r = await buatLamaran({ nama: rows[0].nama, noHp: rows[0].no_hp, s: req.body.s, dropdown: req.body.dropdown }, req.admin.nama);
    await catatLog(req, 'rekrutmen.lamaran.ulang', { nama: rows[0].nama });
    res.status(201).json(r.lamaran);
  } catch (e) {
    next(e);
  }
});

// Follow-up manual di luar sistem (D-74/D-79) - satu tombol dengan timestamp otomatis (§21). "Membalas" ngereset hitungan D-32.
router.post('/rekrutmen/lamaran/:id/followup', async (req, res, next) => {
  try {
    const jenis = req.body.jenis === 'respon' ? 'respon' : 'followup';
    await transaksi(async (c) => {
      const l = await ambilLamaran(c, req.params.id);
      if (KELUAR.includes(l.status) || l.status === 'hired') throw salah('Lamaran ini udah selesai');
      await c.query(`UPDATE mj_lamaran SET ${jenis === 'respon' ? 'terakhir_respon' : 'terakhir_followup'}=now() WHERE id=$1`, [l.id]);
      await catatEvent(c, l.id, jenis, { isi: teks(req.body.catatan, 300) || (jenis === 'respon' ? 'Kandidat membalas' : 'Sudah di-follow-up') }, req.admin.nama);
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/rekrutmen/lamaran/:id/catatan', async (req, res, next) => {
  try {
    const isi = teks(req.body.isi, 1000);
    if (!isi) throw salah('Catatannya diisi dulu');
    await transaksi(async (c) => {
      const l = await ambilLamaran(c, req.params.id);
      await catatEvent(c, l.id, 'catatan', { isi }, req.admin.nama);
    });
    res.status(201).json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Buka CV / foto pelamar (cuma admin yang login). Nama lokasi dari database, bukan dari request - nggak bisa dipakai
// buat baca file lain di server.
router.get('/rekrutmen/dokumen/:id', async (req, res, next) => {
  try {
    if (!POLA_UUID.test(req.params.id)) throw salah('Dokumen tidak ditemukan', 404);
    const { rows } = await query('SELECT * FROM mj_lamaran_dokumen WHERE id=$1', [req.params.id]);
    if (!rows.length) throw salah('Dokumen tidak ditemukan', 404);
    const file = path.join(DOKUMEN_DIR, path.basename(rows[0].lokasi));
    if (!fs.existsSync(file)) throw salah('File-nya udah nggak ada di server', 404);
    res.setHeader('Content-Type', rows[0].mime);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(rows[0].nama_file || 'dokumen')}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    next(e);
  }
});

// ---------------- Kampanye & titik sebar ----------------
router.get('/rekrutmen/kampanye', async (req, res, next) => {
  try {
    const { rows: kampanye } = await query('SELECT *, biaya::float AS biaya FROM mj_rek_kampanye WHERE NOT arsip ORDER BY created_at DESC');
    const { rows: arsip } = await query(
      `SELECT k.id, k.nama, k.area, k.mulai, k.selesai, (k.biaya + COALESCE((SELECT sum(t.biaya) FROM mj_rek_titik t WHERE t.kampanye_id = k.id), 0))::float AS total_biaya,
              (SELECT count(*)::int FROM mj_rek_titik t WHERE t.kampanye_id = k.id) AS jumlah_titik,
              (SELECT count(*)::int FROM mj_lamaran l JOIN mj_rek_titik t ON t.id = l.sumber_titik_id WHERE t.kampanye_id = k.id) AS pelamar
       FROM mj_rek_kampanye k WHERE k.arsip ORDER BY k.created_at DESC`
    );
    // Funnel per titik. "Menemukan" = titik di lamaran PERTAMA orang itu; "Mengonversi" = titik di lamaran yang HIRED (D-71).
    const { rows: titik } = await query(
      `SELECT t.*, t.biaya::float AS biaya,
              count(l.id)::int AS pelamar,
              count(l.id) FILTER (WHERE l.status NOT IN ('new'))::int AS lewat_new,
              count(l.id) FILTER (WHERE l.status IN ('interview','field_test_24h','closing_test','hired'))::int AS sampai_interview,
              count(l.id) FILTER (WHERE l.status IN ('closing_test','hired'))::int AS sampai_closing,
              count(l.id) FILTER (WHERE l.status = 'hired')::int AS diterima,
              count(l.id) FILTER (WHERE l.id = (SELECT l2.id FROM mj_lamaran l2 WHERE l2.orang_id = l.orang_id ORDER BY l2.created_at LIMIT 1))::int AS menemukan
       FROM mj_rek_titik t LEFT JOIN mj_lamaran l ON l.sumber_titik_id = t.id
       GROUP BY t.id ORDER BY t.created_at`
    );
    const { rows: rendah } = await query(
      `SELECT COALESCE(sumber_dropdown, 'Tidak diketahui') AS sumber, keyakinan, count(*)::int AS pelamar, count(*) FILTER (WHERE status='hired')::int AS diterima
       FROM mj_lamaran WHERE keyakinan <> 'tinggi' GROUP BY 1, 2 ORDER BY pelamar DESC`
    );
    const { rows: referral } = await query(
      `SELECT count(*)::int AS pelamar, count(*) FILTER (WHERE status='hired')::int AS diterima FROM mj_lamaran WHERE referrer_orang_id IS NOT NULL`
    );
    const { rows: biaya } = await query(
      `SELECT b.id, b.kampanye_id, b.jumlah::float AS jumlah, b.catatan, b.oleh, b.created_at, t.kode AS titik_kode
       FROM mj_rek_biaya b LEFT JOIN mj_rek_titik t ON t.id = b.titik_id ORDER BY b.created_at DESC LIMIT 300`
    );
    res.json({ kampanye, arsip, titik, biaya, rendah, referral: referral[0], kanal: KANAL, linkDaftar: DAFTAR_URL });
  } catch (e) {
    next(e);
  }
});

router.post('/rekrutmen/kampanye', async (req, res, next) => {
  try {
    const nama = teks(req.body.nama, 100);
    if (!nama) throw salah('Nama kampanye wajib diisi');
    const biaya = Math.max(0, Math.round(Number(req.body.biaya) || 0));
    const tgl = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null);
    const { rows } = await query('INSERT INTO mj_rek_kampanye (nama, area, mulai, selesai, biaya, catatan) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [
      nama, teks(req.body.area, 60) || null, tgl(req.body.mulai), tgl(req.body.selesai), biaya, teks(req.body.catatan, 300) || null,
    ]);
    await catatLog(req, 'rekrutmen.kampanye.tambah', { nama, biaya });
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

// Ubah detail kampanye (nama, area, tanggal, biaya umum, catatan). Field yang nggak dikirim nggak diubah.
router.patch('/rekrutmen/kampanye/:id', async (req, res, next) => {
  try {
    if (!POLA_UUID.test(req.params.id)) throw salah('Kampanye tidak ditemukan', 404);
    const b = req.body || {};
    const tgl = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null);
    const ubah = {};
    if (b.nama !== undefined) {
      ubah.nama = teks(b.nama, 100);
      if (!ubah.nama) throw salah('Nama kampanye wajib diisi');
    }
    if (b.area !== undefined) ubah.area = teks(b.area, 60) || null;
    if (b.mulai !== undefined) ubah.mulai = tgl(b.mulai);
    if (b.selesai !== undefined) ubah.selesai = tgl(b.selesai);
    if (b.catatan !== undefined) ubah.catatan = teks(b.catatan, 300) || null;
    if (b.biaya !== undefined) ubah.biaya = Math.max(0, Math.round(Number(b.biaya) || 0));
    if (b.arsip !== undefined) ubah.arsip = b.arsip === true;
    if (ubah.mulai && ubah.selesai && ubah.selesai < ubah.mulai) throw salah('Tanggal selesai nggak boleh sebelum tanggal mulai');
    const kolom = Object.keys(ubah);
    if (!kolom.length) throw salah('Nggak ada yang diubah');
    const { rows } = await query(`UPDATE mj_rek_kampanye SET ${kolom.map((k, i) => `${k}=$${i + 2}`).join(', ')} WHERE id=$1 RETURNING nama`, [req.params.id, ...kolom.map((k) => ubah[k])]);
    if (!rows.length) throw salah('Kampanye tidak ditemukan', 404);
    await catatLog(req, 'rekrutmen.kampanye.ubah', { nama: rows[0].nama, diubah: kolom.join(', ') });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Hapus kampanye (ikut titik & riwayat biayanya). Cuma boleh kalau belum ada pelamar dari titiknya - kalau udah ada,
// arsipkan aja biar sumber lamaran & laporan biayanya nggak hilang.
router.delete('/rekrutmen/kampanye/:id', async (req, res, next) => {
  try {
    if (!POLA_UUID.test(req.params.id)) throw salah('Kampanye tidak ditemukan', 404);
    const { rows } = await query(
      `SELECT k.nama, (SELECT count(*)::int FROM mj_lamaran l JOIN mj_rek_titik t ON t.id = l.sumber_titik_id WHERE t.kampanye_id = k.id) AS pelamar
       FROM mj_rek_kampanye k WHERE k.id=$1`,
      [req.params.id]
    );
    if (!rows.length) throw salah('Kampanye tidak ditemukan', 404);
    if (rows[0].pelamar) throw salah(`Kampanye ini udah bawa ${rows[0].pelamar} pelamar, jadi nggak bisa dihapus (sumber lamarannya bakal hilang). Arsipkan aja.`, 409);
    await query('DELETE FROM mj_rek_kampanye WHERE id=$1', [req.params.id]);
    await catatLog(req, 'rekrutmen.kampanye.hapus', { nama: rows[0].nama });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Tambah biaya di tengah jalan: ke biaya umum kampanye atau ke satu titik sebar. Tercatat di riwayat biaya.
router.post('/rekrutmen/kampanye/:id/biaya', async (req, res, next) => {
  try {
    if (!POLA_UUID.test(req.params.id)) throw salah('Kampanye tidak ditemukan', 404);
    const jumlah = Math.round(Number(req.body.jumlah) || 0);
    if (jumlah <= 0) throw salah('Jumlah biaya wajib lebih dari 0');
    if (jumlah > 1e10) throw salah('Jumlah biaya kebesaran');
    const titikId = req.body.titik_id ? String(req.body.titik_id) : null;
    if (titikId && !POLA_UUID.test(titikId)) throw salah('Titik sebar nggak ditemukan');
    const catatan = teks(req.body.catatan, 200) || null;
    const hasil = await transaksi(async (c) => {
      const { rows: k } = await c.query('SELECT nama FROM mj_rek_kampanye WHERE id=$1 FOR UPDATE', [req.params.id]);
      if (!k.length) throw salah('Kampanye tidak ditemukan', 404);
      let kode = null;
      if (titikId) {
        const { rows: t } = await c.query('UPDATE mj_rek_titik SET biaya = biaya + $3 WHERE id=$1 AND kampanye_id=$2 RETURNING kode', [titikId, req.params.id, jumlah]);
        if (!t.length) throw salah('Titik sebar nggak ada di kampanye ini');
        kode = t[0].kode;
      } else {
        await c.query('UPDATE mj_rek_kampanye SET biaya = biaya + $2 WHERE id=$1', [req.params.id, jumlah]);
      }
      await c.query('INSERT INTO mj_rek_biaya (kampanye_id, titik_id, jumlah, catatan, oleh) VALUES ($1,$2,$3,$4,$5)', [req.params.id, titikId, jumlah, catatan, req.admin.nama]);
      return { nama: k[0].nama, kode };
    });
    await catatLog(req, 'rekrutmen.kampanye.biaya', { kampanye: hasil.nama, ...(hasil.kode ? { titik: hasil.kode } : {}), jumlah, ...(catatan ? { catatan } : {}) });
    res.status(201).json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Titik sebar baru: kode dibikin otomatis KANAL-AREA-NNN (mis. FB-KRW-001), atau diisi sendiri.
router.post('/rekrutmen/kampanye/:id/titik', async (req, res, next) => {
  try {
    if (!POLA_UUID.test(req.params.id)) throw salah('Kampanye tidak ditemukan', 404);
    const kanal = KANAL[req.body.kanal] ? req.body.kanal : 'LAIN';
    const area = teks(req.body.area, 6).toUpperCase().replace(/[^A-Z]/g, '') || 'UMUM';
    let kode = teks(req.body.kode, 30).toUpperCase().replace(/[^A-Z0-9-]/g, '');
    if (!kode) {
      const { rows } = await query("SELECT count(*)::int AS n FROM mj_rek_titik WHERE kode LIKE $1", [`${kanal}-${area}-%`]);
      kode = `${kanal}-${area}-${String(rows[0].n + 1).padStart(3, '0')}`;
    }
    const { rows } = await query(
      'INSERT INTO mj_rek_titik (kampanye_id, kode, kanal, deskripsi, biaya) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (kode) DO NOTHING RETURNING *',
      [req.params.id, kode, kanal, teks(req.body.deskripsi, 200) || null, Math.max(0, Math.round(Number(req.body.biaya) || 0))]
    );
    if (!rows.length) throw salah(`Kode ${kode} udah dipakai`, 409);
    await catatLog(req, 'rekrutmen.titik.tambah', { kode });
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

// Hapus titik sebar - cuma kalau belum ada pelamar lewat kodenya (kalau udah ada, ganti statusnya jadi Dilewati/Kedaluwarsa).
router.delete('/rekrutmen/titik/:id', async (req, res, next) => {
  try {
    if (!POLA_UUID.test(req.params.id)) throw salah('Titik tidak ditemukan', 404);
    const { rows } = await query('SELECT kode, (SELECT count(*)::int FROM mj_lamaran l WHERE l.sumber_titik_id = t.id) AS pelamar FROM mj_rek_titik t WHERE id=$1', [req.params.id]);
    if (!rows.length) throw salah('Titik tidak ditemukan', 404);
    if (rows[0].pelamar) throw salah(`Titik ${rows[0].kode} udah bawa ${rows[0].pelamar} pelamar, jadi nggak bisa dihapus. Ganti statusnya jadi Dilewati atau Kedaluwarsa aja.`, 409);
    await query('DELETE FROM mj_rek_titik WHERE id=$1', [req.params.id]);
    await catatLog(req, 'rekrutmen.titik.hapus', { kode: rows[0].kode });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Status posting (§7.5). POSTED wajib ada bukti URL - kalau nggak, metrik distribusinya nggak bisa dipercaya.
router.patch('/rekrutmen/titik/:id', async (req, res, next) => {
  try {
    if (!POLA_UUID.test(req.params.id)) throw salah('Titik tidak ditemukan', 404);
    // Ubah detail titik (kanal, tempat, biaya). Kode sengaja nggak bisa diganti: link ?s= yang udah disebar tetap jalan.
    if (req.body.status === undefined) {
      const b = req.body || {};
      const ubah = {};
      if (b.kanal !== undefined) {
        if (!KANAL[b.kanal]) throw salah('Kanal nggak dikenal');
        ubah.kanal = b.kanal;
      }
      if (b.deskripsi !== undefined) ubah.deskripsi = teks(b.deskripsi, 200) || null;
      if (b.biaya !== undefined) ubah.biaya = Math.max(0, Math.round(Number(b.biaya) || 0));
      const kolom = Object.keys(ubah);
      if (!kolom.length) throw salah('Nggak ada yang diubah');
      const { rows } = await query(`UPDATE mj_rek_titik SET ${kolom.map((k, i) => `${k}=$${i + 2}`).join(', ')} WHERE id=$1 RETURNING kode`, [req.params.id, ...kolom.map((k) => ubah[k])]);
      if (!rows.length) throw salah('Titik tidak ditemukan', 404);
      await catatLog(req, 'rekrutmen.titik.ubah', { kode: rows[0].kode, diubah: kolom.join(', ') });
      return res.json({ ok: true });
    }
    const status = ['queued', 'ready', 'posted', 'failed', 'skipped', 'expired'].includes(req.body.status) ? req.body.status : null;
    if (!status) throw salah('Status nggak dikenal');
    const bukti = teks(req.body.bukti_url, 500);
    if (status === 'posted' && !/^https?:\/\/\S+$/.test(bukti)) throw salah('Status POSTED wajib ada bukti URL postingan');
    const { rows } = await query(
      `UPDATE mj_rek_titik SET status=$2, bukti_url=COALESCE($3, bukti_url), diposting_at = CASE WHEN $2='posted' THEN now() ELSE diposting_at END WHERE id=$1 RETURNING kode`,
      [req.params.id, status, bukti || null]
    );
    if (!rows.length) throw salah('Titik tidak ditemukan', 404);
    await catatLog(req, 'rekrutmen.titik.status', { kode: rows[0].kode, status });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
