import { kategoriDariTag, kunciBarang, normalNama } from './katalog.service.js';

// Membaca JSON data halaman Next.js, tanpa mengeksekusi script situs.
export function produkLotte(html) {
  const chunks = [];
  for (const m of html.matchAll(/<script\b[^>]*>\s*self\.__next_f\.push\(([\s\S]*?)\)\s*;?\s*<\/script>/g)) {
    try {
      const frame = JSON.parse(m[1]);
      if (frame[0] === 1 && typeof frame[1] === 'string') chunks.push(frame[1]);
    } catch { /* bukan data JSON */ }
  }
  const products = new Map();
  const walk = (x, depth = 0) => {
    if (!x || typeof x !== 'object' || depth > 60) return;
    if (typeof x.prod_cd === 'string' && typeof x.prod_nm === 'string' && typeof x.slug === 'string') products.set(x.prod_cd, x);
    for (const v of Object.values(x)) walk(v, depth + 1);
  };
  for (const line of chunks.join('').split('\n')) {
    const m = line.match(/^[\da-f]+:([\[{].*)$/);
    if (!m) continue;
    try { walk(JSON.parse(m[1])); } catch { /* record teks / modul / data tak lengkap */ }
  }
  return [...products.values()];
}

export function sidikNama(nama) {
  return normalNama(String(nama).toLowerCase()
    .replace(/silver\s+queen/g, 'silverqueen')
    .replace(/\bmi\b/g, 'mie')
    .replace(/(\d)\s*(grams?|grammes?|gr)\b/g, '$1g')
    .replace(/(\d)\s*(liter|litre|ltr|lt)\b/g, '$1l')
    .replace(/(\d)\s+(kg|g|ml|l)\b/g, '$1$2'));
}

export function dariLotte(p, halaman) {
  if (!p || !/^\d+$/.test(p.prod_cd) || !/^[a-z0-9-]+$/.test(p.slug) || p.active !== true) return null;
  const nama = p.prod_nm.replace(/\s+/g, ' ').trim();
  if (nama.length < 3 || nama.length > 120 || /\b(test|dummy)\b/i.test(nama)) return null;
  // Produk toko sehari-hari, bukan elektronik besar atau perabot rumah.
  if (/electronic|appliance|furniture|textile|fashion|footwear|automotive|bicycle|ebike/i.test(`${p.l1_nm} ${p.l4_nm} ${nama}`)) return null;
  let kategori = kategoriDariTag([p.l4_nm || ''], nama);
  if (/vegetable|fresh fruit|local fruit|import fruit|pumpkin/i.test(p.l4_nm || '')) kategori = 'sembako';
  if (/^PUMPKIN BUTTERNUT\s*\/\s*KG$/i.test(nama)) kategori = 'sembako';
  if (/dishwash|perfume|body wash|deodorant|facial|hair |body (?:foam|talc|moustur)|floor cleaner|window cleaner|fabric softener|cotton bud|mouth wash|sponge scrubber|brightening/i.test(p.l4_nm || '')) kategori = 'kebersihan';
  if (/ice cream/i.test(p.l4_nm || '')) kategori = 'susu';
  if (/pure honey|canned fish|offal|fruit cocktail/i.test(p.l4_nm || '')) kategori = 'sembako';
  if (/creme filled|breath fresheners|malkist/i.test(p.l4_nm || '')) kategori = 'snack';
  if (/^(mineral|fruit powder)$/i.test(p.l4_nm || '')) kategori = 'minuman';
  if (/^M S G$/i.test(p.l4_nm || '')) kategori = 'bumbu';
  if (kategori === 'lainnya' && /body care|skin care|oral|laundry|sanitary|diaper|shaving|cleaning|disinfectant/i.test(p.l4_nm || '')) kategori = 'kebersihan';
  const ukuran = nama.match(/\b\d+(?:[.,]\d+)?\s*(?:kg|gr|gram|g|ml|lt|ltr|liter|l)\b/i)?.[0] || null;
  return { kunci: kunciBarang({ nama }), nama, barcode: null, merek: null, kategori,
    ukuran, satuan: /\/\s*KG\s*$/i.test(nama) ? 'kg' : 'pcs', foto_url: null, sumber: 'lotte', sumber_id: p.prod_cd,
    kategori_sumber: p.l4_nm || null,
    sumber_url: `https://order.lottemart.co.id/product/${p.slug}/lotte-grosir-jatake`,
    halaman_bukti: halaman };
}
