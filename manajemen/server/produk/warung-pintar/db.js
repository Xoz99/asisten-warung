import pg from 'pg';

// Koneksi ke database Warung Pintar. Manajemen nggak lewat API warung-pintar-backend - langsung ke database-nya,
// jadi aplikasi warung sama sekali nggak perlu punya endpoint admin.
export const pool = process.env.WARUNG_PINTAR_DATABASE_URL ? new pg.Pool({ connectionString: process.env.WARUNG_PINTAR_DATABASE_URL }) : null;
pool?.on('error', (err) => console.error('[warung-pintar] koneksi database error:', err.message));

export const query = (text, params) => pool.query(text, params);

// Tabel sales juga dibikin di warung-pintar-backend (services/sales.service.js). Dua-duanya IF NOT EXISTS, jadi
// siapa pun yang jalan duluan aman.
let siap = null;
export function pastikanTabelSales() {
  if (!siap) {
    siap = (async () => {
      await query(`CREATE TABLE IF NOT EXISTS sales (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        kode TEXT UNIQUE NOT NULL,
        nama TEXT NOT NULL,
        no_hp TEXT,
        aktif BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now()
      )`);
      await query('ALTER TABLE warung ADD COLUMN IF NOT EXISTS sales_id UUID REFERENCES sales(id) ON DELETE SET NULL');
      await query('CREATE INDEX IF NOT EXISTS idx_warung_sales ON warung (sales_id)');
    })().catch((e) => {
      siap = null;
      throw e;
    });
  }
  return siap;
}

export const POLA_KODE_SALES = /^[A-Z0-9]{3,20}$/;
export const rapikanKodeSales = (k) => (typeof k === 'string' ? k.trim().toUpperCase() : '');
