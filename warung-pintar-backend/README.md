# Warung Pintar — Backend API

Backend Node.js/Express + PostgreSQL buat aplikasi Warung Pintar, dibangun sesuai
`PRD_Warung_Pintar_Lengkap.md`. Menggantikan `localStorage` di frontend (`warung-pintar-react`)
dengan database beneran + REST API.

## Status setup lokal (mesin ini)

Sudah di-setup dan sudah dites jalan end-to-end (register → login → produk → transaksi → laporan):

- **PostgreSQL 17** ter-install di mesin ini. Ada instalasi Postgres lain juga di port 5432 yang
  sudah ada sebelumnya (bukan dibuat sesi ini) — **jangan diutak-atik**, punya cluster sendiri.
- Buat aplikasi ini dibikinkan **cluster Postgres terpisah** khusus (data directory
  `C:\warung-pintar-pgdata`), supaya nggak nyentuh apa pun yang sudah ada:
  - Port: **5433**
  - Windows service: `warung-pintar-postgres` (Startup type: Automatic — otomatis nyala tiap
    komputer restart, nggak perlu di-start manual)
  - Database: `warung_pintar`
  - User: `postgres`, password random 24-karakter — sudah kesimpan di `.env` (`DATABASE_URL`),
    **jangan commit file `.env` ini** ke git (sudah masuk `.gitignore`).
- `.env` sudah diisi lengkap (`DATABASE_URL`, `JWT_SECRET` acak, `PORT=4000`) dan migrasi
  (`npm run migrate`) sudah dijalankan — semua tabel sudah ada di database.

Cek service Postgres-nya jalan:
```
Get-Service warung-pintar-postgres
```

## Lisensi/langganan (dijual dari landing page Konsulin)

Arsitekturnya: **Konsulin (`D:\konsuslin landing page`) cuma etalase statis** — nggak nyimpen
status langganan apa pun. Semua status lisensi nempel di tabel `warung` di backend ini, karena di
situ juga akun & datanya hidup.

```
Konsulin (landing, statis, no backend)
   → tombol paket harga → link ke app Warung Pintar: /?plan=bulanan|tahunan
        → Auth.jsx: daftar/masuk dulu, BARU lanjut checkout (bukan bayar dulu baru bikin akun)
        → POST /api/lisensi/checkout → bikin transaksi Midtrans Snap, redirect ke halaman bayarnya
             → Midtrans kirim webhook ke POST /api/lisensi/webhook (publik, diverifikasi via
               signature SHA-512, BUKAN via JWT — Midtrans yang manggil, bukan pelanggan)
                  → update warung.plan & warung.lisensi_berlaku_sampai
        → pelanggan diarahkan balik ke app (?lisensi=selesai) → app cek ulang status lisensinya
```

- Warung baru daftar otomatis dapat **trial 14 hari** (`plan='trial'` di tabel `warung`).
- Middleware `requireLisensiAktif` (`src/middleware/lisensi.js`) menggembok SEMUA endpoint `/api/*`
  KECUALI `/api/auth/*` dan `/api/lisensi/*` (biar akun yang lisensinya habis tetap bisa cek status
  & bayar buat perpanjang) — balikin `402 Payment Required` kalau `lisensi_berlaku_sampai` sudah lewat.
- Harga paket ada di `src/services/midtrans.service.js` (`HARGA_PLAN`) — **kalau diubah, samakan
  juga** di `warung-pintar-react/src/screens/LisensiHabis.jsx`, `Lainnya.jsx`, dan di
  `konsuslin landing page/components/pricing-section.tsx`, karena semuanya hardcode angka
  tampilan yang sama (nggak ada satu sumber data harga yang dipakai bersama).

### Yang masih perlu kamu isi sebelum bisa nerima pembayaran beneran

`.env` sekarang isinya Server Key/Client Key **dummy** (`MIDTRANS_SERVER_KEY` dkk) — cukup buat
ngetes signature webhook, tapi `POST /api/lisensi/checkout` akan selalu gagal (ditolak Midtrans)
sampai kamu:
1. Daftar akun di https://dashboard.midtrans.com (bisa mulai dari mode **Sandbox** dulu buat testing).
2. Ambil **Server Key** & **Client Key** dari Settings → Access Keys, isi ke `.env`.
3. Di Settings → Configuration, daftarkan **Payment Notification URL** = `https://<domain-backend-kamu>/api/lisensi/webhook`
   (localhost nggak bisa dipakai di sini — Midtrans butuh URL publik; pas masih dev lokal, pakai
   tunnel kayak `ngrok http 4000` dulu buat dapat URL sementara).
