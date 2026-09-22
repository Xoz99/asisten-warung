import { aiLimiter } from '../middleware/rateLimit.js';
import { Router } from 'express';
import Tesseract from 'tesseract.js';
import { Jimp, JimpMime } from 'jimp';
import { query } from '../db.js';
import { cocokProduk, produkSetelahMasuk } from '../services/voice.service.js';
import { bacaNotaGemini } from '../services/gemini.service.js';
import { bacaNotaOpenRouter } from '../services/openrouter.service.js';
import { cobaGeminiLaluOpenRouter } from '../utils/aiFallback.js';

const router = Router();

// Foto nota asli (dari kamera HP) hasilnya sering pudar/kontras rendah (terutama struk kertas
// thermal) atau miring - Tesseract jauh lebih akurat kalau tulisannya dipertegas dulu sebelum
// dibaca. Ini preprocessing dasar (bukan deskew/binarize penuh yang lebih rumit & rawan
// kebalik-balik di pencahayaan nggak rata) - greyscale + normalize (regangin kontras biar penuh
// dari gelap ke terang) + sedikit contrast boost. Kalau gagal (format foto aneh dll), tetep
// lanjut pakai foto asli, jangan sampai bikin scan gagal total gara-gara preprocessing doang.
async function praProsesGambar(buffer) {
  try {
    const img = await Jimp.read(buffer);
    img.greyscale().normalize().contrast(0.25);
    return await img.getBuffer(JimpMime.png);
  } catch {
    return buffer;
  }
}

// Baris nota di dunia nyata formatnya macem-macem banget - "Nama Qty Harga", "Nama Harga" doang
// (qty dianggap 1), harga dipisah titik/koma, ada "Rp"/"x" nempel, dst. Daripada 1 regex kaku
// yang gampang gagal total kalau formatnya beda dikit, di sini discan per-BARIS dari token
// paling KANAN mundur ke kiri: token yang "keliatan angka" (boleh ada Rp/titik/koma/x nempel)
// dikumpulin sebagai kandidat qty/harga, berhenti begitu ketemu token yang bukan angka murni -
// itu tandanya udah masuk nama barang. Cara ini juga otomatis nggak kepancing sama angka yang
// NEMPEL di nama barang sendiri (misal "Aqua 600ml" - "600ml" bukan token angka murni karena ada
// "ml"-nya, jadi tetap ke-anggap bagian dari nama, bukan qty/harga).
// OCR itu accelerator, bukan pengganti (sesuai mitigasi risiko di PRD 11) - user tetap koreksi
// hasilnya di client sebelum dikonfirmasi lewat /terapkan.
// baris ringkasan struk (total/bayar/kembalian dst) - bukan barang beneran, jangan ikut keekstrak
const KATA_BUKAN_BARANG = /\b(total|subtotal|sub total|bayar|tunai|kembali|kembalian|diskon|pajak|ppn|cash|change)\b/i;

function ekstrakBaris(teks) {
  const baris = [];
  const lines = teks.split('\n').map((l) => l.trim()).filter(Boolean);
  const isTokenAngka = (t) => /^rp\.?[\d.,]+$|^[\d.,]+x?$/i.test(t) && /\d/.test(t);

  for (const line of lines) {
    if (KATA_BUKAN_BARANG.test(line)) continue;
    const token = line.split(/\s+/).filter(Boolean);
    if (token.length < 2) continue;

    let i = token.length - 1;
    const angkaToken = [];
    while (i >= 0 && angkaToken.length < 3 && isTokenAngka(token[i])) {
      angkaToken.unshift(token[i]);
      i--;
    }
    if (!angkaToken.length) continue;

    const nama = token
      .slice(0, i + 1)
      .join(' ')
      .replace(/[-:.]+$/, '')
      .replace(/\brp\.?$/i, '')
      .trim();
    if (nama.length < 2) continue;

    const angka = angkaToken.map((t) => parseInt(t.replace(/[^\d]/g, ''), 10)).filter((n) => n > 0);
    if (!angka.length) continue;

    let qty = 1;
    let harga;
    if (angka.length === 1) {
      harga = angka[0];
    } else if (angka[0] < 1000) {
      // angka pertama kecil (wajar buat jumlah beli) -> dianggap qty, angka terakhir = harga
      qty = angka[0];
      harga = angka[angka.length - 1];
    } else {
      // semua angka "besar" (kemungkinan kolom harga satuan + subtotal, bukan qty) -> qty=1,
      // ambil angka PALING KANAN (biasanya kolom subtotal/harga final di struk)
      harga = angka[angka.length - 1];
    }
    if (nama && qty > 0 && harga > 0) baris.push({ nama, qty, harga });
  }
  return baris;
}

