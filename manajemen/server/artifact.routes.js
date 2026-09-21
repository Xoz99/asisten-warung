import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';
import { catatLog, query, pool } from './db.js';

// Artifact: gudang dokumen internal (SOP, dokumen, aset, video, catatan) dalam folder, dengan riwayat versi.
// File disimpan di disk (ARTIFACT_DIR), bukan di database. Upload dikirim mentah (bukan base64/JSON) dan langsung
// dialirkan ke disk, jadi video ratusan MB nggak numpuk di memori.
const router = Router();
export const berkasRouter = Router(); // tanpa login admin - diamankan token berkas berumur pendek

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(process.env.ARTIFACT_DIR || path.join(__dirname, '../data/artifact'));
const MAKS_MB = Number(process.env.ARTIFACT_MAKS_MB || 300);
const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const teks = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const salah = (pesan, status = 400) => Object.assign(new Error(pesan), { status });
const RAHASIA = () => process.env.MANAJEMEN_JWT_SECRET || '';

export const TIPE = ['sop', 'dokumen', 'catatan', 'aset', 'video'];
// Jenis file yang boleh. MIME ditentuin dari ekstensi di server, bukan dari browser. HTML/SVG sengaja nggak boleh:
// dibuka di tab bisa ngejalanin script.
const EKSTENSI = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv',
  txt: 'text/plain',
  md: 'text/markdown',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  zip: 'application/zip',
};
// Yang aman ditampilin langsung di browser (pratinjau). Sisanya selalu diunduh.
const BISA_INLINE = /^(application\/pdf|image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime)|text\/(plain|csv|markdown))$/;

let siap = null;
function pastikanTabel() {
  if (!siap) {
    siap = (async () => {
      await query(`CREATE TABLE IF NOT EXISTS mj_artifact_folder (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nama TEXT NOT NULL,
        induk_id UUID REFERENCES mj_artifact_folder(id) ON DELETE RESTRICT,
        dibuat_oleh UUID,
        created_at TIMESTAMPTZ DEFAULT now()
      )`);
      await query(`CREATE TABLE IF NOT EXISTS mj_artifact (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        folder_id UUID REFERENCES mj_artifact_folder(id) ON DELETE RESTRICT,
        judul TEXT NOT NULL,
        tipe TEXT NOT NULL,
        tag TEXT[] NOT NULL DEFAULT '{}',
        isi_md TEXT, -- khusus catatan
        dibuat_oleh UUID,
        diubah_oleh UUID,
        dihapus_at TIMESTAMPTZ, -- terisi = di sampah
        created_at TIMESTAMPTZ DEFAULT now(),
        diubah_at TIMESTAMPTZ DEFAULT now()
      )`);
      await query(`CREATE TABLE IF NOT EXISTS mj_artifact_versi (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        artifact_id UUID NOT NULL REFERENCES mj_artifact(id) ON DELETE CASCADE,
        nomor INT NOT NULL,
        nama_file TEXT, mime TEXT, ukuran BIGINT NOT NULL DEFAULT 0, lokasi TEXT, -- file
        isi_md TEXT, -- catatan
        keterangan TEXT,
        oleh UUID,
        created_at TIMESTAMPTZ DEFAULT now(),
        UNIQUE (artifact_id, nomor)
      )`);
      await query(`CREATE TABLE IF NOT EXISTS mj_artifact_bintang (
        admin_id UUID NOT NULL, artifact_id UUID NOT NULL REFERENCES mj_artifact(id) ON DELETE CASCADE,
        PRIMARY KEY (admin_id, artifact_id)
      )`);
      await query('CREATE INDEX IF NOT EXISTS idx_mj_artifact_folder ON mj_artifact (folder_id) WHERE dihapus_at IS NULL');
      fs.mkdirSync(DIR, { recursive: true });
    })().catch((e) => {
      siap = null;
      throw e;
    });
  }
  return siap;
}
// Dibatasi ke rute artifact aja: dua router ini dipasang di /api, jadi tanpa path middleware-nya ikut kepanggil
// di semua rute lain.
for (const r of [router, berkasRouter]) {
  r.use(['/artifact', '/artifact-sampah', '/artifact-berkas'], async (req, res, next) => {
    try {
      await pastikanTabel();
      next();
    } catch (e) {
      next(e);
    }
  });
}

