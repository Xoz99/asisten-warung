import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  await pool.query(sql);
  console.log('Migrasi selesai - semua tabel sudah siap di database.');
  await pool.end();
}

migrate().catch((e) => {
  console.error('Migrasi gagal:', e.message);
  process.exit(1);
});
