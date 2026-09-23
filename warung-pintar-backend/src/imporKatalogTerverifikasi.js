import { readFile } from 'node:fs/promises';
import { pool, query } from './db.js';
import { kunciBarang, pastikanTabelKatalog } from './services/katalog.service.js';

try {
  const barang = JSON.parse(await readFile(new URL('../data/katalog-terverifikasi.json', import.meta.url), 'utf8'));
  await pastikanTabelKatalog();
  for (const b of barang) {
    const { rowCount } = await query(`INSERT INTO katalog_barang
      (kunci,nama,merek,kategori,ukuran,sumber,aktif,draf,diubah_oleh)
      VALUES ($1,$2,$3,$4,$5,'tim',true,false,$6) ON CONFLICT (kunci) DO NOTHING`,
    [kunciBarang({ nama: b.nama }), b.nama,b.merek,b.kategori,b.ukuran,`Sumber terverifikasi: ${b.sumber_url}`]);
    console.log(`${rowCount ? 'Ditambah' : 'Sudah ada'}: ${b.nama}`);
  }
} finally { await pool.end(); }
