import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id, nama, aktif FROM penjaga WHERE warung_id=$1 ORDER BY created_at', [req.warungId]);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { nama } = req.body;
    if (!nama) return res.status(400).json({ error: 'nama wajib diisi' });
    const { rows } = await query(
      'INSERT INTO penjaga (warung_id, nama) VALUES ($1,$2) RETURNING id, nama, aktif',
      [req.warungId, nama]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

// tandai satu penjaga lagi aktif jaga (dipanggil pas pilih siapa yang jaga / abis serah terima)
router.post('/:id/pilih', async (req, res, next) => {
  try {
    await query('UPDATE penjaga SET aktif=false WHERE warung_id=$1', [req.warungId]);
    const { rows } = await query(
      'UPDATE penjaga SET aktif=true WHERE id=$1 AND warung_id=$2 RETURNING id, nama, aktif',
      [req.params.id, req.warungId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Penjaga tidak ditemukan' });
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.post('/kosongkan', async (req, res, next) => {
  try {
    await query('UPDATE penjaga SET aktif=false WHERE warung_id=$1', [req.warungId]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
