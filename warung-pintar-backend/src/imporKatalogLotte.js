import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { setTimeout as tunggu } from 'node:timers/promises';
import { pool, query } from './db.js';
import { pastikanTabelKatalog } from './services/katalog.service.js';
import { produkLotte, dariLotte, sidikNama } from './services/lotteKatalog.js';

const args = process.argv.slice(2);
const simpan = args.includes('--simpan');
const max = Number(args.find((x) => x.startsWith('--max-pages='))?.split('=')[1] || 500);
const jeda = Number(args.find((x) => x.startsWith('--jeda-ms='))?.split('=')[1] || 1200);
// --cabang=semua -> sitemap produk SEMUA cabang Lotte Grosir (dari sitemap.xml mereka); bawaan cuma Jatake.
const semuaCabang = args.includes('--cabang=semua');
const slugDari = (u) => u.match(/\/product\/([a-z0-9-]+)\//)?.[1] || null;
const dir = new URL('../data/impor-katalog/', import.meta.url);
const mulai = new Date().toISOString();
const stamp = mulai.replace(/[:.]/g, '-');
const laporan = { mulai, sumber: 'lotte', mode: simpan ? 'simpan' : 'pratinjau', halaman: 0, ditemukan: 0, masuk: 0, duplikat: 0, ditolak: 0, gagal: [] };
const seen = new Set(), covered = new Set(), namaAda = new Set();
let lastFetch = 0;
async function ambil(url) {
  const u = new URL(url);
  if (u.origin !== 'https://order.lottemart.co.id') throw new Error('Host tidak diizinkan');
  await tunggu(Math.max(0, jeda - (Date.now() - lastFetch)));
  lastFetch = Date.now();
  const r = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(25000), headers: { 'User-Agent': 'AsistenWarung/1.0 (konsulinsupport@gmail.com)' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const text = await r.text();
  if (text.length > 5_000_000) throw new Error('Halaman terlalu besar');
  return text;
}
try {
  if (!Number.isInteger(max) || max < 1 || max > 5000 || !Number.isInteger(jeda) || jeda < 500 || jeda > 60000 || args.some((x) => x !== '--simpan' && x !== '--cabang=semua' && !/^--(?:max-pages|jeda-ms)=\d+$/.test(x))) throw new Error('Pakai --simpan, --cabang=semua, --max-pages=1..5000, --jeda-ms=500..60000');
  await mkdir(dir, { recursive: true });
  if (simpan) {
    await pastikanTabelKatalog();
    const { rows } = await query('SELECT nama FROM katalog_barang');
    rows.forEach((b) => namaAda.add(sidikNama(b.nama)));
    await query(`CREATE TABLE IF NOT EXISTS katalog_impor_sumber (
      sumber TEXT NOT NULL, sumber_id TEXT NOT NULL, katalog_id UUID NOT NULL REFERENCES katalog_barang(id) ON DELETE CASCADE,
      sumber_url TEXT NOT NULL, halaman_bukti TEXT NOT NULL, diambil_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (sumber, sumber_id))`);
    const { rows: lama } = await query("SELECT sumber_id,sumber_url FROM katalog_impor_sumber WHERE sumber='lotte'");
    // Produk yang sama di cabang lain = slug sama, jadi dedup pakai slug (bukan URL per cabang).
    lama.forEach((b) => { seen.add(b.sumber_id); covered.add(slugDari(b.sumber_url)); });
  }
  // Resume juga melewati halaman yang sudah diperiksa pada run sebelumnya.
  let pernah = [];
  try { pernah = JSON.parse(await readFile(new URL('lotte-halaman.json', dir), 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const selesai = new Set(simpan ? pernah.map(slugDari) : []);
  let peta = ['https://order.lottemart.co.id/sitemap-products/lotte-grosir-jatake.xml'];
  if (semuaCabang) {
    const indeks = await ambil('https://order.lottemart.co.id/sitemap.xml');
    peta = [...new Set([...indeks.matchAll(/<loc>(https:\/\/order\.lottemart\.co\.id\/sitemap-products\/lotte-grosir-[a-z-]+\.xml)<\/loc>/g)].map((m) => m[1]))];
    if (!peta.length) throw new Error('Sitemap cabang tidak ditemukan');
  }
  // Satu URL per slug (cabang pertama yang muncul) - produk sama di 36 cabang cukup dibuka sekali.
  const perSlug = new Map();
  for (const sm of peta) {
    const isi = await ambil(sm);
    for (const m of isi.matchAll(/<loc>(https:\/\/order\.lottemart\.co\.id\/product\/([a-z0-9-]+)\/lotte-grosir-[a-z-]+)<\/loc>/g)) if (!perSlug.has(m[2])) perSlug.set(m[2], m[1]);
  }
  const urls = [...perSlug.values()];
  laporan.sitemap_cabang = peta.length;
  if (!urls.length) throw new Error('Sitemap tidak berisi URL produk');
  laporan.url_sitemap = urls.length;
  for (const url of urls) {
    if (covered.has(slugDari(url)) || selesai.has(slugDari(url))) continue;
    if (laporan.halaman >= max) break;
    laporan.halaman++;
    try {
      const produk = produkLotte(await ambil(url));
      if (!produk.length) throw new Error('Data produk tidak ditemukan');
      for (const p of produk) {
        covered.add(p.slug);
        if (seen.has(p.prod_cd)) continue;
        seen.add(p.prod_cd);
        laporan.ditemukan++;
        const b = dariLotte(p, url);
        if (!b) { laporan.ditolak++; continue; }
        // Link sumber pakai cabang halaman yang lagi dibuka (dariLotte bawaannya nulis Jatake).
        b.sumber_url = `https://order.lottemart.co.id/product/${p.slug}/${url.split('/').pop()}`;
        if (namaAda.has(sidikNama(b.nama))) { laporan.duplikat++; continue; }
        if (simpan) {
          const { rows } = await query(`WITH baru AS (
            INSERT INTO katalog_barang (kunci,nama,kategori,ukuran,sumber,aktif,draf,diubah_oleh,satuan)
            VALUES ($1,$2,$3,$4,'lotte',true,false,$5,$9) ON CONFLICT (kunci) DO NOTHING RETURNING id
          ) INSERT INTO katalog_impor_sumber (sumber,sumber_id,katalog_id,sumber_url,halaman_bukti)
            SELECT 'lotte',$6,id,$7,$8 FROM baru RETURNING katalog_id`,
          [b.kunci,b.nama,b.kategori,b.ukuran,`Impor Lotte ${mulai}`,b.sumber_id,b.sumber_url,b.halaman_bukti,b.satuan]);
          if (!rows.length) { laporan.duplikat++; continue; }
        }
        namaAda.add(sidikNama(b.nama));
        laporan.masuk++;
        await appendFile(new URL(`${stamp}-lotte-barang.jsonl`, dir), JSON.stringify(b) + '\n');
      }
      selesai.add(slugDari(url));
      pernah.push(url);
      if (simpan) await writeFile(new URL('lotte-halaman.json', dir), JSON.stringify(pernah));
    } catch (e) {
      laporan.gagal.push({ url, error: e.message });
      console.warn(`${url}: ${e.message}`);
      if (/HTTP (403|429)/.test(e.message) || laporan.gagal.length >= 10) throw new Error('Pengambilan dihentikan karena blokir atau terlalu banyak kegagalan');
    }
    if (laporan.halaman % 10 === 0) {
      console.log(`Lotte ${laporan.halaman} halaman: ${laporan.masuk} baru, ${laporan.duplikat} duplikat, ${laporan.ditolak} ditolak`);
      await writeFile(new URL(`${stamp}-lotte-laporan.json`, dir), JSON.stringify(laporan, null, 2));
    }
  }
  laporan.sisa_url = urls.filter((u) => !covered.has(slugDari(u)) && !selesai.has(slugDari(u))).length;
} catch (e) { laporan.error = e.message; process.exitCode = 1; }
finally {
  laporan.selesai = new Date().toISOString();
  await mkdir(dir, { recursive: true });
  await writeFile(new URL(`${stamp}-lotte-laporan.json`, dir), JSON.stringify(laporan, null, 2));
  console.log(JSON.stringify(laporan));
  await pool.end();
}
