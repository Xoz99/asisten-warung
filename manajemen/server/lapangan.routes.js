import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { catatLog, query, pool } from './db.js';

// Sales Lapangan: bank keberatan pelanggan (kategori, ucapan, fakta produk buat ngejawab) + log kunjungan sales
// (respon sales, respon pelanggan, hasil, insight, foto bukti, link lokasi Sharelock/Ugorex).
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

// Isi awal bank keberatan (dari tabel yang dipakai tim). Cuma dimasukin kalau bank-nya masih kosong.
const BANK_AWAL = [
  {
    kategori: 'Gaptek/HP',
    ucapan: 'Saya gaptek / gak mengerti HP. (bisa jadi takut dikira bodoh/malu)',
    fakta: 'Tampilan Asisten Warung dirancang sederhana: tombol besar, alur mirip kirim WA. Tim bantu setup langsung di tempat, gratis.',
  },
  {
    kategori: 'Kebiasaan/Buku manual',
    ucapan: 'Saya sudah biasa pakai buku catatan kertas.',
    fakta: 'Data di aplikasi tersimpan otomatis, tidak hilang/basah/robek. Ada fitur pengingat tagihan otomatis via WA.',
  },
  {
    kategori: 'Harga',
    ucapan: 'Bayar gak ini? Mahal gak?',
    fakta: 'Trial gratis 7 hari. Harga paket resmi: Rp78rb/bulan atau Rp684rb/tahun.',
  },
];

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
        lokasi_url TEXT, -- link Sharelock / Ugorex
        created_at TIMESTAMPTZ DEFAULT now(), diubah_at TIMESTAMPTZ DEFAULT now()
      )`);
      await query(`CREATE TABLE IF NOT EXISTS mj_lapangan_foto (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        log_id UUID NOT NULL REFERENCES mj_lapangan_log(id) ON DELETE CASCADE,
        lokasi TEXT NOT NULL, mime TEXT NOT NULL, ukuran INT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      )`);
      await query('CREATE INDEX IF NOT EXISTS idx_mj_lapangan_log_tgl ON mj_lapangan_log (tanggal DESC, created_at DESC)');
      const { rows } = await query('SELECT count(*)::int AS n FROM mj_keberatan');
      if (!rows[0].n) {
        for (const b of BANK_AWAL) await query('INSERT INTO mj_keberatan (kategori, ucapan, fakta) VALUES ($1,$2,$3)', [b.kategori, b.ucapan, b.fakta]);
      }
      fs.mkdirSync(DIR, { recursive: true });
    })().catch((e) => {
      siap = null;
      throw e;
    });
  }
  return siap;
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
       GROUP BY k.id ORDER BY k.aktif DESC, k.nomor`
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

function bersihkanBank(b) {
  const x = { kategori: teks(b.kategori, 60), ucapan: teks(b.ucapan, 500), fakta: teks(b.fakta, 1500) };
  if (!x.kategori) throw salah('Kategori wajib diisi');
  if (!x.ucapan) throw salah('Ucapan pelanggan wajib diisi');
  if (!x.fakta) throw salah('Fakta dari produk wajib diisi');
  return x;
}

