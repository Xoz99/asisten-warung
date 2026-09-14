// Scan Barang — Hybrid MobileNet + Visual Similarity (PRD 10.1).
// Model jalan di CLIENT (TensorFlow.js), backend cuma nyimpen & nyocokin vektor embedding-nya.
// alpha 1.0 (versi PALING akurat MobileNetV2 - dulu 0.5, versi ringan tapi kurang tajam bedain
// barang mirip, sering salah-kenal) - trade-off-nya model & downloadnya jadi lebih gede/lama pas
// pertama kali dibuka di HP jadul, tapi cocoknya jauh lebih presisi (keputusan sadar: akurasi
// menang, bukan kecepatan awal doang - lihat juga ambang cosine similarity di scan.routes.js
// yang dinaikin bareng perubahan ini).
//
// TensorFlow.js + MobileNet itu berat (>2MB) — di-import DINAMIS (baru didownload pas fitur ini
// beneran dibuka), bukan ikut ke-bundle di halaman utama. Biar orang yang nggak pernah pakai scan
// barang nggak ikut nunggu download library segede itu.
let modelPromise = null;

// Model disajikan dari server SENDIRI (public/models), bukan dari tfhub.dev. Sumber aslinya muter
// dulu lewat tfhub -> kaggle -> URL storage bertanda-tangan yang kedaluwarsa, tiap kali aplikasi
// dibuka dari nol - itu ~14 MB yang harus lolos rantai redirect lewat sinyal warung. Dari server
// sendiri dia dapet cache "immutable" (lihat index.js backend & public/_headers), jadi cukup
// sekali unduh.
//
// Isinya SAMA PERSIS sama yang dari tfhub (MobileNetV2 alpha 1.0, classification/2): diunduh dari
// URL yang dipakai library-nya sendiri, dan jumlah byte ke-4 shard-nya dicek cocok sama manifest
// (13.956.396 byte). Ini WAJIB sama, bukan cuma mirip - embedding foto barang yang udah tersimpan
// di database dihitung pakai bobot ini; bobot beda = semua barang lama nggak bakal kecocokan lagi.
const MODEL_LOKAL = '/models/mobilenet_v2_100_224/model.json';
const TIMEOUT_MODEL_MS = 25000; // sama alasannya kayak muatModelWajah() di wajah.js - koneksi
// lambat/tunnel kadang bikin download model nggak pernah resolve/reject, UI nyangkut selamanya

function denganTimeout(promise, ms, pesan) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(pesan)), ms))]);
}

export function muatModelVisual() {
  if (!modelPromise) {
    // '@tensorflow/tfjs' (bukan cuma tfjs-core) perlu diimpor duluan biar backend WebGL/CPU-nya
    // ke-registrasi otomatis (efek samping impornya) — mobilenet cuma peer-depend ke tfjs-core.
    modelPromise = denganTimeout(
      import('@tensorflow/tfjs')
        .then(() => import('@tensorflow-models/mobilenet'))
        .then((mobilenetLib) =>
          mobilenetLib
            // inputRange [0,1] WAJIB ikut. Library-nya cuma nyetel rentang input yang bener kalau
            // modelnya diambil dari tfhub (MODEL_INFO MobileNetV2: [0,1]); begitu dikasih modelUrl
            // dia jatuh ke default [-1,1]. Bobotnya sama persis, tapi gambarnya dinormalisasi beda
            // - kebukti waktu dites: berkas identik per byte, embedding-nya cuma mirip 72%. Tanpa
            // ini, semua foto barang yang udah terdaftar mendadak nggak kenal lagi.
            .load({ version: 2, alpha: 1.0, modelUrl: MODEL_LOKAL, inputRange: [0, 1] })
            // Berkas lokal nggak ada/gagal (mis. deploy lupa nyertain public/models) - balik ke
            // sumber aslinya daripada fitur scan foto mati total.
            .catch(() => mobilenetLib.load({ version: 2, alpha: 1.0 }))
        ),
      TIMEOUT_MODEL_MS,
      'Gagal memuat model pengenal barang - koneksi kelamaan/kurang stabil. Coba lagi.'
    ).catch((e) => {
      // JANGAN simpen promise yang gagal - biar percobaan berikutnya beneran nyoba ulang,
      // bukan langsung gagal lagi selamanya dengan error yang sama
      modelPromise = null;
      throw e;
    });
  }
  return modelPromise;
}

// imgEl bisa <video>, <img>, atau <canvas> yang lagi nampilin frame kamera.
export async function ambilEmbedding(imgEl) {
  const model = await muatModelVisual();
  const embeddingTensor = model.infer(imgEl, true); // true = embedding vektor, bukan 1000 kelas ImageNet
  const arr = await embeddingTensor.data();
  embeddingTensor.dispose();
  return Array.from(arr);
}
