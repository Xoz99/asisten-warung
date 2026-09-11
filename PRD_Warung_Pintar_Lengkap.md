# PRD: Warung Pintar
## Product Requirements Document — Asisten Warung Kelontong Indonesia

---

## 1. Latar Belakang & Masalah

### Persona: Pak Budi
Pak Budi, 52 tahun, pemilik warung kelontong di perumahan. Jam ramai warungnya ada di 06.00–08.00 pagi, saat ibu-ibu belanja sebelum anak sekolah.

**Masalah Sehari-hari:**
- Selama ini dia catat semua penjualan di buku tulis. Tangan sering kotor/basah minyak pas transaksi, jadi tulisan berantakan.
- Pas ramai, dia sering salah hitung total — baru sadar setelah pelanggan pergi.
- Stok barang cuma dihafal di kepala. Barang kayak mie instan atau minyak goreng kadang baru ketahuan habis pas ada pelanggan yang nanya — ujungnya pelanggan pindah ke warung sebelah.
- Ada 5–6 pelanggan langganan yang kasbon (utang), dicatat di buku terpisah. Pak Budi sering lupa siapa yang belum bayar, jadi malu-maluin pas mau nagih.
- Akhir bulan, istrinya bantu rekap manual dari buku tulis sampai jam 11 malam — pusing, dan hasilnya sering tidak cocok sama uang di laci.
- Belanja ke pasar/grosir, pulangnya harus input stok manual satu-satu dari nota tulisan tangan. Ribet, sering salah, sering kelupaan.
- Margin tipis (5–10%), harga beli ke grosir mahal karena beli eceran. Kalau bisa beli bareng warung lain, harga bisa turun drastis.

**Masalah Inti:**
Pencatatan manual lambat, rawan salah, gampang rusak/hilang, dan tidak kasih visibilitas real-time atas stok, utang, maupun untung harian. Belum lagi tidak ada bantuan untuk optimasi belanja, prediksi penjualan, dan kolaborasi antar warung.

---

## 2. Target User

- Pemilik warung kelontong skala kecil–menengah, mirip Pak Budi.
- Tidak paham teknologi ("kalah sama anak SMP") — butuh UX sesederhana buka WhatsApp.
- Warung kadang ditinggal (ke pasar, ke rumah sakit) dan dijaga istri/anak.
- Tangan sering kotor/basah saat transaksi — butuh cara catat tanpa harus ngetik.
- Punya pelanggan langganan dengan sistem kasbon/utang.
- Ingin tahu untung harian tanpa rekap manual tiap malam.

---

## 3. Tujuan Produk

1. Percepat & akuratkan pencatatan transaksi harian.
2. Hilangkan risiko kehabisan stok tanpa sadar.
3. Rapikan pencatatan & penagihan utang pelanggan.
4. Kasih visibilitas untung harian tanpa rekap manual.
5. Bisa dipantau dari jarak jauh oleh pemilik/keluarga.
6. **Bantu optimasi belanja & harga modal melalui koperasi digital antar warung.**
7. **Prediksi kebutuhan stok berdasarkan cuaca & event lokal.**
8. **Permudah input stok dari nota belanja dengan OCR.**
9. **Bikin warung bisa menawarkan langganan sembako ke pelanggan.**

---

## 4. Aksi Utama Saat Pertama Buka App

**Catat transaksi jualan** — ini harus jadi aksi paling cepat diakses (idealnya jadi layar/tombol default saat app dibuka), karena ini yang paling sering dan paling penting dilakukan user setiap hari.

**Mode transaksi yang tersedia saat buka:**
- 🎙️ **Catat Suara** (default — karena tangan sering kotor)
- 📸 **Scan Visual AI** (arahkan kamera ke kemasan barang)
- 📷 **Scan Barcode** (fallback)
- ⌨️ **Ketik Manual** (fallback terakhir)

---

## 5. Ruang Lingkup Fitur MVP

### Wajib (Must-have)