const tag = (v) =>
  [...new Set((Array.isArray(v) ? v : String(v || '').split(','))
    .map((t) => teks(String(t), 30).toUpperCase())
    .filter(Boolean))].slice(0, 10);

// Versi terbaru = versi aktif. "Pulihkan" bikin versi baru dari salinan versi lama, jadi riwayat tetap urut.
const VERSI_TERAKHIR = `LEFT JOIN LATERAL (SELECT v.* FROM mj_artifact_versi v WHERE v.artifact_id = a.id ORDER BY v.nomor DESC LIMIT 1) v ON true`;
const KOLOM = `a.id, a.folder_id, a.judul, a.tipe, a.tag, a.created_at, a.diubah_at, a.dihapus_at,
  f.nama AS folder_nama, pa.nama AS pemilik_nama, pa.id AS pemilik_id, ub.nama AS diubah_nama,
  v.nomor AS versi, v.nama_file, v.mime, COALESCE(v.ukuran, 0)::bigint AS ukuran,
  CASE WHEN a.tipe = 'catatan' THEN length(COALESCE(a.isi_md, '')) END AS panjang_isi,
  EXISTS (SELECT 1 FROM mj_artifact_bintang b WHERE b.artifact_id = a.id AND b.admin_id = $1) AS bintang`;
const DARI = `FROM mj_artifact a ${VERSI_TERAKHIR}
  LEFT JOIN mj_artifact_folder f ON f.id = a.folder_id
  LEFT JOIN mj_admin pa ON pa.id = a.dibuat_oleh
  LEFT JOIN mj_admin ub ON ub.id = a.diubah_oleh`;

// Semua turunan folder (buat "isi folder ini termasuk subfoldernya").
async function turunan(folderId) {
  const { rows } = await query(
    `WITH RECURSIVE t AS (SELECT id FROM mj_artifact_folder WHERE id=$1 UNION ALL
       SELECT f.id FROM mj_artifact_folder f JOIN t ON f.induk_id = t.id) SELECT id FROM t`,
    [folderId]
  );
  return rows.map((r) => r.id);
}

router.get('/artifact/ringkasan', async (req, res, next) => {
  try {
    const [{ rows: tipe }, { rows: folder }, { rows: ukuran }, { rows: sampah }, { rows: pemilik }] = await Promise.all([
      query(`SELECT tipe, count(*)::int AS n FROM mj_artifact WHERE dihapus_at IS NULL GROUP BY tipe`),
      query(`SELECT count(*)::int AS n FROM mj_artifact_folder`),
      // Terpakai = semua versi yang masih ada di disk (termasuk yang di sampah, karena filenya belum dihapus).
      query(`SELECT COALESCE(SUM(ukuran), 0)::bigint AS n FROM mj_artifact_versi`),
      query(`SELECT count(*)::int AS n FROM mj_artifact WHERE dihapus_at IS NOT NULL`),
      query(`SELECT DISTINCT ad.id, ad.nama FROM mj_artifact a JOIN mj_admin ad ON ad.id = a.dibuat_oleh WHERE a.dihapus_at IS NULL ORDER BY ad.nama`),
    ]);
    res.json({
      perTipe: Object.fromEntries(tipe.map((r) => [r.tipe, r.n])),
      folder: folder[0].n,
      terpakai: Number(ukuran[0].n),
      sampah: sampah[0].n,
      pemilik,
      maksMb: MAKS_MB,
    });
  } catch (e) {
    next(e);
  }
});

