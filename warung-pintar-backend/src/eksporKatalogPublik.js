// Ekspor identitas katalog saja; tidak menyertakan data warung, harga, stok,
// kontribusi pengguna, nama admin, atau kredensial koneksi.
import { mkdir, writeFile } from 'node:fs/promises';
import { pool, query } from './db.js';
const dir = new URL('../data/', import.meta.url);
try {
  const { rows } = await query(`SELECT kunci,barcode,nama,merek,kategori,satuan,
    isi_kemasan,nama_kemasan,ukuran,foto_url,sumber FROM katalog_barang WHERE aktif ORDER BY kunci`);
  await mkdir(dir, { recursive: true });
  await writeFile(new URL('katalog-publik.json', dir), JSON.stringify({
    format: 'asisten-warung-katalog-v1', dibuat_pada: new Date().toISOString(),
    jumlah: rows.length,
    atribusi: { off: 'Open Food Facts (ODbL)', obf: 'Open Beauty Facts (ODbL)', opf: 'Open Products Facts (ODbL)', lotte: 'Katalog publik Lotte Grosir', tim: 'Data terverifikasi tim; lihat katalog-terverifikasi.json' },
    barang: rows,
  }, null, 2));
  console.log(`${rows.length} barang aktif diekspor ke data/katalog-publik.json`);
} finally { await pool.end(); }
