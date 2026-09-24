import crypto from 'crypto';
import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { catatLog, query } from './db.js';
import { JOIN_LAMARAN, KELUAR, KOLOM_LAMARAN, PROSPEK_LAIN, ambilLamaran, catatEvent, ganti, ipPelamar, pastikanTabelRekrutmen, tandaiNoResponse, transaksi } from './rekrutmen.routes.js';
import { pastikanTabelSales, query as queryWp } from './produk/warung-pintar/db.js';
import { pastikanTabelKaryawan } from './karyawan.routes.js';
import { salinFotoLamaran } from './utils/fotoLamaran.js';

// Alur rekrutmen revisi Sep 2026 (board 5 kolom): cek syarat wajib + skor pendukung otomatis, paket materi + kuis online,
// akun APK kebaca dari nomor WA di Asisten Warung, kandidat pilih slot interview sendiri dari ketersediaan recruiter,
// trial lapangan dihitung dari kode sales sementara (warung daftar & bayar pakai kodenya).
// Batas waktu (3 hari belajar, 2 hari pilih slot, H+1, H+6) cuma DITANDAI buat diputusin recruiter - nggak otomatis
// ngeluarin kandidat (keputusan pemilik). "No response" 3 hari setelah follow-up (D-32) tetap jalan kayak sebelumnya.
const router = Router();
export const publikAlurRouter = Router();
const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const teks = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const salah = (pesan, status = 400) => Object.assign(new Error(pesan), { status });
const JAM = 3600000;
const PUBLIK_URL = () => (process.env.PUBLIK_URL || 'https://konsulin.com').replace(/\/+$/, '');
const URL_WARUNG = () => (process.env.WARUNG_PINTAR_URL || 'https://asistenwarung.konsulin.com').replace(/\/+$/, '');
// Kuis product pakai SEMUA soal pilihan ganda yang aktif (urut sesuai urutan di Pengaturan), lulus kalau benar
// semua. Minimal harus ada MIN_SOAL aktif sebelum kandidat bisa dikirimin kuis. Dulu dikunci 5 soal teratas.
const MIN_SOAL = 5;
// Soal esai: dijawab kandidat di halaman kuis yang sama setelah pilihan ganda. Nggak ikut nentuin lulus (lulus tetap
// dari pilihan ganda, dinilai otomatis) - jawabannya dibaca rekruter di panel kandidat & jadi bahan interview.
const MAKS_ESAI_AKTIF = 3;
const MIN_JAWABAN_ESAI = 15;
const BATAS = { masuk: 24, belajar: 72, pilihSlot: 48, h1: 24, h6: 144 }; // jam

// Kolom board -> status yang masuk ke situ.
export const KOLOM = [
  { id: 'masuk', nama: 'Masuk', ket: 'Dicek otomatis, kamu konfirmasi', status: ['new', 'screening'] },
  { id: 'belajar', nama: 'Belajar & tes', ket: 'Pakai APK + kuis, maks 3 hari', status: ['screening_passed', 'pelajari_produk', 'product_test'] },
  { id: 'interview', nama: 'Interview', ket: 'Kandidat pilih slot sendiri', status: ['interview'] },
  { id: 'trial', nama: 'Trial lapangan', ket: 'H+1: 3 warung · H+6: 3 closing', status: ['field_test_24h', 'closing_test'] },
  { id: 'hired', nama: 'Hired', ket: 'Jadi Sales Partner', status: ['hired'] },
];
const kolomDari = (status) => KOLOM.findIndex((k) => k.status.includes(status));
const SELESAI = ['hired', ...KELUAR];

let siap = null;
function pastikan() {
  if (!siap) {
    siap = (async () => {
      await pastikanTabelRekrutmen();
      await query(`ALTER TABLE mj_lamaran ADD COLUMN IF NOT EXISTS materi_dikirim_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS apk_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS jadwal_link_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS trial_mulai TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS wp_sales_id UUID, ADD COLUMN IF NOT EXISTS trial_kode TEXT`);
      // Lembar interview per kandidat (pertanyaan + nilai 1-5), disimpan bareng biar semua admin lihat & bisa ubah.
      await query('ALTER TABLE mj_lamaran ADD COLUMN IF NOT EXISTS lembar_interview JSONB');
      await query(`CREATE TABLE IF NOT EXISTS mj_rek_token (
        token TEXT PRIMARY KEY, lamaran_id UUID NOT NULL REFERENCES mj_lamaran(id) ON DELETE CASCADE,
        jenis TEXT NOT NULL, aktif BOOLEAN NOT NULL DEFAULT true, dipakai_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now()
      )`);
      await query(`CREATE TABLE IF NOT EXISTS mj_rek_materi (
        id BIGSERIAL PRIMARY KEY, nama TEXT NOT NULL, url TEXT, keterangan TEXT,
        aktif BOOLEAN NOT NULL DEFAULT true, urutan INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now()
      )`);
      await query(`CREATE TABLE IF NOT EXISTS mj_rek_soal (
        id BIGSERIAL PRIMARY KEY, pertanyaan TEXT NOT NULL, pilihan JSONB NOT NULL, jawaban INT NOT NULL,
        aktif BOOLEAN NOT NULL DEFAULT true, urutan INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now()
      )`);
      await query(`CREATE TABLE IF NOT EXISTS mj_rek_esai (
        id BIGSERIAL PRIMARY KEY, pertanyaan TEXT NOT NULL, petunjuk TEXT, maks INT NOT NULL DEFAULT 800,
        aktif BOOLEAN NOT NULL DEFAULT true, urutan INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now()
      )`);
      await query(`CREATE TABLE IF NOT EXISTS mj_rek_slot (
        id BIGSERIAL PRIMARY KEY, pewawancara_id UUID, pewawancara TEXT NOT NULL,
        mulai TIMESTAMPTZ NOT NULL, durasi INT NOT NULL DEFAULT 30, lokasi TEXT,
        lamaran_id UUID REFERENCES mj_lamaran(id) ON DELETE SET NULL, dipesan_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT now(), UNIQUE (pewawancara_id, mulai)
      )`);
      // Template pesan WA yang bisa diedit admin (Rekrutmen -> Pengaturan). Kosong = pakai bawaan di TEMPLATE.
      await query(`CREATE TABLE IF NOT EXISTS mj_rek_template (
        kunci TEXT PRIMARY KEY, isi TEXT NOT NULL, diubah_oleh TEXT, diubah_at TIMESTAMPTZ DEFAULT now()
      )`);
      // Isi awal: link APK, dan 5 soal dari fakta yang ada di sistem (harga paket, trial, bagi hasil). Admin bisa ubah.
      const { rows: m } = await query('SELECT count(*)::int AS n FROM mj_rek_materi');
      if (!m[0].n) {
        await query('INSERT INTO mj_rek_materi (nama, url, keterangan, urutan) VALUES ($1,$2,$3,1)', ['Aplikasi Asisten Warung', URL_WARUNG(), 'daftar pakai nomor WA yang kamu pakai buat melamar']);
      }
      const { rows: s } = await query('SELECT count(*)::int AS n FROM mj_rek_soal');
      if (!s[0].n) {
        const SOAL = [
          ['Berapa harga paket bulanan Asisten Warung?', ['Rp50.000', 'Rp78.000', 'Rp100.000', 'Rp150.000'], 1],
          ['Warung baru bisa nyoba Asisten Warung gratis berapa hari?', ['3 hari', '7 hari', '14 hari', '30 hari'], 1],
          ['Bagi hasil sales dari pembayaran PERTAMA sebuah toko berapa persen?', ['10%', '20%', '30%', '50%'], 2],
          ['Bagi hasil sales dicairkan tiap tanggal berapa?', ['Tanggal 1', 'Tanggal 5', 'Tanggal 15', 'Tanggal 25'], 1],
          [
            'Supaya toko yang daftar kecatat punya kamu, pemilik warung harus...',
            ['Daftar lewat link/QR kamu atau ngetik kode sales kamu', 'Transfer ke rekening kamu', 'Kirim foto KTP ke admin', 'Nggak perlu apa-apa'],
            0,
          ],
        ];
        let i = 0;
        for (const [p, pil, j] of SOAL) await query('INSERT INTO mj_rek_soal (pertanyaan, pilihan, jawaban, urutan) VALUES ($1,$2,$3,$4)', [p, JSON.stringify(pil), j, ++i]);
      }
    })().catch((e) => {
      siap = null;
      throw e;
    });
  }
  return siap;
}
router.use('/rekrutmen', async (req, res, next) => {
  try {
    await pastikan();
    next();
  } catch (e) {
    next(e);
  }
});

