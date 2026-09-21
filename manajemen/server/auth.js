import crypto from 'crypto';
import rateLimit from 'express-rate-limit';

// Semua /api manajemen dikunci ADMIN_KEY (header X-Admin-Key). Kosong / kependekan = API mati total.
// Salah kunci dibatasi (yang bener nggak dihitung) - biar kuncinya nggak bisa ditebak pakai script.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak percobaan kunci. Coba lagi 15 menit lagi.' },
});

const hash = (s) => crypto.createHash('sha256').update(String(s)).digest();

function cekKunci(req, res, next) {
  const kunci = process.env.ADMIN_KEY || '';
  if (kunci.length < 16) return res.status(503).json({ error: 'Manajemen belum diaktifkan (isi ADMIN_KEY minimal 16 karakter di .env).' });
  // Dibandingin lewat hash + timingSafeEqual: panjangnya selalu sama & waktunya nggak bocorin isi kunci.
  if (!crypto.timingSafeEqual(hash(req.get('x-admin-key') || ''), hash(kunci))) {
    return res.status(401).json({ error: 'Kunci salah' });
  }
  next();
}

export const requireAdmin = [limiter, cekKunci];
