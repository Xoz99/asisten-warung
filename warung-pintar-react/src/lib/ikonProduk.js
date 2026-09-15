// Ikon barang buat yang BELUM punya foto. Dulu cuma ada 9 ikon yang nempel ke id barang contoh (mie, teh, dst) -
// barang beneran selalu jatuh ke ikon kotak yang sama, jadi daftar Stok isinya kotak semua.
//
// Sekarang: pemilik bisa milih ikon per barang (disimpan di kolom produk.ikon), dan barang yang belum dipilih
// ikonnya DITEBAK dari nama/kategorinya ("Aqua 600ml" -> botol, "Evo biru" -> rokok).
// Gaya ikonnya garis (stroke), sama kayak ikon lain di aplikasi - warnanya ngikut tema lewat currentColor.
const svg = (isi) => `<svg viewBox="0 0 24 24">${isi}</svg>`;

export const IKON_PRODUK = {
  // --- Minuman
  botol: { label: 'Air botol', svg: svg('<path d="M10 2.5h4v2.2l1.6 2.3v12.5a2 2 0 0 1-2 2h-3.2a2 2 0 0 1-2-2V7l1.6-2.3Z"/><path d="M8.4 11h7.2M8.4 15.5h7.2"/>') },
  teh: { label: 'Gelas / teh', svg: svg('<path d="M6 8h12l-1.2 11.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8Z"/><path d="M9 8V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V8M15 3v3"/>') },
  kopi: { label: 'Kopi', svg: svg('<path d="M5 9h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4Z"/><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M9 6c0-.8.6-1 .6-1.8S9 3 9 3M12.5 6c0-.8.6-1 .6-1.8S12.5 3 12.5 3"/>') },
  kaleng: { label: 'Kaleng', svg: svg('<rect x="7" y="4" width="10" height="16.5" rx="2"/><path d="M7 7.5h10M7 17h10M11 2.5h2"/>') },
  susu: { label: 'Susu', svg: svg('<path d="M8 8.5 10 4h4l2 4.5V20a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1Z"/><path d="M8 8.5h8M10 4l-.8-1.5h5.6L14 4"/><path d="M10.5 14a1.5 1.5 0 0 0 3 0c0-1-1.5-2.5-1.5-2.5s-1.5 1.5-1.5 2.5Z"/>') },
  galon: { label: 'Galon', svg: svg('<path d="M9.5 2.5h5V5h-5z"/><path d="M8 5h8l1.5 2.5V19a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2V7.5Z"/><path d="M6.5 11h11M6.5 15h11"/>') },
  eskrim: { label: 'Es krim', svg: svg('<path d="M8 10.5a4 4 0 1 1 8 0Z"/><path d="M8 10.5 12 21l4-10.5"/><path d="M10 14.5h4"/>') },

  // --- Makanan & sembako
  mie: { label: 'Mie', svg: svg('<path d="M4 12h16a8 8 0 0 1-16 0Z"/><path d="M6.5 12c.4-2 .9-3 .8-5M12 12c.4-2.5.8-4 .3-6M17.5 12c-.3-2 .2-3 .7-4.5"/>') },
  beras: { label: 'Beras', svg: svg('<path d="M8.5 4h7l1 4.5-1.2 11a2 2 0 0 1-2 1.8h-2.6a2 2 0 0 1-2-1.8l-1.2-11Z"/><path d="M9.5 4c0-1.2.9-2 2.5-2s2.5.8 2.5 2"/>') },
  telur: { label: 'Telur', svg: svg('<path d="M12 3c3.5 4 6 8.3 6 11.5a6 6 0 0 1-12 0C6 11.3 8.5 7 12 3Z"/>') },
  minyak: { label: 'Minyak', svg: svg('<path d="M9 3h6v3.2l1.5 1.8v11a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2v-11L9 6.2Z"/><path d="M9 10h6"/>') },
  gula: { label: 'Gula / garam', svg: svg('<rect x="6" y="7" width="12" height="14" rx="3"/><path d="M8 7V4.5h8V7"/><path d="M9 12h6"/>') },
  bumbu: { label: 'Bumbu', svg: svg('<path d="M6 4h12v16H6z"/><path d="M6 7h12M6 17h12"/><path d="M9.5 12h.01M12 11h.01M14.5 12.5h.01M11 14h.01"/>') },
  roti: { label: 'Roti', svg: svg('<path d="M4 12a8 4 0 0 1 16 0v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><path d="M9 10.5v8.5M14 10.5v8.5"/>') },
  kue: { label: 'Kue', svg: svg('<path d="M4 20h16M5 20v-6h14v6"/><path d="M5 14c1.5 1.2 3 1.2 4.7 0 1.5 1.2 3 1.2 4.6 0 1.6 1.2 3.2 1.2 4.7 0"/><path d="M12 14V9.5M12 7.5v-.01"/>') },
  snack: { label: 'Snack', svg: svg('<path d="M6 3.5c2 .8 10 .8 12 0l-1 8.5 1 8.5c-2-.8-10-.8-12 0l1-8.5Z"/><path d="m9.5 12.5 1.5-2 2 3 1.5-2.5"/>') },
  biskuit: { label: 'Biskuit', svg: svg('<circle cx="12" cy="12" r="8"/><path d="M9 9h.01M14.5 8.5h.01M9.5 14.5h.01M15 14h.01M12 12h.01"/>') },
  permen: { label: 'Permen', svg: svg('<ellipse cx="12" cy="12" rx="4.5" ry="3.2"/><path d="M7.5 12 4 9v6ZM16.5 12 20 9v6Z"/>') },
  cokelat: { label: 'Cokelat', svg: svg('<rect x="6.5" y="3" width="11" height="18" rx="1.5"/><path d="M6.5 9h11M6.5 15h11M12 3v18"/>') },
  frozen: { label: 'Frozen', svg: svg('<rect x="4" y="6" width="16" height="13" rx="2"/><path d="M12 9v7M9 10.5l6 4M15 10.5l-6 4"/>') },
  ayam: { label: 'Ayam / daging', svg: svg('<path d="M15 13.5a5 5 0 1 0-4.5-4.5c.3 1.3 0 2.6-1 3.5L6.5 16"/><path d="M6.5 16a1.8 1.8 0 1 0-2.4 2 1.8 1.8 0 1 0 2.4 2"/>') },
  ikan: { label: 'Ikan', svg: svg('<path d="M3 12c3-4.5 9-6 14-2l4-3v10l-4-3c-5 4-11 2.5-14-2Z"/><path d="M8 11h.01"/>') },
  sayur: { label: 'Sayur', svg: svg('<path d="M14 7.5 5 19.5l12-9a3.5 3.5 0 0 0-3-3Z"/><path d="M15 7c.2-2 1.2-3.5 3-4M17 9c2-.2 3.5-1.2 4-3M9.5 14l1.5 1.5M12 11l1 1"/>') },
  buah: { label: 'Buah', svg: svg('<path d="M12 7.5c-1.5-1-5.5-1.2-6.5 2.5-1 4 1.5 10.5 4.5 10.5 1 0 1.3-.5 2-.5s1 .5 2 .5c3 0 5.5-6.5 4.5-10.5-1-3.7-5-3.5-6.5-2.5Z"/><path d="M12 7.5c0-2 1-3.5 3-4"/>') },

  // --- Rokok
  rokok: { label: 'Rokok', svg: svg('<rect x="2.5" y="13" width="17" height="4" rx="1"/><path d="M15 13v4"/><path d="M19 10.5c0-1.3 1.3-1.5 1.3-2.8S19 6 19 4.8M21.5 10.5c0-1 .5-1.4.5-2.2"/>') },
  korek: { label: 'Korek', svg: svg('<rect x="7" y="9" width="10" height="12" rx="2"/><path d="M7 12.5h10"/><path d="M12 9V7.2M12 6.5c-1.3-1-1.3-2.5 0-4 1.3 1.5 1.3 3 0 4Z"/>') },

  // --- Kebersihan & bayi
  sabun: { label: 'Sabun', svg: svg('<rect x="4" y="8" width="16" height="9" rx="4.5"/><path d="M8 12.2c0-1 .8-1.8 2-1.8h4c1.2 0 2 .8 2 1.8"/>') },
  sampo: { label: 'Sampo', svg: svg('<path d="M8 10h8v9.5a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 8 19.5Z"/><path d="M10.5 10V7h3v3M12 7V4.5h3.5"/><path d="M10.5 14.5h3"/>') },
  detergen: { label: 'Detergen', svg: svg('<rect x="5" y="6" width="14" height="15" rx="1.5"/><path d="M5 10h14"/><circle cx="12" cy="15" r="2.5"/><path d="M9 6V3.5h6V6"/>') },
  pastagigi: { label: 'Pasta gigi', svg: svg('<path d="M4 9.5h11l4.5 1.5v2L15 14.5H4Z"/><path d="M19.5 11v2M7 9.5v5"/>') },
  tisu: { label: 'Tisu', svg: svg('<path d="M4 11h16v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z"/><path d="M8.5 11c-.5-2.5 1-5 3.5-7 2.5 2 4 4.5 3.5 7"/>') },
  bayi: { label: 'Bayi / popok', svg: svg('<circle cx="12" cy="9" r="4.5"/><path d="M6 21c.5-3.5 3-5.5 6-5.5s5.5 2 6 5.5"/><path d="M10.5 8.5h.01M13.5 8.5h.01"/>') },
  nyamuk: { label: 'Obat nyamuk', svg: svg('<path d="M12 12a1 1 0 1 1 1 1 3 3 0 1 1-3-3 5 5 0 1 1 5 5 7 7 0 1 1-7-7"/>') },

  // --- Lainnya
  obat: { label: 'Obat', svg: svg('<rect x="3.5" y="9" width="17" height="6" rx="3" transform="rotate(-45 12 12)"/><path d="m9.2 9.2 5.6 5.6"/>') },
  gas: { label: 'Gas LPG', svg: svg('<path d="M9 3.5h6V6H9z"/><path d="M6.5 9a3 3 0 0 1 3-3h5a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-5a3 3 0 0 1-3-3Z"/><path d="M6.5 12h11"/>') },
  bensin: { label: 'Bensin / oli', svg: svg('<path d="M7 5h7l4 4v11a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/><path d="M9 5V3h4M9.5 11l5 5M14.5 11l-5 5"/>') },
  pulsa: { label: 'Pulsa / kuota', svg: svg('<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>') },
  listrik: { label: 'Token listrik', svg: svg('<path d="M13 2.5 5.5 13.5H11l-1 8 7.5-11H12Z"/>') },
  baterai: { label: 'Baterai', svg: svg('<rect x="7.5" y="5" width="9" height="16" rx="2"/><path d="M10.5 5V2.5h3V5M12 10.5v5M9.5 13h5"/>') },
  kantong: { label: 'Kantong plastik', svg: svg('<path d="M6 8h12l1 12.5H5Z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>') },
  alattulis: { label: 'Alat tulis', svg: svg('<path d="M15.5 4.5 19.5 8.5 9 19H5v-4Z"/><path d="m13.5 6.5 4 4"/>') },
  default: { label: 'Barang umum', svg: svg('<path d="M3.5 8 12 4l8.5 4-8.5 4-8.5-4Z"/><path d="M3.5 8v8.5L12 20l8.5-3.5V8"/><path d="M12 12v8"/>') },
};

