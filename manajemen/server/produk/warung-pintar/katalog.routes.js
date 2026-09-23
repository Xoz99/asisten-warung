import { Router } from 'express';
import { catatLog } from '../../db.js';
import { query } from './db.js';

// Katalog Barang Bersama Warung Pintar (tabel katalog_barang di database warung-pintar-backend): tim ngerapiin isi
// katalog di sini - tambah barang (rokok & barang lokal yang nggak ada di Open Food Facts), setujui draf, ubah nama/
// kategori/barcode, nonaktifin barang aneh, impor CSV, dan lihat usulan dari barang yang udah dipakai warung.
// Barang yang diubah tim ditandai sumber 'tim' biar nggak ketimpa waktu impor ulang dari database terbuka.
const router = Router();
const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const salah = (pesan, status = 400) => Object.assign(new Error(pesan), { status });
const teks = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
export const KATEGORI_KATALOG = ['sembako', 'minuman', 'susu', 'snack', 'mie instan', 'bumbu', 'rokok', 'kebersihan', 'lainnya'];
const PER_HALAMAN = 50;

// Sama persis dengan services/katalog.service.js di warung-pintar-backend - kunci harus identik di dua sisi.
const normalNama = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
const normalBarcode = (b) => String(b).trim().replace(/^0+(?=\d{8,})/, '');
function gtinValid(kode) {
  const k = String(kode || '').trim();
  if (!/^(\d{8}|\d{12,14})$/.test(k)) return false;
  const d = k.split('').map(Number);
  const cek = d.pop();
  const jumlah = d.reverse().reduce((a, x, i) => a + x * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (jumlah % 10)) % 10 === cek;
}
const kunciDari = ({ barcode, nama }) => (barcode ? normalBarcode(barcode) : 'n:' + normalNama(nama));

// Tabelnya dibikin warung-pintar-backend. Kalau Makalin dibuka duluan (backend belum pernah jalan versi katalog),
// dibikin juga di sini dengan definisi yang sama - semua IF NOT EXISTS.
let siap = null;
function pastikanTabel() {
  if (!siap) {
    siap = (async () => {
      await query(`CREATE TABLE IF NOT EXISTS katalog_barang (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), kunci TEXT UNIQUE NOT NULL, barcode TEXT, nama TEXT NOT NULL, merek TEXT,
        kategori TEXT NOT NULL DEFAULT 'sembako', satuan TEXT NOT NULL DEFAULT 'pcs', isi_kemasan INTEGER NOT NULL DEFAULT 1,
        nama_kemasan TEXT, ukuran TEXT, foto_url TEXT, sumber TEXT NOT NULL DEFAULT 'off', populer INTEGER NOT NULL DEFAULT 0,
        aktif BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
      )`);
      await query(`CREATE TABLE IF NOT EXISTS katalog_kontribusi (
        produk_id UUID PRIMARY KEY REFERENCES produk(id) ON DELETE CASCADE, warung_id UUID NOT NULL REFERENCES warung(id) ON DELETE CASCADE,
        kunci TEXT NOT NULL, nama TEXT NOT NULL, barcode TEXT, kategori TEXT, satuan TEXT, isi_kemasan INTEGER,
        harga NUMERIC NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ DEFAULT now()
      )`);
      await query('ALTER TABLE katalog_barang ADD COLUMN IF NOT EXISTS draf BOOLEAN NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS diubah_oleh TEXT');
    })().catch((e) => {
      siap = null;
      throw e;
    });
  }
  return siap;
}
router.use('/katalog', async (req, res, next) => {
  try {
    await pastikanTabel();
    next();
  } catch (e) {
    next(e);
  }
});

// Isian barang dari form / CSV. Barcode opsional (rokok & barang curah biasanya nggak diisi), tapi kalau diisi wajib valid.
function bersihkan(b, sebagian = false) {
  const x = {};
  const ada = (k) => !sebagian || b[k] !== undefined;
  if (ada('nama')) {
    x.nama = teks(b.nama, 120);
    if (!x.nama) throw salah('Nama barang wajib diisi');
  }
  if (ada('barcode')) {
    const bc = String(b.barcode ?? '').replace(/\s+/g, '');
    if (bc && !gtinValid(bc) && !(bc.length >= 8 && gtinValid(bc.padStart(13, '0')))) throw salah(`Barcode ${bc} nggak valid (digit ceknya salah). Kosongin kalau nggak ada.`);
    x.barcode = bc ? normalBarcode(bc) : null;
  }
  if (ada('kategori')) {
    const k = teks(b.kategori, 30).toLowerCase() || 'lainnya';
    x.kategori = KATEGORI_KATALOG.includes(k) ? k : 'lainnya';
  }
  if (ada('satuan')) x.satuan = teks(b.satuan, 20).toLowerCase() || 'pcs';
  if (ada('isi_kemasan')) x.isi_kemasan = Math.min(10000, Math.max(1, Math.round(Number(b.isi_kemasan) || 1)));
  if (ada('nama_kemasan')) x.nama_kemasan = teks(b.nama_kemasan, 20).toLowerCase() || null;
  if (ada('merek')) x.merek = teks(b.merek, 60) || null;
  if (ada('ukuran')) x.ukuran = teks(b.ukuran, 30) || null;
  if (ada('foto_url')) {
    const u = teks(b.foto_url, 500);
    if (u && !/^https:\/\/\S+$/.test(u)) throw salah('Link foto harus https://');
    x.foto_url = u || null;
  }
  return x;
}

