import warungPintarRoutes from './warung-pintar/sales.routes.js';

// Daftar produk Konsulin yang dikelola dari sini. Nambah produk baru = bikin folder produk/<id>/ berisi router-nya,
// terus daftarin di sini. Produk yang database-nya belum diisi di .env nggak ditampilin.
export const PRODUK = [
  {
    id: 'warung-pintar',
    nama: 'Warung Pintar',
    url: (process.env.WARUNG_PINTAR_URL || 'https://asistenwarung.konsulin.com').replace(/\/+$/, ''),
    aktif: !!process.env.WARUNG_PINTAR_DATABASE_URL,
    router: warungPintarRoutes,
  },
];
