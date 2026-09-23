// Terapkan perbaikan satuan/kg dan pemetaan kategori pada snapshot impor sesi ini.
// Barang yang sudah diubah tim (sumber=tim) tidak disentuh.
import { readdir, readFile } from 'node:fs/promises';
import { pool, query } from './db.js';
import { dariLotte } from './services/lotteKatalog.js';
const dir = new URL('../data/impor-katalog/', import.meta.url);
let diubah = 0;
try {
  for (const file of (await readdir(dir)).filter((x) => x.endsWith('-lotte-barang.jsonl'))) {
    for (const line of (await readFile(new URL(file, dir), 'utf8')).trim().split('\n').filter(Boolean)) {
      const b = JSON.parse(line);
      const x = dariLotte({ prod_cd: b.sumber_id, prod_nm: b.nama, slug: new URL(b.sumber_url).pathname.split('/')[2], active: true, l4_nm: b.kategori_sumber || '' }, b.halaman_bukti);
      if (!x) continue;
      const kategori = b.kategori_sumber || /^PUMPKIN BUTTERNUT\s*\/\s*KG$/i.test(b.nama) ? x.kategori : b.kategori;
      const { rowCount } = await query(`UPDATE katalog_barang SET satuan=$1,kategori=$2,updated_at=now()
        WHERE kunci=$3 AND sumber='lotte' AND (satuan IS DISTINCT FROM $1 OR kategori IS DISTINCT FROM $2)`, [x.satuan,kategori,b.kunci]);
      diubah += rowCount;
    }
  }
  console.log(`${diubah} barang Lotte diperbaiki satuan/kategorinya berdasarkan data sumber.`);
} finally { await pool.end(); }