| # | Fitur | Kenapa |
|---|-------|--------|
| 1 | **Catat transaksi jualan** | Aksi utama, pengganti buku tulis, harus super cepat & minim langkah |
| 2 | **Catat transaksi pakai suara (Voice-First)** | Tangan Pak Budi sering kotor/basah minyak. Cukup tekan tombol & bicara: "Tiga mie goreng, satu minyak goreng." AI kenali barang, hitung total, kurangi stok. Nggak ada kompetitor yang punya |
| 3 | **Scan barang pakai kamera — Hybrid MobileNet + Visual Similarity** | Arahkan kamera ke kemasan barang → AI cocokkan dengan foto barang di database → tampilkan 3 hasil paling mirip → user tap konfirmasi. Cukup foto 3 angle saat input stok pertama kali. Lebih realistis daripada object detection murni untuk HP kentang |
| 4 | **Scan barcode** | Fallback kalau visual gagal atau barang tanpa kemasan. Percepat input, kurangi salah ketik saat ramai |
| 5 | **Lihat stok barang** | Biar Pak Budi tahu stok real-time, tidak dihafal lagi |
| 6 | **Laporan untung rugi** | Ganti rekap manual istri tiap akhir bulan; jadi alasan utama dipakai tiap hari |
| 7 | **Data barang laris & tidak laku** | Bantu keputusan belanja/stok |
| 8 | **Rekomendasi barang priority untuk dibelanjakan** | Fitur custom yang diminta user — turunan dari data stok + barang laris |
| 9 | **Catat utang pelanggan (kasbon)** | Krusial untuk retensi harian. Pak Budi sering lupa siapa yang belum bayar |
| 10 | **Kasbon Kenal Wajah** | Kamera depan otomatis deteksi pelanggan langganan → tampilkan utang & template belanjaan biasa. Face detection ringan (MobileNet), jalan di HP kentang |
| 11 | **Scan Nota Belanja (OCR)** | Scan nota tulisan tangan/print dari pasar/grosir → AI baca item, qty, harga → auto masukkan stok & harga modal. Solve pain point input stok paling besar |
| 12 | **Serah Terima Jaga (1-Tap Shift Handover)** | Tombol besar saat ganti jaga: ringkasan uang di laci, penjualan, stok habis, utang baru. Nggak perlu ngomong panjang lebar, nggak ada yang kelupaan |

### Ditunda ke Fase Berikutnya (Nice-to-have)

| # | Fitur | Keterangan |
|---|-------|------------|
| 1 | **Pengingat stok mau habis (otomatis)** | Natural lanjutan dari fitur stok. Bisa masuk fase 2 |
| 2 | **Pintu Cuaca — Prediksi Belanja** | Integrasi data cuaca BMKG + kalender event nasional/lokal → prediksi penjualan & rekomendasi stok. Contoh: besok hujan → stok mie & telur naik |
| 3 | **AI Asisten Suara (Conversational)** | Bukan cuma catat suara, tapi bisa diajak ngobrol: "Hari ini untung berapa?" "Stok apa yang mau habis?" "Siapa yang belum bayar?" |
| 4 | **Belanja Bareng — Koperasi Digital antar Warung** | Warung bisa join grup belanja sesuai lokasi. Beli bareng = harga grosir. Bikin app jadi platform ekonomi, bukan cuma tool kasir |
| 5 | **Langganan Sembako** | Paket langganan mingguan/bulanan ke pelanggan langganan. Warung jadi mini supermarket berlangganan. Prediktabilitas pendapatan |
| 6 | **Tukar Tambah Stok** | Barter stok antar warung di sekitar. Kelebihan stok A di warung X ditukar dengan stok B di warung Y |
| 7 | **Role/Permission Multi-User Terpisah** | Misal: anak cuma boleh input transaksi, tidak boleh lihat laporan untung. Bisa nyusul di fase 2 kalau memang dibutuhkan |

---

## 6. Prinsip UX / Kebutuhan Non-Fungsional

