import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

router.get('/riwayat', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM riwayat_jaga WHERE warung_id=$1 ORDER BY waktu DESC LIMIT 50', [req.warungId]);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// Serah Terima Jaga 1-Tap (PRD 10.5): generate ringkasan uang laci vs penjualan tunai (deteksi
// selisih otomatis), total transaksi, stok yang habis, dan utang baru — semua dalam satu tap.
router.post('/serah-terima', async (req, res, next) => {
  try {
    const { dari, ke, uangLaci } = req.body;
    if (!ke || uangLaci == null) return res.status(400).json({ error: 'ke dan uangLaci wajib diisi' });

    const awalHariIni = new Date();
    awalHariIni.setHours(0, 0, 0, 0);

    const { rows: trxHariIni } = await query('SELECT * FROM transaksi WHERE warung_id=$1 AND waktu >= $2', [
      req.warungId,
      awalHariIni.toISOString(),
    ]);
    const penjualanTunai = trxHariIni
      .filter((t) => t.mode === 'bayar' && (t.metode || 'Tunai') === 'Tunai')
      .reduce((a, t) => a + Number(t.total), 0);
    const selisih = Number(uangLaci) - penjualanTunai;

    const { rows: stokHabis } = await query(
      `SELECT nama, stok FROM produk
       WHERE warung_id=$1 AND aktif AND stok <= GREATEST(1, FLOOR(laku_per_hari * 0.2))
       ORDER BY stok ASC LIMIT 20`,
      [req.warungId]
    );
    const { rows: utangBaru } = await query(
      'SELECT nama, jumlah FROM kasbon WHERE warung_id=$1 AND NOT lunas AND dibuat_pada >= $2',
      [req.warungId, awalHariIni.toISOString()]
    );

    const { rows } = await query(
      `INSERT INTO riwayat_jaga (warung_id, dari, ke, uang_laci, penjualan_tunai, selisih, total_transaksi, stok_habis, utang_baru)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.warungId, dari || null, ke, uangLaci, penjualanTunai, selisih, trxHariIni.length, JSON.stringify(stokHabis), JSON.stringify(utangBaru)]
    );

    await query('UPDATE penjaga SET aktif=false WHERE warung_id=$1', [req.warungId]);
    await query('UPDATE penjaga SET aktif=true WHERE warung_id=$1 AND nama=$2', [req.warungId, ke]);

    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

export default router;
