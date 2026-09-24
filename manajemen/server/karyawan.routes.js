import { Router } from 'express';
import { catatLog, query, pool } from './db.js';
import { normalisasiNoHp } from './utils/noHp.js';
import { salinFotoLamaran } from './utils/fotoLamaran.js';

// HR Karyawan: data kepegawaian, kehadiran harian, cuti & izin (dengan persetujuan), payroll bulanan, struktur organisasi.
// Kehadiran diisi admin (belum ada akun karyawan buat absen sendiri). Potongan payroll diisi manual - sistem nggak
// nebak aturan potongan. Karyawan bertipe "kemitraan" (Sales Partner dari rekrutmen) dibayar komisi, bukan gaji
// pokok; komisinya belum dihitung di sini (nunggu verifikasi Midtrans, PRD NV-03).
const router = Router();
const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const teks = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const salah = (pesan, status = 400) => Object.assign(new Error(pesan), { status });
const angka = (v) => Math.max(0, Math.round(Number(v) || 0));
const tglValid = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null);

export const TIPE = ['tetap', 'kontrak', 'probation', 'magang', 'kemitraan'];
export const STATUS_HADIR = ['hadir', 'wfh', 'terlambat', 'dinas_luar', 'izin', 'sakit', 'cuti', 'alpa'];
export const JENIS_CUTI = ['cuti_tahunan', 'sakit', 'izin', 'cuti_menikah', 'cuti_melahirkan', 'lainnya'];
// Status hadir yang muncul otomatis dari cuti yang disetujui.
const HADIR_DARI_CUTI = { cuti_tahunan: 'cuti', sakit: 'sakit', izin: 'izin', cuti_menikah: 'cuti', cuti_melahirkan: 'cuti', lainnya: 'izin' };

let siap = null;
export const pastikanTabelKaryawan = () => pastikanTabel();
function pastikanTabel() {
  if (!siap) {
    siap = (async () => {
      await query(`CREATE TABLE IF NOT EXISTS mj_karyawan (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nomor BIGSERIAL,
        nama TEXT NOT NULL, email TEXT, no_hp TEXT,
        jabatan TEXT, departemen TEXT, grade TEXT,
        tipe TEXT NOT NULL DEFAULT 'tetap', lokasi TEXT,
        tanggal_masuk DATE NOT NULL DEFAULT CURRENT_DATE, kontrak_selesai DATE, tanggal_lahir DATE,
        atasan_id UUID REFERENCES mj_karyawan(id) ON DELETE SET NULL,
        gaji_pokok NUMERIC NOT NULL DEFAULT 0, tunjangan_transport NUMERIC NOT NULL DEFAULT 0, tunjangan_makan NUMERIC NOT NULL DEFAULT 0,
        jatah_cuti INT NOT NULL DEFAULT 12,
        bank TEXT, rekening TEXT, npwp TEXT, bpjs_kesehatan TEXT,
        status TEXT NOT NULL DEFAULT 'aktif', -- aktif | nonaktif | keluar
        tanggal_keluar DATE, alasan_keluar TEXT,
        orang_id UUID, -- kalau asalnya dari Rekrutmen (mj_orang)
        catatan TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      )`);
      await query(`CREATE TABLE IF NOT EXISTS mj_kehadiran (
        karyawan_id UUID NOT NULL REFERENCES mj_karyawan(id) ON DELETE CASCADE,
        tanggal DATE NOT NULL,
        status TEXT NOT NULL, jam_masuk TIME, catatan TEXT,
        cuti_id UUID, dicatat_oleh TEXT,
        updated_at TIMESTAMPTZ DEFAULT now(),
        PRIMARY KEY (karyawan_id, tanggal)
      )`);
      await query(`CREATE TABLE IF NOT EXISTS mj_cuti (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        karyawan_id UUID NOT NULL REFERENCES mj_karyawan(id) ON DELETE CASCADE,
        jenis TEXT NOT NULL, mulai DATE NOT NULL, selesai DATE NOT NULL, hari INT NOT NULL,
        alasan TEXT, status TEXT NOT NULL DEFAULT 'menunggu', -- menunggu | disetujui | ditolak
        diajukan_oleh TEXT, diputus_oleh TEXT, diputus_at TIMESTAMPTZ, catatan_keputusan TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      )`);
      await query(`CREATE TABLE IF NOT EXISTS mj_payroll (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        periode TEXT NOT NULL, -- YYYY-MM
        karyawan_id UUID NOT NULL REFERENCES mj_karyawan(id) ON DELETE CASCADE,
        gaji_pokok NUMERIC NOT NULL, tunjangan NUMERIC NOT NULL, potongan NUMERIC NOT NULL DEFAULT 0,
        catatan TEXT, status TEXT NOT NULL DEFAULT 'draf', -- draf | dibayar
        dibayar_at TIMESTAMPTZ, dibayar_oleh TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        UNIQUE (periode, karyawan_id)
      )`);
      // Sales Partner: data karyawan nyambung ke akun Makalin (admin_id) - tempat foto profil & rekening pencairan
      // bagi hasil. Rekening yang diubah sales sendiri harus dicek admin dulu sebelum bisa dipakai nyairin.
      await query(`ALTER TABLE mj_karyawan ADD COLUMN IF NOT EXISTS admin_id UUID, ADD COLUMN IF NOT EXISTS atas_nama TEXT,
        ADD COLUMN IF NOT EXISTS nik_ktp TEXT, ADD COLUMN IF NOT EXISTS alamat TEXT, ADD COLUMN IF NOT EXISTS foto TEXT,
        ADD COLUMN IF NOT EXISTS rekening_diubah_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS rekening_diubah_oleh TEXT,
        ADD COLUMN IF NOT EXISTS rekening_dicek_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS rekening_dicek_oleh TEXT`);
      await query('CREATE UNIQUE INDEX IF NOT EXISTS idx_mj_karyawan_admin ON mj_karyawan (admin_id) WHERE admin_id IS NOT NULL');
    })().catch((e) => {
      siap = null;
      throw e;
    });
  }
  return siap;
}
router.use('/karyawan', async (req, res, next) => {
  try {
    await pastikanTabel();
    next();
  } catch (e) {
    next(e);
  }
});

