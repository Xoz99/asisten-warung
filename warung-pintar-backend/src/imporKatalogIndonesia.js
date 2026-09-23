// Melengkapi impor berbasis negara: produk berawalan GS1 Indonesia (899)
// kadang belum diberi tag negara di Open Food Facts. Hanya menambah kunci baru.
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as tunggu } from 'node:timers/promises';
import { pool, query } from './db.js';
import { dariOff, pastikanTabelKatalog } from './services/katalog.service.js';

const fields = 'code,product_name,product_name_id,brands,quantity,categories_tags,image_front_small_url,unique_scans_n';
const args = process.argv.slice(2);
const sumber = args[0]?.replace('--sumber=', '') || 'off';
const hosts = { off: 'search.openfoodfacts.org', obf: 'world.openbeautyfacts.org', opf: 'world.openproductsfacts.org' };
const baru = [];
const laporan = { mulai: new Date().toISOString(), sumber: `https://${hosts[sumber]}/`, kueri: 'code:899*', dicek: 0, invalid: 0, duplikat: 0, masuk: 0, halaman: 0 };
const dir = new URL('../data/impor-katalog/', import.meta.url);
const stamp = laporan.mulai.replace(/[:.]/g, '-');
try {
  if (!Object.hasOwn(hosts, sumber) || args.length > 1 || (args.length && args[0] !== `--sumber=${sumber}`)) throw new Error('Pakai --sumber=off|obf|opf');
  await pastikanTabelKatalog();
  await mkdir(dir, { recursive: true });
  let pages = 1;
  for (let page = 1; page <= pages; page++) {
    if (page > 1) await tunggu(1500);
    const url = sumber === 'off'
      ? `https://${hosts[sumber]}/search?q=code%3A899*&page=${page}&page_size=100&fields=${fields}`
      : `https://${hosts[sumber]}/facets/codes/899xxxxxxxxxx.json?page=${page}&page_size=100&fields=${fields}`;
    let json;
    for (let coba = 1; coba <= 3; coba++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'AsistenWarung/1.0 (konsulinsupport@gmail.com)' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        json = await res.json();
        if (sumber !== 'off') json = { ...json, hits: json.products, page_count: Math.ceil(json.count / 100) };
        if (!Array.isArray(json.hits) || !Number.isInteger(json.page_count) || json.page !== page) throw new Error('Format respons/paginasi tidak sesuai');
        break;
      } catch (e) { if (coba === 3) throw e; await tunggu(coba * 2000); }
    }
    pages = json.page_count;
    if (pages > 200) throw new Error('Hasil lebih dari 200 halaman; periksa kueri');
    for (const p of json.hits) {
      laporan.dicek++;
      const b = dariOff(p, { sumber, kategoriBawaan: sumber === 'obf' ? 'kebersihan' : 'lainnya' });
      if (!b || !b.barcode.startsWith('899')) { laporan.invalid++; continue; }
      const { rowCount } = await query(`INSERT INTO katalog_barang
        (kunci,barcode,nama,merek,kategori,ukuran,foto_url,sumber,populer)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$9,$8) ON CONFLICT (kunci) DO NOTHING`,
      [b.kunci,b.barcode,b.nama,b.merek,b.kategori,b.ukuran,b.foto_url,b.populer,b.sumber]);
      if (rowCount) { laporan.masuk++; baru.push(b); } else laporan.duplikat++;
    }
    laporan.halaman = page;
    // Checkpoint untuk audit dan pemulihan; impor ulang tetap melewati data lama.
    await writeFile(new URL(`${stamp}-barang.json`, dir), JSON.stringify(baru, null, 2));
    console.log(`Halaman ${page}/${pages}: ${laporan.masuk} baru, ${laporan.duplikat} sudah ada, ${laporan.invalid} tidak valid`);
  }
} catch (e) { laporan.error = e.message; process.exitCode = 1; }
finally {
  laporan.selesai = new Date().toISOString();
  await mkdir(dir, { recursive: true });
  await writeFile(new URL(`${stamp}-laporan.json`, dir), JSON.stringify(laporan, null, 2));
  console.log(JSON.stringify(laporan));
  await pool.end();
}
