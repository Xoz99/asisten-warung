import { Router } from 'express';
import { query } from '../db.js';
import { nilaiJudol, PESAN_DIBLOKIR } from '../utils/filterJudol.js';
import { pastikanKolomProfil } from '../services/profilUsaha.service.js';

const router = Router();

// Whitelist topik biar kolom `tag` nggak keisi sampah dari client yang aneh-aneh - tetep
// nullable (postingan lama / obrolan bebas boleh nggak milih topik sama sekali).
const TOPIK_VALID = ['Dagangan', 'Kasbon', 'Supplier', 'Lainnya'];

// Foto lampiran post/komentar: data URL gambar yang udah dikecilin di HP (maks 1024px). Dibatasi ~1MB
// biar satu foto nggak bikin feed berat / database bengkak. Bukan gambar (atau kegedean) = ditolak.
const FOTO_MAKS_HURUF = 1_400_000;
const fotoValid = (f) => typeof f === 'string' && f.length <= FOTO_MAKS_HURUF && /^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(f);

// Kolom foto ditambah otomatis kalau belum ada - deploy di VPS nggak jalanin `npm run migrate`.
let kolomFotoSiap = null;
function pastikanKolomFoto() {
  if (!kolomFotoSiap) {
    kolomFotoSiap = (async () => {
      await query('ALTER TABLE komunitas_post ADD COLUMN IF NOT EXISTS foto_url TEXT');
      await query('ALTER TABLE komunitas_komentar ADD COLUMN IF NOT EXISTS foto_url TEXT');
    })().catch((e) => {
      kolomFotoSiap = null;
      throw e;
    });
  }
  return kolomFotoSiap;
}

const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Notifikasi Komunitas: "X mengomentari postinganmu" & "X membalas komentarmu". Tabel dibikin otomatis kalau
// belum ada (deploy nggak jalanin migrate). Komentar/postingan dihapus = notifikasinya ikut kehapus (CASCADE).
let tabelNotifSiap = null;
function pastikanTabelNotif() {
  if (!tabelNotifSiap) {
    tabelNotifSiap = (async () => {
      await pastikanKolomFoto();
      await query(`CREATE TABLE IF NOT EXISTS komunitas_notif (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        warung_id UUID NOT NULL REFERENCES warung(id) ON DELETE CASCADE,
        dari_warung_id UUID NOT NULL REFERENCES warung(id) ON DELETE CASCADE,
        post_id UUID NOT NULL REFERENCES komunitas_post(id) ON DELETE CASCADE,
        komentar_id UUID REFERENCES komunitas_komentar(id) ON DELETE CASCADE,
        jenis TEXT NOT NULL,
        dibaca BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT now()
      )`);
      await query('CREATE INDEX IF NOT EXISTS idx_komunitas_notif_penerima ON komunitas_notif (warung_id, dibaca, created_at DESC)');
    })().catch((e) => {
      tabelNotifSiap = null;
      throw e;
    });
  }
  return tabelNotifSiap;
}

// Ikuti antar warung (followers/following). Notifikasi "mulai mengikuti kamu" nggak nyangkut postingan mana pun,
// jadi kolom post_id di komunitas_notif dilonggarin jadi boleh kosong.
let tabelIkutiSiap = null;
function pastikanTabelIkuti() {
  if (!tabelIkutiSiap) {
    tabelIkutiSiap = (async () => {
      await pastikanTabelNotif();
      await query(`CREATE TABLE IF NOT EXISTS komunitas_ikuti (
        pengikut_id UUID NOT NULL REFERENCES warung(id) ON DELETE CASCADE,
        diikuti_id UUID NOT NULL REFERENCES warung(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT now(),
        PRIMARY KEY (pengikut_id, diikuti_id),
        CHECK (pengikut_id <> diikuti_id)
      )`);
      await query('CREATE INDEX IF NOT EXISTS idx_komunitas_ikuti_diikuti ON komunitas_ikuti (diikuti_id)');
      await query('ALTER TABLE komunitas_notif ALTER COLUMN post_id DROP NOT NULL');
    })().catch((e) => {
      tabelIkutiSiap = null;
      throw e;
    });
  }
  return tabelIkutiSiap;
}

