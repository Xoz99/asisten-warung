// Masukin barang yang UDAH ADA di warung-warung (sebelum fitur katalog dideploy) ke kontribusi katalog. Setelah ini
// jalan, barang yang dipakai >= 3 warung langsung naik ke katalog aktif, dan yang 1-2 warung muncul di Makalin >
// Katalog barang > Usulan dari warung. Barang baru/diubah setelah deploy udah kecatat otomatis, jadi skrip ini cukup
// sekali - tapi aman diulang (kontribusi di-upsert per produk).
//
// Jalanin: npm run kontribusi:katalog
// Warung yang matiin "Bagikan barang ke katalog" & akun demo dilewati (dicek di catatKontribusi).
import { pool, query } from './db.js';
import { catatKontribusi, pastikanTabelKatalog } from './services/katalog.service.js';

await pastikanTabelKatalog();
const { rows } = await query('SELECT id FROM produk WHERE aktif ORDER BY created_at');
let i = 0;
for (const p of rows) {
  await catatKontribusi(p.id);
  if (++i % 200 === 0) process.stdout.write(`\r${i}/${rows.length} barang dicek`);
}
const [{ rows: k }, { rows: n }] = await Promise.all([
  query('SELECT count(*)::int AS barang, count(DISTINCT warung_id)::int AS warung, count(DISTINCT kunci)::int AS jenis FROM katalog_kontribusi'),
  query("SELECT count(*)::int AS n FROM katalog_barang WHERE sumber = 'warung'"),
]);
console.log(
  `\nSelesai: ${rows.length} barang dicek. Kontribusi: ${k[0].barang} barang dari ${k[0].warung} warung (${k[0].jenis} jenis). ` +
    `Barang dari warung yang udah masuk katalog: ${n[0].n}.`
);
await pool.end();
