import { query } from '../db.js';

// Akun DEMO: akun contoh yang dipinjemin ke sales buat presentasi. Password-nya dibagi ke banyak orang, jadi semua yang
// bisa "ngunci" akun (ganti kata sandi, nomor HP, PIN, lupa password) ditolak - kalau nggak, satu sales iseng/salah
// pencet bikin sales lain nggak bisa masuk. Lisensinya juga nggak pernah habis & nggak bisa langganan.
// Dibikin/ditandai dari aplikasi manajemen (manajemen/), bukan dari aplikasi warung ini.
let kolomSiap = null;
export function pastikanKolomDemo() {
  if (!kolomSiap) {
    kolomSiap = query('ALTER TABLE warung ADD COLUMN IF NOT EXISTS demo BOOLEAN NOT NULL DEFAULT false').catch((e) => {
      kolomSiap = null;
      throw e;
    });
  }
  return kolomSiap;
}

export async function akunDemo(warungId) {
  await pastikanKolomDemo();
  const { rows } = await query('SELECT demo FROM warung WHERE id=$1', [warungId]);
  return !!rows[0]?.demo;
}

export const PESAN_DEMO = 'Ini akun demo - kata sandi, nomor HP & PIN nggak bisa diubah. Hubungi admin kalau perlu.';

// Middleware: pasang SETELAH requireAuth di rute yang nggak boleh dipakai akun demo.
export async function tolakAkunDemo(req, res, next) {
  try {
    if (await akunDemo(req.warungId)) return res.status(403).json({ error: PESAN_DEMO, akunDemo: true });
    next();
  } catch (e) {
    next(e);
  }
}