// Data warung yang AMAN ditampilin ke warung lain: nama, jenis usaha, sejak kapan gabung. Nomor HP, username,
// & isi profil lain (kebutuhan, penjaga) sengaja nggak ikut.
const KOLOM_WARUNG = `w.id, w.nama, w.created_at AS bergabung, w.profil_usaha->>'jenis' AS jenis, w.profil_usaha->>'jenisLain' AS jenis_lain`;
// Pola ILIKE dari ketikan user - % & _ di-escape biar nggak jadi wildcard
const polaIlike = (teks) => `%${teks.replace(/[\\%_]/g, (c) => '\\' + c)}%`;

// Penerima: pemilik postingan ("komentar") & pemilik komentar yang dibales ("balasan"). Nggak pernah ngirim
// notif ke diri sendiri, dan 1 komentar = maksimal 1 notif per penerima (kalau yang dibales pemilik
// postingannya sendiri, cukup notif "balasan").
async function buatNotifKomentar({ postId, komentarId, dari, targetWarung }) {
  await pastikanTabelNotif();
  const penerima = new Map();
  const { rows } = await query('SELECT warung_id FROM komunitas_post WHERE id=$1', [postId]);
  const pemilikPost = rows[0]?.warung_id;
  if (pemilikPost && pemilikPost !== dari) penerima.set(pemilikPost, 'komentar');
  if (targetWarung && targetWarung !== dari) penerima.set(targetWarung, 'balasan');
  for (const [warungId, jenis] of penerima) {
    await query('INSERT INTO komunitas_notif (warung_id, dari_warung_id, post_id, komentar_id, jenis) VALUES ($1,$2,$3,$4,$5)', [
      warungId,
      dari,
      postId,
      komentarId,
      jenis,
    ]);
  }
}

// Komunitas — feed NASIONAL (semua warung berlangganan lihat feed yang sama, belum dikelompokkan
// per wilayah — fondasi dulu, filter lokasi nyusul kalau usernya udah banyak) buat saling sharing
// harga jual & profit penjualan. Ditampilin ATAS NAMA WARUNG (bukan anonim, keputusan produk),
// jadi query di bawah selalu JOIN ke tabel warung buat ambil nama-nya.
//
// Field terstruktur (nama_barang/harga_jual/profit) SEMUANYA opsional — juga bisa dipakai buat
// obrolan bebas doang (cuma isi cerita). Minimal salah satu dari cerita/nama_barang wajib diisi,
// dicek di endpoint POST (bukan constraint DB, biar pesan errornya ramah).

// ---- Notifikasi (ditaruh di atas rute /:id biar "notif" nggak kebaca sebagai id postingan) ----
router.get('/notif/jumlah', async (req, res, next) => {
  try {
    await pastikanTabelNotif();
    const { rows } = await query('SELECT COUNT(*)::int AS n FROM komunitas_notif WHERE warung_id=$1 AND NOT dibaca', [req.warungId]);
    res.json({ belumDibaca: rows[0].n });
  } catch (e) {
    next(e);
  }
});

router.get('/notif', async (req, res, next) => {
  try {
    await pastikanTabelNotif();
    const { rows } = await query(
      `SELECT n.id, n.jenis, n.dibaca, n.created_at, n.post_id, n.komentar_id, n.dari_warung_id, w.nama AS dari_nama,
              left(COALESCE(kp.cerita, kp.nama_barang, ''), 80) AS post_cuplikan,
              left(COALESCE(kk.teks, ''), 120) AS teks, (kk.foto_url IS NOT NULL) AS ada_foto
       FROM komunitas_notif n
       JOIN warung w ON w.id = n.dari_warung_id
       LEFT JOIN komunitas_post kp ON kp.id = n.post_id
       LEFT JOIN komunitas_komentar kk ON kk.id = n.komentar_id
       WHERE n.warung_id = $1
       ORDER BY n.created_at DESC LIMIT 50`,
      [req.warungId]
    );
    res.json({ belumDibaca: rows.filter((n) => !n.dibaca).length, daftar: rows });
  } catch (e) {
    next(e);
  }
});

