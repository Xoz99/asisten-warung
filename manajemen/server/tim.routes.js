import bcrypt from 'bcryptjs';
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { catatLog, query, pool } from './db.js';
import { cekPassword, rapikanUsername } from './auth.js';
import { pastikanTabelKaryawan } from './karyawan.routes.js';
import { bacaFoto } from './lapangan.routes.js';
import { POLA_KODE_SALES, pastikanTabelSales, query as queryWp, rapikanKodeSales } from './produk/warung-pintar/db.js';
import { normalisasiNoHp } from './utils/noHp.js';

// Tim sales: satu sales = akun Makalin (peran sales) + kode referral Warung Pintar + data karyawan tipe kemitraan.
// Dibikin sekali jalan dari sini. Data karyawan nyimpen foto profil & rekening pencairan bagi hasil.
// Rekening yang diisi/diganti admin langsung dianggap udah dicek. Kalau sales sendiri yang ganti, statusnya balik
// "belum dicek" dan bagi hasilnya nggak bisa ditransfer sampai admin ngecek (jaga-jaga akun sales dibajak).
const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(process.env.PROFIL_DIR || path.join(__dirname, '../data/profil'));
const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const teks = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const salah = (pesan, status = 400) => Object.assign(new Error(pesan), { status });
const MAKS_FOTO_PROFIL = 1024 * 1024;

let siap = null;
function pastikanTabel() {
  if (!siap) {
    siap = (async () => {
      await pastikanTabelKaryawan();
      await pastikanTabelSales();
      fs.mkdirSync(DIR, { recursive: true });
    })().catch((e) => {
      siap = null;
      throw e;
    });
  }
  return siap;
}
router.use(['/tim-sales', '/saya/profil', '/saya/foto'], async (req, res, next) => {
  try {
    await pastikanTabel();
    next();
  } catch (e) {
    next(e);
  }
});
const adminSaja = (req) => {
  if (req.admin.peran === 'sales') throw salah('Cuma admin', 403);
};

// Isian profil yang boleh diubah (admin & sales sendiri). `sebagian` = cuma kolom yang dikirim.
function bersihkanProfil(b) {
  const x = {};
  const ada = (k) => b[k] !== undefined;
  if (ada('no_hp')) {
    x.no_hp = b.no_hp ? normalisasiNoHp(b.no_hp) : null;
    if (b.no_hp && !x.no_hp) throw salah('Nomor HP nggak valid');
  }
  if (ada('email')) {
    x.email = teks(b.email, 120).toLowerCase() || null;
    if (x.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.email)) throw salah('Email nggak valid');
  }
  if (ada('nik_ktp')) {
    x.nik_ktp = teks(b.nik_ktp, 30).replace(/\D/g, '') || null;
    if (x.nik_ktp && x.nik_ktp.length !== 16) throw salah('NIK KTP harus 16 angka');
  }
  if (ada('npwp')) {
    x.npwp = teks(b.npwp, 30).replace(/\D/g, '') || null;
    if (x.npwp && ![15, 16].includes(x.npwp.length)) throw salah('NPWP harus 15 atau 16 angka');
  }
  if (ada('alamat')) x.alamat = teks(b.alamat, 300) || null;
  if (ada('lokasi')) x.lokasi = teks(b.lokasi, 60) || null;
  if (ada('tanggal_lahir')) x.tanggal_lahir = /^\d{4}-\d{2}-\d{2}$/.test(b.tanggal_lahir || '') ? b.tanggal_lahir : null;
  if (ada('bank')) x.bank = teks(b.bank, 40) || null;
  if (ada('rekening')) {
    x.rekening = teks(b.rekening, 40).replace(/[\s.-]/g, '') || null;
    if (x.rekening && !/^\d{5,20}$/.test(x.rekening)) throw salah('Nomor rekening / e-wallet harus 5-20 angka');
  }
  if (ada('atas_nama')) x.atas_nama = teks(b.atas_nama, 100) || null;
  return x;
}

