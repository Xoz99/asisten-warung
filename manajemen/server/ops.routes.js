import { Router } from 'express';
import { catatLog, query } from './db.js';
import { pastikanTabelSales, pool as poolWp } from './produk/warung-pintar/db.js';

// Makalin Ops tahap 1: dashboard gabungan, CRM leads manual, keuangan (Midtrans + catatan manual), notifikasi.
// Data Warung Pintar dibaca langsung dari database-nya (produk/warung-pintar/db.js) kalau produknya aktif.
const router = Router();
const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const qWp = (text, params) => (poolWp ? poolWp.query(text, params) : Promise.resolve({ rows: [] }));

export const TAHAP_CRM = ['baru', 'kualifikasi', 'proposal', 'negosiasi', 'closing'];
const KATEGORI_KELUAR = ['gaji', 'operasional', 'marketing', 'server', 'pajak', 'lainnya'];
const KATEGORI_MASUK = ['penjualan', 'proyek', 'investasi', 'lainnya'];

let siap = null;
function pastikanTabelOps() {
  if (!siap) {
    siap = (async () => {
      await query(`CREATE TABLE IF NOT EXISTS mj_lead (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        perusahaan TEXT NOT NULL,
        pic_nama TEXT,
        pic_jabatan TEXT,
        email TEXT,
        telepon TEXT,
        sumber TEXT,
        nilai NUMERIC NOT NULL DEFAULT 0,
        tahap TEXT NOT NULL DEFAULT 'baru',
        hasil TEXT, -- null = masih jalan | 'menang' | 'gagal'
        pemilik_id UUID REFERENCES mj_admin(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      )`);
      await query(`CREATE TABLE IF NOT EXISTS mj_lead_aktivitas (
        id BIGSERIAL PRIMARY KEY,
        lead_id UUID NOT NULL REFERENCES mj_lead(id) ON DELETE CASCADE,
        admin_nama TEXT,
        jenis TEXT NOT NULL DEFAULT 'catatan',
        isi TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      )`);
      await query(`CREATE TABLE IF NOT EXISTS mj_transaksi (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        jenis TEXT NOT NULL, -- masuk | keluar
        tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
        kategori TEXT NOT NULL,
        deskripsi TEXT NOT NULL,
        pihak TEXT,
        jumlah NUMERIC NOT NULL,
        metode TEXT,
        admin_nama TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      )`);
      await query('CREATE INDEX IF NOT EXISTS idx_mj_transaksi_tanggal ON mj_transaksi (tanggal DESC)');
      // Notifikasi: cukup "dibaca sampai kapan" per admin - notifikasinya sendiri dirakit dari data yang udah ada.
      await query(`CREATE TABLE IF NOT EXISTS mj_notif_baca (
        admin_id UUID PRIMARY KEY REFERENCES mj_admin(id) ON DELETE CASCADE,
        dibaca_sampai TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    })().catch((e) => {
      siap = null;
      throw e;
    });
  }
  return siap;
}
router.use(async (req, res, next) => {
  try {
    await Promise.all([pastikanTabelOps(), poolWp ? pastikanTabelSales() : null]);
    next();
  } catch (e) {
    next(e);
  }
});

const teks = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const angkaPositif = (v) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

// ---- Tahap warung (Warung Pintar), dihitung dari plan & masa aktif. Akun demo nggak dihitung. ----
export const SQL_TAHAP_WARUNG = `CASE
  WHEN w.plan = 'trial' AND w.lisensi_berlaku_sampai > now() THEN 'trial'
  WHEN w.plan = 'trial' THEN 'trial_habis'
  WHEN w.lisensi_berlaku_sampai > now() THEN 'langganan'
  ELSE 'berhenti' END`;

// Pemasukan per bulan: Midtrans lunas (Warung Pintar) + transaksi manual. Pengeluaran: transaksi manual.
async function arusKas(bulanMundur = 6) {
  const [wp, manual] = await Promise.all([
    qWp(
      `SELECT to_char(date_trunc('month', updated_at), 'YYYY-MM') AS bulan, COALESCE(SUM(COALESCE(jumlah_bersih, jumlah)),0)::float AS masuk
       FROM pembayaran WHERE status='settlement' AND updated_at >= date_trunc('month', now()) - ($1 || ' months')::interval
       GROUP BY 1`,
      [String(bulanMundur - 1)]
    ),
    query(
      `SELECT to_char(date_trunc('month', tanggal), 'YYYY-MM') AS bulan,
              COALESCE(SUM(jumlah) FILTER (WHERE jenis='masuk'),0)::float AS masuk,
              COALESCE(SUM(jumlah) FILTER (WHERE jenis='keluar'),0)::float AS keluar
       FROM mj_transaksi WHERE tanggal >= date_trunc('month', now()) - ($1 || ' months')::interval GROUP BY 1`,
      [String(bulanMundur - 1)]
    ),
  ]);
  const hasil = [];
  const d = new Date();
  d.setDate(1);
  for (let i = bulanMundur - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const kunci = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
    const a = wp.rows.find((r) => r.bulan === kunci);
    const b = manual.rows.find((r) => r.bulan === kunci);
    hasil.push({ bulan: kunci, masuk: (a?.masuk || 0) + (b?.masuk || 0), masukMidtrans: a?.masuk || 0, keluar: b?.keluar || 0 });
  }
  return hasil;
}

async function saldoTotal() {
  const [wp, manual] = await Promise.all([
    qWp(`SELECT COALESCE(SUM(COALESCE(jumlah_bersih, jumlah)),0)::float AS n FROM pembayaran WHERE status='settlement'`),
    query(`SELECT COALESCE(SUM(CASE WHEN jenis='masuk' THEN jumlah ELSE -jumlah END),0)::float AS n FROM mj_transaksi`),
  ]);
  return (wp.rows[0]?.n || 0) + (manual.rows[0]?.n || 0);
}

router.get('/dashboard', async (req, res, next) => {
  try {
    const [warung, tagihan, crm, log, sales, kas, saldo, trialHabis, menunggu] = await Promise.all([
      qWp(
        `SELECT ${SQL_TAHAP_WARUNG} AS tahap, count(*)::int AS n,
                count(*) FILTER (WHERE w.created_at >= now() - interval '30 days')::int AS baru
         FROM warung w WHERE NOT COALESCE(w.demo, false) GROUP BY 1`
      ),
      qWp(`SELECT count(*)::int AS n, COALESCE(SUM(jumlah),0)::float AS total FROM pembayaran WHERE status='pending'`),
      query(
        `SELECT tahap, count(*)::int AS n, COALESCE(SUM(nilai),0)::float AS nilai FROM mj_lead WHERE hasil IS NULL GROUP BY tahap`
      ),
      query('SELECT id, admin_nama, aksi, detail, created_at FROM mj_log ORDER BY created_at DESC LIMIT 8'),
      qWp(
        `SELECT s.nama, s.kode, count(DISTINCT w.id)::int AS warung,
                COALESCE(SUM(p.jumlah) FILTER (WHERE p.status='settlement' AND p.updated_at >= date_trunc('month', now())),0)::float AS omzet_bulan_ini,
                count(DISTINCT p.warung_id) FILTER (WHERE p.status='settlement')::int AS bayar
         FROM sales s LEFT JOIN warung w ON w.sales_id = s.id LEFT JOIN pembayaran p ON p.warung_id = w.id
         WHERE s.aktif GROUP BY s.id ORDER BY omzet_bulan_ini DESC, bayar DESC, warung DESC LIMIT 5`
      ).catch(() => ({ rows: [] })),
      arusKas(6),
      saldoTotal(),
      // "Perlu ditindaklanjuti": warung yang trial-nya baru habis (belum pernah bayar) & tagihan yang belum dibayar.
      qWp(
        `SELECT w.id, w.nama, w.username, w.no_hp, w.lisensi_berlaku_sampai, s.kode AS sales_kode
         FROM warung w LEFT JOIN sales s ON s.id = w.sales_id
         WHERE NOT COALESCE(w.demo,false) AND w.plan='trial' AND w.lisensi_berlaku_sampai <= now()
         ORDER BY w.lisensi_berlaku_sampai DESC LIMIT 5`
      ),
      qWp(
        `SELECT p.order_id, p.plan, p.jumlah::float AS jumlah, p.created_at, w.nama, w.username
         FROM pembayaran p JOIN warung w ON w.id = p.warung_id WHERE p.status='pending' ORDER BY p.created_at DESC LIMIT 5`
      ),
    ]);
    const tahapWarung = Object.fromEntries(warung.rows.map((r) => [r.tahap, r.n]));
    res.json({
      produkAktif: !!poolWp,
      warung: {
        tahap: tahapWarung,
        total: warung.rows.reduce((a, r) => a + r.n, 0),
        baru30: warung.rows.reduce((a, r) => a + r.baru, 0),
      },
      tagihan: tagihan.rows[0] || { n: 0, total: 0 },
      crm: TAHAP_CRM.map((t) => ({ tahap: t, n: crm.rows.find((r) => r.tahap === t)?.n || 0, nilai: crm.rows.find((r) => r.tahap === t)?.nilai || 0 })),
      kas,
      saldo,
      log: log.rows,
      sales: sales.rows,
      trialHabis: trialHabis.rows,
      menunggu: menunggu.rows,
    });
  } catch (e) {
    next(e);
  }
});

// ---- CRM leads (manual) ----
router.get('/leads', async (req, res, next) => {
  try {
    const tahap = TAHAP_CRM.includes(req.query.tahap) ? req.query.tahap : null;
    const status = ['jalan', 'menang', 'gagal'].includes(req.query.status) ? req.query.status : 'jalan';
    const q = teks(req.query.q, 60);
    const pola = q ? '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%' : null;
    const { rows } = await query(
      `SELECT l.*, l.nilai::float AS nilai, a.nama AS pemilik_nama
       FROM mj_lead l LEFT JOIN mj_admin a ON a.id = l.pemilik_id
       WHERE ($1::text IS NULL OR l.tahap = $1)
         AND (CASE $2 WHEN 'jalan' THEN l.hasil IS NULL ELSE l.hasil = $2 END)
         AND ($3::text IS NULL OR l.perusahaan ILIKE $3 OR l.pic_nama ILIKE $3 OR l.email ILIKE $3)
       ORDER BY l.updated_at DESC LIMIT 300`,
      [tahap, status, pola]
    );
    const { rows: ringkas } = await query(
      `SELECT tahap, count(*)::int AS n, COALESCE(SUM(nilai),0)::float AS nilai FROM mj_lead WHERE hasil IS NULL GROUP BY tahap`
    );
    res.json({ leads: rows, ringkas: TAHAP_CRM.map((t) => ({ tahap: t, n: ringkas.find((r) => r.tahap === t)?.n || 0, nilai: ringkas.find((r) => r.tahap === t)?.nilai || 0 })) });
  } catch (e) {
    next(e);
  }
});

function bersihkanLead(b, sebagian = false) {
  const x = {};
  for (const [k, n] of [['perusahaan', 120], ['pic_nama', 80], ['pic_jabatan', 80], ['email', 120], ['telepon', 30], ['sumber', 40]]) {
    if (b[k] !== undefined || !sebagian) x[k] = teks(b[k], n) || null;
  }
  if (b.nilai !== undefined || !sebagian) x.nilai = angkaPositif(b.nilai) ?? 0;
  if (b.tahap !== undefined) x.tahap = TAHAP_CRM.includes(b.tahap) ? b.tahap : 'baru';
  if (b.hasil !== undefined) x.hasil = ['menang', 'gagal'].includes(b.hasil) ? b.hasil : null;
  if (b.pemilik_id !== undefined) x.pemilik_id = POLA_UUID.test(b.pemilik_id || '') ? b.pemilik_id : null;
  return x;
}

router.post('/leads', async (req, res, next) => {
  try {
    const x = bersihkanLead(req.body);
    if (!x.perusahaan) return res.status(400).json({ error: 'Nama perusahaan/prospek wajib diisi' });
    const { rows } = await query(
      `INSERT INTO mj_lead (perusahaan, pic_nama, pic_jabatan, email, telepon, sumber, nilai, tahap, pemilik_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *, nilai::float AS nilai`,
      [x.perusahaan, x.pic_nama, x.pic_jabatan, x.email, x.telepon, x.sumber, x.nilai, x.tahap || 'baru', x.pemilik_id || req.admin.id]
    );
    await query("INSERT INTO mj_lead_aktivitas (lead_id, admin_nama, jenis, isi) VALUES ($1,$2,'tahap','Lead dibuat')", [rows[0].id, req.admin.nama]);
    await catatLog(req, 'ops.lead.tambah', { perusahaan: x.perusahaan });
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.patch('/leads/:id', async (req, res, next) => {
  try {
    if (!POLA_UUID.test(req.params.id)) return res.status(404).json({ error: 'Lead tidak ditemukan' });
    const x = bersihkanLead(req.body, true);
    if (x.perusahaan === null) return res.status(400).json({ error: 'Nama perusahaan/prospek wajib diisi' });
    const kolom = Object.keys(x);
    if (!kolom.length) return res.status(400).json({ error: 'Nggak ada yang diubah' });
    const { rows: lama } = await query('SELECT tahap, hasil, perusahaan FROM mj_lead WHERE id=$1', [req.params.id]);
    if (!lama.length) return res.status(404).json({ error: 'Lead tidak ditemukan' });
    const { rows } = await query(
      `UPDATE mj_lead SET ${kolom.map((k, i) => `${k}=$${i + 2}`).join(', ')}, updated_at=now() WHERE id=$1 RETURNING *, nilai::float AS nilai`,
      [req.params.id, ...kolom.map((k) => x[k])]
    );
    // Pindah tahap / ditutup kecatat di riwayat lead-nya.
    const catat = [];
    if (x.tahap && x.tahap !== lama[0].tahap) catat.push(`Tahap: ${lama[0].tahap} → ${x.tahap}`);
    if (x.hasil !== undefined && x.hasil !== lama[0].hasil) catat.push(x.hasil ? `Ditandai ${x.hasil.toUpperCase()}` : 'Dibuka lagi');
    for (const isi of catat) await query("INSERT INTO mj_lead_aktivitas (lead_id, admin_nama, jenis, isi) VALUES ($1,$2,'tahap',$3)", [req.params.id, req.admin.nama, isi]);
    await catatLog(req, 'ops.lead.ubah', { perusahaan: rows[0].perusahaan, ...(catat.length ? { perubahan: catat.join('; ') } : {}) });
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.delete('/leads/:id', async (req, res, next) => {
  try {
    if (!POLA_UUID.test(req.params.id)) return res.status(404).json({ error: 'Lead tidak ditemukan' });
    const { rows } = await query('DELETE FROM mj_lead WHERE id=$1 RETURNING perusahaan', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Lead tidak ditemukan' });
    await catatLog(req, 'ops.lead.hapus', { perusahaan: rows[0].perusahaan });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get('/leads/:id/aktivitas', async (req, res, next) => {
  try {
    if (!POLA_UUID.test(req.params.id)) return res.json([]);
    const { rows } = await query('SELECT * FROM mj_lead_aktivitas WHERE lead_id=$1 ORDER BY created_at DESC LIMIT 100', [req.params.id]);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.post('/leads/:id/aktivitas', async (req, res, next) => {
  try {
    if (!POLA_UUID.test(req.params.id)) return res.status(404).json({ error: 'Lead tidak ditemukan' });
    const isi = teks(req.body.isi, 1000);
    const jenis = ['catatan', 'telepon', 'meeting', 'email'].includes(req.body.jenis) ? req.body.jenis : 'catatan';
    if (!isi) return res.status(400).json({ error: 'Catatannya diisi dulu' });
    const { rows } = await query('INSERT INTO mj_lead_aktivitas (lead_id, admin_nama, jenis, isi) VALUES ($1,$2,$3,$4) RETURNING *', [
      req.params.id,
      req.admin.nama,
      jenis,
      isi,
    ]);
    await query('UPDATE mj_lead SET updated_at=now() WHERE id=$1', [req.params.id]);
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

// ---- Keuangan ----
router.get('/keuangan', async (req, res, next) => {
  try {
    const bulan = /^\d{4}-\d{2}$/.test(req.query.bulan || '') ? req.query.bulan : new Date().toISOString().slice(0, 7);
    const awal = `${bulan}-01`;
    const [manual, wp, perKategori, kas, saldo] = await Promise.all([
      query(
        `SELECT id, jenis, tanggal, kategori, deskripsi, pihak, jumlah::float AS jumlah, metode, admin_nama, 'manual' AS sumber
         FROM mj_transaksi WHERE tanggal >= $1::date AND tanggal < ($1::date + interval '1 month') ORDER BY tanggal DESC, created_at DESC`,
        [awal]
      ),
      qWp(
        `SELECT p.order_id AS id, 'masuk' AS jenis, p.updated_at::date AS tanggal, 'langganan' AS kategori,
                'Langganan Warung Pintar ' || p.plan AS deskripsi, w.nama || ' (@' || w.username || ')' AS pihak,
                COALESCE(p.jumlah_bersih, p.jumlah)::float AS jumlah, p.payment_type AS metode, NULL AS admin_nama, 'midtrans' AS sumber
         FROM pembayaran p JOIN warung w ON w.id = p.warung_id
         WHERE p.status='settlement' AND p.updated_at >= $1::date AND p.updated_at < ($1::date + interval '1 month')`,
        [awal]
      ),
      query(
        `SELECT kategori, COALESCE(SUM(jumlah),0)::float AS total FROM mj_transaksi
         WHERE jenis='keluar' AND tanggal >= $1::date AND tanggal < ($1::date + interval '1 month') GROUP BY kategori ORDER BY total DESC`,
        [awal]
      ),
      arusKas(6),
      saldoTotal(),
    ]);
    const transaksi = [...manual.rows, ...wp.rows].sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal)));
    const masuk = transaksi.filter((t) => t.jenis === 'masuk').reduce((a, t) => a + t.jumlah, 0);
    const keluar = transaksi.filter((t) => t.jenis === 'keluar').reduce((a, t) => a + t.jumlah, 0);
    res.json({ bulan, masuk, keluar, selisih: masuk - keluar, saldo, perKategori: perKategori.rows, kas, transaksi, kategori: { masuk: KATEGORI_MASUK, keluar: KATEGORI_KELUAR } });
  } catch (e) {
    next(e);
  }
});

router.post('/keuangan/transaksi', async (req, res, next) => {
  try {
    const jenis = ['masuk', 'keluar'].includes(req.body.jenis) ? req.body.jenis : null;
    const daftar = jenis === 'masuk' ? KATEGORI_MASUK : KATEGORI_KELUAR;
    const kategori = daftar.includes(req.body.kategori) ? req.body.kategori : 'lainnya';
    const deskripsi = teks(req.body.deskripsi, 200);
    const jumlah = angkaPositif(req.body.jumlah);
    const tanggal = /^\d{4}-\d{2}-\d{2}$/.test(req.body.tanggal || '') ? req.body.tanggal : new Date().toISOString().slice(0, 10);
    if (!jenis) return res.status(400).json({ error: 'Pilih pemasukan atau pengeluaran' });
    if (!deskripsi) return res.status(400).json({ error: 'Deskripsi wajib diisi' });
    if (!jumlah) return res.status(400).json({ error: 'Jumlah wajib diisi' });
    const { rows } = await query(
      `INSERT INTO mj_transaksi (jenis, tanggal, kategori, deskripsi, pihak, jumlah, metode, admin_nama)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *, jumlah::float AS jumlah`,
      [jenis, tanggal, kategori, deskripsi, teks(req.body.pihak, 120) || null, jumlah, teks(req.body.metode, 40) || null, req.admin.nama]
    );
    await catatLog(req, 'ops.keuangan.catat', { jenis, jumlah, deskripsi });
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.delete('/keuangan/transaksi/:id', async (req, res, next) => {
  try {
    if (!POLA_UUID.test(req.params.id)) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });
    const { rows } = await query('DELETE FROM mj_transaksi WHERE id=$1 RETURNING jenis, jumlah, deskripsi', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });
    await catatLog(req, 'ops.keuangan.hapus', { jenis: rows[0].jenis, jumlah: Number(rows[0].jumlah), deskripsi: rows[0].deskripsi });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---- Notifikasi: dirakit dari warung daftar baru, pembayaran lunas, & aktivitas admin LAIN (30 hari). ----
async function feedNotifikasi(admin) {
  const [daftar, bayar, log, baca] = await Promise.all([
    qWp(
      `SELECT 'warung_daftar' AS jenis, w.created_at AS waktu, w.nama AS judul, '@' || w.username || COALESCE(' · sales ' || s.kode, '') AS isi
       FROM warung w LEFT JOIN sales s ON s.id = w.sales_id
       WHERE NOT COALESCE(w.demo,false) AND w.created_at >= now() - interval '30 days' ORDER BY w.created_at DESC LIMIT 30`
    ).catch(() => ({ rows: [] })),
    qWp(
      `SELECT 'bayar' AS jenis, p.updated_at AS waktu, w.nama AS judul, 'Bayar ' || p.plan || ' Rp ' || to_char(p.jumlah, 'FM999G999G999') AS isi
       FROM pembayaran p JOIN warung w ON w.id = p.warung_id
       WHERE p.status='settlement' AND p.updated_at >= now() - interval '30 days' ORDER BY p.updated_at DESC LIMIT 30`
    ),
    query(
      `SELECT 'aktivitas' AS jenis, created_at AS waktu, COALESCE(admin_nama, '(sistem)') AS judul, aksi AS isi, detail
       FROM mj_log WHERE created_at >= now() - interval '30 days' AND admin_id IS DISTINCT FROM $1 ORDER BY created_at DESC LIMIT 30`,
      [admin.id]
    ),
    query('SELECT dibaca_sampai FROM mj_notif_baca WHERE admin_id=$1', [admin.id]),
  ]);
  const dibacaSampai = baca.rows[0]?.dibaca_sampai || admin.created_at;
  const items = [...daftar.rows, ...bayar.rows, ...log.rows]
    .sort((a, b) => new Date(b.waktu) - new Date(a.waktu))
    .slice(0, 60)
    .map((n) => ({ ...n, baru: new Date(n.waktu) > new Date(dibacaSampai) }));
  return { items, belumDibaca: items.filter((n) => n.baru).length };
}

router.get('/notifikasi', async (req, res, next) => {
  try {
    res.json(await feedNotifikasi(req.admin));
  } catch (e) {
    next(e);
  }
});

router.get('/notifikasi/jumlah', async (req, res, next) => {
  try {
    res.json({ belumDibaca: (await feedNotifikasi(req.admin)).belumDibaca });
  } catch (e) {
    next(e);
  }
});

router.post('/notifikasi/baca', async (req, res, next) => {
  try {
    await query(
      'INSERT INTO mj_notif_baca (admin_id, dibaca_sampai) VALUES ($1, now()) ON CONFLICT (admin_id) DO UPDATE SET dibaca_sampai = now()',
      [req.admin.id]
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Aktivitas milik admin yang lagi login (halaman Profile).
router.get('/saya/aktivitas', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id, aksi, detail, created_at FROM mj_log WHERE admin_id=$1 ORDER BY created_at DESC LIMIT 50', [req.admin.id]);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

export default router;
