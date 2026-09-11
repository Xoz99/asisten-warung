import { Router } from 'express';
import { query } from '../db.js';
import { cosineSimilarity } from '../utils/cosine.js';

const router = Router();

// Simpan face descriptor pelanggan (dihitung di client pakai model face detection ringan
// kayak face-api.js/MobileNet, sesuai PRD 10.3 — bukan face recognition universal, cuma buat
// pelanggan langganan yang sudah didaftarkan).
router.post('/pelanggan/:id/wajah', async (req, res, next) => {
  try {
    const { embedding } = req.body;
    if (!Array.isArray(embedding) || !embedding.length) {
      return res.status(400).json({ error: 'embedding wajah wajib diisi (dihitung di client)' });
    }
    const { rows: pRows } = await query('SELECT id FROM pelanggan WHERE id=$1 AND warung_id=$2', [req.params.id, req.warungId]);
    if (!pRows.length) return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });
    const { rows } = await query(
      'INSERT INTO pelanggan_wajah (pelanggan_id, embedding) VALUES ($1,$2) RETURNING id, created_at',
      [req.params.id, JSON.stringify(embedding)]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

// Kasbon Kenal Wajah (PRD 10.3): kamera depan deteksi wajah pelanggan langganan -> munculin
// nama, total utang, dan template belanjaan yang biasa dia beli.
router.post('/identifikasi', async (req, res, next) => {
  try {
    const { embedding } = req.body;
    const threshold = req.body.threshold ?? 0.8;
    if (!Array.isArray(embedding) || !embedding.length) return res.status(400).json({ error: 'embedding wajib diisi' });

    const { rows } = await query(
      `SELECT w.embedding, p.id, p.nama, p.wa
       FROM pelanggan_wajah w JOIN pelanggan p ON p.id = w.pelanggan_id
       WHERE p.warung_id = $1`,
      [req.warungId]
    );
    let terbaik = null;
    let skorTerbaik = 0;
    for (const r of rows) {
      const skor = cosineSimilarity(embedding, r.embedding);
      if (skor > skorTerbaik) {
        skorTerbaik = skor;
        terbaik = r;
      }
    }
    if (!terbaik || skorTerbaik < threshold) return res.json({ cocok: false });

    const { rows: utangRows } = await query('SELECT COALESCE(SUM(jumlah),0) AS total FROM kasbon WHERE pelanggan_id=$1 AND NOT lunas', [
      terbaik.id,
    ]);
    const { rows: templateBelanjaan } = await query(
      `SELECT ti.nama_produk, ti.produk_id, COUNT(*) AS frekuensi, ROUND(AVG(ti.qty)) AS qty_rata
       FROM transaksi_item ti JOIN transaksi t ON t.id = ti.transaksi_id
       WHERE t.pembeli_id = $1
       GROUP BY ti.nama_produk, ti.produk_id
       ORDER BY frekuensi DESC LIMIT 5`,
      [terbaik.id]
    );

    res.json({
      cocok: true,
      skor: skorTerbaik,
      pelanggan: { id: terbaik.id, nama: terbaik.nama, wa: terbaik.wa },
      totalUtang: Number(utangRows[0].total),
      templateBelanjaan,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
