import 'dotenv/config';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { pastikanTabel, pool, query } from './db.js';
import { cekPassword, rapikanUsername } from './auth.js';

// Bikin akun admin manajemen dari terminal (tanpa lewat layar "Buat admin pertama"), atau reset password-nya kalau
// username-nya udah ada - jalan pulih kalau semua admin lupa password.
//   npm run buat-admin -- <username> "<Nama>" [password]
// Password dikosongin = dibikinin acak & ditampilin sekali di terminal.
const [usernameMentah, namaMentah, passwordMentah] = process.argv.slice(2);
const username = rapikanUsername(usernameMentah);
const nama = (namaMentah || '').trim().slice(0, 60);
if (!username || !nama) {
  console.error('Pakai: npm run buat-admin -- <username> "<Nama>" [password]\nUsername 3-30 huruf kecil/angka (boleh . _ -).');
  process.exit(1);
}
const password = passwordMentah || crypto.randomBytes(9).toString('base64url');
const salah = cekPassword(password);
if (salah) {
  console.error(salah);
  process.exit(1);
}

try {
  await pastikanTabel();
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await query(
    `INSERT INTO mj_admin (username, nama, password_hash) VALUES ($1,$2,$3)
     ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, aktif = true, versi_sesi = mj_admin.versi_sesi + 1
     RETURNING (xmax = 0) AS baru`,
    [username, nama, hash]
  );
  await query("INSERT INTO mj_log (admin_nama, aksi, detail) VALUES ('(terminal)', $1, $2)", [
    rows[0].baru ? 'admin.tambah' : 'admin.reset_password',
    JSON.stringify({ username }),
  ]);
  console.log(`${rows[0].baru ? 'Admin dibuat' : 'Password admin direset'}:\n  username: ${username}\n  password: ${password}`);
} catch (e) {
  console.error('Gagal:', e.message);
  process.exitCode = 1;
} finally {
  await pool?.end();
}
