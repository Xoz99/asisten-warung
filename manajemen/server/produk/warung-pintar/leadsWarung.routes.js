import { Router } from 'express';
import { query } from './db.js';

// Pelanggan Warung Pintar & sales pemiliknya (PRD v0.2 §13-15). Akun demo nggak ikut.
// Status (§13, diturunkan dari pembayaran & masa aktif, nggak pernah diubah manual):
//   trial       - masa coba 7 hari masih jalan, belum pernah bayar
//   trial_habis - masa coba lewat, belum pernah bayar (prospect yang nggak jadi)
//   langganan   - pernah bayar & masa aktif masih jalan (ACTIVE_CUSTOMER)
//   permanen    - paket permanen, nggak pernah berakhir (D-05)
//   berhenti    - pernah bayar, masa aktif lewat (CHURNED, D-51)
const router = Router();
const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TAHAP = ['trial', 'trial_habis', 'langganan', 'permanen', 'berhenti'];
const SQL_TAHAP = `CASE
  WHEN w.plan = 'permanen' THEN 'permanen'
  WHEN w.plan = 'trial' AND w.lisensi_berlaku_sampai > now() THEN 'trial'
  WHEN w.plan = 'trial' THEN 'trial_habis'
  WHEN w.lisensi_berlaku_sampai > now() THEN 'langganan'
  ELSE 'berhenti' END`;

router.get('/leads-warung', async (req, res, next) => {
  try {
    const tahap = TAHAP.includes(req.query.tahap) ? req.query.tahap : null;
    // sales = id sales, atau 'house' buat house account (tanpa sales)
    const sales = req.query.sales === 'house' ? 'house' : POLA_UUID.test(req.query.sales || '') ? req.query.sales : null;
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 60) : '';
    const pola = q ? '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%' : null;
    const { rows } = await query(
      `WITH x AS (
         SELECT w.id, w.nama, w.username, w.no_hp, w.created_at, w.plan, w.lisensi_berlaku_sampai, ${SQL_TAHAP} AS tahap,
                w.sales_id, s.kode AS sales_kode, s.nama AS sales_nama,
                a.sumber AS atribusi_sumber, a.link_kode, sl.kode AS link_sales_kode,
                (a.link_sales_id IS NOT NULL AND a.link_sales_id IS DISTINCT FROM a.sales_id) AS klaim_link_kalah,
                (SELECT count(*)::int FROM pembayaran p WHERE p.warung_id=w.id AND p.status='settlement') AS jumlah_bayar,
                (SELECT COALESCE(SUM(p.jumlah),0)::float FROM pembayaran p WHERE p.warung_id=w.id AND p.status='settlement') AS total_bayar,
                (SELECT MAX(p.updated_at) FROM pembayaran p WHERE p.warung_id=w.id AND p.status='settlement') AS terakhir_bayar,
                (SELECT MAX(t.waktu) FROM transaksi t WHERE t.warung_id=w.id) AS terakhir_aktif,
                (SELECT count(*)::int FROM kepemilikan_warung k WHERE k.warung_id=w.id) AS jumlah_periode,
                w.profil_usaha->>'jenis' AS jenis_usaha
         FROM warung w
         LEFT JOIN sales s ON s.id = w.sales_id
         LEFT JOIN atribusi_warung a ON a.warung_id = w.id
         LEFT JOIN sales sl ON sl.id = a.link_sales_id
         WHERE NOT COALESCE(w.demo, false)
       )
       SELECT * FROM x WHERE ($1::text IS NULL OR tahap = $1)
         AND ($2::text IS NULL OR ($2 = 'house' AND sales_id IS NULL) OR sales_id::text = $2)
         AND ($3::text IS NULL OR nama ILIKE $3 OR username ILIKE $3 OR no_hp ILIKE $3 OR sales_kode ILIKE $3)
       ORDER BY created_at DESC LIMIT 500`,
      [tahap, sales, pola]
    );
    const { rows: ringkas } = await query(`SELECT ${SQL_TAHAP} AS tahap, count(*)::int AS n FROM warung w WHERE NOT COALESCE(w.demo,false) GROUP BY 1`);
    const { rows: daftarSales } = await query('SELECT id, kode, nama, aktif FROM sales ORDER BY nama');
    res.json({ warung: rows, ringkas: TAHAP.map((t) => ({ tahap: t, n: ringkas.find((r) => r.tahap === t)?.n || 0 })), sales: daftarSales });
  } catch (e) {
    next(e);
  }
});

