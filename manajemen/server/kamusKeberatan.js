// Isi awal kamus contekan (bank keberatan) Sales Lapangan. Dimasukin SEKALI ke mj_keberatan (lihat lapangan.routes.js,
// penanda 'kamus-keberatan-v1' di mj_seed) - setelah itu admin yang ngurus lewat halaman Sales Lapangan > Bank keberatan.
//
// Aturan isi "fakta": cuma fitur yang beneran ada di Asisten Warung (dicek dari kode warung-pintar-*, Sep 2026):
// data di akun (server), daftar penjaga + serah terima jaga, scan barcode, catat pakai suara, foto nota belanja,
// stok sebentar lagi habis (dari kecepatan laku), stok berkurang otomatis tiap jualan, untung dihitung dari modal,
// kasbon per pelanggan + foto wajah pelanggan, struk bisa dikirim ke WhatsApp, Mang AI, dibuka dari browser (tanpa
// Play Store), bayar sekali per paket lewat Midtrans (nggak ada potong otomatis). Harga = HARGA_PLAN di
// warung-pintar-backend/src/services/midtrans.service.js.
//
// Yang NGGAK bisa dipastiin dari kode (kebijakan, pesaing, testimoni, kondisi sinyal) dimasukin sebagai draf NONAKTIF
// dengan fakta "[PERLU DIISI ADMIN]" - nggak kelihatan sales sampai admin ngisi & ngaktifin.
export const PENANDA_KAMUS = 'kamus-keberatan-v1';

// Fakta lama di baris "Kebiasaan/Buku manual" nyebut pengingat tagihan otomatis via WA - fitur itu nggak ada.
// Diganti cuma kalau teksnya masih persis sama (belum diedit admin).
export const FAKTA_LAMA_SALAH = 'Data di aplikasi tersimpan otomatis, tidak hilang/basah/robek. Ada fitur pengingat tagihan otomatis via WA.';
export const FAKTA_BUKU_BENAR =
  'Data di aplikasi tersimpan di akun: nggak hilang, basah, atau robek kayak buku. Untung hari ini langsung kelihatan tanpa rekap manual, dan kasbon tiap pelanggan kecatat lengkap dengan tanggalnya.';

const baris = (kelompok, kategori, ucapan, variasi, fakta, contoh, jangan, aktif = true) => ({
  kelompok,
  kategori,
  ucapan,
  variasi: variasi.join('\n'),
  fakta,
  contoh_jawaban: contoh,
  jangan,
  aktif,
});
const DRAF = '[PERLU DIISI ADMIN] ';