1. **Kesederhanaan setara WhatsApp** — minim langkah, minim istilah teknis, tombol besar & jelas. Kalau serumit Excel, user tidak akan pakai.
2. **Tangan kotor? Bisa pakai suara.** — Mode default transaksi adalah suara, bukan ketik. Tombol suara harus paling besar & paling gampang diakses.
3. **Data tidak boleh hilang** — perlu backup/cloud sync, bukan cuma tersimpan lokal (respons ke buku tulis yang basah kopi & pernah hilang seminggu).
4. **Bisa diakses dari jarak jauh** — pemilik bisa pantau penjualan/stok warung meski lagi tidak di tempat (ke pasar, rumah sakit), sementara istri/anak yang jaga warung.
5. **Minim human error saat ramai** — total transaksi dihitung otomatis, bukan manual. Scan visual/suara/barecode mengurangi salah ketik.
6. **Bukan cuma app kasir — tapi asisten yang ngerti konteks.** Warung kelontong bukan minimarket. Hubungan personal, jadwal bergantian jaga, cuaca, dan ekonomi lokal adalah bagian hidupnya.
7. **Scan harus lebih cepat dari nulis manual** — kalau scan gagal 2x, user akan balik ke buku tulis. Oleh karena itu, Hybrid MobileNet + Visual Similarity dipilih karena akurasi & kecepatan jauh di atas image recognition murni.
8. **Offline-first untuk pencatatan transaksi** — catat transaksi jualan harus tetap jalan walau sinyal warung lagi jelek. Data disimpan lokal dulu, auto-sync begitu ada internet. Ini krusial biar app tidak kalah reliable dari buku tulis.

---

## 7. Kenapa Dipakai Tiap Hari (Retention Drivers)

1. **Tahu untung harian** — dashboard ringkasan penjualan & untung per hari, real-time.
2. **Tidak lupa utang pelanggan** — daftar kasbon yang jelas, siapa berutang berapa, biar tidak malu-maluin pas nagih. Ditambah fitur Kasbon Kenal Wajah yang muncul otomatis saat pelanggan datang.
3. **Catat transaksi tanpa ngetik** — pakai suara, lebih cepat & nggak masalah tangan kotor.
4. **Scan nota belanja selesai dalam hitungan detik** — nggak perlu input stok manual satu-satu lagi.
5. **Serah terima jaga nggak ada yang kelupaan** — uang, stok, utang, semua tercatat rapi saat ganti penjaga warung.

Ini lima hal yang paling bikin capek kalau masih manual — jadi prioritas biar user balik pakai app tiap hari, bukan coba sekali lalu lupa.

---

## 8. Metrik Sukses

| Metrik | Target | Cara Ukur |
|--------|--------|-----------|
| % transaksi dicatat lewat app vs manual | Mayoritas transaksi harian (>70%) | Tracking per device |
| Rekap akhir bulan: waktu yang dibutuhkan | Turun dari ~beberapa jam jadi hitungan menit | Survey user / time tracking |
| Berkurangnya kejadian "kehabisan stok tanpa sadar" | < 2x per bulan | Tracking stok out + notifikasi |
| Utang pelanggan tertagih tepat waktu | > 80% utang tertagih dalam 7 hari | Tracking kasbon |
| Penggunaan fitur suara untuk transaksi | > 40% transaksi pakai suara | Event tracking |
| Akurasi scan visual AI | > 85% top-1 suggestion benar | Internal testing + feedback |
| Akurasi OCR nota belanja | > 80% item terbaca benar | Internal testing |
| Retention harian (DAU/MAU) | > 60% | Analytics |
| NPS (Net Promoter Score) | > 50 | Survey bulanan |

---

## 9. Keputusan Produk

| Keputusan | Detail |
|-----------|--------|
| **Catat utang pelanggan** | Tetap must-have MVP. Konsisten sama cerita persona & alasan retensi harian, jadi tidak masuk akal ditunda. |
| **Platform** | Web app (PWA), mobile-first. Pak Budi & keluarga buka lewat browser HP dan "add to home screen" biar kerasa kayak app biasa — tanpa ribet install dari Play Store, lebih cepat di-develop & di-update. Kalau nanti butuh fitur native (push notification, kamera lebih smooth buat scan barang), baru pertimbangkan wrap jadi app Android. |
| **Akses multi-user** | 1 akun warung, login di beberapa device (HP Pak Budi, istri, anak) — tanpa role/permission rumit dulu di MVP. Semua yang login bisa catat transaksi & lihat semua data. Role terpisah bisa nyusul di fase 2. |
| **Offline-first** | Pencatatan transaksi jualan harus tetap jalan walau sinyal warung lagi jelek — data disimpan lokal dulu, auto-sync begitu ada internet. Fitur yang butuh data real-time dari device lain (pantau dari jauh) tetap butuh koneksi. |
| **Model bisnis** | Gratis di fase MVP/validasi. Warung kelontong sensitif harga — paywall di awal berisiko bikin adopsi gagal sebelum manfaatnya kebukti. Setelah user aktif kepake dan value-nya kebukti, baru masuk freemium (fitur dasar gratis selamanya, fitur lanjutan seperti multi-cabang/laporan advanced/Belanja Bareng berbayar). |
| **AI Visual Recognition** | Hybrid MobileNet + Visual Similarity (bukan object detection murni). Cukup 3–5 foto per barang saat input stok. Sistem suggest 2–3 kemungkinan, user tap yang benar. Akurasi 100% karena user konfirm. |
| **Voice-First** | Mode default transaksi adalah suara. Speech-to-Text yang paham bahasa lokal warung ("mie goreng" = Indomie Goreng, "kopi item" = Kopi Kapal Api). |
| **Face Detection** | MobileNet-based, lightweight, jalan di HP kentang. Cuma untuk pelanggan langganan yang sudah didaftarkan (bukan face recognition universal). |