// ---------------- Analisis lamaran (syarat wajib + skor pendukung) ----------------
const GENERIK = ['sangat cocok', 'cocok untuk saya', 'cocok buat saya', 'ingin mencoba', 'mau mencoba', 'butuh pekerjaan', 'mau kerja', 'tertarik saja', 'cari kerja'];
function hariTersedia(s) {
  const t = (s || '').toLowerCase();
  if (/setiap hari|tiap hari|senin\s*-\s*minggu|7 hari/.test(t)) return 7;
  if (/senin\s*-\s*sabtu/.test(t)) return 6;
  if (/senin\s*-\s*jum/.test(t) || /weekday/.test(t)) return 5;
  if (/sabtu\s*-\s*minggu|weekend|akhir pekan/.test(t) || (/sabtu/.test(t) && /minggu/.test(t) && !/senin/.test(t))) return 2;
  return null;
}
function jamTersedia(s) {
  const m = (s || '').match(/(\d{1,2})[.:]?\d{0,2}\s*[-–]\s*(\d{1,2})/);
  return m ? Math.max(0, Number(m[2]) - Number(m[1])) : null;
}
export function analisis(l) {
  const j = l.jawaban || null;
  const flags = [];
  if (!j) {
    flags.push('Data form kosong (kandidat ditambah manual). Tanya syarat wajibnya langsung.');
    return { lengkap: false, wajib: [], gagal: [], lolos: true, items: [], skor: null, tier: 'Belum dinilai', flags, alasanTolak: null };
  }
  const skemaLain = /skema lain/i.test(j.skemaKerja || '');
  const wajib = [
    { k: 'Motor', v: j.kendaraan || 'Belum diisi', lolos: j.kendaraan === 'Motor sendiri', alasan: 'Tidak punya motor' },
    { k: 'HP Android', v: j.hpAndroid === true ? 'Punya' : j.hpAndroid === false ? 'Nggak punya' : 'Belum diisi', lolos: j.hpAndroid === true, alasan: 'HP bukan Android' },
    {
      k: 'Skema kerja',
      v: skemaLain ? 'Skema lain' : /gaji pokok/i.test(j.skemaKerja || '') ? 'Minta gaji pokok' : j.skemaKerja ? 'Full komisi' : 'Belum diisi',
      lolos: !!j.skemaKerja && !/gaji pokok/i.test(j.skemaKerja),
      alasan: 'Tidak cocok skema kerja',
      catatan: skemaLain ? 'Bahas detail skemanya di interview' : '',
    },
  ];
  const gagal = wajib.filter((w) => !w.lolos);
  const pe = { 'Belum pernah': 0, 'Kurang dari 1 tahun': 12, '1-3 tahun': 20, 'Lebih dari 3 tahun': 25 }[j.pengalamanSales] ?? 0;
  const wr = { 'Belum kenal': 0, '1-5 warung': 12, '6-20 warung': 20, 'Lebih dari 20 warung': 25 }[j.kenalWarung] ?? 0;
  const tempat = (j.tempatProspek || []).length;
  const tp = tempat >= 2 ? 15 : tempat === 1 ? 8 : 0;
  const d = hariTersedia(j.ketersediaan) ?? (j.waktuKerja === 'Full time' ? 6 : 3);
  const h = jamTersedia(j.ketersediaan) ?? (j.waktuKerja === 'Full time' ? 8 : 4);
  const jp = (d >= 5 ? 10 : d >= 3 ? 6 : 3) + (h >= 6 ? 5 : 2);
  const bidang = j.bidangPengalaman || '';
  const bd = !bidang || /^belum/i.test(bidang) ? 0 : /sales|retail|fmcg|distributor|kanvas|toko|marketing|pemasaran/i.test(bidang) ? 10 : 5;
  const pk = { 'Belum bekerja': 5, Freelance: 4, 'Ibu rumah tangga': 4, 'Pelajar / mahasiswa': 3 }[j.pekerjaan] ?? 2;
  const alasan = (j.alasan || '').trim();
  const generik = alasan.length < 45 || GENERIK.some((g) => alasan.toLowerCase().includes(g));
  const items = [
    { k: 'Pengalaman jualan', v: j.pengalamanSales || '-', p: pe, max: 25, gali: pe < 25 ? 'Pernah nawarin sesuatu ke orang? Ceritain satu contoh.' : null },
    { k: 'Warung yang dikenal', v: j.kenalWarung || '-', p: wr, max: 25, gali: wr < 12 ? 'Kamu belum kenal warung. Gimana caranya dapat 3 warung di hari pertama trial?' : null },
    { k: 'Tempat cari pelanggan', v: `${tempat} pilihan`, p: tp, max: 15, gali: tp < 10 ? 'Selain yang kamu tulis, di mana lagi kamu bisa ketemu pemilik warung?' : null },
    { k: 'Hari & jam tersedia', v: j.ketersediaan || '-', p: jp, max: 15, gali: jp < 10 ? 'Waktumu terbatas. Realistisnya berapa warung per minggu yang bisa kamu datangi?' : null },
    { k: 'Bidang pengalaman', v: bidang || '-', p: bd, max: 10, gali: null },
    { k: 'Pekerjaan sekarang', v: j.pekerjaan || '-', p: pk, max: 5, gali: null },
    { k: 'Alasan tertarik', v: generik ? 'Generik' : 'Spesifik', p: generik ? 1 : 5, max: 5, gali: generik ? 'Kenapa kerjaan ini? Apa yang mau kamu dapat dalam 3 bulan?' : null },
  ];
  const skor = items.reduce((a, b) => a + b.p, 0);
  if (l.keyakinan === 'rendah') flags.push(`Sumber "${l.sumber_dropdown || 'dropdown'}" dengan keyakinan rendah. Tanya dari mana dia tahu lowongan ini.`);
  if (generik) flags.push(`Alasan tertarik generik ("${alasan.slice(0, 80)}"). Gali motivasinya di interview.`);
  if (d <= 2) flags.push('Cuma tersedia akhir pekan. Target 3 closing dalam 6 hari bakal berat.');
  if (/\b(tes|test|coba|testing)\b/i.test(l.nama || '')) flags.push('Kelihatannya data tes, bukan kandidat asli.');
  if ((j.tempatProspek || []).includes(PROSPEK_LAIN) && j.tempatProspekLain) flags.push(`Punya ide tempat sendiri: "${j.tempatProspekLain.slice(0, 80)}"`);
  return { lengkap: true, wajib, gagal, lolos: gagal.length === 0, items, skor, tier: skor >= 70 ? 'Kuat' : skor >= 40 ? 'Sedang' : 'Lemah', flags, alasanTolak: gagal[0]?.alasan || null };
}

// ---------------- Status siapa yang harus gerak + batas waktu ----------------
function keadaan(l, x) {
  const k = kolomDari(l.status);
  const sejak = (t) => (Date.now() - new Date(t).getTime()) / JAM;
  const batas = (mulai, jam) => new Date(new Date(mulai).getTime() + jam * JAM).toISOString();
  if (k === 0) {
    const b = batas(l.created_at, BATAS.masuk);
    return { siapa: 'kamu', label: 'Perlu kamu', batas: b, lewat: new Date(b) < new Date(), info: 'Konfirmasi hasil screening' };
  }
  if (k === 1) {
    if (l.status === 'screening_passed' || !l.materi_dikirim_at) return { siapa: 'kamu', label: 'Perlu kamu', info: 'Kirim paket materi' };
    const b = batas(l.materi_dikirim_at, BATAS.belajar);
    const lewat = new Date(b) < new Date();
    if (x.kuis && !x.kuis.lulus) return { siapa: 'kamu', label: 'Perlu kamu', batas: b, lewat, info: `Kuis ${x.kuis.benar}/${x.kuis.dari}, putuskan` };
    if (x.kuis?.lulus && l.apk_at) return { siapa: 'kamu', label: 'Perlu kamu', info: 'APK & kuis beres' };
    return lewat
      ? { siapa: 'kamu', label: 'Lewat batas', batas: b, lewat, info: 'Lewat 3 hari di Belajar & tes' }
      : { siapa: 'kandidat', label: 'Nunggu kandidat', batas: b, lewat, info: x.kuis?.lulus ? 'Nunggu daftar APK' : l.apk_at ? 'Nunggu kuis' : 'APK & kuis belum' };
  }
  if (k === 2) {
    if (x.jadwal) {
      if (new Date(x.jadwal.mulai) > new Date()) return { siapa: 'jadwal', label: 'Terjadwal', info: x.jadwal.mulai };
      return { siapa: 'kamu', label: 'Perlu kamu', info: 'Isi hasil interview' };
    }
    if (!l.jadwal_link_at) return { siapa: 'kamu', label: 'Perlu kamu', info: 'Kirim link pilih jadwal' };
    const b = batas(l.jadwal_link_at, BATAS.pilihSlot);
    const lewat = new Date(b) < new Date();
    return lewat ? { siapa: 'kamu', label: 'Lewat batas', batas: b, lewat, info: 'Lewat 2 hari, belum pilih slot' } : { siapa: 'kandidat', label: 'Nunggu kandidat', batas: b, lewat, info: 'Belum pilih slot' };
  }
  if (k === 3) {
    const mulai = l.trial_mulai || l.status_sejak;
    const t = x.trial || { warung: 0, warungH1: 0, closing: 0 };
    if (t.closing >= 3) return { siapa: 'kamu', label: 'Perlu kamu', info: 'Siap direkrut' };
    if (l.status === 'field_test_24h') {
      const b = batas(mulai, BATAS.h1);
      const lewat = sejak(mulai) > BATAS.h1;
      return lewat ? { siapa: 'kamu', label: 'Lewat batas', batas: b, lewat, info: `H+1 lewat: warung ${t.warungH1}/3` } : { siapa: 'kandidat', label: 'Nunggu kandidat', batas: b, lewat, info: `H+1 · warung ${t.warungH1}/3` };
    }
    const b = batas(mulai, BATAS.h6);
    const lewat = sejak(mulai) > BATAS.h6;
    return lewat ? { siapa: 'kamu', label: 'Lewat batas', batas: b, lewat, info: `H+6 lewat: closing ${t.closing}/3` } : { siapa: 'kandidat', label: 'Nunggu kandidat', batas: b, lewat, info: `H+6 · closing ${t.closing}/3` };
  }
  return { siapa: 'selesai', label: 'Hired' };
}

