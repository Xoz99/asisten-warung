import { readFile } from 'node:fs/promises';
import { setTimeout as tunggu } from 'node:timers/promises';
import { ambilHalaman, bacaProduk, validasiUrl } from './services/scrapingKatalog.js';
import { gtinValid, kunciBarang, kategoriDariTag, pastikanTabelKatalog } from './services/katalog.service.js';
import { pool, query } from './db.js';

const args = process.argv.slice(2);
const simpan = args.includes('--simpan');
const file = args.find((a) => !a.startsWith('--'));
try {
  if (!file || args.some((a) => a.startsWith('--') && a !== '--simpan')) {
    throw new Error('Pakai: npm run scrape:katalog -- urls.txt [--simpan]');
  }
  const urls = [...new Set((await readFile(file, 'utf8')).split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#')))];
  if (!urls.length || urls.length > 500) throw new Error('Isi 1–500 URL produk per file');
  urls.forEach(validasiUrl);
  if (simpan) await pastikanTabelKatalog();
  const seen = new Set();
  let masuk = 0, dobel = 0, gagal = 0;
  for (const [i, url] of urls.entries()) {
    if (i) await tunggu(2000);
    try {
      const halaman = await ambilHalaman(url);
      const produk = bacaProduk(halaman.html);
      if (!produk.length) throw new Error('Product JSON-LD tidak ditemukan; mungkin perlu JavaScript/login atau halaman diblokir');
      for (const p of produk) {
        const nama = p.name.replace(/\s+/g, ' ').trim().slice(0, 120);
        const barcode = [p.gtin13, p.gtin12, p.gtin14, p.gtin8, p.gtin].find((v) => typeof v === 'string' && gtinValid(v)) || null;
        const kunci = kunciBarang({ nama, barcode });
        if (!kunci || seen.has(kunci)) { dobel++; continue; }
        seen.add(kunci);
        const merek = (typeof p.brand === 'string' ? p.brand : p.brand?.name);
        const b = { kunci, nama, barcode, merek: typeof merek === 'string' ? merek.slice(0, 60) : null,
          kategori: kategoriDariTag([], nama), sumber: halaman.sumber, sumber_url: halaman.url };
        if (simpan) {
          const { rowCount } = await query(`INSERT INTO katalog_barang
            (kunci,nama,barcode,merek,kategori,sumber,aktif,draf,diubah_oleh)
            VALUES ($1,$2,$3,$4,$5,$6,false,true,$7) ON CONFLICT (kunci) DO NOTHING`,
          [b.kunci,b.nama,b.barcode,b.merek,b.kategori,b.sumber,`Impor ${new Date().toISOString()} ${b.sumber_url}`]);
          if (rowCount) masuk++; else dobel++;
        } else { console.log(JSON.stringify(b)); masuk++; }
      }
    } catch (e) { gagal++; console.error(`${url}: ${e.message}`); }
  }
  console.error(`${simpan ? 'Draf masuk' : 'Pratinjau'}: ${masuk}; duplikat: ${dobel}; URL gagal: ${gagal}`);
  if (gagal) process.exitCode = 1;
} catch (e) { console.error(e.message); process.exitCode = 1; }
finally { await pool.end(); }
