// Impor produk yang dijual di Indonesia dari database terbuka ke katalog_barang:
//   - Open Food Facts     (makanan & minuman)            -> sumber 'off'
//   - Open Beauty Facts   (sabun, sampo, pasta gigi, dll) -> sumber 'obf'
//   - Open Products Facts (barang non-makanan lain)       -> sumber 'opf'
// Jalanin: npm run impor:katalog   (aman diulang - barang yang udah ada cuma diperbarui, yang dirapiin tim nggak ditimpa)
//
// Pelan-pelan (1 permintaan / 1,5 detik) biar sopan ke server relawan mereka. Ketiganya berlisensi ODbL: di app
// wajib ada keterangan sumber. Rokok nggak ada di ketiganya - itu diisi tim lewat Makalin.
import { pool } from './db.js';
import { dariOff, pastikanTabelKatalog, simpanDariOff } from './services/katalog.service.js';

const UA = 'AsistenWarung/1.0 (konsulinsupport@gmail.com)';
const FIELDS = 'code,product_name,product_name_id,brands,quantity,categories_tags,image_front_small_url,unique_scans_n';
const PER_HALAMAN = 100;
const tunggu = (ms) => new Promise((ok) => setTimeout(ok, ms));

// OFF pakai search-a-licious (API pencarian barunya - /api/v2/search OFF sering "temporarily unavailable"),
// OBF & OPF pakai /api/v2/search biasa (search-a-licious belum ada buat mereka).
const SUMBER = [
  {
    sumber: 'off',
    nama: 'Open Food Facts',
    kategoriBawaan: 'lainnya',
    url: (h) =>
      `https://search.openfoodfacts.org/search?q=${encodeURIComponent('countries_tags:"en:indonesia"')}&page=${h}&page_size=${PER_HALAMAN}&fields=${FIELDS}&sort_by=-unique_scans_n`,
    baca: (j) => ({ produk: j.hits || [], halaman: j.page_count || 0, total: j.count }),
  },
  {
    sumber: 'obf',
    nama: 'Open Beauty Facts',
    kategoriBawaan: 'kebersihan',
    url: (h) => `https://world.openbeautyfacts.org/api/v2/search?countries_tags_en=indonesia&page=${h}&page_size=${PER_HALAMAN}&fields=${FIELDS}`,
    baca: (j) => ({ produk: j.products || [], halaman: Math.ceil((j.count || 0) / PER_HALAMAN), total: j.count }),
  },
  {
    sumber: 'opf',
    nama: 'Open Products Facts',
    kategoriBawaan: 'lainnya',
    url: (h) => `https://world.openproductsfacts.org/api/v2/search?countries_tags_en=indonesia&page=${h}&page_size=${PER_HALAMAN}&fields=${FIELDS}`,
    baca: (j) => ({ produk: j.products || [], halaman: Math.ceil((j.count || 0) / PER_HALAMAN), total: j.count }),
  },
];

async function ambil(url) {
  for (let coba = 1; coba <= 3; coba++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.ok && (res.headers.get('content-type') || '').includes('json')) return await res.json();
      console.warn(`\n  HTTP ${res.status}, coba lagi...`);
    } catch (e) {
      console.warn(`\n  ${e.message}, coba lagi...`);
    }
    await tunggu(5000 * coba);
  }
  return null;
}

await pastikanTabelKatalog();
const pilih = process.argv.slice(2); // npm run impor:katalog -- obf opf  -> cuma sumber itu
for (const s of SUMBER.filter((x) => !pilih.length || pilih.includes(x.sumber))) {
  let halaman = 1;
  let total = 0;
  let disimpan = 0;
  let dilewati = 0;
  let jumlahHalaman = 1;
  do {
    const j = await ambil(s.url(halaman));
    if (!j) {
      console.warn(`\n${s.nama}: halaman ${halaman} gagal diambil 3x, sumber ini dilewati dulu (jalanin ulang nanti).`);
      break;
    }
    const { produk, halaman: n, total: semua } = s.baca(j);
    if (halaman === 1) console.log(`${s.nama}: ${semua} produk bertag Indonesia, ${n} halaman`);
    jumlahHalaman = n;
    for (const p of produk) {
      total++;
      const b = dariOff(p, s);
      if (!b) {
        dilewati++;
        continue;
      }
      if (await simpanDariOff(b)) disimpan++;
    }
    process.stdout.write(`\r  halaman ${halaman}/${jumlahHalaman} - disimpan ${disimpan}, dilewati ${dilewati}`);
    if (!produk.length) break;
    halaman++;
    await tunggu(1500);
  } while (halaman <= jumlahHalaman);
  console.log(`\n  ${s.nama} selesai: ${total} dicek, ${disimpan} masuk/diperbarui, ${dilewati} dilewati (nama/barcode kosong/nggak valid).`);
}
await pool.end();