---

## 10. Detail Fitur Unggulan (Differentiators)

### 10.1 Scan Barang — Hybrid MobileNet + Visual Similarity

**Mekanisme:**
- **Input Stok Pertama Kali:** Pak Budi foto barang 3 angle (depan, miring, dekat) + scan barcode + isi nama & harga. Sistem ekstrak vektor visual pakai MobileNetV3 (pre-trained) → simpan di IndexedDB.
- **Saat Transaksi:** Kamera live → ambil frame tiap 500ms → ekstrak vektor → bandingkan dengan semua vektor di database pakai Cosine Similarity → tampilkan 3 hasil paling mirip (threshold > 0.75) → user tap konfirmasi.
- **Fallback:** Kalau visual gagal → auto switch ke barcode scan → kalau gagal juga → input manual.

**Stack:** TensorFlow.js + MobileNetV3 + Web Worker (background processing) + IndexedDB.

### 10.2 Catat Transaksi Pakai Suara

**Mekanisme:**
- Tombol besar mikrofon di layar utama. Tekan & tahan → bicara → lepas → AI proses.
- Speech-to-Text pakai Web Speech API (Chrome Android native).
- NLP ringan untuk mapping bahasa lokal: "mie goreng" → cari di database barang dengan nama paling mirip → auto isi.
- Contoh: *"Tiga mie goreng, satu minyak goreng liter, dua kopi kapal api"* → auto jadi 3 item di keranjang dengan qty & harga.

### 10.3 Kasbon Kenal Wajah

**Mekanisme:**
- Saat input pelanggan baru: foto wajah + nama + no WA + alamat.
- Saat transaksi: kamera depan otomatis deteksi wajah (MobileNet-based face detection, lightweight).
- Kalau wajah cocok dengan database → muncul popup: nama, total utang, template belanjaan biasa.
- Pak Budi bisa langsung catat utang atau lihat riwayat.

### 10.4 Scan Nota Belanja (OCR)

**Mekanisme:**
- Pak Budi scan nota tulisan tangan/print dari pasar/grosir pakai kamera.
- OCR pakai Tesseract.js (pure JS, bisa offline).
- Regex pattern ekstrak: item name, qty, harga satuan, total.
- Auto-match dengan barang di database → kalau belum ada, tambahkan sebagai barang baru.
- Auto-update stok & harga modal.

### 10.5 Serah Terima Jaga (1-Tap Shift Handover)

**Mekanisme:**
- Tombol besar "Serah Terima Jaga" di dashboard.
- 1 tap → generate ringkasan:
  - Uang di laci vs penjualan tunai (deteksi selisih otomatis).
  - Total transaksi, tunai, utang.
  - Stok yang habis & perlu dibeli.
  - Utang baru yang tercatat.
- Konfirmasi oleh kedua pihak (yang serahkan & yang terima) dengan tanda tangan digital atau PIN.
- Riwayat serah terima tersimpan & bisa dilihat kapan saja.

### 10.6 Belanja Bareng — Koperasi Digital (Fase 2)

**Mekanisme:**
- App deteksi lokasi warung → sarankan grup belanja terdekat (radius 1–2 km).
- Warung join grup → tentukan jumlah pesanan per barang.
- Kalau kuota tercapai (misal: 100 pcs minyak goreng) → app generate PO ke supplier → barang dikirim ke 1 titik (warung ketua) → dibagi.
- App otomatis catat harga modal per warung & masukkan stok.

### 10.7 Langganan Sembako (Fase 2)

