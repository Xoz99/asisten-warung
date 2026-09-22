import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { catatLog, query, pool } from './db.js';
import { query as queryWp, pastikanTabelSales } from './produk/warung-pintar/db.js';
import { pastikanTabelOps } from './ops.routes.js';
import { normalisasiNoHp } from './utils/noHp.js';
import { FAKTA_BUKU_BENAR, FAKTA_LAMA_SALAH, KAMUS, PENANDA_KAMUS } from './kamusKeberatan.js';

// Sales Lapangan: bank keberatan pelanggan (kategori, ucapan, fakta produk buat ngejawab) + log kunjungan sales
// (respon sales, respon pelanggan, hasil, insight, foto bukti WEBP, titik GPS otomatis dari HP).
// Akun peran "sales" cuma lihat & ngisi log miliknya sendiri; admin lihat semua dan ngurus bank keberatan.
const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(process.env.LAPANGAN_DIR || path.join(__dirname, '../data/lapangan'));
const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const teks = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const salah = (pesan, status = 400) => Object.assign(new Error(pesan), { status });
const hariIni = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10); // WIB
const MAKS_FOTO = 3;
const MAKS_FOTO_BYTE = 3 * 1024 * 1024;
// Sales boleh ngubah / hapus log sendiri sampai 24 jam setelah dibuat. Lewat itu cuma admin.
const JAM_UBAH_SALES = 24;

export const HASIL = ['berhasil', 'tertarik', 'pikir', 'ditolak'];

// Isi awal bank keberatan ada di kamusKeberatan.js.

