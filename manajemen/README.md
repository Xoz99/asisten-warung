# Makalin Ops

Aplikasi operasional internal (dulu "Konsulin Manajemen"). Tahap 1: Dashboard, Leads (warung dari sales + CRM manual + sales),
Keuangan (Midtrans + catatan manual), Notifikasi, Pengaturan (tim & akun demo), Profile, Rekrutmen Sales Partner, dan Karyawan
(data kepegawaian, kehadiran harian, cuti & izin dengan persetujuan, payroll bulanan, struktur organisasi), dan Artifact
(gudang SOP/dokumen/aset/video/catatan per folder, dengan riwayat versi & sampah), dan Sales Lapangan (bank keberatan
pelanggan + log kunjungan sales + insight). AI Chat: menyusul.
Arah desain: `DESIGN.md` (neo-brutalism); filter anti-slop: `.claude/skills/antislop*` di root repo. **Sengaja terpisah** dari
aplikasi produknya: proses pm2, port, dan domain sendiri. Aplikasi Warung Pintar nggak punya halaman/API admin sama sekali.
Manajemen baca/tulis langsung ke database produk.

## Setup di server

```bash
cd manajemen
npm install
cp .env.example .env   # isi MANAJEMEN_JWT_SECRET, ADMIN_KEY & WARUNG_PINTAR_DATABASE_URL
npm run build
pm2 start server/index.js --name konsulin-manajemen
```

Terus arahin domain terpisah (mis. `manajemen.konsulin.com`) ke port-nya (default 4100) di reverse proxy. Contoh Caddy:

```
manajemen.konsulin.com {
    reverse_proxy <host>:4100
}
```

Update: `git pull && npm install && npm run build && pm2 restart konsulin-manajemen`.

### Form lamaran Sales Partner di konsulin.com

Form lamaran publik ada di landing page (`konsulin-landing-page`, halaman `/karir`). Server landing yang nerusin
kirimannya ke `http://127.0.0.1:4100/api/publik/daftar` (env `MAKALIN_API_URL` di landing), jadi browser pelamar nggak
pernah nyentuh domain makalin. Isi `DAFTAR_URL=https://konsulin.com/karir` di `.env` Makalin: link yang disalin di
Rekrutmen pakai alamat itu, dan link lama `makalin.konsulin.com/daftar?s=...` dialihin ke sana.

### File Artifact

File yang diunggah di halaman Artifact disimpan di `data/artifact/` (atau `ARTIFACT_DIR`), bukan di database, dan nggak
masuk git. **Ikutin folder ini di backup server.** Batas per file 300 MB (`ARTIFACT_MAKS_MB`).

### Akun sales

Akun di Makalin punya peran **admin** (semua halaman) atau **sales** (cuma Sales Lapangan & profilnya sendiri). Bikin
akun sales dari Pengaturan > Pengguna & tim. Batasannya dikunci di server (`RUTE_SALES` di `server/auth.js`), jadi
halaman/API baru otomatis tertutup buat sales. Foto bukti kunjungan (WEBP) disimpan di `data/lapangan/` (ikutin di backup). Lokasi kunjungan diambil
otomatis dari GPS HP (wajib buat akun sales), jadi Makalin harus dibuka lewat HTTPS.

## Login admin

Tiap orang punya akun sendiri (username + password), dan semua perubahan kecatat di **Admin & aktivitas**.
Pertama kali dibuka muncul layar **Buat admin pertama** - isi pakai `ADMIN_KEY` dari `.env`. Admin berikutnya
(temen, dst) ditambah dari halaman Admin & aktivitas. Sesi login berlaku 12 jam; reset password / nonaktifin admin
langsung mutus sesinya.

## Development

`npm run dev` - nyalain API (port 4100) + tampilan (http://localhost:5174) sekaligus. Butuh `.env` (lihat `.env.example`).

## Nambah produk

1. Server: bikin `server/produk/<id>/` berisi router-nya, daftarin di `server/produk/index.js`.
2. Tampilan: bikin `src/produk/<id>/…jsx`, daftarin di `HALAMAN` di `src/App.jsx`.

## AI Chat

Menu **AI Chat** tersedia untuk akun admin. Atur `OPENROUTER_API_KEY` di `.env`
server, lalu restart proses server. Key tidak memakai prefix `VITE_` dan tidak masuk
bundle browser. Tanpa `OPENROUTER_MODEL`/`OPENROUTER_MODELS`, server pakai 3 model
gratis yang mendukung tools sebagai cadangan berurutan (lihat `MODEL_BAWAAN` di
`server/ai.routes.js`); model yang diblokir guardrail/kebijakan data akun OpenRouter
nggak bisa dipakai. Model gratis mengikuti kuota/ketersediaan provider dan jawabannya
bisa salah, jadi tetap cek sebelum menyetujui perubahan.
Integrasi mengikuti https://openrouter.ai/docs/guides/features/tool-calling.

Agent mencari API melalui katalog `server/ai-catalog.json`, membaca data lewat
API internal, dan menampilkan usulan perubahan dengan target serta isi data.
Tombol **Jalankan tindakan** mengeksekusi tepat satu usulan menggunakan sesi login
pengguna; **Batalkan** membuang usulan. Validasi dan pencatatan aktivitas tetap
mengikuti endpoint asal. Jika respons eksekusi terputus, cek data sebelum membuat
usulan baru karena perubahan mungkin sudah tersimpan.

Cakupan katalog: dashboard, CRM/leads, sales lapangan, rekrutmen, karyawan,
keuangan/komisi, tim sales, artifact, notifikasi, profil, dan data Warung Pintar.
Pengelolaan kredensial, akun demo yang memuat password, dan transfer file tetap
melalui halaman terkait. Sales tetap dibatasi ke aplikasi sales; endpoint AI ini
khusus panel admin. Tambahkan kontrak parameter ke katalog ketika API berubah.

Percakapan disimpan sementara di memori server selama 30 menit tidak aktif,
hilang ketika server restart atau pengguna meninggalkan halaman. Untuk banyak
instance server perlu shared session storage atau sticky session. Data yang dibaca
agent dikirim ke OpenRouter: kredensial, rekening, NIK, NPWP, dan alamat dibuang;
nomor HP & email disamarkan. Rekening/bank/NIK/NPWP nggak bisa diubah lewat AI.
Chat dibatasi 20 permintaan/menit per akun, 8 langkah alat per pesan, 6.000 karakter
per pesan, dan jatah harian (reset 00.00 WIB): `AI_PESAN_HARIAN` pesan per admin
(default 50) serta `AI_TOKEN_HARIAN` total token semua admin (0 = tanpa batas).

Verifikasi: `node --test test/ai.test.js`, `npm run build`, `npm run lint`.
