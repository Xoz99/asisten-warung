// Impor produk yang dijual di Indonesia dari Open Food Facts ke katalog_barang.
// Jalanin: npm run impor:katalog   (aman diulang - barang yang udah ada cuma diperbarui, yang dirapiin tim nggak ditimpa)
//
// Pakai search.openfoodfacts.org (API pencarian resmi mereka), pelan-pelan (1 permintaan / 1,5 detik) biar sopan
// ke server relawan mereka. Data OFF berlisensi ODbL: di app wajib ada keterangan sumber "Open Food Facts".
import { pool } from './db.js';
import { dariOff, pastikanTabelKatalog, simpanDariOff } from './services/katalog.service.js';

const UA = 'AsistenWarung/1.0 (konsulinsupport@gmail.com)';
const FIELDS = 'code,product_name,product_name_id,brands,quantity,categories_tags,image_front_small_url,unique_scans_n';
const PER_HALAMAN = 100;
const tunggu = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function ambil(halaman) {
  const q = encodeURIComponent('countries_tags:"en:indonesia"');
  const url = `https://search.openfoodfacts.org/search?q=${q}&page=${halaman}&page_size=${PER_HALAMAN}&fields=${FIELDS}&sort_by=-unique_scans_n`;
  for (let coba = 1; coba <= 3; coba++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.ok) return await res.json();
      console.warn(`halaman ${halaman}: HTTP ${res.status}, coba lagi...`);
    } catch (e) {
      console.warn(`halaman ${halaman}: ${e.message}, coba lagi...`);
    }
    await tunggu(5000 * coba);
  }
  throw new Error(`Halaman ${halaman} gagal diambil 3x`);
}

await pastikanTabelKatalog();
let halaman = 1;
let total = 0;
let disimpan = 0;
let dilewati = 0;
for (;;) {
  const j = await ambil(halaman);
  const hits = j.hits || [];
  if (halaman === 1) console.log(`Open Food Facts: ${j.count} produk bertag Indonesia, ${j.page_count} halaman`);
  for (const p of hits) {
    total++;
    const b = dariOff(p);
    if (!b) {
      dilewati++;
      continue;
    }
    if (await simpanDariOff(b)) disimpan++;
  }
  process.stdout.write(`\rhalaman ${halaman}/${j.page_count} - disimpan ${disimpan}, dilewati ${dilewati}`);
  if (!hits.length || halaman >= (j.page_count || 0)) break;
  halaman++;
  await tunggu(1500);
}
console.log(`\nSelesai: ${total} produk dicek, ${disimpan} masuk/diperbarui di katalog, ${dilewati} dilewati (nama/barcode kosong).`);
await pool.end();
