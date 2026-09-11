import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// Pintu Cuaca (PRD 10.8, Fase 2). Pakai Open-Meteo (API cuaca gratis, tanpa API key) sebagai
// pengganti BMKG buat prototipe. Rekomendasinya rule-based sederhana, BUKAN model ML terlatih —
// itu memang niat "prediksi sederhana" di PRD, bukan yang canggih.
router.get('/prediksi-belanja', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT lat, lon FROM warung WHERE id=$1', [req.warungId]);
    const w = rows[0];
    const lat = req.query.lat || w?.lat || -6.2; // default Jakarta kalau lokasi warung belum diisi
    const lon = req.query.lon || w?.lon || 106.8;

    const resp = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=precipitation_probability_max&timezone=Asia%2FJakarta&forecast_days=3`
    );
    if (!resp.ok) throw Object.assign(new Error('Gagal mengambil data cuaca dari Open-Meteo'), { status: 502 });
    const cuaca = await resp.json();
    const besok = cuaca.daily?.precipitation_probability_max?.[1] ?? 0;

    const rekomendasi = [];
    if (besok >= 60) {
      rekomendasi.push({ kategori: 'mie instan', catatan: `Peluang hujan ${besok}% besok — penjualan mie instan biasanya naik` });
      rekomendasi.push({ kategori: 'telur', catatan: 'Cenderung ikut naik bareng mie instan pas hujan' });
    }
    res.json({ cuaca: cuaca.daily, rekomendasi, catatan: 'Prediksi rule-based sederhana, bukan model ML terlatih' });
  } catch (e) {
    next(e);
  }
});

export default router;
