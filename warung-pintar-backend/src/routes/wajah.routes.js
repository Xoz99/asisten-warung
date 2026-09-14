import { Router } from 'express';
import { query } from '../db.js';
import { VERSI_MODEL_WAJAH, cocokkanWajah } from '../utils/wajah.js';

const router = Router();

const embeddingValid = (e) => Array.isArray(e) && e.length === 128 && e.every((x) => typeof x === 'number' && Number.isFinite(x));

// Simpan face descriptor pelanggan (dihitung di client pakai face-api, sesuai PRD 10.3 — bukan face
// recognition universal, cuma buat pelanggan langganan yang sudah didaftarkan).
router.post('/pelanggan/:id/wajah', async (req, res, next) => {
  try {
    const { embedding, versi } = req.body;
    if (!embeddingValid(embedding)) {
      return res.status(400).json({ error: 'embedding wajah wajib diisi (dihitung di client)' });
    }
    // Aplikasi versi lama (masih ke-cache di HP) ngirim descriptor model lama yang nggak bisa dipercaya
    // - ditolak, biar nggak ada data wajah baru yang diem-diem nggak kepakai.
    if (versi !== VERSI_MODEL_WAJAH) {
      return res.status(426).json({ error: 'Aplikasi perlu diperbarui dulu - tutup lalu buka lagi aplikasinya' });
    }
    const { rows: pRows } = await query('SELECT id FROM pelanggan WHERE id=$1 AND warung_id=$2', [req.params.id, req.warungId]);
    if (!pRows.length) return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });
    // Data wajah model lama orang ini dibuang - udah digantiin yang baru.
    await query("DELETE FROM pelanggan_wajah WHERE pelanggan_id=$1 AND jsonb_typeof(embedding) = 'array'", [req.params.id]);
    const { rows } = await query(
      'INSERT INTO pelanggan_wajah (pelanggan_id, embedding) VALUES ($1,$2) RETURNING id, created_at',
      [req.params.id, JSON.stringify({ v: VERSI_MODEL_WAJAH, d: embedding })]
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
    const { embedding, versi } = req.body;
    if (!embeddingValid(embedding)) return res.status(400).json({ error: 'embedding wajib diisi' });
    // Descriptor model lama nggak bisa dibandingin sama data model baru - lebih baik "nggak kenal"
    // daripada nebak orang yang salah.
    if (versi !== VERSI_MODEL_WAJAH) return res.json({ cocok: false, perluUpdate: true });

    const { rows } = await query(
      `SELECT w.embedding, p.id, p.nama, p.wa, p.foto_url
       FROM pelanggan_wajah w JOIN pelanggan p ON p.id = w.pelanggan_id
       WHERE p.warung_id = $1 AND jsonb_typeof(w.embedding) = 'object'`,
      [req.warungId]
    );
    const hasil = cocokkanWajah(embedding, rows);
    if (!hasil) return res.json({ cocok: false });
    const terbaik = hasil.row;

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
      jarak: hasil.jarak,
      // Foto ikut dikirim: dulu nggak, jadi pelanggan yang udah punya foto tetap tampil inisial begitu
      // kekenal lewat wajah (kartu "Ini X?" & chip pembeli di Catat).
      pelanggan: { id: terbaik.id, nama: terbaik.nama, wa: terbaik.wa, foto: terbaik.foto_url || null },
      totalUtang: Number(utangRows[0].total),
      templateBelanjaan,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
