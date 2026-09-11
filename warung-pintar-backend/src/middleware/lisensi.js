import { query } from '../db.js';

// Dipasang setelah requireAuth. Kalau masa trial/langganan sudah lewat, tolak dengan 402
// (Payment Required) — bukan 401, biar frontend bisa bedain "belum login" vs "harus perpanjang".
export async function requireLisensiAktif(req, res, next) {
  try {
    const { rows } = await query('SELECT plan, lisensi_berlaku_sampai FROM warung WHERE id=$1', [req.warungId]);
    const w = rows[0];
    if (!w) return res.status(401).json({ error: 'Akun tidak ditemukan' });
    if (new Date(w.lisensi_berlaku_sampai) < new Date()) {
      return res.status(402).json({ error: 'Masa langganan sudah habis - perpanjang dulu ya', plan: w.plan, lisensiBerlakuSampai: w.lisensi_berlaku_sampai });
    }
    next();
  } catch (e) {
    next(e);
  }
}
