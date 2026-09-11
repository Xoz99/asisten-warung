import { Router } from 'express';
import { query } from '../db.js';
import { buatTransaksiSnap, cekStatusTransaksi, HARGA_PLAN, KATALOG_PLAN } from '../services/midtrans.service.js';
import { aktifkanPembayaran } from '../services/lisensi.service.js';
import { JATAH_TOKEN_HARIAN } from '../services/aiQuota.service.js';

const router = Router();

// Status lisensi warung yang sedang login — dipanggil frontend buat nampilin sisa hari / ajakan
// perpanjang. Sekalian dibalikin `aiUsage` (jatah token AI HARIAN buat fitur scan/nota/suara, lihat
// aiQuota.service.js) - ditumpangin ke endpoint yang sama (bukan bikin endpoint baru) karena
// dua-duanya sama-sama "status langganan" yang dicek/di-cache bareng di AppContext.jsx (lisensi
// state), dan Lainnya.jsx nampilin dua-duanya berdampingan (progress bar jatah AI di bawah status
// plan). `persen` dibulatin & di-clamp maks 100 di sini (bukan di frontend) - biar semua konsumen
// endpoint ini (kalau nanti ada lagi) dapet angka yang udah aman dipakai langsung buat width bar.
router.get('/status', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT plan, lisensi_berlaku_sampai,
              CASE WHEN ai_token_tanggal = CURRENT_DATE THEN ai_token_hari_ini ELSE 0 END AS ai_terpakai
       FROM warung WHERE id=$1`,
      [req.warungId]
    );
    const w = rows[0];
    if (!w) return res.status(404).json({ error: 'Akun tidak ditemukan' });
    const aktif = new Date(w.lisensi_berlaku_sampai) >= new Date();
    const jatah = JATAH_TOKEN_HARIAN[w.plan] ?? JATAH_TOKEN_HARIAN.trial;
    const terpakai = Number(w.ai_terpakai) || 0;
    res.json({
      plan: w.plan,
      berlakuSampai: w.lisensi_berlaku_sampai,
      aktif,
      // Katalog paket ikut dikirim di sini (bukan endpoint terpisah) - frontend udah manggil
      // /status buat nampilin status langganan, jadi daftar harganya nebeng sekalian. Satu
      // request, dan yang lebih penting: harga di layar DIJAMIN sama sama yang ditagih Midtrans.
      paket: KATALOG_PLAN.map((p) => ({
        ...p,
        harga: HARGA_PLAN[p.id],
        // Padanan per bulan buat paket tahunan - angka ini yang bikin "hemat"-nya kelihatan nyata
        // ("Rp 41.667/bulan" vs "Rp 50.000/bulan"), bukan cuma diklaim di teks.
        perBulan: p.bulan ? Math.round(HARGA_PLAN[p.id] / p.bulan) : null,
        // Hemat dibanding bayar bulanan sebanyak durasinya. Dihitung DI SINI dari harga asli,
        // bukan ditulis tangan - biar nggak mungkin meleset waktu harganya disetel ulang.
        hemat: p.bulan && p.bulan > 1 ? HARGA_PLAN.bulanan * p.bulan - HARGA_PLAN[p.id] : 0,
        jatahAi: JATAH_TOKEN_HARIAN[p.id] ?? JATAH_TOKEN_HARIAN.trial,
      })),
      aiUsage: {
        // `terpakai` DI-CLAMP ke jatah buat ditampilin. Kenapa bisa lewat: jatah dicek SEBELUM
        // manggil AI (`terpakai < jatah`), sementara token yang kepake baru ketauan SESUDAH
        // jawabannya jadi - jadi panggilan terakhir yang lolos pas sisa tinggal dikit tetap
        // ngabisin token penuh. Lewatnya paling banyak sebesar 1 panggilan, dan itu WAJAR by
        // design (nggak ada cara tau ongkos panggilan sebelum dijalanin). Yang nggak wajar itu
        // nampilinnya: "17.581 / 15.000" kebaca kayak aplikasi rusak, padahal maksudnya "habis".
        terpakai: Math.min(terpakai, jatah),
        // Angka mentahnya tetap dikirim - kepake buat ngukur seberapa sering & seberapa jauh
        // kelewatnya, yang jadi bahan buat nyetel ulang JATAH_TOKEN_HARIAN nanti.
        terpakaiAsli: terpakai,
        jatah,
        sisa: Math.max(0, jatah - terpakai),
        persen: Math.min(100, Math.round((terpakai / jatah) * 100)),
      },
    });
  } catch (e) {
    next(e);
  }
});

// Mulai checkout: bikin transaksi Snap di Midtrans, balikin link buat dibuka pelanggan.
router.post('/checkout', async (req, res, next) => {
  try {
    const { plan } = req.body;
    if (!HARGA_PLAN[plan]) return res.status(400).json({ error: `plan wajib salah satu dari: ${Object.keys(HARGA_PLAN).join(', ')}` });

    const { rows } = await query('SELECT nama, username FROM warung WHERE id=$1', [req.warungId]);
    const w = rows[0];
    const orderId = `wp-${req.warungId.slice(0, 8)}-${Date.now()}`;
    const jumlah = HARGA_PLAN[plan];

    const { token, redirectUrl } = await buatTransaksiSnap({ orderId, plan, jumlah, namaWarung: w.nama });

    await query('INSERT INTO pembayaran (warung_id, order_id, plan, jumlah) VALUES ($1,$2,$3,$4)', [req.warungId, orderId, plan, jumlah]);

    res.status(201).json({ orderId, token, redirectUrl });
  } catch (e) {
    next(e);
  }
});

// Sinkronisasi manual: cek SEMUA pembayaran yang masih "pending" milik warung ini langsung ke
// Midtrans, lalu aktifkan yang ternyata udah lunas. Ini JARING PENGAMAN buat webhook yang nggak
// nyampe - dan itu bukan kasus langka: pas development di localhost webhook NGGAK AKAN PERNAH
// nyampe sama sekali (Midtrans nggak bisa nembak ke localhost), dan di produksi pun bisa meleset
// kalau server lagi restart atau jaringannya bermasalah.
//
// Tanpa ini, pelanggan yang UDAH BAYAR nyangkut di "trial" selamanya tanpa jalan pulih selain
// dibetulin manual di database - kejadian beneran waktu testing pembayaran pertama.
//
// Aman dipanggil berkali-kali: aktifkanPembayaran() nolak baris yang statusnya udah settlement,
// jadi nggak mungkin lisensi keperpanjang dobel cuma gara-gara tombolnya dipencet dua kali.
router.post('/sinkron', async (req, res, next) => {
  try {
    const { rows } = await query(
      "SELECT * FROM pembayaran WHERE warung_id=$1 AND status='pending' ORDER BY created_at DESC LIMIT 10",
      [req.warungId]
    );

    let adaYangAktif = false;
    const diperiksa = [];
    for (const p of rows) {
      let st;
      try {
        st = await cekStatusTransaksi(p.order_id);
      } catch (e) {
        // Satu order gagal dicek jangan bikin sisanya ikut batal - catat & lanjut.
        console.warn(`[lisensi] gagal cek status ${p.order_id}:`, e.message);
        continue;
      }
      if (!st) continue; // belum dikenal Midtrans (checkout dibikin tapi belum dibuka)

      const sukses = ['capture', 'settlement'].includes(st.transaction_status) && (st.fraud_status ? st.fraud_status === 'accept' : true);
      const gagal = ['deny', 'cancel', 'expire', 'failure'].includes(st.transaction_status);

      if (sukses) {
        const baru = await aktifkanPembayaran(p, st, st.transaction_id);
        if (baru) adaYangAktif = true;
        diperiksa.push({ orderId: p.order_id, plan: p.plan, hasil: baru ? 'baru diaktifkan' : 'sudah aktif sebelumnya' });
      } else if (gagal) {
        await query('UPDATE pembayaran SET status=$1, raw_notifikasi=$2, updated_at=now() WHERE id=$3', [
          st.transaction_status === 'expire' ? 'kedaluwarsa' : 'gagal',
          JSON.stringify(st),
          p.id,
        ]);
        diperiksa.push({ orderId: p.order_id, plan: p.plan, hasil: st.transaction_status });
      } else {
        diperiksa.push({ orderId: p.order_id, plan: p.plan, hasil: st.transaction_status });
      }
    }

    // `adaPerubahan` dipakai frontend buat mutusin nampilin "berhasil upgrade" apa nggak - jangan
    // ngandelin "lisensi aktif" doang, karena akun TRIAL yang belum bayar pun statusnya aktif.
    res.json({ adaPerubahan: adaYangAktif, diperiksa });
  } catch (e) {
    next(e);
  }
});

export default router;