// Urutan tampil di pemilih ikon (layar edit barang).
export const GRUP_IKON = [
  { nama: 'Minuman', kunci: ['botol', 'teh', 'kopi', 'kaleng', 'susu', 'galon', 'eskrim'] },
  {
    nama: 'Makanan & sembako',
    kunci: ['mie', 'beras', 'telur', 'minyak', 'gula', 'bumbu', 'roti', 'kue', 'snack', 'biskuit', 'permen', 'cokelat', 'frozen', 'ayam', 'ikan', 'sayur', 'buah'],
  },
  { nama: 'Rokok', kunci: ['rokok', 'korek'] },
  { nama: 'Kebersihan & bayi', kunci: ['sabun', 'sampo', 'detergen', 'pastagigi', 'tisu', 'bayi', 'nyamuk'] },
  { nama: 'Lainnya', kunci: ['obat', 'gas', 'bensin', 'pulsa', 'listrik', 'baterai', 'kantong', 'alattulis', 'default'] },
];

// Tebakan dari nama barang - URUTAN PENTING, yang lebih spesifik ditaruh duluan:
//  - es krim sebelum rokok ("Magnum" di warung itu rokok, "es krim Magnum" itu es krim)
//  - permen sebelum kopi ("Kopiko"), obat sebelum minyak ("minyak kayu putih"), sampo sebelum sabun ("Lifebuoy shampoo")
//  - botol (pola "600ml") paling belakang di minuman, biar "susu Ultra 250ml" tetap jadi susu
const ATURAN_TEBAK = [
  ['eskrim', /es ?krim|ice cream|walls|aice|campina/],
  ['rokok', /rokok|sampoerna|gudang garam|djarum|surya|magnum|marlboro|\bevo\b|esse|dunhill|kretek|filter|lucky strike|camel|\bla bold|\bla light|sukun|wismilak|\bdji sam soe|u ?mild|a ?mild/],
  ['korek', /korek|mancis|tokai/],
  ['permen', /permen|kopiko|relaxa|mentos|yupi|hexos|\bkiss\b|candy|lolipop|milkita/],
  ['cokelat', /coklat|cokelat|silver ?queen|chocolatos|delfi|beng ?beng|choco|top\b/],
  ['obat', /obat|promag|paramex|bodrex|panadol|mixagrip|decolgen|antangin|tolak angin|konidin|oskadon|komix|vitamin|salonpas|entrostop|diapet|insto|kayu putih|balsem|tablet|kapsul|sirup|puyer|neozep|procold|ultraflu|sanmol/],
  ['nyamuk', /nyamuk|baygon|\bhit\b|vape|autan|soffell|sofell|lavenda|\braid\b|domestos/],
  ['kopi', /kopi|kapal api|good ?day|nescafe|luwak|torabika|white coffee|coffee|abc susu/],
  ['teh', /\bteh\b|\btea\b|sosro|pucuk|frestea|fruit tea|sariwangi|tong tji|teh gelas|gelas/],
  ['susu', /susu|milk|ultra ?milk|frisian|bear brand|dancow|indomilk|yakult|milo|cimory|oat/],
  ['kaleng', /kaleng|coca|cola|fanta|sprite|pepsi|green sands|kratingdaeng|cap badak|larutan|bir\b/],
  ['galon', /galon/],
  ['botol', /aqua|le ?minerale|air mineral|botol|\bclub\b|ades|mizone|pocari|isotonik|nutri ?boost|floridina|\d+ ?ml\b/],
  ['mie', /\bmie\b|\bmi\b|mi instan|indomie|sarimi|supermi|sedaap|pop ?mie|bihun|kwetiau|soun/],
  ['beras', /beras|ketan|rojolele|pandan wangi|ramos|setra/],
  ['telur', /telur|telor/],
  ['sampo', /sampo|shampo|sunsilk|clear\b|pantene|dove|emeron|head ?& ?shoulders|zinc/],
  ['minyak', /minyak|bimoli|sania|filma|sunco|tropical|fortune/],
  ['gula', /gula|garam|gulaku/],
  ['bumbu', /bumbu|masako|royco|kecap|saos|saus|sambal|terasi|micin|sasa|ajinomoto|merica|ladaku|bango|desaku|santan|kara\b|tepung/],
  ['roti', /roti|sari roti|bread|burger/],
  ['kue', /\bkue\b|bolu|donat|brownies|lapis/],
  ['snack', /chitato|\btaro\b|keripik|kripik|chiki|qtela|snack|lays|piattos|jetz|momogi|kacang|pilus|basreng|makaroni|seblak|kerupuk|krupuk/],
  ['biskuit', /biskuit|biscuit|\broma\b|oreo|khong guan|malkist|wafer|tango|nabati|regal|marie|slai|better|gery/],
  ['frozen', /nugget|sosis|frozen|so good|fiesta|bakso|kornet/],
  ['ikan', /ikan|sarden|\bteri\b|tuna|pronas|cumi|udang/],
  ['ayam', /ayam|daging|sapi|kambing/],
  ['sayur', /sayur|wortel|\bkol\b|bayam|kangkung|tomat|cabai|cabe|bawang|kentang|jagung|timun/],
  ['buah', /buah|apel|jeruk|pisang|mangga|semangka|melon|anggur/],
  ['sabun', /sabun|lifebuoy|\blux\b|\bgiv\b|nuvo|dettol|shinzui|cussons|biore|harmony/],
  ['detergen', /detergen|deterjen|rinso|so ?klin|daia|attack|\bboom\b|sunlight|mama lemon|molto|downy|superpell|wipol|bayclin|vixal|pewangi|pembersih|sabun cuci/],
  ['pastagigi', /pasta gigi|odol|pepsodent|ciptadent|close ?up|formula|sensodyne|sikat gigi/],
  ['tisu', /tisu|tissue|paseo|\bnice\b|multi\b/],
  ['bayi', /popok|pampers|mamy ?poko|sweety|merries|pembalut|softex|charm|laurier|bayi|\bbaby\b/],
  ['gas', /\bgas\b|lpg|elpiji|bright gas/],
  ['bensin', /bensin|pertalite|pertamax|\bsolar\b|\boli\b/],
  ['listrik', /token|listrik|\bpln\b/],
  ['pulsa', /pulsa|kuota|voucher|perdana|telkomsel|indosat|\bxl\b|\btri\b|axis|smartfren|by\.u/],
  ['baterai', /baterai|battery|alkaline|energizer/],
  ['kantong', /kantong|kresek|plastik/],
  ['alattulis', /pensil|pulpen|bolpoin|buku tulis|penghapus|spidol|\blem\b|isolasi|kertas|map\b/],
];

