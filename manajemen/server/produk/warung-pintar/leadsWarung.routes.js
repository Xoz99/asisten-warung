import { Router } from 'express';
import { query } from './db.js';

// Leads tab "Warung": semua warung yang daftar (dari link/kode sales atau sendiri) dengan tahap otomatis:
// trial -> trial_habis / langganan -> berhenti. Akun demo nggak ikut.
const router = Router();
const TAHAP = ['trial', 'trial_habis', 'langganan', 'berhenti'];
const SQL_TAHAP = `CASE
  WHEN w.plan = 'trial' AND w.lisensi_berlaku_sampai > now() THEN 'trial'
  WHEN w.plan = 'trial' THEN 'trial_habis'
  WHEN w.lisensi_berlaku_sampai > now() THEN 'langganan'
  ELSE 'berhenti' END`;

router.get('/leads-warung', async (req, res, next) => {
  try {
    const tahap = TAHAP.includes(req.query.tahap) ? req.query.tahap : null;
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 60) : '';
    const pola = q ? '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%' : null;
    const { rows } = await query(
      `WITH x AS (
         SELECT w.id, w.nama, w.username, w.no_hp, w.created_at, w.plan, w.lisensi_berlaku_sampai, ${SQL_TAHAP} AS tahap,
                s.kode AS sales_kode, s.nama AS sales_nama,
                (SELECT COALESCE(SUM(p.jumlah),0)::float FROM pembayaran p WHERE p.warung_id=w.id AND p.status='settlement') AS total_bayar,
                (SELECT MAX(t.waktu) FROM transaksi t WHERE t.warung_id=w.id) AS terakhir_aktif,
                w.profil_usaha->>'jenis' AS jenis_usaha
         FROM warung w LEFT JOIN sales s ON s.id = w.sales_id WHERE NOT COALESCE(w.demo, false)
       )
       SELECT * FROM x WHERE ($1::text IS NULL OR tahap = $1)
         AND ($2::text IS NULL OR nama ILIKE $2 OR username ILIKE $2 OR no_hp ILIKE $2 OR sales_kode ILIKE $2)
       ORDER BY created_at DESC LIMIT 500`,
      [tahap, pola]
    );
    const { rows: ringkas } = await query(`SELECT ${SQL_TAHAP} AS tahap, count(*)::int AS n FROM warung w WHERE NOT COALESCE(w.demo,false) GROUP BY 1`);
    res.json({ warung: rows, ringkas: TAHAP.map((t) => ({ tahap: t, n: ringkas.find((r) => r.tahap === t)?.n || 0 })) });
  } catch (e) {
    next(e);
  }
});

export default router;
