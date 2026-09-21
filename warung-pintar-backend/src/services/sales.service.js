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
