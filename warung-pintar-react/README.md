# Warung Pintar — Frontend

Aplikasi React (Vite) buat Warung Pintar, sesuai `PRD_Warung_Pintar_Lengkap.md`. Manggil backend
di `../warung-pintar-backend` lewat REST API (lihat `src/lib/api.js`) — nggak ada data yang
disimpan lokal lagi kecuali preferensi tampilan (tema/warna/font/ukuran, per-HP).

## Cara jalanin

1. Jalanin dulu backend-nya (`../warung-pintar-backend`, lihat README di situ) — default di
   `http://localhost:4000`. Kalau backend-nya di alamat lain, bikin `.env` di sini isi:
   ```
   VITE_API_URL=http://alamat-backend-kamu:4000
   ```
2. Install & jalanin:
   ```
   npm install
   npm run dev
   ```

## Fitur kamera/AI beneran (bukan simulasi)

Beberapa fitur di sini beneran akses kamera & jalanin model AI di browser (bukan random-pick
simulasi kayak versi demo awal):

- **Voice-First** (Catat → 🎙️ Sebut barang) — Web Speech API bawaan browser (Chrome/Edge). Nggak
  butuh setup tambahan, tapi cuma jalan di browser yang dukung `SpeechRecognition`.
- **Scan Barcode** (Stok → Tambah/kelola barang → kamera) — `@zxing/browser`, decode barcode asli
  dari live camera.
- **Scan Barang / visual similarity** (Catat → 📷, dan Stok → foto) — `@tensorflow-models/mobilenet`
  jalan di browser (TensorFlow.js), embedding-nya dicocokkan ke backend (`POST /api/scan/visual`).
  Library-nya di-*lazy load* (baru didownload pas fitur ini dibuka), biar halaman utama tetap
  ringan buat HP kentang.
- **Kasbon Kenal Wajah** (Catat → 👤, dan waktu daftar pelanggan baru) — `@vladmandic/face-api`
  (fork face-api.js yang masih dirawat). Model weight-nya ada di `public/models/` (SSD MobileNet v1
  + face landmark 68 + face recognition, total ~12.5MB; file tiny lama masih disimpan tapi nggak
  dipakai lagi — alasannya di `src/lib/wajah.js`) — **kalau folder ini kehapus**,
  copy ulang dari package-nya:
  ```
  node -e "
  const fs = require('fs');
  const src = 'node_modules/@vladmandic/face-api/model';
  const dest = 'public/models';
  fs.mkdirSync(dest, { recursive: true });
  ['ssd_mobilenetv1_model-weights_manifest.json','ssd_mobilenetv1_model.bin',
   'face_landmark_68_model-weights_manifest.json','face_landmark_68_model.bin',
   'face_recognition_model-weights_manifest.json','face_recognition_model.bin']
   .forEach(f => fs.copyFileSync(src + '/' + f, dest + '/' + f));
  "
  ```

Semua fitur di atas nyimpen/nyocokin **vektor embedding** ke backend, bukan foto mentahnya —
sesuai arsitektur PRD 10.1 & 10.3 (model jalan di client, server cuma nyimpen & nyocokin — cosine
similarity buat barang, jarak Euclidean buat wajah, lihat `warung-pintar-backend/src/utils/wajah.js`).
