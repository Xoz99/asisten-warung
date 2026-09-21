import { Router } from 'express';
import { normalisasiNoHp } from '../../utils/noHp.js';
import { catatLog } from '../../db.js';
import { POLA_KODE_SALES, query, rapikanKodeSales } from './db.js';

// Warung Pintar: kelola sales + rekap sales mana bawa warung mana & siapa yang udah bayar langganan.
// Dipasang lewat ./index.js di /api/warung-pintar - udah wajib login admin (server/auth.js).
const router = Router();

const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Total pembayaran LUNAS per warung. "Bulan ini" dihitung dari waktu lunasnya (updated_at diisi pas settlement).
const CTE_BAYAR = `bayar AS (
  SELECT warung_id, SUM(jumlah) AS omzet,
         COALESCE(SUM(jumlah) FILTER (WHERE updated_at >= date_trunc('month', now())), 0) AS bulan_ini,
         MAX(updated_at) AS terakhir
  FROM pembayaran WHERE status='settlement' GROUP BY warung_id
)`;

const KOLOM_REKAP = `COUNT(w.id)::int AS daftar,
  COUNT(b.warung_id)::int AS bayar,
  COUNT(w.id) FILTER (WHERE w.plan <> 'trial' AND w.lisensi_berlaku_sampai > now())::int AS langganan_aktif,
  COALESCE(SUM(b.omzet), 0)::float AS omzet,
  COALESCE(SUM(b.bulan_ini), 0)::float AS omzet_bulan_ini`;

// Ringkasan: rekap per sales, warung tanpa sales, dan pembayaran lunas terbaru (dari sales siapa).
router.get('/ringkasan', async (req, res, next) => {
  try {
    const { rows: sales } = await query(
      `WITH ${CTE_BAYAR}
       SELECT s.id, s.kode, s.nama, s.no_hp, s.aktif, s.created_at, ${KOLOM_REKAP}
       FROM sales s LEFT JOIN warung w ON w.sales_id = s.id LEFT JOIN bayar b ON b.warung_id = w.id
       GROUP BY s.id ORDER BY omzet DESC, daftar DESC, s.nama`
    );
    const { rows: tanpa } = await query(
      `WITH ${CTE_BAYAR}
       SELECT ${KOLOM_REKAP} FROM warung w LEFT JOIN bayar b ON b.warung_id = w.id WHERE w.sales_id IS NULL`
    );
    const { rows: pembayaran } = await query(
      `SELECT p.order_id, p.plan, p.jumlah::float AS jumlah, p.updated_at AS lunas_pada,
              w.id AS warung_id, w.nama AS warung, w.username, s.kode AS sales_kode, s.nama AS sales_nama
       FROM pembayaran p JOIN warung w ON w.id = p.warung_id LEFT JOIN sales s ON s.id = w.sales_id
       WHERE p.status='settlement' ORDER BY p.updated_at DESC LIMIT 30`
    );
    res.json({ sales, tanpaSales: tanpa[0], pembayaran });
  } catch (e) {
    next(e);
  }
});

