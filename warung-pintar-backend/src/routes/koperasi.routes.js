import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// Belanja Bareng — Koperasi Digital (PRD 10.6, Fase 2). Ini fondasi CRUD-nya saja: bikin grup,
// warung join & pesan, lihat rekap kuota. Logika "generate PO ke supplier otomatis begitu kuota
// tercapai" belum diimplementasi — itu butuh integrasi supplier nyata yang belum ada datanya.
router.get('/grup', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM koperasi_grup ORDER BY created_at DESC LIMIT 50');
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.post('/grup', async (req, res, next) => {
  try {
    const { nama, lokasi, lat, lon } = req.body;
    if (!nama) return res.status(400).json({ error: 'nama wajib diisi' });
    const { rows } = await query('INSERT INTO koperasi_grup (nama, lokasi, lat, lon, dibuat_oleh) VALUES ($1,$2,$3,$4,$5) RETURNING *', [
      nama,
      lokasi || null,
      lat || null,
      lon || null,
      req.warungId,
    ]);
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.post('/grup/:id/pesan', async (req, res, next) => {
  try {
    const { namaBarang, qty } = req.body;
    if (!namaBarang || !qty) return res.status(400).json({ error: 'namaBarang dan qty wajib diisi' });
    const { rows } = await query('INSERT INTO koperasi_pesanan (grup_id, warung_id, nama_barang, qty) VALUES ($1,$2,$3,$4) RETURNING *', [
      req.params.id,
      req.warungId,
      namaBarang,
      qty,
    ]);
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.get('/grup/:id/rekap', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT nama_barang, SUM(qty) AS total_qty, COUNT(DISTINCT warung_id) AS jumlah_warung
       FROM koperasi_pesanan WHERE grup_id=$1 GROUP BY nama_barang ORDER BY total_qty DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

export default router;