// UPDATE mj_karyawan dari isian profil. `dicekOleh` = nama admin (rekening yang diganti dianggap udah dicek) atau
// null (sales sendiri: rekening yang diganti jadi "belum dicek").
async function simpanProfil(c, karyawanId, x, { diubahOleh, dicekOleh }) {
  const kolom = Object.keys(x);
  if (!kolom.length) return false;
  const param = [karyawanId, ...kolom.map((k) => x[k])];
  let tanda = '';
  if (['bank', 'rekening', 'atas_nama'].some((k) => k in x)) {
    param.push(diubahOleh, dicekOleh);
    const [oleh, cek] = [`$${param.length - 1}`, `$${param.length}`];
    const baru = ['bank', 'rekening', 'atas_nama'].map((k) => (k in x ? `$${kolom.indexOf(k) + 2}::text` : k)).join(', ');
    const beda = `(bank, rekening, atas_nama) IS DISTINCT FROM (${baru})`;
    tanda = `, rekening_diubah_at = CASE WHEN ${beda} THEN now() ELSE rekening_diubah_at END,
      rekening_diubah_oleh = CASE WHEN ${beda} THEN ${oleh} ELSE rekening_diubah_oleh END,
      rekening_dicek_at = CASE WHEN ${beda} THEN (CASE WHEN ${cek}::text IS NULL THEN NULL ELSE now() END) ELSE rekening_dicek_at END,
      rekening_dicek_oleh = CASE WHEN ${beda} THEN ${cek}::text ELSE rekening_dicek_oleh END`;
  }
  const { rows } = await c.query(
    `WITH lama AS (SELECT bank AS bank0, rekening AS rekening0, atas_nama AS atas_nama0 FROM mj_karyawan WHERE id=$1)
     UPDATE mj_karyawan k SET ${kolom.map((kk, i) => `${kk}=$${i + 2}`).join(', ')}${tanda} FROM lama WHERE k.id=$1
     RETURNING (lama.bank0, lama.rekening0, lama.atas_nama0) IS DISTINCT FROM (k.bank, k.rekening, k.atas_nama) AS rekening_berubah`,
    param
  );
  return rows[0]?.rekening_berubah || false;
}

// Data karyawan milik akun sales. Akun lama (sebelum Tim sales ada) dibikinin otomatis.
async function karyawanAkun(c, akun) {
  const { rows } = await c.query('SELECT id FROM mj_karyawan WHERE admin_id=$1', [akun.id]);
  if (rows.length) return rows[0].id;
  const { rows: baru } = await c.query(
    `INSERT INTO mj_karyawan (nama, tipe, jabatan, departemen, admin_id) VALUES ($1,'kemitraan','Sales Partner','Sales',$2)
     ON CONFLICT (admin_id) WHERE admin_id IS NOT NULL DO UPDATE SET admin_id = EXCLUDED.admin_id RETURNING id`,
    [akun.nama, akun.id]
  );
  return baru[0].id;
}

const KOLOM_PROFIL = `k.id AS karyawan_id, 'MKL-' || lpad(k.nomor::text, 3, '0') AS nik, k.no_hp, k.email, k.nik_ktp, k.npwp, k.alamat, k.lokasi,
  k.tanggal_lahir::text AS tanggal_lahir, k.tanggal_masuk::text AS tanggal_masuk, k.status AS status_karyawan,
  k.bank, k.rekening, k.atas_nama, (k.foto IS NOT NULL) AS ada_foto,
  k.rekening_diubah_at, k.rekening_diubah_oleh, k.rekening_dicek_at, k.rekening_dicek_oleh`;

// Yang masih kurang biar bagi hasil bisa ditransfer.
export function kurangBuatCair(p) {
  const kurang = [];
  if (!p?.bank) kurang.push('bank');
  if (!p?.rekening) kurang.push('nomor rekening');
  if (!p?.atas_nama) kurang.push('atas nama');
  return kurang;
}
const lengkapi = (p) => ({ ...p, kurang: kurangBuatCair(p), siap_cair: !kurangBuatCair(p).length && Boolean(p.rekening_dicek_at) });

async function simpanFileFoto(buf, ext) {
  const nama = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(DIR, nama), buf);
  return nama;
}
const buangFile = (nama) => nama && fs.rm(path.join(DIR, path.basename(nama)), { force: true }, () => {});
function fotoDariBody(b) {
  if (!b?.foto) return null;
  const f = bacaFoto(b.foto);
  if (f.buf.length > MAKS_FOTO_PROFIL) throw salah('Foto profil maksimal 1 MB');
  return f;
}
async function kirimFoto(res, karyawanId) {
  const { rows } = await query('SELECT foto FROM mj_karyawan WHERE id=$1', [karyawanId]);
  const nama = rows[0]?.foto;
  const file = nama && path.join(DIR, path.basename(nama));
  if (!file || !fs.existsSync(file)) throw salah('Belum ada foto', 404);
  const ext = path.extname(file).slice(1);
  res.setHeader('Content-Type', ext === 'png' ? 'image/png' : ext === 'jpg' ? 'image/jpeg' : 'image/webp');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-cache');
  res.sendFile(file);
}
async function gantiFoto(karyawanId, f) {
  const nama = await simpanFileFoto(f.buf, f.ext);
  const { rows } = await query('UPDATE mj_karyawan k SET foto=$2 FROM (SELECT foto AS foto0 FROM mj_karyawan WHERE id=$1) lama WHERE k.id=$1 RETURNING lama.foto0', [karyawanId, nama]);
  buangFile(rows[0]?.foto0);
}

