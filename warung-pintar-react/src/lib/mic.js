// Hal-hal kecil soal mikrofon yang dipakai DI LEBIH DARI SATU layar (Catat "Sebut barang" &
// dikte suara di chat Mang AI). Sengaja cuma yang murni fungsi tanpa state - sesi
// SpeechRecognition-nya sendiri tetap diurus masing-masing layar, soalnya kebutuhannya beda
// jauh: Catat butuh sheet + parse nama barang/qty, chat cuma butuh teksnya masuk ke kotak ketik.

import { terpasangSebagaiApp } from './pwa';

// Semua browser di iOS/iPadOS (Safari, Chrome, dst) WAJIB pakai mesin WebKit-nya Apple
// (kebijakan App Store) - jadi keterbatasan WebKit soal mic kena ke SEMUANYA, bukan Safari doang.
export function perangkatIOS() {
  if (typeof navigator === 'undefined') return false;
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return true;
  // iPadOS 13+ nyamar jadi "Mac" di user-agent, dibedain dari Mac beneran lewat touch support.
  return /macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
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
    if (terpasangSebagaiApp()) {
      return `Di iPhone, ${namaFitur} belum bisa dipakai dari ikon layar HP. Buka lewat Safari, atau ketik manual.`;
    }
    return 'Mikrofon ditolak. Cek Pengaturan &gt; Safari &gt; Mikrofon, dan pastikan Siri &amp; Dikte aktif.';
  }
  return 'Akses mikrofon ditolak. Tap ikon gembok di address bar &gt; izinkan Mikrofon.';
}

// Pesan buat izin kamera+mikrofon yang UDAH TERLANJUR DIBLOKIR. Dipisah dari
// pesanIzinMikrofon() di atas: yang itu khusus fitur suara, dan cabang iPhone-standalone-nya
// bilang "belum bisa dipakai dari ikon layar HP" - itu bener buat dikte suara (WebKit emang
// nggak ngasih SpeechRecognition jalan di mode standalone), tapi SALAH buat kamera, yang
// sebenernya jalan normal di sana.
//
// Yang dituju cuma satu: kasih jalan keluar yang beneran ada di perangkatnya. Sekali izin
// diblokir, dialognya nggak akan nongol lagi sendiri - jadi kalimat "coba lagi ya" nggak ada
// gunanya, harus nunjuk ke tempat setelannya.
export function pesanIzinMedia() {
  const standalone = terpasangSebagaiApp();
  if (perangkatIOS()) {
    // Di iPhone, aplikasi yang dipasang ke layar HP nyimpen izinnya sendiri, dan nggak ada menu
    // setelan yang jelas buat ngebalikin - jalan yang PASTI berhasil itu pasang ulang ikonnya,
    // jadi itu yang disaranin (bukan nyuruh nyari menu yang mungkin nggak ada di iOS-nya dia).
    if (standalone) return 'Izinnya lagi diblokir. Paling gampang: hapus ikon Warung Pintar dari layar HP, terus pasang lagi - nanti ditanya ulang.';
    return 'Izinnya diblokir. Buka Pengaturan &gt; Safari &gt; Kamera &amp; Mikrofon, ubah jadi Tanya/Izinkan.';
  }
  // Android yang UDAH kepasang jadi aplikasi nggak punya address bar, jadi nggak ada ikon
  // gembok buat di-tap - setelannya pindah ke info aplikasi punya HP-nya.
  if (standalone) return 'Izinnya diblokir. Buka setelan HP &gt; Aplikasi &gt; Warung Pintar &gt; Izin, nyalain Kamera &amp; Mikrofon.';
  return 'Izinnya diblokir. Tap ikon gembok di address bar &gt; izinkan Kamera &amp; Mikrofon.';
}
