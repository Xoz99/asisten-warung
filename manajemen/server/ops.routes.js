import { Router } from 'express';
import { catatLog, query } from './db.js';
import { sinkronWarungKeCrm } from './crmSinkron.js';
import { pastikanTabelSales, pool as poolWp } from './produk/warung-pintar/db.js';

// Makalin Ops tahap 1: dashboard gabungan, CRM leads manual, keuangan (Midtrans + catatan manual), notifikasi.
// Data Warung Pintar dibaca langsung dari database-nya (produk/warung-pintar/db.js) kalau produknya aktif.
const router = Router();
const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const qWp = (text, params) => (poolWp ? poolWp.query(text, params) : Promise.resolve({ rows: [] }));

// Tahap pipeline CRM: awareness -> trial 7 hari -> konversi (bayar pertama) -> repeat order; stuck = macet, perlu didorong.
export const TAHAP_CRM = ['awareness', 'trial', 'konversi', 'repeat_order', 'stuck'];
// Nama tahap lama -> baru (lead yang dibikin sebelum tahapnya diganti ikut dipindah sekali pas server nyala).
const TAHAP_LAMA = { baru: 'awareness', kualifikasi: 'trial', proposal: 'konversi', negosiasi: 'konversi', closing: 'repeat_order' };
// Biar impor CSV nerima tulisan yang umum dipakai orang.
const ALIAS_TAHAP = { ...TAHAP_LAMA, 'trial 7 hari': 'trial', repeat: 'repeat_order', 'repeat order': 'repeat_order', macet: 'stuck' };
const NAMA_TAHAP = { awareness: 'Awareness', trial: 'Trial 7 hari', konversi: 'Konversi', repeat_order: 'Repeat order', stuck: 'Stuck' };
const tahapDari = (v) => {
  const t = String(v || '').trim().toLowerCase();
  return TAHAP_CRM.includes(t) ? t : ALIAS_TAHAP[t] || 'awareness';
};
const PRIORITAS = ['rendah', 'sedang', 'tinggi'];
// Jenis catatan yang boleh ditulis manual (tahap/data/kunjungan/checklist dicatat sistem).
const JENIS_CATATAN = ['catatan', 'follow_up', 'kendala', 'telepon', 'meeting', 'email', 'wa', 'eskalasi'];
const KATEGORI_KELUAR = ['gaji', 'komisi', 'operasional', 'marketing', 'server', 'pajak', 'lainnya'];
const KATEGORI_MASUK = ['penjualan', 'proyek', 'investasi', 'lainnya'];