export const KAMUS = [
  // ---------- Harga ----------
  baris(
    'Harga',
    'Harga',
    'Bayar gak ini? Mahal gak?',
    ['Ini gratis nggak?', 'Berapa sebulannya?', 'Pasti mahal ya aplikasi gini'],
    'Trial gratis 7 hari. Harga paket resmi: Rp78rb/bulan, Rp210rb/3 bulan, Rp684rb/tahun, atau permanen sekali bayar.',
    'Coba dulu gratis 7 hari, Bu. Kalau cocok baru langganan: sebulan 78 ribu, atau kalau ambil setahun jadinya 57 ribu sebulan.',
    'Jangan janji diskon atau harga di luar paket resmi.'
  ),
  baris(
    'Harga',
    'Harga kemahalan',
    '78 ribu sebulan kemahalan buat warung kecil.',
    ['Sayang uangnya', 'Buat warung segini mah nggak usah bayar', 'Mending buat modal'],
    'Paket 3 bulan Rp210rb (Rp70rb/bulan). Paket setahun Rp684rb, jatuhnya Rp57rb/bulan atau kurang dari Rp2rb sehari.',
    'Kalau ambil setahun, sehari nggak sampai 2 ribu, Bu. Coba dulu 7 hari gratis, lihat sendiri untung hari ini kelihatan jelas, baru putusin.',
    'Jangan janji aplikasi pasti bikin untung naik sekian persen.'
  ),
  baris(
    'Harga',
    'Biaya tersembunyi',
    'Nanti tiba-tiba ditagih nggak? Ada biaya tersembunyi?',
    ['Takut kepotong otomatis', 'Nanti pulsanya kesedot nggak?'],
    'Selama trial nggak bayar apa-apa. Bayar cuma kalau milih paket, sekali bayar lewat aplikasi (Midtrans). Nggak ada potong otomatis: masa aktif cuma nambah kalau dibayar lagi.',
    'Nggak ada potongan otomatis, Bu. Bayarnya cuma kalau Ibu sendiri milih paket, sekali bayar. Kalau nggak diperpanjang ya berhenti aja.',
    'Jangan bilang "gratis selamanya".'
  ),

  // ---------- Kebiasaan ----------
  baris(
    'Kebiasaan',
    'Kebiasaan/Buku manual',
    'Saya sudah biasa pakai buku catatan kertas.',
    ['Buku aja cukup', 'Dari dulu nyatet di buku nggak apa-apa', 'Saya lebih enak nulis'],
    FAKTA_BUKU_BENAR,
    'Bukunya nggak usah dibuang, Bu. Coba seminggu catat di sini juga, nanti Ibu bandingin: di sini untung hari ini langsung kelihatan, nggak usah ngitung malem-malem.',
    'Jangan janji ada pengingat utang otomatis lewat WA (fiturnya belum ada).'
  ),
  baris(
    'Kebiasaan',
    'Warung kecil',
    'Warung saya kecil, nggak perlu pakai aplikasi.',
    ['Cuma warung kecil', 'Jualannya dikit kok', 'Itu buat toko gede'],
    'Kelihatan untung bersih per hari (modal tiap barang ikut dihitung) dan barang yang paling laris, jadi tahu uangnya ke mana.',
    'Justru warung kecil yang paling kerasa kalau ada uang bocor, Bu. Di sini kelihatan untung bersihnya tiap hari, bukan cuma omzet.',
    ''
  ),
  baris(
    'Kebiasaan',
    'Udah pakai kalkulator/kasir',
    'Saya udah pakai kalkulator / aplikasi kasir biasa.',
    ['Kalkulator aja cukup', 'Udah ada aplikasi kasir di HP'],
    'Bukan cuma ngitung total: untung dihitung dari modal, stok berkurang otomatis tiap jualan, dan kasbon pelanggan kecatat.',
    'Kalkulator cuma ngitung totalnya, Bu. Di sini sekali catat, stoknya langsung berkurang dan untungnya langsung ketahuan.',
    ''
  ),

  // ---------- Teknologi ----------
  baris(
    'Teknologi',
    'Gaptek/HP',
    'Saya gaptek / gak mengerti HP. (bisa jadi takut dikira bodoh/malu)',
    ['Saya nggak ngerti HP', 'Anak saya aja yang ngerti', 'Udah tua, nggak bisa beginian'],
    'Tampilan Asisten Warung dirancang sederhana: tombol besar, alur mirip kirim WA. Tim bantu setup langsung di tempat, gratis.',
    'Kalau Ibu bisa kirim WA, pasti bisa, Bu. Saya bantu pasangin sekarang, nanti saya ajarin sekali, tombolnya gede-gede.',
    'Jangan bikin pemilik warung ngerasa bodoh. Jangan langsung ngambil HP-nya tanpa izin.'
  ),
  baris(
    'Teknologi',
    'Harus belajar lama',
    'Kayaknya ribet, harus belajar lama.',
    ['Nanti bingung makenya', 'Nggak ada yang ngajarin'],
    'Tombol besar, alur mirip WA. Bingung? Bisa tanya Mang AI pakai bahasa sehari-hari, misalnya "siapa yang belum bayar utang?".',
    'Nggak usah hafalin apa-apa, Bu. Kalau bingung tinggal tanya Mang AI kayak nanya orang: "barang apa yang paling laris?".',
    ''
  ),
  baris(
    'Teknologi',
    'HP penuh / jelek',
    'HP saya udah penuh, nggak bisa install aplikasi lagi.',
    ['HP saya jelek', 'Memorinya penuh', 'Nggak bisa download'],
    'Dibuka dari browser (Chrome/Safari), nggak perlu install dari Play Store. Bisa ditaruh di layar utama HP kayak aplikasi.',
    'Nggak usah install, Bu. Dibuka dari Chrome aja, nanti saya taruh ikonnya di layar HP biar gampang dibuka.',
    'Jangan janji jalan mulus di semua HP; kalau HP-nya lemot banget, bilang jujur.'
  ),

  // ---------- Waktu & tenaga ----------
  baris(
    'Waktu & tenaga',
    'Nggak sempet ngetik',
    'Nggak sempet ngetik, pembeli lagi rame.',
    ['Repot kalau lagi rame', 'Tangan saya lagi sibuk'],
    'Catat jualan bisa scan barcode pakai kamera HP, atau ngomong pakai suara.',
    'Nggak usah ngetik, Bu. Barangnya tinggal di-scan pakai kamera, atau ngomong aja "indomie dua, kopi satu".',
    ''
  ),
  baris(
    'Waktu & tenaga',
    'Nanti aja',
    'Nanti aja deh, lagi sibuk sekarang.',
    ['Kapan-kapan aja', 'Nanti saya kabarin', 'Lagi repot'],
    'Trial gratis 7 hari. Didaftarin langsung di tempat bareng sales, nggak lama.',
    'Saya daftarin sekarang aja, Bu, sebentar kok, gratis 7 hari. Nanti Ibu coba pas lagi senggang.',
    'Jangan maksa kalau pemilik beneran lagi melayani pembeli; minta waktu balik lagi.'
  ),
  baris(
    'Waktu & tenaga',
    'Tanya keluarga dulu',
    'Saya tanya suami / istri dulu ya.',
    ['Nanti diomongin sama bapaknya', 'Saya nggak bisa mutusin sendiri'],
    'Trial gratis 7 hari bisa dicoba bareng keluarga, dan bisa daftar beberapa penjaga dalam satu warung.',
    'Boleh banget, Bu. Didaftarin dulu yang gratis 7 hari, biar Bapak bisa ikut nyobain langsung, nanti diputusin bareng.',
    ''
  ),

  // ---------- Operasional ----------
  baris(
    'Operasional',
    'Yang jaga gantian',
    'Yang jaga kadang istri, kadang anak.',
    ['Gantian jaganya', 'Saya nggak selalu di warung'],
    'Bisa daftar beberapa penjaga, dan ada serah terima jaga: tutup giliran + hitung uang laci, jadi ketahuan siapa yang jaga dan uangnya pas atau nggak.',
    'Pas banget, Bu. Tiap ganti jaga ada serah terima, jadi ketahuan uang laci pas atau kurang, nggak saling curiga.',
    ''
  ),
  baris(
    'Operasional',
    'Stok hafal',
    'Stok saya hafal kok, nggak perlu dicatat.',
    ['Saya inget barangnya', 'Kalau abis ya tinggal belanja'],
    'Ada daftar barang yang sebentar lagi habis, dihitung dari seberapa cepat barangnya laku. Stok berkurang otomatis tiap jualan.',
    'Hafal yang sering dijual iya, Bu, tapi yang jarang kadang kelupaan pas pembeli nyari. Di sini keluar sendiri daftar yang mau habis.',
    ''
  ),
  baris(
    'Operasional',
    'Nyatet belanja grosir',
    'Belanja ke grosir susah nyatetnya.',
    ['Notanya banyak', 'Males nyatet barang masuk'],
    'Foto nota belanja, isinya dibaca otomatis buat nambah stok.',
    'Notanya tinggal difoto, Bu, nanti barangnya kebaca sendiri. Nggak usah diketik satu-satu.',
    'Jangan janji semua nota pasti kebaca sempurna; nota pudar kadang perlu dikoreksi.'
  ),
  baris(
    'Operasional',
    'Utang pelanggan',
    'Yang ngutang suka lupa, atau ngeles.',
    ['Kasbon suka ilang catetannya', 'Pelanggan suka bilang udah bayar'],
    'Kasbon tercatat per pelanggan lengkap dengan tanggal dan jumlahnya, bisa pakai foto wajah pelanggan biar nggak ketuker. Struk bisa dikirim ke WhatsApp pelanggan.',
    'Tiap kasbon kecatat tanggal sama jumlahnya, Bu, jadi kalau pelanggan ngeles tinggal ditunjukin. Struknya juga bisa dikirim ke WA dia.',
    'Jangan janji ada pengingat utang otomatis (fiturnya belum ada).'
  ),

  // ---------- Kepercayaan ----------
  baris(
    'Kepercayaan',
    'Takut data hilang',
    'Kalau HP rusak atau hilang, catatannya hilang dong?',
    ['Nanti datanya ilang', 'HP saya sering rusak'],
    'Data tersimpan di akun, bukan cuma di HP. Login di HP lain, datanya tetap ada.',
    'Datanya nyimpen di akun Ibu, bukan di HP. HP ganti pun tinggal login lagi, catatannya masih lengkap.',
    ''
  ),

  // ---------- Draf: perlu diisi admin (nonaktif, nggak kelihatan sales) ----------
  baris(
    'Teknologi',
    'Sinyal jelek',
    'Sinyal di sini jelek.',
    ['Internetnya suka putus', 'Nggak ada kuota'],
    DRAF + 'Aplikasi cuma sebagian bisa jalan tanpa internet (data terakhir tetap kelihatan, sebagian aksi butuh sinyal). Tulis jawaban yang aman buat sales.',
    '',
    'Jangan janji bisa offline penuh.',
    false
  ),
  baris(
    'Pesaing',
    'Udah pakai aplikasi lain',
    'Saya udah pakai aplikasi lain (BukuWarung, dll).',
    ['Udah ada aplikasinya', 'Temen saya pakai yang lain'],
    DRAF + 'Tulis pembeda Asisten Warung yang kamu yakini dibanding aplikasi lain.',
    '',
    'Jangan jelek-jelekin aplikasi lain.',
    false
  ),
  baris(
    'Kepercayaan',
    'Data disalahgunakan',
    'Takut data saya disalahgunakan / ketahuan pajak.',
    ['Nanti penjualannya dilaporin?', 'Datanya dijual nggak?'],
    DRAF + 'Tulis kebijakan privasi Konsulin soal data penjualan pelanggan.',
    '',
    'Jangan janji apa pun soal pajak yang nggak ada di kebijakan resmi.',
    false
  ),
  baris(
    'Kepercayaan',
    'Siapa yang udah pakai',
    'Emang udah ada yang pakai?',
    ['Warung sini ada yang pakai?', 'Aman nggak sih?'],
    DRAF + 'Isi pakai contoh warung pelanggan asli (dengan izin), jangan pakai angka atau nama karangan.',
    '',
    'Jangan ngarang nama warung atau jumlah pengguna.',
    false
  ),
];
