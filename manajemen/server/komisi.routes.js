import { Router } from 'express';
import { catatLog, query, pool } from './db.js';
import { pastikanTabelOps } from './ops.routes.js';
import { query as queryWp, pastikanTabelSales } from './produk/warung-pintar/db.js';
import { rekeningPerSales } from './tim.routes.js';
import { URL_MAKALIN, emailAktif, kirimEmail, susunEmail } from './utils/email.js';

// Bagi hasil (komisi) Sales Partner - PRD v0.2 + keputusan pemilik (Sep 2026):
//   order pertama per toko      30%
//   perpanjangan                20%, atau 25% kalau bulan itu sales dapat LEBIH DARI 20 toko baru (bayar pertama)
//   paket permanen              20% flat, apa pun posisinya (dasar: harga yang ditagih, Rp3.650.000)
//   pajak                       5% dari total komisi (NV-02: tarif belum dicek ke konsultan pajak)
//   pencairan                   tiap tanggal 5, buat komisi bulan sebelumnya
// Komisi punya sales yang MEGANG toko pas pembayaran lunas (PRD §15.1). Toko tanpa sales (house account) nggak ada
// komisinya. Satu pembayaran cuma boleh jadi satu komisi (order_id unik di mj_komisi).
//
// NOT VERIFIED (NV-03): "lunas pada" = updated_at di tabel pembayaran (diisi pas webhook settlement), belum dari field
// waktu Midtrans. Aturan pindah pemilik (D-45/D-46/D-67), chargeback (D-21), dan bonus rekrutmen belum dihitung di sini.
const router = Router();
export const RATE = { pertama: 0.3, perpanjangan: 0.2, perpanjanganTier: 0.25, permanen: 0.2, pajak: 0.05 };
export const AMBANG_TOKO_BARU = 20; // > 20 toko baru sebulan -> perpanjangan 25%
const TANGGAL_CAIR = 5;
const POLA_PERIODE = /^\d{4}-(0[1-9]|1[0-2])$/;
const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const salah = (pesan, status = 400) => Object.assign(new Error(pesan), { status });
const teks = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

const periodeSekarang = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7); // WIB
const awalPeriode = (p) => new Date(`${p}-01T00:00:00+07:00`);
const periodeBerikut = (p) => {
  const [y, m] = p.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};
export const jadwalCair = (p) => `${periodeBerikut(p)}-${String(TANGGAL_CAIR).padStart(2, '0')}`;

let siap = null;
function pastikanTabel() {
  if (!siap) {
    siap = (async () => {
      await pastikanTabelOps(); // mj_transaksi (pencairan dicatat sebagai pengeluaran)
      await query(`CREATE TABLE IF NOT EXISTS mj_komisi_tutup (
        periode TEXT PRIMARY KEY, ditutup_at TIMESTAMPTZ DEFAULT now(), ditutup_oleh TEXT
      )`);
      await query(`CREATE TABLE IF NOT EXISTS mj_komisi_periode (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        periode TEXT NOT NULL, wp_sales_id UUID NOT NULL, sales_kode TEXT, sales_nama TEXT,
        toko_baru INT NOT NULL, rate_perpanjangan NUMERIC NOT NULL,
        bruto NUMERIC NOT NULL, pajak NUMERIC NOT NULL, neto NUMERIC NOT NULL,
        dicairkan_tanggal DATE, dicairkan_at TIMESTAMPTZ, dicairkan_oleh TEXT, metode TEXT, catatan TEXT, transaksi_id UUID,
        created_at TIMESTAMPTZ DEFAULT now(),
        UNIQUE (periode, wp_sales_id)
      )`);
      await query(`CREATE TABLE IF NOT EXISTS mj_komisi (
        id BIGSERIAL PRIMARY KEY,
        periode TEXT NOT NULL, wp_sales_id UUID NOT NULL,
        order_id TEXT UNIQUE NOT NULL, -- satu pembayaran = satu komisi
        warung_id UUID, warung_nama TEXT, plan TEXT, jumlah NUMERIC NOT NULL, urutan INT,
        jenis TEXT NOT NULL, rate NUMERIC NOT NULL, komisi NUMERIC NOT NULL, lunas_pada TIMESTAMPTZ,
        susulan BOOLEAN NOT NULL DEFAULT false
      )`);
      await query('CREATE INDEX IF NOT EXISTS idx_mj_komisi_periode ON mj_komisi (periode, wp_sales_id)');
      // Salinan rekening tujuan waktu dicairin (rekening di profil sales bisa ganti belakangan).
      await query('ALTER TABLE mj_komisi_periode ADD COLUMN IF NOT EXISTS rekening_tujuan TEXT');
      // Pemberitahuan ke sales: kapan dia lihat, dan konfirmasi balik (masuk / belum masuk).
      await query(`ALTER TABLE mj_komisi_periode ADD COLUMN IF NOT EXISTS dilihat_sales_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS konfirmasi_sales TEXT, ADD COLUMN IF NOT EXISTS konfirmasi_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS konfirmasi_catatan TEXT,
        ADD COLUMN IF NOT EXISTS email_status TEXT, ADD COLUMN IF NOT EXISTS email_at TIMESTAMPTZ`);
    })().catch((e) => {
      siap = null;
      throw e;
    });
  }
  return siap;
}
router.use(['/komisi', '/lapangan/komisi'], async (req, res, next) => {
  try {
    await pastikanTabel();
    next();
  } catch (e) {
    next(e);
  }
});

