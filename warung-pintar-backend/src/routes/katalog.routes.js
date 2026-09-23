import { Router } from 'express';
import { query } from '../db.js';
import { antreFotoKatalog, catatKontribusi, cariBarcodeOff, fotoTampil, kisaranHarga, kunciBarang, normalNama, pastikanTabelKatalog } from '../services/katalog.service.js';

// Katalog Barang Bersama - lihat penjelasan lengkap di services/katalog.service.js.
const router = Router();
router.use(async (req, res, next) => {
  try {
    await pastikanTabelKatalog();
    next();
  } catch (e) {
    next(e);
  }
});

const KOLOM = 'id, kunci, barcode, nama, merek, kategori, satuan, isi_kemasan, nama_kemasan, ukuran, foto_url, foto_lokal, sumber';

// Barang milik warung ini (aktif), buat nandain "udah punya" di katalog & nolak dobel waktu nambah.
async function punyaWarung(warungId) {
  const { rows } = await query('SELECT nama, barcode FROM produk WHERE warung_id=$1 AND aktif', [warungId]);
  const kunci = new Set();
  for (const p of rows) {
    const k = kunciBarang(p);
    if (k) kunci.add(k);
    const n = normalNama(p.nama);
    if (n) kunci.add('n:' + n);
  }
  return kunci;
}
const sudahPunya = (punya, b) => punya.has(b.kunci) || punya.has('n:' + normalNama(b.nama));
async function lengkapi(warungId, daftar) {
  const [punya, harga] = await Promise.all([punyaWarung(warungId), kisaranHarga(daftar.map((b) => b.kunci))]);
  // foto_url yang dikirim ke app = foto di server sendiri kalau udah diunduh, kalau belum link aslinya.
  return daftar.map(({ foto_lokal, ...b }) => ({ ...b, foto_url: fotoTampil({ ...b, foto_lokal }), sudahPunya: sudahPunya(punya, b), harga: harga[b.kunci] || null }));
}

// Daftar katalog: tanpa q = barang terpopuler (buat layar "pilih barang yang kamu jual"), dengan q = pencarian.
router.get('/', async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 60) : '';
    const kategori = typeof req.query.kategori === 'string' ? req.query.kategori.trim().slice(0, 40) : '';
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 60));
    const offset = Math.min(1000000, Math.max(0, Math.floor(Number(req.query.offset) || 0)));
    const syarat = ['aktif'];
    const nilai = [];
    if (q) {
      // Tiap kata harus ada (urutan bebas): "goreng indomie" ketemu "Indomie Mi Goreng".
      for (const kata of normalNama(q).split(' ').filter(Boolean).slice(0, 6)) {
        nilai.push('%' + kata + '%');
        // "silverqueen 82g" juga cocok dengan "Silver Queen ... 82 g".
        syarat.push(`(lower(nama) LIKE $${nilai.length} OR barcode LIKE $${nilai.length}
          OR regexp_replace(lower(nama), '[^a-z0-9]', '', 'g') LIKE $${nilai.length})`);
      }
    }
    if (kategori) {
      nilai.push(kategori);
      syarat.push(`kategori = $${nilai.length}`);
    }
    nilai.push(limit, offset);
    // Barang yang namanya sama (beda cuma huruf besar/kecil, spasi, tanda baca - mis. "Aqua 330 Ml" vs "Aqua 330ml",
    // biasanya barang sama dengan barcode beda negara/kemasan) cuma ditampilin sekali: yang ada fotonya & paling
    // populer. Baris lainnya tetap ada di database, jadi scan barcode-nya tetap ketemu.
    const { rows } = await query(
      `SELECT * FROM (
         SELECT DISTINCT ON (regexp_replace(lower(nama), '[^a-z0-9]', '', 'g')) ${KOLOM}, populer
         FROM katalog_barang WHERE ${syarat.join(' AND ')}
         ORDER BY regexp_replace(lower(nama), '[^a-z0-9]', '', 'g'), (foto_url IS NOT NULL) DESC, populer DESC, (barcode LIKE '899%') DESC
       ) t
       ORDER BY populer DESC, (foto_url IS NOT NULL) DESC, nama LIMIT $${nilai.length - 1} OFFSET $${nilai.length}`,
      nilai
    );
    const { rows: kat } = await query('SELECT kategori, count(*)::int AS n FROM katalog_barang WHERE aktif GROUP BY kategori ORDER BY n DESC');
    res.json({ barang: await lengkapi(req.warungId, rows), kategori: kat, adaLagi: rows.length === limit });
  } catch (e) {
    next(e);
  }
});

