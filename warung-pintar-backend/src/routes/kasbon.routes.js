import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { status } = req.query; // 'lunas' | 'belum'
    let sql = 'SELECT * FROM kasbon WHERE warung_id=$1';
    if (status === 'lunas') sql += ' AND lunas=true';
    if (status === 'belum') sql += ' AND lunas=false';
    sql += ' ORDER BY dibuat_pada DESC';
    const { rows } = await query(sql, [req.warungId]);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/lunasi', async (req, res, next) => {
  try {
    const { metode } = req.body;
    const { rows } = await query(
      'UPDATE kasbon SET lunas=true, metode_bayar=$1, lunas_pada=now() WHERE id=$2 AND warung_id=$3 RETURNING *',
      [metode || 'Tunai', req.params.id, req.warungId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Kasbon tidak ditemukan' });
    const k = rows[0];
    await query('INSERT INTO masuk_log (warung_id, keterangan, jumlah, metode) VALUES ($1,$2,$3,$4)', [
      req.warungId,
      `Pelunasan kasbon ${k.nama}`,
      k.jumlah,
      metode || 'Tunai',
    ]);
    res.json(k);
  } catch (e) {
    next(e);
  }
});

// Bayar sebagian (custom amount) SATU baris kasbon tertentu — beda dari /lunasi yang selalu
// nutup penuh. Kalau jumlahnya nutup semua sisa, otomatis ke-mark lunas juga.
router.post('/:id/bayar', async (req, res, next) => {
  try {
    const jumlahBayar = Number(req.body.jumlah);
    const metode = req.body.metode || 'Tunai';
    if (!jumlahBayar || jumlahBayar <= 0) {
      return res.status(400).json({ error: 'jumlah wajib diisi angka > 0' });
    }

    const { rows } = await query('SELECT * FROM kasbon WHERE id=$1 AND warung_id=$2 AND lunas=false', [
      req.params.id,
      req.warungId,
    ]);
    if (!rows.length) return res.status(404).json({ error: 'Kasbon tidak ditemukan / sudah lunas' });
    const k = rows[0];

    const dibayar = Math.min(Number(k.jumlah), jumlahBayar); // kelebihan bayar diabaikan
    const jumlahBaru = Number(k.jumlah) - dibayar;
    const lunasBaru = jumlahBaru <= 0;

    const { rows: updated } = await query(
      `UPDATE kasbon
       SET jumlah=$1, lunas=$2,
           metode_bayar = CASE WHEN $2 THEN $3 ELSE metode_bayar END,
           lunas_pada = CASE WHEN $2 THEN now() ELSE lunas_pada END
       WHERE id=$4 RETURNING *`,
      [jumlahBaru, lunasBaru, metode, k.id]
    );
    await query('INSERT INTO masuk_log (warung_id, keterangan, jumlah, metode) VALUES ($1,$2,$3,$4)', [
      req.warungId,
      `Bayar kasbon ${k.nama}`,
      dibayar,
      metode,
    ]);
    res.json(updated[0]);
  } catch (e) {
    next(e);
  }
});

// Bayar utang seorang pelanggan — bisa lunas total atau sebagian (custom amount).
// Yang tertua dibayar duluan; kalau jumlahnya nutup beberapa kasbon sekaligus, semua ke-update.
router.post('/pelanggan/:pelangganId/bayar', async (req, res, next) => {
  try {
    const jumlahBayar = Number(req.body.jumlah);
    const metode = req.body.metode || 'Tunai';
    if (!jumlahBayar || jumlahBayar <= 0) {
      return res.status(400).json({ error: 'jumlah wajib diisi angka > 0' });
    }

    const { rows: belum } = await query(
      'SELECT * FROM kasbon WHERE pelanggan_id=$1 AND warung_id=$2 AND lunas=false ORDER BY dibuat_pada ASC',
      [req.params.pelangganId, req.warungId]
    );

    let sisaBayar = jumlahBayar;
    const rincian = [];
    for (const k of belum) {
      if (sisaBayar <= 0) break;
      const ambil = Math.min(Number(k.jumlah), sisaBayar);
      sisaBayar -= ambil;
      const jumlahBaru = Number(k.jumlah) - ambil;
      const lunasBaru = jumlahBaru <= 0;
      await query(
        `UPDATE kasbon
         SET jumlah=$1, lunas=$2,
             metode_bayar = CASE WHEN $2 THEN $3 ELSE metode_bayar END,
             lunas_pada = CASE WHEN $2 THEN now() ELSE lunas_pada END
         WHERE id=$4`,
        [jumlahBaru, lunasBaru, metode, k.id]
      );
      rincian.push({ id: k.id, dibayar: ambil, sisa: jumlahBaru, lunas: lunasBaru });
    }

    const totalDibayar = jumlahBayar - sisaBayar; // kelebihan bayar (di atas total utang) diabaikan
    if (totalDibayar > 0) {
      const { rows: pRows } = await query('SELECT nama FROM pelanggan WHERE id=$1', [req.params.pelangganId]);
      await query('INSERT INTO masuk_log (warung_id, keterangan, jumlah, metode) VALUES ($1,$2,$3,$4)', [
        req.warungId,
        `Bayar kasbon ${pRows[0]?.nama || ''}`.trim(),
        totalDibayar,
        metode,
      ]);
    }

    res.json({ dibayar: totalDibayar, rincian });
  } catch (e) {
    next(e);
  }
});

export default router;
