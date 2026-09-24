import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from '../db.js';

// Lokasi file di disk server: CV & foto pelamar (Rekrutmen), dan foto profil admin/karyawan.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DOKUMEN_DIR = process.env.DOKUMEN_DIR || path.resolve(__dirname, '../../data/dokumen');
export const PROFIL_DIR = path.resolve(process.env.PROFIL_DIR || path.join(__dirname, '../../data/profil'));

// Karyawan yang asalnya dari Rekrutmen & belum punya foto profil: pakai foto diri terakhir yang dia unggah waktu
// melamar. Filenya disalin (bukan dipindah) ke folder profil, jadi dokumen lamarannya tetap utuh. Aman dipanggil
// berkali-kali - yang udah punya foto nggak disentuh.
export async function salinFotoLamaran(karyawanId = null) {
  const { rows } = await query(
    `SELECT k.id, d.lokasi, d.mime FROM mj_karyawan k
     JOIN LATERAL (SELECT d.lokasi, d.mime FROM mj_lamaran_dokumen d JOIN mj_lamaran l ON l.id = d.lamaran_id
                   WHERE l.orang_id = k.orang_id AND d.jenis = 'foto' ORDER BY d.created_at DESC LIMIT 1) d ON true
     WHERE k.foto IS NULL AND k.orang_id IS NOT NULL AND ($1::uuid IS NULL OR k.id = $1)`,
    [karyawanId]
  );
  let n = 0;
  for (const r of rows) {
    const asal = path.join(DOKUMEN_DIR, path.basename(r.lokasi));
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[r.mime];
    if (!ext || !fs.existsSync(asal)) continue;
    const nama = `${crypto.randomUUID()}.${ext}`;
    fs.mkdirSync(PROFIL_DIR, { recursive: true });
    fs.copyFileSync(asal, path.join(PROFIL_DIR, nama));
    const { rowCount } = await query('UPDATE mj_karyawan SET foto=$2 WHERE id=$1 AND foto IS NULL', [r.id, nama]);
    if (rowCount) n++;
    else fs.rm(path.join(PROFIL_DIR, nama), { force: true }, () => {});
  }
  return n;
}