// ---------------- Data pendukung: kuis, jadwal, trial, APK ----------------
async function kuisTerakhir(ids) {
  if (!ids.length) return {};
  const { rows } = await query(
    `SELECT DISTINCT ON (lamaran_id) lamaran_id, hasil, data, created_at FROM mj_rek_attempt WHERE tahap='product_test' AND lamaran_id = ANY($1::uuid[]) ORDER BY lamaran_id, id DESC`,
    [ids]
  );
  return Object.fromEntries(rows.map((r) => [r.lamaran_id, { lulus: r.hasil === 'lulus', benar: r.data?.benar ?? 0, dari: r.data?.dari ?? null, at: r.created_at }]));
}
async function jadwalTerpilih(ids) {
  if (!ids.length) return {};
  const { rows } = await query('SELECT lamaran_id, id, mulai, durasi, lokasi, pewawancara FROM mj_rek_slot WHERE lamaran_id = ANY($1::uuid[])', [ids]);
  return Object.fromEntries(rows.map((r) => [r.lamaran_id, r]));
}
// Warung yang daftar pakai kode trial kandidat: berapa yang daftar dalam 24 jam pertama, dan berapa yang bayar dalam 6 hari.
async function hitungTrial(daftar) {
  const pakai = daftar.filter((l) => l.wp_sales_id);
  if (!pakai.length) return {};
  await pastikanTabelSales();
  const { rows } = await queryWp(
    `SELECT w.sales_id, w.created_at,
            (SELECT min(p.updated_at) FROM pembayaran p WHERE p.warung_id = w.id AND p.status = 'settlement') AS bayar_pertama
     FROM warung w WHERE w.sales_id = ANY($1::uuid[]) AND NOT COALESCE(w.demo, false)`,
    [pakai.map((l) => l.wp_sales_id)]
  );
  const hasil = {};
  for (const l of pakai) {
    const mulai = new Date(l.trial_mulai || l.status_sejak).getTime();
    const milik = rows.filter((r) => r.sales_id === l.wp_sales_id && new Date(r.created_at).getTime() >= mulai);
    hasil[l.id] = {
      kode: l.trial_kode,
      warung: milik.length,
      warungH1: milik.filter((r) => new Date(r.created_at).getTime() <= mulai + BATAS.h1 * JAM).length,
      closing: milik.filter((r) => r.bayar_pertama && new Date(r.bayar_pertama).getTime() >= mulai && new Date(r.bayar_pertama).getTime() <= mulai + BATAS.h6 * JAM).length,
    };
  }
  return hasil;
}

// Jalan tiap board dibuka (paling sering sekali per 20 detik): APK kebaca, auto-maju ke Interview, trial maju ke closing.
let terakhirSinkron = 0;
async function sinkronAlur() {
  if (Date.now() - terakhirSinkron < 20000) return;
  terakhirSinkron = Date.now();
  // 1) Akun APK: nomor WA kandidat muncul di data warung Asisten Warung.
  const { rows: belajar } = await query(
    `SELECT l.id, o.no_hp FROM mj_lamaran l JOIN mj_orang o ON o.id=l.orang_id WHERE l.status IN ('pelajari_produk','product_test') AND l.apk_at IS NULL AND o.no_hp IS NOT NULL`
  );
  if (belajar.length) {
    await pastikanTabelSales();
    const { rows: ada } = await queryWp('SELECT no_hp, min(created_at) AS at FROM warung WHERE no_hp = ANY($1) GROUP BY no_hp', [belajar.map((b) => b.no_hp)]);
    for (const a of ada) {
      const l = belajar.find((b) => b.no_hp === a.no_hp);
      await query('UPDATE mj_lamaran SET apk_at=$2 WHERE id=$1 AND apk_at IS NULL', [l.id, a.at]);
      await query("INSERT INTO mj_lamaran_event (lamaran_id, jenis, isi, aktor) VALUES ($1,'apk','Akun Asisten Warung terdeteksi (nomor WA-nya udah daftar)','sistem')", [l.id]);
    }
  }
  // 2) APK ✓ + kuis benar semua -> Interview.
  const { rows: siapIv } = await query(
    `SELECT l.id, l.status FROM mj_lamaran l WHERE l.status IN ('pelajari_produk','product_test') AND l.apk_at IS NOT NULL
       AND EXISTS (SELECT 1 FROM mj_rek_attempt a WHERE a.lamaran_id=l.id AND a.tahap='product_test' AND a.hasil='lulus')`
  );
  for (const r of siapIv) await majuKeInterview(r.id, 'sistem', 'Otomatis maju ke Interview (APK ✓, kuis benar semua)');
  // 3) Trial: 3 warung dalam 24 jam -> Closing test (catat attempt lulus). 3 closing -> attempt closing lulus.
  const { rows: trial } = await query(`SELECT id, status, status_sejak, trial_mulai, wp_sales_id, trial_kode FROM mj_lamaran WHERE status IN ('field_test_24h','closing_test') AND wp_sales_id IS NOT NULL`);
  const hitung = await hitungTrial(trial);
  for (const l of trial) {
    const t = hitung[l.id];
    if (!t) continue;
    if (l.status === 'field_test_24h' && t.warungH1 >= 3) {
      await transaksi(async (c) => {
        const lx = await ambilLamaran(c, l.id);
        if (lx.status !== 'field_test_24h') return;
        await c.query("INSERT INTO mj_rek_attempt (lamaran_id, tahap, hasil, data, aktor) VALUES ($1,'field_test_24h','lulus',$2,'sistem')", [l.id, JSON.stringify({ warung: t.warungH1, otomatis: true })]);
        await ganti(c, lx, 'closing_test', `Otomatis: ${t.warungH1} warung daftar pakai kode ${l.trial_kode} dalam 24 jam`, 'sistem', ', closing_mulai=COALESCE(trial_mulai, now())');
      });
    }
    if (t.closing >= 3) {
      const { rows: ada } = await query("SELECT 1 FROM mj_rek_attempt WHERE lamaran_id=$1 AND tahap='closing_test' AND hasil='lulus'", [l.id]);
      if (!ada.length && (l.status === 'closing_test' || l.status === 'field_test_24h')) {
        await query("INSERT INTO mj_rek_attempt (lamaran_id, tahap, hasil, data, aktor) VALUES ($1,'closing_test','lulus',$2,'sistem')", [l.id, JSON.stringify({ customer: t.closing, otomatis: true })]);
        await query("INSERT INTO mj_lamaran_event (lamaran_id, jenis, isi, aktor) VALUES ($1,'attempt',$2,'sistem')", [l.id, `Otomatis: ${t.closing} warung bayar pakai kode ${l.trial_kode}. Siap direkrut.`]);
      }
    }
  }
}

async function tokenBaru(c, lamaranId, jenis) {
  await c.query('UPDATE mj_rek_token SET aktif=false WHERE lamaran_id=$1 AND jenis=$2', [lamaranId, jenis]);
  const token = crypto.randomBytes(16).toString('base64url');
  await c.query('INSERT INTO mj_rek_token (token, lamaran_id, jenis) VALUES ($1,$2,$3)', [token, lamaranId, jenis]);
  return token;
}
async function majuKeInterview(id, aktor, isi) {
  return transaksi(async (c) => {
    const l = await ambilLamaran(c, id);
    if (!['pelajari_produk', 'product_test'].includes(l.status)) return null;
    await ganti(c, l, 'interview', isi, aktor);
    return tokenBaru(c, id, 'jadwal');
  });
}

// ---------------- Template WA ----------------
const depan = (n) => {
  const d = (n || '').trim().split(/\s+/)[0] || '';
  return d.charAt(0).toUpperCase() + d.slice(1).toLowerCase();
};
const linkKuis = (t) => `${PUBLIK_URL()}/kuis/${t}`;
const linkJadwal = (t) => `${PUBLIK_URL()}/jadwal/${t}`;
// Template bawaan. {penanda} diganti waktu pesan dibikin; penanda `wajib` harus ada biar pesannya tetap berguna.
export const TEMPLATE = {
  sapa: {
    judul: 'Sapaan pembuka',
    ket: 'Tombol WhatsApp di panel kandidat.',
    wajib: [],
    penanda: ['nama'],
    isi: 'Halo {nama}, ini dari tim rekrutmen Sales Partner Konsulin.',
  },
  materi: {
    judul: 'Paket materi + kuis',
    ket: 'Dikirim waktu kandidat lolos screening.',
    wajib: ['link_kuis'],
    penanda: ['nama', 'materi', 'link_kuis'],
    isi: 'Halo {nama}, makasih udah daftar jadi Sales Partner Konsulin.\n\nKamu lolos tahap screening. Sebelum interview, pelajari produknya dulu ya:\n{materi}\n• Kuis product: {link_kuis}\n\nWaktunya 3 hari. Kalau udah daftar di aplikasinya dan kuisnya benar semua, kamu dapet link buat pilih jadwal interview sendiri.',
  },
  kuis_ulang: {
    judul: 'Kirim ulang kuis',
    ket: 'Kesempatan kedua buat kandidat yang kuisnya belum benar semua, atau link kuis yang ketinggalan.',
    wajib: ['link_kuis'],
    penanda: ['nama', 'link_kuis'],
    isi: 'Halo {nama}, ini link kuisnya ya: {link_kuis}',
  },
  ingatkan_apk: {
    judul: 'Ingatkan daftar aplikasi',
    ket: 'Buat kandidat yang belum daftar di Asisten Warung.',
    wajib: [],
    penanda: ['nama', 'link_apk'],
    isi: 'Halo {nama}, udah sempet coba aplikasinya? Daftar di sini pakai nomor WA ini ya: {link_apk}. Kabarin kalau ada kendala.',
  },
  jadwal: {
    judul: 'Link pilih jadwal interview',
    ket: 'Dikirim waktu kandidat sampai tahap Interview.',
    wajib: ['link_jadwal'],
    penanda: ['nama', 'link_jadwal'],
    isi: 'Halo {nama}, selamat kamu lanjut ke tahap interview. Pilih jadwal yang cocok di sini ya: {link_jadwal}',
  },
  trial: {
    judul: 'Info trial lapangan',
    ket: 'Dikirim waktu kandidat lulus interview.',
    wajib: ['kode'],
    penanda: ['nama', 'kode', 'link_referral'],
    isi: 'Halo {nama}, selamat kamu lulus interview. Trial lapangan mulai sekarang:\n• Kode sales kamu: {kode}\n• Link daftar buat warung: {link_referral}\n\nTarget: 3 warung daftar dalam 24 jam, lalu 3 warung bayar langganan dalam 6 hari. Semua kehitung otomatis kalau warungnya daftar pakai link atau kode kamu.',
  },
};
// Pertanyaan product di lembar interview. Bisa diganti admin (Rekrutmen -> Pengaturan), disimpan di mj_rek_template
// dengan kunci 'interview_produk' (satu pertanyaan per baris).
export const MAKS_PERTANYAAN_PRODUK = 30;
export const PERTANYAAN_PRODUK = [
  'Jelasin fitur utama aplikasinya dalam 1 menit, anggap aku pemilik warung.',
  'Pemilik warung bilang "saya udah pakai buku catatan". Kamu jawab apa?',
  'Kalau 1 warung langganan bulanan, bagi hasil kamu berapa dan kapan cair?',
];
async function pertanyaanProduk() {
  const t = await templateAktif();
  const isi = t.interview_produk ? t.interview_produk.split('\n').map((x) => x.trim()).filter(Boolean) : [];
  return isi.length ? isi : PERTANYAAN_PRODUK;
}
let cacheTemplate = null;
async function templateAktif() {
  if (!cacheTemplate || Date.now() - cacheTemplate.at > 30000) {
    const { rows } = await query('SELECT kunci, isi FROM mj_rek_template');
    cacheTemplate = { at: Date.now(), isi: Object.fromEntries(rows.map((r) => [r.kunci, r.isi])) };
  }
  return cacheTemplate.isi;
}
export const isiPenanda = (isi, v) => isi.replace(/\{(\w+)\}/g, (m, k) => (v[k] !== undefined && v[k] !== null ? String(v[k]) : m));
async function pesan(kunci, v) {
  const t = await templateAktif();
  return isiPenanda(t[kunci] || TEMPLATE[kunci].isi, v);
}
const barisMateri = (materi) => materi.map((m) => `• ${m.nama}${m.url ? `: ${m.url}` : ''}${m.keterangan ? ` (${m.keterangan})` : ''}`).join('\n');
// {link_kuis} dibiarin jadi {LINK_KUIS} dulu: linknya baru ada setelah token kuis dibikin (lihat loloskan).
const teksMateri = (nama, materi) => pesan('materi', { nama: depan(nama), materi: barisMateri(materi), link_kuis: '{LINK_KUIS}' });
const teksJadwal = (nama, t) => pesan('jadwal', { nama: depan(nama), link_jadwal: linkJadwal(t) });
const teksTrial = (nama, kode) => pesan('trial', { nama: depan(nama), kode, link_referral: `${URL_WARUNG()}/?ref=${kode}` });