const TEBAK_KATEGORI = [
  ['minuman', 'botol'],
  ['rokok', 'rokok'],
  ['snack', 'snack'],
  ['makanan', 'snack'],
  ['obat', 'obat'],
  ['sabun', 'sabun'],
  ['kebersihan', 'sabun'],
];

export function tebakIkon(nama, kategori) {
  const teks = String(nama || '').toLowerCase();
  for (const [kunci, pola] of ATURAN_TEBAK) if (pola.test(teks)) return kunci;
  const kat = String(kategori || '').toLowerCase();
  for (const [kata, kunci] of TEBAK_KATEGORI) if (kat.includes(kata)) return kunci;
  return 'default';
}

export const ikonValid = (kunci) => Boolean(kunci && IKON_PRODUK[kunci]);

// Cari data barang dari id-nya, dipakai ProductIcon (dipanggil puluhan kali per layar). Peta dibikin sekali per
// daftar produk (S.produk ganti = array baru), bukan nyari satu-satu tiap ikon.
const petaCache = new WeakMap();
export function cariProduk(daftar, id) {
  if (!daftar || id == null) return null;
  let peta = petaCache.get(daftar);
  if (!peta) {
    peta = new Map(daftar.map((p) => [p.id, p]));
    petaCache.set(daftar, peta);
  }
  return peta.get(id) || null;
}