// ---------------- Admin ----------------
router.get('/tim-sales', async (req, res, next) => {
  try {
    adminSaja(req);
    const [{ rows }, { rows: wp }, { rows: karyawanBebas }] = await Promise.all([
      query(
        `SELECT a.id, a.username, a.nama, a.aktif, a.terakhir_masuk, a.created_at, a.wp_sales_id, ${KOLOM_PROFIL}
         FROM mj_admin a LEFT JOIN mj_karyawan k ON k.admin_id = a.id WHERE a.peran = 'sales' ORDER BY a.aktif DESC, a.nama`
      ),
      queryWp('SELECT id, kode, nama, no_hp, aktif FROM sales ORDER BY aktif DESC, nama'),
      query(`SELECT id, nama, no_hp, jabatan, tipe FROM mj_karyawan WHERE admin_id IS NULL AND status = 'aktif' ORDER BY (tipe = 'kemitraan') DESC, nama`),
    ]);
    const perId = Object.fromEntries(wp.map((s) => [s.id, s]));
    const terpakai = new Set(rows.map((r) => r.wp_sales_id).filter(Boolean));
    res.json({
      sales: rows.map((r) => lengkapi({ ...r, kode: perId[r.wp_sales_id] || null })),
      kodeBebas: wp.filter((s) => !terpakai.has(s.id)),
      karyawanBebas,
    });
  } catch (e) {
    next(e);
  }
});