// ---------------- Board ----------------
// Foto diri terakhir yang diunggah orangnya (dari lamaran mana pun) - dipakai jadi avatar kandidat.
async function fotoKandidat(ids) {
  if (!ids.length) return {};
  const { rows } = await query(
    `SELECT l.id, (SELECT d.id FROM mj_lamaran_dokumen d JOIN mj_lamaran l2 ON l2.id = d.lamaran_id
                   WHERE l2.orang_id = l.orang_id AND d.jenis = 'foto' ORDER BY d.created_at DESC LIMIT 1) AS foto
     FROM mj_lamaran l WHERE l.id = ANY($1::uuid[])`,
    [ids]
  );
  return Object.fromEntries(rows.filter((r) => r.foto).map((r) => [r.id, r.foto]));
}
router.get('/rekrutmen/board', async (req, res, next) => {
  try {
    await tandaiNoResponse();
    await sinkronAlur();
    const { rows } = await query(
      `SELECT ${KOLOM_LAMARAN} ${JOIN_LAMARAN}
       WHERE l.status NOT IN ('rejected','withdrawn','no_response','on_hold','talent_pool') AND (l.status <> 'hired' OR l.status_sejak > now() - interval '60 days')
       ORDER BY l.created_at DESC LIMIT 800`
    );
    const ids = rows.map((r) => r.id);
    const [kuis, jadwal, trial, foto] = await Promise.all([kuisTerakhir(ids), jadwalTerpilih(ids), hitungTrial(rows.filter((r) => kolomDari(r.status) === 3)), fotoKandidat(ids)]);
    const kandidat = rows.map((l) => {
      const x = { kuis: kuis[l.id] || null, jadwal: jadwal[l.id] || null, trial: trial[l.id] || null };
      const { jawaban, ...ringkas } = l;
      return { ...ringkas, kolom: kolomDari(l.status), analisis: analisis(l), keadaan: keadaan(l, x), ...x, punya_jawaban: !!jawaban, foto_id: foto[l.id] || null };
    });
    const { rows: keluar } = await query(
      `SELECT l.id, 'KD-' || lpad(l.nomor::text, 4, '0') AS kode, o.nama, l.status, l.alasan_keluar, l.status_sejak,
              (SELECT e.dari FROM mj_lamaran_event e WHERE e.lamaran_id=l.id AND e.jenis='status' AND e.ke=l.status ORDER BY e.id DESC LIMIT 1) AS dari
       FROM mj_lamaran l JOIN mj_orang o ON o.id=l.orang_id
       WHERE l.status IN ('rejected','withdrawn','no_response','on_hold','talent_pool') ORDER BY l.status_sejak DESC LIMIT 80`
    );
    // Funnel: berapa lamaran (termasuk yang keluar) yang pernah nyampe tiap kolom.
    const { rows: semua } = await query(
      `SELECT l.status, (SELECT e.dari FROM mj_lamaran_event e WHERE e.lamaran_id=l.id AND e.jenis='status' AND e.ke=l.status ORDER BY e.id DESC LIMIT 1) AS dari FROM mj_lamaran l`
    );
    const capai = semua.map((r) => (KELUAR.includes(r.status) ? kolomDari(r.dari || 'new') : kolomDari(r.status)));
    const funnel = KOLOM.map((k, i) => capai.filter((c) => c >= i).length);
    const { rows: slot } = await query("SELECT count(*)::int AS n FROM mj_rek_slot WHERE lamaran_id IS NULL AND mulai > now() + interval '2 hours'");
    res.json({ kolom: KOLOM.map(({ status, ...k }) => k), kandidat, keluar: keluar.map((k) => ({ ...k, kolom_asal: kolomDari(k.dari || 'new') })), funnel, slotKosong: slot[0].n });
  } catch (e) {
    next(e);
  }
});

// Detail tambahan buat panel kandidat (analisis + status pendukung). Data lamaran lengkap tetap dari /rekrutmen/lamaran/:id.
router.get('/rekrutmen/lamaran/:id/alur', async (req, res, next) => {
  try {
    if (!POLA_UUID.test(req.params.id)) throw salah('Lamaran tidak ditemukan', 404);
    await sinkronAlur();
    const { rows } = await query(`SELECT ${KOLOM_LAMARAN} ${JOIN_LAMARAN} WHERE l.id=$1`, [req.params.id]);
    if (!rows.length) throw salah('Lamaran tidak ditemukan', 404);
    const l = rows[0];
    const [kuis, jadwal, trial] = await Promise.all([kuisTerakhir([l.id]), jadwalTerpilih([l.id]), hitungTrial([l])]);
    const x = { kuis: kuis[l.id] || null, jadwal: jadwal[l.id] || null, trial: trial[l.id] || null };
    const { rows: tok } = await query('SELECT jenis, token FROM mj_rek_token WHERE lamaran_id=$1 AND aktif', [l.id]);
    const t = Object.fromEntries(tok.map((r) => [r.jenis, r.token]));
    // Jawaban esai dari kuis terakhir (pertanyaannya ikut kesimpen, jadi tetap kebaca walau soalnya udah diubah/dihapus).
    const { rows: at } = await query("SELECT data FROM mj_rek_attempt WHERE lamaran_id=$1 AND tahap='product_test' ORDER BY id DESC LIMIT 1", [l.id]);
    res.json({
      esai: Array.isArray(at[0]?.data?.esai) ? at[0].data.esai : [],
      kolom: kolomDari(l.status),
      analisis: analisis(l),
      keadaan: keadaan(l, x),
      ...x,
      lembar: l.lembar_interview || null,
      pertanyaanProduk: await pertanyaanProduk(),
      link: { kuis: t.kuis ? linkKuis(t.kuis) : null, jadwal: t.jadwal ? linkJadwal(t.jadwal) : null, referral: l.trial_kode ? `${URL_WARUNG()}/?ref=${l.trial_kode}` : null },
      wa: {
        sapa: await pesan('sapa', { nama: depan(l.nama) }),
        jadwal: t.jadwal ? await teksJadwal(l.nama, t.jadwal) : null,
        kuisUlang: t.kuis ? await pesan('kuis_ulang', { nama: depan(l.nama), link_kuis: linkKuis(t.kuis) }) : null,
        ingatkanApk: await pesan('ingatkan_apk', { nama: depan(l.nama), link_apk: URL_WARUNG() }),
        trial: l.trial_kode ? await teksTrial(l.nama, l.trial_kode) : null,
      },
    });
  } catch (e) {
    next(e);
  }
});