// Scan nota tulisan tangan/print dari pasar/grosir. Coba Gemini Vision DULU (kirim foto langsung
// ke AI, jauh lebih toleran ke foto miring/kusut/pudar/tulisan tangan) - kalau gagal (key belum
// diisi/quota habis/timeout), fallback ke Tesseract.js (jalan pure JS/WASM, offline, gratis, tapi
// lebih lemah ke foto dunia nyata) biar fitur ini nggak pernah mati total (PRD 10.4 & 11).
// Foto dikirim sebagai data URL base64 (dari jepretFrame di client) - samain sama pola upload
// foto lain di app ini (produk/pelanggan/wajah), bukan multipart form-data.
router.post('/scan', aiLimiter, async (req, res, next) => {
  try {
    const { fotoBase64 } = req.body;
    if (!fotoBase64) return res.status(400).json({ error: 'fotoBase64 wajib diisi' });

    try {
      // Gemini -> OpenRouter (lihat aiFallback.js) - TAPI kalau gagalnya gara-gara jatah token
      // harian warung ini sendiri udah habis, cobaGeminiLaluOpenRouter bakal langsung lempar ulang
      // (skip OpenRouter juga, itu tetap fitur AI berbayar) - ujung-ujungnya sama-sama jatuh ke
      // Tesseract di bawah (GRATIS, jalan lokal, nggak kena batasan jatah token AI sama sekali).
      const [baris, sumber] = await cobaGeminiLaluOpenRouter(
        async () => [await bacaNotaGemini(fotoBase64, req.warungId), 'gemini'],
        async () => [await bacaNotaOpenRouter(fotoBase64, req.warungId), 'openrouter'],
        'nota/scan'
      );
      return res.json({ teksMentah: null, baris, sumber });
    } catch (e) {
      console.warn(`[nota] Gemini & OpenRouter gagal (status ${e.status || '?'}), fallback ke Tesseract:`, e.message);
    }

    const base64 = fotoBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');
    const diproses = await praProsesGambar(buffer);
    const { data } = await Tesseract.recognize(diproses, 'ind+eng');
    res.json({ teksMentah: data.text, baris: ekstrakBaris(data.text), sumber: 'tesseract' });
  } catch (e) {
    next(e);
  }
});

// User sudah koreksi hasil OCR di client, baru dikonfirmasi ke sini buat diterapkan ke stok & harga modal.
router.post('/terapkan', async (req, res, next) => {
  try {
    const baris = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!baris.length) return res.status(400).json({ error: 'rows wajib diisi' });

    const { rows: semuaProduk } = await query('SELECT * FROM produk WHERE warung_id=$1 AND aktif', [req.warungId]);
    let totalModal = 0;
    const hasil = [];

    for (const b of baris) {
      const nama = (b.nama || '').trim();
      const qty = +b.qty || 0;
      const harga = +b.harga || 0;
      if (!nama || !qty) continue;
      totalModal += qty * harga;

      const match = cocokProduk(semuaProduk, nama);
      if (match) {
        const updated = produkSetelahMasuk(match, qty, harga);
        await query('UPDATE produk SET stok=$1, modal=$2, updated_at=now() WHERE id=$3', [updated.stok, updated.modal, match.id]);
        hasil.push({ produkId: match.id, nama: match.nama, aksi: 'update_stok', qty, harga });
      } else {
        const hargaJual = Math.round((harga * 1.2) / 500) * 500;
        const { rows: baru } = await query(
          'INSERT INTO produk (warung_id, nama, kategori, harga, modal, stok, laku_per_hari) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
          [req.warungId, nama, 'sembako', hargaJual, harga, qty, 2]
        );
        hasil.push({ produkId: baru[0].id, nama, aksi: 'produk_baru', qty, harga });
      }
    }

    if (totalModal) {
      await query('INSERT INTO modal_log (warung_id, keterangan, jumlah) VALUES ($1,$2,$3)', [req.warungId, 'Scan nota pasar', totalModal]);
    }
    res.json({ diterapkan: hasil, totalModal });
  } catch (e) {
    next(e);
  }
});

export default router;
