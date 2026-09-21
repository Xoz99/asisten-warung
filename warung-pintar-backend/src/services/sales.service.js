import { query } from '../db.js';

// Sales lapangan yang nawarin aplikasi ke warung. Tiap sales punya KODE (mis. BUDI) yang ikut di link
// daftar (/?ref=BUDI) atau diketik manual di form daftar - warung yang daftar pakai kode itu nempel ke
// sales-nya (warung.sales_id), jadi begitu warung itu bayar langganan, ketauan sales siapa yang bawa.
// Daftar sales & rekapnya dikelola dari aplikasi MANAJEMEN Konsulin (folder manajemen/, server & domain terpisah) -
// aplikasi warung ini sengaja nggak punya halaman/API admin sama sekali.
// Tabelnya dibikin otomatis (deploy nggak jalanin migrate), sama kayak tabel-tabel baru lainnya.
let tabelSalesSiap = null;
export function pastikanTabelSales() {
  if (!tabelSalesSiap) {
    tabelSalesSiap = (async () => {
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
    })().catch((e) => {
      tabelSalesSiap = null;
      throw e;
    });
  }
  return tabelSalesSiap;
}

// Kode sales: huruf/angka doang, 3-20 karakter, selalu disimpen HURUF BESAR - biar "budi", "Budi", "BUDI"
// nunjuk ke sales yang sama.
export const POLA_KODE_SALES = /^[A-Z0-9]{3,20}$/;
export const rapikanKodeSales = (k) => (typeof k === 'string' ? k.trim().toUpperCase() : '');

// Sales aktif dengan kode ini, atau null.
export async function cariSalesAktif(kode) {
  const k = rapikanKodeSales(kode);
  if (!POLA_KODE_SALES.test(k)) return null;
  await pastikanTabelSales();
  const { rows } = await query('SELECT id, kode, nama FROM sales WHERE kode=$1 AND aktif', [k]);
  return rows[0] || null;
}
