import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// Deret untung harian buat grafik (ganti seriLaporan pseudo-random di frontend demo dengan
// agregat asli dari tabel transaksi). n = jumlah hari per jendela, offset = mundur berapa jendela.
router.get('/ringkasan', async (req, res, next) => {
  try {
    const n = Math.min(+req.query.n || 7, 90);
    const offset = Math.max(0, +req.query.offset || 0);

    const akhir = new Date();
    akhir.setHours(0, 0, 0, 0);
    akhir.setDate(akhir.getDate() - offset * n + 1); // eksklusif: 1 hari setelah akhir jendela
    const awal = new Date(akhir);
    awal.setDate(awal.getDate() - n);

    const { rows: deret } = await query(
      `SELECT date_trunc('day', waktu) AS hari, COALESCE(SUM(laba),0) AS untung, COALESCE(SUM(total),0) AS omzet
       FROM transaksi WHERE warung_id=$1 AND waktu >= $2 AND waktu < $3
       GROUP BY hari ORDER BY hari`,
      [req.warungId, awal.toISOString(), akhir.toISOString()]
    );
    // Target harian ikut ditarik di jendela yang SAMA. Digabung di sini (bukan endpoint terpisah
    // yang dipanggil frontend belakangan) supaya grafik dapet omzet & target dalam satu kali ambil
    // - dua request terpisah bikin grafiknya sempat kegambar timpang dulu sebelum yang kedua nyampe.
    // Tanggalnya dikirim sebagai "YYYY-MM-DD" hasil hitungan LOKAL, BUKAN .toISOString().
    //
    // Kenapa penting: kolom `tanggal` bertipe DATE (tanpa jam). toISOString() ngubah ke UTC dulu -
    // di Jakarta (UTC+7) tengah malam lokal jadi jam 17:00 HARI SEBELUMNYA di UTC, jadi `::date`
    // motongnya ke tanggal yang mundur sehari. Akibatnya jendela grafik geser & target hari
    // paling ujung nggak ikut kebaca (kejadian waktu dites: 7 target dimasukin, cuma 6 kebaca).
    //
    // Query transaksi di atas TETAP pakai toISOString() dan itu memang benar - dia mbandingin
    // TIMESTAMPTZ, yang emang sadar zona waktu. Yang salah cuma kalau hasilnya di-cast ke DATE.
    const keTanggal = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const { rows: targetRows } = await query(
      `SELECT tanggal, jumlah FROM target_harian
       WHERE warung_id=$1 AND tanggal >= $2::date AND tanggal < $3::date ORDER BY tanggal`,
      [req.warungId, keTanggal(awal), keTanggal(akhir)]
    );

    const totalUntung = deret.reduce((a, r) => a + Number(r.untung), 0);
    const totalOmzet = deret.reduce((a, r) => a + Number(r.omzet), 0);
    res.json({
      awal,
      akhir,
      deret,
      target: targetRows,
      totalTarget: targetRows.reduce((a, r) => a + Number(r.jumlah), 0),
      totalUntung,
      totalOmzet,
      totalModal: totalOmzet - totalUntung,
    });
  } catch (e) {
    next(e);
  }
});

