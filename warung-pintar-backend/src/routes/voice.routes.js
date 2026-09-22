import { aiLimiter } from '../middleware/rateLimit.js';
import { Router } from 'express';
import { query } from '../db.js';
import { parseUcapan } from '../services/voice.service.js';
import { parseUcapanGemini } from '../services/gemini.service.js';
import { parseUcapanOpenRouter } from '../services/openrouter.service.js';
import { cobaGeminiLaluOpenRouter } from '../utils/aiFallback.js';

const router = Router();

// Transkrip suara sudah dihasilkan Web Speech API di browser (Voice-First, fitur #2).
// Endpoint ini cuma nyocokkin kata ke katalog barang + baca angka Indonesia jadi qty.
router.post('/parse', async (req, res, next) => {
  try {
    const { transkrip } = req.body;
    if (!transkrip) return res.status(400).json({ error: 'transkrip wajib diisi' });
    const { rows: produk } = await query('SELECT id, nama, harga, stok FROM produk WHERE warung_id=$1 AND aktif', [req.warungId]);
    const items = parseUcapan(produk, transkrip);
    res.json({ transkrip, items });
  } catch (e) {
    next(e);
  }
});

// Cadangan buat "Sebut barang" - dipanggil OTOMATIS dari Catat.jsx (SheetVoice > proses()) pas
// parseUcapan CLIENT-SIDE (lib/voice.js - itu yang beneran dipakai UI, BUKAN endpoint /parse di
// atas) sama sekali nggak nemu apa-apa dari transkrip. Lihat komentar lengkap soal kenapa di
// parseUcapanGemini (gemini.service.js). Balikin bentuk [{qty, produk}] (bukan {id,qty} mentah)
// biar konsisten sama /scan/visual-ai-banyak - frontend nggak perlu nge-lookup ulang detail produk.
router.post('/parse-ai', aiLimiter, async (req, res, next) => {
  try {
    const { transkrip } = req.body;
    if (!transkrip) return res.status(400).json({ error: 'transkrip wajib diisi' });
    const { rows } = await query(
      'SELECT id, nama, harga, modal, stok, foto_url, satuan, isi_kemasan, nama_kemasan, grup FROM produk WHERE warung_id=$1 AND aktif',
      [req.warungId]
    );
    if (!rows.length) return res.json([]);
    const terdeteksi = await cobaGeminiLaluOpenRouter(
      () => parseUcapanGemini({ transkrip, produkList: rows, warungId: req.warungId }),
      () => parseUcapanOpenRouter({ transkrip, produkList: rows, warungId: req.warungId }),
      'voice/parse-ai'
    );
    const hasil = terdeteksi
      .map(({ id, qty }) => {
        const p = rows.find((r) => r.id === id);
        if (!p) return null;
        return {
          qty,
          produk: {
            id: p.id,
            nama: p.nama,
            harga: Number(p.harga),
            modal: Number(p.modal),
            stok: p.stok,
            fotoUrl: p.foto_url,
            satuan: p.satuan || 'pcs',
            isiKemasan: Number(p.isi_kemasan) || 1,
            namaKemasan: p.nama_kemasan || null,
            grup: p.grup || null,
          },
        };
      })
      .filter(Boolean);
    res.json(hasil);
  } catch (e) {
    next(e);
  }
});

export default router;