// Tambah sales sekali jalan: akun login + kode referral (baru atau yang udah ada) + data karyawan + rekening + foto.
router.post('/tim-sales', async (req, res, next) => {
  let kodeBaruId = null;
  let fileFoto = null;
  try {
    adminSaja(req);
    const b = req.body || {};
    const username = rapikanUsername(b.username);
    const nama = teks(b.nama, 60);
    if (!nama) throw salah('Nama wajib diisi');
    if (!username) throw salah('Username 3-30 huruf kecil/angka (boleh . _ -)');
    const pwSalah = cekPassword(b.password);
    if (pwSalah) throw salah(pwSalah);
    const profil = bersihkanProfil(b);
    const foto = fotoDariBody(b);
    const { rows: dipakai } = await query('SELECT 1 FROM mj_admin WHERE username=$1', [username]);
    if (dipakai.length) throw salah(`Username ${username} udah dipakai`, 409);

    // Kode referral: pakai yang udah ada (belum nyambung ke akun lain) atau bikin baru.
    let wpId;
    let kode;
    if (b.wp_sales_id) {
      if (!POLA_UUID.test(b.wp_sales_id)) throw salah('Kode sales nggak ditemukan');
      const { rows } = await queryWp('SELECT id, kode FROM sales WHERE id=$1', [b.wp_sales_id]);
      if (!rows.length) throw salah('Kode sales nggak ditemukan');
      const { rows: nyambung } = await query('SELECT username FROM mj_admin WHERE wp_sales_id=$1', [b.wp_sales_id]);
      if (nyambung.length) throw salah(`Kode ${rows[0].kode} udah dipakai akun @${nyambung[0].username}`, 409);
      [wpId, kode] = [rows[0].id, rows[0].kode];
    } else {
      kode = rapikanKodeSales(b.kode);
      if (!POLA_KODE_SALES.test(kode)) throw salah('Kode referral 3-20 huruf/angka tanpa spasi. Contoh: BUDI');
      const { rows } = await queryWp('INSERT INTO sales (kode, nama, no_hp) VALUES ($1,$2,$3) ON CONFLICT (kode) DO NOTHING RETURNING id', [kode, nama, profil.no_hp || null]);
      if (!rows.length) throw salah(`Kode ${kode} udah dipakai. Pilih "pakai kode yang udah ada" kalau itu punya dia.`, 409);
      wpId = kodeBaruId = rows[0].id;
    }

    if (foto) fileFoto = await simpanFileFoto(foto.buf, foto.ext);
    const c = await pool.connect();
    let akun;
    try {
      await c.query('BEGIN');
      const { rows } = await c.query(
        `INSERT INTO mj_admin (username, nama, password_hash, peran, wp_sales_id) VALUES ($1,$2,$3,'sales',$4) RETURNING id, username, nama`,
        [username, nama, await bcrypt.hash(b.password, 10), wpId]
      );
      akun = rows[0];
      // Dari data karyawan yang udah ada (misal hasil Rekrutmen), atau bikin baru.
      let karyawanId;
      if (b.karyawan_id) {
        if (!POLA_UUID.test(b.karyawan_id)) throw salah('Data karyawan nggak ditemukan');
        const { rows: k } = await c.query(
          `UPDATE mj_karyawan SET admin_id=$2, tipe='kemitraan', jabatan=COALESCE(jabatan,'Sales Partner'), departemen=COALESCE(departemen,'Sales')
           WHERE id=$1 AND admin_id IS NULL RETURNING id`,
          [b.karyawan_id, akun.id]
        );
        if (!k.length) throw salah('Data karyawan itu udah nyambung ke akun lain', 409);
        karyawanId = k[0].id;
      } else {
        karyawanId = await karyawanAkun(c, akun);
      }
      await simpanProfil(c, karyawanId, profil, { diubahOleh: req.admin.nama, dicekOleh: req.admin.nama });
      if (fileFoto) await c.query('UPDATE mj_karyawan SET foto=$2 WHERE id=$1', [karyawanId, fileFoto]);
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
    kodeBaruId = null;
    await catatLog(req, 'tim.sales.tambah', { username, nama, kode });
    res.status(201).json({ id: akun.id, username, nama, kode });
  } catch (e) {
    // Kode baru di database Warung Pintar dibatalin kalau akunnya gagal dibikin (beda database, nggak bisa 1 transaksi).
    if (kodeBaruId) await queryWp('DELETE FROM sales WHERE id=$1', [kodeBaruId]).catch(() => {});
    buangFile(fileFoto);
    next(e.code === '23505' ? salah('Username udah dipakai', 409) : e);
  }
});

async function akunSales(id) {
  if (!POLA_UUID.test(id || '')) throw salah('Sales nggak ditemukan', 404);
  const { rows } = await query(`SELECT id, username, nama, wp_sales_id FROM mj_admin WHERE id=$1 AND peran='sales'`, [id]);
  if (!rows.length) throw salah('Sales nggak ditemukan', 404);
  return rows[0];
}

router.patch('/tim-sales/:id', async (req, res, next) => {
  try {
    adminSaja(req);
    const akun = await akunSales(req.params.id);
    const profil = bersihkanProfil(req.body || {});
    const nama = req.body.nama !== undefined ? teks(req.body.nama, 60) : undefined;
    if (nama === '') throw salah('Nama wajib diisi');
    const c = await pool.connect();
    let rekeningBerubah;
    try {
      await c.query('BEGIN');
      const karyawanId = await karyawanAkun(c, akun);
      if (nama) {
        await c.query('UPDATE mj_admin SET nama=$2 WHERE id=$1', [akun.id, nama]);
        await c.query('UPDATE mj_karyawan SET nama=$2 WHERE id=$1', [karyawanId, nama]);
      }
      rekeningBerubah = await simpanProfil(c, karyawanId, profil, { diubahOleh: req.admin.nama, dicekOleh: req.admin.nama });
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
    if (nama && akun.wp_sales_id) await queryWp('UPDATE sales SET nama=$2 WHERE id=$1', [akun.wp_sales_id, nama]).catch(() => {});
    if (profil.no_hp !== undefined && akun.wp_sales_id) await queryWp('UPDATE sales SET no_hp=$2 WHERE id=$1', [akun.wp_sales_id, profil.no_hp]).catch(() => {});
    await catatLog(req, 'tim.sales.ubah', { username: akun.username, diubah: [...(nama ? ['nama'] : []), ...Object.keys(profil)].join(', '), ...(rekeningBerubah ? { rekening: 'diganti' } : {}) });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Admin udah nyocokin rekening (misal nama di m-banking sama dengan KTP) -> bagi hasil boleh ditransfer ke situ.
router.post('/tim-sales/:id/cek-rekening', async (req, res, next) => {
  try {
    adminSaja(req);
    const akun = await akunSales(req.params.id);
    const { rows } = await query('SELECT bank, rekening, atas_nama FROM mj_karyawan WHERE admin_id=$1', [akun.id]);
    const kurang = kurangBuatCair(rows[0]);
    if (kurang.length) throw salah(`Rekening belum lengkap: ${kurang.join(', ')}`);
    await query('UPDATE mj_karyawan SET rekening_dicek_at=now(), rekening_dicek_oleh=$2 WHERE admin_id=$1', [akun.id, req.admin.nama]);
    await catatLog(req, 'tim.sales.cek_rekening', { username: akun.username, bank: rows[0].bank, rekening: '…' + rows[0].rekening.slice(-4) });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.put('/tim-sales/:id/foto', async (req, res, next) => {
  try {
    adminSaja(req);
    const akun = await akunSales(req.params.id);
    const f = fotoDariBody(req.body);
    if (!f) throw salah('Foto wajib dipilih');
    const c = await pool.connect();
    let karyawanId;
    try {
      karyawanId = await karyawanAkun(c, akun);
    } finally {
      c.release();
    }
    await gantiFoto(karyawanId, f);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get('/tim-sales/:id/foto', async (req, res, next) => {
  try {
    adminSaja(req);
    const akun = await akunSales(req.params.id);
    const { rows } = await query('SELECT id FROM mj_karyawan WHERE admin_id=$1', [akun.id]);
    if (!rows.length) throw salah('Belum ada foto', 404);
    await kirimFoto(res, rows[0].id);
  } catch (e) {
    next(e);
  }
});

// ---------------- Sales: profil sendiri ----------------
const salesSaja = (req) => {
  if (req.admin.peran !== 'sales') throw salah('Profil ini buat akun sales', 403);
};

router.get('/saya/profil', async (req, res, next) => {
  try {
    salesSaja(req);
    const { rows } = await query(`SELECT a.nama, a.username, ${KOLOM_PROFIL} FROM mj_admin a LEFT JOIN mj_karyawan k ON k.admin_id = a.id WHERE a.id=$1`, [req.admin.id]);
    res.json(lengkapi(rows[0]));
  } catch (e) {
    next(e);
  }
});

router.patch('/saya/profil', async (req, res, next) => {
  try {
    salesSaja(req);
    const profil = bersihkanProfil(req.body || {});
    const c = await pool.connect();
    let rekeningBerubah;
    try {
      await c.query('BEGIN');
      const karyawanId = await karyawanAkun(c, req.admin);
      rekeningBerubah = await simpanProfil(c, karyawanId, profil, { diubahOleh: 'sales sendiri', dicekOleh: null });
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
    if (profil.no_hp !== undefined && req.admin.wp_sales_id) await queryWp('UPDATE sales SET no_hp=$2 WHERE id=$1', [req.admin.wp_sales_id, profil.no_hp]).catch(() => {});
    await catatLog(req, 'tim.profil.ubah', { username: req.admin.username, diubah: Object.keys(profil).join(', '), ...(rekeningBerubah ? { rekening: 'diganti, nunggu dicek admin' } : {}) });
    res.json({ ok: true, rekeningBerubah });
  } catch (e) {
    next(e);
  }
});

router.put('/saya/foto', async (req, res, next) => {
  try {
    salesSaja(req);
    const f = fotoDariBody(req.body);
    if (!f) throw salah('Foto wajib dipilih');
    const c = await pool.connect();
    let karyawanId;
    try {
      karyawanId = await karyawanAkun(c, req.admin);
    } finally {
      c.release();
    }
    await gantiFoto(karyawanId, f);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get('/saya/foto', async (req, res, next) => {
  try {
    salesSaja(req);
    const { rows } = await query('SELECT id FROM mj_karyawan WHERE admin_id=$1', [req.admin.id]);
    if (!rows.length) throw salah('Belum ada foto', 404);
    await kirimFoto(res, rows[0].id);
  } catch (e) {
    next(e);
  }
});

// Rekening tujuan per kode sales (dipakai halaman Bagi hasil).
export async function rekeningPerSales(wpIds) {
  if (!wpIds.length) return {};
  await pastikanTabel();
  const { rows } = await query(
    `SELECT DISTINCT ON (a.wp_sales_id) a.wp_sales_id, a.id AS admin_id, k.bank, k.rekening, k.atas_nama, k.rekening_dicek_at, k.rekening_dicek_oleh, k.rekening_diubah_at, k.rekening_diubah_oleh, (k.foto IS NOT NULL) AS ada_foto
     FROM mj_admin a LEFT JOIN mj_karyawan k ON k.admin_id = a.id
     WHERE a.wp_sales_id = ANY($1::uuid[]) ORDER BY a.wp_sales_id, a.aktif DESC, a.created_at`,
    [wpIds]
  );
  return Object.fromEntries(rows.map((r) => [r.wp_sales_id, lengkapi(r)]));
}

export default router;