4. Set `APP_BASE_URL` ke URL app Warung Pintar yang beneran (buat redirect setelah bayar).
5. Kalau sudah siap produksi: `MIDTRANS_IS_PRODUCTION=true` + ganti ke Server/Client Key mode Production.

## Cara jalanin sehari-hari

```
npm install   # kalau belum / abis pull perubahan dependency
npm run dev   # nyalain server, auto-restart tiap ada perubahan file
```
Server nyala di `http://localhost:4000`. Cek `GET /health` buat pastiin jalan.

## Pindah ke Postgres di VPS nanti

Karena rencananya mau dipindah ke database VPS, alurnya nanti tinggal:
```
"C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" -h 127.0.0.1 -p 5433 -U postgres warung_pintar > backup.sql
```
lalu `psql` restore `backup.sql` itu ke database Postgres di VPS, dan ganti `DATABASE_URL` di
`.env` (atau environment variable di server produksi) ke connection string VPS-nya. Kode aplikasi
nggak perlu diubah sama sekali karena semuanya pakai `pg` standar, bukan fitur khusus lokal.

## Kalau mau install Postgres dari nol (referensi)

Kalau suatu saat butuh setup ulang dari kosong (mesin lain, dsb.), pilih salah satu:
- Install PostgreSQL (https://www.postgresql.org/download/windows/), atau
- Docker: `docker run --name warung-pg -e POSTGRES_PASSWORD=warung -e POSTGRES_DB=warung_pintar -p 5432:5432 -d postgres:16`, atau
- Postgres gratis di cloud (Neon.tech / Supabase) — copy connection string-nya ke `DATABASE_URL`.

Lalu `npm install`, isi `.env` dari `.env.example`, `npm run migrate`, `npm run dev`.

## Alur autentikasi

Satu warung = satu akun (dipakai bareng di beberapa HP — sesuai keputusan produk di PRD, belum ada
role/permission terpisah di MVP). `POST /api/auth/register` sekali di awal, lalu simpan `token`
JWT-nya dan kirim di header `Authorization: Bearer <token>` buat semua request lain.

## Ringkasan endpoint

| Area | Endpoint |
|---|---|
| Auth | `POST /api/auth/register`, `POST /api/auth/login` |
| Penjaga | `GET/POST /api/penjaga`, `POST /api/penjaga/:id/pilih`, `POST /api/penjaga/kosongkan` |
| Produk & stok | `GET/POST/PUT /api/produk`, `GET /api/produk/barcode/:kode`, `GET /api/produk/rekomendasi-belanja`, `POST /api/produk/:id/masuk-stok`, `POST /api/produk/:id/opname` |
| Scan visual AI | `POST /api/scan/produk/:id/referensi-visual` (simpan embedding foto), `POST /api/scan/visual` (cocokkan frame kamera live) |
| Voice-first | `POST /api/voice/parse` (cocokkan transkrip Web Speech API ke katalog barang) |
| Transaksi | `POST /api/transaksi/bayar`, `POST /api/transaksi/kasbon`, `GET /api/transaksi` |
| Kasbon | `GET /api/kasbon`, `POST /api/kasbon/:id/lunasi` |
| Pelanggan | `GET/POST /api/pelanggan` |
| Kasbon Kenal Wajah | `POST /api/wajah/pelanggan/:id/wajah`, `POST /api/wajah/identifikasi` |
| Serah Terima Jaga | `POST /api/jaga/serah-terima`, `GET /api/jaga/riwayat` |
| Laporan | `GET /api/laporan/ringkasan`, `/laris`, `/ngendap`, `/kas` |
| Scan Nota (OCR) | `POST /api/nota/scan` (upload foto, field `foto`), `POST /api/nota/terapkan` |
| Pintu Cuaca (Fase 2) | `GET /api/cuaca/prediksi-belanja` |
| Asisten (Fase 2) | `POST /api/asisten/tanya` |
| Koperasi Digital (Fase 2) | `GET/POST /api/koperasi/grup`, `POST /api/koperasi/grup/:id/pesan`, `GET /api/koperasi/grup/:id/rekap` |
| Langganan Sembako (Fase 2) | `GET/POST /api/langganan/paket`, `POST /api/langganan/paket/:id/langganan`, `GET /api/langganan/prediksi-pendapatan` |
| Tukar Tambah Stok (Fase 2) | `GET/POST /api/tukar`, `POST /api/tukar/:id/tutup` |

## Yang beneran jalan vs yang disederhanakan

Biar jelas dan jujur soal cakupan implementasi ini dibanding PRD:

- **Beneran jalan penuh:** auth, produk/stok (+ HPP rata-rata tertimbang), transaksi (atomik,
  cegah race condition stok pas 2 device catat bareng, idempotent lewat `clientId` buat offline
  sync), kasbon, pelanggan, serah terima jaga, laporan (agregat asli dari data transaksi, bukan
  angka dummy), OCR nota pakai Tesseract.js (regex parsing, bukan cuma placeholder), voice
  parsing bahasa Indonesia (angka kata + fuzzy match nama barang), cuaca (integrasi asli ke
  Open-Meteo, gratis tanpa API key).
- **Disederhanakan sesuai arsitektur PRD sendiri:** visual product recognition (MobileNet) dan
  face detection kasbon — PRD 10.1 & 10.3 sendiri menetapkan ini jalan di CLIENT (TensorFlow.js +
  Web Worker + IndexedDB di HP), justru supaya cepat & offline-first di HP kentang. Backend cuma
  nyimpen & nyocokin **vektor embedding** yang sudah dihitung di browser (`cosineSimilarity`) —
  bukan menjalankan model ML itu sendiri di server.
- **Rule-based, bukan AI beneran:** "Asisten Suara Conversational" (10.9) di sini keyword matching
  ke database asli, bukan LLM. Gampang di-upgrade nanti — tinggal ganti isi
  `src/routes/asisten.routes.js` buat manggil API model bahasa.
- **Fondasi CRUD saja (Fase 2/3, belum ada logika bisnis kompleks):** Koperasi Digital (belum ada
  auto-generate PO ke supplier), Langganan Sembako (belum ada reminder WA otomatis — butuh akun
  WhatsApp Business API), Tukar Tambah Stok.

## Struktur folder

```
src/
  schema.sql            skema database (jalanin lewat npm run migrate)
  db.js                 koneksi pg.Pool
  migrate.js            jalanin schema.sql
  index.js              entrypoint Express, wiring semua rute
  middleware/           auth.js (verifikasi JWT), errorHandler.js
  services/             voice.service.js (porting dari frontend: cocokProduk, parseUcapan, HPP)
  utils/                cosine.js (cosine similarity buat scan visual & wajah)
  routes/                *.routes.js per fitur
```
# Impor halaman produk marketplace / retail

### Katalog Lotte Grosir (sitemap publik, sudah diuji)

`npm run impor:katalog:lotte -- --simpan --max-pages=1500` menemukan URL produk
sendiri dari sitemap toko Jatake. Tanpa `--simpan`, hanya membuat snapshot
pratinjau. Produk pada detail dan rekomendasi halaman dibaca dari JSON halaman,
bukan ditebak dari URL. Jeda bawaan 1,2 detik; `--jeda-ms=500` membatasi maksimal
dua permintaan per detik. HTTP 403/429 menghentikan proses.
Produk tidak aktif, elektronik/perabot besar, dan nama duplikat dilewati.
Barang baru langsung aktif dengan sumber **Lotte Grosir**. SKU internal Lotte
tidak dijadikan barcode; barcode, harga, stok, foto, dan merek yang belum jelas
tidak diisi. Ukuran hanya diambil jika tercantum di nama, bukan dari berat kirim.
Kemasan multipack tetap merupakan satu produk sesuai nama: `isi_kemasan=1`
tidak berarti otomatis dikonversi menjadi satuan kecil.

Tabel `katalog_impor_sumber` menyimpan ID produk sumber, URL produk, halaman
bukti, dan waktu pengambilan. Snapshot JSONL dan laporan ada di
`data/impor-katalog/`. `lotte-halaman.json` menyimpan halaman selesai untuk
melanjutkan run berikutnya. Impor ulang tidak menimpa barang lama. Pencocokan
nama hanya menangani ejaan/spasi/satuan tertentu; nama berbeda tanpa barcode
masih mungkin merupakan barang yang sama.

Setelah impor, `node src/rapikanImporLotte.js` menerapkan perbaikan satuan barang
bertanda `/KG` dan kategori pada snapshot yang tersedia. Nama yang sudah diedit
tim tidak disentuh. `node src/verifikasiKatalog.js` mengecek pencarian 82 g,
paginasi di atas 5.000 barang, serta kelengkapan catatan sumber Lotte.
`node src/eksporKatalogPublik.js` membuat `data/katalog-publik.json` berisi
identitas barang aktif saja untuk pemindahan data; ini **bukan deploy otomatis**.

`npm run impor:katalog:terverifikasi` memasukkan tambahan yang sudah diperiksa
dari `data/katalog-terverifikasi.json`, termasuk SilverQueen 82 g. Data ini
tidak memakai SKU atau nomor BPOM sebagai barcode.

Untuk melengkapi katalog otomatis tanpa daftar URL, jalankan
`npm run impor:katalog:indonesia`. Sumbernya Open Food Facts, dengan pencarian
barcode berawalan 899 (alokasi GS1 Indonesia), termasuk produk yang belum diberi
tag negara Indonesia. Awalan barcode tidak menjamin lokasi produksi atau
ketersediaan barang di setiap warung. Nama dan digit cek GTIN wajib valid.
Produk baru langsung aktif; kunci yang sudah ada tidak diubah, termasuk draf
dan produk nonaktif. Stok dan harga warung tidak diisi oleh proses ini.
Snapshot barang baru serta laporan jumlah disimpan di `data/impor-katalog/`.
Data Open Food Facts tetap mengikuti lisensi ODbL dan atribusi yang sudah
ditampilkan di katalog aplikasi. Proses ini mengakses jaringan dan database
yang ditentukan oleh `DATABASE_URL`.

Tambahan sumber non-makanan bisa dijalankan dengan
`npm run impor:katalog:indonesia -- --sumber=obf` atau `--sumber=opf`.
Keduanya memakai facet barcode EAN-13 Indonesia di situs masing-masing.
Jumlah akhir diverifikasi lewat database; skrip tidak menjamin 100.000 barang
Indonesia dan tidak menggandakan varian agar memenuhi target jumlah.

`npm run scrape:katalog -- urls.txt` membaca daftar URL produk publik (satu URL
per baris, baris `#` diabaikan) dan mencetak pratinjau JSON tanpa menulis database.
Tambahkan `--simpan` untuk memasukkan hasil sebagai **draf** ke katalog bersama:

```sh
npm run scrape:katalog -- urls.txt --simpan
```

Jalankan dari direktori backend dengan `DATABASE_URL` yang sesuai. Review dan
setujui hasil di Makalin > Katalog barang > Draf. Filter sumber mendukung
Tokopedia, Shopee, Alfagift, dan Klik Indogrosir. URL asal dan waktu pengambilan
tercatat di `diubah_oleh` saat impor; pengeditan/review tim dapat menggantinya.

Dukungan awal hanya **Product JSON-LD pada HTML publik**, bukan crawler seluruh
situs, API privat, atau browser yang menjalankan JavaScript. Belum diverifikasi
terhadap halaman produk live keempat sumber; jika situs tidak menyertakan JSON-LD,
meminta login, atau memblokir akses, URL dilaporkan gagal (exit code 1), bukan
dianggap berhasil. Daftar URL perlu disiapkan sendiri. Tidak ada bypass CAPTCHA.

Maksimal 500 URL per proses, jeda 2 detik, timeout 20 detik per request, batas HTML
5 MB. Hanya domain HTTPS yang didaftarkan yang diterima, termasuk saat redirect.
Impor ulang melewati kunci barcode/nama yang sudah ada tanpa menimpa hasil review.
Nama berbeda tanpa barcode masih mungkin merupakan barang yang sama: cek draf.
SKU bukan barcode; barcode hanya diambil dari GTIN valid. Harga, foto, stok,
dan isi kemasan tidak diimpor karena belum ada pemetaan yang terverifikasi.
