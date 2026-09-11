import { Router } from 'express';
import { query } from '../db.js';
import { cosineSimilarity } from '../utils/cosine.js';
import { bacaBarcodeGemini, cariBarangGemini, cariBanyakBarangGemini } from '../services/gemini.service.js';
import { bacaBarcodeOpenRouter, cariBarangOpenRouter, cariBanyakBarangOpenRouter } from '../services/openrouter.service.js';
import { cobaGeminiLaluOpenRouter } from '../utils/aiFallback.js';

const router = Router();

// Simpan foto referensi + vektor embedding barang (dihitung di CLIENT pakai TensorFlow.js MobileNet,
// sesuai stack PRD 10.1 — 3 foto: depan/miring/dekat saat input stok pertama kali).
router.post('/produk/:id/referensi-visual', async (req, res, next) => {
  try {
    const { sudut, fotoUrl, embedding } = req.body;
    if (!Array.isArray(embedding) || !embedding.length) {
      return res.status(400).json({ error: 'embedding wajib array angka hasil model visual di client' });
    }
    const { rows: pRows } = await query('SELECT id FROM produk WHERE id=$1 AND warung_id=$2', [req.params.id, req.warungId]);
    if (!pRows.length) return res.status(404).json({ error: 'Produk tidak ditemukan' });
    const { rows } = await query(
      'INSERT INTO produk_referensi_visual (produk_id, sudut, foto_url, embedding) VALUES ($1,$2,$3,$4) RETURNING id, sudut, foto_url, created_at',
      [req.params.id, sudut || null, fotoUrl || null, JSON.stringify(embedding)]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

// Daftar foto referensi visual yang UDAH kesimpen buat 1 produk - dipakai layar Opname/edit barang
// (Stok.jsx) buat nampilin "punya berapa foto referensi" & biar user bisa nambahin buat barang LAMA
// yang belum sempet difoto pas awal ditambahin (dulu foto referensi CUMA bisa didaftarin pas alur
// "tambah barang baru", nggak ada jalan buat barang yang udah ada - makanya barang yang diketik
// manual/nggak lewat scan awal jadi nggak akan PERNAH ke-detect di scan visual non-AI).
router.get('/produk/:id/referensi-visual', async (req, res, next) => {
  try {
    const { rows: pRows } = await query('SELECT id FROM produk WHERE id=$1 AND warung_id=$2', [req.params.id, req.warungId]);
    if (!pRows.length) return res.status(404).json({ error: 'Produk tidak ditemukan' });
    const { rows } = await query(
      'SELECT id, sudut, foto_url, created_at FROM produk_referensi_visual WHERE produk_id=$1 ORDER BY created_at',
      [req.params.id]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// Hapus 1 foto referensi (misal salah jepret / kepotong / kena barang lain) - scoped ke warung_id
// lewat JOIN biar warung lain nggak bisa hapus punya warung sebelah cuma modal tebak UUID.
router.delete('/referensi-visual/:refId', async (req, res, next) => {
  try {
    const { rows } = await query(
      `DELETE FROM produk_referensi_visual r USING produk p
       WHERE r.id=$1 AND r.produk_id=p.id AND p.warung_id=$2 RETURNING r.id`,
      [req.params.refId, req.warungId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Foto referensi tidak ditemukan' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Cocokkan embedding dari frame kamera live (diambil tiap ~500ms di client) dengan semua referensi
// barang. Balikin sampai 3 hasil PALING MIRIP - TANPA ambang minimum skor (dulu ada `skor > 0.85`,
// dicabut atas permintaan user: kecenderungannya malah kebanyakan nolak/"tidak ketemu" barang yang
// SEBENERNYA ada, ketimbang nyaring yang salah - kerasanya lebih "kacau" / nggak jalan daripada
// kalau ambangnya dilonggarin). Sekarang keputusan akhir diserahin ke MATA USER: kandidat tetap
// ditampilin sebagai daftar buat DITAP (bukan auto-pilih), badge skor persentase ikut ditampilin di
// tiap kandidat (lihat frontend) - jadi user sendiri yang nilai "ini beneran mirip apa nggak", bukan
// sistem yang mutusin sepihak lewat 1 angka ambang yang gampang salah kalibrasi.
//
// ⚠️ PENTING kalau nanti mau ganti versi/alpha model MobileNet-nya (lihat visualScan.js): embedding
// dari model beda itu BUKAN cuma "kurang akurat" dibanding satu sama lain - itu ruang vektor yang
// beda sama sekali (dimensi vektornya kebetulan bisa sama panjang, MobileNetV2 nggak nyusutin
// channel layer terakhir buat alpha<1, tapi ISI angkanya nggak sepadan). Cosine similarity ANTARA
// embedding dari model lama & baru nggak akan error, tapi hasilnya diam-diam ngaco. Kalau ganti
// model, embedding LAMA di kolom `embedding` (tabel produk_referensi_visual) WAJIB dihitung ulang
// dari foto_url yang tersimpen (atau minta user foto ulang) - jangan biarin embedding dari model
// beda ketimpuk dibandingin bareng.
router.post('/visual', async (req, res, next) => {
  try {
    const { embedding } = req.body;
    if (!Array.isArray(embedding) || !embedding.length) return res.status(400).json({ error: 'embedding wajib diisi' });
    // Ambil semua field produk yang dipakai di layar lain (bukan cuma id/nama/harga/stok) — hasil
    // scan ini sering langsung dipilih buat restock (butuh modal buat HPP) atau masuk keranjang
    // (butuh satuan/isi kemasan), jadi bentuknya disamain kayak normProduk di frontend.
    const { rows } = await query(
      `SELECT r.embedding, p.id, p.nama, p.harga, p.modal, p.stok, p.foto_url, p.satuan, p.isi_kemasan, p.nama_kemasan, p.grup
       FROM produk_referensi_visual r JOIN produk p ON p.id = r.produk_id
       WHERE p.warung_id = $1 AND p.aktif`,
      [req.warungId]
    );
    const skorPerProduk = new Map();
    for (const r of rows) {
      const skor = cosineSimilarity(embedding, r.embedding);
      if (!skorPerProduk.has(r.id) || skorPerProduk.get(r.id).skor < skor) {
        skorPerProduk.set(r.id, {
          skor,
          produk: {
            id: r.id,
            nama: r.nama,
            harga: Number(r.harga),
            modal: Number(r.modal),
            stok: r.stok,
            fotoUrl: r.foto_url,
            satuan: r.satuan || 'pcs',
            isiKemasan: Number(r.isi_kemasan) || 1,
            namaKemasan: r.nama_kemasan || null,
            grup: r.grup || null,
          },
        });
      }
    }
    const hasil = [...skorPerProduk.values()].sort((a, b) => b.skor - a.skor).slice(0, 3);
    res.json(hasil);
  } catch (e) {
    next(e);
  }
});

// Cadangan TERAKHIR buat scan barcode - dipanggil dari client cuma kalau BarcodeDetector native +
// ZXing (gratis, jalan di client, lib/barcodeScan.js) udah dicoba berkali-kali & tetap gagal
// (biasanya kondisi kamera kurang ideal - webcam PC, cahaya kurang, barcode nggak rata/melengkung).
// Lihat komentar lengkap di bacaBarcodeGemini (gemini.service.js) soal KENAPA ini baca angka
// TERCETAK, bukan "mendekode" barcode-nya. Kalau angkanya ketemu, alur selanjutnya SAMA kayak
// barcode yang berhasil discan biasa (lookup produk by barcode di client, lihat handleBarcode).
router.post('/barcode-ai', async (req, res, next) => {
  try {
    const { fotoBase64 } = req.body;
    if (!fotoBase64) return res.status(400).json({ error: 'fotoBase64 wajib diisi' });
    const kode = await cobaGeminiLaluOpenRouter(
      () => bacaBarcodeGemini(fotoBase64, req.warungId),
      () => bacaBarcodeOpenRouter(fotoBase64, req.warungId),
      'scan/barcode-ai'
    );
    res.json({ kode });
  } catch (e) {
    next(e);
  }
});

// Cadangan TERAKHIR buat scan barang visual - dipanggil kalau /visual (MobileNet+cosine similarity,
// gratis, client) nggak nemu kandidat yang cukup mirip. Balikin bentuk ARRAY yang sama kayak
// /visual (biar frontend bisa pakai ulang UI daftar kandidat yang sama) - isinya 0 atau 1 item
// (Gemini cuma disuruh milih SATU produk paling cocok atau bilang nggak ketemu, bukan nge-ranking
// beberapa kandidat kayak cosine similarity). `skor: null` (bukan angka 0-1) dipakai frontend buat
// mbedain badge "Disaranin AI" dari hasil cosine similarity biasa.
router.post('/visual-ai', async (req, res, next) => {
  try {
    const { fotoBase64 } = req.body;
    if (!fotoBase64) return res.status(400).json({ error: 'fotoBase64 wajib diisi' });
    const { rows } = await query(
      'SELECT id, nama, harga, modal, stok, foto_url, satuan, isi_kemasan, nama_kemasan, grup FROM produk WHERE warung_id=$1 AND aktif',
      [req.warungId]
    );
    if (!rows.length) return res.json([]);
    const id = await cobaGeminiLaluOpenRouter(
      () => cariBarangGemini({ fotoBase64, produkList: rows, warungId: req.warungId }),
      () => cariBarangOpenRouter({ fotoBase64, produkList: rows, warungId: req.warungId }),
      'scan/visual-ai'
    );
    const p = id ? rows.find((r) => r.id === id) : null;
    if (!p) return res.json([]);
    res.json([
      {
        skor: null,
        produk: {
          id: p.id,
          nama: p.nama,
          harga: Number(p.harga),
          modal: Number(p.modal),
          stok: p.stok,
          fotoUrl: p.foto_url,
          satuan: p.satuan || 'pcs',
          isiKemasan: Number(p.isi_kemasan) || 1,
          namaKemasan: p.nama_kemasan || null,
          grup: p.grup || null,
        },
      },
    ]);
  } catch (e) {
    next(e);
  }
});

// "Foto banyak sekaligus" dari Catat Penjualan (SheetVisual > jepretBanyak) - customer bawa
// beberapa barang beda ke kasir, 1 foto buat semuanya sekaligus (bukan 1 foto per barang). Balikin
// ARRAY [{qty, produk}] - beda dari /visual-ai yang cuma 0-1 item, di sini bisa banyak sekaligus.
// Lihat komentar lengkap soal taruhannya (checkout beneran, bukan daftar barang) di
// cariBanyakBarangGemini (gemini.service.js).
router.post('/visual-ai-banyak', async (req, res, next) => {
  try {
    const { fotoBase64 } = req.body;
    if (!fotoBase64) return res.status(400).json({ error: 'fotoBase64 wajib diisi' });
    const { rows } = await query(
      'SELECT id, nama, harga, modal, stok, foto_url, satuan, isi_kemasan, nama_kemasan, grup FROM produk WHERE warung_id=$1 AND aktif',
      [req.warungId]
    );
    if (!rows.length) return res.json([]);
    const terdeteksi = await cobaGeminiLaluOpenRouter(
      () => cariBanyakBarangGemini({ fotoBase64, produkList: rows, warungId: req.warungId }),
      () => cariBanyakBarangOpenRouter({ fotoBase64, produkList: rows, warungId: req.warungId }),
      'scan/visual-ai-banyak'
    );
    const hasil = terdeteksi
      .map(({ id, qty }) => {
        const p = rows.find((r) => r.id === id);
        if (!p) return null; // Gemini ngarang id yang nggak ada di daftar - diabaikan, bukan di-percaya mentah
        return {
          qty,
          produk: {
            id: p.id,
            nama: p.nama,
            harga: Number(p.harga),
            modal: Number(p.modal),
            stok: p.stok,
            fotoUrl: p.foto_url,
            satuan: p.satuan || 'pcs',
            isiKemasan: Number(p.isi_kemasan) || 1,
            namaKemasan: p.nama_kemasan || null,
            grup: p.grup || null,
          },
        };
      })
      .filter(Boolean);
    res.json(hasil);
  } catch (e) {
    next(e);
  }
});

export default router;