router.get('/laris', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT ti.produk_id, ti.nama_produk, SUM(ti.qty) AS total_qty
       FROM transaksi_item ti JOIN transaksi t ON t.id = ti.transaksi_id
       WHERE t.warung_id = $1
       GROUP BY ti.produk_id, ti.nama_produk
       ORDER BY total_qty DESC LIMIT 5`,
      [req.warungId]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.get('/ngendap', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT p.id, p.nama, p.stok, MAX(t.waktu) AS terakhir_laku
       FROM produk p
       LEFT JOIN transaksi_item ti ON ti.produk_id = p.id
       LEFT JOIN transaksi t ON t.id = ti.transaksi_id
       WHERE p.warung_id = $1 AND p.aktif
       GROUP BY p.id, p.nama, p.stok
       HAVING MAX(t.waktu) IS NULL OR MAX(t.waktu) < now() - INTERVAL '7 days'
       ORDER BY terakhir_laku ASC NULLS FIRST LIMIT 10`,
      [req.warungId]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.get('/kas', async (req, res, next) => {
  try {
    const tabel = req.query.jenis === 'modal' ? 'modal_log' : 'masuk_log';
    const { rows } = await query(`SELECT * FROM ${tabel} WHERE warung_id=$1 ORDER BY waktu DESC LIMIT 100`, [req.warungId]);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// Catat MODAL MASUK - duit yang disetor pemilik ke warung (suntik modal awal, nambah modal pas
// mau kulakan besar, dst). Sebelum ini modal_log CUMA keisi sebagai efek samping masuk-stok
// (produk.routes.js) & scan nota (nota.routes.js) - artinya nggak ada satu pun cara buat nyatet
// "saya nyetor 100 juta ke warung" tanpa ngarang barang dulu. Ini yang bikin Mang Warung nggak
// bisa bantu waktu diminta "catat modal": aksinya emang belum ada.
//
// Sengaja dipisah dari masuk_log: masuk_log itu duit dari JUALAN (omzet), modal_log itu duit dari
// KANTONG PEMILIK. Kalau dicampur, laporan untung jadi ngaco - setoran modal kebaca kayak omzet.
router.post('/kas/modal', async (req, res, next) => {
  try {
    const jumlah = Number(req.body.jumlah);
    const keterangan = (req.body.keterangan || '').trim() || 'Modal masuk';
    if (!Number.isFinite(jumlah) || jumlah <= 0) {
      return res.status(400).json({ error: 'Jumlah modal harus angka lebih dari 0' });
    }
    const { rows } = await query(
      'INSERT INTO modal_log (warung_id, keterangan, jumlah) VALUES ($1,$2,$3) RETURNING *',
      [req.warungId, keterangan, jumlah]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

// Pasang target setoran buat SATU tanggal (default hari ini). Dipakai dari layar Catat jualan.
//
// ON CONFLICT ... DO UPDATE: pasang ulang di hari yang sama MENIMPA, bukan nambah baris - kalau
// nggak, satu hari bisa punya beberapa target dan grafiknya dobel. Pemilik warung wajar ngubah
// target beberapa kali dalam sehari (tebakan awal meleset, dikoreksi pas tutup).
router.put('/target', async (req, res, next) => {
  try {
    const jumlah = Number(req.body.jumlah);
    if (!Number.isFinite(jumlah) || jumlah < 0) {
      return res.status(400).json({ error: 'Jumlah target harus angka 0 atau lebih' });
    }
    // tanggal opsional (format YYYY-MM-DD) - dipakai kalau nanti mau nyetel target hari lain.
    const tanggal = /^\d{4}-\d{2}-\d{2}$/.test(req.body.tanggal || '') ? req.body.tanggal : null;

    // jumlah 0 = HAPUS target, bukan nyimpen angka nol. Bedanya penting di grafik: baris yang
    // nggak ada artinya "hari itu nggak pasang target", sedangkan 0 artinya "targetnya nol" -
    // yang nggak pernah jadi maksud user waktu dia nekan "Hapus target".
    if (jumlah === 0) {
      await query(
        'DELETE FROM target_harian WHERE warung_id=$1 AND tanggal = COALESCE($2::date, CURRENT_DATE)',
        [req.warungId, tanggal]
      );
      return res.json({ ok: true, jumlah: 0 });
    }

    const { rows } = await query(
      `INSERT INTO target_harian (warung_id, tanggal, jumlah)
       VALUES ($1, COALESCE($2::date, CURRENT_DATE), $3)
       ON CONFLICT (warung_id, tanggal) DO UPDATE SET jumlah = EXCLUDED.jumlah, updated_at = now()
       RETURNING tanggal, jumlah`,
      [req.warungId, tanggal, jumlah]
    );
    res.json({ ok: true, ...rows[0] });
  } catch (e) {
    next(e);
  }
});

// Target HARI INI - dipanggil waktu layar Catat jualan dibuka, biar target yang dipasang tadi
// pagi masih kelihatan walau aplikasinya udah ditutup-buka atau dibuka dari HP lain.
router.get('/target', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT tanggal, jumlah FROM target_harian WHERE warung_id=$1 AND tanggal = CURRENT_DATE',
      [req.warungId]
    );
    res.json(rows[0] || { tanggal: null, jumlah: 0 });
  } catch (e) {
    next(e);
  }
});

export default router;
