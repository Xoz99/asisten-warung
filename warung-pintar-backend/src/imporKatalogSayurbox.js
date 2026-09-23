// Impor nama barang kemasan dari sitemap produk Sayurbox ke katalog_barang (sumber 'sayurbox').
// Jalanin: npm run impor:katalog:sayurbox -- [--simpan] [--max-pages=N] [--jeda-ms=N]
//   tanpa --simpan = pratinjau (nggak nulis database). Aman diulang: halaman yang udah diperiksa dilewati.
//
// Yang diambil CUMA nama barang (dari data terstruktur schema.org Product di halaman). Foto, harga, stok, dan ulasan
// NGGAK diambil (foto & harga itu milik Sayurbox). Barang segar (sayur, buah, daging, ikan), paket/bundle/hampers,
// dan barang yang namanya udah ada di katalog dilewati. Robots.txt Sayurbox nggak melarang halaman /product/;
// tetap pelan-pelan (bawaan 1 halaman / 1,5 detik) dan berhenti sendiri kalau diblokir (403/429).
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { setTimeout as tunggu } from 'node:timers/promises';
import { pool, query } from './db.js';
import { kategoriDariTag, kunciBarang, pastikanTabelKatalog } from './services/katalog.service.js';
import { sidikNama } from './services/lotteKatalog.js';

const UA = 'AsistenWarung/1.0 (konsulinsupport@gmail.com)';
const ASAL = 'https://www.sayurbox.com';
const args = process.argv.slice(2);
const simpan = args.includes('--simpan');
const max = Number(args.find((x) => x.startsWith('--max-pages='))?.split('=')[1] || 500);
const jeda = Number(args.find((x) => x.startsWith('--jeda-ms='))?.split('=')[1] || 1500);
const dir = new URL('../data/impor-katalog/', import.meta.url);
const mulai = new Date().toISOString();
const stamp = mulai.replace(/[:.]/g, '-');
const laporan = { mulai, sumber: 'sayurbox', mode: simpan ? 'simpan' : 'pratinjau', halaman: 0, ditemukan: 0, masuk: 0, duplikat: 0, segar: 0, ditolak: 0, gagal: [] };

// Barang segar / bukan barang warung - dilihat dari nama.
const SEGAR =
  /\b(sayur|bayam|kangkung|wortel|tomat|cabai|cabe|bawang (merah|putih|bombay)|kentang|jahe|kunyit|lengkuas|serai|buah|apel|jeruk|pisang|mangga|anggur|melon|semangka|alpukat|pepaya|nanas|salak|pir|strawberry|daging|sapi|kambing|ayam (fillet|potong|utuh|paha|dada|kampung|broiler|karkas)|(paha|dada|sayap|ceker|hati) ayam|boneless|\begg\b|telur (ayam|bebek|puyuh)|ikan|udang|cumi|kerang|salmon|tuna segar|tahu|tempe|jamur|selada|brokoli|kol|kubis|sawi|timun|terong|labu|herbal segar|bunga|tanaman|bibit|pupuk)\b/i;
const BUKAN_WARUNG = /\b(paket|bundle|hampers|parcel|voucher|gift|bingkisan|free|gratis|promo|isi \d+ macam|mix and match)\b/i;

let terakhir = 0;
async function ambil(url) {
  const u = new URL(url);
  if (u.origin !== ASAL) throw new Error('Host tidak diizinkan');
  await tunggu(Math.max(0, jeda - (Date.now() - terakhir)));
  terakhir = Date.now();
  const r = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(25000), headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const teks = await r.text();
  if (teks.length > 6_000_000) throw new Error('Halaman terlalu besar');
  return teks;
}

// Nama barang dari blok JSON-LD schema.org Product (tanpa ngejalanin script situs).
function namaProduk(html) {
  for (const m of html.matchAll(/<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const d = JSON.parse(m[1]);
      for (const x of [].concat(d)) if (x?.['@type'] === 'Product' && typeof x.name === 'string') return x.name;
    } catch {
      /* blok lain */
    }
  }
  return null;
}

