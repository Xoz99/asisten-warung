import { query } from '../db.js';

// Katalog Barang Bersama: daftar barang siap pakai buat warung baru, biar nggak ngetik satu-satu.
//
// Sumber isinya:
//  - 'off'    : Open Food Facts (database barcode terbuka, lisensi ODbL - wajib cantumin sumber di app).
//               Diimpor lewat `npm run impor:katalog`, plus dicari langsung per barcode kalau barcode
//               yang discan belum ada di katalog.
//  - 'warung' : dari barang yang ditambah warung pengguna. Baru masuk katalog kalau minimal
//               MIN_WARUNG_KATALOG warung BERBEDA punya barang yang sama (barcode sama / nama sama) - biar
//               salah ketik atau barang pribadi satu orang nggak kesebar.
//  - 'tim'    : diisi/dirapiin tim lewat Makalin (nanti).
//
// Yang dibagi CUMA identitas barang (nama, barcode, kategori, satuan, isi kemasan, foto). Stok, modal, dan harga
// satu warung tertentu nggak pernah keluar. Saran harga cuma berupa kisaran gabungan (persentil 25-75) dari
// minimal MIN_WARUNG_HARGA warung, dan cuma dihitung dari warung yang nggak mematikan "bagikan ke katalog".
export const MIN_WARUNG_KATALOG = 3;
export const MIN_WARUNG_HARGA = 5;
const UA = 'AsistenWarung/1.0 (konsulinsupport@gmail.com)';

let siap = null;
export function pastikanTabelKatalog() {
  if (!siap) {
    siap = (async () => {
      await query(`CREATE TABLE IF NOT EXISTS katalog_barang (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        kunci TEXT UNIQUE NOT NULL,       -- barcode (angka) atau 'n:<nama dinormalisasi>'
        barcode TEXT,
        nama TEXT NOT NULL,
        merek TEXT,
        kategori TEXT NOT NULL DEFAULT 'sembako',
        satuan TEXT NOT NULL DEFAULT 'pcs',
        isi_kemasan INTEGER NOT NULL DEFAULT 1,
        nama_kemasan TEXT,
        ukuran TEXT,                      -- "85 g", "600 ml" (dari kemasan, cuma info)
        foto_url TEXT,
        sumber TEXT NOT NULL DEFAULT 'off', -- off | warung | tim
        populer INTEGER NOT NULL DEFAULT 0, -- skor urutan (jumlah scan OFF / jumlah warung)
        aktif BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      )`);
      await query('CREATE INDEX IF NOT EXISTS idx_katalog_barcode ON katalog_barang (barcode) WHERE barcode IS NOT NULL');
      await query('CREATE INDEX IF NOT EXISTS idx_katalog_nama ON katalog_barang (lower(nama))');
      // Satu baris per produk warung yang ikut dibagikan. Dipakai buat: naikin barang ke katalog (>= 3 warung) dan
      // kisaran harga (>= 5 warung). Dihapus kalau produknya dihapus / warungnya matiin berbagi.
      await query(`CREATE TABLE IF NOT EXISTS katalog_kontribusi (
        produk_id UUID PRIMARY KEY REFERENCES produk(id) ON DELETE CASCADE,
        warung_id UUID NOT NULL REFERENCES warung(id) ON DELETE CASCADE,
        kunci TEXT NOT NULL,
        nama TEXT NOT NULL,
        barcode TEXT,
        kategori TEXT,
        satuan TEXT,
        isi_kemasan INTEGER,
        harga NUMERIC NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT now()
      )`);
      await query('CREATE INDEX IF NOT EXISTS idx_katalog_kontribusi_kunci ON katalog_kontribusi (kunci)');
      await query('ALTER TABLE warung ADD COLUMN IF NOT EXISTS bagikan_katalog BOOLEAN NOT NULL DEFAULT true');
    })().catch((e) => {
      siap = null;
      throw e;
    });
  }
  return siap;
}