// { id } = satu notifikasi, { postId } = semua notifikasi postingan itu (pas postingannya dibuka), {} = semua
router.post('/notif/baca', async (req, res, next) => {
  try {
    const { id = null, postId = null } = req.body || {};
    if ((id && !POLA_UUID.test(id)) || (postId && !POLA_UUID.test(postId))) return res.status(400).json({ error: 'id nggak valid' });
    await pastikanTabelNotif();
    await query(
      `UPDATE komunitas_notif SET dibaca = true
       WHERE warung_id = $1 AND NOT dibaca AND ($2::uuid IS NULL OR id = $2) AND ($3::uuid IS NULL OR post_id = $3)`,
      [req.warungId, id, postId]
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(50, Math.max(1, +req.query.limit || 20));
    const before = req.query.before || null; // cursor pagination: ambil yang lebih lama dari timestamp ini
    // ?milik=saya -> cuma postingan warung sendiri (tab "Postingan saya"), sampai 50 terakhir sekaligus
    const milikSaya = req.query.milik === 'saya';
    // ?warung=<id> -> postingan satu warung (halaman profil) · ?ikuti=1 -> dari warung yang diikuti · ?q= -> cari isi postingan
    const warungFilter = POLA_UUID.test(req.query.warung || '') ? req.query.warung : null;
    const ikuti = req.query.ikuti === '1';
    const cari = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 60) : '';
    const banyak = milikSaya || warungFilter || ikuti || cari;
    await pastikanTabelIkuti(); // query di bawah nyebut tabel komunitas_ikuti, jadi tabelnya harus udah ada
    const { rows } = await query(
      `SELECT kp.*, w.nama AS warung_nama,
              (SELECT COUNT(*) FROM komunitas_suka s WHERE s.post_id = kp.id) AS jumlah_suka,
              (SELECT COUNT(*) FROM komunitas_komentar k WHERE k.post_id = kp.id) AS jumlah_komentar,
              EXISTS(SELECT 1 FROM komunitas_suka s2 WHERE s2.post_id = kp.id AND s2.warung_id = $1) AS disukai
       FROM komunitas_post kp
       JOIN warung w ON w.id = kp.warung_id
       WHERE ($2::timestamptz IS NULL OR kp.created_at < $2::timestamptz)
         AND ($4::boolean IS NOT TRUE OR kp.warung_id = $1)
         AND ($5::uuid IS NULL OR kp.warung_id = $5)
         AND ($6::boolean IS NOT TRUE OR kp.warung_id IN (SELECT diikuti_id FROM komunitas_ikuti WHERE pengikut_id = $1))
         AND ($7::text IS NULL OR kp.cerita ILIKE $7 OR kp.nama_barang ILIKE $7)
       ORDER BY kp.created_at DESC
       LIMIT $3`,
      [req.warungId, before, banyak ? 50 : limit, milikSaya, warungFilter, ikuti, cari ? polaIlike(cari) : null]
    );
    // Postingan promosi judol yang terlanjur masuk (sebelum filter ini ada) nggak ditampilin. Filter di sini cuma
    // jaring pengaman - yang baru udah ditolak waktu dikirim (lihat POST di bawah).
    res.json(rows.filter((p) => !nilaiJudol(p.cerita, p.nama_barang).blokir));
  } catch (e) {
    next(e);
  }
});