router.post('/sales', async (req, res, next) => {
  try {
    const kode = rapikanKodeSales(req.body.kode);
    const nama = typeof req.body.nama === 'string' ? req.body.nama.trim() : '';
    if (!POLA_KODE_SALES.test(kode)) return res.status(400).json({ error: 'Kode sales 3-20 huruf/angka, tanpa spasi. Contoh: BUDI' });
    if (!nama) return res.status(400).json({ error: 'Nama sales wajib diisi' });
    const hp = req.body.noHp ? normalisasiNoHp(req.body.noHp) : null;
    if (req.body.noHp && !hp) return res.status(400).json({ error: 'Nomor HP sales nggak valid' });
    const { rows } = await query('INSERT INTO sales (kode, nama, no_hp) VALUES ($1,$2,$3) ON CONFLICT (kode) DO NOTHING RETURNING *', [
      kode,
      nama.slice(0, 80),
      hp,
    ]);
    if (!rows.length) return res.status(409).json({ error: `Kode ${kode} udah dipakai sales lain` });
    await catatLog(req, 'warung-pintar.sales.tambah', { kode, nama: rows[0].nama });
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

// Ubah nama/nomor, atau nonaktifin sales (kodenya nggak bisa dipakai daftar lagi, warung lamanya tetap kecatat).
// Kode sengaja nggak bisa diganti - link yang udah kesebar pakai kode itu.
router.patch('/sales/:id', async (req, res, next) => {
  try {
    if (!POLA_UUID.test(req.params.id)) return res.status(404).json({ error: 'Sales tidak ditemukan' });
    const { nama, noHp, aktif } = req.body;
    if (nama !== undefined && !(typeof nama === 'string' && nama.trim())) return res.status(400).json({ error: 'Nama sales wajib diisi' });
    const hp = noHp ? normalisasiNoHp(noHp) : null;
    if (noHp && !hp) return res.status(400).json({ error: 'Nomor HP sales nggak valid' });
    const { rows } = await query(
      `UPDATE sales SET nama = COALESCE($2, nama),
         no_hp = CASE WHEN $3::boolean THEN $4 ELSE no_hp END,
         aktif = COALESCE($5, aktif)
       WHERE id=$1 RETURNING *`,
      [req.params.id, nama !== undefined ? nama.trim().slice(0, 80) : null, noHp !== undefined, hp, typeof aktif === 'boolean' ? aktif : null]
    );
    if (!rows.length) return res.status(404).json({ error: 'Sales tidak ditemukan' });
    await catatLog(req, 'warung-pintar.sales.ubah', { kode: rows[0].kode, ...req.body });
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

const KOLOM_WARUNG = `w.id, w.nama, w.username, w.no_hp, w.created_at, w.plan, w.lisensi_berlaku_sampai,
  (w.plan <> 'trial' AND w.lisensi_berlaku_sampai > now()) AS langganan_aktif,
  COALESCE(b.omzet, 0)::float AS total_bayar, b.terakhir AS terakhir_bayar,
  s.kode AS sales_kode, s.nama AS sales_nama`;

// Warung bawaan satu sales (`:id` = id sales, atau "tanpa" buat warung yang daftar tanpa kode sales).
router.get('/sales/:id/warung', async (req, res, next) => {
  try {
    const tanpa = req.params.id === 'tanpa';
    if (!tanpa && !POLA_UUID.test(req.params.id)) return res.status(404).json({ error: 'Sales tidak ditemukan' });
    const { rows } = await query(
      `WITH ${CTE_BAYAR}
       SELECT ${KOLOM_WARUNG}
       FROM warung w LEFT JOIN bayar b ON b.warung_id = w.id LEFT JOIN sales s ON s.id = w.sales_id
       WHERE ${tanpa ? 'w.sales_id IS NULL' : 'w.sales_id = $1'}
       ORDER BY b.terakhir DESC NULLS LAST, w.created_at DESC LIMIT 500`,
      tanpa ? [] : [req.params.id]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// Cari warung (nama / username / nomor HP) - buat nempelin sales ke warung yang lupa ngisi kode pas daftar.
router.get('/warung', async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 60) : '';
    if (q.length < 2) return res.json([]);
    const pola = '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
    const hp = normalisasiNoHp(q);
    const { rows } = await query(
      `WITH ${CTE_BAYAR}
       SELECT ${KOLOM_WARUNG}
       FROM warung w LEFT JOIN bayar b ON b.warung_id = w.id LEFT JOIN sales s ON s.id = w.sales_id
       WHERE w.nama ILIKE $1 OR w.username ILIKE $1 OR ($2::text IS NOT NULL AND w.no_hp = $2)
       ORDER BY w.created_at DESC LIMIT 20`,
      [pola, hp || null]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// Pasang / ganti / lepas sales sebuah warung. { kode: 'BUDI' } atau { kode: null } buat dilepas.
router.put('/warung/:id/sales', async (req, res, next) => {
  try {
    if (!POLA_UUID.test(req.params.id)) return res.status(404).json({ error: 'Warung tidak ditemukan' });
    let salesId = null;
    if (req.body.kode) {
      const { rows } = await query('SELECT id FROM sales WHERE kode=$1', [rapikanKodeSales(req.body.kode)]);
      if (!rows.length) return res.status(400).json({ error: 'Kode sales nggak dikenal' });
      salesId = rows[0].id;
    }
    const { rows: w } = await query('UPDATE warung SET sales_id=$2 WHERE id=$1 RETURNING username', [req.params.id, salesId]);
    if (!w.length) return res.status(404).json({ error: 'Warung tidak ditemukan' });
    await catatLog(req, 'warung-pintar.warung.ganti_sales', { username: w[0].username, sales: req.body.kode || null });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
