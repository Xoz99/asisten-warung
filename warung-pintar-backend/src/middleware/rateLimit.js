import { JWT_SECRET } from '../config/jwt.js';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { normalisasiNoHp } from '../utils/noHp.js';

// Batas percobaan login/register/ganti-password - biar nggak bisa di-brute-force nebak
// password/username terus-terusan. Dihitung per-IP, window 15 menit.
// standardHeaders/legacyHeaders: cukup satu (RateLimit-*), nggak usah dobel sama X-RateLimit-*.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.' },
});

// Batas endpoint OTP (/otp/kirim, /otp/verifikasi, /reset-password, /pin/otp/*).
// Taruhannya beda dari login biasa: tiap kirim itu pesan WA BERBAYAR ke nomor orang, jadi kalau
// dibiarkan bisa dipakai ngabisin saldo gateway sekaligus nge-spam korban ("WA bombing").
//
// Dibatasi TIGA lapis, masing-masing nutup celah yang beda:
//
// 1. Per AKUN yang sudah pasti — ADA DI TEMPAT LAIN: buatDanKirimOtp() di auth.routes.js, dihitung
//    dari tabel kode_otp pakai warung.id. Itu lapis yang paling menentukan, dan sengaja BUKAN di
//    sini: middleware cuma kenal apa yang diketik pemohon, dan satu akun bisa dipanggil pakai
//    username ATAU nomor HP — dua-duanya jadi kunci beda di sini, jadi kalau cuma ngandelin
//    middleware, orang tinggal selang-seling buat dapat jatah dobel ke nomor korban yang sama.
// 2. Per IDENTITAS yang diketik (otpLimiter di bawah) — lapis murah di depan, kena SEBELUM nyentuh
//    database. Ini yang nahan tebak-tebakan kode di /otp/verifikasi (batas per-kode sudah ada di
//    auth.routes.js, ini lapis keduanya) dan nahan banjir request ke akun yang nggak ada sama
//    sekali — yang nggak akan pernah sampai ke lapis 1 karena akunnya nggak ketemu.
// 3. Per IP (otpIpLimiter) — longgar, cuma buat nahan satu host yang nyerang massal ke banyak akun.
//
// CATATAN soal IP: lapis 3 ngandelin req.ip, yang baru bener kalau `trust proxy` di index.js diset
// sesuai jumlah proxy di depan (ngrok/nginx/Cloudflare). Kalau salah setel, semua user kebaca satu
// IP. Makanya batas per-IP dibikin LONGGAR: mayoritas pemilik warung online lewat data seluler
// Indonesia yang ber-CGNAT (ribuan pelanggan keluar lewat segelintir IP yang sama), jadi batas
// per-IP yang ketat bakal ngeblokir orang yang nggak ngapa-ngapain. Pengetatan yang beneran
// ngegigit ditaruh di lapis 1 & 2 yang nggak kena efek CGNAT.

// Ambil identitas pemohon: warungId dari token kalau sudah login (alur ganti PIN), atau
// username/nomor HP dari body kalau belum (alur lupa password). Nomor HP dinormalkan dulu supaya
// "0812...", "+62812...", dan "62812..." nggak dihitung sebagai tiga jatah yang beda.
function kunciAkun(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    try {
      const p = jwt.verify(header.slice(7), JWT_SECRET);
      if (p.warungId) return 'w:' + p.warungId;
    } catch {
      // token busuk - jatuh ke identitas body/IP di bawah
    }
  }
  const b = req.body || {};
  const hp = normalisasiNoHp(b.noHp);
  if (hp) return 'hp:' + hp;
  if (b.username) return 'u:' + String(b.username).trim().toLowerCase();
  // Nggak ada identitas sama sekali (mis. /reset-password yang cuma bawa token reset) - pakai IP.
  // ipKeyGenerator dipakai, bukan req.ip mentah, biar alamat IPv6 dikelompokin per-subnet
  // (satu pelanggan IPv6 dapat blok alamat, jadi req.ip mentah gampang banget diputer-puter).
  return 'ip:' + ipKeyGenerator(req.ip);
}

export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 6,
  keyGenerator: kunciAkun,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak permintaan kode untuk akun ini. Coba lagi 15 menit lagi.' },
});

export const otpIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak permintaan dari jaringan ini. Coba lagi nanti.' },
});

// Batas nebak PIN pemilik (/api/auth/pin/cek). PIN cuma 4 angka = 10.000 kemungkinan, jadi tanpa batas
// gampang dicoba semua. Dihitung per AKUN (bukan IP - satu HP warung bisa ganti-ganti jaringan), dan cuma
// percobaan SALAH yang dihitung (skipSuccessfulRequests), biar pemilik yang buka detail berkali-kali nggak ikut keblokir.
export const pinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  keyGenerator: kunciAkun,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak PIN salah. Coba lagi 15 menit lagi, atau pakai Lupa PIN.' },
});

export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  keyGenerator: (req) => 'w:' + req.warungId,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak permintaan AI. Coba lagi sebentar.' },
});