export const normalNama = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
const barcodeValid = (b) => /^\d{8,14}$/.test(String(b || '').trim());
// Barcode EAN/UPC kadang ditulis dengan/ tanpa 0 di depan (0089686010947 vs 089686010947) - disamain.
const normalBarcode = (b) => String(b).trim().replace(/^0+(?=\d{8,})/, '');
// Digit cek GTIN (EAN-8/UPC-A/EAN-13/GTIN-14). Barcode ngawur / salah scan ditolak sebelum nanya ke Open Food Facts.
export function gtinValid(kode) {
  const k = String(kode || '').trim();
  if (!/^(\d{8}|\d{12,14})$/.test(k)) return false;
  const d = k.split('').map(Number);
  const cek = d.pop();
  const jumlah = d.reverse().reduce((a, x, i) => a + x * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (jumlah % 10)) % 10 === cek;
}
const produkTes = (nama) => /\b(test|tes|dummy|sample|contoh) product\b|\bproduct test\b/i.test(nama);
export function kunciBarang({ barcode, nama }) {
  if (barcodeValid(barcode)) return normalBarcode(barcode);
  const n = normalNama(nama);
  return n ? 'n:' + n : null;
}

// Tag kategori Open Food Facts -> kategori yang dipakai app (teks bebas di produk.kategori).
// Dicek berurutan ke tag kategori OFF DULU (lebih bisa dipercaya), baru ke nama barangnya. Nggak ketebak = 'lainnya'.
const ATURAN_KATEGORI = [
  ['rokok', /cigarette|tobacco|\brokok\b|kretek|gudang garam|sampoerna|djarum|\bsurya\b|marlboro|dunhill|\bla bold\b/],
  ['mie instan', /instant-noodle|noodle|\bmie\b|\bmi\b|ramen|bihun|soun|indomie|sarimi|supermi|sedaap|pop mie/],
  ['susu', /milk|\bsusu\b|dairies|dairy|yogh?urt|creamer|kental manis|\bskm\b|keju|cheese|butter|mentega/],
  ['bumbu', /sauce|condiment|seasoning|spice|kecap|sambal|saos|saus|bumbu|\bsalt\b|garam|vinegar|cuka|kaldu|stock|masako|royco|terasi|mayones|mayonnaise/],
  ['minuman', /beverage|drink|water|\btea\b|\bteh\b|coffee|\bkopi\b|juice|\bjus\b|isotonik|isotonic|soda|minuman|syrup|sirup|air mineral|energy|pocari|aqua\b|le mineral|pucuk|fruit tea|sprite|coca cola|fanta|good day|kapal api|nescafe|milo|ale ale|floridina|you c 1000|mizone/],
  ['snack', /snack|biscuit|biskuit|cracker|chip|wafer|cookie|candy|confection|chocolate|cokelat|coklat|cake|crisps|permen|keripik|kripik|pudding|puding|jelly|jeli|roti|bread|wafel|brownie|kacang|mentos|kopiko|relaxa|beng beng|chitato|\btaro\b|qtela|oreo|nabati|tango|silverqueen|momogi|chiki/],
  ['sembako', /\brice\b|beras|sugar|\bgula\b|\boil\b|minyak|flour|tepung|\begg\b|telur|cereal|oat|margarin|sarden|sardine|kornet|corned/],
  ['kebersihan', /soap|shampoo|sampo|detergent|deterjen|toothpaste|pasta gigi|sabun|hygiene|tissue|tisu|pembersih|rinso|so klin|sunlight|lifebuoy|pepsodent|ciptadent|molto|wipol|harpic|downy/],
];
export function kategoriDariTag(tags = [], nama = '') {
  const t = tags.join(' ').toLowerCase().replace(/-/g, ' ');
  for (const [kat, pola] of ATURAN_KATEGORI) if (pola.test(t)) return kat;
  const n = String(nama).toLowerCase();
  for (const [kat, pola] of ATURAN_KATEGORI) if (pola.test(n)) return kat;
  return 'lainnya';
}