// Pembayaran lunas + pemilik pada saat bayar + urutan bayar per toko (1 = order pertama).
async function ambilPembayaran({ dari, sampai, salesId = null }) {
  await pastikanTabelSales();
  const { rows } = await queryWp(
    `WITH p AS (
       SELECT p.*, row_number() OVER (PARTITION BY p.warung_id ORDER BY p.updated_at, p.created_at) AS urutan
       FROM pembayaran p WHERE p.status = 'settlement'
     )
     SELECT p.order_id, p.warung_id, w.nama AS warung_nama, p.plan, p.jumlah::float AS jumlah, p.updated_at AS lunas_pada,
            p.urutan::int AS urutan, k.sales_id, s.kode AS sales_kode, s.nama AS sales_nama
     FROM p JOIN warung w ON w.id = p.warung_id AND NOT COALESCE(w.demo, false)
     JOIN LATERAL (
       SELECT k.sales_id FROM kepemilikan_warung k WHERE k.warung_id = p.warung_id
       ORDER BY (k.valid_from <= p.updated_at) DESC, CASE WHEN k.valid_from <= p.updated_at THEN k.valid_from END DESC, k.valid_from ASC
       LIMIT 1
     ) k ON k.sales_id IS NOT NULL
     LEFT JOIN sales s ON s.id = k.sales_id
     WHERE p.updated_at >= $1 AND p.updated_at < $2 AND ($3::uuid IS NULL OR k.sales_id = $3)
     ORDER BY p.updated_at`,
    [dari, sampai, salesId]
  );
  return rows;
}

// Hitung komisi dari daftar pembayaran, dikelompokin per sales. Tier perpanjangan ditentuin jumlah toko baru bulan itu.
export function hitung(pembayaran) {
  const per = new Map();
  for (const p of pembayaran) {
    if (!per.has(p.sales_id)) per.set(p.sales_id, { wp_sales_id: p.sales_id, sales_kode: p.sales_kode, sales_nama: p.sales_nama, baris: [] });
    per.get(p.sales_id).baris.push(p);
  }
  return [...per.values()].map((s) => {
    const tokoBaru = s.baris.filter((b) => b.urutan === 1).length;
    const ratePerpanjangan = tokoBaru > AMBANG_TOKO_BARU ? RATE.perpanjanganTier : RATE.perpanjangan;
    const baris = s.baris.map((b) => {
      const jenis = b.plan === 'permanen' ? 'permanen' : b.urutan === 1 ? 'pertama' : 'perpanjangan';
      const rate = jenis === 'permanen' ? RATE.permanen : jenis === 'pertama' ? RATE.pertama : ratePerpanjangan;
      return { ...b, jenis, rate, komisi: Math.round(b.jumlah * rate) };
    });
    const bruto = baris.reduce((a, b) => a + b.komisi, 0);
    const pajak = Math.round(bruto * RATE.pajak);
    return { ...s, baris, toko_baru: tokoBaru, rate_perpanjangan: ratePerpanjangan, bruto, pajak, neto: bruto - pajak };
  });
}

