import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// Deret untung harian buat grafik (ganti seriLaporan pseudo-random di frontend demo dengan
// agregat asli dari tabel transaksi). n = jumlah hari per jendela, offset = mundur berapa jendela.
router.get('/ringkasan', async (req, res, next) => {
  try {
    const n = Math.min(+req.query.n || 7, 90);
    const offset = Math.max(0, +req.query.offset || 0);

    const akhir = new Date();
    akhir.setHours(0, 0, 0, 0);
    akhir.setDate(akhir.getDate() - offset * n + 1); // eksklusif: 1 hari setelah akhir jendela
    const awal = new Date(akhir);
    awal.setDate(awal.getDate() - n);

    const { rows: deret } = await query(
      `SELECT date_trunc('day', waktu) AS hari, COALESCE(SUM(laba),0) AS untung, COALESCE(SUM(total),0) AS omzet
       FROM transaksi WHERE warung_id=$1 AND waktu >= $2 AND waktu < $3
       GROUP BY hari ORDER BY hari`,
      [req.warungId, awal.toISOString(), akhir.toISOString()]
    );
    const totalUntung = deret.reduce((a, r) => a + Number(r.untung), 0);
    const totalOmzet = deret.reduce((a, r) => a + Number(r.omzet), 0);
    res.json({ awal, akhir, deret, totalUntung, totalOmzet, totalModal: totalOmzet - totalUntung });
  } catch (e) {
    next(e);
  }
});

router.get('/laris', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT ti.produk_id, ti.nama_produk, SUM(ti.qty) AS total_qty
       FROM transaksi_item ti JOIN transaksi t ON t.id = ti.transaksi_id
       WHERE t.warung_id = $1
       GROUP BY ti.produk_id, ti.nama_produk
       ORDER BY total_qty DESC LIMIT 5`,
      [req.warungId]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.get('/ngendap', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT p.id, p.nama, p.stok, MAX(t.waktu) AS terakhir_laku
       FROM produk p
       LEFT JOIN transaksi_item ti ON ti.produk_id = p.id
       LEFT JOIN transaksi t ON t.id = ti.transaksi_id
       WHERE p.warung_id = $1 AND p.aktif
       GROUP BY p.id, p.nama, p.stok
       HAVING MAX(t.waktu) IS NULL OR MAX(t.waktu) < now() - INTERVAL '7 days'
       ORDER BY terakhir_laku ASC NULLS FIRST LIMIT 10`,
      [req.warungId]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.get('/kas', async (req, res, next) => {
  try {
    const tabel = req.query.jenis === 'modal' ? 'modal_log' : 'masuk_log';
    const { rows } = await query(`SELECT * FROM ${tabel} WHERE warung_id=$1 ORDER BY waktu DESC LIMIT 100`, [req.warungId]);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// Catat MODAL MASUK - duit yang disetor pemilik ke warung (suntik modal awal, nambah modal pas
// mau kulakan besar, dst). Sebelum ini modal_log CUMA keisi sebagai efek samping masuk-stok
// (produk.routes.js) & scan nota (nota.routes.js) - artinya nggak ada satu pun cara buat nyatet
// "saya nyetor 100 juta ke warung" tanpa ngarang barang dulu. Ini yang bikin Mang Warung nggak
// bisa bantu waktu diminta "catat modal": aksinya emang belum ada.
//
// Sengaja dipisah dari masuk_log: masuk_log itu duit dari JUALAN (omzet), modal_log itu duit dari
// KANTONG PEMILIK. Kalau dicampur, laporan untung jadi ngaco - setoran modal kebaca kayak omzet.
router.post('/kas/modal', async (req, res, next) => {
  try {
    const jumlah = Number(req.body.jumlah);
    const keterangan = (req.body.keterangan || '').trim() || 'Modal masuk';
    if (!Number.isFinite(jumlah) || jumlah <= 0) {
      return res.status(400).json({ error: 'Jumlah modal harus angka lebih dari 0' });
    }
    const { rows } = await query(
      'INSERT INTO modal_log (warung_id, keterangan, jumlah) VALUES ($1,$2,$3) RETURNING *',
      [req.warungId, keterangan, jumlah]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

export default router;
