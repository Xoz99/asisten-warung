import { aiLimiter } from '../middleware/rateLimit.js';
import { Router } from 'express';
import { transkripSuaraGemini } from '../services/gemini.service.js';

const router = Router();

// Rekaman suara -> teks. Jalur cadangan buat perangkat yang SpeechRecognition-nya diblokir,
// terutama iPhone yang aplikasinya dibuka dari ikon layar HP (lihat lib/rekam.js di frontend).
//
// Nggak dikasih fallback ke OpenRouter kayak jalur AI yang lain: model teks gratis di sana nggak
// nerima audio sama sekali, jadi "cadangan" di situ cuma bakal ngasih error yang lebih
// membingungkan. Kalau Gemini-nya lagi mati, yang bener ya nyuruh user ngetik manual.
router.post('/transkrip', aiLimiter, async (req, res, next) => {
  try {
    const { audio } = req.body;
    if (!audio) return res.status(400).json({ error: 'audio wajib diisi' });
    const teks = await transkripSuaraGemini(audio, req.warungId);
    res.json({ teks });
  } catch (e) {
    // 402 (jatah AI habis) & 400/413 (kiriman user yang emang salah) diteruskan apa adanya -
    // itu pesan yang emang buat user & ada tindak lanjutnya. Sisanya ("API key not valid",
    // "timeout") bahasa developer: diganti pesan yang ngasih jalan keluar, sebabnya ke log.
    if (e.status === 402 || e.status === 400 || e.status === 413) return next(e);
    console.warn('[suara/transkrip] gagal:', e.message);
    return next(
      Object.assign(new Error('Suaranya lagi nggak bisa dibaca. Ketik manual dulu ya.'), { status: 503 })
    );
  }
});

export default router;
