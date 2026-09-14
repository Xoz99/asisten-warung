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

// Browser yang dipakai buat masang aplikasinya. Aplikasi terpasang di Android tetap bawa user agent
// browser asalnya, jadi masih bisa dibaca dari sini. Urutannya penting: user agent Samsung Internet,
// Edge & Opera juga nyantumin kata "Chrome".
function browserAndroid() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
  if (/EdgA/i.test(ua)) return 'Microsoft Edge';
  if (/OPR\/|Opera/i.test(ua)) return 'Opera';
  if (/Firefox/i.test(ua)) return 'Firefox';
  return 'Chrome';
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
    const situs = typeof location !== 'undefined' ? location.hostname : 'situs Warung Pintar';
    if (terpasang) {
      const browser = browserAndroid();
      if (browser !== 'Chrome') {
        return {
          judul: 'Izinkan mikrofon & kamera',
          pembuka: `Aplikasi ini dipasang lewat ${browser}, jadi izinnya dipegang ${browser} - bukan sama ikon Warung Pintar-nya:`,
          langkah: [
            `Buka aplikasi ${browser} (bukan Warung Pintar).`,
            `Masuk ke setelan situs / izin situs, cari ${situs}.`,
            'Ubah Kamera dan Mikrofon jadi Izinkan.',
            'Balik ke Warung Pintar, terus tap Sudah, cek lagi.',
          ],
        };
      }
      // SALAH di versi sebelumnya: dulu nyuruh ke Setelan HP > Aplikasi > Warung Pintar > Izin.
      // Aplikasi yang dipasang dari Chrome (WebAPK) NGGAK megang izin kamera/mikrofon sendiri -
      // halaman Info aplikasinya bilang "Tidak ada izin yang diminta" & menunya abu-abu (kejadian
      // beneran di HP pemilik). Izinnya dipegang CHROME, per situs. Jadi ada dua lapis:
      //   1. izin situs di Chrome buat domain ini (ini yang paling sering keblokir)
      //   2. izin Android buat aplikasi Chrome-nya sendiri (kalau Chrome pernah ditolak akses kamera)
      // Nama situs ditulis persis dari location.hostname biar nggak nyari-nyari di daftar.
      return {
        judul: 'Izinkan mikrofon & kamera',
        pembuka: 'Aplikasi ini dipasang lewat Chrome, jadi izinnya dipegang Chrome - bukan di Info aplikasi Warung Pintar. Caranya:',
        langkah: [
          'Buka aplikasi Chrome (bukan Warung Pintar).',
          'Tap titik tiga di pojok kanan atas > Setelan > Setelan situs > Semua situs.',
          `Pilih ${situs}.`,
          'Ubah Kamera dan Mikrofon jadi Izinkan.',
          'Balik ke Warung Pintar, terus tap Sudah, cek lagi.',
        ],
        catatan:
          'Masih diblokir? Berarti Chrome-nya sendiri yang belum dikasih izin: Setelan HP > Aplikasi > Chrome > Izin > nyalakan Kamera dan Mikrofon.',
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
