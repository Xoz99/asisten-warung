import { Router } from 'express';
import { query } from '../db.js';
import { verifikasiSignature } from '../services/midtrans.service.js';
import { aktifkanPembayaran } from '../services/lisensi.service.js';

const router = Router();

// Webhook Midtrans (PUBLIC — didaftarkan di dashboard Midtrans sebagai "Payment Notification URL").
// Dipisah dari lisensi.routes.js dan dipasang SEBELUM requireAuth di index.js, karena Midtrans
// yang manggil endpoint ini langsung, bukan pelanggan yang login. Keamanannya murni dari
// verifikasi signature di bawah, bukan dari token JWT.
router.post('/webhook', async (req, res, next) => {
  try {
    const n = req.body;
    if (!verifikasiSignature(n)) return res.status(403).json({ error: 'Signature tidak valid' });

    const { rows } = await query('SELECT * FROM pembayaran WHERE order_id=$1', [n.order_id]);
    const p = rows[0];
    if (!p) return res.status(404).json({ error: 'order_id tidak dikenali' });

    const sukses = ['capture', 'settlement'].includes(n.transaction_status) && (n.fraud_status ? n.fraud_status === 'accept' : true);
    const gagal = ['deny', 'cancel', 'expire', 'failure'].includes(n.transaction_status);

    if (sukses) {
      // Logikanya dipindah ke services/lisensi.service.js biar DIPAKAI BARENG sama jalur
      // sinkronisasi manual (/api/lisensi/sinkron) - dua jalur beda yang hasilnya wajib identik.
      await aktifkanPembayaran(p, n, n.transaction_id);
    } else if (gagal && p.status === 'pending') {
      await query('UPDATE pembayaran SET status=$1, raw_notifikasi=$2, updated_at=now() WHERE id=$3', [
        n.transaction_status === 'expire' ? 'kedaluwarsa' : 'gagal',
        JSON.stringify(n),
        p.id,
      ]);
    }

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
