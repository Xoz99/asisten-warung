// Klien buat manggil backend (warung-pintar-backend). Default-nya RELATIVE (string kosong) -
// jadi request /api/... otomatis ikut origin manapun yang dipakai buka app-nya (localhost, IP
// LAN, tunnel ngrok, domain produksi beneran, dst), lalu diteruskan ke backend asli lewat proxy
// dev server (lihat vite.config.js) atau reverse proxy produksi. Set VITE_API_URL di .env cuma
// kalau beneran perlu manggil backend di host/port yang BEDA dari origin frontend-nya sendiri.
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
  register: (namaWarung, username, password, noHp) => post('/api/auth/register', { namaWarung, username, password, noHp }),
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

  // Ganti PIN (sudah login): OTP cuma buat MEMBUKTIKAN pemiliknya. PIN-nya sendiri tetap disimpan
  // lokal di HP masing-masing (lihat prefs di AppContext), bukan di server.
  pinOtp: {
    kirimKode: () => post('/api/auth/pin/otp/kirim'),
    verifikasi: (kode) => post('/api/auth/pin/otp/verifikasi', { kode }),
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
    daftarkan: (pelangganId, embedding) => post(`/api/wajah/pelanggan/${pelangganId}/wajah`, { embedding }),
    identifikasi: (embedding) => post('/api/wajah/identifikasi', { embedding }),
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
    feed: (cursor) => get(`/api/komunitas${cursor ? `?before=${encodeURIComponent(cursor)}` : ''}`),
    posting: (data) => post('/api/komunitas', data),
    hapus: (id) => del(`/api/komunitas/${id}`),
    suka: (id) => post(`/api/komunitas/${id}/suka`),
    sukaSiapa: (id) => get(`/api/komunitas/${id}/suka`),
    komentar: {
      list: (postId) => get(`/api/komunitas/${postId}/komentar`),
      // balasKe (opsional): id komentar yang mau dibales - nempel jadi sub-balesan di bawahnya
      // (server otomatis ratain ke akar kalau target yang dibales itu sendiri sebuah balesan).
      tambah: (postId, teks, balasKe) => post(`/api/komunitas/${postId}/komentar`, { teks, balasKe }),
      hapus: (id) => del(`/api/komunitas/komentar/${id}`),
    },
  },
};