// Estimasi bulan yang belum ditutup: pembayaran bulan itu yang belum pernah dikunci jadi komisi.
async function estimasi(periode, salesId = null) {
  const rows = await ambilPembayaran({ dari: awalPeriode(periode), sampai: awalPeriode(periodeBerikut(periode)), salesId });
  const { rows: sudah } = rows.length ? await query('SELECT order_id FROM mj_komisi WHERE order_id = ANY($1)', [rows.map((r) => r.order_id)]) : { rows: [] };
  const kunci = new Set(sudah.map((r) => r.order_id));
  return hitung(rows.filter((r) => !kunci.has(r.order_id)));
}

// Yang bakal dikunci kalau bulan `periode` ditutup: pembayaran bulan itu + pembayaran TELAT dari bulan yang UDAH
// ditutup (webhook telat masuk setelah bulannya dikunci) - ditandai "susulan". Bulan sebelumnya yang belum ditutup
// nggak ikut kesedot; bulan itu harus ditutup sendiri. Dipakai buat pratinjau & penutupan, jadi angkanya sama persis.
export async function calonTutup(periode, salesId = null) {
  const awal = awalPeriode(periode);
  const rows = await ambilPembayaran({ dari: new Date(awal.getTime() - 92 * 86400000), sampai: awalPeriode(periodeBerikut(periode)), salesId });
  const { rows: sudah } = rows.length ? await query('SELECT order_id FROM mj_komisi WHERE order_id = ANY($1)', [rows.map((r) => r.order_id)]) : { rows: [] };
  const kunci = new Set(sudah.map((r) => r.order_id));
  const { rows: tutup } = await query('SELECT periode FROM mj_komisi_tutup');
  const bulanTutup = new Set(tutup.map((r) => r.periode));
  const bulanDari = (t) => new Date(new Date(t).getTime() + 7 * 3600000).toISOString().slice(0, 7);
  const pilih = rows
    .filter((r) => !kunci.has(r.order_id))
    .map((r) => ({ ...r, susulan: new Date(r.lunas_pada) < awal }))
    .filter((r) => !r.susulan || bulanTutup.has(bulanDari(r.lunas_pada)));
  return hitung(pilih);
}

const angka = (r) => ({ ...r, bruto: Number(r.bruto), pajak: Number(r.pajak), neto: Number(r.neto), rate_perpanjangan: Number(r.rate_perpanjangan) });

// ---------------- Admin ----------------
router.get('/komisi', async (req, res, next) => {
  try {
    const periode = POLA_PERIODE.test(req.query.periode || '') ? req.query.periode : periodeSekarang();
    const { rows: tutup } = await query('SELECT * FROM mj_komisi_tutup WHERE periode=$1', [periode]);
    let sales;
    if (tutup.length) {
      const { rows } = await query('SELECT * FROM mj_komisi_periode WHERE periode=$1 ORDER BY neto DESC', [periode]);
      sales = rows.map((r) => ({ ...angka(r), status: r.dicairkan_at ? 'dicairkan' : 'ditutup' }));
    } else {
      const hasil = periode < periodeSekarang() ? await calonTutup(periode) : await estimasi(periode);
      sales = hasil
        .map(({ baris, ...s }) => ({ ...s, jumlah_bayar: baris.length, susulan: baris.filter((b) => b.susulan).length, status: 'estimasi' }))
        .sort((a, b) => b.neto - a.neto);
    }
    const rekening = await rekeningPerSales(sales.map((x) => x.wp_sales_id));
    sales = sales.map((x) => ({ ...x, rekening: rekening[x.wp_sales_id] || null }));
    const { rows: riwayat } = await query(
      `SELECT t.periode, t.ditutup_at, count(p.id)::int AS sales, COALESCE(SUM(p.neto),0)::float AS neto,
              count(p.id) FILTER (WHERE p.dicairkan_at IS NULL)::int AS belum_cair
       FROM mj_komisi_tutup t LEFT JOIN mj_komisi_periode p ON p.periode = t.periode GROUP BY t.periode ORDER BY t.periode DESC LIMIT 24`
    );
    res.json({
      periode,
      sekarang: periodeSekarang(),
      ditutup: tutup[0] || null,
      bisaDitutup: !tutup.length && periode < periodeSekarang(),
      emailAktif: emailAktif(),
      jadwalCair: jadwalCair(periode),
      rate: RATE,
      ambangTokoBaru: AMBANG_TOKO_BARU,
      sales,
      total: { bruto: sales.reduce((a, s) => a + s.bruto, 0), pajak: sales.reduce((a, s) => a + s.pajak, 0), neto: sales.reduce((a, s) => a + s.neto, 0) },
      riwayat,
    });
  } catch (e) {
    next(e);
  }
});

