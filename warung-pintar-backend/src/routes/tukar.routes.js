import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// Tukar Tambah Stok (PRD 10.10, Fase 2) — "marketplace" mini barter antar warung.
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query("SELECT * FROM tukar_stok_post WHERE status='terbuka' ORDER BY created_at DESC LIMIT 50");
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { kelebihan, butuh } = req.body;
    if (!kelebihan || !butuh) return res.status(400).json({ error: 'kelebihan dan butuh wajib diisi' });
    const { rows } = await query('INSERT INTO tukar_stok_post (warung_id, kelebihan, butuh) VALUES ($1,$2,$3) RETURNING *', [
      req.warungId,
      kelebihan,
      butuh,
    ]);
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/tutup', async (req, res, next) => {
  try {
    // WAJIB dibatasi ke warung_id sendiri — tanpa ini warung mana pun bisa nutup paksa
    // postingan barter warung LAIN cuma dengan nebak/tau id-nya (broken access control).
    const { rows } = await query("UPDATE tukar_stok_post SET status='selesai' WHERE id=$1 AND warung_id=$2 RETURNING *", [
      req.params.id,
      req.warungId,
    ]);
    if (!rows.length) return res.status(404).json({ error: 'Post tidak ditemukan' });
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

export default router;
