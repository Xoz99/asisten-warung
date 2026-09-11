import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// Langganan Sembako (PRD 10.7, Fase 2). CRUD paket + pendaftaran pelanggan + prediksi pendapatan
// sederhana. Pengiriman reminder WA otomatis belum diimplementasi (butuh akun WhatsApp Business API).
router.get('/paket', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM langganan_paket WHERE warung_id=$1 ORDER BY created_at DESC', [req.warungId]);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.post('/paket', async (req, res, next) => {
  try {
    const { nama, item, harga, periode } = req.body;
    if (!nama || !Array.isArray(item) || !harga) return res.status(400).json({ error: 'nama, item[], harga wajib diisi' });
    const { rows } = await query('INSERT INTO langganan_paket (warung_id, nama, item, harga, periode) VALUES ($1,$2,$3,$4,$5) RETURNING *', [
      req.warungId,
      nama,
      JSON.stringify(item),
      harga,
      periode || 'mingguan',
    ]);
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.post('/paket/:id/langganan', async (req, res, next) => {
  try {
    const { pelangganId } = req.body;
    if (!pelangganId) return res.status(400).json({ error: 'pelangganId wajib diisi' });

    // Wajib divalidasi dua-duanya milik warung yang login — tanpa ini warung A bisa daftarin
    // pelangganId TEBAKAN (milik warung lain) ke paketnya sendiri, atau sebaliknya nyantolin
    // pelanggannya sendiri ke paket_id milik warung lain (data nyasar lintas tenant).
    const { rows: paketRows } = await query('SELECT id FROM langganan_paket WHERE id=$1 AND warung_id=$2', [req.params.id, req.warungId]);
    if (!paketRows.length) return res.status(404).json({ error: 'Paket tidak ditemukan' });
    const { rows: pelangganRows } = await query('SELECT id FROM pelanggan WHERE id=$1 AND warung_id=$2', [pelangganId, req.warungId]);
    if (!pelangganRows.length) return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });

    const { rows } = await query('INSERT INTO langganan_pelanggan (paket_id, pelanggan_id) VALUES ($1,$2) RETURNING *', [
      req.params.id,
      pelangganId,
    ]);
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.get('/prediksi-pendapatan', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT COALESCE(SUM(lp.harga),0) AS total_per_periode, COUNT(*) AS jumlah_langganan
       FROM langganan_pelanggan l JOIN langganan_paket lp ON lp.id = l.paket_id
       WHERE lp.warung_id = $1 AND l.status = 'aktif'`,
      [req.warungId]
    );
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

export default router;
