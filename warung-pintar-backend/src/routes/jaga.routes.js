import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

router.get('/riwayat', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM riwayat_jaga WHERE warung_id=$1 ORDER BY waktu DESC LIMIT 50', [req.warungId]);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// Ringkasan giliran yang lagi jalan: dipakai DUA-DUANYA - buat pratinjau di layar konfirmasi
// (GET /ringkasan) dan buat angka yang beneran disimpen pas serah terima (POST /serah-terima).
//
// Sengaja SATU fungsi. Dulu pratinjaunya dihitung sendiri di frontend pakai aturan yang beda:
// layar bilang "Penjualan hari ini Rp 72.000" (semua transaksi - tunai, QRIS, kasbon) tapi yang
// kesimpen Rp 40.000 (tunai doang). Pemilik warung ngitung laci sambil ngeliat 72.000, terus
// buka Riwayat jaga dan nemu 40.000 - kelihatan kayak duitnya ilang 32.000 padahal cuma dua
// tempat ngitung pakai aturan beda. Selama rumusnya kepisah, bug kayak gini bakal balik lagi.
async function ringkasanGiliran(warungId) {
  // Batas awal giliran yang lagi ditutup. DULU selalu tengah malam - itu salah begitu ada serah
  // terima KEDUA di hari yang sama: laci dihitung ulang dari nol tiap ganti giliran, tapi
  // penjualannya masih dijumlah dari pagi. Jadi giliran kedua selalu keliatan "kurang" sebesar
  // setoran giliran pertama, padahal nggak ada uang yang hilang. Kejadian tiap hari di warung
  // yang jaganya gantian pagi/sore.
  //
  // Kalau serah terima terakhir udah lewat sehari (warung tutup, atau emang jarang ganti giliran),
  // balik ke tengah malam - jangan narik penjualan 3 hari ke dalam satu giliran.
  const awalHariIni = new Date();
  awalHariIni.setHours(0, 0, 0, 0);
  const { rows: terakhir } = await query(
    'SELECT waktu FROM riwayat_jaga WHERE warung_id=$1 ORDER BY waktu DESC LIMIT 1',
    [warungId]
  );
  const waktuTerakhir = terakhir[0] ? new Date(terakhir[0].waktu) : null;
  // true = giliran ini nyambung dari serah terima sebelumnya HARI INI (bukan dari buka warung).
  const lanjutanGiliran = Boolean(waktuTerakhir && waktuTerakhir > awalHariIni);
  const mulai = lanjutanGiliran ? waktuTerakhir : awalHariIni;

  const { rows: trxGiliran } = await query('SELECT * FROM transaksi WHERE warung_id=$1 AND waktu >= $2', [
    warungId,
    mulai.toISOString(),
  ]);
  // Yang dibandingin sama isi laci HARUS uang tunai doang: QRIS/transfer masuknya ke rekening
  // (nggak nambah isi laci), kasbon malah belum kebayar sama sekali. Dua-duanya tetep dilaporin
  // terpisah di bawah biar penjaganya tau giliran ini sebenernya jualan berapa.
  const tunai = trxGiliran.filter((t) => t.mode === 'bayar' && (t.metode || 'Tunai') === 'Tunai');
  const nonTunai = trxGiliran.filter((t) => t.mode === 'bayar' && (t.metode || 'Tunai') !== 'Tunai');
  const jumlah = (rows) => rows.reduce((a, t) => a + Number(t.total), 0);

  const { rows: masukKasbon } = await query(
    `SELECT COALESCE(SUM(jumlah), 0) AS total FROM masuk_log
     WHERE warung_id=$1 AND waktu >= $2 AND (COALESCE(metode, 'Tunai') = 'Tunai') AND (keterangan LIKE 'Pelunasan kasbon%' OR keterangan LIKE 'Bayar kasbon%')`,
    [warungId, mulai.toISOString()]
  );
  const totalKasbonTunai = Number(masukKasbon[0]?.total || 0);

  const { rows: stokHabis } = await query(
    `SELECT nama, stok FROM produk
     WHERE warung_id=$1 AND aktif AND stok <= GREATEST(1, FLOOR(laku_per_hari * 0.2))
     ORDER BY stok ASC LIMIT 20`,
    [warungId]
  );
  const { rows: utangBaru } = await query(
    'SELECT nama, jumlah FROM kasbon WHERE warung_id=$1 AND NOT lunas AND dibuat_pada >= $2',
    [warungId, mulai.toISOString()]
  );

  return {
    mulai: mulai.toISOString(),
    // Dipakai layar buat milih kalimat yang bener: "sejak serah terima tadi" vs "hari ini".
    lanjutanGiliran,
    penjualanTunai: jumlah(tunai) + totalKasbonTunai,
    penjualanNonTunai: jumlah(nonTunai),
    totalTransaksi: trxGiliran.length,
    labaGiliran: trxGiliran.reduce((a, t) => a + Number(t.laba || 0), 0),
    stokHabis,
    utangBaru: utangBaru.map((u) => ({ nama: u.nama, jumlah: Number(u.jumlah) })),
  };
}

// Pratinjau buat layar "Serah terima jaga" - angkanya PERSIS sama sama yang bakal disimpen.
router.get('/ringkasan', async (req, res, next) => {
  try {
    res.json(await ringkasanGiliran(req.warungId));
  } catch (e) {
    next(e);
  }
});

// Serah Terima Jaga 1-Tap (PRD 10.5): ringkasan uang laci vs penjualan tunai (deteksi selisih
// otomatis), total transaksi, stok yang habis, dan utang baru - semua dalam satu tap.
router.post('/serah-terima', async (req, res, next) => {
  try {
    const { dari, ke, uangLaci } = req.body;
    if (!ke || uangLaci == null) return res.status(400).json({ error: 'ke dan uangLaci wajib diisi' });

    // Penjaga tujuan HARUS ada di daftar. Tanpa cek ini, UPDATE ... WHERE nama=$2 di bawah nggak
    // kena baris mana pun: serah terimanya "berhasil" tapi nggak ada satu pun penjaga yang aktif,
    // dan aplikasinya langsung nendang balik ke layar "Siapa yang jaga sekarang?".
    const { rows: tujuan } = await query('SELECT id FROM penjaga WHERE warung_id=$1 AND nama=$2', [req.warungId, ke]);
    if (!tujuan.length) return res.status(400).json({ error: `Penjaga "${ke}" nggak ada di daftar` });

    const r = await ringkasanGiliran(req.warungId);
    const selisih = Number(uangLaci) - r.penjualanTunai;

    const { rows } = await query(
      `INSERT INTO riwayat_jaga (warung_id, dari, ke, uang_laci, penjualan_tunai, selisih, total_transaksi, stok_habis, utang_baru)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.warungId, dari || null, ke, uangLaci, r.penjualanTunai, selisih, r.totalTransaksi, JSON.stringify(r.stokHabis), JSON.stringify(r.utangBaru)]
    );

    await query('UPDATE penjaga SET aktif=false WHERE warung_id=$1', [req.warungId]);
    await query('UPDATE penjaga SET aktif=true WHERE id=$1', [tujuan[0].id]);

    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

export default router;
