import { catatLog } from '../../db.js';
import { pool } from './db.js';

// Pindah pemilik customer (PRD v0.2 §15): tutup periode aktif, buka periode baru, salin ke warung.sales_id - dalam
// SATU transaksi, dengan alasan wajib & audit (nilai lama, nilai baru, alasan, aktor). salesId null = house account.
// NOT VERIFIED: aturan rate setelah pindah (D-45/D-46/D-67) belum dipakai - komisi belum dihitung (nunggu NV-03).
export async function pindahPemilik(req, warungId, salesId, alasan) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: w } = await client.query('SELECT id, username, sales_id FROM warung WHERE id=$1 FOR UPDATE', [warungId]);
    if (!w.length) throw Object.assign(new Error('Warung tidak ditemukan'), { status: 404 });
    if ((w[0].sales_id || null) === (salesId || null)) throw Object.assign(new Error('Pemiliknya udah itu'), { status: 400 });
    const { rows: lama } = await client.query(
      `UPDATE kepemilikan_warung SET valid_to = now() WHERE warung_id=$1 AND valid_to IS NULL
       RETURNING (SELECT kode FROM sales WHERE id = kepemilikan_warung.sales_id) AS kode`,
      [warungId]
    );
    await client.query('INSERT INTO kepemilikan_warung (warung_id, sales_id, alasan, aktor) VALUES ($1,$2,$3,$4)', [warungId, salesId, alasan, req.admin.nama]);
    await client.query('UPDATE warung SET sales_id=$2 WHERE id=$1', [warungId, salesId]);
    const { rows: baru } = salesId ? await client.query('SELECT kode FROM sales WHERE id=$1', [salesId]) : { rows: [] };
    await client.query('COMMIT');
    await catatLog(req, 'warung-pintar.warung.ganti_sales', {
      username: w[0].username,
      dari: lama[0]?.kode || 'house account',
      ke: baru[0]?.kode || 'house account',
      alasan,
    });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
