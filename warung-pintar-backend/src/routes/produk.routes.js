import { aiLimiter } from '../middleware/rateLimit.js';
import { Router } from 'express';
import { opsiHargaJual } from '../utils/hargaJual.js';
import { query } from '../db.js';
import { produkSetelahMasuk } from '../services/voice.service.js';
import { cariReferensiProdukGemini } from '../services/gemini.service.js';
import { catatKontribusi } from '../services/katalog.service.js';
import { cariReferensiProdukOpenRouter } from '../services/openrouter.service.js';
import { cobaGeminiLaluOpenRouter } from '../utils/aiFallback.js';

const router = Router();

// "Cari referensi" - dipanggil manual (tombol, bukan otomatis tiap ketik) dari form tambah barang
// baru (Stok.jsx) buat nyaranin isi kemasan & kisaran harga dari pengetahuan umum Gemini, biar
// nggak input satu-satu dari nol. Lihat komentar lengkap soal batasannya (perkiraan, bukan harga
// pasti/live) di cariReferensiProdukGemini (gemini.service.js).
router.post('/cari-referensi', aiLimiter, async (req, res, next) => {
  try {
    const q = (req.body.query || '').trim();
    if (!q) return res.status(400).json({ error: 'query wajib diisi' });
    const hasil = await cobaGeminiLaluOpenRouter(
      () => cariReferensiProdukGemini(q, req.warungId),
      () => cariReferensiProdukOpenRouter(q, req.warungId),
      'produk/cari-referensi'
    );
    // Tiga pilihan harga jual dihitung DI SINI dari perkiraan modal & pasaran yang dikasih AI -
    // bukan minta AI ngarang tiga angka sendiri. Alasannya: aturan dagangnya (jangan di bawah
    // lantai untung, dibulatkan ke angka yang enak diucapkan, ketiganya harus beda) itu logika
    // pasti yang nggak boleh diserahkan ke tebakan model.
    res.json(hasil.map((h) => ({ ...h, opsiHarga: opsiHargaJual(h.hargaModal, h.hargaPasaran) })));
  } catch (e) {
    // Pesan mentah dari penyedia AI ("API key not valid", "quota exceeded", "timeout") itu bahasa
    // developer - pemilik warung nggak ngerti & nggak bisa berbuat apa-apa soal itu. Yang dia
    // butuh cuma tau fiturnya lagi nggak bisa DAN ada jalan lain (isi manual). Sebab aslinya tetap
    // kecatat di log lewat cobaGeminiLaluOpenRouter.
    //
    // 402 (jatah AI habis) DILEWATI - itu pesan yang emang ditujukan ke user & ada tindak
    // lanjutnya (nunggu reset besok / upgrade paket), jadi jangan ditimpa.
    if (e.status === 402) return next(e);
    console.warn('[produk/cari-referensi] semua jalur AI gagal:', e.message);
    return next(
      Object.assign(new Error('Lagi nggak bisa nyari referensi barang. Isi manual dulu aja ya, nanti bisa diubah lagi.'), {
        status: 503,
      })
    );
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM produk WHERE warung_id=$1 AND aktif ORDER BY nama', [req.warungId]);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// fallback scan barcode (fitur #4 — kalau visual gagal / barang tanpa kemasan foto)
router.get('/barcode/:kode', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM produk WHERE warung_id=$1 AND barcode=$2 AND aktif', [req.warungId, req.params.kode]);
    if (!rows.length) return res.status(404).json({ error: 'Barang dengan barcode ini belum terdaftar' });
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

// "Sering dibeli pagi" (chip cepat di Catat Penjualan) — dihitung dari transaksi ASLI jam pagi
// (05:00-11:00) 30 hari terakhir, BUKAN comot 6 produk pertama dari daftar kayak versi lama.
// Balikin id doang (urutan dari paling sering), bukan detail produk lengkap - frontend udah punya
// S.produk ternormalisasi sebagai sumber kebenaran (lihat produkById di Catat.jsx), di sini cuma
// nentuin ID MANA & URUTANNYA yang masuk chip, biar nggak dobel-normalize data yang sama.
router.get('/sering-pagi', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT ti.produk_id
       FROM transaksi_item ti
       JOIN transaksi t ON t.id = ti.transaksi_id
       WHERE t.warung_id = $1
         AND t.waktu >= now() - interval '30 days'
         AND EXTRACT(HOUR FROM t.waktu) BETWEEN 5 AND 11
         AND ti.produk_id IS NOT NULL
       GROUP BY ti.produk_id
       ORDER BY SUM(ti.qty) DESC
       LIMIT 6`,
      [req.warungId]
    );
    res.json(rows.map((r) => r.produk_id));
  } catch (e) {
    next(e);
  }
});

// rekomendasi barang priority buat dibelanjakan (fitur #8) — urut dari yang paling cepat habis
router.get('/rekomendasi-belanja', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT *, CASE WHEN laku_per_hari > 0 THEN stok / laku_per_hari ELSE 999 END AS hari_bertahan
       FROM produk WHERE warung_id=$1 AND aktif ORDER BY hari_bertahan ASC LIMIT 15`,
      [req.warungId]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { nama, kategori, barcode, harga, modal, stok, lakuPerHari, satuan, isiKemasan, namaKemasan, grup, fotoUrl } = req.body;
    if (!nama) return res.status(400).json({ error: 'nama wajib diisi' });
    const { rows } = await query(
      `INSERT INTO produk (warung_id, nama, kategori, barcode, harga, modal, stok, laku_per_hari, satuan, isi_kemasan, nama_kemasan, grup, foto_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        req.warungId,
        nama,
        kategori || 'sembako',
        barcode || null,
        harga || 0,
        modal || 0,
        stok || 0,
        lakuPerHari || 0,
        satuan || 'pcs',
        isiKemasan || 1,
        namaKemasan || null,
        grup || null,
        fotoUrl || null,
      ]
    );
    setImmediate(() => catatKontribusi(rows[0].id)); // katalog bersama - nggak nahan respons
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

// Kolom ikon ditambah otomatis kalau belum ada - deploy di VPS nggak jalanin `npm run migrate`.
let kolomIkonSiap = null;
function pastikanKolomIkon() {
  if (!kolomIkonSiap) {
    kolomIkonSiap = query('ALTER TABLE produk ADD COLUMN IF NOT EXISTS ikon TEXT').catch((e) => {
      kolomIkonSiap = null;
      throw e;
    });
  }
  return kolomIkonSiap;
}

router.put('/:id', async (req, res, next) => {
  try {
    // default null (bukan undefined) buat field yang nggak dikirim — node-postgres nolak undefined
    // sebagai parameter, dan COALESCE emang butuh null buat "biarin nilai lama"
    const {
      nama = null,
      kategori = null,
      barcode = null,
      harga = null,
      modal = null,
      lakuPerHari = null,
      satuan = null,
      isiKemasan = null,
      namaKemasan = null,
      grup = null,
      fotoUrl = null,
      // kunci ikon (misal "botol"), '' = balik ke tebakan otomatis, null/nggak dikirim = jangan diubah
      ikon = null,
    } = req.body;
    if (ikon !== null && (typeof ikon !== 'string' || !/^[a-z0-9-]{0,40}$/.test(ikon))) {
      return res.status(400).json({ error: 'ikon nggak valid' });
    }
    await pastikanKolomIkon();
    const { rows } = await query(
      `UPDATE produk SET nama=COALESCE($1,nama), kategori=COALESCE($2,kategori), barcode=COALESCE($3,barcode),
        harga=COALESCE($4,harga), modal=COALESCE($5,modal), laku_per_hari=COALESCE($6,laku_per_hari),
        satuan=COALESCE($7,satuan), isi_kemasan=COALESCE($8,isi_kemasan), nama_kemasan=COALESCE($9,nama_kemasan),
        grup=COALESCE($10,grup), foto_url=COALESCE($11,foto_url), ikon=COALESCE($12,ikon), updated_at=now()
       WHERE id=$13 AND warung_id=$14 RETURNING *`,
      [nama, kategori, barcode, harga, modal, lakuPerHari, satuan, isiKemasan, namaKemasan, grup, fotoUrl, ikon, req.params.id, req.warungId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Produk tidak ditemukan' });
    setImmediate(() => catatKontribusi(rows[0].id));
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

// Hapus barang - SOFT DELETE (set aktif=false), BUKAN DELETE FROM beneran. Kenapa: transaksi_item
// nyimpen produk_id TANPA ON DELETE CASCADE (sengaja, lihat komentar di schema.sql), jadi kalau
// barangnya udah pernah kejual, hard-delete bakal GAGAL kena foreign key constraint - dan walau
// belum pernah kejual, hard-delete tetap bukan ide bagus di aplikasi pencatatan kayak gini (kalau
// nanti ternyata kehapus keliru, nggak ada jalan balik). Barang yang di-nonaktifin ilang dari
// semua katalog aktif (Stok, Catat Penjualan, scan, Mang AI, dst - lihat query lain yang dikasih
// `AND aktif`), tapi baris & histori transaksinya tetap utuh di database.
router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await query('UPDATE produk SET aktif=false, updated_at=now() WHERE id=$1 AND warung_id=$2 RETURNING id', [
      req.params.id,
      req.warungId,
    ]);
    if (!rows.length) return res.status(404).json({ error: 'Produk tidak ditemukan' });
    setImmediate(() => catatKontribusi(rows[0].id)); // produk nonaktif -> kontribusinya dicabut
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// stok masuk dari belanja pasar/grosir — hitung HPP rata-rata tertimbang.
// Bisa diisi langsung dalam satuan jual (qty + harga per satuan), ATAU dalam kemasan besar
// (jumlahKemasan + hargaKemasan per kemasan) — yang terakhir otomatis dikonversi pakai
// isi_kemasan barangnya (misal 1 dus = 40 pcs), jadi user nggak perlu ngitung manual.
router.post('/:id/masuk-stok', async (req, res, next) => {
  try {
    const { rows: pRows } = await query('SELECT * FROM produk WHERE id=$1 AND warung_id=$2', [req.params.id, req.warungId]);
    if (!pRows.length) return res.status(404).json({ error: 'Produk tidak ditemukan' });
    const p = pRows[0];

    let qty;
    let harga;
    if (req.body.jumlahKemasan != null) {
      const jumlahKemasan = +req.body.jumlahKemasan;
      const isi = p.isi_kemasan || 1;
      qty = jumlahKemasan * isi;
      harga = req.body.hargaKemasan != null ? +req.body.hargaKemasan / isi : null;
    } else {
      qty = +req.body.qty;
      harga = req.body.harga != null ? +req.body.harga : null;
    }
    if (!qty || qty <= 0) return res.status(400).json({ error: 'qty (atau jumlahKemasan) wajib diisi angka > 0' });

    const updated = produkSetelahMasuk(p, qty, harga ?? p.modal);
    const { rows } = await query('UPDATE produk SET stok=$1, modal=$2, updated_at=now() WHERE id=$3 RETURNING *', [
      updated.stok,
      updated.modal,
      p.id,
    ]);
    await query('INSERT INTO modal_log (warung_id, keterangan, jumlah) VALUES ($1,$2,$3)', [
      req.warungId,
      `Stok masuk ${qty}x ${p.nama}`,
      qty * (harga ?? p.modal),
    ]);
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

// stok opname manual (koreksi fisik)
router.post('/:id/opname', async (req, res, next) => {
  try {
    const { fisik, harga } = req.body;
    const { rows: pRows } = await query('SELECT * FROM produk WHERE id=$1 AND warung_id=$2', [req.params.id, req.warungId]);
    if (!pRows.length) return res.status(404).json({ error: 'Produk tidak ditemukan' });
    const p = pRows[0];
    const stokBaru = fisik != null && !Number.isNaN(+fisik) ? Math.max(0, +fisik) : p.stok;
    const hargaBaru = harga != null ? +harga : p.harga;
    const { rows } = await query('UPDATE produk SET stok=$1, harga=$2, updated_at=now() WHERE id=$3 RETURNING *', [
      stokBaru,
      hargaBaru,
      p.id,
    ]);
    if (harga != null) setImmediate(() => catatKontribusi(p.id)); // harga berubah -> kisaran katalog ikut
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

export default router;
