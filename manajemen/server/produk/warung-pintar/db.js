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
      // Atribusi (PRD v0.2 §14, D-42/D-65/D-43): klaim link (?ref=) & kode yang diketik disimpen DUA-DUANYA - kalau
      // beda sales, kode menang tapi klaim link yang kalah tetap kesimpen buat nelusurin sengketa (A-04).
      await query(`CREATE TABLE IF NOT EXISTS atribusi_warung (
        warung_id UUID PRIMARY KEY REFERENCES warung(id) ON DELETE CASCADE,
        sumber TEXT NOT NULL,            -- link | kode | mandiri | lama (sebelum pencatatan ini ada)
        sales_id UUID REFERENCES sales(id) ON DELETE SET NULL,  -- pemenang atribusi
        link_kode TEXT, link_sales_id UUID REFERENCES sales(id) ON DELETE SET NULL,
        kode_ketik TEXT, kode_sales_id UUID REFERENCES sales(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      )`);
      // Kepemilikan sebagai RENTANG WAKTU (PRD §15.1): pemilik sekarang = periode yang valid_to-nya kosong.
      // sales_id NULL = house account (milik Konsulin, D-43/D-48). Riwayat nggak pernah dihapus/ditimpa.
      // warung.sales_id tetap diisi sebagai salinan pemilik sekarang (dipakai query lama) - selalu ditulis bareng.
      await query(`CREATE TABLE IF NOT EXISTS kepemilikan_warung (
        id BIGSERIAL PRIMARY KEY,
        warung_id UUID NOT NULL REFERENCES warung(id) ON DELETE CASCADE,
        sales_id UUID REFERENCES sales(id) ON DELETE SET NULL,
        valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
        valid_to TIMESTAMPTZ,
        alasan TEXT NOT NULL,
        aktor TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      )`);
      // Satu customer nggak boleh punya dua periode kepemilikan aktif (PRD §24.2).
      await query('CREATE UNIQUE INDEX IF NOT EXISTS idx_kepemilikan_aktif ON kepemilikan_warung (warung_id) WHERE valid_to IS NULL');
      await query('CREATE INDEX IF NOT EXISTS idx_kepemilikan_sales ON kepemilikan_warung (sales_id, valid_from)');
      // Warung yang daftar sebelum pencatatan ini ada: satu periode dari tanggal daftar, pemilik = sales yang tercatat.
      await query(`INSERT INTO kepemilikan_warung (warung_id, sales_id, valid_from, alasan, aktor)
        SELECT w.id, w.sales_id, w.created_at, 'Data lama (sebelum riwayat kepemilikan dicatat)', 'sistem'
        FROM warung w WHERE NOT EXISTS (SELECT 1 FROM kepemilikan_warung k WHERE k.warung_id = w.id)`);
      await query(`INSERT INTO atribusi_warung (warung_id, sumber, sales_id, created_at)
        SELECT w.id, 'lama', w.sales_id, w.created_at FROM warung w
        WHERE NOT EXISTS (SELECT 1 FROM atribusi_warung a WHERE a.warung_id = w.id)`);
      // Akun demo buat sales - lihat warung-pintar-backend/src/services/akunDemo.service.js.
      await query('ALTER TABLE warung ADD COLUMN IF NOT EXISTS demo BOOLEAN NOT NULL DEFAULT false');
      await query('ALTER TABLE warung ADD COLUMN IF NOT EXISTS profil_usaha JSONB');
    })().catch((e) => {
      siap = null;
      throw e;
    });
  }
  return siap;
}

export const POLA_KODE_SALES = /^[A-Z0-9]{3,20}$/;
export const rapikanKodeSales = (k) => (typeof k === 'string' ? k.trim().toUpperCase() : '');