let siap = null;
function pastikanTabel() {
  if (!siap) {
    siap = (async () => {
      await query(`CREATE TABLE IF NOT EXISTS mj_keberatan (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nomor BIGSERIAL,
        kategori TEXT NOT NULL, ucapan TEXT NOT NULL, fakta TEXT NOT NULL,
        aktif BOOLEAN NOT NULL DEFAULT true,
        dibuat_oleh UUID,
        created_at TIMESTAMPTZ DEFAULT now(), diubah_at TIMESTAMPTZ DEFAULT now()
      )`);
      await query(`CREATE TABLE IF NOT EXISTS mj_lapangan_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nomor BIGSERIAL,
        sales_id UUID NOT NULL,
        keberatan_id UUID REFERENCES mj_keberatan(id) ON DELETE SET NULL,
        kategori TEXT NOT NULL, -- disalin dari bank biar riwayat nggak berubah kalau bank diedit
        ucapan TEXT NOT NULL, -- kata-kata pelanggan yang beneran diucapin
        respon_sales TEXT NOT NULL,
        respon_customer TEXT,
        hasil TEXT NOT NULL,
        catatan TEXT,
        id_kunjungan TEXT, -- no kunjungan / id pelanggan / nama warung
        tanggal DATE NOT NULL,
        lokasi_url TEXT, -- link Google Maps dari titik GPS (data lama: link Sharelock / Ugorex yang ditempel)
        created_at TIMESTAMPTZ DEFAULT now(), diubah_at TIMESTAMPTZ DEFAULT now()
      )`);
      await query(`CREATE TABLE IF NOT EXISTS mj_lapangan_foto (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        log_id UUID NOT NULL REFERENCES mj_lapangan_log(id) ON DELETE CASCADE,
        lokasi TEXT NOT NULL, mime TEXT NOT NULL, ukuran INT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      )`);
      await query('CREATE INDEX IF NOT EXISTS idx_mj_lapangan_log_tgl ON mj_lapangan_log (tanggal DESC, created_at DESC)');
      // Lokasi diambil otomatis dari GPS HP waktu nyatet (bukan link yang ditempel manual).
      await query(`ALTER TABLE mj_lapangan_log ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION, ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS akurasi_m INT, ADD COLUMN IF NOT EXISTS lokasi_at TIMESTAMPTZ`);
      // Tiap kunjungan nempel ke satu kartu CRM per toko (mj_lead di ops.routes.js).
      await pastikanTabelOps();
      await query('ALTER TABLE mj_lapangan_log ADD COLUMN IF NOT EXISTS lead_id UUID');
      // Titik toko di kartu CRM: diambil dari GPS kunjungan pertama yang punya lokasi.
      await query('ALTER TABLE mj_lead ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION, ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION');
      // Kartu contekan yang lebih lengkap: kelompok, cara lain pelanggan ngomong, contoh jawaban, yang jangan dijanjiin.
      await query(`ALTER TABLE mj_keberatan ADD COLUMN IF NOT EXISTS kelompok TEXT, ADD COLUMN IF NOT EXISTS variasi TEXT,
        ADD COLUMN IF NOT EXISTS contoh_jawaban TEXT, ADD COLUMN IF NOT EXISTS jangan TEXT`);
      await isiKamusSekali();
      fs.mkdirSync(DIR, { recursive: true });
    })().catch((e) => {
      siap = null;
      throw e;
    });
  }
  return siap;
}
// Kamus contekan awal dimasukin SEKALI (penanda di mj_seed). Baris yang udah ada (sama kategori & ucapan) cuma
// dilengkapin kolom yang masih kosong - hasil edit admin nggak ditimpa. Kalau admin nanti ngedit / nonaktifin, nggak
// bakal dimunculin lagi.
async function isiKamusSekali() {
  await query('CREATE TABLE IF NOT EXISTS mj_seed (nama TEXT PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT now())');
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const { rowCount } = await c.query('INSERT INTO mj_seed (nama) VALUES ($1) ON CONFLICT DO NOTHING', [PENANDA_KAMUS]);
    if (!rowCount) {
      await c.query('ROLLBACK');
      return;
    }
    for (const k of KAMUS) {
      const { rows } = await c.query('SELECT id, fakta FROM mj_keberatan WHERE lower(kategori)=lower($1) AND lower(ucapan)=lower($2) LIMIT 1', [k.kategori, k.ucapan]);
      if (rows.length) {
        await c.query(
          `UPDATE mj_keberatan SET kelompok=COALESCE(kelompok,$2), variasi=COALESCE(variasi,$3), contoh_jawaban=COALESCE(contoh_jawaban,$4),
             jangan=COALESCE(jangan,$5), fakta=CASE WHEN fakta=$6 THEN $7 ELSE fakta END, diubah_at=now() WHERE id=$1`,
          [rows[0].id, k.kelompok, k.variasi || null, k.contoh_jawaban || null, k.jangan || null, FAKTA_LAMA_SALAH, FAKTA_BUKU_BENAR]
        );
      } else {
        await c.query(
          `INSERT INTO mj_keberatan (kelompok, kategori, ucapan, variasi, fakta, contoh_jawaban, jangan, aktif) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [k.kelompok, k.kategori, k.ucapan, k.variasi || null, k.fakta, k.contoh_jawaban || null, k.jangan || null, k.aktif]
        );
      }
    }
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

router.use('/lapangan', async (req, res, next) => {
  try {
    await pastikanTabel();
    next();
  } catch (e) {
    next(e);
  }
});

const adminSaja = (req) => {
  if (req.admin.peran === 'sales') throw salah('Cuma admin yang bisa ngubah ini', 403);
};

// ---------------- Bank keberatan ----------------
router.get('/lapangan/keberatan', async (req, res, next) => {
  try {
    const semua = req.query.semua === '1' && req.admin.peran !== 'sales';
    const { rows } = await query(
      `SELECT k.*, count(l.id)::int AS dipakai,
         count(l.id) FILTER (WHERE l.hasil = 'berhasil')::int AS berhasil
       FROM mj_keberatan k LEFT JOIN mj_lapangan_log l ON l.keberatan_id = k.id
       ${semua ? '' : 'WHERE k.aktif'}
       GROUP BY k.id ORDER BY k.aktif DESC, k.kelompok NULLS LAST, k.nomor`
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

function bersihkanBank(b) {
  const x = {
    kategori: teks(b.kategori, 60),
    ucapan: teks(b.ucapan, 500),
    fakta: teks(b.fakta, 1500),
    kelompok: teks(b.kelompok, 40) || null,
    variasi: teks(b.variasi, 1000) || null,
    contoh_jawaban: teks(b.contoh_jawaban, 1500) || null,
    jangan: teks(b.jangan, 600) || null,
  };
  if (!x.kategori) throw salah('Kategori wajib diisi');
  if (!x.ucapan) throw salah('Ucapan pelanggan wajib diisi');
  if (!x.fakta) throw salah('Fakta dari produk wajib diisi');
  return x;
}

router.post('/lapangan/keberatan', async (req, res, next) => {
  try {
    adminSaja(req);
    const x = bersihkanBank(req.body || {});
    const { rows } = await query(
      'INSERT INTO mj_keberatan (kategori, ucapan, fakta, kelompok, variasi, contoh_jawaban, jangan, dibuat_oleh) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
      [x.kategori, x.ucapan, x.fakta, x.kelompok, x.variasi, x.contoh_jawaban, x.jangan, req.admin.id]
    );
    await catatLog(req, 'lapangan.keberatan.tambah', { kategori: x.kategori });
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.patch('/lapangan/keberatan/:id', async (req, res, next) => {
  try {
    adminSaja(req);
    if (!POLA_UUID.test(req.params.id)) throw salah('Keberatan nggak ditemukan', 404);
    let rows;
    if (typeof req.body.aktif === 'boolean' && req.body.kategori === undefined) {
      // Draf dari kamus awal belum boleh dilihat sales sebelum faktanya diisi admin.
      if (req.body.aktif) {
        const { rows: cek } = await query('SELECT fakta FROM mj_keberatan WHERE id=$1', [req.params.id]);
        if (cek[0]?.fakta.startsWith('[PERLU DIISI ADMIN]')) throw salah('Isi dulu fakta & contoh jawabannya (hapus tanda [PERLU DIISI ADMIN]) sebelum diaktifin');
      }
      ({ rows } = await query('UPDATE mj_keberatan SET aktif=$2, diubah_at=now() WHERE id=$1 RETURNING kategori', [req.params.id, req.body.aktif]));
    } else {
      const x = bersihkanBank(req.body || {});
      if (x.fakta.startsWith('[PERLU DIISI ADMIN]')) {
        const { rows: cek } = await query('SELECT aktif FROM mj_keberatan WHERE id=$1', [req.params.id]);
        if (cek[0]?.aktif) throw salah('Fakta masih bertanda [PERLU DIISI ADMIN] - isi dulu sebelum disimpan');
      }
      ({ rows } = await query(
        'UPDATE mj_keberatan SET kategori=$2, ucapan=$3, fakta=$4, kelompok=$5, variasi=$6, contoh_jawaban=$7, jangan=$8, diubah_at=now() WHERE id=$1 RETURNING kategori',
        [req.params.id, x.kategori, x.ucapan, x.fakta, x.kelompok, x.variasi, x.contoh_jawaban, x.jangan]
      ));
    }
    if (!rows.length) throw salah('Keberatan nggak ditemukan', 404);
    await catatLog(req, 'lapangan.keberatan.ubah', { kategori: rows[0].kategori, ...(typeof req.body.aktif === 'boolean' ? { aktif: req.body.aktif } : {}) });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---------------- Toko di CRM ----------------
// Satu kartu CRM (mj_lead) per toko. Kunjungan pertama ke toko baru bikin kartunya; kunjungan berikutnya nempel ke
// kartu yang sama dan mindahin tahapnya sesuai hasil.
const TAHAP_DARI_HASIL = { berhasil: 'trial', tertarik: 'awareness', pikir: 'awareness', ditolak: 'stuck' };
const NAMA_TAHAP = { awareness: 'Awareness', trial: 'Trial 7 hari', konversi: 'Konversi', repeat_order: 'Repeat order', stuck: 'Stuck' };
const LABEL_HASIL = { berhasil: 'Berhasil (daftar / trial)', tertarik: 'Tertarik, follow up', pikir: 'Pikir-pikir', ditolak: 'Ditolak' };

router.get('/lapangan/crm-toko', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, perusahaan AS nama, pic_nama, telepon, tahap FROM mj_lead WHERE pemilik_id=$1 ORDER BY updated_at DESC LIMIT 500`,
      [req.admin.id]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// Dipanggil di dalam transaksi simpan log. Balikin { lead_id, toko }.
async function tautkanKeCrm(c, req, log, b) {
  const toko = teks(b.toko, 100);
  if (!toko) throw salah('Nama toko wajib diisi');
  let lead = null;
  if (POLA_UUID.test(b.lead_id || '')) {
    const { rows } = await c.query('SELECT * FROM mj_lead WHERE id=$1 AND ($2::boolean OR pemilik_id=$3) FOR UPDATE', [b.lead_id, req.admin.peran !== 'sales', req.admin.id]);
    lead = rows[0] || null;
  }
  if (!lead) {
    const { rows } = await c.query('SELECT * FROM mj_lead WHERE lower(perusahaan)=lower($1) AND pemilik_id=$2 ORDER BY updated_at DESC LIMIT 1 FOR UPDATE', [toko, req.admin.id]);
    lead = rows[0] || null;
  }
  const tahapHasil = TAHAP_DARI_HASIL[log.hasil] || 'awareness';
  const pemilik = teks(b.pemilik_nama, 80) || null;
  const hp = b.pemilik_hp ? normalisasiNoHp(b.pemilik_hp) || teks(b.pemilik_hp, 20) : null;
  const catat = async (jenis, isi) => c.query('INSERT INTO mj_lead_aktivitas (lead_id, admin_nama, jenis, isi) VALUES ($1,$2,$3,$4)', [lead.id, req.admin.nama, jenis, isi]);
  if (!lead) {
    const { rows } = await c.query(
      `INSERT INTO mj_lead (perusahaan, pic_nama, telepon, sumber, tahap, pemilik_id, lat, lng) VALUES ($1,$2,$3,'Kunjungan lapangan',$4,$5,$6,$7) RETURNING *`,
      [toko, pemilik, hp, tahapHasil, req.admin.id, log.lat ?? null, log.lng ?? null]
    );
    lead = rows[0];
    await catat('tahap', `Kartu dibuat dari kunjungan lapangan, tahap ${NAMA_TAHAP[tahapHasil]}`);
  } else {
    // Kunjungan nggak nurunin toko yang udah bayar (Konversi / Repeat order), dan "tertarik" nggak ngebalikin Trial ke Awareness.
    const boleh = !['konversi', 'repeat_order'].includes(lead.tahap) && !(lead.tahap === 'trial' && tahapHasil === 'awareness');
    const pindah = boleh && tahapHasil !== lead.tahap;
    await c.query(
      `UPDATE mj_lead SET updated_at=now(), pic_nama=COALESCE(pic_nama,$2), telepon=COALESCE(telepon,$3),
         lat=COALESCE(lat,$4), lng=CASE WHEN lat IS NULL THEN $5 ELSE lng END${pindah ? ', tahap=$6, tahap_sejak=now()' : ''} WHERE id=$1`,
      pindah ? [lead.id, pemilik, hp, log.lat ?? null, log.lng ?? null, tahapHasil] : [lead.id, pemilik, hp, log.lat ?? null, log.lng ?? null]
    );
    if (pindah) await catat('tahap', `Tahap: ${NAMA_TAHAP[lead.tahap] || lead.tahap} → ${NAMA_TAHAP[tahapHasil]} (dari kunjungan #${log.nomor})`);
  }
  await catat('kunjungan', `Kunjungan #${log.nomor} oleh ${req.admin.nama}: ${log.kategori}, ${LABEL_HASIL[log.hasil]}.${log.ucapan ? ` "${log.ucapan}"` : ''}`);
  return { lead_id: lead.id, toko: lead.perusahaan };
}

// ---------------- Log kunjungan ----------------
const KOLOM_LOG = `l.*, l.tanggal::text AS tanggal, ad.nama AS sales_nama, k.fakta AS fakta,
  COALESCE((SELECT json_agg(json_build_object('id', f.id, 'ukuran', f.ukuran) ORDER BY f.created_at) FROM mj_lapangan_foto f WHERE f.log_id = l.id), '[]') AS foto`;
const DARI_LOG = `FROM mj_lapangan_log l LEFT JOIN mj_admin ad ON ad.id = l.sales_id LEFT JOIN mj_keberatan k ON k.id = l.keberatan_id`;

// Syarat filter bareng buat daftar, ekspor, dan insight. Akun sales selalu dikunci ke log miliknya.
function filterLog(req) {
  const syarat = [];
  const nilai = [];
  const tambah = (sql, v) => {
    nilai.push(v);
    syarat.push(sql.replaceAll('?', `$${nilai.length}`));
  };
  if (req.admin.peran === 'sales') tambah('l.sales_id = ?', req.admin.id);
  else if (POLA_UUID.test(req.query.sales || '')) tambah('l.sales_id = ?', req.query.sales);
  if (HASIL.includes(req.query.hasil)) tambah('l.hasil = ?', req.query.hasil);
  const kategori = teks(req.query.kategori, 60);
  if (kategori) tambah('l.kategori = ?', kategori);
  if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.dari || '')) tambah('l.tanggal >= ?::date', req.query.dari);
  if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.sampai || '')) tambah('l.tanggal <= ?::date', req.query.sampai);
  const q = teks(req.query.q, 80);
  if (q) {
    const pola = '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
    tambah('(l.ucapan ILIKE ? OR l.respon_sales ILIKE ? OR l.respon_customer ILIKE ? OR l.catatan ILIKE ? OR l.id_kunjungan ILIKE ?)', pola);
  }
  return { where: syarat.length ? 'WHERE ' + syarat.join(' AND ') : '', nilai };
}

