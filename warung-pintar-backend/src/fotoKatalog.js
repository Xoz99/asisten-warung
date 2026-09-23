// Unduh SEMUA foto katalog (Open Food/Beauty/Products Facts) ke server sendiri, pelan-pelan, biar app nggak nunggu
// server luar yang lambat/timeout. Foto barang warung yang masih nunjuk ke server luar ikut diganti ke link lokal.
// Jalanin: npm run foto:katalog   (aman diulang - yang udah diunduh dilewati; yang gagal dicoba lagi lain kali)
// Opsi: --jeda-ms=800 (jeda antar foto), --timeout-ms=30000
import { pool, query } from './db.js';
import { pastikanTabelKatalog, simpanFotoKatalog } from './services/katalog.service.js';

const arg = (k, d) => Number(process.argv.find((x) => x.startsWith(`--${k}=`))?.split('=')[1] || d);
const jeda = arg('jeda-ms', 800);
const timeoutMs = arg('timeout-ms', 30000);
await pastikanTabelKatalog();
const { rows } = await query(
  "SELECT id, kunci, nama, foto_url, foto_lokal FROM katalog_barang WHERE foto_url LIKE 'https://%' AND foto_lokal IS NULL ORDER BY aktif DESC, populer DESC"
);
console.log(`${rows.length} foto katalog belum ada di server sendiri`);
let ok = 0;
let gagal = 0;
let gagalBeruntun = 0;
for (const [i, b] of rows.entries()) {
  try {
    await simpanFotoKatalog(b, { timeoutMs });
    ok++;
    gagalBeruntun = 0;
  } catch (e) {
    gagal++;
    gagalBeruntun++;
    // Server sumbernya lagi down: berhenti daripada nembak terus - jalanin ulang nanti.
    if (gagalBeruntun >= 40) {
      console.warn(`\n40 foto berturut-turut gagal (terakhir: ${e.message}) - server sumber kayaknya lagi down, berhenti dulu. Jalanin ulang nanti.`);
      break;
    }
  }
  if ((i + 1) % 25 === 0) process.stdout.write(`\r${i + 1}/${rows.length} - berhasil ${ok}, gagal ${gagal}`);
  await new Promise((r) => setTimeout(r, jeda));
}
console.log(`\nSelesai: ${ok} foto diunduh, ${gagal} gagal (dicoba lagi kalau skrip ini dijalanin ulang).`);
await pool.end();
