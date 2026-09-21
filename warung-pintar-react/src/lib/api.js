// Klien buat manggil backend (warung-pintar-backend). Default-nya RELATIVE (string kosong) -
// jadi request /api/... otomatis ikut origin manapun yang dipakai buka app-nya (localhost, IP
// LAN, tunnel ngrok, domain produksi beneran, dst), lalu diteruskan ke backend asli lewat proxy
// dev server (lihat vite.config.js) atau reverse proxy produksi. Set VITE_API_URL di .env cuma
// kalau beneran perlu manggil backend di host/port yang BEDA dari origin frontend-nya sendiri.
import { VERSI_MODEL_WAJAH } from './wajah';

const BASE_URL = import.meta.env.VITE_API_URL || '';

const TOKEN_KEY = 'warungpintar_token';
const WARUNG_KEY = 'warungpintar_warung';

export const sesi = {
  token: () => localStorage.getItem(TOKEN_KEY),
  warung: () => {
    try {
      return JSON.parse(localStorage.getItem(WARUNG_KEY) || 'null');
    } catch {
      return null;
    }
  },
  simpan: (token, warung) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(WARUNG_KEY, JSON.stringify(warung));
  },
  hapus: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(WARUNG_KEY);
  },
};

async function req(method, path, body) {
  const headers = {};
  const token = sesi.token();
  if (token) headers.Authorization = 'Bearer ' + token;
  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(BASE_URL + path, { method, headers, body: payload });
  } catch {
    throw new Error('Tidak bisa menghubungi server. Pastikan backend jalan & koneksi internet/lokal aman.');
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* respons kosong, biarin null */
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Permintaan gagal (${res.status})`);
    err.status = res.status;
    // Flag khusus (lihat errorHandler.js backend) - beda dari 402 "lisensi/langganan habis" biasa
    // (yang ditangani terpisah di AppContext lewat cekLisensi), ini nunjuk ke jatah token AI HARIAN
    // yang abis (lihat aiQuota.service.js) - dipakai layar-layar yang manggil fitur AI scan/nota/
    // suara buat nampilin ajakan upgrade plan, bukan toast error biasa.
    err.jatahAiHabis = !!(data && data.jatahAiHabis);
    throw err;
  }
  return data;
}

const get = (path) => req('GET', path);
const post = (path, body) => req('POST', path, body);
const put = (path, body) => req('PUT', path, body);
const del = (path) => req('DELETE', path);

export const api = {
  // Daftar akun baru 2 langkah: kirim kode ke WhatsApp -> verifikasi kode (akun baru dibuat di langkah ini).
  daftar: {
    kirimKode: (namaWarung, username, password, noHp, kodeSales) =>
      post('/api/auth/register/kirim-kode', { namaWarung, username, password, noHp, kodeSales }),
    cekSales: (kode) => get('/api/auth/sales/' + encodeURIComponent(kode)),
    verifikasi: (pendaftaranId, kode) => post('/api/auth/register/verifikasi', { pendaftaranId, kode }),
  },
  login: (username, password) => post('/api/auth/login', { username, password }),
  gantiPassword: (passwordLama, passwordBaru) => req('PATCH', '/api/auth/password', { passwordLama, passwordBaru }),
  // Nomor HP = jalan pulih satu-satunya kalau password kelupaan. Ganti nomor minta password lagi
  // (backend yang maksa) - biar HP warung yang lagi kebuka nggak bisa dipakai orang lain mindahin
  // nomor pemulihan ke nomornya sendiri.
  gantiNoHp: (password, noHp) => req('PATCH', '/api/auth/no-hp', { password, noHp }),

  // Lupa password (belum login): minta kode -> verifikasi -> pasang password baru.
  // `id` boleh username ATAU nomor HP - yang lupa password sering lupa username juga.
  lupa: {
    kirimKode: (id) => post('/api/auth/otp/kirim', { username: id, noHp: id }),
    verifikasi: (id, kode) => post('/api/auth/otp/verifikasi', { username: id, noHp: id, kode }),
    reset: (token, passwordBaru) => post('/api/auth/reset-password', { token, passwordBaru }),
  },

  // Profil usaha dari layar "kenalan dulu" - { profil } (null = belum pernah diisi)
  profilUsaha: {
    ambil: () => get('/api/auth/profil-usaha'),
    simpan: (profil) => put('/api/auth/profil-usaha', profil),
  },

  // PIN pemilik - SATU per akun warung, disimpan di server (dulu lokal per HP, jadi tiap HP bisa beda).
  pin: {
    status: () => get('/api/auth/pin'), // { dibuat }
    buat: (pin) => post('/api/auth/pin/buat', { pin }),
    cek: (pin) => post('/api/auth/pin/cek', { pin }),
  },
  // Ganti PIN (sudah login): kode WA membuktikan pemiliknya, PIN barunya disimpan server di langkah yang sama.
  pinOtp: {
    kirimKode: () => post('/api/auth/pin/otp/kirim'),
    verifikasi: (kode, pinBaru) => post('/api/auth/pin/otp/verifikasi', { kode, pinBaru }),
  },

  penjaga: {
    list: () => get('/api/penjaga'),
    tambah: (nama) => post('/api/penjaga', { nama }),
    pilih: (id) => post(`/api/penjaga/${id}/pilih`),
    kosongkan: () => post('/api/penjaga/kosongkan'),
  },

  produk: {
    list: () => get('/api/produk'),
    tambah: (data) => post('/api/produk', data),
    ubah: (id, data) => put(`/api/produk/${id}`, data),
    // data: { qty, harga } (satuan jual) ATAU { jumlahKemasan, hargaKemasan } (dus/pack, dikonversi backend)
    masukStok: (id, data) => post(`/api/produk/${id}/masuk-stok`, data),
    opname: (id, fisik, harga) => post(`/api/produk/${id}/opname`, { fisik, harga }),
    barcode: (kode) => get(`/api/produk/barcode/${encodeURIComponent(kode)}`),
    // SOFT delete (set aktif=false di backend) - histori transaksi lama yang masih nyantol ke
    // barang ini TETAP utuh, cuma ilang dari katalog aktif (Stok, Catat Penjualan, scan, Mang AI, dst).
    hapus: (id) => del(`/api/produk/${id}`),
    // "Cari referensi" pas nambah barang baru - saran nama/satuan/isi kemasan/kisaran harga dari
    // pengetahuan umum AI (BUKAN database harga live), buat ngisi form cepet. Selalu tetap bisa
    // diedit user sebelum disimpen - lihat komentar lengkap di gemini.service.js.
    cariReferensi: (query) => post('/api/produk/cari-referensi', { query }),
    // id produk yang paling sering dibeli jam pagi (05:00-11:00) 30 hari terakhir, urut - dipakai
    // buat chip cepat "Sering dibeli pagi" di Catat Penjualan (bukan detail produk lengkap).
    seringPagi: () => get('/api/produk/sering-pagi'),
  },

  scan: {
    // embedding dihitung di client (TensorFlow.js MobileNet) — backend cuma nyimpen & nyocokin
    daftarkanReferensi: (produkId, sudut, embedding, fotoUrl) =>
      post(`/api/scan/produk/${produkId}/referensi-visual`, { sudut, embedding, fotoUrl }),
    // Buat layar edit barang (Opname) - lihat/kelola foto referensi barang yang UDAH ada, biar
    // barang lama (nggak lewat alur "tambah barang baru") bisa dikasih foto referensi belakangan.
    listReferensi: (produkId) => get(`/api/scan/produk/${produkId}/referensi-visual`),
    hapusReferensi: (refId) => del(`/api/scan/referensi-visual/${refId}`),
    visual: (embedding) => post('/api/scan/visual', { embedding }),
    // Cadangan TERAKHIR (Gemini Vision) - dipanggil manual dari tombol "Coba pakai AI" kalau
    // scanner gratis di atas (ZXing/MobileNet) udah dicoba & gagal. Ada biaya kecil tiap panggilan
    // (beda dari 2 di atas yang gratis) - makanya sengaja BUKAN otomatis, user yang mutusin.
    barcodeAi: (fotoBase64) => post('/api/scan/barcode-ai', { fotoBase64 }),
    visualAi: (fotoBase64) => post('/api/scan/visual-ai', { fotoBase64 }),
    // "Foto banyak sekaligus" di Catat Penjualan (SheetVisual) - 1 foto bisa isi beberapa barang
    // beda, balikin [{qty, produk}] buat masing-masing yang dikenali.
    visualAiBanyak: (fotoBase64) => post('/api/scan/visual-ai-banyak', { fotoBase64 }),
  },

  wajah: {
    // descriptor wajah dihitung di client (face-api.js) — backend cuma nyimpen & nyocokin
    // `versi` = versi susunan model (lib/wajah.js) - descriptor beda model nggak bisa dibandingin.
    daftarkan: (pelangganId, embedding) =>
      post(`/api/wajah/pelanggan/${pelangganId}/wajah`, { embedding, versi: VERSI_MODEL_WAJAH }),
    identifikasi: (embedding) => post('/api/wajah/identifikasi', { embedding, versi: VERSI_MODEL_WAJAH }),
  },

  transaksi: {
    list: (limit = 100) => get(`/api/transaksi?limit=${limit}`),
    bayar: (data) => post('/api/transaksi/bayar', data),
    kasbon: (data) => post('/api/transaksi/kasbon', data),
  },

  kasbon: {
    list: () => get('/api/kasbon'),
    lunasi: (id, metode) => post(`/api/kasbon/${id}/lunasi`, { metode }),
    bayarSebagian: (id, jumlah, metode) => post(`/api/kasbon/${id}/bayar`, { jumlah, metode }),
    bayarPelanggan: (pelangganId, jumlah, metode) => post(`/api/kasbon/pelanggan/${pelangganId}/bayar`, { jumlah, metode }),
  },

  pelanggan: {
    list: () => get('/api/pelanggan'),
    tambah: (data) => post('/api/pelanggan', data),
    // Ganti foto pelanggan yang udah ada - dipakai "+ foto wajah" di layar Pelanggan.
    gantiFoto: (id, fotoUrl) => post(`/api/pelanggan/${id}/foto`, { fotoUrl }),
  },

  suara: {
    // Rekaman suara -> teks. Jalur cadangan buat HP yang SpeechRecognition-nya diblokir (paling
    // sering iPhone yang dibuka dari ikon layar HP) - lihat lib/rekam.js.
    transkrip: (audio) => post('/api/suara/transkrip', { audio }),
  },

  jaga: {
    riwayat: () => get('/api/jaga/riwayat'),
    // Pratinjau angka giliran yang lagi jalan. WAJIB dari server, jangan dihitung ulang di layar:
    // angka yang sama pernah dihitung dua kali pakai aturan beda (lihat ringkasanGiliran di
    // jaga.routes.js) dan bikin layar konfirmasi beda jauh sama catatan yang kesimpen.
    ringkasan: () => get('/api/jaga/ringkasan'),
    serahTerima: (data) => post('/api/jaga/serah-terima', data),
  },

  laporan: {
    ringkasan: (n, offset) => get(`/api/laporan/ringkasan?n=${n}&offset=${offset}`),
    laris: () => get('/api/laporan/laris'),
    ngendap: () => get('/api/laporan/ngendap'),
    kas: (jenis) => get(`/api/laporan/kas?jenis=${jenis}`),
    // Duit yang disetor pemilik ke warung. Sengaja beda dari masuk_log (itu duit dari JUALAN) -
    // kalau dicampur, laporan untung jadi ngaco karena setoran modal kebaca sebagai omzet.
    catatModal: (jumlah, keterangan) => post('/api/laporan/kas/modal', { jumlah, keterangan }),
    // Target setoran harian. jumlah 0 = hapus target hari ini (lihat laporan.routes.js) - bukan
    // nyimpen angka nol, karena di grafik "nggak pasang target" beda arti dari "targetnya nol".
    targetHariIni: () => get('/api/laporan/target'),
    pasangTarget: (jumlah) => put('/api/laporan/target', { jumlah }),
  },

  nota: {
    scan: (fotoBase64) => post('/api/nota/scan', { fotoBase64 }),
    terapkan: (rows) => post('/api/nota/terapkan', { rows }),
  },

  voice: {
    parse: (transkrip) => post('/api/voice/parse', { transkrip }),
    // Cadangan (Gemini, teks doang jadi murah) - dipanggil OTOMATIS dari SheetVoice pas parseUcapan
    // client-side (lib/voice.js) nggak nemu apa-apa dari transkrip. Balikin [{qty, produk}].
    parseAi: (transkrip) => post('/api/voice/parse-ai', { transkrip }),
  },

  asisten: {
    // riwayat: [{peran:'user'|'model', teks}] - beberapa turn obrolan terakhir (lihat
    // riwayatUntukGemini di Chat.jsx), biar Gemini di backend "inget" konteks percakapan.
    // Opsional (default []) - dipanggil tanpa riwayat tetap jalan, cuma jawabnya jadi
    // nggak nyambung ke obrolan sebelumnya.
    // fotoBase64 (opsional): foto yang dilampirin user bareng pesannya (misal foto barang yang
    // mau didaftarin) - cuma dipakai kalau jawabannya lewat Gemini (lihat komentar di
    // gemini.service.js). Balikin juga `aksi` (null kalau bukan permintaan CRUD barang) - lihat
    // penanganannya di Chat.jsx (KartuAksi).
    tanya: (teks, riwayat = [], fotoBase64 = null) => post('/api/asisten/tanya', { teks, riwayat, fotoBase64 }),
  },

  // Memori Mang AI per akun warung - catatan jangka panjang yang diinget lintas obrolan & HP.
  memori: {
    list: () => get('/api/asisten/memori'),
    tambah: (isi) => post('/api/asisten/memori', { isi }),
    hapus: (id) => del(`/api/asisten/memori/${id}`),
    hapusSemua: () => del('/api/asisten/memori'),
  },

  lisensi: {
    status: () => get('/api/lisensi/status'),
    checkout: (plan) => post('/api/lisensi/checkout', { plan }),
    // Jaring pengaman buat webhook Midtrans yang nggak nyampe (di localhost NGGAK AKAN pernah
    // nyampe sama sekali). Balikin { adaPerubahan } - true kalau ada pembayaran yang BARU
    // diaktifkan barusan, dipakai buat mutusin nampilin popup "berhasil upgrade".
    sinkron: () => post('/api/lisensi/sinkron'),
  },

  komunitas: {
    // cursor: ISO timestamp postingan terlama yang udah kemuat (buat "muat lagi") — kosongin buat halaman pertama
    // milik 'saya' = cuma postingan warung sendiri (tab "Postingan saya")
    // opsi: 'saya' | { milik:'saya', ikuti:true, warung:<id>, q:<kata cari> }
    feed: (cursor, opsi) => {
      const o = typeof opsi === 'string' ? { milik: opsi } : opsi || {};
      const q = new URLSearchParams();
      if (cursor) q.set('before', cursor);
      if (o.milik) q.set('milik', o.milik);
      if (o.ikuti) q.set('ikuti', '1');
      if (o.warung) q.set('warung', o.warung);
      if (o.q) q.set('q', o.q);
      const qs = q.toString();
      return get(`/api/komunitas${qs ? `?${qs}` : ''}`);
    },
    detail: (id) => get(`/api/komunitas/${id}`),
    // Profil warung, cari warung, & ikuti (followers/following)
    warung: {
      cari: (q) => get(`/api/komunitas/warung/cari?q=${encodeURIComponent(q)}`),
      profil: (id) => get(`/api/komunitas/warung/${id}`),
      ikuti: (id) => post(`/api/komunitas/warung/${id}/ikuti`),
      pengikut: (id) => get(`/api/komunitas/warung/${id}/pengikut`),
      mengikuti: (id) => get(`/api/komunitas/warung/${id}/mengikuti`),
    },
    // Notifikasi: komentar di postingan sendiri & balasan ke komentar sendiri
    notif: {
      list: () => get('/api/komunitas/notif'),
      jumlah: () => get('/api/komunitas/notif/jumlah'),
      // { id } = satu notifikasi, { postId } = semua notif postingan itu, {} = semua
      baca: (opsi = {}) => post('/api/komunitas/notif/baca', opsi),
    },
    posting: (data) => post('/api/komunitas', data),
    hapus: (id) => del(`/api/komunitas/${id}`),
    suka: (id) => post(`/api/komunitas/${id}/suka`),
    sukaSiapa: (id) => get(`/api/komunitas/${id}/suka`),
    komentar: {
      list: (postId) => get(`/api/komunitas/${postId}/komentar`),
      // balasKe (opsional): id komentar yang mau dibales - nempel jadi sub-balesan di bawahnya
      // (server otomatis ratain ke akar kalau target yang dibales itu sendiri sebuah balesan).
      // foto (opsional): data URL gambar yang udah dikecilin - komentar boleh foto doang tanpa tulisan.
      tambah: (postId, teks, balasKe, foto = null) => post(`/api/komunitas/${postId}/komentar`, { teks, balasKe, foto }),
      hapus: (id) => del(`/api/komunitas/komentar/${id}`),
    },
  },
};