// Loloskan screening + kirim paket materi: new/screening/screening_passed -> pelajari_produk, token kuis baru.
async function loloskan(id, aktor, { materiId = null, teksWa = null, paksa = false } = {}) {
  const { rows: soal } = await query('SELECT count(*)::int AS n FROM mj_rek_soal WHERE aktif');
  if (soal[0].n < MIN_SOAL) throw salah(`Soal kuis aktif baru ${soal[0].n}. Tambahin minimal ${MIN_SOAL} di Rekrutmen → Pengaturan dulu.`);
  const { rows: materiSemua } = await query('SELECT * FROM mj_rek_materi WHERE aktif ORDER BY urutan, id');
  const materi = materiId ? materiSemua.filter((m) => materiId.includes(Number(m.id))) : materiSemua;
  const { rows: nm } = await query('SELECT o.nama FROM mj_lamaran l JOIN mj_orang o ON o.id=l.orang_id WHERE l.id=$1', [id]);
  const bawaan = nm.length ? await teksMateri(nm[0].nama, materi) : '';
  return transaksi(async (c) => {
    const l = await ambilLamaran(c, id);
    if (!['new', 'screening', 'screening_passed'].includes(l.status)) throw salah('Kandidat ini udah lewat tahap screening');
    const { rows: full } = await c.query('SELECT l.*, o.nama FROM mj_lamaran l JOIN mj_orang o ON o.id=l.orang_id WHERE l.id=$1', [id]);
    const a = analisis(full[0]);
    if (!a.lolos && !paksa) throw salah(`Syarat wajib belum lengkap (${a.gagal.map((g) => g.k).join(', ')}). Pakai "Tetap loloskan" kalau yakin.`);
    let dari = l;
    for (const ke of ['screening', 'screening_passed', 'pelajari_produk']) {
      const iDari = ['new', 'screening', 'screening_passed', 'pelajari_produk'].indexOf(dari.status);
      if (iDari >= ['new', 'screening', 'screening_passed', 'pelajari_produk'].indexOf(ke)) continue;
      const isi =
        ke === 'screening_passed'
          ? a.lolos
            ? `Lolos screening (wajib ✓, pendukung ${a.skor ?? '-'})`
            : `Diloloskan manual (syarat wajib kurang: ${a.gagal.map((g) => g.k).join(', ')})`
          : ke === 'pelajari_produk'
            ? `Paket materi dikirim via WA (${materi.length} materi + kuis)`
            : 'Dicek recruiter';
      await ganti(c, dari, ke, isi, aktor, ke === 'pelajari_produk' ? ', materi_dikirim_at=now()' : '');
      dari = { ...dari, status: ke };
    }
    const token = await tokenBaru(c, id, 'kuis');
    const final = (teksWa && teksWa.includes('{LINK_KUIS}') ? teksWa : bawaan).replaceAll('{LINK_KUIS}', linkKuis(token));
    return { id, nama: l.nama, teks: final };
  });
}
const hpKandidat = async (id) => (await query('SELECT o.no_hp FROM mj_lamaran l JOIN mj_orang o ON o.id=l.orang_id WHERE l.id=$1', [id])).rows[0]?.no_hp;

router.post('/rekrutmen/lamaran/:id/loloskan', async (req, res, next) => {
  try {
    const materiId = Array.isArray(req.body.materi) ? req.body.materi.map(Number).filter(Boolean) : null;
    const r = await loloskan(req.params.id, req.admin.nama, { materiId, teksWa: teks(req.body.teks, 3000) || null, paksa: !!req.body.paksa });
    await catatLog(req, 'rekrutmen.lamaran.maju', { nama: r.nama, ke: 'pelajari_produk' });
    res.json({ ...r, hp: await hpKandidat(r.id) });
  } catch (e) {
    next(e);
  }
});

// Pilih banyak di kolom Masuk: loloskan (balikin antrian WA materi) atau tolak (alasan dari syarat wajib yang gagal).
router.post('/rekrutmen/massal', async (req, res, next) => {
  try {
    const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).filter((x) => POLA_UUID.test(x)).slice(0, 100);
    if (!ids.length) throw salah('Pilih kandidat dulu');
    const antrian = [];
    const gagal = [];
    for (const id of ids) {
      try {
        if (req.body.aksi === 'loloskan') {
          const r = await loloskan(id, req.admin.nama);
          antrian.push({ ...r, hp: await hpKandidat(id) });
        } else if (req.body.aksi === 'tolak') {
          await transaksi(async (c) => {
            const l = await ambilLamaran(c, id);
            if (!['new', 'screening'].includes(l.status)) throw salah('Udah lewat screening');
            const { rows } = await c.query('SELECT l.*, o.nama FROM mj_lamaran l JOIN mj_orang o ON o.id=l.orang_id WHERE l.id=$1', [id]);
            const alasan = analisis(rows[0]).alasanTolak || 'Tidak memenuhi syarat wajib';
            await c.query('UPDATE mj_lamaran SET alasan_keluar=$2 WHERE id=$1', [id, alasan]);
            await ganti(c, l, 'rejected', alasan, req.admin.nama);
          });
          antrian.push({ id });
        } else throw salah('Aksi nggak dikenal');
      } catch (e) {
        gagal.push({ id, error: e.message });
      }
    }
    await catatLog(req, req.body.aksi === 'loloskan' ? 'rekrutmen.lamaran.maju' : 'rekrutmen.lamaran.keluar', { massal: antrian.length });
    res.json({ antrian, gagal });
  } catch (e) {
    next(e);
  }
});

router.post('/rekrutmen/lamaran/:id/kuis-ulang', async (req, res, next) => {
  try {
    const r = await transaksi(async (c) => {
      const l = await ambilLamaran(c, req.params.id);
      if (!['pelajari_produk', 'product_test'].includes(l.status)) throw salah('Kuis cuma buat tahap Belajar & tes');
      const token = await tokenBaru(c, l.id, 'kuis');
      await catatEvent(c, l.id, 'catatan', { isi: 'Link kuis baru dikirim (kesempatan ulang)' }, req.admin.nama);
      return { teks: await pesan('kuis_ulang', { nama: depan(l.nama), link_kuis: linkKuis(token) }), hp: await hpKandidat(l.id) };
    });
    res.json(r);
  } catch (e) {
    next(e);
  }
});

