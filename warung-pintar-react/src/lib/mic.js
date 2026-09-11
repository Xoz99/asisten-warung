// Hal-hal kecil soal mikrofon yang dipakai DI LEBIH DARI SATU layar (Catat "Sebut barang" &
// dikte suara di chat Mang AI). Sengaja cuma yang murni fungsi tanpa state - sesi
// SpeechRecognition-nya sendiri tetap diurus masing-masing layar, soalnya kebutuhannya beda
// jauh: Catat butuh sheet + parse nama barang/qty, chat cuma butuh teksnya masuk ke kotak ketik.

// Semua browser di iOS/iPadOS (Safari, Chrome, dst) WAJIB pakai mesin WebKit-nya Apple
// (kebijakan App Store) - jadi keterbatasan WebKit soal mic kena ke SEMUANYA, bukan Safari doang.
export function perangkatIOS() {
  if (typeof navigator === 'undefined') return false;
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return true;
  // iPadOS 13+ nyamar jadi "Mac" di user-agent, dibedain dari Mac beneran lewat touch support.
  return /macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
}

// Dibuka dari ikon layar HP (PWA standalone), bukan dari tab browser biasa.
export function modeStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)')?.matches || navigator.standalone === true;
}

// Pesan buat error izin mic ('not-allowed' / 'service-not-allowed'). DIBEDAIN PER PLATFORM karena
// penyebab & cara benerinnya beda jauh - pesan generik "izinkan lewat pengaturan browser" nggak
// nolong sama sekali di iPhone, di mana menunya bahkan nggak ada di tempat yang orang cari.
//
// Kasus paling sering di iPhone: aplikasi dibuka dari ikon HOME SCREEN (mode standalone). Di situ
// Safari nggak nampilin dialog izin mikrofon sama sekali - langsung ditolak, tanpa pernah nanya.
// Satu-satunya jalan: buka lewat Safari biasa.
//
// `namaFitur` dipakai di kalimat iPhone-standalone, biar nunjuk ke tombol yang BARUSAN dipencet
// user ("Sebut barang" vs "Dikte suara") - bukan istilah umum yang harus ditebak sendiri.
// Teksnya di-HTML-escape (&gt; &amp;) karena toast() nge-render isinya sebagai HTML.
export function pesanIzinMikrofon(namaFitur = 'Mikrofon') {
  if (perangkatIOS()) {
    if (modeStandalone()) {
      return `Di iPhone, ${namaFitur} belum bisa dipakai dari ikon layar HP. Buka lewat Safari, atau ketik manual.`;
    }
    return 'Mikrofon ditolak. Cek Pengaturan &gt; Safari &gt; Mikrofon, dan pastikan Siri &amp; Dikte aktif.';
  }
  return 'Akses mikrofon ditolak. Tap ikon gembok di address bar &gt; izinkan Mikrofon.';
}