// Satu produk Open Food Facts -> baris katalog. null kalau datanya terlalu kosong buat dipakai.
export function dariOff(p) {
  const kode = p?.code && gtinValid(p.code) ? normalBarcode(p.code) : null;
  const namaDasar = String(p?.product_name_id || p?.product_name || '').trim();
  if (!kode || !namaDasar || namaDasar.length < 2 || produkTes(namaDasar)) return null;
  const merek = [].concat(p.brands || []).flatMap((b) => String(b).split(',')).map((b) => b.trim()).filter(Boolean)[0] || null;
  // Ukuran cuma dipakai kalau ada satuannya ("85 g", "600ml"). Angka doang ("1", "48") nggak jelas artinya.
  const q = String(p.quantity || '').trim();
  const ukuran = /\d/.test(q) && /[a-z]/i.test(q) ? q.slice(0, 30) : null;
  const rapat = (x) => normalNama(x).replace(/\s+/g, '');
  let nama = namaDasar;
  if (merek && !rapat(nama).includes(rapat(merek))) nama = `${merek} ${nama}`;
  if (ukuran && !rapat(nama).includes(rapat(ukuran))) nama = `${nama} ${ukuran}`;
  nama = nama.replace(/\s+/g, ' ').slice(0, 120);
  // Huruf kapital di awal kata biar rapi ("le mineral" -> "Le Mineral"), tapi yang udah kapital dibiarin.
  nama = nama.replace(/(^|\s)([a-z])/g, (m, s, c) => s + c.toUpperCase());
  return {
    kunci: kode,
    barcode: kode,
    nama,
    merek,
    kategori: kategoriDariTag(p.categories_tags || [], nama),
    ukuran,
    foto_url: typeof p.image_front_small_url === 'string' && p.image_front_small_url.startsWith('https://') ? p.image_front_small_url : null,
    // Barang lokal (barcode 899 = GS1 Indonesia) diprioritasin di daftar populer ketimbang barang impor.
    populer: Math.max(0, Math.round(Number(p.unique_scans_n) || 0)) + (kode.startsWith('899') ? 1000 : 0),
  };
}

// Simpan baris OFF. Barang yang udah dirapiin tim ('tim') atau udah kebentuk dari warung nggak ditimpa.
export async function simpanDariOff(b) {
  const { rows } = await query(
    `INSERT INTO katalog_barang (kunci, barcode, nama, merek, kategori, ukuran, foto_url, sumber, populer)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'off',$8)
     ON CONFLICT (kunci) DO UPDATE SET nama=EXCLUDED.nama, merek=EXCLUDED.merek, kategori=EXCLUDED.kategori, ukuran=EXCLUDED.ukuran,
       foto_url=COALESCE(EXCLUDED.foto_url, katalog_barang.foto_url), populer=EXCLUDED.populer, updated_at=now()
       WHERE katalog_barang.sumber = 'off'
     RETURNING *`,
    [b.kunci, b.barcode, b.nama, b.merek, b.kategori, b.ukuran, b.foto_url, b.populer]
  );
  return rows[0] || null;
}