// Hari kerja Senin-Jumat antara dua tanggal (termasuk ujungnya) - dipakai buat hitung lama cuti.
function hariKerja(mulai, selesai) {
  const hasil = [];
  for (let d = new Date(mulai + 'T00:00:00Z'); d <= new Date(selesai + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
    const h = d.getUTCDay();
    if (h !== 0 && h !== 6) hasil.push(d.toISOString().slice(0, 10));
  }
  return hasil;
}
const hariIni = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10); // tanggal WIB

const KOLOM = `k.*, k.tanggal_masuk::text AS tanggal_masuk, k.kontrak_selesai::text AS kontrak_selesai, k.tanggal_lahir::text AS tanggal_lahir, k.tanggal_keluar::text AS tanggal_keluar, k.gaji_pokok::float AS gaji_pokok, k.tunjangan_transport::float AS tunjangan_transport, k.tunjangan_makan::float AS tunjangan_makan,
  'MKL-' || lpad(k.nomor::text, 3, '0') AS nik, a.nama AS atasan_nama,
  (SELECT status FROM mj_kehadiran h WHERE h.karyawan_id = k.id AND h.tanggal = $1::date) AS hadir_hari_ini,
  (SELECT jam_masuk FROM mj_kehadiran h WHERE h.karyawan_id = k.id AND h.tanggal = $1::date) AS jam_masuk_hari_ini`;