router.get('/artifact/folder', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT f.id, f.nama, f.induk_id,
         (SELECT count(*)::int FROM mj_artifact a WHERE a.folder_id = f.id AND a.dihapus_at IS NULL) AS jumlah,
         (SELECT count(*)::int FROM mj_artifact_folder c WHERE c.induk_id = f.id) AS subfolder
       FROM mj_artifact_folder f ORDER BY f.nama`
    );
    const { rows: tot } = await query(
      `SELECT count(*) FILTER (WHERE dihapus_at IS NULL)::int AS semua, count(*) FILTER (WHERE dihapus_at IS NOT NULL)::int AS sampah,
         (SELECT count(*)::int FROM mj_artifact_bintang b JOIN mj_artifact a ON a.id=b.artifact_id WHERE b.admin_id=$1 AND a.dihapus_at IS NULL) AS bintang
       FROM mj_artifact`,
      [req.admin.id]
    );
    res.json({ folder: rows, ...tot[0] });
  } catch (e) {
    next(e);
  }
});

router.post('/artifact/folder', async (req, res, next) => {
  try {
    const nama = teks(req.body.nama, 80);
    if (!nama) throw salah('Nama folder wajib diisi');
    const induk = POLA_UUID.test(req.body.induk_id || '') ? req.body.induk_id : null;
    if (induk && !(await query('SELECT 1 FROM mj_artifact_folder WHERE id=$1', [induk])).rows.length) throw salah('Folder induk nggak ditemukan');
    const { rows: dobel } = await query('SELECT 1 FROM mj_artifact_folder WHERE lower(nama)=lower($1) AND induk_id IS NOT DISTINCT FROM $2', [nama, induk]);
    if (dobel.length) throw salah('Udah ada folder dengan nama itu di tempat yang sama', 409);
    const { rows } = await query('INSERT INTO mj_artifact_folder (nama, induk_id, dibuat_oleh) VALUES ($1,$2,$3) RETURNING id, nama', [nama, induk, req.admin.id]);
    await catatLog(req, 'artifact.folder.tambah', { nama });
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.patch('/artifact/folder/:id', async (req, res, next) => {
  try {
    if (!POLA_UUID.test(req.params.id)) throw salah('Folder nggak ditemukan', 404);
    const nama = teks(req.body.nama, 80);
    if (!nama) throw salah('Nama folder wajib diisi');
    const { rows } = await query('UPDATE mj_artifact_folder SET nama=$2 WHERE id=$1 RETURNING nama', [req.params.id, nama]);
    if (!rows.length) throw salah('Folder nggak ditemukan', 404);
    await catatLog(req, 'artifact.folder.ubah', { nama });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Folder cuma bisa dihapus kalau udah kosong (termasuk isi sampahnya) - biar nggak ada file yang ilang diam-diam.
router.delete('/artifact/folder/:id', async (req, res, next) => {
  try {
    if (!POLA_UUID.test(req.params.id)) throw salah('Folder nggak ditemukan', 404);
    const { rows: isi } = await query(
      `SELECT (SELECT count(*) FROM mj_artifact WHERE folder_id=$1)::int AS file, (SELECT count(*) FROM mj_artifact_folder WHERE induk_id=$1)::int AS sub`,
      [req.params.id]
    );
    if (isi[0].sub) throw salah('Hapus atau pindahin subfoldernya dulu');
    if (isi[0].file) throw salah(`Folder masih berisi ${isi[0].file} item (termasuk yang di sampah). Pindahin atau hapus permanen dulu.`);
    const { rows } = await query('DELETE FROM mj_artifact_folder WHERE id=$1 RETURNING nama', [req.params.id]);
    if (!rows.length) throw salah('Folder nggak ditemukan', 404);
    await catatLog(req, 'artifact.folder.hapus', { nama: rows[0].nama });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get('/artifact', async (req, res, next) => {
  try {
    const mode = ['semua', 'bintang', 'sampah', 'folder'].includes(req.query.mode) ? req.query.mode : 'semua';
    const syarat = [];
    const nilai = [req.admin.id];
    // Tiap "?" di potongan SQL = parameter yang sama (nilai v).
    const tambah = (sql, v) => {
      nilai.push(v);
      syarat.push(sql.replaceAll('?', `$${nilai.length}`));
    };
    syarat.push(mode === 'sampah' ? 'a.dihapus_at IS NOT NULL' : 'a.dihapus_at IS NULL');
    if (mode === 'bintang') syarat.push('EXISTS (SELECT 1 FROM mj_artifact_bintang b WHERE b.artifact_id=a.id AND b.admin_id=$1)');
    if (mode === 'folder') {
      if (!POLA_UUID.test(req.query.folder || '')) throw salah('Folder nggak ditemukan', 404);
      tambah('a.folder_id = ANY(?::uuid[])', await turunan(req.query.folder));
    }
    if (TIPE.includes(req.query.tipe)) tambah('a.tipe = ?', req.query.tipe);
    if (POLA_UUID.test(req.query.pemilik || '')) tambah('a.dibuat_oleh = ?', req.query.pemilik);
    const q = teks(req.query.q, 80);
    if (q) {
      const pola = '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
      tambah(`(a.judul ILIKE ? OR v.nama_file ILIKE ? OR array_to_string(a.tag, ' ') ILIKE ? OR a.isi_md ILIKE ?)`, pola);
    }
    const urut = { nama: 'lower(a.judul)', ukuran: 'ukuran DESC', terbaru: 'a.diubah_at DESC' }[req.query.urut] || 'a.diubah_at DESC';
    const { rows } = await query(`SELECT ${KOLOM} ${DARI} WHERE ${syarat.join(' AND ')} ORDER BY ${urut}, a.id LIMIT 500`, nilai);
    res.json(rows.map((r) => ({ ...r, ukuran: Number(r.ukuran) })));
  } catch (e) {
    next(e);
  }
});

router.get('/artifact/:id', async (req, res, next) => {
  try {
    if (!POLA_UUID.test(req.params.id)) throw salah('Artifact nggak ditemukan', 404);
    const { rows } = await query(`SELECT ${KOLOM}, a.isi_md ${DARI} WHERE a.id=$2`, [req.admin.id, req.params.id]);
    if (!rows.length) throw salah('Artifact nggak ditemukan', 404);
    const { rows: versi } = await query(
      `SELECT v.id, v.nomor, v.nama_file, v.ukuran::bigint AS ukuran, v.keterangan, v.created_at, ad.nama AS oleh
       FROM mj_artifact_versi v LEFT JOIN mj_admin ad ON ad.id = v.oleh WHERE v.artifact_id=$1 ORDER BY v.nomor DESC`,
      [req.params.id]
    );
    res.json({ artifact: { ...rows[0], ukuran: Number(rows[0].ukuran) }, versi: versi.map((v) => ({ ...v, ukuran: Number(v.ukuran) })) });
  } catch (e) {
    next(e);
  }
});

async function folderValid(id) {
  if (!id) return null;
  if (!POLA_UUID.test(id)) throw salah('Folder nggak ditemukan');
  if (!(await query('SELECT 1 FROM mj_artifact_folder WHERE id=$1', [id])).rows.length) throw salah('Folder nggak ditemukan');
  return id;
}

// Catatan baru (markdown). Tipe boleh "catatan" atau "sop" (SOP yang ditulis langsung, bukan file).
router.post('/artifact/catatan', async (req, res, next) => {
  try {
    const judul = teks(req.body.judul, 150);
    if (!judul) throw salah('Judul wajib diisi');
    const isi = typeof req.body.isi === 'string' ? req.body.isi.slice(0, 200000) : '';
    const tipe = req.body.tipe === 'sop' ? 'sop' : 'catatan';
    const folder = await folderValid(req.body.folder_id);
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const { rows } = await c.query(
        `INSERT INTO mj_artifact (folder_id, judul, tipe, tag, isi_md, dibuat_oleh, diubah_oleh) VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING id`,
        [folder, judul, tipe, tag(req.body.tag), isi, req.admin.id]
      );
      await c.query(`INSERT INTO mj_artifact_versi (artifact_id, nomor, isi_md, ukuran, keterangan, oleh) VALUES ($1,1,$2,$3,'Dibuat',$4)`, [
        rows[0].id,
        isi,
        Buffer.byteLength(isi),
        req.admin.id,
      ]);
      await c.query('COMMIT');
      await catatLog(req, 'artifact.catatan.tambah', { judul });
      res.status(201).json(rows[0]);
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  } catch (e) {
    next(e);
  }
});

// Upload file mentah. Metadata lewat query string: ?nama=&folder=&tipe=&tag=  (atau ?artifact=<id> buat versi baru).
function simpanAliran(req, lokasi) {
  return new Promise((ok, gagal) => {
    const maks = MAKS_MB * 1024 * 1024;
    const declared = Number(req.get('content-length') || 0);
    if (declared > maks) return gagal(salah(`File maksimal ${MAKS_MB} MB`, 413));
    const tulis = fs.createWriteStream(lokasi, { flags: 'wx' });
    let ukuran = 0;
    let selesai = false;
    const batal = (err) => {
      if (selesai) return;
      selesai = true;
      tulis.destroy();
      fs.rm(lokasi, { force: true }, () => gagal(err));
    };
    req.on('data', (b) => {
      ukuran += b.length;
      if (ukuran > maks) {
        req.unpipe(tulis);
        req.resume();
        batal(salah(`File maksimal ${MAKS_MB} MB`, 413));
      }
    });
    req.on('aborted', () => batal(salah('Upload dibatalkan')));
    tulis.on('error', batal);
    tulis.on('finish', () => {
      if (selesai) return;
      selesai = true;
      if (!ukuran) return fs.rm(lokasi, { force: true }, () => gagal(salah('File kosong')));
      ok(ukuran);
    });
    req.pipe(tulis);
  });
}

router.post('/artifact/unggah', async (req, res, next) => {
  let lokasi = null;
  try {
    const nama = teks(req.query.nama, 200).replace(/[/\\]/g, '_');
    const ext = (nama.split('.').pop() || '').toLowerCase();
    const mime = nama.includes('.') ? EKSTENSI[ext] : null;
    if (!mime) throw salah(`Jenis file .${ext || '?'} nggak didukung. Boleh: ${Object.keys(EKSTENSI).join(', ')}`);
    const versiDari = POLA_UUID.test(req.query.artifact || '') ? req.query.artifact : null;
    let artifact = null;
    if (versiDari) {
      const { rows } = await query('SELECT id, tipe, judul FROM mj_artifact WHERE id=$1 AND dihapus_at IS NULL', [versiDari]);
      if (!rows.length) throw salah('Artifact nggak ditemukan', 404);
      if (rows[0].tipe === 'catatan') throw salah('Catatan diubah lewat editor, bukan upload file');
      artifact = rows[0];
    }
    const folder = versiDari ? null : await folderValid(req.query.folder || null);
    const tipe = TIPE.includes(req.query.tipe) && req.query.tipe !== 'catatan' ? req.query.tipe : mime.startsWith('video/') ? 'video' : mime.startsWith('image/') || ext === 'zip' ? 'aset' : 'dokumen';

    const berkas = `${crypto.randomUUID()}.${ext}`;
    lokasi = path.join(DIR, berkas);
    const ukuran = await simpanAliran(req, lokasi);

    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      let id = artifact?.id;
      if (!id) {
        const judul = teks(req.query.judul, 150) || nama.replace(/\.[^.]+$/, '');
        const { rows } = await c.query(
          `INSERT INTO mj_artifact (folder_id, judul, tipe, tag, dibuat_oleh, diubah_oleh) VALUES ($1,$2,$3,$4,$5,$5) RETURNING id`,
          [folder, judul, tipe, tag(req.query.tag), req.admin.id]
        );
        id = rows[0].id;
      }
      // Kunci baris artifact-nya biar dua upload versi barengan nggak dapet nomor versi yang sama.
      await c.query('SELECT 1 FROM mj_artifact WHERE id=$1 FOR UPDATE', [id]);
      const { rows: n } = await c.query('SELECT COALESCE(MAX(nomor), 0) + 1 AS n FROM mj_artifact_versi WHERE artifact_id=$1', [id]);
      await c.query(
        `INSERT INTO mj_artifact_versi (artifact_id, nomor, nama_file, mime, ukuran, lokasi, keterangan, oleh) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, n[0].n, nama, mime, ukuran, berkas, teks(req.query.keterangan, 200) || (artifact ? 'Versi baru' : 'Diunggah'), req.admin.id]
      );
      if (artifact) await c.query('UPDATE mj_artifact SET diubah_at=now(), diubah_oleh=$2 WHERE id=$1', [id, req.admin.id]);
      await c.query('COMMIT');
      lokasi = null; // udah tercatat, jangan dihapus
      await catatLog(req, artifact ? 'artifact.versi.tambah' : 'artifact.unggah', { nama, ukuran, ...(artifact ? { judul: artifact.judul, versi: n[0].n } : {}) });
      res.status(201).json({ id, versi: n[0].n });
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  } catch (e) {
    if (lokasi) fs.rm(lokasi, { force: true }, () => {});
    // Kalau ditolak sebelum body kebaca, sisa kiriman dibuang biar koneksinya nggak ngegantung.
    if (!req.complete) req.resume();
    next(e);
  }
});

