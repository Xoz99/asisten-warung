// Deteksi "aplikasi ini lagi dibuka SEBAGAI aplikasi terpasang, bukan sebagai tab browser".
//
// Dipisah jadi berkas sendiri karena dipakai buat dua urusan yang beda jauh - nyembunyiin tombol
// "Pasang aplikasi" (Lainnya.jsx) & milih kalimat yang bener waktu izin kamera/mic diblokir
// (lib/mic.js) - dan dua-duanya pernah salah gara-gara cuma ngecek 'standalone' doang.
//
// TIGA mode yang semuanya berarti "udah kepasang", bukan cuma standalone:
//   fullscreen  - dipakai manifest aplikasi ini sekarang (status bar HP ikut disembunyiin)
//   standalone  - mode lama; masih kepakai sebagai cadangan di display_override
//   minimal-ui  - cadangan terakhir; sebagian browser Android jatuh ke sini
// Waktu manifest-nya diubah dari standalone ke fullscreen, pengecekan yang cuma nyari
// '(display-mode: standalone)' mendadak balikin false di HP yang aplikasinya JELAS-JELAS udah
// kepasang - tombol "Pasang aplikasi di HP" nongol lagi di aplikasi yang udah terpasang.
const MODE_TERPASANG = ['fullscreen', 'standalone', 'minimal-ui'];

export function terpasangSebagaiApp() {
  if (typeof window === 'undefined') return false;
  const cocok = MODE_TERPASANG.some((m) => window.matchMedia?.(`(display-mode: ${m})`)?.matches);
  // Safari iOS nggak ngedukung media query display-mode buat ini - dia punya properti sendiri
  // yang non-standar (navigator.standalone), jadi harus dicek terpisah.
  return cocok || navigator.standalone === true;
}
