import pg from 'pg';

// Database MANAJEMEN sendiri (akun admin & catatan aktivitas) - terpisah dari database produk. Boleh diarahin ke database
// yang sama kayak produk (tabelnya pakai awalan mj_), defaultnya ikut WARUNG_PINTAR_DATABASE_URL biar nggak wajib bikin
// database baru.
const url = process.env.MANAJEMEN_DATABASE_URL || process.env.WARUNG_PINTAR_DATABASE_URL;
export const pool = url ? new pg.Pool({ connectionString: url }) : null;
pool?.on('error', (err) => console.error('[manajemen] koneksi database error:', err.message));

export const query = (text, params) => {
  if (!pool) throw Object.assign(new Error('MANAJEMEN_DATABASE_URL belum diisi di .env'), { status: 503 });
  return pool.query(text, params);
};

let siap = null;
export function pastikanTabel() {
  if (!siap) {
    siap = (async () => {
      await query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
      await query(`CREATE TABLE IF NOT EXISTS mj_admin (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username TEXT UNIQUE NOT NULL,
        nama TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        aktif BOOLEAN NOT NULL DEFAULT true,
        -- Naik tiap password diganti/akun dinonaktifkan: token login lama otomatis nggak berlaku.
        versi_sesi INT NOT NULL DEFAULT 1,
        terakhir_masuk TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT now()
      )`);
      await query(`CREATE TABLE IF NOT EXISTS mj_log (
        id BIGSERIAL PRIMARY KEY,
        admin_id UUID REFERENCES mj_admin(id) ON DELETE SET NULL,
        admin_nama TEXT,
        aksi TEXT NOT NULL,
        detail JSONB,
        created_at TIMESTAMPTZ DEFAULT now()
      )`);
      await query('CREATE INDEX IF NOT EXISTS idx_mj_log_waktu ON mj_log (created_at DESC)');
      // Peran akun: admin (semua halaman) atau sales (cuma halaman Sales Lapangan + profilnya sendiri).
      await query("ALTER TABLE mj_admin ADD COLUMN IF NOT EXISTS peran TEXT NOT NULL DEFAULT 'admin'");
    })().catch((e) => {
      siap = null;
      throw e;
    });
  }
  return siap;
}

// Catat siapa ngapain (tambah sales, bikin akun demo, dst). Gagal nyatet nggak boleh bikin aksinya ikut gagal.
export async function catatLog(req, aksi, detail = null) {
  try {
    await query('INSERT INTO mj_log (admin_id, admin_nama, aksi, detail) VALUES ($1,$2,$3,$4)', [
      req.admin?.id || null,
      req.admin?.nama || null,
      aksi,
      detail ? JSON.stringify(detail) : null,
    ]);
  } catch (e) {
    console.warn('[manajemen] gagal nyatet log:', e.message);
  }
}