router.post('/lapangan/keberatan', async (req, res, next) => {
  try {
    adminSaja(req);
    const x = bersihkanBank(req.body || {});
    const { rows } = await query('INSERT INTO mj_keberatan (kategori, ucapan, fakta, dibuat_oleh) VALUES ($1,$2,$3,$4) RETURNING id', [
      x.kategori,
      x.ucapan,
      x.fakta,
      req.admin.id,
    ]);
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
      ({ rows } = await query('UPDATE mj_keberatan SET aktif=$2, diubah_at=now() WHERE id=$1 RETURNING kategori', [req.params.id, req.body.aktif]));
    } else {
      const x = bersihkanBank(req.body || {});
      ({ rows } = await query('UPDATE mj_keberatan SET kategori=$2, ucapan=$3, fakta=$4, diubah_at=now() WHERE id=$1 RETURNING kategori', [
        req.params.id,
        x.kategori,
        x.ucapan,
        x.fakta,
      ]));
    }
    if (!rows.length) throw salah('Keberatan nggak ditemukan', 404);
    await catatLog(req, 'lapangan.keberatan.ubah', { kategori: rows[0].kategori, ...(typeof req.body.aktif === 'boolean' ? { aktif: req.body.aktif } : {}) });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

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

function bersihkanLog(b) {
  const x = {
    kategori: teks(b.kategori, 60),
    ucapan: teks(b.ucapan, 1000),
    respon_sales: teks(b.respon_sales, 2000),
    respon_customer: teks(b.respon_customer, 2000) || null,
    hasil: b.hasil,
    catatan: teks(b.catatan, 2000) || null,
    id_kunjungan: teks(b.id_kunjungan, 80) || null,
    tanggal: /^\d{4}-\d{2}-\d{2}$/.test(b.tanggal || '') ? b.tanggal : null,
    lokasi_url: teks(b.lokasi_url, 500) || null,
  };
  if (!x.kategori) throw salah('Pilih kategori keberatan');
  if (x.ucapan.length < 3) throw salah('Tulis ucapan pelanggannya');
  if (x.respon_sales.length < 3) throw salah('Tulis respon kamu ke pelanggan');
  if (!HASIL.includes(x.hasil)) throw salah('Pilih hasilnya');
  if (!x.tanggal) throw salah('Tanggal kunjungan wajib diisi');
  if (x.tanggal > hariIni()) throw salah('Tanggal kunjungan nggak boleh di masa depan');
  if (x.lokasi_url) {
    let u;
    try {
      u = new URL(x.lokasi_url);
    } catch {
      throw salah('Link lokasi harus berupa alamat lengkap (https://...)');
    }
    if (!['http:', 'https:'].includes(u.protocol)) throw salah('Link lokasi harus diawali https://');
  }
  return x;
}

// Foto bukti dikirim base64 (sudah dikecilin di HP). Jenis file dicek dari isi, bukan dari nama.
function bacaFoto(d) {
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
    const k = await keberatanValid(b.keberatan_id);
    const x = bersihkanLog({ ...b, kategori: k ? k.kategori : b.kategori });
    const foto = (Array.isArray(b.foto) ? b.foto : []).map(bacaFoto);
    if (foto.length > MAKS_FOTO) throw salah(`Foto maksimal ${MAKS_FOTO}`);
    const c = await pool.connect();
    let hasil;
    try {
      await c.query('BEGIN');
      const { rows } = await c.query(
        `INSERT INTO mj_lapangan_log (sales_id, keberatan_id, kategori, ucapan, respon_sales, respon_customer, hasil, catatan, id_kunjungan, tanggal, lokasi_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, nomor`,
        [req.admin.id, k?.id || null, x.kategori, x.ucapan, x.respon_sales, x.respon_customer, x.hasil, x.catatan, x.id_kunjungan, x.tanggal, x.lokasi_url]
      );
      await simpanFoto(c, rows[0].id, foto);
      await c.query('COMMIT');
      hasil = rows[0];
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
    const k = await keberatanValid(b.keberatan_id);
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
           id_kunjungan=$9, tanggal=$10, lokasi_url=$11, diubah_at=now() WHERE id=$1`,
        [l.id, k?.id || null, x.kategori, x.ucapan, x.respon_sales, x.respon_customer, x.hasil, x.catatan, x.id_kunjungan, x.tanggal, x.lokasi_url]
      );
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
        : query(`SELECT id, nama, aktif FROM mj_admin WHERE peran='sales' ORDER BY aktif DESC, nama`),
    ]);
    res.json({ total: total[0], perKategori, perSales, catatan, sales });
  } catch (e) {
    next(e);
  }
});

export default router;