// Detail satu pelanggan: atribusi, riwayat kepemilikan, pembayaran + pemilik PADA SAAT bayar (§15.1) & order ke berapa.
// NOT VERIFIED (NV-03): "saat bayar" pakai waktu pembayaran dicatat lunas di tabel pembayaran (updated_at), belum
// dari field waktu Midtrans - perilaku Midtrans belum diverifikasi.
router.get('/pelanggan/:id', async (req, res, next) => {
  try {
    if (!POLA_UUID.test(req.params.id)) return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });
    const [{ rows: w }, { rows: atribusi }, { rows: kepemilikan }, { rows: pembayaran }] = await Promise.all([
      query(`SELECT w.id, w.nama, w.username, w.no_hp, w.created_at, w.plan, w.lisensi_berlaku_sampai, ${SQL_TAHAP} AS tahap, w.demo FROM warung w WHERE w.id=$1`, [req.params.id]),
      query(
        `SELECT a.*, s.kode AS sales_kode, s.nama AS sales_nama, sl.kode AS link_sales_kode, sl.nama AS link_sales_nama,
                sk.kode AS kode_sales_kode, sk.nama AS kode_sales_nama
         FROM atribusi_warung a LEFT JOIN sales s ON s.id = a.sales_id LEFT JOIN sales sl ON sl.id = a.link_sales_id
         LEFT JOIN sales sk ON sk.id = a.kode_sales_id WHERE a.warung_id=$1`,
        [req.params.id]
      ),
      query(
        `SELECT k.id, k.valid_from, k.valid_to, k.alasan, k.aktor, s.kode AS sales_kode, s.nama AS sales_nama
         FROM kepemilikan_warung k LEFT JOIN sales s ON s.id = k.sales_id WHERE k.warung_id=$1 ORDER BY k.valid_from DESC, k.id DESC`,
        [req.params.id]
      ),
      query(
        `SELECT p.order_id, p.plan, p.jumlah::float AS jumlah, p.status, p.payment_type, p.created_at, p.updated_at AS lunas_pada,
                CASE WHEN p.status='settlement' THEN row_number() OVER (PARTITION BY p.status ORDER BY p.updated_at, p.created_at) END AS urutan_lunas,
                s.kode AS pemilik_kode, s.nama AS pemilik_nama
         FROM pembayaran p
         LEFT JOIN LATERAL (
           -- Pemilik PADA SAAT bayar: periode terakhir yang mulai sebelum/pas waktu bayar. Kalau waktu bayarnya lebih
           -- awal dari periode pertama (data lama), pakai periode pertama.
           SELECT k.sales_id FROM kepemilikan_warung k WHERE k.warung_id = p.warung_id
           ORDER BY (k.valid_from <= p.updated_at) DESC, CASE WHEN k.valid_from <= p.updated_at THEN k.valid_from END DESC, k.valid_from ASC
           LIMIT 1
         ) k ON true
         LEFT JOIN sales s ON s.id = k.sales_id AND p.status='settlement'
         WHERE p.warung_id=$1 ORDER BY p.created_at DESC`,
        [req.params.id]
      ),
    ]);
    if (!w.length) return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });
    res.json({ warung: w[0], atribusi: atribusi[0] || null, kepemilikan, pembayaran });
  } catch (e) {
    next(e);
  }
});

export default router;
