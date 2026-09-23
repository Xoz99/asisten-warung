// Rapikan kategori barang katalog yang udah terlanjur masuk, pakai aturan kategori terbaru (katalog.service.js):
//  - barang yang dari namanya jelas rokok (Sampoerna, Surya, "16'S-BKS", ...) tapi kategorinya lain -> rokok
//    (dulu singkatan SKM dari Lotte kebaca "susu kental manis", jadi A Mild dkk masuk Susu)
//  - barang di "lainnya" ditebak ulang dari namanya
// Barang yang udah dirapiin tim (sumber 'tim') nggak disentuh. Aman diulang.
// Jalanin: npm run rapikan:kategori            -> langsung ubah
//          npm run rapikan:kategori -- --cek   -> cuma lihat apa yang bakal berubah
import { pool, query } from './db.js';
import { kategoriDariTag, pastikanTabelKatalog } from './services/katalog.service.js';

const cek = process.argv.includes('--cek');
await pastikanTabelKatalog();
const { rows } = await query("SELECT id, nama, kategori FROM katalog_barang WHERE sumber <> 'tim'");
const ubah = [];
for (const b of rows) {
  const tebak = kategoriDariTag([], b.nama);
  if (tebak === 'rokok' && b.kategori !== 'rokok') ubah.push({ ...b, baru: 'rokok' });
  else if (b.kategori === 'lainnya' && tebak !== 'lainnya') ubah.push({ ...b, baru: tebak });
}
const rekap = {};
for (const u of ubah) rekap[`${u.kategori} -> ${u.baru}`] = (rekap[`${u.kategori} -> ${u.baru}`] || 0) + 1;
console.log(`${ubah.length} barang ${cek ? 'bakal' : ''} pindah kategori:`, rekap);
for (const u of ubah.filter((x) => x.baru === 'rokok').slice(0, 8)) console.log(`  rokok: ${u.nama} (dulu ${u.kategori})`);
if (!cek) {
  for (const u of ubah) await query('UPDATE katalog_barang SET kategori=$2, updated_at=now() WHERE id=$1', [u.id, u.baru]);
  console.log('Selesai diubah.');
}
await pool.end();