router.get('/komisi/detail', async (req, res, next) => {
  try {
    const periode = POLA_PERIODE.test(req.query.periode || '') ? req.query.periode : null;
    if (!periode || !POLA_UUID.test(req.query.sales || '')) throw salah('Periode & sales wajib diisi');
    const { rows: tutup } = await query('SELECT 1 FROM mj_komisi_tutup WHERE periode=$1', [periode]);
    if (tutup.length) {
      const { rows } = await query(
        `SELECT order_id, warung_nama, plan, jumlah::float AS jumlah, urutan, jenis, rate::float AS rate, komisi::float AS komisi, lunas_pada, susulan
         FROM mj_komisi WHERE periode=$1 AND wp_sales_id=$2 ORDER BY lunas_pada`,
        [periode, req.query.sales]
      );
      return res.json(rows);
    }
    const [s] = periode < periodeSekarang() ? await calonTutup(periode, req.query.sales) : await estimasi(periode, req.query.sales);
    res.json(s ? s.baris : []);
  } catch (e) {
    next(e);
  }
});

// Tutup bulan: hitung & kunci komisi semua sales (isi = calonTutup, sama persis kayak pratinjau di halaman).
router.post('/komisi/tutup', async (req, res, next) => {
  try {
    const periode = POLA_PERIODE.test(req.body.periode || '') ? req.body.periode : null;
    if (!periode) throw salah('Periode wajib diisi');
    if (periode >= periodeSekarang()) throw salah('Bulan ini belum selesai. Tutup bulan bisa mulai tanggal 1 bulan depan.');
    const hasil = await calonTutup(periode);
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const { rowCount } = await c.query('INSERT INTO mj_komisi_tutup (periode, ditutup_oleh) VALUES ($1,$2) ON CONFLICT DO NOTHING', [periode, req.admin.nama]);
      if (!rowCount) throw salah('Bulan ini udah ditutup', 409);
      for (const s of hasil) {
        await c.query(
          `INSERT INTO mj_komisi_periode (periode, wp_sales_id, sales_kode, sales_nama, toko_baru, rate_perpanjangan, bruto, pajak, neto)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [periode, s.wp_sales_id, s.sales_kode, s.sales_nama, s.toko_baru, s.rate_perpanjangan, s.bruto, s.pajak, s.neto]
        );
        for (const b of s.baris) {
          await c.query(
            `INSERT INTO mj_komisi (periode, wp_sales_id, order_id, warung_id, warung_nama, plan, jumlah, urutan, jenis, rate, komisi, lunas_pada, susulan)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [periode, s.wp_sales_id, b.order_id, b.warung_id, b.warung_nama, b.plan, b.jumlah, b.urutan, b.jenis, b.rate, b.komisi, b.lunas_pada, b.susulan]
          );
        }
      }
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
    const neto = hasil.reduce((a, s) => a + s.neto, 0);
    await catatLog(req, 'komisi.tutup', { periode, sales: hasil.length, neto });
    res.json({ ok: true, sales: hasil.length, neto });
  } catch (e) {
    next(e);
  }
});

