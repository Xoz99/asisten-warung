import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { catatLog } from '../../db.js';
import { query } from './db.js';

// Akun demo Warung Pintar buat sales: nggak bisa ganti kata sandi/nomor HP/PIN, nggak bisa lupa-password, nggak bisa
// langganan, lisensinya nggak pernah habis (semua ditegakin di warung-pintar-backend, lihat akunDemo.service.js).
// Kata sandinya cuma bisa diganti dari sini.
const router = Router();
const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/akun-demo', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT w.id, w.nama, w.username, w.created_at,
              (SELECT MAX(t.waktu) FROM transaksi t WHERE t.warung_id = w.id) AS terakhir_dipakai,
              (SELECT count(*)::int FROM produk p WHERE p.warung_id = w.id AND p.aktif) AS jumlah_barang
       FROM warung w WHERE w.demo ORDER BY w.created_at`
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.post('/akun-demo', async (req, res, next) => {
  try {
    const nama = typeof req.body.nama === 'string' ? req.body.nama.trim().slice(0, 80) : '';
    const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    const { password } = req.body;
    if (!nama || !username) return res.status(400).json({ error: 'Nama warung & username wajib diisi' });
    if (typeof password !== 'string' || password.length < 6) return res.status(400).json({ error: 'Password minimal 6 karakter' });
    const { rows } = await query(
      `INSERT INTO warung (nama, username, password_hash, demo, plan, lisensi_berlaku_sampai)
       VALUES ($1,$2,$3,true,'permanen', now() + interval '100 years')
       ON CONFLICT (username) DO NOTHING RETURNING id, nama, username, created_at`,
      [nama, username, await bcrypt.hash(password, 10)]
    );
    if (!rows.length) return res.status(409).json({ error: `Username ${username} udah dipakai` });
    await catatLog(req, 'warung-pintar.demo.buat', { username, nama });
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

// Tandai akun yang UDAH ADA jadi demo (mis. akun "demo" yang dari dulu dipinjemin ke sales) - atau lepas tanda demonya.
router.post('/akun-demo/tandai', async (req, res, next) => {
  try {
    const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    const demo = req.body.demo !== false;
    const { rows } = await query('UPDATE warung SET demo=$2 WHERE username=$1 RETURNING id, nama, username', [username, demo]);
    if (!rows.length) return res.status(404).json({ error: `Akun dengan username "${username}" nggak ketemu` });
    await catatLog(req, demo ? 'warung-pintar.demo.tandai' : 'warung-pintar.demo.lepas', { username });
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.patch('/akun-demo/:id/password', async (req, res, next) => {
  try {
    if (!POLA_UUID.test(req.params.id)) return res.status(404).json({ error: 'Akun tidak ditemukan' });
    const { password } = req.body;
    if (typeof password !== 'string' || password.length < 6) return res.status(400).json({ error: 'Password minimal 6 karakter' });
    // WHERE demo: halaman ini nggak boleh dipakai ganti password akun warung beneran.
    const { rows } = await query('UPDATE warung SET password_hash=$2 WHERE id=$1 AND demo RETURNING username', [req.params.id, await bcrypt.hash(password, 10)]);
    if (!rows.length) return res.status(404).json({ error: 'Akun demo tidak ditemukan' });
    await catatLog(req, 'warung-pintar.demo.ganti_password', { username: rows[0].username });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
