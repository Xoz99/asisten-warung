// Rumus harga jual warung - SATU-SATUNYA tempat aturan ini ditulis.
//
// Dulu cuma hidup sebagai satu baris di dalam sheet detail stok (SheetOpname di Stok.jsx), jadi
// bagian lain yang butuh nyaranin harga - terutama usulan borongan dari Mang AI - nggak ikut
// aturan yang sama & malah ngeluarin harga jual kosong. Dipindah ke sini biar dipakai bareng.
//
// Ini MARGIN, bukan markup: margin dihitung dari HARGA JUAL (untung / harga), bukan dari modal.
// Jadi modal 8.000 dengan margin 30% itu harga jualnya 8.000 / 0,7 = 11.429 (dibulatkan 11.500),
// BUKAN 8.000 x 1,3 = 10.400. Beda ini penting: pakai rumus markup, margin aslinya cuma 23% dan
// untung warung ketipisan dari yang dikira.
export const MARGIN_REKOMENDASI = [25, 30, 35, 40];

// Dipakai kalau harga jualnya harus ditebak otomatis (usulan AI). Diambil dari tengah rentang
// yang di detail stok dilabeli "Margin sehat untuk warung" (25%-45%).
export const MARGIN_DEFAULT = 30;

// modal -> harga jual, dibulatkan KE ATAS per Rp100 biar angkanya enak diucapkan di warung
// (11.429 jadi 11.500, bukan 11.429 yang nggak ada receh-nya).
export function hargaDariMargin(modal, marginPersen = MARGIN_DEFAULT) {
  const m = Number(modal);
  const p = Number(marginPersen);
  if (!Number.isFinite(m) || m <= 0) return 0;
  if (!Number.isFinite(p) || p <= 0 || p >= 100) return 0;
  return Math.ceil(m / (1 - p / 100) / 100) * 100;
}

// Kebalikannya: harga jual -> modal. Dipakai buat NAMBAL usulan AI yang modalnya kosong tapi
// harganya keisi - kejadian di jalur OpenRouter, yang beda dari Gemini nggak bisa dipaksa lewat
// skema JSON, jadi field-nya gampang kelewat. Tanpa ini kartunya nampilin "modal kepakai Rp 0"
// dan user nggak punya pegangan sama sekali buat ngira-ngira belanjaannya.
export function modalDariHarga(harga, marginPersen = MARGIN_DEFAULT) {
  const h = Number(harga);
  const p = Number(marginPersen);
  if (!Number.isFinite(h) || h <= 0) return 0;
  if (!Number.isFinite(p) || p <= 0 || p >= 100) return 0;
  return Math.round((h * (1 - p / 100)) / 100) * 100;
}