// Ubah judul / folder / tag / tipe, atau isi catatan (isi berubah = versi baru).
router.patch('/artifact/:id', async (req, res, next) => {
  try {
    if (!POLA_UUID.test(req.params.id)) throw salah('Artifact nggak ditemukan', 404);
    const { rows: lama } = await query('SELECT * FROM mj_artifact WHERE id=$1', [req.params.id]);
    const a = lama[0];
    if (!a) throw salah('Artifact nggak ditemukan', 404);
    if (a.dihapus_at) throw salah('Pulihin dari sampah dulu sebelum diubah');
    const set = {};
    if (req.body.judul !== undefined) {
      set.judul = teks(req.body.judul, 150);
      if (!set.judul) throw salah('Judul wajib diisi');
    }
    if (req.body.folder_id !== undefined) set.folder_id = await folderValid(req.body.folder_id || null);
    if (req.body.tag !== undefined) set.tag = tag(req.body.tag);
    if (req.body.tipe !== undefined) {
      if (!TIPE.includes(req.body.tipe)) throw salah('Tipe nggak dikenal');
      // Catatan cuma bisa jadi SOP-tulisan & sebaliknya; file nggak bisa jadi catatan.
      const catatanLama = a.isi_md !== null;
      if (catatanLama && !['catatan', 'sop'].includes(req.body.tipe)) throw salah('Catatan cuma bisa bertipe Catatan atau SOP');
      if (!catatanLama && req.body.tipe === 'catatan') throw salah('File nggak bisa diubah jadi catatan');
      set.tipe = req.body.tipe;
    }
    const isiBaru = typeof req.body.isi === 'string' && a.isi_md !== null && req.body.isi !== a.isi_md ? req.body.isi.slice(0, 200000) : null;
    if (isiBaru !== null) set.isi_md = isiBaru;
    const kolom = Object.keys(set);
    if (!kolom.length) return res.json({ ok: true, berubah: false });
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(
        `UPDATE mj_artifact SET ${kolom.map((k, i) => `${k}=$${i + 2}`).join(', ')}, diubah_at=now(), diubah_oleh=$${kolom.length + 2} WHERE id=$1`,
        [a.id, ...kolom.map((k) => set[k]), req.admin.id]
      );
      if (isiBaru !== null) {
        await c.query(
          `INSERT INTO mj_artifact_versi (artifact_id, nomor, isi_md, ukuran, keterangan, oleh)
           SELECT $1, COALESCE(MAX(nomor),0)+1, $2, $3, $4, $5 FROM mj_artifact_versi WHERE artifact_id=$1`,
          [a.id, isiBaru, Buffer.byteLength(isiBaru), teks(req.body.keterangan, 200) || 'Isi diubah', req.admin.id]
        );
      }
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
    await catatLog(req, 'artifact.ubah', { judul: set.judul || a.judul, diubah: kolom.join(', ') });
    res.json({ ok: true, berubah: true });
  } catch (e) {
    next(e);
  }
});

