import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { query } from './db.js';
import { pastikanTabelOps, ubahLead } from './ops.routes.js';
import { sinkronWarungKeCrm } from './crmSinkron.js';
import { pastikanTabelKaryawan } from './karyawan.routes.js';
import { bacaFoto } from './lapangan.routes.js';

// Detail lead v2 (panel CRM): kunjungan lapangan yang nempel ke kartu, sales PIC & supervisornya (atasan di HR
// Karyawan), checklist follow-up, dan foto warung. Admin lewat /leads/:id/*, sales lewat /lapangan/crm/:id/* (pipeline
// di app sales) - sales cuma boleh kartu yang pemiliknya dia sendiri, dan nggak bisa mindahin kartu ke orang lain.
const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(process.env.LEAD_FOTO_DIR || path.join(__dirname, '../data/lead'));
const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const teks = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const salah = (pesan, status = 400) => Object.assign(new Error(pesan), { status });
const MAKS_FOTO = 1.5 * 1024 * 1024;

let siap = null;
function pastikan() {
  if (!siap) {
    siap = (async () => {
      await pastikanTabelOps();
      await pastikanTabelKaryawan();
      fs.mkdirSync(DIR, { recursive: true });
    })().catch((e) => {
      siap = null;
      throw e;
    });
  }
  return siap;
}
const JALUR = (akhir) => [`/leads/:id${akhir}`, `/lapangan/crm/:id${akhir}`];
router.use(['/leads/:id', '/lapangan/crm/:id'], async (req, res, next) => {
  try {
    if (!POLA_UUID.test(req.params.id)) throw salah('Lead tidak ditemukan', 404);
    await pastikan();
    if (req.admin.peran === 'sales') {
      const { rows } = await query('SELECT pemilik_id FROM mj_lead WHERE id=$1', [req.params.id]);
      if (!rows.length || rows[0].pemilik_id !== req.admin.id) throw salah('Kartu ini bukan punyamu', 404);
    }
    next();
  } catch (e) {
    next(e);
  }
});

