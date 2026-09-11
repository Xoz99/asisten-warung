import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT p.*, COALESCE(SUM(k.jumlah) FILTER (WHERE NOT k.lunas), 0) AS total_utang,
              EXISTS (SELECT 1 FROM pelanggan_wajah w WHERE w.pelanggan_id = p.id) AS punya_wajah
       FROM pelanggan p LEFT JOIN kasbon k ON k.pelanggan_id = p.id
       WHERE p.warung_id = $1
       GROUP BY p.id ORDER BY p.nama`,
      [req.warungId]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { nama, wa, alamat, fotoUrl } = req.body;
    if (!nama) return res.status(400).json({ error: 'nama wajib diisi' });
    const { rows } = await query(
      'INSERT INTO pelanggan (warung_id, nama, wa, alamat, foto_url) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.warungId, nama, wa || null, alamat || null, fotoUrl || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

export default router;
