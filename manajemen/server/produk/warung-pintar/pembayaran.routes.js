import { Router } from 'express';
import { query } from './db.js';

// Riwayat pembayaran langganan Warung Pintar - sama kayak yang ada di dashboard Midtrans (dicocokin lewat order_id),
// tapi lengkap sama warung siapa, username, nomor HP, & sales yang bawa.
const router = Router();
const STATUS = ['settlement', 'pending', 'gagal', 'kedaluwarsa'];

router.get('/pembayaran', async (req, res, next) => {
  try {
    const status = STATUS.includes(req.query.status) ? req.query.status : null;
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 60) : '';
    const pola = q ? '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%' : null;
    const { rows } = await query(
      `SELECT p.order_id, p.plan, p.jumlah::float AS jumlah, p.jumlah_bersih::float AS jumlah_bersih, p.status,
              p.payment_type, p.midtrans_transaction_id, p.created_at, p.updated_at,
              w.nama AS warung, w.username, w.no_hp, s.kode AS sales_kode, s.nama AS sales_nama
       FROM pembayaran p JOIN warung w ON w.id = p.warung_id LEFT JOIN sales s ON s.id = w.sales_id
       WHERE ($1::text IS NULL OR p.status = $1)
         AND ($2::text IS NULL OR p.order_id ILIKE $2 OR w.nama ILIKE $2 OR w.username ILIKE $2 OR w.no_hp ILIKE $2)
       ORDER BY p.created_at DESC LIMIT 300`,
      [status, pola]
    );
    const { rows: ringkas } = await query(
      `SELECT status, count(*)::int AS jumlah, COALESCE(SUM(jumlah),0)::float AS total FROM pembayaran GROUP BY status`
    );
    res.json({ pembayaran: rows, ringkas });
  } catch (e) {
    next(e);
  }
});

export default router;