// Tandai dicairkan: nyatet tanggal/metode + otomatis jadi pengeluaran "komisi" di Keuangan (jumlah bersih setelah pajak).
router.post('/komisi/cairkan', async (req, res, next) => {
  try {
    const periode = POLA_PERIODE.test(req.body.periode || '') ? req.body.periode : null;
    if (!periode || !POLA_UUID.test(req.body.sales || '')) throw salah('Periode & sales wajib diisi');
    const tanggal = /^\d{4}-\d{2}-\d{2}$/.test(req.body.tanggal || '') ? req.body.tanggal : null;
    if (!tanggal) throw salah('Tanggal pencairan wajib diisi');
    const metode = teks(req.body.metode, 60);
    if (!metode) throw salah('Metode pencairan wajib diisi (misal: transfer BCA)');
    const catatan = teks(req.body.catatan, 300) || null;
    // Transfer cuma ke rekening yang udah dicek admin. Tunai boleh tanpa rekening.
    const tunai = /tunai|cash/i.test(metode);
    const rek = (await rekeningPerSales([req.body.sales]))[req.body.sales];
    if (!tunai) {
      if (!rek) throw salah('Kode sales ini belum nyambung ke akun sales, jadi rekeningnya belum ada. Sambungin dulu di Sales Lapangan → Tim sales.');
      if (rek.kurang.length) throw salah(`Rekening sales ini belum lengkap (${rek.kurang.join(', ')}). Isi dulu di Sales Lapangan → Tim sales.`);
      if (!rek.rekening_dicek_at) throw salah('Rekening sales ini baru diganti dan belum dicek admin. Cek dulu sebelum transfer.');
    }
    const rekeningTujuan = !tunai && rek ? `${rek.bank} ${rek.rekening} a.n. ${rek.atas_nama}` : null;
    const c = await pool.connect();
    let r;
    try {
      await c.query('BEGIN');
      const { rows } = await c.query('SELECT * FROM mj_komisi_periode WHERE periode=$1 AND wp_sales_id=$2 FOR UPDATE', [periode, req.body.sales]);
      r = rows[0];
      if (!r) throw salah('Komisi bulan ini belum ditutup atau sales ini nggak punya komisi', 404);
      if (r.dicairkan_at) throw salah('Komisi ini udah dicairkan');
      const { rows: t } = await c.query(
        `INSERT INTO mj_transaksi (jenis, tanggal, kategori, deskripsi, pihak, jumlah, metode, admin_nama)
         VALUES ('keluar',$1,'komisi',$2,$3,$4,$5,$6) RETURNING id`,
        [tanggal, `Bagi hasil ${periode} (sudah potong pajak ${Math.round(RATE.pajak * 100)}%)${rekeningTujuan ? ` ke ${rekeningTujuan}` : ''}`, `${r.sales_nama || ''} (${r.sales_kode || ''})`.trim(), r.neto, metode, req.admin.nama]
      );
      await c.query(
        'UPDATE mj_komisi_periode SET dicairkan_tanggal=$2, dicairkan_at=now(), dicairkan_oleh=$3, metode=$4, catatan=$5, transaksi_id=$6, rekening_tujuan=$7 WHERE id=$1',
        [r.id, tanggal, req.admin.nama, metode, catatan, t[0].id, rekeningTujuan]
      );
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
    await catatLog(req, 'komisi.cairkan', { periode, sales: r.sales_kode, neto: Number(r.neto) });
    // Email ke sales dikirim di belakang (SMTP bisa lambat); hasilnya kecatat di baris itu buat admin.
    emailCair({ r, rek, tanggal, metode, catatan, rekeningTujuan }).catch(() => {});
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

const rupiahTeks = (n) => 'Rp' + Math.round(Number(n) || 0).toLocaleString('id-ID');
const tanggalTeks = (t) => new Date(t + 'T00:00:00+07:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
const bulanTeks = (p) => new Date(p + '-01T00:00:00+07:00').toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });

async function emailCair({ r, rek, tanggal, metode, catatan, rekeningTujuan }) {
  const tunai = !rekeningTujuan;
  const { teks, html } = susunEmail({
    sapaan: `Halo ${rek?.nama || r.sales_nama || ''},`,
    paragraf: [
      `Bagi hasil ${bulanTeks(r.periode)} sebesar ${rupiahTeks(r.neto)} udah ${tunai ? `dibayar (${metode})` : 'ditransfer'} tanggal ${tanggalTeks(tanggal)}${rekeningTujuan ? ` ke ${rekeningTujuan.replace(/\d(?=\d{4})/g, '•')}` : ''}.`,
      `Rinciannya: komisi ${rupiahTeks(r.bruto)} dipotong pajak ${Math.round(RATE.pajak * 100)}% (${rupiahTeks(r.pajak)}).`,
      ...(catatan ? [`Catatan admin: ${catatan}`] : []),
      tunai ? 'Kalau udah kamu terima, konfirmasi di Makalin ya.' : 'Cek mutasi rekeningmu, terus konfirmasi di Makalin: udah masuk atau belum.',
    ],
    tombol: { label: 'Konfirmasi di Makalin', url: `${URL_MAKALIN()}/#/penghasilan` },
  });
  const h = await kirimEmail({ ke: rek?.email, judul: `Bagi hasil ${bulanTeks(r.periode)} ${tunai ? 'udah dibayar' : 'udah ditransfer'}: ${rupiahTeks(r.neto)}`, teks, html });
  await query('UPDATE mj_komisi_periode SET email_status=$2, email_at=now() WHERE id=$1', [r.id, h.terkirim ? `terkirim ke ${rek.email}` : h.alasan]);
  return h;
}
export { emailCair as _emailCairUji };

// ---------------- Sales: penghasilan sendiri ----------------
// Sales ngabarin balik: bagi hasil udah masuk ke rekeningnya, atau belum (admin dapet notifikasi dari catatan aktivitas).
router.post('/lapangan/komisi/konfirmasi', async (req, res, next) => {
  try {
    const S = req.admin.wp_sales_id;
    if (!S) throw salah('Akunmu belum disambungin ke kode sales');
    const periode = POLA_PERIODE.test(req.body.periode || '') ? req.body.periode : null;
    const status = ['masuk', 'belum'].includes(req.body.status) ? req.body.status : null;
    if (!periode || !status) throw salah('Periode & status wajib diisi');
    const catatan = status === 'belum' ? teks(req.body.catatan, 300) || null : null;
    const { rows } = await query(
      `UPDATE mj_komisi_periode SET konfirmasi_sales=$3, konfirmasi_at=now(), konfirmasi_catatan=$4
       WHERE periode=$1 AND wp_sales_id=$2 AND dicairkan_at IS NOT NULL RETURNING neto, sales_kode`,
      [periode, S, status, catatan]
    );
    if (!rows.length) throw salah('Bagi hasil bulan itu belum dicairkan admin', 404);
    await catatLog(req, status === 'masuk' ? 'komisi.konfirmasi_masuk' : 'komisi.lapor_belum_masuk', {
      periode,
      sales: rows[0].sales_kode,
      jumlah: Number(rows[0].neto),
      ...(catatan ? { catatan } : {}),
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get('/lapangan/komisi', async (req, res, next) => {
  try {
    const S = req.admin.wp_sales_id;
    if (!S) return res.json({ terhubung: false });
    const periode = periodeSekarang();
    const [est] = await estimasi(periode, S);
    const { rows: riwayat } = await query(
      `SELECT periode, toko_baru, rate_perpanjangan, bruto, pajak, neto, dicairkan_tanggal::text AS dicairkan_tanggal, dicairkan_at, metode, rekening_tujuan,
              catatan AS referensi, konfirmasi_sales, konfirmasi_at
       FROM mj_komisi_periode WHERE wp_sales_id=$1 ORDER BY periode DESC LIMIT 12`,
      [S]
    );
    // Pencairan yang belum dikonfirmasi sales = pemberitahuan di app-nya. Dibuka = kecatat "dilihat" (kelihatan di admin).
    await query('UPDATE mj_komisi_periode SET dilihat_sales_at=now() WHERE wp_sales_id=$1 AND dicairkan_at IS NOT NULL AND dilihat_sales_at IS NULL', [S]);
    // Bulan lalu yang belum ditutup admin: tetap estimasi.
    const lalu = (() => {
      const [y, m] = periode.split('-').map(Number);
      return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    })();
    const { rows: tutupLalu } = await query('SELECT 1 FROM mj_komisi_tutup WHERE periode=$1', [lalu]);
    const [estLalu] = tutupLalu.length ? [null] : await calonTutup(lalu, S);
    res.json({
      terhubung: true,
      rate: RATE,
      ambangTokoBaru: AMBANG_TOKO_BARU,
      bulanIni: {
        periode,
        jadwalCair: jadwalCair(periode),
        toko_baru: est?.toko_baru || 0,
        rate_perpanjangan: est?.rate_perpanjangan || RATE.perpanjangan,
        bruto: est?.bruto || 0,
        pajak: est?.pajak || 0,
        neto: est?.neto || 0,
        baris: est?.baris.map(({ order_id, warung_nama, plan, jumlah, urutan, jenis, rate, komisi, lunas_pada }) => ({ order_id, warung_nama, plan, jumlah, urutan, jenis, rate, komisi, lunas_pada })) || [],
      },
      bulanLalu: estLalu ? { periode: lalu, jadwalCair: jadwalCair(lalu), bruto: estLalu.bruto, pajak: estLalu.pajak, neto: estLalu.neto, toko_baru: estLalu.toko_baru } : null,
      riwayat: riwayat.map((r) => ({ ...angka(r), jadwalCair: jadwalCair(r.periode) })),
    });
  } catch (e) {
    next(e);
  }
});

export default router;