const KOLOM = `k.id, k.kunci, k.barcode, k.nama, k.merek, k.kategori, k.satuan, k.isi_kemasan, k.nama_kemasan, k.ukuran, k.foto_url,
  k.sumber, k.aktif, k.draf, k.diubah_oleh, k.updated_at,
  (SELECT count(DISTINCT c.warung_id)::int FROM katalog_kontribusi c WHERE c.kunci = k.kunci) AS dipakai_warung`;

router.get('/katalog', async (req, res, next) => {
  try {
    const status = ['aktif', 'draf', 'nonaktif', 'semua'].includes(req.query.status) ? req.query.status : 'aktif';
    const halaman = Math.max(1, Math.min(1000, Math.floor(Number(req.query.halaman) || 1)));
    const syarat = [];
    const nilai = [];
    const tambah = (sql, v) => {
      nilai.push(v);
      syarat.push(sql.replaceAll('?', `$${nilai.length}`));
    };
    if (status === 'aktif') syarat.push('k.aktif');
    else if (status === 'draf') syarat.push('k.draf');
    else if (status === 'nonaktif') syarat.push('NOT k.aktif AND NOT k.draf');
    const q = teks(req.query.q, 60);
    if (q) for (const kata of normalNama(q).split(' ').filter(Boolean).slice(0, 6)) tambah("(lower(k.nama) LIKE ? OR COALESCE(k.barcode,'') LIKE ? OR lower(COALESCE(k.merek,'')) LIKE ?)", `%${kata}%`);
    if (KATEGORI_KATALOG.includes(req.query.kategori)) tambah('k.kategori = ?', req.query.kategori);
    if (['off', 'obf', 'opf', 'warung', 'tim'].includes(req.query.sumber)) tambah('k.sumber = ?', req.query.sumber);
    const where = syarat.length ? 'WHERE ' + syarat.join(' AND ') : '';
    const [{ rows }, { rows: n }, { rows: ring }] = await Promise.all([
      query(
        `SELECT ${KOLOM} FROM katalog_barang k ${where} ORDER BY k.draf DESC, k.populer DESC, k.nama LIMIT ${PER_HALAMAN} OFFSET ${(halaman - 1) * PER_HALAMAN}`,
        nilai
      ),
      query(`SELECT count(*)::int AS n FROM katalog_barang k ${where}`, nilai),
      query(`SELECT count(*) FILTER (WHERE aktif)::int AS aktif, count(*) FILTER (WHERE draf)::int AS draf,
                    count(*) FILTER (WHERE NOT aktif AND NOT draf)::int AS nonaktif,
                    count(*) FILTER (WHERE aktif AND kategori='rokok')::int AS rokok
             FROM katalog_barang`),
    ]);
    res.json({ items: rows, total: n[0].n, halaman, perHalaman: PER_HALAMAN, ringkasan: ring[0], kategori: KATEGORI_KATALOG });
  } catch (e) {
    next(e);
  }
});

async function simpanBaru(x, { aktif, oleh }) {
  const kunci = kunciDari(x);
  const { rows } = await query(
    `INSERT INTO katalog_barang (kunci, barcode, nama, merek, kategori, satuan, isi_kemasan, nama_kemasan, ukuran, foto_url, sumber, aktif, draf, diubah_oleh, populer)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'tim',$11,$12,$13,500) ON CONFLICT (kunci) DO NOTHING RETURNING id`,
    [kunci, x.barcode ?? null, x.nama, x.merek ?? null, x.kategori ?? 'lainnya', x.satuan ?? 'pcs', x.isi_kemasan ?? 1, x.nama_kemasan ?? null, x.ukuran ?? null, x.foto_url ?? null, aktif, !aktif, oleh]
  );
  return rows[0] || null;
}

router.post('/katalog', async (req, res, next) => {
  try {
    const x = bersihkan(req.body || {});
    const baru = await simpanBaru(x, { aktif: req.body.aktif !== false, oleh: req.admin.nama });
    if (!baru) throw salah(x.barcode ? `Barcode ${x.barcode} udah ada di katalog` : `"${x.nama}" udah ada di katalog`, 409);
    await catatLog(req, 'wp.katalog.tambah', { nama: x.nama });
    res.status(201).json(baru);
  } catch (e) {
    next(e);
  }
});

