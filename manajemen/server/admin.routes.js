import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { catatLog, query } from './db.js';
import { cekPassword, rapikanUsername } from './auth.js';

// Kelola akun admin manajemen + lihat catatan aktivitas. Semua admin setara (belum ada peran-peranan).
const router = Router();
const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/saya', (req, res) => res.json({ id: req.admin.id, username: req.admin.username, nama: req.admin.nama }));

router.get('/admin', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id, username, nama, aktif, terakhir_masuk, created_at FROM mj_admin ORDER BY created_at');
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.post('/admin', async (req, res, next) => {
  try {
    const username = rapikanUsername(req.body.username);
    const nama = typeof req.body.nama === 'string' ? req.body.nama.trim().slice(0, 60) : '';
    if (!username) return res.status(400).json({ error: 'Username 3-30 huruf kecil/angka (boleh . _ -)' });
    if (!nama) return res.status(400).json({ error: 'Nama wajib diisi' });
    const salah = cekPassword(req.body.password);
    if (salah) return res.status(400).json({ error: salah });
    const { rows } = await query(
      'INSERT INTO mj_admin (username, nama, password_hash) VALUES ($1,$2,$3) ON CONFLICT (username) DO NOTHING RETURNING id, username, nama, aktif, created_at',
      [username, nama, await bcrypt.hash(req.body.password, 10)]
    );
    if (!rows.length) return res.status(409).json({ error: `Username ${username} udah dipakai` });
    await catatLog(req, 'admin.tambah', { username, nama });
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

// Nonaktifin/aktifin admin lain, atau reset password-nya. Dua-duanya bikin sesi lama orang itu langsung putus.
router.patch('/admin/:id', async (req, res, next) => {
  try {
    if (!POLA_UUID.test(req.params.id)) return res.status(404).json({ error: 'Admin tidak ditemukan' });
    const { aktif, password } = req.body;
    if (aktif === false && req.params.id === req.admin.id) return res.status(400).json({ error: 'Nggak bisa nonaktifin akun sendiri' });
    if (password !== undefined) {
      const salah = cekPassword(password);
      if (salah) return res.status(400).json({ error: salah });
    }
    const { rows } = await query(
      `UPDATE mj_admin SET aktif = COALESCE($2, aktif),
         password_hash = COALESCE($3, password_hash),
         versi_sesi = versi_sesi + 1
       WHERE id=$1 RETURNING id, username, nama, aktif`,
      [req.params.id, typeof aktif === 'boolean' ? aktif : null, password !== undefined ? await bcrypt.hash(password, 10) : null]
    );
    if (!rows.length) return res.status(404).json({ error: 'Admin tidak ditemukan' });
    await catatLog(req, password !== undefined ? 'admin.reset_password' : aktif ? 'admin.aktifkan' : 'admin.nonaktifkan', { username: rows[0].username });
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.post('/saya/password', async (req, res, next) => {
  try {
    const { passwordLama, passwordBaru } = req.body;
    if (!(await bcrypt.compare(String(passwordLama || ''), req.admin.password_hash))) return res.status(401).json({ error: 'Password lama salah' });
    const salah = cekPassword(passwordBaru);
    if (salah) return res.status(400).json({ error: salah });
    await query('UPDATE mj_admin SET password_hash=$2, versi_sesi = versi_sesi + 1 WHERE id=$1', [req.admin.id, await bcrypt.hash(passwordBaru, 10)]);
    await catatLog(req, 'admin.ganti_password_sendiri', { username: req.admin.username });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get('/log', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id, admin_nama, aksi, detail, created_at FROM mj_log ORDER BY created_at DESC LIMIT 200');
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

export default router;