router.get('/karyawan/ringkasan', async (req, res, next) => {
  try {
    const hari = hariIni();
    const bulan = hari.slice(0, 7);
    const [{ rows: aktif }, { rows: hadir }, { rows: cuti }, { rows: gaji }, { rows: payroll }, { rows: kontrak }] = await Promise.all([
      query(`SELECT tipe, count(*)::int AS n FROM mj_karyawan WHERE status='aktif' GROUP BY tipe`),
      query(`SELECT h.status, count(*)::int AS n FROM mj_kehadiran h JOIN mj_karyawan k ON k.id=h.karyawan_id WHERE h.tanggal=$1 AND k.status='aktif' GROUP BY h.status`, [hari]),
      query(`SELECT count(*)::int AS n FROM mj_cuti WHERE status='menunggu'`),
      query(`SELECT COALESCE(SUM(gaji_pokok + tunjangan_transport + tunjangan_makan),0)::float AS n FROM mj_karyawan WHERE status='aktif'`),
      query(`SELECT count(*)::int AS n, COALESCE(SUM(gaji_pokok + tunjangan - potongan),0)::float AS total, count(*) FILTER (WHERE status='dibayar')::int AS dibayar FROM mj_payroll WHERE periode=$1`, [bulan]),
      query(`SELECT count(*)::int AS n FROM mj_karyawan WHERE status='aktif' AND kontrak_selesai IS NOT NULL AND kontrak_selesai <= CURRENT_DATE + 30`),
    ]);
    const perHadir = Object.fromEntries(hadir.map((r) => [r.status, r.n]));
    res.json({
      hari,
      bulan,
      aktif: aktif.reduce((a, r) => a + r.n, 0),
      perTipe: Object.fromEntries(aktif.map((r) => [r.tipe, r.n])),
      hadir: perHadir,
      belumDicatat: aktif.reduce((a, r) => a + r.n, 0) - hadir.reduce((a, r) => a + r.n, 0),
      cutiMenunggu: cuti[0].n,
      estimasiGaji: gaji[0].n,
      payroll: payroll[0],
      kontrakHabis: kontrak[0].n,
    });
  } catch (e) {
    next(e);
  }
});

router.get('/karyawan', async (req, res, next) => {
  try {
    // Karyawan dari Rekrutmen yang belum punya foto profil otomatis pakai foto diri dari lamarannya.
    await salinFotoLamaran().catch((e) => console.error('Salin foto lamaran gagal:', e.message));
    const status = ['aktif', 'nonaktif', 'keluar', 'semua'].includes(req.query.status) ? req.query.status : 'aktif';
    const q = teks(req.query.q, 60);
    const pola = q ? '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%' : null;
    const dept = teks(req.query.departemen, 60) || null;
    const tipe = TIPE.includes(req.query.tipe) ? req.query.tipe : null;
    const { rows } = await query(
      `SELECT ${KOLOM} FROM mj_karyawan k LEFT JOIN mj_karyawan a ON a.id = k.atasan_id
       WHERE ($2 = 'semua' OR k.status = $2) AND ($3::text IS NULL OR k.nama ILIKE $3 OR k.jabatan ILIKE $3 OR k.email ILIKE $3 OR ('MKL-' || lpad(k.nomor::text, 3, '0')) ILIKE $3)
         AND ($4::text IS NULL OR k.departemen = $4) AND ($5::text IS NULL OR k.tipe = $5)
       ORDER BY k.nama`,
      [hariIni(), status, pola, dept, tipe]
    );
    const { rows: dept2 } = await query(`SELECT DISTINCT departemen FROM mj_karyawan WHERE departemen IS NOT NULL ORDER BY departemen`);
    res.json({ karyawan: rows, departemen: dept2.map((r) => r.departemen) });
  } catch (e) {
    next(e);
  }
});

router.get('/karyawan/:id', async (req, res, next) => {
  try {
    if (!POLA_UUID.test(req.params.id)) throw salah('Karyawan tidak ditemukan', 404);
    const { rows } = await query(`SELECT ${KOLOM} FROM mj_karyawan k LEFT JOIN mj_karyawan a ON a.id = k.atasan_id WHERE k.id=$2`, [hariIni(), req.params.id]);
    if (!rows.length) throw salah('Karyawan tidak ditemukan', 404);
    const k = rows[0];
    const tahun = hariIni().slice(0, 4);
    const [{ rows: tujuh }, { rows: rekap }, { rows: cutiTerpakai }, { rows: cuti }, { rows: payroll }] = await Promise.all([
      query(`SELECT tanggal::text, status, jam_masuk FROM mj_kehadiran WHERE karyawan_id=$1 AND tanggal > $2::date - 7 AND tanggal <= $2::date ORDER BY tanggal`, [k.id, hariIni()]),
      query(`SELECT status, count(*)::int AS n FROM mj_kehadiran WHERE karyawan_id=$1 AND tanggal > $2::date - 30 AND tanggal <= $2::date GROUP BY status`, [k.id, hariIni()]),
      query(`SELECT COALESCE(SUM(hari),0)::int AS n FROM mj_cuti WHERE karyawan_id=$1 AND jenis='cuti_tahunan' AND status='disetujui' AND to_char(mulai,'YYYY')=$2`, [k.id, tahun]),
      query(`SELECT * FROM mj_cuti WHERE karyawan_id=$1 ORDER BY created_at DESC LIMIT 20`, [k.id]),
      query(`SELECT periode, (gaji_pokok + tunjangan - potongan)::float AS total, status FROM mj_payroll WHERE karyawan_id=$1 ORDER BY periode DESC LIMIT 6`, [k.id]),
    ]);
    // Cuti yang disetujui nggak ngurangin tingkat kehadiran.
    const tercatat = rekap.filter((r) => r.status !== 'cuti').reduce((a, r) => a + r.n, 0);
    const masuk = rekap.filter((r) => ['hadir', 'wfh', 'terlambat', 'dinas_luar'].includes(r.status)).reduce((a, r) => a + r.n, 0);
    res.json({
      karyawan: k,
      tujuhHari: tujuh,
      rekap30: Object.fromEntries(rekap.map((r) => [r.status, r.n])),
      // Tingkat kehadiran cuma dari hari yang dicatat - hari yang belum dicatat nggak dianggap alpa.
      tingkatKehadiran: tercatat ? Math.round((masuk / tercatat) * 1000) / 10 : null,
      sisaCuti: k.jatah_cuti - cutiTerpakai[0].n,
      cuti,
      payroll,
    });
  } catch (e) {
    next(e);
  }
});

