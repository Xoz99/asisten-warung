import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT p.*, COALESCE(SUM(k.jumlah) FILTER (WHERE NOT k.lunas), 0) AS total_utang,
              -- punya_wajah cuma ngitung data model versi 2 (lihat utils/wajah.js). Data lama dipisah biar HP bisa
              -- ngitung ulang otomatis dari foto pelanggannya, tanpa pemilik warung harus foto ulang satu-satu.
              EXISTS (SELECT 1 FROM pelanggan_wajah w WHERE w.pelanggan_id = p.id AND jsonb_typeof(w.embedding) = 'object') AS punya_wajah,
              EXISTS (SELECT 1 FROM pelanggan_wajah w WHERE w.pelanggan_id = p.id AND jsonb_typeof(w.embedding) = 'array') AS punya_wajah_lama
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

// Ganti foto pelanggan yang udah terdaftar. Dulu NGGAK ADA jalannya: foto cuma bisa diisi pas pelanggan
// DIBUAT, jadi foto dari "+ foto wajah" di layar Pelanggan cuma jadi data pengenal wajah & fotonya
// kebuang - pelanggannya tetap tampil inisial di mana-mana (daftar pembeli di Catat, hasil kenal wajah).
router.post('/:id/foto', async (req, res, next) => {
  try {
    const { fotoUrl } = req.body;
    // Formatnya sama kayak foto pas bikin pelanggan (data URL gambar hasil keWebp di HP).
    if (typeof fotoUrl !== 'string' || !fotoUrl.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Foto tidak valid' });
    }
    const { rows } = await query(
      'UPDATE pelanggan SET foto_url=$1 WHERE id=$2 AND warung_id=$3 RETURNING id, nama, foto_url',
      [fotoUrl, req.params.id, req.warungId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

export default router;