router.get('/lapangan/log', async (req, res, next) => {
  try {
    const { where, nilai } = filterLog(req);
    const { rows } = await query(`SELECT ${KOLOM_LOG} ${DARI_LOG} ${where} ORDER BY l.tanggal DESC, l.created_at DESC LIMIT 300`, nilai);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// Kunjungan yang pemiliknya langsung mau (nggak ada keberatan) dicatat dengan kategori ini.
export const TANPA_KEBERATAN = 'Tanpa keberatan';

function bersihkanLog(b) {
  const tanpa = b.tanpa_keberatan === true;
  const x = {
    kategori: teks(b.kategori, 60),
    ucapan: teks(b.ucapan, 1000),
    respon_sales: teks(b.respon_sales, 2000),
    respon_customer: teks(b.respon_customer, 2000) || null,
    hasil: b.hasil,
    catatan: teks(b.catatan, 2000) || null,
    id_kunjungan: teks(b.id_kunjungan, 80) || null,
    tanggal: /^\d{4}-\d{2}-\d{2}$/.test(b.tanggal || '') ? b.tanggal : null,
  };
  // Titik GPS dari browser. Link peta dibikin di server dari koordinatnya, jadi nggak ada link asing yang disimpen.
  const g = b.gps;
  if (g && typeof g === 'object') {
    const lat = Number(g.lat);
    const lng = Number(g.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw salah('Titik GPS nggak valid');
    x.lat = lat;
    x.lng = lng;
    x.akurasi_m = Number.isFinite(Number(g.akurasi)) ? Math.min(100000, Math.max(0, Math.round(Number(g.akurasi)))) : null;
    const t = new Date(g.waktu);
    x.lokasi_at = Number.isFinite(t.getTime()) && t <= new Date(Date.now() + 60000) ? t.toISOString() : new Date().toISOString();
    x.lokasi_url = `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
  }
  if (tanpa) {
    // Ucapan & respon boleh kosong: nggak ada keberatan yang perlu dijawab.
    x.kategori = TANPA_KEBERATAN;
  } else {
    if (!x.kategori) throw salah('Pilih kategori keberatan');
    if (x.ucapan.length < 3) throw salah('Tulis ucapan pelanggannya');
    if (x.respon_sales.length < 3) throw salah('Tulis respon kamu ke pelanggan');
  }
  if (!HASIL.includes(x.hasil)) throw salah('Pilih hasilnya');
  if (!x.tanggal) throw salah('Tanggal kunjungan wajib diisi');
  if (x.tanggal > hariIni()) throw salah('Tanggal kunjungan nggak boleh di masa depan');
  return x;
}

// Foto bukti dikirim base64 (sudah dikecilin di HP). Jenis file dicek dari isi, bukan dari nama.
export function bacaFoto(d) {
  const m = /^data:([\w/+.-]+);base64,(.+)$/.exec(typeof d?.data === 'string' ? d.data : '');
  if (!m) throw salah('Foto nggak kebaca');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAKS_FOTO_BYTE) throw salah('Foto maksimal 3 MB');
  const jpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const png = buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP';
  if (!jpg && !png && !webp) throw salah('Foto harus JPG, PNG, atau WEBP');
  return { buf, mime: jpg ? 'image/jpeg' : png ? 'image/png' : 'image/webp', ext: jpg ? 'jpg' : png ? 'png' : 'webp' };
}

async function simpanFoto(c, logId, daftar) {
  const ditulis = [];
  try {
    for (const f of daftar) {
      const nama = `${crypto.randomUUID()}.${f.ext}`;
      fs.writeFileSync(path.join(DIR, nama), f.buf);
      ditulis.push(nama);
      await c.query('INSERT INTO mj_lapangan_foto (log_id, lokasi, mime, ukuran) VALUES ($1,$2,$3,$4)', [logId, nama, f.mime, f.buf.length]);
    }
  } catch (e) {
    for (const n of ditulis) fs.rm(path.join(DIR, n), { force: true }, () => {});
    throw e;
  }
  return ditulis;
}

async function keberatanValid(id) {
  if (!id) return null;
  if (!POLA_UUID.test(id)) throw salah('Keberatan nggak ditemukan');
  const { rows } = await query('SELECT id, kategori FROM mj_keberatan WHERE id=$1', [id]);
  if (!rows.length) throw salah('Keberatan nggak ditemukan');
  return rows[0];
}

router.post('/lapangan/log', async (req, res, next) => {
  try {
    const b = req.body || {};
    const k = b.tanpa_keberatan === true ? null : await keberatanValid(b.keberatan_id);
    const x = bersihkanLog({ ...b, kategori: k ? k.kategori : b.kategori });
    // Bukti kunjungan: akun sales wajib nyalain GPS. Admin boleh nyatet tanpa lokasi (mis. input dari kantor).
    if (req.admin.peran === 'sales' && x.lat === undefined) throw salah('Lokasi GPS belum kebaca. Nyalain GPS / izinin lokasi di browser, lalu ambil lokasi lagi.');
    const foto = (Array.isArray(b.foto) ? b.foto : []).map(bacaFoto);
    if (foto.length > MAKS_FOTO) throw salah(`Foto maksimal ${MAKS_FOTO}`);
    const c = await pool.connect();
    let hasil;
    try {
      await c.query('BEGIN');
      const { rows } = await c.query(
        `INSERT INTO mj_lapangan_log (sales_id, keberatan_id, kategori, ucapan, respon_sales, respon_customer, hasil, catatan, id_kunjungan, tanggal,
           lokasi_url, lat, lng, akurasi_m, lokasi_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id, nomor`,
        [req.admin.id, k?.id || null, x.kategori, x.ucapan, x.respon_sales, x.respon_customer, x.hasil, x.catatan, x.id_kunjungan, x.tanggal,
          x.lokasi_url || null, x.lat ?? null, x.lng ?? null, x.akurasi_m ?? null, x.lokasi_at || null]
      );
      const crm = await tautkanKeCrm(c, req, { ...x, nomor: rows[0].nomor }, b);
      await c.query('UPDATE mj_lapangan_log SET lead_id=$2, id_kunjungan=$3 WHERE id=$1', [rows[0].id, crm.lead_id, crm.toko]);
      await simpanFoto(c, rows[0].id, foto);
      await c.query('COMMIT');
      hasil = { ...rows[0], lead_id: crm.lead_id };
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
    await catatLog(req, 'lapangan.log.tambah', { nomor: hasil.nomor, kategori: x.kategori, hasil: x.hasil });
    res.status(201).json(hasil);
  } catch (e) {
    next(e);
  }
});

async function logMilik(req, id) {
  if (!POLA_UUID.test(id)) throw salah('Log nggak ditemukan', 404);
  const { rows } = await query('SELECT * FROM mj_lapangan_log WHERE id=$1', [id]);
  const l = rows[0];
  if (!l || (req.admin.peran === 'sales' && l.sales_id !== req.admin.id)) throw salah('Log nggak ditemukan', 404);
  if (req.admin.peran === 'sales' && Date.now() - new Date(l.created_at).getTime() > JAM_UBAH_SALES * 3600000) {
    throw salah(`Log cuma bisa diubah/dihapus sales sampai ${JAM_UBAH_SALES} jam setelah dicatat. Minta admin kalau perlu dikoreksi.`, 403);
  }
  return l;
}

router.patch('/lapangan/log/:id', async (req, res, next) => {
  try {
    const l = await logMilik(req, req.params.id);
    const b = req.body || {};
    const k = b.tanpa_keberatan === true ? null : await keberatanValid(b.keberatan_id);
    const x = bersihkanLog({ ...b, kategori: k ? k.kategori : b.kategori });
    const fotoBaru = (Array.isArray(b.foto_baru) ? b.foto_baru : []).map(bacaFoto);
    const hapusFoto = (Array.isArray(b.hapus_foto) ? b.hapus_foto : []).filter((i) => POLA_UUID.test(i));
    const { rows: jml } = await query('SELECT count(*)::int AS n FROM mj_lapangan_foto WHERE log_id=$1 AND NOT (id = ANY($2::uuid[]))', [l.id, hapusFoto]);
    if (jml[0].n + fotoBaru.length > MAKS_FOTO) throw salah(`Foto maksimal ${MAKS_FOTO}`);
    const c = await pool.connect();
    let dibuang = [];
    try {
      await c.query('BEGIN');
      await c.query(
        `UPDATE mj_lapangan_log SET keberatan_id=$2, kategori=$3, ucapan=$4, respon_sales=$5, respon_customer=$6, hasil=$7, catatan=$8,
           id_kunjungan=$9, tanggal=$10, diubah_at=now() WHERE id=$1`,
        [l.id, k?.id || null, x.kategori, x.ucapan, x.respon_sales, x.respon_customer, x.hasil, x.catatan, x.id_kunjungan, x.tanggal]
      );
      // Lokasi cuma diganti kalau diambil ulang - ngedit teks nggak ngubah titik kunjungan aslinya.
      if (x.lat !== undefined) {
        await c.query('UPDATE mj_lapangan_log SET lokasi_url=$2, lat=$3, lng=$4, akurasi_m=$5, lokasi_at=$6 WHERE id=$1', [
          l.id,
          x.lokasi_url,
          x.lat,
          x.lng,
          x.akurasi_m,
          x.lokasi_at,
        ]);
      }
      if (hapusFoto.length) {
        ({ rows: dibuang } = await c.query('DELETE FROM mj_lapangan_foto WHERE log_id=$1 AND id = ANY($2::uuid[]) RETURNING lokasi', [l.id, hapusFoto]));
      }
      await simpanFoto(c, l.id, fotoBaru);
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
    for (const f of dibuang) fs.rm(path.join(DIR, path.basename(f.lokasi)), { force: true }, () => {});
    await catatLog(req, 'lapangan.log.ubah', { nomor: l.nomor, hasil: x.hasil });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.delete('/lapangan/log/:id', async (req, res, next) => {
  try {
    const l = await logMilik(req, req.params.id);
    const { rows: foto } = await query('SELECT lokasi FROM mj_lapangan_foto WHERE log_id=$1', [l.id]);
    await query('DELETE FROM mj_lapangan_log WHERE id=$1', [l.id]);
    for (const f of foto) fs.rm(path.join(DIR, path.basename(f.lokasi)), { force: true }, () => {});
    await catatLog(req, 'lapangan.log.hapus', { nomor: l.nomor, kategori: l.kategori });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get('/lapangan/foto/:id', async (req, res, next) => {
  try {
    if (!POLA_UUID.test(req.params.id)) throw salah('Foto nggak ditemukan', 404);
    const { rows } = await query('SELECT f.lokasi, f.mime, l.sales_id FROM mj_lapangan_foto f JOIN mj_lapangan_log l ON l.id = f.log_id WHERE f.id=$1', [req.params.id]);
    const f = rows[0];
    if (!f || (req.admin.peran === 'sales' && f.sales_id !== req.admin.id)) throw salah('Foto nggak ditemukan', 404);
    const file = path.join(DIR, path.basename(f.lokasi));
    if (!fs.existsSync(file)) throw salah('File foto hilang dari server', 404);
    res.setHeader('Content-Type', f.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.sendFile(file);
  } catch (e) {
    next(e);
  }
});

// ---------------- Toko saya (data Warung Pintar) ----------------
// Daftar sales di Warung Pintar, buat admin nyambungin akun sales Makalin ke kode sales-nya.
router.get('/lapangan/wp-sales', async (req, res, next) => {
  try {
    adminSaja(req);
    await pastikanTabelSales();
    const { rows } = await queryWp('SELECT id, kode, nama, aktif FROM sales ORDER BY aktif DESC, nama');
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// Status pelanggan diturunin dari plan & masa aktif (sama kayak halaman Leads, PRD §13).
// Link referral sales = alamat app Warung Pintar + ?ref=KODE (dibaca warung-pintar-react/src/lib/kodeSales.js).
const URL_WARUNG = () => (process.env.WARUNG_PINTAR_URL || 'https://asistenwarung.konsulin.com').replace(/\/+$/, '');

const SQL_TAHAP = `CASE
  WHEN w.plan = 'permanen' THEN 'permanen'
  WHEN w.plan = 'trial' AND w.lisensi_berlaku_sampai > now() THEN 'trial'
  WHEN w.plan = 'trial' THEN 'trial_habis'
  WHEN w.lisensi_berlaku_sampai > now() THEN 'langganan'
  ELSE 'berhenti' END`;

// Link & kode referral akun yang lagi login (ditampilin di atas halaman Sales Lapangan buat akun sales).
router.get('/lapangan/link', async (req, res, next) => {
  try {
    if (!req.admin.wp_sales_id) return res.json({ terhubung: false });
    await pastikanTabelSales();
    const { rows } = await queryWp('SELECT id, kode, nama, aktif FROM sales WHERE id=$1', [req.admin.wp_sales_id]);
    if (!rows.length) return res.json({ terhubung: false });
    res.json({ terhubung: true, sales: rows[0], link: `${URL_WARUNG()}/?ref=${encodeURIComponent(rows[0].kode)}` });
  } catch (e) {
    next(e);
  }
});

// Toko yang dipegang sales sekarang + pembayaran yang masuk waktu toko itu miliknya (pemilik PADA SAAT bayar, §15.1).
// Akun sales cuma bisa lihat punyanya; admin boleh milih akun sales lewat ?akun=.
// NOT VERIFIED (NV-03): waktu bayar = waktu pembayaran dicatat lunas (updated_at), belum dari field Midtrans.
router.get('/lapangan/toko', async (req, res, next) => {
  try {
    let akun = req.admin;
    if (req.admin.peran !== 'sales') {
      if (!POLA_UUID.test(req.query.akun || '')) return res.json({ terhubung: false, pilihAkun: true });
      const { rows } = await query("SELECT id, nama, wp_sales_id FROM mj_admin WHERE id=$1 AND peran='sales'", [req.query.akun]);
      if (!rows.length) throw salah('Akun sales nggak ditemukan', 404);
      akun = rows[0];
    }
    if (!akun.wp_sales_id) return res.json({ terhubung: false });
    await pastikanTabelSales();
    const S = akun.wp_sales_id;
    const [{ rows: sales }, { rows: toko }, { rows: bayar }] = await Promise.all([
      queryWp('SELECT id, kode, nama, aktif FROM sales WHERE id=$1', [S]),
      queryWp(
        `SELECT w.id, w.nama, w.no_hp, w.created_at, w.plan, w.lisensi_berlaku_sampai, ${SQL_TAHAP} AS tahap,
                k.valid_from AS pegang_sejak, w.profil_usaha->>'jenis' AS jenis_usaha,
                (SELECT MAX(t.waktu) FROM transaksi t WHERE t.warung_id = w.id) AS terakhir_aktif,
                (SELECT count(*)::int FROM pembayaran p WHERE p.warung_id = w.id AND p.status = 'settlement') AS jumlah_bayar,
                (SELECT COALESCE(SUM(p.jumlah), 0)::float FROM pembayaran p WHERE p.warung_id = w.id AND p.status = 'settlement') AS total_bayar,
                (SELECT MAX(p.updated_at) FROM pembayaran p WHERE p.warung_id = w.id AND p.status = 'settlement') AS terakhir_bayar
         FROM kepemilikan_warung k JOIN warung w ON w.id = k.warung_id
         WHERE k.sales_id = $1 AND k.valid_to IS NULL AND NOT COALESCE(w.demo, false)
         ORDER BY (${SQL_TAHAP} IN ('langganan', 'permanen')) DESC, w.lisensi_berlaku_sampai ASC NULLS LAST`,
        [S]
      ),
      queryWp(
        `WITH p AS (
           SELECT p.*, row_number() OVER (PARTITION BY p.warung_id ORDER BY p.updated_at, p.created_at) AS urutan
           FROM pembayaran p WHERE p.status = 'settlement'
         )
         SELECT p.order_id, p.plan, p.jumlah::float AS jumlah, p.updated_at AS lunas_pada, p.urutan::int AS urutan, w.nama AS warung_nama
         FROM p JOIN warung w ON w.id = p.warung_id
         JOIN LATERAL (
           SELECT k.sales_id FROM kepemilikan_warung k WHERE k.warung_id = p.warung_id
           ORDER BY (k.valid_from <= p.updated_at) DESC, CASE WHEN k.valid_from <= p.updated_at THEN k.valid_from END DESC, k.valid_from ASC
           LIMIT 1
         ) k ON k.sales_id = $1
         WHERE NOT COALESCE(w.demo, false)
         ORDER BY p.updated_at DESC LIMIT 200`,
        [S]
      ),
    ]);
    const awalBulan = new Date(new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7) + '-01T00:00:00+07:00');
    const ringkas = {};
    for (const t of toko) ringkas[t.tahap] = (ringkas[t.tahap] || 0) + 1;
    res.json({
      terhubung: true,
      akun: { id: akun.id, nama: akun.nama },
      sales: sales[0] || null,
      link: sales[0] ? `${URL_WARUNG()}/?ref=${encodeURIComponent(sales[0].kode)}` : null,
      ringkas,
      toko,
      pembayaran: bayar,
      total: {
        semua: bayar.reduce((a, p) => a + p.jumlah, 0),
        bulanIni: bayar.filter((p) => new Date(p.lunas_pada) >= awalBulan).reduce((a, p) => a + p.jumlah, 0),
        tokoBaruBulanIni: bayar.filter((p) => p.urutan === 1 && new Date(p.lunas_pada) >= awalBulan).length,
      },
    });
  } catch (e) {
    next(e);
  }
});

// ---------------- Insight ----------------
router.get('/lapangan/insight', async (req, res, next) => {
  try {
    const { where, nilai } = filterLog(req);
    const [{ rows: perKategori }, { rows: perSales }, { rows: total }, { rows: catatan }, { rows: sales }] = await Promise.all([
      query(
        `SELECT l.kategori, count(*)::int AS total, ${HASIL.map((h) => `count(*) FILTER (WHERE l.hasil='${h}')::int AS ${h}`).join(', ')}
         ${DARI_LOG} ${where} GROUP BY l.kategori ORDER BY total DESC`,
        nilai
      ),
      query(
        `SELECT l.sales_id, ad.nama, count(*)::int AS total, count(*) FILTER (WHERE l.hasil='berhasil')::int AS berhasil,
           count(DISTINCT l.tanggal)::int AS hari_aktif
         ${DARI_LOG} ${where} GROUP BY l.sales_id, ad.nama ORDER BY total DESC`,
        nilai
      ),
      query(`SELECT count(*)::int AS total, ${HASIL.map((h) => `count(*) FILTER (WHERE l.hasil='${h}')::int AS ${h}`).join(', ')} ${DARI_LOG} ${where}`, nilai),
      query(
        `SELECT l.id, l.nomor, l.kategori, l.hasil, l.catatan, l.tanggal::text AS tanggal, ad.nama AS sales_nama
         ${DARI_LOG} ${where ? where + ' AND' : 'WHERE'} l.catatan IS NOT NULL ORDER BY l.tanggal DESC, l.created_at DESC LIMIT 20`,
        nilai
      ),
      req.admin.peran === 'sales'
        ? Promise.resolve({ rows: [] })
        : query(`SELECT id, nama, aktif, wp_sales_id FROM mj_admin WHERE peran='sales' ORDER BY aktif DESC, nama`),
    ]);
    res.json({ total: total[0], perKategori, perSales, catatan, sales });
  } catch (e) {
    next(e);
  }
});

export default router;