**Mekanisme:**
- Pak Budi bikin paket langganan (contoh: "Paket Ibu-Ibu" — 5 mie, 1L minyak, 1/2kg gula, 10 kopi = Rp 75.000/minggu).
- Pelanggan langganan via WA link atau scan QR.
- App otomatis: kurangi stok langganan dari inventory, kirim WA reminder, catat pembayaran.
- Dashboard prediksi pendapatan: "Minggu ini udah pasti Rp 375k dari 5 langganan."

### 10.8 Pintu Cuaca (Fase 2)

**Mekanisme:**
- Integrasi API BMKG untuk data cuaca lokal.
- Kalender event nasional & lokal (17 Agustus, Ramadhan, awal bulan gajian, dll).
- Algoritma prediksi sederhana: historis penjualan + cuaca/event → rekomendasi stok.
- Contoh: besok hujan 80% → prediksi mie instan +45%, telur +30% → notif: "Stok mie sisa 12 pcs, rekomendasi stok 30 pcs."

### 10.9 AI Asisten Suara (Fase 2)

**Mekanisme:**
- Bukan cuma command ("tambah transaksi"), tapi conversational.
- Pak Budi bisa nanya kapan saja: "Hari ini untung berapa?" "Stok apa yang mau habis?" "Siapa yang belum bayar?"
- STT → lightweight LLM (on-device atau API ringan) → query database lokal → TTS jawaban.
- Contoh jawaban: *"Hari ini untung Rp 147.500 dari 23 transaksi. Paling laris mie instan. Bu Siti utang Rp 50.000, sudah 5 hari."*

### 10.10 Tukar Tambah Stok (Fase 2)

**Mekanisme:**
- Fitur "Marketplace" mini antar warung di radius 500m–1km.
- Warung posting: "Kelebihan: Mie Instan 20 pcs. Butuh: Minyak Goreng 2 liter."
- Warung lain bisa lihat & tawarkan tukar.
- App catat barter sebagai transaksi stok (bukan uang).

---

## 11. Asumsi & Risiko

| Asumsi | Risiko | Mitigasi |
|--------|--------|----------|
| HP Pak Budi cukup kencang untuk AI visual | HP kentang lemot | MobileNetV3 alpha 0.5 + Web Worker + frame rate 2fps. Fallback ke suara/barcode |
| User mau foto barang saat input stok pertama kali | Malas foto | Bikin flow foto super cepat (3 foto otomatis berturut-turut). Bisa juga skip & pakai barcode only |
| Speech-to-Text paham bahasa lokal warung | Aksen daerah tidak terbaca | Training data lokal + fallback ke pilihan manual kalau STT gagal |
| OCR nota bisa baca tulisan tangan | Tulisan grosir berantakan | Fallback ke input manual per item. OCR sebagai accelerator, bukan pengganti |
| Warung mau belanja bareng | Trust issue antar warung | Grup berdasarkan komplek/RT yang sudah saling kenal. Transparansi harga & qty |

---

## 12. Roadmap

### Fase 1 — MVP (0–3 Bulan)
- ✅ Catat transaksi (suara, visual AI, barcode, manual)
- ✅ Stok barang real-time
- ✅ Laporan untung rugi harian/bulanan
- ✅ Data barang laris & tidak laku
- ✅ Rekomendasi barang priority
- ✅ Catat utang pelanggan + Kasbon Kenal Wajah
- ✅ Scan Nota Belanja (OCR)
- ✅ Serah Terima Jaga
- ✅ Offline-first + Cloud sync
- ✅ Multi-user 1 akun warung

### Fase 2 — Growth (3–6 Bulan)
- 🔄 Pintu Cuaca (prediksi berbasis cuaca & event)
- 🔄 AI Asisten Suara (conversational)
- 🔄 Belanja Bareng (koperasi digital)
- 🔄 Langganan Sembako
- 🔄 Tukar Tambah Stok
- 🔄 Push notification native (wrap jadi APK)
- 🔄 Role/permission multi-user terpisah

### Fase 3 — Monetisasi (6–12 Bulan)
- 💰 Freemium: fitur dasar gratis, fitur lanjutan berbayar
- 💰 Commission dari Belanja Bareng (potongan ke supplier)
- 💰 Langganan Pro: multi-cabang, laporan advanced, AI prediksi premium

---

*Dokumen ini adalah asumsi kerja berdasarkan konteks yang ada — kalau ada yang mau diubah, tinggal bilang.*