// Cari satu barcode langsung ke Open Food Facts (dipakai kalau barcode yang discan belum ada di katalog).
export async function cariBarcodeOff(barcode) {
  if (!gtinValid(barcode) && !gtinValid(String(barcode).padStart(13, '0'))) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const f = 'code,product_name,product_name_id,brands,quantity,categories_tags,image_front_small_url,unique_scans_n';
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${f}`, {
      headers: { 'User-Agent': UA },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const j = await res.json();
    if (j.status !== 1 || !j.product) return null;
    const b = dariOff({ ...j.product, code: j.product.code || barcode });
    return b ? await simpanDariOff(b) : null;
  } catch {
    return null; // OFF lambat / mati - nggak apa-apa, user isi manual
  } finally {
    clearTimeout(t);
  }
}

// Catat / perbarui kontribusi satu produk warung, lalu naikin ke katalog kalau udah dipakai cukup banyak warung.
// Dipanggil setelah produk dibuat/diubah/dihapus. Nggak pernah bikin request user gagal.
export async function catatKontribusi(produkId) {
  try {
    await pastikanTabelKatalog();
    const { rows } = await query(
      `SELECT p.id, p.warung_id, p.nama, p.barcode, p.kategori, p.satuan, p.isi_kemasan, p.harga, p.aktif,
              w.bagikan_katalog, COALESCE((to_jsonb(w) ->> 'demo')::boolean, false) AS demo
       FROM produk p JOIN warung w ON w.id = p.warung_id WHERE p.id = $1`,
      [produkId]
    );
    const p = rows[0];
    const kunci = p && kunciBarang(p);
    if (!p || !p.aktif || !p.bagikan_katalog || p.demo || !kunci) {
      await query('DELETE FROM katalog_kontribusi WHERE produk_id=$1', [produkId]);
      return;
    }
    await query(
      `INSERT INTO katalog_kontribusi (produk_id, warung_id, kunci, nama, barcode, kategori, satuan, isi_kemasan, harga, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
       ON CONFLICT (produk_id) DO UPDATE SET kunci=EXCLUDED.kunci, nama=EXCLUDED.nama, barcode=EXCLUDED.barcode, kategori=EXCLUDED.kategori,
         satuan=EXCLUDED.satuan, isi_kemasan=EXCLUDED.isi_kemasan, harga=EXCLUDED.harga, updated_at=now()`,
      [p.id, p.warung_id, kunci, p.nama.trim().slice(0, 120), barcodeValid(p.barcode) ? normalBarcode(p.barcode) : null, p.kategori, p.satuan, p.isi_kemasan, p.harga]
    );
    await naikkanKeKatalog(kunci);
  } catch (e) {
    console.warn('[katalog] kontribusi gagal:', e.message);
  }
}

async function naikkanKeKatalog(kunci) {
  // Ambil versi yang paling banyak dipakai (nama/satuan/kategori terbanyak) dari warung-warung berbeda.
  const { rows } = await query(
    `SELECT count(DISTINCT warung_id)::int AS warung,
            mode() WITHIN GROUP (ORDER BY nama) AS nama, mode() WITHIN GROUP (ORDER BY kategori) AS kategori,
            mode() WITHIN GROUP (ORDER BY satuan) AS satuan, mode() WITHIN GROUP (ORDER BY isi_kemasan) AS isi_kemasan,
            max(barcode) AS barcode
     FROM katalog_kontribusi WHERE kunci=$1`,
    [kunci]
  );
  const r = rows[0];
  if (!r || r.warung < MIN_WARUNG_KATALOG) return;
  await query(
    `INSERT INTO katalog_barang (kunci, barcode, nama, kategori, satuan, isi_kemasan, sumber, populer)
     VALUES ($1,$2,$3,$4,$5,$6,'warung',$7)
     ON CONFLICT (kunci) DO UPDATE SET populer = GREATEST(katalog_barang.populer, EXCLUDED.populer), updated_at=now()`,
    [kunci, r.barcode, r.nama, r.kategori || 'sembako', r.satuan || 'pcs', r.isi_kemasan || 1, r.warung]
  );
}

// Kisaran harga gabungan per kunci (cuma kalau minimal MIN_WARUNG_HARGA warung berbeda ngisi harga).
export async function kisaranHarga(kunciList) {
  if (!kunciList.length) return {};
  const { rows } = await query(
    `SELECT kunci, count(DISTINCT warung_id)::int AS warung,
            percentile_cont(0.25) WITHIN GROUP (ORDER BY harga) AS bawah,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY harga) AS tengah,
            percentile_cont(0.75) WITHIN GROUP (ORDER BY harga) AS atas
     FROM katalog_kontribusi WHERE kunci = ANY($1) AND harga > 0 GROUP BY kunci HAVING count(DISTINCT warung_id) >= $2`,
    [kunciList, MIN_WARUNG_HARGA]
  );
  // Dibulatkan ke Rp500 biar enak diucapin & nggak bisa dipakai nebak harga satu warung persis.
  const bulat = (n) => Math.round(Number(n) / 500) * 500;
  return Object.fromEntries(rows.map((r) => [r.kunci, { bawah: bulat(r.bawah), tengah: bulat(r.tengah), atas: bulat(r.atas), warung: r.warung }]));
}
