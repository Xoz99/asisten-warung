// Daftar DRAF barang warung yang nggak ada di database terbuka (Open Food/Beauty/Products Facts): rokok dan barang
// curah/tanpa merek. Masuk ke katalog_barang sebagai draf (aktif=false) - BELUM tampil ke warung sampai tim ngecek
// & nyetujuin di Makalin > Katalog barang. Sengaja tanpa barcode & tanpa harga: nggak ada angka yang dikarang,
// barcode diisi tim kalau udah dicek dari kemasan asli. Varian/isi batang rokok juga wajib dicek ulang tim.
//
// Jalanin: npm run draf:katalog   (aman diulang - barang yang udah ada, termasuk yang udah disetujui/diubah, nggak ditimpa)
import { pool, query } from './db.js';
import { kunciBarang, pastikanTabelKatalog } from './services/katalog.service.js';

// [nama, kategori, satuan, merek]
const DRAF = [
  // Rokok - nama varian yang umum di warung. Isi batang di nama ikut nama produknya di pasaran; tetap dicek tim.
  ['Gudang Garam Surya 12', 'rokok', 'bungkus', 'Gudang Garam'],
  ['Gudang Garam Surya 16', 'rokok', 'bungkus', 'Gudang Garam'],
  ['Gudang Garam Surya Pro Mild 16', 'rokok', 'bungkus', 'Gudang Garam'],
  ['Gudang Garam Filter International 12', 'rokok', 'bungkus', 'Gudang Garam'],
  ['Gudang Garam Merah 12', 'rokok', 'bungkus', 'Gudang Garam'],
  ['Sampoerna A Mild 16', 'rokok', 'bungkus', 'Sampoerna'],
  ['Sampoerna Kretek 12', 'rokok', 'bungkus', 'Sampoerna'],
  ['Dji Sam Soe Kretek 12', 'rokok', 'bungkus', 'Sampoerna'],
  ['Dji Sam Soe Magnum Filter 12', 'rokok', 'bungkus', 'Sampoerna'],
  ['Sampoerna U Mild 16', 'rokok', 'bungkus', 'Sampoerna'],
  ['Djarum Super 12', 'rokok', 'bungkus', 'Djarum'],
  ['Djarum Super 16', 'rokok', 'bungkus', 'Djarum'],
  ['Djarum 76 12', 'rokok', 'bungkus', 'Djarum'],
  ['LA Lights 16', 'rokok', 'bungkus', 'Djarum'],
  ['LA Bold 20', 'rokok', 'bungkus', 'Djarum'],
  ['Marlboro Merah 20', 'rokok', 'bungkus', 'Marlboro'],
  ['Marlboro Filter Black 20', 'rokok', 'bungkus', 'Marlboro'],
  ['Class Mild 16', 'rokok', 'bungkus', 'Nojorono'],
  ['Wismilak Diplomat Mild 16', 'rokok', 'bungkus', 'Wismilak'],
  ['Rokok ketengan (per batang)', 'rokok', 'batang', null],
  // Sembako curah / tanpa merek
  ['Beras curah', 'sembako', 'kg', null],
  ['Gula pasir curah', 'sembako', 'kg', null],
  ['Minyak goreng curah', 'sembako', 'liter', null],
  ['Telur ayam', 'sembako', 'kg', null],
  ['Telur ayam (butir)', 'sembako', 'butir', null],
  ['Tepung terigu curah', 'sembako', 'kg', null],
  ['Bawang merah', 'bumbu', 'kg', null],
  ['Bawang putih', 'bumbu', 'kg', null],
  ['Cabai rawit', 'bumbu', 'kg', null],
  ['Garam dapur', 'bumbu', 'bungkus', null],
  ['Kopi sachet', 'minuman', 'sachet', null],
  ['Es batu', 'minuman', 'bungkus', null],
  ['Air galon isi ulang', 'minuman', 'galon', null],
  // Kebutuhan rumah tangga
  ['Gas elpiji 3 kg (isi ulang)', 'lainnya', 'tabung', null],
  ['Kantong plastik kresek', 'lainnya', 'pak', null],
  ['Korek api gas', 'lainnya', 'pcs', null],
  ['Obat nyamuk bakar', 'kebersihan', 'kotak', null],
  ['Sabun colek', 'kebersihan', 'bungkus', null],
  ['Detergen sachet', 'kebersihan', 'sachet', null],
  ['Sampo sachet', 'kebersihan', 'sachet', null],
  ['Baterai AA', 'lainnya', 'pcs', null],
];

await pastikanTabelKatalog();
let masuk = 0;
for (const [nama, kategori, satuan, merek] of DRAF) {
  const { rowCount } = await query(
    `INSERT INTO katalog_barang (kunci, nama, merek, kategori, satuan, sumber, aktif, draf, diubah_oleh)
     VALUES ($1,$2,$3,$4,$5,'tim',false,true,'Daftar draf bawaan') ON CONFLICT (kunci) DO NOTHING`,
    [kunciBarang({ nama }), nama, merek, kategori, satuan]
  );
  masuk += rowCount;
}
console.log(`${masuk} draf baru masuk (${DRAF.length - masuk} udah ada). Cek & setujui di Makalin > Katalog barang.`);
await pool.end();
