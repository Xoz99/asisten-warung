// Ringkasan katalog barang dalam satu layar: jumlah per sumber, progres scrape Lotte/Sayurbox, persen foto yang udah
// diunduh ke server sendiri, dan proses mana yang masih jalan.
// Jalanin: npm run status:katalog              -> sekali tampil
//          npm run status:katalog -- --pantau  -> refresh tiap 30 detik (Ctrl+C buat keluar)
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { pool, query } from './db.js';

const DIR = new URL('../data/impor-katalog/', import.meta.url);
const TARGET = { off: '±5.600', obf: '±280', opf: '±120', lotte: '±8.500–9.500', sayurbox: '±10.000–14.000', tim: '2 + 41 draf' };
const angka = (n) => Number(n || 0).toLocaleString('id-ID');
const persen = (a, b) => (b ? `${Math.min(100, Math.round((a / b) * 100))}%` : '-');
const batang = (a, b, lebar = 24) => {
  const isi = b ? Math.min(lebar, Math.round((a / b) * lebar)) : 0;
  return '[' + '#'.repeat(isi) + '.'.repeat(lebar - isi) + ']';
};
// Cuma proses NODE yang lagi ngejalanin skrip itu yang dihitung - bukan shell induk (`sh -c '... Lotte && Sayurbox'`)
// yang teks perintahnya kebetulan nyebut nama skripnya (dulu bikin dua-duanya kelihatan "JALAN").
const jalan = (skrip) => {
  try {
    return execSync('ps -eo comm=,args=', { encoding: 'utf8' })
      .split('\n')
      .some((b) => /^node\s/.test(b.trim()) && b.includes(skrip));
  } catch {
    return false;
  }
};
const bacaJson = (nama) => {
  try {
    return JSON.parse(readFileSync(new URL(nama, DIR), 'utf8'));
  } catch {
    return null;
  }
};
// Laporan terbaru per sumber (file <waktu>-<sumber>-laporan.json yang ditulis skrip impor).
function laporanTerakhir(sumber) {
  try {
    const f = readdirSync(DIR)
      .filter((n) => n.endsWith(`-${sumber}-laporan.json`))
      .map((n) => ({ n, t: statSync(new URL(n, DIR)).mtimeMs }))
      .sort((a, b) => b.t - a.t)[0];
    return f ? { ...bacaJson(f.n), _diubah: new Date(f.t) } : null;
  } catch {
    return null;
  }
}
const lalu = (d) => {
  const menit = Math.round((Date.now() - d) / 60000);
  return menit < 1 ? 'barusan' : menit < 60 ? `${menit} menit lalu` : `${Math.round(menit / 60)} jam lalu`;
};

async function tampil() {
  const [{ rows: perSumber }, { rows: tot }, { rows: foto }] = await Promise.all([
    query(`SELECT sumber, count(*) FILTER (WHERE aktif)::int AS aktif, count(*) FILTER (WHERE draf)::int AS draf
           FROM katalog_barang GROUP BY 1 ORDER BY 2 DESC`),
    query(`SELECT count(*) FILTER (WHERE aktif)::int AS aktif, count(*) FILTER (WHERE draf)::int AS draf,
                  count(*) FILTER (WHERE aktif AND barcode IS NOT NULL)::int AS barcode FROM katalog_barang`),
    query(`SELECT count(*) FILTER (WHERE foto_lokal IS NOT NULL)::int AS udah,
                  count(*) FILTER (WHERE foto_url IS NOT NULL OR foto_lokal IS NOT NULL)::int AS total FROM katalog_barang`).catch(() => ({ rows: [{ udah: 0, total: 0 }] })),
  ]);
  const t = tot[0];
  const f = foto[0];
  const scrapeLotte = jalan('imporKatalogLotte.js');
  const scrapeSayurbox = jalan('imporKatalogSayurbox.js');
  const unduhFoto = jalan('fotoKatalog.js');

  console.log(`\n=== KATALOG BARANG · ${new Date().toLocaleString('id-ID')} ===\n`);
  console.log(`TOTAL AKTIF : ${angka(t.aktif)} barang   (draf nunggu disetujui: ${angka(t.draf)}, punya barcode: ${angka(t.barcode)})`);
  console.log(`Target akhir: ±25.000–29.000\n`);
  console.log('Sumber        Aktif     Draf   Target');
  for (const r of perSumber) console.log(`${r.sumber.padEnd(12)} ${angka(r.aktif).padStart(7)} ${angka(r.draf).padStart(7)}   ${TARGET[r.sumber] || '-'}`);
  if (!perSumber.some((r) => r.sumber === 'sayurbox')) console.log(`${'sayurbox'.padEnd(12)} ${'0'.padStart(7)} ${'0'.padStart(7)}   ${TARGET.sayurbox}  (belum mulai)`);

  console.log('\n--- Scrape ---');
  for (const [sumber, nyala] of [
    ['lotte', scrapeLotte],
    ['sayurbox', scrapeSayurbox],
  ]) {
    const l = laporanTerakhir(sumber);
    const halamanFile = bacaJson(`${sumber}-halaman.json`);
    const diperiksa = Array.isArray(halamanFile) ? halamanFile.length : 0;
    const status = nyala ? 'JALAN' : l?.selesai ? (l.error ? `BERHENTI (${l.error})` : 'selesai') : l ? 'berhenti' : 'belum mulai';
    console.log(`${sumber.padEnd(9)} ${status}`);
    if (!l) continue;
    const total = l.url_sitemap || 0;
    // Lotte: satu halaman bisa ngasih banyak produk, jadi biasanya beres jauh sebelum semua URL dibuka.
    console.log(`          ${batang(diperiksa, total)} ${angka(diperiksa)}/${angka(total)} URL diperiksa (${persen(diperiksa, total)})${sumber === 'lotte' ? ' - bisa beres sebelum 100%' : ''}`);
    console.log(`          putaran ini: ${angka(l.halaman)} halaman, ${angka(l.masuk)} masuk, ${angka(l.duplikat)} dobel, ${angka(l.ditolak)} ditolak${l.segar !== undefined ? `, ${angka(l.segar)} barang segar` : ''}, ${l.gagal?.length || 0} gagal`);
    console.log(`          laporan terakhir ditulis ${lalu(l._diubah)}${l.sisa_url !== undefined ? ` · sisa URL: ${angka(l.sisa_url)}` : ''}`);
    if (nyala && Date.now() - l._diubah > 30 * 60000) console.log('          ⚠ prosesnya ada tapi laporan nggak update >30 menit - kemungkinan macet, cek: tail -c 600 scrape.log');
    if (!nyala && l.sisa_url > 0 && l.halaman >= 5000) console.log('          ⚠ berhenti karena batas --max-pages, sisa URL-nya belum habis - jalanin lagi');
  }

  console.log('\n--- Foto di server sendiri ---');
  console.log(`${batang(f.udah, f.total)} ${angka(f.udah)}/${angka(f.total)} (${persen(f.udah, f.total)})  ${unduhFoto ? 'JALAN' : 'nggak jalan'}`);
  if (!unduhFoto && f.udah < f.total) console.log('          lanjutin: pm2 start npm --name foto-katalog --no-autorestart -- run foto:katalog');
  console.log('');
}

try {
  if (process.argv.includes('--pantau')) {
    for (;;) {
      console.clear();
      await tampil();
      console.log('(refresh tiap 30 detik - Ctrl+C buat keluar)');
      await new Promise((r) => setTimeout(r, 30000));
    }
  } else await tampil();
} finally {
  await pool.end();
}
