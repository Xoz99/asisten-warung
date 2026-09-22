import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { Router } from 'express';
import { catatLog, pastikanTabel, query } from './db.js';

// Login manajemen: tiap admin (pemilik, temen, dst) punya akun sendiri - username + password. Dulu satu kunci bareng
// (ADMIN_KEY) dipakai rame-rame: nggak ketauan siapa ngapain, dan kalau satu orang keluar kuncinya harus diganti semua.
// ADMIN_KEY sekarang cuma dipakai SEKALI: bikin admin pertama.
const RAHASIA = () => process.env.MANAJEMEN_JWT_SECRET || '';
const SESI_JAM = 12;
// "Ingat saya": sesi 30 hari. Tetap putus kalau password diganti / akun dinonaktifin / peran diubah (versi_sesi naik).
const SESI_INGAT_HARI = 30;
const POLA_USERNAME = /^[a-z0-9._-]{3,30}$/;
const HASH_PALSU = bcrypt.hashSync('bukan-password-siapa-siapa', 10);

const masukLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak percobaan masuk. Coba lagi 15 menit lagi.' },
});

const hash = (s) => crypto.createHash('sha256').update(String(s)).digest();
const samaAman = (a, b) => crypto.timingSafeEqual(hash(a), hash(b));
const adminPublik = (a) => ({ id: a.id, username: a.username, nama: a.nama, peran: a.peran || 'admin' });
const buatToken = (a, ingat = false) =>
  jwt.sign({ adminId: a.id, v: a.versi_sesi }, RAHASIA(), { expiresIn: ingat ? `${SESI_INGAT_HARI}d` : `${SESI_JAM}h` });

export function cekPassword(p) {
  return typeof p === 'string' && p.length >= 8 ? null : 'Password minimal 8 karakter';
}
export function rapikanUsername(u) {
  const x = typeof u === 'string' ? u.trim().toLowerCase() : '';
  return POLA_USERNAME.test(x) ? x : null;
}

function cekKonfigurasi(res) {
  if (RAHASIA().length < 16) {
    res.status(503).json({ error: 'Manajemen belum disetel: isi MANAJEMEN_JWT_SECRET (minimal 16 karakter) di .env.' });
    return false;
  }
  return true;
}

export const authRouter = Router();

authRouter.get('/status', async (req, res, next) => {
  try {
    if (!cekKonfigurasi(res)) return;
    await pastikanTabel();
    const { rows } = await query('SELECT count(*)::int AS n FROM mj_admin');
    res.json({ perluSetup: rows[0].n === 0 });
  } catch (e) {
    next(e);
  }
});

// Admin pertama - cuma bisa selama BELUM ada admin sama sekali, pakai ADMIN_KEY dari .env.
authRouter.post('/setup', masukLimiter, async (req, res, next) => {
  try {
    if (!cekKonfigurasi(res)) return;
    const kunci = process.env.ADMIN_KEY || '';
    if (kunci.length < 16) return res.status(503).json({ error: 'Isi ADMIN_KEY (minimal 16 karakter) di .env buat bikin admin pertama.' });
    if (!samaAman(req.body.kunciSetup || '', kunci)) return res.status(401).json({ error: 'Kunci setup salah' });
    const username = rapikanUsername(req.body.username);
    const nama = typeof req.body.nama === 'string' ? req.body.nama.trim().slice(0, 60) : '';
    if (!username) return res.status(400).json({ error: 'Username 3-30 huruf kecil/angka (boleh . _ -)' });
    if (!nama) return res.status(400).json({ error: 'Nama wajib diisi' });
    const salah = cekPassword(req.body.password);
    if (salah) return res.status(400).json({ error: salah });
    await pastikanTabel();
    // Dicek & dimasukin dalam satu perintah: dua orang yang setup barengan nggak bisa sama-sama jadi admin pertama.
    const { rows } = await query(
      `INSERT INTO mj_admin (username, nama, password_hash)
       SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM mj_admin) RETURNING *`,
      [username, nama, await bcrypt.hash(req.body.password, 10)]
    );
    if (!rows.length) return res.status(409).json({ error: 'Admin pertama udah dibikin. Masuk pakai akunmu.' });
    req.admin = rows[0];
    await catatLog(req, 'admin.setup', { username });
    res.status(201).json({ token: buatToken(rows[0]), admin: adminPublik(rows[0]) });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/masuk', masukLimiter, async (req, res, next) => {
  try {
    if (!cekKonfigurasi(res)) return;
    await pastikanTabel();
    const username = typeof req.body.username === 'string' ? req.body.username.trim().toLowerCase() : '';
    const { rows } = await query('SELECT * FROM mj_admin WHERE username=$1', [username]);
    const a = rows[0];
    // bcrypt tetap dijalanin walau username nggak ada - biar lama jawabnya sama & nggak bocorin username mana yang ada.
    const cocok = await bcrypt.compare(String(req.body.password || ''), a?.password_hash || HASH_PALSU);
    if (!a || !cocok) return res.status(401).json({ error: 'Username atau password salah' });
    if (!a.aktif) return res.status(403).json({ error: 'Akun admin ini udah dinonaktifkan' });
    await query('UPDATE mj_admin SET terakhir_masuk=now() WHERE id=$1', [a.id]);
    const ingat = req.body.ingat === true;
    res.json({ token: buatToken(a, ingat), admin: adminPublik(a), ingat });
  } catch (e) {
    next(e);
  }
});

// Semua /api selain /api/auth/* wajib login.
const RUTE_SALES = /^\/(lapangan(\/|$)|saya(\/(password|aktivitas))?$)/;

export async function requireAdmin(req, res, next) {
  try {
    if (!cekKonfigurasi(res)) return;
    const h = req.get('authorization') || '';
    let p;
    try {
      p = jwt.verify(h.startsWith('Bearer ') ? h.slice(7) : '', RAHASIA());
    } catch {
      return res.status(401).json({ error: 'Sesi habis, masuk lagi ya' });
    }
    await pastikanTabel();
    const { rows } = await query('SELECT * FROM mj_admin WHERE id=$1', [p.adminId]);
    const a = rows[0];
    if (!a || !a.aktif || a.versi_sesi !== p.v) return res.status(401).json({ error: 'Sesi udah nggak berlaku, masuk lagi ya' });
    // Akun sales cuma boleh ke halaman Sales Lapangan & profilnya sendiri. Dikunci di sini (daftar yang BOLEH), jadi
    // rute baru yang ditambah nanti otomatis tertutup buat sales.
    if (a.peran === 'sales' && !RUTE_SALES.test(req.path)) {
      return res.status(403).json({ error: 'Akun sales cuma bisa buka halaman Sales Lapangan' });
    }
    req.admin = a;
    next();
  } catch (e) {
    next(e);
  }
}
