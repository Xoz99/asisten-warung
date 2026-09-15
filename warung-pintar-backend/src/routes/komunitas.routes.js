import { Router } from 'express';
import { query } from '../db.js';
import { nilaiJudol, PESAN_DIBLOKIR } from '../utils/filterJudol.js';

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

// Komunitas — feed NASIONAL (semua warung berlangganan lihat feed yang sama, belum dikelompokkan
// per wilayah — fondasi dulu, filter lokasi nyusul kalau usernya udah banyak) buat saling sharing
// harga jual & profit penjualan. Ditampilin ATAS NAMA WARUNG (bukan anonim, keputusan produk),
// jadi query di bawah selalu JOIN ke tabel warung buat ambil nama-nya.
//
// Field terstruktur (nama_barang/harga_jual/profit) SEMUANYA opsional — juga bisa dipakai buat
// obrolan bebas doang (cuma isi cerita). Minimal salah satu dari cerita/nama_barang wajib diisi,
// dicek di endpoint POST (bukan constraint DB, biar pesan errornya ramah).

router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(50, Math.max(1, +req.query.limit || 20));
    const before = req.query.before || null; // cursor pagination: ambil yang lebih lama dari timestamp ini
    const { rows } = await query(
      `SELECT kp.*, w.nama AS warung_nama,
              (SELECT COUNT(*) FROM komunitas_suka s WHERE s.post_id = kp.id) AS jumlah_suka,
              (SELECT COUNT(*) FROM komunitas_komentar k WHERE k.post_id = kp.id) AS jumlah_komentar,
              EXISTS(SELECT 1 FROM komunitas_suka s2 WHERE s2.post_id = kp.id AND s2.warung_id = $1) AS disukai
       FROM komunitas_post kp
       JOIN warung w ON w.id = kp.warung_id
       WHERE ($2::timestamptz IS NULL OR kp.created_at < $2::timestamptz)
       ORDER BY kp.created_at DESC
       LIMIT $3`,
      [req.warungId, before, limit]
    );
    // Postingan promosi judol yang terlanjur masuk (sebelum filter ini ada) nggak ditampilin. Filter di sini cuma
    // jaring pengaman - yang baru udah ditolak waktu dikirim (lihat POST di bawah).
    res.json(rows.filter((p) => !nilaiJudol(p.cerita, p.nama_barang).blokir));
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
    if (balasKe) {
      const { rows: target } = await query('SELECT id, post_id, balas_ke FROM komunitas_komentar WHERE id=$1', [balasKe]);
      const t = target[0];
      if (!t || t.post_id !== req.params.id) {
        return res.status(400).json({ error: 'Komentar yang mau dibalas tidak ditemukan' });
      }
      balasKe = t.balas_ke || t.id;
    }
    const { rows } = await query(
      'INSERT INTO komunitas_komentar (post_id, warung_id, teks, balas_ke, foto_url) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.params.id, req.warungId, teks, balasKe, foto]
    );
    const { rows: w } = await query('SELECT nama FROM warung WHERE id=$1', [req.warungId]);
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