// ---- Profil warung, cari warung, & ikuti ----
router.get('/warung/cari', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 60);
    if (q.length < 2) return res.json([]);
    await pastikanTabelIkuti();
    await pastikanKolomProfil();
    const { rows } = await query(
      `SELECT ${KOLOM_WARUNG},
              (SELECT COUNT(*)::int FROM komunitas_ikuti i WHERE i.diikuti_id = w.id) AS jumlah_pengikut,
              (SELECT COUNT(*)::int FROM komunitas_post p WHERE p.warung_id = w.id) AS jumlah_postingan,
              EXISTS(SELECT 1 FROM komunitas_ikuti i2 WHERE i2.pengikut_id = $1 AND i2.diikuti_id = w.id) AS diikuti
       FROM warung w
       WHERE w.nama ILIKE $2 AND w.id <> $1
       ORDER BY jumlah_pengikut DESC, jumlah_postingan DESC, w.nama
       LIMIT 20`,
      [req.warungId, polaIlike(q)]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.get('/warung/:id', async (req, res, next) => {
  try {
    if (!POLA_UUID.test(req.params.id)) return res.status(404).json({ error: 'Warung tidak ditemukan' });
    await pastikanTabelIkuti();
    await pastikanKolomProfil();
    const { rows } = await query(
      `SELECT ${KOLOM_WARUNG},
              (SELECT COUNT(*)::int FROM komunitas_post p WHERE p.warung_id = w.id) AS jumlah_postingan,
              (SELECT COUNT(*)::int FROM komunitas_ikuti i WHERE i.diikuti_id = w.id) AS jumlah_pengikut,
              (SELECT COUNT(*)::int FROM komunitas_ikuti i WHERE i.pengikut_id = w.id) AS jumlah_mengikuti,
              EXISTS(SELECT 1 FROM komunitas_ikuti i WHERE i.pengikut_id = $1 AND i.diikuti_id = w.id) AS diikuti,
              EXISTS(SELECT 1 FROM komunitas_ikuti i WHERE i.pengikut_id = w.id AND i.diikuti_id = $1) AS mengikuti_saya
       FROM warung w WHERE w.id = $2`,
      [req.warungId, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Warung tidak ditemukan' });
    res.json({ ...rows[0], milik_saya: rows[0].id === req.warungId });
  } catch (e) {
    next(e);
  }
});

// Toggle: belum ngikutin -> ikuti (+ notif ke warung itu), udah -> berhenti ngikutin.
router.post('/warung/:id/ikuti', async (req, res, next) => {
  try {
    const target = req.params.id;
    if (!POLA_UUID.test(target)) return res.status(404).json({ error: 'Warung tidak ditemukan' });
    if (target === req.warungId) return res.status(400).json({ error: 'Nggak bisa ngikutin warung sendiri' });
    await pastikanTabelIkuti();
    const { rows: ada } = await query('SELECT id FROM warung WHERE id=$1', [target]);
    if (!ada.length) return res.status(404).json({ error: 'Warung tidak ditemukan' });
    const { rowCount: dihapus } = await query('DELETE FROM komunitas_ikuti WHERE pengikut_id=$1 AND diikuti_id=$2', [req.warungId, target]);
    // Notif "mulai mengikuti" lama dari pasangan ini dibuang dulu - biar ikuti/batal bolak-balik nggak nyepam.
    await query("DELETE FROM komunitas_notif WHERE warung_id=$1 AND dari_warung_id=$2 AND jenis='ikuti'", [target, req.warungId]);
    if (!dihapus) {
      await query('INSERT INTO komunitas_ikuti (pengikut_id, diikuti_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.warungId, target]);
      await query("INSERT INTO komunitas_notif (warung_id, dari_warung_id, jenis) VALUES ($1,$2,'ikuti')", [target, req.warungId]);
    }
    const { rows: jumlah } = await query('SELECT COUNT(*)::int AS n FROM komunitas_ikuti WHERE diikuti_id=$1', [target]);
    res.json({ diikuti: !dihapus, jumlahPengikut: jumlah[0].n });
  } catch (e) {
    next(e);
  }
});

// Daftar pengikut / yang diikuti sebuah warung (100 terakhir), plus apakah AKU ngikutin masing-masing.
async function daftarIkutan(req, res, next, arah) {
  try {
    if (!POLA_UUID.test(req.params.id)) return res.status(404).json({ error: 'Warung tidak ditemukan' });
    await pastikanTabelIkuti();
    await pastikanKolomProfil();
    const [kolomWarung, kolomFilter] = arah === 'pengikut' ? ['i.pengikut_id', 'i.diikuti_id'] : ['i.diikuti_id', 'i.pengikut_id'];
    const { rows } = await query(
      `SELECT ${KOLOM_WARUNG},
              (SELECT COUNT(*)::int FROM komunitas_ikuti x WHERE x.diikuti_id = w.id) AS jumlah_pengikut,
              EXISTS(SELECT 1 FROM komunitas_ikuti x2 WHERE x2.pengikut_id = $1 AND x2.diikuti_id = w.id) AS diikuti
       FROM komunitas_ikuti i JOIN warung w ON w.id = ${kolomWarung}
       WHERE ${kolomFilter} = $2
       ORDER BY i.created_at DESC LIMIT 100`,
      [req.warungId, req.params.id]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
}
router.get('/warung/:id/pengikut', (req, res, next) => daftarIkutan(req, res, next, 'pengikut'));
router.get('/warung/:id/mengikuti', (req, res, next) => daftarIkutan(req, res, next, 'mengikuti'));

// Satu postingan - dipakai pas dibuka dari notifikasi (postingannya belum tentu ada di feed yang udah kemuat).
router.get('/:id', async (req, res, next) => {
  try {
    if (!POLA_UUID.test(req.params.id)) return res.status(404).json({ error: 'Postingan tidak ditemukan' });
    const { rows } = await query(
      `SELECT kp.*, w.nama AS warung_nama,
              (SELECT COUNT(*) FROM komunitas_suka s WHERE s.post_id = kp.id) AS jumlah_suka,
              (SELECT COUNT(*) FROM komunitas_komentar k WHERE k.post_id = kp.id) AS jumlah_komentar,
              EXISTS(SELECT 1 FROM komunitas_suka s2 WHERE s2.post_id = kp.id AND s2.warung_id = $1) AS disukai
       FROM komunitas_post kp JOIN warung w ON w.id = kp.warung_id
       WHERE kp.id = $2`,
      [req.warungId, req.params.id]
    );
    if (!rows.length || nilaiJudol(rows[0].cerita, rows[0].nama_barang).blokir) {
      return res.status(404).json({ error: 'Postingannya udah nggak ada' });
    }
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { namaBarang, hargaJual, profit, cerita, tag, foto } = req.body;
    const nb = namaBarang?.trim() || null;
    const ct = cerita?.trim() || null;
    const tg = TOPIK_VALID.includes(tag) ? tag : null;
    if (foto && !fotoValid(foto)) return res.status(400).json({ error: 'Fotonya nggak bisa dipakai (bukan gambar atau kegedean)' });
    // Foto doang tanpa tulisan juga boleh (misal pamer display dagangan).
    if (!nb && !ct && !foto) return res.status(400).json({ error: 'Isi tulisan atau lampirkan foto dulu' });
    const cekJudol = nilaiJudol(ct, nb);
    if (cekJudol.blokir) {
      console.warn(`[komunitas] postingan diblokir (judol) warung ${req.warungId}:`, cekJudol.alasan.join(', '));
      return res.status(422).json({ error: PESAN_DIBLOKIR, diblokir: true });
    }
    await pastikanKolomFoto();
    const { rows } = await query(
      `INSERT INTO komunitas_post (warung_id, nama_barang, harga_jual, profit, cerita, tag, foto_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.warungId, nb, hargaJual || null, profit || null, ct, tg, foto || null]
    );
    // Ikutin bentuk respons GET / (nama warung sendiri, suka/komentar masih 0) biar frontend bisa
    // langsung nempelin postingan baru ke atas feed tanpa perlu fetch ulang.
    const { rows: w } = await query('SELECT nama FROM warung WHERE id=$1', [req.warungId]);
    res.status(201).json({ ...rows[0], warung_nama: w[0]?.nama, jumlah_suka: 0, jumlah_komentar: 0, disukai: false });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    // WAJIB dibatasi ke warung_id sendiri — tanpa ini warung mana pun bisa hapus paksa postingan
    // warung LAIN cuma dengan nebak/tau id-nya (broken access control, lihat pola sama di tukar.routes.js).
    const { rows } = await query('DELETE FROM komunitas_post WHERE id=$1 AND warung_id=$2 RETURNING id', [
      req.params.id,
      req.warungId,
    ]);
    if (!rows.length) return res.status(404).json({ error: 'Postingan tidak ditemukan' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Toggle suka: belum pernah suka -> nyuka, udah pernah -> batal. Composite PK (post_id, warung_id)
// di tabel komunitas_suka yang jamin 1 warung cuma bisa suka 1x per post.
router.post('/:id/suka', async (req, res, next) => {
  try {
    const { rows: ada } = await query('SELECT 1 FROM komunitas_suka WHERE post_id=$1 AND warung_id=$2', [
      req.params.id,
      req.warungId,
    ]);
    if (ada.length) {
      await query('DELETE FROM komunitas_suka WHERE post_id=$1 AND warung_id=$2', [req.params.id, req.warungId]);
    } else {
      await query('INSERT INTO komunitas_suka (post_id, warung_id) VALUES ($1,$2)', [req.params.id, req.warungId]);
    }
    const { rows: jumlah } = await query('SELECT COUNT(*) FROM komunitas_suka WHERE post_id=$1', [req.params.id]);
    res.json({ disukai: !ada.length, jumlahSuka: +jumlah[0].count });
  } catch (e) {
    next(e);
  }
});

// Daftar nama warung yang suka - dipakai buat badge "Disukai A, B, dan N lainnya" ala Facebook
// di sheet detail. Cuma nama (bukan ID/data lain) yang dibalikin, jadi aman ditampilin ke warung lain.
router.get('/:id/suka', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT w.nama AS warung_nama FROM komunitas_suka s
       JOIN warung w ON w.id = s.warung_id
       WHERE s.post_id = $1 ORDER BY s.created_at DESC LIMIT 20`,
      [req.params.id]
    );
    res.json(rows.map((r) => r.warung_nama));
  } catch (e) {
    next(e);
  }
});

router.get('/:id/komentar', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT kk.*, w.nama AS warung_nama
       FROM komunitas_komentar kk JOIN warung w ON w.id = kk.warung_id
       WHERE kk.post_id = $1 ORDER BY kk.created_at ASC LIMIT 200`,
      [req.params.id]
    );
    res.json(rows.filter((k) => !nilaiJudol(k.teks).blokir));
  } catch (e) {
    next(e);
  }
});

// `balasKe` (opsional) - id komentar yang mau dibales, bikin ini nempel jadi SUB-BALESAN di bawah
// komentar itu (lihat komentar lengkap soal desain "1 tingkat doang" di schema.sql). Kalau target
// yang dibales itu SENDIRI sebuah balesan, otomatis diratain ke komentar AKARNYA (bukan nambah
// tingkat kedalaman baru) - biar thread-nya nggak berlapis-lapis susah dibaca di HP.
router.post('/:id/komentar', async (req, res, next) => {
  try {
    const teks = req.body.teks?.trim() || '';
    const foto = req.body.foto || null;
    if (foto && !fotoValid(foto)) return res.status(400).json({ error: 'Fotonya nggak bisa dipakai (bukan gambar atau kegedean)' });
    if (!teks && !foto) return res.status(400).json({ error: 'Komentar belum diisi' });
    const cekJudol = nilaiJudol(teks);
    if (cekJudol.blokir) {
      console.warn(`[komunitas] komentar diblokir (judol) warung ${req.warungId}:`, cekJudol.alasan.join(', '));
      return res.status(422).json({ error: PESAN_DIBLOKIR, diblokir: true });
    }
    await pastikanKolomFoto();
    let balasKe = req.body.balasKe || null;
    let targetWarung = null; // pemilik komentar yang dibales - dapet notif "membalas komentarmu"
    if (balasKe) {
      const { rows: target } = await query('SELECT id, post_id, balas_ke, warung_id FROM komunitas_komentar WHERE id=$1', [balasKe]);
      const t = target[0];
      if (!t || t.post_id !== req.params.id) {
        return res.status(400).json({ error: 'Komentar yang mau dibalas tidak ditemukan' });
      }
      targetWarung = t.warung_id;
      balasKe = t.balas_ke || t.id;
    }
    const { rows } = await query(
      'INSERT INTO komunitas_komentar (post_id, warung_id, teks, balas_ke, foto_url) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.params.id, req.warungId, teks, balasKe, foto]
    );
    const { rows: w } = await query('SELECT nama FROM warung WHERE id=$1', [req.warungId]);
    // Notif sengaja nggak di-await: gagal nyatet notif nggak boleh bikin komentarnya ikut gagal/lambat.
    buatNotifKomentar({ postId: req.params.id, komentarId: rows[0].id, dari: req.warungId, targetWarung }).catch((e) =>
      console.warn('[komunitas] gagal bikin notifikasi:', e.message)
    );
    res.status(201).json({ ...rows[0], warung_nama: w[0]?.nama });
  } catch (e) {
    next(e);
  }
});

router.delete('/komentar/:id', async (req, res, next) => {
  try {
    const { rows } = await query('DELETE FROM komunitas_komentar WHERE id=$1 AND warung_id=$2 RETURNING id', [
      req.params.id,
      req.warungId,
    ]);
    if (!rows.length) return res.status(404).json({ error: 'Komentar tidak ditemukan' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