let siap = null;
export function pastikanTabelOps() {
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
        tahap TEXT NOT NULL DEFAULT 'awareness',
        hasil TEXT, -- null = masih jalan | 'menang' | 'gagal'
        pemilik_id UUID REFERENCES mj_admin(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      )`);
      // Nomor urut buat ID yang enak disebut (LD-2026-0001) & kapan masuk tahap sekarang (umur di tahap, di Kanban).
      await query('ALTER TABLE mj_lead ADD COLUMN IF NOT EXISTS nomor BIGSERIAL');
      await query('ALTER TABLE mj_lead ADD COLUMN IF NOT EXISTS tahap_sejak TIMESTAMPTZ NOT NULL DEFAULT now()');
      await query("ALTER TABLE mj_lead ALTER COLUMN tahap SET DEFAULT 'awareness'");
      for (const [lama, baru] of Object.entries(TAHAP_LAMA)) await query('UPDATE mj_lead SET tahap=$2 WHERE tahap=$1', [lama, baru]);
      await query(`CREATE TABLE IF NOT EXISTS mj_lead_aktivitas (
        id BIGSERIAL PRIMARY KEY,
        lead_id UUID NOT NULL REFERENCES mj_lead(id) ON DELETE CASCADE,
        admin_nama TEXT,
        jenis TEXT NOT NULL DEFAULT 'catatan',
        isi TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      )`);
      // Detail lead v2: data toko, prioritas, alasan gagal, foto warung, checklist follow-up.
      await query(`ALTER TABLE mj_lead ADD COLUMN IF NOT EXISTS alamat TEXT, ADD COLUMN IF NOT EXISTS jenis_usaha TEXT,
        ADD COLUMN IF NOT EXISTS prioritas TEXT NOT NULL DEFAULT 'sedang', ADD COLUMN IF NOT EXISTS alasan_gagal TEXT, ADD COLUMN IF NOT EXISTS foto TEXT`);
      await query(`CREATE TABLE IF NOT EXISTS mj_lead_checklist (
        id BIGSERIAL PRIMARY KEY,
        lead_id UUID NOT NULL REFERENCES mj_lead(id) ON DELETE CASCADE,
        teks TEXT NOT NULL, selesai BOOLEAN NOT NULL DEFAULT false,
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
// Filter, urutan, & halaman dikerjain di server. `semua=1` = tanpa halaman (buat Kanban & ekspor, maks 2000).
const URUTAN_LEAD = {
  terbaru: 'l.updated_at DESC',
  terlama: 'l.updated_at ASC',
  nilai_tinggi: 'l.nilai DESC, l.updated_at DESC',
  nilai_rendah: 'l.nilai ASC, l.updated_at DESC',
  nama: 'l.perusahaan ASC',
};
const RENTANG_NILAI = { kecil: [0, 10e6], sedang: [10e6, 100e6], besar: [100e6, null] };

// Kartu yang dibikin otomatis dari toko (warung_id) dan dihapus admin jangan dibikin ulang sama sinkron.
async function abaikanKartuOtomatis(ids) {
  await query(
    `INSERT INTO mj_crm_abaikan (warung_id) SELECT warung_id FROM mj_lead WHERE id = ANY($1::uuid[]) AND warung_id IS NOT NULL ON CONFLICT DO NOTHING`,
    [ids]
  ).catch(() => {}); // tabelnya dibikin sinkron; kalau belum ada, berarti belum ada kartu otomatis
}

router.get('/leads', async (req, res, next) => {
  try {
    await sinkronWarungKeCrm(); // toko yang baru daftar lewat link/QR sales jadi kartu dulu
    const f = req.query;
    const tahap = TAHAP_CRM.includes(f.tahap) ? f.tahap : null;
    const status = ['jalan', 'menang', 'gagal', 'semua'].includes(f.status) ? f.status : 'jalan';
    const q = teks(f.q, 60);
    const pola = q ? '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%' : null;
    const sumber = teks(f.sumber, 40) || null;
    const pemilik = POLA_UUID.test(f.pemilik || '') ? f.pemilik : null;
    const nilai = RENTANG_NILAI[f.nilai] || [null, null];
    const periode = [7, 30, 90].includes(Number(f.periode)) ? Number(f.periode) : null;
    const urut = URUTAN_LEAD[f.urut] || URUTAN_LEAD.terbaru;
    const semua = f.semua === '1';
    const perHalaman = semua ? 2000 : 25;
    const halaman = semua ? 1 : Math.max(1, Math.floor(Number(f.halaman) || 1));
    const where = `($1::text IS NULL OR l.tahap = $1)
         AND (CASE $2 WHEN 'jalan' THEN l.hasil IS NULL WHEN 'semua' THEN true ELSE l.hasil = $2 END)
         AND ($3::text IS NULL OR l.perusahaan ILIKE $3 OR l.pic_nama ILIKE $3 OR l.email ILIKE $3 OR l.telepon ILIKE $3)
         AND ($4::text IS NULL OR l.sumber = $4)
         AND ($5::uuid IS NULL OR l.pemilik_id = $5)
         AND ($6::numeric IS NULL OR l.nilai >= $6) AND ($7::numeric IS NULL OR l.nilai < $7)
         AND ($8::int IS NULL OR l.created_at >= now() - make_interval(days => $8))`;
    const params = [tahap, status, pola, sumber, pemilik, nilai[0], nilai[1], periode];
    const [{ rows }, { rows: jumlah }, { rows: ringkas }, { rows: sumberAda }] = await Promise.all([
      query(
        `SELECT l.*, l.nilai::float AS nilai, a.nama AS pemilik_nama,
                'LD-' || to_char(l.created_at, 'YYYY') || '-' || lpad(l.nomor::text, 4, '0') AS kode
         FROM mj_lead l LEFT JOIN mj_admin a ON a.id = l.pemilik_id
         WHERE ${where} ORDER BY ${urut} LIMIT ${perHalaman} OFFSET ${(halaman - 1) * perHalaman}`,
        params
      ),
      query(`SELECT count(*)::int AS n FROM mj_lead l WHERE ${where}`, params),
      query(`SELECT tahap, count(*)::int AS n, COALESCE(SUM(nilai),0)::float AS nilai FROM mj_lead WHERE hasil IS NULL GROUP BY tahap`),
      query(`SELECT DISTINCT sumber FROM mj_lead WHERE sumber IS NOT NULL ORDER BY sumber`),
    ]);
    res.json({
      leads: rows,
      total: jumlah[0].n,
      halaman,
      perHalaman,
      sumber: sumberAda.map((r) => r.sumber),
      ringkas: TAHAP_CRM.map((t) => ({ tahap: t, n: ringkas.find((r) => r.tahap === t)?.n || 0, nilai: ringkas.find((r) => r.tahap === t)?.nilai || 0 })),
    });
  } catch (e) {
    next(e);
  }
});

// Aksi massal dari tabel (centang beberapa lead): ubah tahap, tugaskan ke admin, atau hapus.
router.post('/leads/massal', async (req, res, next) => {
  try {
    const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).filter((id) => POLA_UUID.test(id)).slice(0, 500);
    if (!ids.length) return res.status(400).json({ error: 'Pilih lead dulu' });
    const { aksi, nilai } = req.body;
    let n = 0;
    if (aksi === 'tahap') {
      if (!TAHAP_CRM.includes(nilai)) return res.status(400).json({ error: 'Tahap nggak dikenal' });
      const { rows } = await query(
        `UPDATE mj_lead SET tahap=$2, tahap_sejak = CASE WHEN tahap <> $2 THEN now() ELSE tahap_sejak END, updated_at=now()
         WHERE id = ANY($1) RETURNING id`,
        [ids, nilai]
      );
      for (const r of rows) await query("INSERT INTO mj_lead_aktivitas (lead_id, admin_nama, jenis, isi) VALUES ($1,$2,'tahap',$3)", [r.id, req.admin.nama, `Tahap diubah massal jadi ${NAMA_TAHAP[nilai]}`]);
      n = rows.length;
    } else if (aksi === 'pemilik') {
      if (!POLA_UUID.test(nilai || '')) return res.status(400).json({ error: 'Pilih admin yang ditugaskan' });
      n = (await query('UPDATE mj_lead SET pemilik_id=$2, updated_at=now() WHERE id = ANY($1)', [ids, nilai])).rowCount;
    } else if (aksi === 'hapus') {
      await abaikanKartuOtomatis(ids);
      n = (await query('DELETE FROM mj_lead WHERE id = ANY($1)', [ids])).rowCount;
    } else {
      return res.status(400).json({ error: 'Aksi nggak dikenal' });
    }
    await catatLog(req, 'ops.lead.massal', { aksi, jumlah: n, ...(aksi !== 'hapus' ? { nilai } : {}) });
    res.json({ ok: true, n });
  } catch (e) {
    next(e);
  }
});

// Impor dari CSV (sudah di-parse di browser jadi array objek). Baris tanpa nama perusahaan dilewati.
router.post('/leads/impor', async (req, res, next) => {
  try {
    const baris = (Array.isArray(req.body.baris) ? req.body.baris : []).slice(0, 500);
    let masuk = 0;
    for (const b of baris) {
      const x = bersihkanLead({ ...b, tahap: tahapDari(b.tahap) });
      if (!x.perusahaan) continue;
      const { rows } = await query(
        `INSERT INTO mj_lead (perusahaan, pic_nama, pic_jabatan, email, telepon, sumber, nilai, tahap, pemilik_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [x.perusahaan, x.pic_nama, x.pic_jabatan, x.email, x.telepon, x.sumber, x.nilai, x.tahap, req.admin.id]
      );
      await query("INSERT INTO mj_lead_aktivitas (lead_id, admin_nama, jenis, isi) VALUES ($1,$2,'tahap','Lead diimpor dari CSV')", [rows[0].id, req.admin.nama]);
      masuk++;
    }
    await catatLog(req, 'ops.lead.impor', { jumlah: masuk, dilewati: baris.length - masuk });
    res.json({ masuk, dilewati: baris.length - masuk });
  } catch (e) {
    next(e);
  }
});

function bersihkanLead(b, sebagian = false) {
  const x = {};
  for (const [k, n] of [['perusahaan', 120], ['pic_nama', 80], ['pic_jabatan', 80], ['email', 120], ['telepon', 30], ['sumber', 40], ['alamat', 200], ['jenis_usaha', 60]]) {
    if (b[k] !== undefined || !sebagian) x[k] = teks(b[k], n) || null;
  }
  if (b.nilai !== undefined || !sebagian) x.nilai = angkaPositif(b.nilai) ?? 0;
  if (b.tahap !== undefined) x.tahap = tahapDari(b.tahap);
  if (b.hasil !== undefined) x.hasil = ['menang', 'gagal'].includes(b.hasil) ? b.hasil : null;
  if (b.pemilik_id !== undefined) x.pemilik_id = POLA_UUID.test(b.pemilik_id || '') ? b.pemilik_id : null;
  if (b.prioritas !== undefined) x.prioritas = PRIORITAS.includes(b.prioritas) ? b.prioritas : 'sedang';
  if (b.alasan_gagal !== undefined) x.alasan_gagal = teks(b.alasan_gagal, 80) || null;
  // Alamat & jenis usaha cuma ikut kalau dikirim (form tambah lead lama nggak punya kolom ini).
  if (sebagian === false) for (const k of ['alamat', 'jenis_usaha']) if (b[k] === undefined) delete x[k];
  return x;
}

router.post('/leads', async (req, res, next) => {
  try {
    const x = bersihkanLead(req.body);
    if (!x.perusahaan) return res.status(400).json({ error: 'Nama perusahaan/prospek wajib diisi' });
    const { rows } = await query(
      `INSERT INTO mj_lead (perusahaan, pic_nama, pic_jabatan, email, telepon, sumber, nilai, tahap, pemilik_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *, nilai::float AS nilai`,
      [x.perusahaan, x.pic_nama, x.pic_jabatan, x.email, x.telepon, x.sumber, x.nilai, x.tahap || 'awareness', x.pemilik_id || req.admin.id]
    );
    await query("INSERT INTO mj_lead_aktivitas (lead_id, admin_nama, jenis, isi) VALUES ($1,$2,'tahap','Lead dibuat')", [rows[0].id, req.admin.nama]);
    await catatLog(req, 'ops.lead.tambah', { perusahaan: x.perusahaan });
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

// Ubah lead + catat riwayatnya. Dipakai admin (/leads/:id) dan sales buat kartu miliknya (/lapangan/crm/:id).
const galat = (pesan, status = 400) => Object.assign(new Error(pesan), { status });
export async function ubahLead(req, id, body) {
  if (!POLA_UUID.test(id)) throw galat('Lead tidak ditemukan', 404);
  const x = bersihkanLead(body, true);
  if (x.perusahaan === null) throw galat('Nama perusahaan/prospek wajib diisi');
  const kolom = Object.keys(x);
  if (!kolom.length) throw galat('Nggak ada yang diubah');
  if (x.hasil !== 'gagal' && x.hasil !== undefined) x.alasan_gagal = null; // dibuka lagi / menang: alasan gagal dibuang
  const { rows: lama } = await query('SELECT tahap, hasil, perusahaan, prioritas, pemilik_id FROM mj_lead WHERE id=$1', [id]);
  if (!lama.length) throw galat('Lead tidak ditemukan', 404);
  const { rows } = await query(
    `UPDATE mj_lead SET ${kolom.map((k, i) => `${k}=$${i + 2}`).join(', ')}, updated_at=now()${x.tahap && x.tahap !== lama[0].tahap ? ', tahap_sejak=now()' : ''}
     WHERE id=$1 RETURNING *, nilai::float AS nilai`,
    [id, ...kolom.map((k) => x[k])]
  );
  // Pindah tahap / ditutup kecatat di riwayat lead-nya.
  const catat = [];
  if (x.tahap && x.tahap !== lama[0].tahap) catat.push(`Tahap: ${NAMA_TAHAP[lama[0].tahap] || lama[0].tahap} → ${NAMA_TAHAP[x.tahap]}`);
  if (x.hasil !== undefined && x.hasil !== lama[0].hasil)
    catat.push(x.hasil ? `Ditandai ${x.hasil.toUpperCase()}${x.hasil === 'gagal' && x.alasan_gagal ? `: ${x.alasan_gagal}` : ''}` : 'Dibuka lagi');
  for (const isi of catat) await query("INSERT INTO mj_lead_aktivitas (lead_id, admin_nama, jenis, isi) VALUES ($1,$2,'tahap',$3)", [id, req.admin.nama, isi]);
  // Perubahan data lain (prioritas, sales PIC, isi kontak) kecatat sebagai "data".
  const data = [];
  if (x.prioritas && x.prioritas !== lama[0].prioritas) data.push(`Prioritas: ${lama[0].prioritas} → ${x.prioritas}`);
  if (x.pemilik_id !== undefined && x.pemilik_id !== lama[0].pemilik_id) {
    const { rows: p } = await query('SELECT nama FROM mj_admin WHERE id=$1', [x.pemilik_id]);
    data.push(`Sales PIC diganti jadi ${p[0]?.nama || '-'}`);
  }
  const kolomData = kolom.filter((k) => ['perusahaan', 'pic_nama', 'pic_jabatan', 'email', 'telepon', 'alamat', 'jenis_usaha', 'nilai', 'sumber'].includes(k));
  const LABEL = { perusahaan: 'nama', pic_nama: 'PIC', pic_jabatan: 'jabatan PIC', email: 'email', telepon: 'telepon', alamat: 'alamat', jenis_usaha: 'jenis usaha', nilai: 'estimasi deal', sumber: 'sumber' };
  if (kolomData.length && body._catatUbah) data.push(`Data diubah: ${kolomData.map((k) => LABEL[k]).join(', ')}`);
  for (const isi of data) await query("INSERT INTO mj_lead_aktivitas (lead_id, admin_nama, jenis, isi) VALUES ($1,$2,'data',$3)", [id, req.admin.nama, isi]);
  await catatLog(req, 'ops.lead.ubah', { perusahaan: rows[0].perusahaan, ...(catat.length ? { perubahan: catat.join('; ') } : {}) });
  return rows[0];
}

router.patch('/leads/:id', async (req, res, next) => {
  try {
    res.json(await ubahLead(req, req.params.id, req.body));
  } catch (e) {
    next(e);
  }
});

router.delete('/leads/:id', async (req, res, next) => {
  try {
    if (!POLA_UUID.test(req.params.id)) return res.status(404).json({ error: 'Lead tidak ditemukan' });
    await abaikanKartuOtomatis([req.params.id]);
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
    const jenis = JENIS_CATATAN.includes(req.body.jenis) ? req.body.jenis : 'catatan';
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