// Lanjut ke Interview walau APK belum kebaca (kuis harus udah lulus).
router.post('/rekrutmen/lamaran/:id/maju-interview', async (req, res, next) => {
  try {
    const { rows } = await query("SELECT 1 FROM mj_rek_attempt WHERE lamaran_id=$1 AND tahap='product_test' AND hasil='lulus'", [req.params.id]);
    if (!rows.length) throw salah('Kuis belum lulus (harus benar semua)');
    const token = await majuKeInterview(req.params.id, req.admin.nama, 'Maju ke Interview (APK belum kebaca, diputusin recruiter)');
    if (!token) throw salah('Kandidat nggak lagi di tahap Belajar & tes');
    await catatLog(req, 'rekrutmen.lamaran.maju', { ke: 'interview' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Link pilih jadwal: dicatat kapan dikirim (mulai hitungan 2 hari).
router.post('/rekrutmen/lamaran/:id/link-jadwal', async (req, res, next) => {
  try {
    const r = await transaksi(async (c) => {
      const l = await ambilLamaran(c, req.params.id);
      if (l.status !== 'interview') throw salah('Kandidat belum di tahap Interview');
      const { rows: t } = await c.query("SELECT token FROM mj_rek_token WHERE lamaran_id=$1 AND jenis='jadwal' AND aktif", [l.id]);
      const token = t[0]?.token || (await tokenBaru(c, l.id, 'jadwal'));
      await c.query('UPDATE mj_lamaran SET jadwal_link_at=now() WHERE id=$1', [l.id]);
      await catatEvent(c, l.id, 'catatan', { isi: 'Link pilih jadwal interview dikirim via WA' }, req.admin.nama);
      return { teks: await teksJadwal(l.nama, token), hp: await hpKandidat(l.id) };
    });
    res.json(r);
  } catch (e) {
    next(e);
  }
});

// Kode sales sementara buat trial: nama depan + 2 angka. Pas hired, kode ini yang jadi kode sales resminya.
async function bikinKodeTrial(nama, hp) {
  await pastikanTabelSales();
  const dasar = (nama || 'SALES').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8) || 'SALES';
  for (let i = 0; i < 8; i++) {
    const kode = (dasar.length < 3 ? dasar + 'SP' : dasar) + String(crypto.randomInt(10, 99));
    const { rows } = await queryWp('INSERT INTO sales (kode, nama, no_hp) VALUES ($1,$2,$3) ON CONFLICT (kode) DO NOTHING RETURNING id, kode', [kode, nama, hp]);
    if (rows.length) return rows[0];
  }
  throw salah('Gagal bikin kode trial, coba lagi');
}

router.post('/rekrutmen/lamaran/:id/interview-hasil', async (req, res, next) => {
  try {
    const hasil = req.body.hasil;
    const alasan = teks(req.body.alasan, 500);
    if (!['lulus', 'gagal'].includes(hasil)) throw salah('Pilih lulus atau tidak lolos');
    if (!alasan) throw salah('Alasan keputusan wajib diisi');
    const nilai = typeof req.body.nilai === 'object' && req.body.nilai ? Object.fromEntries(Object.entries(req.body.nilai).slice(0, 20).map(([k, v]) => [teks(k, 200), Math.max(1, Math.min(5, Math.round(Number(v) || 0)))])) : {};
    const { rows: pre } = await query('SELECT l.status, o.nama, o.no_hp FROM mj_lamaran l JOIN mj_orang o ON o.id=l.orang_id WHERE l.id=$1', [req.params.id]);
    if (!pre.length) throw salah('Lamaran tidak ditemukan', 404);
    if (pre[0].status !== 'interview') throw salah('Kandidat nggak lagi di tahap Interview');
    const sales = hasil === 'lulus' ? await bikinKodeTrial(pre[0].nama, pre[0].no_hp) : null;
    try {
      await transaksi(async (c) => {
        const l = await ambilLamaran(c, req.params.id);
        if (l.status !== 'interview') throw salah('Kandidat nggak lagi di tahap Interview');
        const { rows: s } = await c.query('SELECT pewawancara FROM mj_rek_slot WHERE lamaran_id=$1', [l.id]);
        await c.query('INSERT INTO mj_rek_attempt (lamaran_id, tahap, hasil, data, pewawancara, aktor) VALUES ($1,$2,$3,$4,$5,$6)', [
          l.id,
          'interview',
          hasil,
          JSON.stringify({ alasan, nilai }),
          s[0]?.pewawancara || req.admin.nama,
          req.admin.nama,
        ]);
        await catatEvent(c, l.id, 'attempt', { dari: 'interview', ke: hasil, isi: alasan }, req.admin.nama);
        if (hasil === 'lulus') {
          await c.query('UPDATE mj_lamaran SET trial_mulai=now(), closing_mulai=now(), wp_sales_id=$2, trial_kode=$3 WHERE id=$1', [l.id, sales.id, sales.kode]);
          await ganti(c, l, 'field_test_24h', `Lulus interview, trial dimulai (kode ${sales.kode})`, req.admin.nama);
        } else {
          await c.query('UPDATE mj_lamaran SET alasan_keluar=$2 WHERE id=$1', [l.id, 'Tidak lolos interview: ' + alasan]);
          await ganti(c, l, 'rejected', 'Tidak lolos interview: ' + alasan, req.admin.nama);
        }
      });
    } catch (e) {
      if (sales) await queryWp('DELETE FROM sales WHERE id=$1', [sales.id]).catch(() => {});
      throw e;
    }
    await catatLog(req, 'rekrutmen.attempt', { nama: pre[0].nama, tahap: 'interview', hasil });
    res.json({ ok: true, trial: sales ? { kode: sales.kode, teks: await teksTrial(pre[0].nama, sales.kode), hp: pre[0].no_hp } : null });
  } catch (e) {
    next(e);
  }
});

// Lembar interview: simpan pertanyaan + nilai (draf bersama). Boleh diubah admin mana aja selama kandidat di Interview.
router.put('/rekrutmen/lamaran/:id/lembar-interview', async (req, res, next) => {
  try {
    if (!POLA_UUID.test(req.params.id)) throw salah('Lamaran tidak ditemukan', 404);
    // Muat semua pertanyaan product (maks 30) + gali + tambahan - dulu dipotong 20, sisanya ilang diem-diem.
    const daftar = Array.isArray(req.body.soal) ? req.body.soal.slice(0, 60) : null;
    if (!daftar) throw salah('Lembar interview nggak valid');
    const soal = daftar
      .map((x) => ({
        jenis: ['produk', 'gali', 'tambahan'].includes(x?.jenis) ? x.jenis : 'tambahan',
        q: teks(x?.q, 300),
        nilai: Number.isInteger(x?.nilai) && x.nilai >= 1 && x.nilai <= 5 ? x.nilai : null,
      }))
      .filter((x) => x.q);
    const lembar = { soal, diubah_oleh: req.admin.nama, diubah_at: new Date().toISOString() };
    const { rows } = await query("UPDATE mj_lamaran SET lembar_interview=$2 WHERE id=$1 AND status='interview' RETURNING id", [req.params.id, JSON.stringify(lembar)]);
    if (!rows.length) throw salah('Kandidat nggak lagi di tahap Interview', 409);
    res.json(lembar);
  } catch (e) {
    next(e);
  }
});

// ---- Pertanyaan product bawaan di lembar interview ----
router.get('/rekrutmen/pertanyaan-interview', async (req, res, next) => {
  try {
    const { rows } = await query("SELECT diubah_oleh, diubah_at FROM mj_rek_template WHERE kunci='interview_produk'");
    res.json({ pertanyaan: await pertanyaanProduk(), bawaan: PERTANYAAN_PRODUK, diubah: !!rows.length, diubah_oleh: rows[0]?.diubah_oleh || null, diubah_at: rows[0]?.diubah_at || null });
  } catch (e) {
    next(e);
  }
});
router.put('/rekrutmen/pertanyaan-interview', async (req, res, next) => {
  try {
    const daftar = (Array.isArray(req.body.pertanyaan) ? req.body.pertanyaan : []).map((x) => teks(x, 300)).filter(Boolean).slice(0, MAKS_PERTANYAAN_PRODUK);
    if (!daftar.length) throw salah('Minimal 1 pertanyaan');
    await query(
      "INSERT INTO mj_rek_template (kunci, isi, diubah_oleh, diubah_at) VALUES ('interview_produk',$1,$2,now()) ON CONFLICT (kunci) DO UPDATE SET isi=EXCLUDED.isi, diubah_oleh=EXCLUDED.diubah_oleh, diubah_at=now()",
      [daftar.join('\n'), req.admin.nama]
    );
    cacheTemplate = null;
    await catatLog(req, 'rekrutmen.template.ubah', { template: 'Pertanyaan interview (product)' });
    res.json({ ok: true, pertanyaan: daftar });
  } catch (e) {
    next(e);
  }
});
router.delete('/rekrutmen/pertanyaan-interview', async (req, res, next) => {
  try {
    await query("DELETE FROM mj_rek_template WHERE kunci='interview_produk'");
    cacheTemplate = null;
    await catatLog(req, 'rekrutmen.template.ubah', { template: 'Pertanyaan interview (product)', jadi: 'bawaan' });
    res.json({ ok: true, pertanyaan: PERTANYAAN_PRODUK });
  } catch (e) {
    next(e);
  }
});

// Rekrut: 3 closing tercapai -> Hired + otomatis masuk data karyawan (kemitraan). Akun login dibikin di Tim sales.
router.post('/rekrutmen/lamaran/:id/rekrut', async (req, res, next) => {
  try {
    const alasan = teks(req.body.alasan, 300) || 'Trial lapangan lulus (3 closing)';
    const r = await transaksi(async (c) => {
      const l = await ambilLamaran(c, req.params.id);
      if (!['closing_test', 'field_test_24h'].includes(l.status)) throw salah('Kandidat belum di tahap trial');
      const { rows } = await c.query("SELECT 1 FROM mj_rek_attempt WHERE lamaran_id=$1 AND tahap='closing_test' AND hasil='lulus'", [l.id]);
      if (!rows.length) throw salah('Closing belum 3 warung');
      await catatEvent(c, l.id, 'keputusan', { ke: 'terima', isi: alasan }, req.admin.nama);
      await ganti(c, l, 'hired', 'Diterima: ' + alasan, req.admin.nama);
      const { rows: o } = await c.query('SELECT o.* FROM mj_orang o WHERE o.id=$1', [l.orang_id]);
      return { l, o: o[0] };
    });
    await pastikanTabelKaryawan();
    const { rows: ada } = await query("SELECT id FROM mj_karyawan WHERE orang_id=$1 AND status <> 'keluar'", [r.o.id]);
    if (!ada.length) {
      await query(`INSERT INTO mj_karyawan (nama, no_hp, email, tipe, jabatan, departemen, orang_id) VALUES ($1,$2,$3,'kemitraan','Sales Partner','Sales',$4)`, [r.o.nama, r.o.no_hp, r.o.email, r.o.id]);
    }
    await salinFotoLamaran().catch((e) => console.error('Salin foto lamaran gagal:', e.message));
    await catatLog(req, 'rekrutmen.keputusan_hiring', { nama: r.o.nama, keputusan: 'terima', kode: r.l.trial_kode });
    res.json({ ok: true, kode: r.l.trial_kode });
  } catch (e) {
    next(e);
  }
});

// Kembalikan kandidat yang dikeluarkan ke tahap terakhirnya (buat koreksi salah keluarin).
router.post('/rekrutmen/lamaran/:id/kembalikan', async (req, res, next) => {
  try {
    const r = await transaksi(async (c) => {
      const l = await ambilLamaran(c, req.params.id);
      if (!KELUAR.includes(l.status)) throw salah('Kandidat ini nggak lagi dikeluarkan');
      const { rows } = await c.query("SELECT dari FROM mj_lamaran_event WHERE lamaran_id=$1 AND jenis='status' AND ke=$2 ORDER BY id DESC LIMIT 1", [l.id, l.status]);
      const ke = rows[0]?.dari && !KELUAR.includes(rows[0].dari) ? rows[0].dari : 'new';
      try {
        await c.query('SAVEPOINT balik');
        await ganti(c, l, ke, 'Dikembalikan ke proses', req.admin.nama, ', alasan_keluar=NULL');
      } catch (e) {
        if (e.code === '23505') throw salah('Orang ini udah punya lamaran lain yang lagi jalan', 409);
        throw e;
      }
      return { nama: l.nama, ke };
    });
    await catatLog(req, 'rekrutmen.lamaran.ulang', { nama: r.nama, dikembalikan_ke: r.ke });
    res.json({ ok: true, ke: r.ke });
  } catch (e) {
    next(e);
  }
});

// ---------------- Pengaturan: materi, soal kuis, ketersediaan interview ----------------
router.get('/rekrutmen/materi', async (req, res, next) => {
  try {
    const [{ rows: materi }, { rows: soal }, { rows: esai }] = await Promise.all([
      query('SELECT * FROM mj_rek_materi ORDER BY urutan, id'),
      query('SELECT * FROM mj_rek_soal ORDER BY urutan, id'),
      query('SELECT * FROM mj_rek_esai ORDER BY urutan, id'),
    ]);
    const t = await templateAktif();
    res.json({ materi, soal, esai, maksEsai: MAKS_ESAI_AKTIF, minSoal: MIN_SOAL, templateMateri: t.materi || TEMPLATE.materi.isi, contohTeks: (await teksMateri('Budi', materi.filter((m) => m.aktif))).replace('{LINK_KUIS}', `${PUBLIK_URL()}/kuis/contoh`) });
  } catch (e) {
    next(e);
  }
});
function bersihkanMateri(b) {
  const nama = teks(b.nama, 120);
  if (!nama) throw salah('Nama materi wajib diisi');
  const url = teks(b.url, 500) || null;
  if (url && !/^https?:\/\//i.test(url)) throw salah('Link harus diawali http:// atau https://');
  return { nama, url, keterangan: teks(b.keterangan, 200) || null, aktif: b.aktif !== false, urutan: Math.round(Number(b.urutan) || 0) };
}
router.post('/rekrutmen/materi', async (req, res, next) => {
  try {
    const m = bersihkanMateri(req.body || {});
    const { rows } = await query('INSERT INTO mj_rek_materi (nama, url, keterangan, aktif, urutan) VALUES ($1,$2,$3,$4,$5) RETURNING *', [m.nama, m.url, m.keterangan, m.aktif, m.urutan]);
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});
router.patch('/rekrutmen/materi/:id', async (req, res, next) => {
  try {
    const m = bersihkanMateri(req.body || {});
    const { rows } = await query('UPDATE mj_rek_materi SET nama=$2, url=$3, keterangan=$4, aktif=$5, urutan=$6 WHERE id=$1 RETURNING *', [Number(req.params.id) || 0, m.nama, m.url, m.keterangan, m.aktif, m.urutan]);
    if (!rows.length) throw salah('Materi nggak ditemukan', 404);
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});
router.delete('/rekrutmen/materi/:id', async (req, res, next) => {
  try {
    await query('DELETE FROM mj_rek_materi WHERE id=$1', [Number(req.params.id) || 0]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
function bersihkanSoal(b) {
  const pertanyaan = teks(b.pertanyaan, 300);
  if (!pertanyaan) throw salah('Pertanyaan wajib diisi');
  const pilihan = (Array.isArray(b.pilihan) ? b.pilihan : []).map((p) => teks(p, 160)).filter(Boolean);
  if (pilihan.length < 2 || pilihan.length > 5) throw salah('Pilihan jawaban 2 sampai 5');
  const jawaban = Math.round(Number(b.jawaban));
  if (!(jawaban >= 0 && jawaban < pilihan.length)) throw salah('Pilih jawaban yang benar');
  return { pertanyaan, pilihan, jawaban, aktif: b.aktif !== false, urutan: Math.round(Number(b.urutan) || 0) };
}
router.post('/rekrutmen/soal', async (req, res, next) => {
  try {
    const s = bersihkanSoal(req.body || {});
    const { rows } = await query('INSERT INTO mj_rek_soal (pertanyaan, pilihan, jawaban, aktif, urutan) VALUES ($1,$2,$3,$4,$5) RETURNING *', [s.pertanyaan, JSON.stringify(s.pilihan), s.jawaban, s.aktif, s.urutan]);
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});
router.patch('/rekrutmen/soal/:id', async (req, res, next) => {
  try {
    const s = bersihkanSoal(req.body || {});
    const { rows } = await query('UPDATE mj_rek_soal SET pertanyaan=$2, pilihan=$3, jawaban=$4, aktif=$5, urutan=$6 WHERE id=$1 RETURNING *', [Number(req.params.id) || 0, s.pertanyaan, JSON.stringify(s.pilihan), s.jawaban, s.aktif, s.urutan]);
    if (!rows.length) throw salah('Soal nggak ditemukan', 404);
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});
router.delete('/rekrutmen/soal/:id', async (req, res, next) => {
  try {
    await query('DELETE FROM mj_rek_soal WHERE id=$1', [Number(req.params.id) || 0]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---- Soal esai ----
async function bersihkanEsai(b, id = 0) {
  const pertanyaan = teks(b.pertanyaan, 400);
  if (!pertanyaan) throw salah('Pertanyaan wajib diisi');
  const maks = Math.min(3000, Math.max(100, Math.round(Number(b.maks) || 800)));
  const aktif = b.aktif !== false;
  if (aktif) {
    const { rows } = await query('SELECT count(*)::int AS n FROM mj_rek_esai WHERE aktif AND id <> $1', [id]);
    if (rows[0].n >= MAKS_ESAI_AKTIF) throw salah(`Maksimal ${MAKS_ESAI_AKTIF} soal esai aktif (biar kuisnya nggak kepanjangan). Nonaktifkan yang lain dulu.`);
  }
  return { pertanyaan, petunjuk: teks(b.petunjuk, 200) || null, maks, aktif, urutan: Math.round(Number(b.urutan) || 0) };
}
router.post('/rekrutmen/esai', async (req, res, next) => {
  try {
    const s = await bersihkanEsai(req.body || {});
    const { rows } = await query('INSERT INTO mj_rek_esai (pertanyaan, petunjuk, maks, aktif, urutan) VALUES ($1,$2,$3,$4,$5) RETURNING *', [s.pertanyaan, s.petunjuk, s.maks, s.aktif, s.urutan]);
    await catatLog(req, 'rekrutmen.esai.tambah', { pertanyaan: s.pertanyaan.slice(0, 80) });
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});
router.patch('/rekrutmen/esai/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id) || 0;
    const s = await bersihkanEsai(req.body || {}, id);
    const { rows } = await query('UPDATE mj_rek_esai SET pertanyaan=$2, petunjuk=$3, maks=$4, aktif=$5, urutan=$6 WHERE id=$1 RETURNING *', [id, s.pertanyaan, s.petunjuk, s.maks, s.aktif, s.urutan]);
    if (!rows.length) throw salah('Soal esai nggak ditemukan', 404);
    await catatLog(req, 'rekrutmen.esai.ubah', { pertanyaan: s.pertanyaan.slice(0, 80) });
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});
router.delete('/rekrutmen/esai/:id', async (req, res, next) => {
  try {
    // Jawaban kandidat yang udah masuk tetap aman: pertanyaannya ikut kesimpen di data attempt.
    await query('DELETE FROM mj_rek_esai WHERE id=$1', [Number(req.params.id) || 0]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---- Template pesan WA ----
router.get('/rekrutmen/template', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT kunci, isi, diubah_oleh, diubah_at FROM mj_rek_template');
    const ada = Object.fromEntries(rows.map((r) => [r.kunci, r]));
    const contoh = { nama: 'Budi', materi: '• Aplikasi Asisten Warung: ' + URL_WARUNG(), link_kuis: `${PUBLIK_URL()}/kuis/contoh`, link_jadwal: `${PUBLIK_URL()}/jadwal/contoh`, link_apk: URL_WARUNG(), kode: 'BUDI27', link_referral: `${URL_WARUNG()}/?ref=BUDI27` };
    res.json({
      contoh,
      template: Object.entries(TEMPLATE).map(([kunci, t]) => ({
        kunci,
        judul: t.judul,
        ket: t.ket,
        penanda: t.penanda,
        wajib: t.wajib,
        bawaan: t.isi,
        isi: ada[kunci]?.isi || t.isi,
        diubah: !!ada[kunci],
        diubah_oleh: ada[kunci]?.diubah_oleh || null,
        diubah_at: ada[kunci]?.diubah_at || null,
      })),
    });
  } catch (e) {
    next(e);
  }
});
router.put('/rekrutmen/template/:kunci', async (req, res, next) => {
  try {
    const t = TEMPLATE[req.params.kunci];
    if (!t) throw salah('Template nggak dikenal', 404);
    const isi = typeof req.body.isi === 'string' ? req.body.isi.replace(/\r/g, '').trim().slice(0, 3000) : '';
    if (!isi) throw salah('Isi pesan wajib diisi');
    const kurang = t.wajib.filter((k) => !isi.includes(`{${k}}`));
    if (kurang.length) throw salah(`Pesan ini wajib ada ${kurang.map((k) => `{${k}}`).join(', ')}, biar kandidat dapet linknya`);
    const asing = [...isi.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((k) => !t.penanda.includes(k));
    if (asing.length) throw salah(`Penanda ${[...new Set(asing)].map((k) => `{${k}}`).join(', ')} nggak dikenal di template ini`);
    await query(
      'INSERT INTO mj_rek_template (kunci, isi, diubah_oleh, diubah_at) VALUES ($1,$2,$3,now()) ON CONFLICT (kunci) DO UPDATE SET isi=EXCLUDED.isi, diubah_oleh=EXCLUDED.diubah_oleh, diubah_at=now()',
      [req.params.kunci, isi, req.admin.nama]
    );
    cacheTemplate = null;
    await catatLog(req, 'rekrutmen.template.ubah', { template: t.judul });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
router.delete('/rekrutmen/template/:kunci', async (req, res, next) => {
  try {
    const t = TEMPLATE[req.params.kunci];
    if (!t) throw salah('Template nggak dikenal', 404);
    await query('DELETE FROM mj_rek_template WHERE kunci=$1', [req.params.kunci]);
    cacheTemplate = null;
    await catatLog(req, 'rekrutmen.template.ubah', { template: t.judul, jadi: 'bawaan' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get('/rekrutmen/slot', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT s.*, o.nama AS kandidat_nama, l.id AS lamaran_id FROM mj_rek_slot s LEFT JOIN mj_lamaran l ON l.id = s.lamaran_id LEFT JOIN mj_orang o ON o.id = l.orang_id
       WHERE s.mulai > now() - interval '1 day' ORDER BY s.mulai LIMIT 300`
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});
// Recruiter ngisi kapan dia bersedia: satu tanggal, jam mulai-selesai, dipecah jadi slot per durasi.
router.post('/rekrutmen/slot', async (req, res, next) => {
  try {
    const { tanggal, mulai, selesai } = req.body || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal || '') || !/^\d{2}:\d{2}$/.test(mulai || '') || !/^\d{2}:\d{2}$/.test(selesai || '')) throw salah('Isi tanggal, jam mulai, dan jam selesai');
    const durasi = [15, 20, 30, 45, 60].includes(Number(req.body.durasi)) ? Number(req.body.durasi) : 30;
    const lokasi = teks(req.body.lokasi, 200) || null;
    const awal = new Date(`${tanggal}T${mulai}:00+07:00`).getTime();
    const akhir = new Date(`${tanggal}T${selesai}:00+07:00`).getTime();
    if (!(akhir > awal)) throw salah('Jam selesai harus setelah jam mulai');
    let n = 0;
    for (let t = awal; t + durasi * 60000 <= akhir && n < 40; t += durasi * 60000) {
      if (t < Date.now() + JAM) continue;
      const { rowCount } = await query('INSERT INTO mj_rek_slot (pewawancara_id, pewawancara, mulai, durasi, lokasi) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING', [req.admin.id, req.admin.nama, new Date(t), durasi, lokasi]);
      n += rowCount;
    }
    if (!n) throw salah('Nggak ada slot baru (jamnya udah lewat atau udah pernah dibikin)');
    await catatLog(req, 'rekrutmen.slot.tambah', { tanggal, jam: `${mulai}-${selesai}`, slot: n });
    res.status(201).json({ dibuat: n });
  } catch (e) {
    next(e);
  }
});
router.delete('/rekrutmen/slot/:id', async (req, res, next) => {
  try {
    const { rows } = await query('DELETE FROM mj_rek_slot WHERE id=$1 AND lamaran_id IS NULL RETURNING id', [Number(req.params.id) || 0]);
    if (!rows.length) throw salah('Slot udah dipilih kandidat, nggak bisa dihapus');
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---------------- Publik: kuis & pilih jadwal (dibuka lewat konsulin.com) ----------------
const publikLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(ipPelamar(req)),
  message: { error: 'Terlalu banyak percobaan. Coba lagi nanti.' },
});
publikAlurRouter.use(['/kuis', '/jadwal'], publikLimiter, async (req, res, next) => {
  try {
    await pastikan();
    next();
  } catch (e) {
    next(e);
  }
});
async function bacaToken(token, jenis) {
  if (!/^[\w-]{10,40}$/.test(token || '')) throw salah('Link nggak valid', 404);
  const { rows } = await query(
    `SELECT t.*, l.status, o.nama FROM mj_rek_token t JOIN mj_lamaran l ON l.id=t.lamaran_id JOIN mj_orang o ON o.id=l.orang_id WHERE t.token=$1 AND t.jenis=$2`,
    [token, jenis]
  );
  if (!rows.length) throw salah('Link nggak ditemukan', 404);
  if (!rows[0].aktif) throw salah('Link ini udah nggak berlaku. Minta link terbaru ke tim rekrutmen.', 410);
  return rows[0];
}
const soalKuis = () => query('SELECT id, pertanyaan, pilihan, jawaban FROM mj_rek_soal WHERE aktif ORDER BY urutan, id').then((r) => r.rows);
const esaiKuis = () => query('SELECT id, pertanyaan, petunjuk, maks FROM mj_rek_esai WHERE aktif ORDER BY urutan, id LIMIT $1', [MAKS_ESAI_AKTIF]).then((r) => r.rows);

publikAlurRouter.get('/kuis/:token', async (req, res, next) => {
  try {
    const t = await bacaToken(req.params.token, 'kuis');
    if (t.dipakai_at) {
      const { rows } = await query("SELECT data, hasil FROM mj_rek_attempt WHERE lamaran_id=$1 AND tahap='product_test' ORDER BY id DESC LIMIT 1", [t.lamaran_id]);
      return res.json({ nama: depan(t.nama), selesai: true, benar: rows[0]?.data?.benar ?? 0, dari: rows[0]?.data?.dari ?? 0, lulus: rows[0]?.hasil === 'lulus' });
    }
    if (!['pelajari_produk', 'product_test'].includes(t.status)) throw salah('Kuis ini udah nggak dibuka buat kamu', 410);
    const [soal, esai] = await Promise.all([soalKuis(), esaiKuis()]);
    res.json({ nama: depan(t.nama), selesai: false, soal: soal.map(({ jawaban, ...s }) => s), esai, minEsai: MIN_JAWABAN_ESAI });
  } catch (e) {
    next(e);
  }
});
publikAlurRouter.post('/kuis/:token', async (req, res, next) => {
  try {
    const t = await bacaToken(req.params.token, 'kuis');
    if (t.dipakai_at) throw salah('Kuis ini udah dikerjain', 409);
    if (!['pelajari_produk', 'product_test'].includes(t.status)) throw salah('Kuis ini udah nggak dibuka buat kamu', 410);
    if (req.body?.setuju !== true) throw salah('Centang persetujuan skema bagi hasil dulu');
    const [soal, esai] = await Promise.all([soalKuis(), esaiKuis()]);
    const jawab = req.body?.jawaban || {};
    if (soal.some((s) => jawab[s.id] === undefined)) throw salah('Jawab semua soal dulu');
    const tulisan = req.body?.esai && typeof req.body.esai === 'object' ? req.body.esai : {};
    const jawabanEsai = esai.map((e) => ({ id: e.id, pertanyaan: e.pertanyaan, jawaban: (typeof tulisan[e.id] === 'string' ? tulisan[e.id] : '').replace(/\r/g, '').trim().slice(0, e.maks) }));
    const kurang = jawabanEsai.filter((e) => e.jawaban.length < MIN_JAWABAN_ESAI);
    if (kurang.length) throw salah(`Jawab soal esai dulu (minimal ${MIN_JAWABAN_ESAI} huruf): "${kurang[0].pertanyaan.slice(0, 60)}"`);
    const benar = soal.filter((s) => Number(jawab[s.id]) === s.jawaban).length;
    const lulus = benar === soal.length;
    const r = await transaksi(async (c) => {
      const { rowCount } = await c.query('UPDATE mj_rek_token SET dipakai_at=now() WHERE token=$1 AND dipakai_at IS NULL', [t.token]);
      if (!rowCount) throw salah('Kuis ini udah dikerjain', 409);
      const data = { benar, dari: soal.length, setujuBagiHasil: true, jawaban: Object.fromEntries(soal.map((s) => [s.id, Number(jawab[s.id])])), esai: jawabanEsai };
      await c.query("INSERT INTO mj_rek_attempt (lamaran_id, tahap, hasil, data, aktor) VALUES ($1,'product_test',$2,$3,'kandidat (kuis online)')", [t.lamaran_id, lulus ? 'lulus' : 'gagal', JSON.stringify(data)]);
      await catatEvent(c, t.lamaran_id, 'attempt', { dari: 'product_test', ke: lulus ? 'lulus' : 'gagal', isi: `Kuis online ${benar}/${soal.length}` }, 'kandidat');
      return { benar, dari: soal.length, lulus };
    });
    terakhirSinkron = 0; // biar auto-maju langsung kecek pas board dibuka
    res.json(r);
  } catch (e) {
    next(e);
  }
});

publikAlurRouter.get('/jadwal/:token', async (req, res, next) => {
  try {
    const t = await bacaToken(req.params.token, 'jadwal');
    const { rows: pilih } = await query('SELECT id, mulai, durasi, lokasi, pewawancara FROM mj_rek_slot WHERE lamaran_id=$1', [t.lamaran_id]);
    if (t.status !== 'interview') return res.json({ nama: depan(t.nama), tutup: true, terpilih: pilih[0] ? { ...pilih[0], pewawancara: depan(pilih[0].pewawancara) } : null, slot: [] });
    const { rows } = await query(
      `SELECT id, mulai, durasi, lokasi, pewawancara FROM mj_rek_slot WHERE lamaran_id IS NULL AND mulai > now() + interval '2 hours' AND mulai < now() + interval '21 days' ORDER BY mulai LIMIT 120`
    );
    res.json({ nama: depan(t.nama), tutup: false, terpilih: pilih[0] ? { ...pilih[0], pewawancara: depan(pilih[0].pewawancara) } : null, slot: rows.map((s) => ({ ...s, pewawancara: depan(s.pewawancara) })) });
  } catch (e) {
    next(e);
  }
});
publikAlurRouter.post('/jadwal/:token', async (req, res, next) => {
  try {
    const t = await bacaToken(req.params.token, 'jadwal');
    if (t.status !== 'interview') throw salah('Pemilihan jadwal udah ditutup', 410);
    const slotId = Number(req.body?.slot) || 0;
    const { rows: punya } = await query('SELECT mulai, durasi, lokasi, pewawancara FROM mj_rek_slot WHERE id=$1 AND lamaran_id=$2', [slotId, t.lamaran_id]);
    if (punya.length) return res.json({ ...punya[0], pewawancara: depan(punya[0].pewawancara) }); // milih ulang slot yang sama
    const r = await transaksi(async (c) => {
      const { rows } = await c.query("UPDATE mj_rek_slot SET lamaran_id=$2, dipesan_at=now() WHERE id=$1 AND lamaran_id IS NULL AND mulai > now() + interval '2 hours' RETURNING *", [slotId, t.lamaran_id]);
      if (!rows.length) throw salah('Slot ini udah diambil orang lain atau udah lewat. Pilih yang lain ya.', 409);
      // Ganti jadwal: slot lama dilepas biar bisa dipilih orang lain.
      await c.query('UPDATE mj_rek_slot SET lamaran_id=NULL, dipesan_at=NULL WHERE lamaran_id=$1 AND id<>$2', [t.lamaran_id, slotId]);
      const s = rows[0];
      await c.query("INSERT INTO mj_rek_attempt (lamaran_id, tahap, hasil, pewawancara, jadwal, catatan, aktor) VALUES ($1,'interview','dijadwalkan',$2,$3,$4,'kandidat')", [t.lamaran_id, s.pewawancara, s.mulai, s.lokasi]);
      await catatEvent(c, t.lamaran_id, 'jadwal', { isi: `Kandidat milih jadwal interview ${new Date(s.mulai).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' })} dengan ${s.pewawancara}` }, 'kandidat');
      return { mulai: s.mulai, durasi: s.durasi, lokasi: s.lokasi, pewawancara: depan(s.pewawancara) };
    });
    res.json(r);
  } catch (e) {
    next(e);
  }
});

export default router;
