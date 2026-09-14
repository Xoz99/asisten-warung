import { perangkatIOS } from './mic';
import { terpasangSebagaiApp } from './pwa';

// Langkah membuka kembali izin kamera/mikrofon yang TERLANJUR DIBLOKIR - dibedain per perangkat.
//
// KENAPA NGGAK LANGSUNG DILEMPAR KE HALAMAN SETELANNYA: nggak bisa, dan itu disengaja sama
// browsernya. Halaman web dilarang keras membuka setelan sistem/browser - `chrome://settings`,
// `App-Prefs:`, `prefs:root=` semuanya diblokir kalau dipanggil dari halaman web (dulu bisa,
// ditutup karena dipakai situs jahat buat ngerjain orang). Nggak ada jalan memutarnya, termasuk
// buat aplikasi yang udah dipasang ke layar HP - dia tetap halaman web di mata browser.
//
// Jadi yang bisa dibenerin bukan "lompatnya", tapi AMBIGUnya: daripada satu kalimat umum
// ("buka pengaturan browser") yang nyuruh orang nyari sendiri di menu yang beda-beda tiap HP,
// di sini disebutin nama menunya persis, urut, buat perangkat yang lagi dipakai.
//
// Sekali izin diblokir, dialognya NGGAK akan nongol lagi sendiri - makanya nggak ada gunanya
// nyuruh "coba lagi" tanpa nunjukin tempat setelannya duluan.
function androidKah() {
  return typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
}

export function panduanIzin() {
  const terpasang = terpasangSebagaiApp();

  if (perangkatIOS()) {
    if (terpasang) {
      // iPhone nyimpen izin aplikasi-layar-HP terpisah dari Safari, dan NGGAK nyediain menu buat
      // ngebalikinnya setelah ditolak. Pasang ulang itu satu-satunya cara yang pasti berhasil -
      // jadi itu yang ditaruh paling depan, bukan nyuruh nyari menu yang mungkin nggak ada.
      return {
        judul: 'Izinkan mikrofon di iPhone',
        pembuka: 'Aplikasi yang dipasang di layar HP nyimpen izinnya sendiri, dan iPhone nggak punya menu buat ngebalikin izin yang udah ditolak. Cara yang pasti berhasil:',
        langkah: [
          'Tahan ikon Warung Pintar di layar HP, pilih Hapus Aplikasi.',
          'Buka lagi lewat Safari, terus pasang ulang lewat tombol Bagikan > Tambah ke Layar Utama.',
          'Waktu tombol suara ditekan pertama kali, pilih Izinkan.',
        ],
        catatan: 'Data warungmu aman - semuanya tersimpan di server, bukan di ikonnya.',
      };
    }
    return {
      judul: 'Izinkan mikrofon di Safari',
      pembuka: 'Pilih salah satu, dua-duanya sama aja hasilnya:',
      langkah: [
        'Tap tombol aA di kiri kolom alamat > Setelan Situs Web > Mikrofon > Izinkan.',
        'Atau: Pengaturan HP > Safari > Mikrofon > cari situs ini > Izinkan.',
        'Balik ke sini, terus tap Sudah, cek lagi.',
      ],
    };
  }

  if (androidKah()) {
    if (terpasang) {
      // PWA yang dipasang Chrome muncul sebagai aplikasi sendiri di daftar aplikasi Android,
      // lengkap sama halaman Izin-nya. Nggak ada address bar di sini, jadi jalur ikon gembok
      // yang biasa dipakai di tab browser nggak berlaku.
      return {
        judul: 'Izinkan mikrofon & kamera',
        pembuka: 'Aplikasi ini kepasang sebagai aplikasi sendiri, jadi izinnya diatur dari setelan HP:',
        langkah: [
          'Buka Setelan HP > Aplikasi.',
          'Cari Warung Pintar di daftarnya.',
          'Masuk ke Izin > Mikrofon (dan Kamera) > pilih Izinkan.',
          'Balik ke sini, terus tap Sudah, cek lagi.',
        ],
        catatan: 'Bisa juga dengan menahan ikon Warung Pintar di layar HP, lalu pilih Info aplikasi.',
      };
    }
    return {
      judul: 'Izinkan mikrofon & kamera',
      pembuka: 'Lewat kolom alamat di atas layar:',
      langkah: [
        'Tap ikon gembok (atau ikon geser) di kiri alamat situs.',
        'Pilih Izin.',
        'Nyalakan Mikrofon dan Kamera.',
        'Balik ke sini, terus tap Sudah, cek lagi.',
      ],
    };
  }

  return {
    judul: 'Izinkan mikrofon & kamera',
    pembuka: 'Lewat kolom alamat browser:',
    langkah: [
      'Klik ikon gembok (atau ikon geser) di kiri alamat situs.',
      'Cari Mikrofon dan Kamera, ubah jadi Izinkan.',
      'Muat ulang halamannya.',
    ],
  };
}