function bersihkan(b, sebagian = false) {
  const x = {};
  const isi = (k, n) => {
    if (b[k] !== undefined || !sebagian) x[k] = teks(b[k], n) || null;
  };
  isi('nama', 100);
  isi('email', 120);
  isi('jabatan', 80);
  isi('departemen', 60);
  isi('grade', 20);
  isi('lokasi', 60);
  isi('bank', 40);
  isi('rekening', 40);
  isi('atas_nama', 100);
  isi('npwp', 30);
  isi('bpjs_kesehatan', 30);
  isi('catatan', 500);
  if (b.no_hp !== undefined || !sebagian) x.no_hp = b.no_hp ? normalisasiNoHp(b.no_hp) || teks(b.no_hp, 20) : null;
  if (b.tipe !== undefined || !sebagian) x.tipe = TIPE.includes(b.tipe) ? b.tipe : 'tetap';
  for (const k of ['tanggal_masuk', 'kontrak_selesai', 'tanggal_lahir']) if (b[k] !== undefined || !sebagian) x[k] = tglValid(b[k]);
  for (const k of ['gaji_pokok', 'tunjangan_transport', 'tunjangan_makan']) if (b[k] !== undefined || !sebagian) x[k] = angka(b[k]);
  if (b.jatah_cuti !== undefined || !sebagian) x.jatah_cuti = Math.min(60, angka(b.jatah_cuti ?? 12));
  if (b.atasan_id !== undefined) x.atasan_id = POLA_UUID.test(b.atasan_id || '') ? b.atasan_id : null;
  if (!sebagian && !x.tanggal_masuk) x.tanggal_masuk = hariIni();
  return x;
}