// Cari satu barcode: katalog dulu, kalau belum ada tanya langsung ke Open Food Facts (disimpan buat berikutnya).
router.get('/barcode/:kode', async (req, res, next) => {
  try {
    const kode = String(req.params.kode || '').trim();
    const kunci = kunciBarang({ barcode: kode });
    if (!kunci || kunci.startsWith('n:')) return res.status(400).json({ error: 'Barcode nggak valid' });
    let { rows } = await query(`SELECT ${KOLOM} FROM katalog_barang WHERE kunci=$1 AND aktif`, [kunci]);
    if (!rows.length) {
      const b = await cariBarcodeOff(kunci);
      rows = b ? (await query(`SELECT ${KOLOM} FROM katalog_barang WHERE id=$1 AND aktif`, [b.id])).rows : [];
    }
    if (!rows.length) return res.status(404).json({ error: 'Barcode ini belum ada di katalog' });
    if (rows[0].foto_url && !rows[0].foto_lokal) antreFotoKatalog([rows[0]]);
    const [hasil] = await lengkapi(req.warungId, [rows[0]]);
    res.json(hasil);
  } catch (e) {
    next(e);
  }
});

// Tambah banyak barang sekaligus dari katalog ke stok warung ini. items: [{ id, harga?, stok? }]
router.post('/tambah', async (req, res, next) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items.slice(0, 300) : [];
    const ids = [...new Set(items.map((x) => String(x?.id || '')).filter((x) => /^[0-9a-f-]{36}$/i.test(x)))];
    if (!ids.length) return res.status(400).json({ error: 'Pilih minimal 1 barang' });
    const { rows: barang } = await query(`SELECT ${KOLOM} FROM katalog_barang WHERE id = ANY($1) AND aktif`, [ids]);
    const punya = await punyaWarung(req.warungId);
    const angka = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : 0);
    const pilihan = Object.fromEntries(items.map((x) => [String(x?.id || ''), x]));
    const dibuat = [];
    let dilewati = 0;
    for (const b of barang) {
      if (sudahPunya(punya, b)) {
        dilewati++;
        continue;
      }
      const x = pilihan[b.id] || {};
      const { rows } = await query(
        `INSERT INTO produk (warung_id, nama, kategori, barcode, harga, stok, satuan, isi_kemasan, nama_kemasan, foto_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [req.warungId, b.nama, b.kategori, b.barcode, Math.min(angka(x.harga), 1e9), Math.min(angka(x.stok), 1e6), b.satuan, b.isi_kemasan || 1, b.nama_kemasan, fotoTampil(b)]
      );
      punya.add(b.kunci);
      dibuat.push(rows[0].id);
    }
    // Foto yang belum ada di server sendiri diunduh di belakang; begitu selesai, link foto barang warung ikut diganti.
    antreFotoKatalog(barang.filter((b) => b.foto_url && !b.foto_lokal));
    // Kontribusi ke katalog dijalanin belakangan - nggak perlu bikin user nunggu.
    setImmediate(() => dibuat.reduce((p, id) => p.then(() => catatKontribusi(id)), Promise.resolve()));
    res.status(201).json({ ditambah: dibuat.length, dilewati });
  } catch (e) {
    next(e);
  }
});

// Saklar "bagikan barang saya ke katalog". Dimatiin = semua kontribusi warung ini langsung dihapus.
router.get('/pengaturan', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT bagikan_katalog FROM warung WHERE id=$1', [req.warungId]);
    res.json({ bagikan: rows[0]?.bagikan_katalog !== false });
  } catch (e) {
    next(e);
  }
});
router.put('/pengaturan', async (req, res, next) => {
  try {
    if (typeof req.body.bagikan !== 'boolean') return res.status(400).json({ error: 'bagikan wajib true/false' });
    await query('UPDATE warung SET bagikan_katalog=$2 WHERE id=$1', [req.warungId, req.body.bagikan]);
    if (!req.body.bagikan) {
      await query('DELETE FROM katalog_kontribusi WHERE warung_id=$1', [req.warungId]);
    } else {
      const { rows } = await query('SELECT id FROM produk WHERE warung_id=$1 AND aktif', [req.warungId]);
      setImmediate(() => rows.reduce((p, r) => p.then(() => catatKontribusi(r.id)), Promise.resolve()));
    }
    res.json({ bagikan: req.body.bagikan });
  } catch (e) {
    next(e);
  }
});

export default router;