// Ubah isi barang. Barang dari database terbuka / warung yang diubah tim jadi sumber 'tim' (nggak ketimpa impor ulang).
router.patch('/katalog/:id', async (req, res, next) => {
  try {
    if (!POLA_UUID.test(req.params.id)) throw salah('Barang nggak ditemukan', 404);
    const x = bersihkan(req.body || {}, true);
    const { rows: lama } = await query('SELECT nama, barcode FROM katalog_barang WHERE id=$1', [req.params.id]);
    if (!lama.length) throw salah('Barang nggak ditemukan', 404);
    if (x.barcode !== undefined || x.nama !== undefined) x.kunci = kunciDari({ barcode: x.barcode !== undefined ? x.barcode : lama[0].barcode, nama: x.nama ?? lama[0].nama });
    const kolom = Object.keys(x);
    if (!kolom.length) throw salah('Nggak ada yang diubah');
    try {
      await query(
        `UPDATE katalog_barang SET ${kolom.map((k, i) => `${k}=$${i + 2}`).join(', ')}, sumber='tim', diubah_oleh=$${kolom.length + 2}, updated_at=now() WHERE id=$1`,
        [req.params.id, ...kolom.map((k) => x[k]), req.admin.nama]
      );
    } catch (e) {
      if (e.code === '23505') throw salah('Barcode / nama ini udah dipakai barang lain di katalog', 409);
      throw e;
    }
    await catatLog(req, 'wp.katalog.ubah', { nama: x.nama || lama[0].nama, diubah: kolom.filter((k) => k !== 'kunci').join(', ') });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Setujui / nonaktifkan / aktifkan banyak sekaligus.
router.post('/katalog/status', async (req, res, next) => {
  try {
    const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).filter((x) => POLA_UUID.test(x)).slice(0, 500);
    if (!ids.length) throw salah('Pilih barang dulu');
    const aksi = req.body.aksi;
    const set = { setujui: 'aktif=true, draf=false', aktifkan: 'aktif=true, draf=false', nonaktifkan: 'aktif=false, draf=false' }[aksi];
    if (!set) throw salah('Aksi nggak dikenal');
    const { rowCount } = await query(`UPDATE katalog_barang SET ${set}, diubah_oleh=$2, updated_at=now() WHERE id = ANY($1)`, [ids, req.admin.nama]);
    await catatLog(req, 'wp.katalog.status', { aksi, jumlah: rowCount });
    res.json({ ok: true, jumlah: rowCount });
  } catch (e) {
    next(e);
  }
});

// Hapus beneran cuma buat draf (barang aktif/nonaktif cukup dinonaktifkan - barang dari database terbuka bakal
// balik lagi kalau dihapus, jadi nonaktif lebih tepat).
router.delete('/katalog/:id', async (req, res, next) => {
  try {
    if (!POLA_UUID.test(req.params.id)) throw salah('Barang nggak ditemukan', 404);
    const { rows } = await query('DELETE FROM katalog_barang WHERE id=$1 AND draf RETURNING nama', [req.params.id]);
    if (!rows.length) throw salah('Cuma draf yang bisa dihapus. Barang lain dinonaktifkan aja.', 409);
    await catatLog(req, 'wp.katalog.hapus', { nama: rows[0].nama });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Impor dari CSV (di-parse di browser). Baris yang barcode/namanya udah ada dilewati, baris rusak dilaporkan per nomor.
router.post('/katalog/impor', async (req, res, next) => {
  try {
    const baris = Array.isArray(req.body.baris) ? req.body.baris.slice(0, 2000) : [];
    if (!baris.length) throw salah('File CSV-nya kosong');
    const aktif = req.body.langsungAktif === true;
    let masuk = 0;
    let dobel = 0;
    const ditolak = [];
    for (const [i, b] of baris.entries()) {
      try {
        const x = bersihkan(b || {});
        if (await simpanBaru(x, { aktif, oleh: req.admin.nama })) masuk++;
        else dobel++;
      } catch (e) {
        if (!e.status) throw e;
        if (ditolak.length < 50) ditolak.push({ baris: i + 2, alasan: e.message });
      }
    }
    await catatLog(req, 'wp.katalog.impor', { masuk, dobel, ditolak: ditolak.length, sebagai: aktif ? 'aktif' : 'draf' });
    res.json({ masuk, dobel, ditolak });
  } catch (e) {
    next(e);
  }
});

// Usulan: barang yang dipakai warung tapi belum ada di katalog (belum sampai 3 warung). Nama & harga per warung nggak
// ditampilin - cuma nama barang yang paling sering dipakai + jumlah warungnya.
router.get('/katalog/usulan', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT c.kunci, mode() WITHIN GROUP (ORDER BY c.nama) AS nama, max(c.barcode) AS barcode, mode() WITHIN GROUP (ORDER BY c.kategori) AS kategori,
              mode() WITHIN GROUP (ORDER BY c.satuan) AS satuan, count(DISTINCT c.warung_id)::int AS warung
       FROM katalog_kontribusi c WHERE NOT EXISTS (SELECT 1 FROM katalog_barang k WHERE k.kunci = c.kunci)
       GROUP BY c.kunci ORDER BY warung DESC, nama LIMIT 200`
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

export default router;