router.post('/karyawan', async (req, res, next) => {
  try {
    const x = bersihkan(req.body || {});
    // Dari Rekrutmen: data orangnya diambil dari kandidat yang udah HIRED.
    let orangId = null;
    if (POLA_UUID.test(req.body.orang_id || '')) {
      const { rows } = await query(`SELECT o.* FROM mj_orang o WHERE o.id=$1 AND EXISTS (SELECT 1 FROM mj_lamaran l WHERE l.orang_id=o.id AND l.status='hired')`, [req.body.orang_id]);
      if (!rows.length) throw salah('Kandidat itu belum berstatus Hired');
      const { rows: ada } = await query(`SELECT 1 FROM mj_karyawan WHERE orang_id=$1 AND status <> 'keluar'`, [rows[0].id]);
      if (ada.length) throw salah('Kandidat ini udah ada di data karyawan', 409);
      orangId = rows[0].id;
      x.nama = x.nama || rows[0].nama;
      x.no_hp = x.no_hp || rows[0].no_hp;
      x.email = x.email || rows[0].email;
    }
    if (!x.nama) throw salah('Nama wajib diisi');
    const kolom = Object.keys(x);
    const { rows } = await query(
      `INSERT INTO mj_karyawan (${kolom.join(', ')}, orang_id) VALUES (${kolom.map((_, i) => `$${i + 1}`).join(', ')}, $${kolom.length + 1}) RETURNING id, nama, 'MKL-' || lpad(nomor::text, 3, '0') AS nik`,
      [...kolom.map((k) => x[k]), orangId]
    );
    if (x.rekening) {
      await query(`UPDATE mj_karyawan SET rekening_diubah_at=now(), rekening_diubah_oleh=$2, rekening_dicek_at=now(), rekening_dicek_oleh=$2 WHERE id=$1`, [rows[0].id, req.admin.nama]);
    }
    await catatLog(req, 'hr.karyawan.tambah', { nik: rows[0].nik, nama: rows[0].nama, ...(orangId ? { dari: 'rekrutmen' } : {}) });
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.patch('/karyawan/:id', async (req, res, next) => {
  try {
    if (!POLA_UUID.test(req.params.id)) throw salah('Karyawan tidak ditemukan', 404);
    const x = bersihkan(req.body || {}, true);
    if (x.nama === null) throw salah('Nama wajib diisi');
    if (x.atasan_id === req.params.id) throw salah('Karyawan nggak bisa jadi atasan dirinya sendiri');
    // Status: nonaktif / keluar (alasan wajib) / aktif lagi.
    if (req.body.status !== undefined) {
      if (!['aktif', 'nonaktif', 'keluar'].includes(req.body.status)) throw salah('Status nggak dikenal');
      x.status = req.body.status;
      if (x.status === 'keluar') {
        x.alasan_keluar = teks(req.body.alasan_keluar, 300);
        if (!x.alasan_keluar) throw salah('Alasan keluar wajib diisi');
        x.tanggal_keluar = tglValid(req.body.tanggal_keluar) || hariIni();
      }
    }
    const kolom = Object.keys(x);
    if (!kolom.length) throw salah('Nggak ada yang diubah');
    // Rekening yang diganti admin di sini dianggap udah dicek admin itu (dipakai buat nyairin bagi hasil sales).
    const param = [req.params.id, ...kolom.map((k) => x[k])];
    let tandaRekening = '';
    if (['bank', 'rekening', 'atas_nama'].some((k) => k in x)) {
      param.push(req.admin.nama);
      const oleh = `$${param.length}`;
      const baru = ['bank', 'rekening', 'atas_nama'].map((k) => (k in x ? `$${kolom.indexOf(k) + 2}::text` : k)).join(', ');
      const beda = `(bank, rekening, atas_nama) IS DISTINCT FROM (${baru})`;
      tandaRekening = `, rekening_diubah_at = CASE WHEN ${beda} THEN now() ELSE rekening_diubah_at END,
        rekening_diubah_oleh = CASE WHEN ${beda} THEN ${oleh} ELSE rekening_diubah_oleh END,
        rekening_dicek_at = CASE WHEN ${beda} THEN now() ELSE rekening_dicek_at END,
        rekening_dicek_oleh = CASE WHEN ${beda} THEN ${oleh} ELSE rekening_dicek_oleh END`;
    }
    const { rows } = await query(
      `UPDATE mj_karyawan SET ${kolom.map((k, i) => `${k}=$${i + 2}`).join(', ')}${tandaRekening} WHERE id=$1 RETURNING nama, 'MKL-' || lpad(nomor::text, 3, '0') AS nik`,
      param
    );
    if (!rows.length) throw salah('Karyawan tidak ditemukan', 404);
    await catatLog(req, req.body.status ? 'hr.karyawan.status' : 'hr.karyawan.ubah', { nik: rows[0].nik, nama: rows[0].nama, ...(req.body.status ? { status: req.body.status } : { diubah: kolom.join(', ') }) });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---------------- Kehadiran ----------------
router.get('/karyawan-kehadiran', async (req, res, next) => {
  try {
    await pastikanTabel();
    const tanggal = tglValid(req.query.tanggal) || hariIni();
    const { rows } = await query(
      `SELECT k.id, k.nama, k.jabatan, k.departemen, 'MKL-' || lpad(k.nomor::text, 3, '0') AS nik, h.status, h.jam_masuk, h.catatan, h.cuti_id
       FROM mj_karyawan k LEFT JOIN mj_kehadiran h ON h.karyawan_id = k.id AND h.tanggal = $1
       WHERE k.status='aktif' AND k.tanggal_masuk <= $1 ORDER BY k.departemen NULLS LAST, k.nama`,
      [tanggal]
    );
    res.json({ tanggal, baris: rows });
  } catch (e) {
    next(e);
  }
});

// Simpan kehadiran satu tanggal (banyak karyawan sekaligus). Baris tanpa status = dihapus catatannya.
router.put('/karyawan-kehadiran', async (req, res, next) => {
  try {
    await pastikanTabel();
    const tanggal = tglValid(req.body.tanggal);
    if (!tanggal) throw salah('Tanggal wajib diisi');
    if (tanggal > hariIni()) throw salah('Nggak bisa ngisi kehadiran buat tanggal yang belum lewat');
    const baris = Array.isArray(req.body.baris) ? req.body.baris.slice(0, 1000) : [];
    const c = await pool.connect();
    let n = 0;
    try {
      await c.query('BEGIN');
      for (const b of baris) {
        if (!POLA_UUID.test(b.karyawan_id || '')) continue;
        if (!b.status) {
          await c.query('DELETE FROM mj_kehadiran WHERE karyawan_id=$1 AND tanggal=$2 AND cuti_id IS NULL', [b.karyawan_id, tanggal]);
          continue;
        }
        if (!STATUS_HADIR.includes(b.status)) throw salah('Status kehadiran nggak dikenal');
        const jam = /^\d{2}:\d{2}$/.test(b.jam_masuk || '') ? b.jam_masuk : null;
        await c.query(
          `INSERT INTO mj_kehadiran (karyawan_id, tanggal, status, jam_masuk, catatan, dicatat_oleh) VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (karyawan_id, tanggal) DO UPDATE SET status=EXCLUDED.status, jam_masuk=EXCLUDED.jam_masuk, catatan=EXCLUDED.catatan,
             dicatat_oleh=EXCLUDED.dicatat_oleh, cuti_id=NULL, updated_at=now()`,
          [b.karyawan_id, tanggal, b.status, jam, teks(b.catatan, 200) || null, req.admin.nama]
        );
        n++;
      }
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
    await catatLog(req, 'hr.kehadiran.simpan', { tanggal, jumlah: n });
    res.json({ ok: true, n });
  } catch (e) {
    next(e);
  }
});

// Rekap kehadiran sebulan per karyawan.
router.get('/karyawan-kehadiran/rekap', async (req, res, next) => {
  try {
    await pastikanTabel();
    const bulan = /^\d{4}-\d{2}$/.test(req.query.bulan || '') ? req.query.bulan : hariIni().slice(0, 7);
    const { rows } = await query(
      `SELECT k.id, k.nama, 'MKL-' || lpad(k.nomor::text, 3, '0') AS nik, h.status, count(h.*)::int AS n
       FROM mj_karyawan k LEFT JOIN mj_kehadiran h ON h.karyawan_id = k.id AND to_char(h.tanggal, 'YYYY-MM') = $1
       WHERE k.status='aktif' GROUP BY k.id, h.status ORDER BY k.nama`,
      [bulan]
    );
    const per = {};
    for (const r of rows) {
      per[r.id] = per[r.id] || { id: r.id, nama: r.nama, nik: r.nik, status: {} };
      if (r.status) per[r.id].status[r.status] = r.n;
    }
    res.json({ bulan, baris: Object.values(per) });
  } catch (e) {
    next(e);
  }
});

// ---------------- Cuti & izin ----------------
router.get('/karyawan-cuti', async (req, res, next) => {
  try {
    await pastikanTabel();
    const status = ['menunggu', 'disetujui', 'ditolak', 'semua'].includes(req.query.status) ? req.query.status : 'semua';
    const { rows } = await query(
      `SELECT c.*, c.mulai::text AS mulai, c.selesai::text AS selesai, k.nama, 'MKL-' || lpad(k.nomor::text, 3, '0') AS nik FROM mj_cuti c JOIN mj_karyawan k ON k.id = c.karyawan_id
       WHERE ($1 = 'semua' OR c.status = $1) ORDER BY (c.status = 'menunggu') DESC, c.created_at DESC LIMIT 200`,
      [status]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.post('/karyawan-cuti', async (req, res, next) => {
  try {
    await pastikanTabel();
    const b = req.body || {};
    if (!POLA_UUID.test(b.karyawan_id || '')) throw salah('Pilih karyawannya');
    if (!JENIS_CUTI.includes(b.jenis)) throw salah('Pilih jenis cuti / izin');
    const mulai = tglValid(b.mulai);
    const selesai = tglValid(b.selesai) || mulai;
    if (!mulai) throw salah('Tanggal mulai wajib diisi');
    if (selesai < mulai) throw salah('Tanggal selesai nggak boleh sebelum tanggal mulai');
    const hari = hariKerja(mulai, selesai).length;
    if (!hari) throw salah('Rentang tanggalnya cuma kena hari Sabtu/Minggu');
    if (b.jenis === 'cuti_tahunan') {
      const { rows } = await query(
        `SELECT k.jatah_cuti - COALESCE((SELECT SUM(hari) FROM mj_cuti WHERE karyawan_id=k.id AND jenis='cuti_tahunan' AND status='disetujui' AND to_char(mulai,'YYYY')=$2),0) AS sisa FROM mj_karyawan k WHERE k.id=$1`,
        [b.karyawan_id, mulai.slice(0, 4)]
      );
      if (rows.length && Number(rows[0].sisa) < hari) throw salah(`Sisa cuti tahunan cuma ${rows[0].sisa} hari, pengajuannya ${hari} hari`);
    }
    const { rows } = await query(
      `INSERT INTO mj_cuti (karyawan_id, jenis, mulai, selesai, hari, alasan, diajukan_oleh) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [b.karyawan_id, b.jenis, mulai, selesai, hari, teks(b.alasan, 300) || null, req.admin.nama]
    );
    await catatLog(req, 'hr.cuti.ajukan', { jenis: b.jenis, mulai, selesai, hari });
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

// Putusin pengajuan. Disetujui -> kehadiran di hari-hari kerjanya otomatis keisi (cuti/sakit/izin).
router.post('/karyawan-cuti/:id/putus', async (req, res, next) => {
  try {
    await pastikanTabel();
    if (!POLA_UUID.test(req.params.id)) throw salah('Pengajuan tidak ditemukan', 404);
    const keputusan = req.body.keputusan;
    if (!['disetujui', 'ditolak'].includes(keputusan)) throw salah('Pilih setujui atau tolak');
    const catatan = teks(req.body.catatan, 300);
    if (keputusan === 'ditolak' && !catatan) throw salah('Alasan penolakan wajib diisi');
    const c = await pool.connect();
    let cuti;
    try {
      await c.query('BEGIN');
      const { rows } = await c.query(`SELECT *, mulai::text AS mulai, selesai::text AS selesai FROM mj_cuti WHERE id=$1 FOR UPDATE`, [req.params.id]);
      if (!rows.length) throw salah('Pengajuan tidak ditemukan', 404);
      cuti = rows[0];
      if (cuti.status !== 'menunggu') throw salah('Pengajuan ini udah diputusin');
      await c.query('UPDATE mj_cuti SET status=$2, diputus_oleh=$3, diputus_at=now(), catatan_keputusan=$4 WHERE id=$1', [cuti.id, keputusan, req.admin.nama, catatan || null]);
      if (keputusan === 'disetujui') {
        for (const tgl of hariKerja(cuti.mulai, cuti.selesai)) {
          await c.query(
            `INSERT INTO mj_kehadiran (karyawan_id, tanggal, status, catatan, cuti_id, dicatat_oleh) VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (karyawan_id, tanggal) DO UPDATE SET status=EXCLUDED.status, catatan=EXCLUDED.catatan, cuti_id=EXCLUDED.cuti_id, dicatat_oleh=EXCLUDED.dicatat_oleh, updated_at=now()`,
            [cuti.karyawan_id, tgl, HADIR_DARI_CUTI[cuti.jenis], `Dari pengajuan ${cuti.jenis.replace('_', ' ')}`, cuti.id, req.admin.nama]
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
    await catatLog(req, 'hr.cuti.putus', { keputusan, jenis: cuti.jenis, hari: cuti.hari });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---------------- Payroll ----------------
router.get('/karyawan-payroll', async (req, res, next) => {
  try {
    await pastikanTabel();
    const periode = /^\d{4}-\d{2}$/.test(req.query.periode || '') ? req.query.periode : hariIni().slice(0, 7);
    const { rows } = await query(
      `SELECT p.*, p.gaji_pokok::float AS gaji_pokok, p.tunjangan::float AS tunjangan, p.potongan::float AS potongan,
              (p.gaji_pokok + p.tunjangan - p.potongan)::float AS total, k.nama, k.jabatan, k.tipe, k.bank, k.rekening,
              'MKL-' || lpad(k.nomor::text, 3, '0') AS nik,
              (SELECT count(*)::int FROM mj_kehadiran h WHERE h.karyawan_id=k.id AND to_char(h.tanggal,'YYYY-MM')=p.periode AND h.status='alpa') AS alpa
       FROM mj_payroll p JOIN mj_karyawan k ON k.id = p.karyawan_id WHERE p.periode=$1 ORDER BY k.nama`,
      [periode]
    );
    const { rows: belum } = await query(
      `SELECT count(*)::int AS n FROM mj_karyawan k WHERE k.status='aktif' AND NOT EXISTS (SELECT 1 FROM mj_payroll p WHERE p.karyawan_id=k.id AND p.periode=$1)`,
      [periode]
    );
    res.json({ periode, baris: rows, belumMasuk: belum[0].n });
  } catch (e) {
    next(e);
  }
});

// Bikin draf payroll periode ini dari gaji & tunjangan yang berlaku sekarang. Yang udah ada nggak ditimpa.
router.post('/karyawan-payroll/draf', async (req, res, next) => {
  try {
    await pastikanTabel();
    const periode = /^\d{4}-\d{2}$/.test(req.body.periode || '') ? req.body.periode : null;
    if (!periode) throw salah('Periode wajib diisi');
    const { rowCount } = await query(
      `INSERT INTO mj_payroll (periode, karyawan_id, gaji_pokok, tunjangan)
       SELECT $1, k.id, k.gaji_pokok, k.tunjangan_transport + k.tunjangan_makan FROM mj_karyawan k WHERE k.status='aktif'
       ON CONFLICT (periode, karyawan_id) DO NOTHING`,
      [periode]
    );
    await catatLog(req, 'hr.payroll.draf', { periode, baris: rowCount });
    res.json({ ok: true, n: rowCount });
  } catch (e) {
    next(e);
  }
});

router.patch('/karyawan-payroll/:id', async (req, res, next) => {
  try {
    await pastikanTabel();
    if (!POLA_UUID.test(req.params.id)) throw salah('Baris payroll tidak ditemukan', 404);
    const { rows: lama } = await query('SELECT status FROM mj_payroll WHERE id=$1', [req.params.id]);
    if (!lama.length) throw salah('Baris payroll tidak ditemukan', 404);
    if (req.body.status === 'dibayar') {
      if (lama[0].status === 'dibayar') throw salah('Udah ditandai dibayar');
      await query("UPDATE mj_payroll SET status='dibayar', dibayar_at=now(), dibayar_oleh=$2 WHERE id=$1", [req.params.id, req.admin.nama]);
      await catatLog(req, 'hr.payroll.dibayar', { id: req.params.id });
      return res.json({ ok: true });
    }
    // Nilai yang udah dibayar nggak boleh diubah diam-diam.
    if (lama[0].status === 'dibayar') throw salah('Payroll yang udah dibayar nggak bisa diubah');
    const potongan = angka(req.body.potongan);
    await query('UPDATE mj_payroll SET potongan=$2, catatan=$3 WHERE id=$1', [req.params.id, potongan, teks(req.body.catatan, 200) || null]);
    await catatLog(req, 'hr.payroll.ubah', { id: req.params.id, potongan });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Kandidat Hired yang belum masuk data karyawan (buat tombol "masukkan ke karyawan").
router.get('/karyawan-calon', async (req, res, next) => {
  try {
    await pastikanTabel();
    const { rows } = await query(
      `SELECT o.id, o.nama, o.no_hp, l.status_sejak AS diangkat FROM mj_orang o JOIN mj_lamaran l ON l.orang_id=o.id AND l.status='hired'
       WHERE NOT EXISTS (SELECT 1 FROM mj_karyawan k WHERE k.orang_id=o.id AND k.status <> 'keluar') ORDER BY l.status_sejak DESC`
    ).catch(() => ({ rows: [] }));
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

export default router;