try {
  if (!Number.isInteger(max) || max < 1 || max > 25000 || !Number.isInteger(jeda) || jeda < 800 || jeda > 60000 || args.some((x) => x !== '--simpan' && !/^--(?:max-pages|jeda-ms)=\d+$/.test(x))) {
    throw new Error('Pakai --simpan, --max-pages=1..25000, --jeda-ms=800..60000');
  }
  await mkdir(dir, { recursive: true });
  const namaAda = new Set();
  const seen = new Set();
  if (simpan) {
    await pastikanTabelKatalog();
    (await query('SELECT nama FROM katalog_barang')).rows.forEach((b) => namaAda.add(sidikNama(b.nama)));
    await query(`CREATE TABLE IF NOT EXISTS katalog_impor_sumber (
      sumber TEXT NOT NULL, sumber_id TEXT NOT NULL, katalog_id UUID NOT NULL REFERENCES katalog_barang(id) ON DELETE CASCADE,
      sumber_url TEXT NOT NULL, halaman_bukti TEXT NOT NULL, diambil_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (sumber, sumber_id))`);
    (await query("SELECT sumber_id FROM katalog_impor_sumber WHERE sumber='sayurbox'")).rows.forEach((b) => seen.add(b.sumber_id));
  }
  let pernah = [];
  try {
    pernah = JSON.parse(await readFile(new URL('sayurbox-halaman.json', dir), 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  const selesai = new Set(simpan ? pernah : []);

  const indeks = await ambil(`${ASAL}/sitemaps-www/index-sitemap.xml`);
  const peta = [...indeks.matchAll(/<loc>(https:\/\/www\.sayurbox\.com\/sitemaps-www\/product-detail-sitemap-part\d+\.xml)<\/loc>/g)].map((m) => m[1]);
  const urls = new Set();
  for (const sm of peta) for (const m of (await ambil(sm)).matchAll(/<loc>(https:\/\/www\.sayurbox\.com\/product\/[a-z0-9-]+)<\/loc>/g)) urls.add(m[1]);
  laporan.url_sitemap = urls.size;

  for (const url of urls) {
    const slug = url.split('/product/')[1];
    const sumberId = slug.match(/-([a-z]{8})$/)?.[1] || slug;
    if (selesai.has(url) || seen.has(sumberId)) continue;
    if (laporan.halaman >= max) break;
    // Barang segar ketahuan dari slug-nya - nggak perlu buka halamannya.
    if (SEGAR.test(slug.replace(/-/g, ' '))) {
      laporan.segar++;
      selesai.add(url);
      pernah.push(url);
      continue;
    }
    laporan.halaman++;
    try {
      const mentah = namaProduk(await ambil(url));
      if (!mentah) throw new Error('Data produk tidak ditemukan');
      laporan.ditemukan++;
      const nama = mentah.replace(/\s+/g, ' ').trim().slice(0, 120);
      if (nama.length < 3 || /\b(test|dummy)\b/i.test(nama) || BUKAN_WARUNG.test(nama)) laporan.ditolak++;
      else if (SEGAR.test(nama)) laporan.segar++;
      else if (namaAda.has(sidikNama(nama))) laporan.duplikat++;
      else {
        const b = {
          kunci: kunciBarang({ nama }),
          nama,
          kategori: kategoriDariTag([], nama),
          ukuran: nama.match(/\b\d+(?:[.,]\d+)?\s*(?:kg|gr|gram|g|ml|lt|ltr|liter|l|pcs|sachet)\b/i)?.[0] || null,
          sumber_id: sumberId,
          sumber_url: url,
        };
        laporan._dupSebelum = laporan.duplikat;
        if (simpan) {
          const { rows } = await query(
            `WITH baru AS (
               INSERT INTO katalog_barang (kunci,nama,kategori,ukuran,sumber,aktif,draf,diubah_oleh,satuan)
               VALUES ($1,$2,$3,$4,'sayurbox',true,false,$5,'pcs') ON CONFLICT (kunci) DO NOTHING RETURNING id
             ) INSERT INTO katalog_impor_sumber (sumber,sumber_id,katalog_id,sumber_url,halaman_bukti)
               SELECT 'sayurbox',$6,id,$7,$7 FROM baru RETURNING katalog_id`,
            [b.kunci, b.nama, b.kategori, b.ukuran, `Impor Sayurbox ${mulai}`, b.sumber_id, b.sumber_url]
          );
          if (!rows.length) laporan.duplikat++;
        }
        if (!simpan || laporan.duplikat === laporan._dupSebelum) {
          namaAda.add(sidikNama(nama));
          laporan.masuk++;
          await appendFile(new URL(`${stamp}-sayurbox-barang.jsonl`, dir), JSON.stringify(b) + '\n');
        }
      }
      selesai.add(url);
      pernah.push(url);
    } catch (e) {
      laporan.gagal.push({ url, error: e.message });
      console.warn(`${url}: ${e.message}`);
      if (/HTTP (403|429)/.test(e.message) || laporan.gagal.length >= 15) throw new Error('Pengambilan dihentikan karena blokir atau terlalu banyak kegagalan');
    }
    if (laporan.halaman % 25 === 0) {
      if (simpan) await writeFile(new URL('sayurbox-halaman.json', dir), JSON.stringify(pernah));
      console.log(`Sayurbox ${laporan.halaman} halaman: ${laporan.masuk} baru, ${laporan.duplikat} duplikat, ${laporan.segar} segar, ${laporan.ditolak} ditolak`);
      await writeFile(new URL(`${stamp}-sayurbox-laporan.json`, dir), JSON.stringify(laporan, null, 2));
    }
  }
  if (simpan) await writeFile(new URL('sayurbox-halaman.json', dir), JSON.stringify(pernah));
  laporan.sisa_url = [...urls].filter((u) => !selesai.has(u)).length;
} catch (e) {
  laporan.error = e.message;
  process.exitCode = 1;
} finally {
  delete laporan._dupSebelum;
  laporan.selesai = new Date().toISOString();
  await mkdir(dir, { recursive: true });
  await writeFile(new URL(`${stamp}-sayurbox-laporan.json`, dir), JSON.stringify(laporan, null, 2));
  console.log(JSON.stringify(laporan));
  await pool.end();
}
