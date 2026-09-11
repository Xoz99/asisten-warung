import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// Whitelist topik biar kolom `tag` nggak keisi sampah dari client yang aneh-aneh - tetep
// nullable (postingan lama / obrolan bebas boleh nggak milih topik sama sekali).
const TOPIK_VALID = ['Dagangan', 'Kasbon', 'Supplier', 'Lainnya'];

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
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { namaBarang, hargaJual, profit, cerita, tag } = req.body;
    const nb = namaBarang?.trim() || null;
    const ct = cerita?.trim() || null;
    const tg = TOPIK_VALID.includes(tag) ? tag : null;
    if (!nb && !ct) return res.status(400).json({ error: 'Isi minimal nama barang atau ceritanya dulu' });
    const { rows } = await query(
      `INSERT INTO komunitas_post (warung_id, nama_barang, harga_jual, profit, cerita, tag)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.warungId, nb, hargaJual || null, profit || null, ct, tg]
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
    res.json(rows);
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
    const teks = req.body.teks?.trim();
    if (!teks) return res.status(400).json({ error: 'Komentar belum diisi' });
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
      'INSERT INTO komunitas_komentar (post_id, warung_id, teks, balas_ke) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.params.id, req.warungId, teks, balasKe]
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