// Pulihkan versi lama = versi baru berisi salinan versi itu (file di disk dipakai bareng, nggak diduplikat).
router.post('/artifact/:id/versi/:versiId/pulihkan', async (req, res, next) => {
  try {
    if (!POLA_UUID.test(req.params.id) || !POLA_UUID.test(req.params.versiId)) throw salah('Versi nggak ditemukan', 404);
    const c = await pool.connect();
    let hasil;
    try {
      await c.query('BEGIN');
      const { rows } = await c.query(
        `SELECT v.*, a.judul, a.dihapus_at FROM mj_artifact_versi v JOIN mj_artifact a ON a.id=v.artifact_id WHERE v.id=$1 AND v.artifact_id=$2 FOR UPDATE OF a`,
        [req.params.versiId, req.params.id]
      );
      const v = rows[0];
      if (!v) throw salah('Versi nggak ditemukan', 404);
      if (v.dihapus_at) throw salah('Pulihin dari sampah dulu');
      const { rows: n } = await c.query('SELECT MAX(nomor) AS n FROM mj_artifact_versi WHERE artifact_id=$1', [req.params.id]);
      if (n[0].n === v.nomor) throw salah('Ini udah versi aktif');
      await c.query(
        `INSERT INTO mj_artifact_versi (artifact_id, nomor, nama_file, mime, ukuran, lokasi, isi_md, keterangan, oleh) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [req.params.id, n[0].n + 1, v.nama_file, v.mime, v.ukuran, v.lokasi, v.isi_md, `Dipulihkan dari v${v.nomor}`, req.admin.id]
      );
      await c.query(`UPDATE mj_artifact SET diubah_at=now(), diubah_oleh=$2${v.isi_md !== null ? ', isi_md=$3' : ''} WHERE id=$1`, [
        req.params.id,
        req.admin.id,
        ...(v.isi_md !== null ? [v.isi_md] : []),
      ]);
      await c.query('COMMIT');
      hasil = { judul: v.judul, dari: v.nomor, jadi: n[0].n + 1 };
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
    await catatLog(req, 'artifact.versi.pulihkan', hasil);
    res.json({ ok: true, ...hasil });
  } catch (e) {
    next(e);
  }
});

router.post('/artifact/:id/bintang', async (req, res, next) => {
  try {
    if (!POLA_UUID.test(req.params.id)) throw salah('Artifact nggak ditemukan', 404);
    if (req.body.bintang) {
      await query('INSERT INTO mj_artifact_bintang (admin_id, artifact_id) SELECT $1, id FROM mj_artifact WHERE id=$2 ON CONFLICT DO NOTHING', [req.admin.id, req.params.id]);
    } else {
      await query('DELETE FROM mj_artifact_bintang WHERE admin_id=$1 AND artifact_id=$2', [req.admin.id, req.params.id]);
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Buang ke sampah / pulihin dari sampah.
router.post('/artifact/:id/sampah', async (req, res, next) => {
  try {
    if (!POLA_UUID.test(req.params.id)) throw salah('Artifact nggak ditemukan', 404);
    const buang = req.body.buang !== false;
    const { rows } = await query(
      `UPDATE mj_artifact SET dihapus_at=${buang ? 'now()' : 'NULL'}, diubah_oleh=$2 WHERE id=$1 AND (dihapus_at IS NULL) = $3 RETURNING judul`,
      [req.params.id, req.admin.id, buang]
    );
    if (!rows.length) throw salah(buang ? 'Artifact nggak ditemukan atau udah di sampah' : 'Artifact nggak ada di sampah', 404);
    await catatLog(req, buang ? 'artifact.sampah' : 'artifact.pulih', { judul: rows[0].judul });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Hapus permanen (cuma dari sampah) + buang file yang udah nggak dipakai versi mana pun.
async function hapusPermanen(ids) {
  const { rows: file } = await query(
    `SELECT DISTINCT lokasi FROM mj_artifact_versi WHERE artifact_id = ANY($1::uuid[]) AND lokasi IS NOT NULL`,
    [ids]
  );
  const { rows } = await query('DELETE FROM mj_artifact WHERE id = ANY($1::uuid[]) AND dihapus_at IS NOT NULL RETURNING judul', [ids]);
  for (const f of file) {
    const { rows: masihDipakai } = await query('SELECT 1 FROM mj_artifact_versi WHERE lokasi=$1 LIMIT 1', [f.lokasi]);
    if (!masihDipakai.length) fs.rm(path.join(DIR, path.basename(f.lokasi)), { force: true }, () => {});
  }
  return rows;
}

router.delete('/artifact/:id', async (req, res, next) => {
  try {
    if (!POLA_UUID.test(req.params.id)) throw salah('Artifact nggak ditemukan', 404);
    const rows = await hapusPermanen([req.params.id]);
    if (!rows.length) throw salah('Cuma item di sampah yang bisa dihapus permanen', 400);
    await catatLog(req, 'artifact.hapus', { judul: rows[0].judul });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/artifact-sampah/kosongkan', async (req, res, next) => {
  try {
    await pastikanTabel();
    const { rows } = await query('SELECT id FROM mj_artifact WHERE dihapus_at IS NOT NULL');
    const dihapus = rows.length ? await hapusPermanen(rows.map((r) => r.id)) : [];
    await catatLog(req, 'artifact.sampah.kosongkan', { jumlah: dihapus.length });
    res.json({ ok: true, n: dihapus.length });
  } catch (e) {
    next(e);
  }
});

// Link berkas sementara (10 menit) buat pratinjau / unduh. Dipakai <img>, <video>, <iframe> yang nggak bisa kirim
// header Authorization. Token-nya khusus satu versi file, bukan token sesi admin.
router.post('/artifact/:id/tautan', async (req, res, next) => {
  try {
    if (!POLA_UUID.test(req.params.id)) throw salah('Artifact nggak ditemukan', 404);
    const versiId = POLA_UUID.test(req.body.versi || '') ? req.body.versi : null;
    const { rows } = await query(
      `SELECT v.id FROM mj_artifact_versi v WHERE v.artifact_id=$1 AND v.lokasi IS NOT NULL ${versiId ? 'AND v.id=$2' : ''} ORDER BY v.nomor DESC LIMIT 1`,
      versiId ? [req.params.id, versiId] : [req.params.id]
    );
    if (!rows.length) throw salah('Artifact ini nggak punya file', 404);
    const t = jwt.sign({ vid: rows[0].id }, RAHASIA(), { expiresIn: '10m', audience: 'artifact-berkas' });
    if (req.body.unduh) await catatLog(req, 'artifact.unduh', { id: req.params.id });
    res.json({ url: `/api/artifact-berkas/${rows[0].id}?t=${encodeURIComponent(t)}${req.body.unduh ? '&unduh=1' : ''}` });
  } catch (e) {
    next(e);
  }
});

berkasRouter.get('/artifact-berkas/:vid', async (req, res, next) => {
  try {
    let p;
    try {
      p = jwt.verify(String(req.query.t || ''), RAHASIA(), { audience: 'artifact-berkas' });
    } catch {
      return res.status(401).json({ error: 'Link file udah kedaluwarsa, buka lagi dari halaman Artifact' });
    }
    if (p.vid !== req.params.vid) return res.status(401).json({ error: 'Link file nggak cocok' });
    const { rows } = await query('SELECT nama_file, mime, lokasi FROM mj_artifact_versi WHERE id=$1 AND lokasi IS NOT NULL', [req.params.vid]);
    const v = rows[0];
    if (!v) throw salah('File nggak ditemukan', 404);
    const file = path.join(DIR, path.basename(v.lokasi));
    if (!fs.existsSync(file)) throw salah('File-nya hilang dari penyimpanan server', 404);
    const inline = !req.query.unduh && BISA_INLINE.test(v.mime);
    res.setHeader('Content-Type', v.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // PDF nggak dikasih sandbox: penampil PDF Chrome nolak jalan di dokumen ber-sandbox.
    if (v.mime !== 'application/pdf') res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
    res.setHeader('Cache-Control', 'private, max-age=600');
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(v.nama_file)}`);
    // sendFile ngurus Range request (video bisa di-seek).
    res.sendFile(file, { headers: { 'Content-Type': v.mime } });
  } catch (e) {
    next(e);
  }
});

export default router;