// ---- Pipeline sales: kartu CRM miliknya sendiri ----
router.get('/lapangan/crm', async (req, res, next) => {
  try {
    await pastikan();
    await sinkronWarungKeCrm(); // toko yang baru daftar lewat link/QR-nya jadi kartu dulu
    const { rows } = await query(
      `SELECT l.*, l.nilai::float AS nilai, a.nama AS pemilik_nama, 'LD-' || to_char(l.created_at, 'YYYY') || '-' || lpad(l.nomor::text, 4, '0') AS kode,
              (SELECT count(*)::int FROM mj_lapangan_log g WHERE g.lead_id = l.id) AS jumlah_kunjungan
       FROM mj_lead l LEFT JOIN mj_admin a ON a.id = l.pemilik_id
       WHERE l.pemilik_id = $1 AND l.hasil IS NULL ORDER BY l.updated_at DESC LIMIT 1000`,
      [req.admin.id]
    ).catch(async () =>
      // tabel lapangan belum pernah dibikin
      query(
        `SELECT l.*, l.nilai::float AS nilai, a.nama AS pemilik_nama, 'LD-' || to_char(l.created_at, 'YYYY') || '-' || lpad(l.nomor::text, 4, '0') AS kode, 0 AS jumlah_kunjungan
         FROM mj_lead l LEFT JOIN mj_admin a ON a.id = l.pemilik_id WHERE l.pemilik_id = $1 AND l.hasil IS NULL ORDER BY l.updated_at DESC LIMIT 1000`,
        [req.admin.id]
      )
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});
router.patch('/lapangan/crm/:id', async (req, res, next) => {
  try {
    const { pemilik_id, ...isi } = req.body || {}; // eslint-disable-line no-unused-vars
    res.json(await ubahLead(req, req.params.id, req.admin.peran === 'sales' ? isi : req.body));
  } catch (e) {
    next(e);
  }
});
router.get('/lapangan/crm/:id/aktivitas', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM mj_lead_aktivitas WHERE lead_id=$1 ORDER BY created_at DESC LIMIT 100', [req.params.id]);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});
const JENIS_CATATAN = ['catatan', 'follow_up', 'kendala', 'telepon', 'meeting', 'email', 'wa', 'eskalasi'];
router.post('/lapangan/crm/:id/aktivitas', async (req, res, next) => {
  try {
    const isi = teks(req.body.isi, 1000);
    if (!isi) throw salah('Catatannya diisi dulu');
    const jenis = JENIS_CATATAN.includes(req.body.jenis) ? req.body.jenis : 'catatan';
    await catat(req.params.id, req.admin.nama, jenis, isi);
    res.status(201).json({ ok: true });
  } catch (e) {
    next(e);
  }
});
const catat = (leadId, admin, jenis, isi) =>
  query('INSERT INTO mj_lead_aktivitas (lead_id, admin_nama, jenis, isi) VALUES ($1,$2,$3,$4)', [leadId, admin, jenis, isi]).then(() =>
    query('UPDATE mj_lead SET updated_at=now() WHERE id=$1', [leadId])
  );

router.get(JALUR('/detail'), async (req, res, next) => {
  try {
    const { rows: l } = await query(
      `SELECT l.*, l.nilai::float AS nilai, a.nama AS pemilik_nama, 'LD-' || to_char(l.created_at, 'YYYY') || '-' || lpad(l.nomor::text, 4, '0') AS kode
       FROM mj_lead l LEFT JOIN mj_admin a ON a.id = l.pemilik_id WHERE l.id=$1`,
      [req.params.id]
    );
    if (!l.length) throw salah('Lead tidak ditemukan', 404);
    const [{ rows: kunjungan }, { rows: checklist }, { rows: tim }] = await Promise.all([
      // Kolomnya sama kayak /lapangan/log biar bisa dibuka pakai Detail kunjungan di Sales Lapangan.
      query(
        `SELECT l.*, l.tanggal::text AS tanggal, ad.nama AS sales_nama, k.fakta AS fakta, k.contoh_jawaban,
                COALESCE((SELECT json_agg(json_build_object('id', f.id, 'ukuran', f.ukuran) ORDER BY f.created_at) FROM mj_lapangan_foto f WHERE f.log_id = l.id), '[]') AS foto
         FROM mj_lapangan_log l LEFT JOIN mj_admin ad ON ad.id = l.sales_id LEFT JOIN mj_keberatan k ON k.id = l.keberatan_id
         WHERE l.lead_id = $1 ORDER BY l.tanggal DESC, l.created_at DESC`,
        [req.params.id]
      ).catch(() => ({ rows: [] })), // tabel lapangan belum pernah dibikin = belum ada kunjungan
      query('SELECT id, teks, selesai FROM mj_lead_checklist WHERE lead_id=$1 ORDER BY id', [req.params.id]),
      // Sales PIC + atasannya di HR Karyawan (dipakai tombol "Minta bantuan").
      query(
        `SELECT a.id, a.nama, a.peran, k.no_hp, k.jabatan, (k.foto IS NOT NULL) AS ada_foto, s.nama AS atasan_nama, s.no_hp AS atasan_hp, s.jabatan AS atasan_jabatan
         FROM mj_admin a LEFT JOIN mj_karyawan k ON k.admin_id = a.id LEFT JOIN mj_karyawan s ON s.id = k.atasan_id
         WHERE a.id = $1`,
        [l[0].pemilik_id]
      ),
    ]);
    const t = tim[0];
    res.json({
      lead: l[0],
      kunjungan,
      checklist,
      pic: t ? { id: t.id, nama: t.nama, peran: t.peran, no_hp: t.no_hp, jabatan: t.jabatan, ada_foto: t.ada_foto } : null,
      supervisor: t?.atasan_nama ? { nama: t.atasan_nama, no_hp: t.atasan_hp, jabatan: t.atasan_jabatan } : null,
    });
  } catch (e) {
    next(e);
  }
});

// ---- Checklist follow-up ----
router.post(JALUR('/checklist'), async (req, res, next) => {
  try {
    const isi = teks(req.body.teks, 200);
    if (!isi) throw salah('Isi langkahnya dulu');
    const { rows } = await query('INSERT INTO mj_lead_checklist (lead_id, teks) VALUES ($1,$2) RETURNING id, teks, selesai', [req.params.id, isi]);
    await catat(req.params.id, req.admin.nama, 'checklist', `Checklist ditambah: ${isi}`);
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});
router.patch(JALUR('/checklist/:cid'), async (req, res, next) => {
  try {
    const { rows } = await query('UPDATE mj_lead_checklist SET selesai=$3 WHERE id=$2 AND lead_id=$1 RETURNING teks, selesai', [
      req.params.id,
      Number(req.params.cid) || 0,
      Boolean(req.body.selesai),
    ]);
    if (!rows.length) throw salah('Checklist nggak ditemukan', 404);
    await catat(req.params.id, req.admin.nama, 'checklist', `${rows[0].selesai ? 'Selesai' : 'Dibuka lagi'}: ${rows[0].teks}`);
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});
router.delete(JALUR('/checklist/:cid'), async (req, res, next) => {
  try {
    const { rows } = await query('DELETE FROM mj_lead_checklist WHERE id=$2 AND lead_id=$1 RETURNING teks', [req.params.id, Number(req.params.cid) || 0]);
    if (!rows.length) throw salah('Checklist nggak ditemukan', 404);
    await catat(req.params.id, req.admin.nama, 'checklist', `Checklist dihapus: ${rows[0].teks}`);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---- Foto warung (sampul panel) ----
router.put(JALUR('/foto'), async (req, res, next) => {
  try {
    const f = bacaFoto(req.body?.foto);
    if (f.buf.length > MAKS_FOTO) throw salah('Foto maksimal 1,5 MB');
    const nama = `${crypto.randomUUID()}.${f.ext}`;
    fs.writeFileSync(path.join(DIR, nama), f.buf);
    const { rows } = await query('UPDATE mj_lead k SET foto=$2 FROM (SELECT foto AS foto0 FROM mj_lead WHERE id=$1) lama WHERE k.id=$1 RETURNING lama.foto0', [req.params.id, nama]);
    if (!rows.length) {
      fs.rm(path.join(DIR, nama), { force: true }, () => {});
      throw salah('Lead tidak ditemukan', 404);
    }
    if (rows[0].foto0) fs.rm(path.join(DIR, path.basename(rows[0].foto0)), { force: true }, () => {});
    await catat(req.params.id, req.admin.nama, 'data', 'Foto warung diganti');
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
router.get(JALUR('/foto'), async (req, res, next) => {
  try {
    const { rows } = await query('SELECT foto FROM mj_lead WHERE id=$1', [req.params.id]);
    const file = rows[0]?.foto && path.join(DIR, path.basename(rows[0].foto));
    if (!file || !fs.existsSync(file)) throw salah('Belum ada foto', 404);
    const ext = path.extname(file).slice(1);
    res.setHeader('Content-Type', ext === 'png' ? 'image/png' : ext === 'jpg' ? 'image/jpeg' : 'image/webp');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-cache');
    res.sendFile(file);
  } catch (e) {
    next(e);
  }
});

export default router;
