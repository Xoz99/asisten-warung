import 'dotenv/config';
import pg from 'pg';

// pg.Pool baru benar-benar konek pas query pertama dijalankan, jadi server tetap
// bisa nyala (mis. buat /health) walau DATABASE_URL belum diisi/salah.
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

pool.on('error', (err) => {
  console.error('Koneksi database error (idle client):', err.message);
});

export const query = (text, params) => pool.query(text, params);
