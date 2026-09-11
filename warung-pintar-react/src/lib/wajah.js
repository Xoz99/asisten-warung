// Kasbon Kenal Wajah (PRD 10.3). Pakai tiny face detector + face landmark (varian tiny) +
// face recognition net — semuanya ringan, jalan di browser lewat @vladmandic/face-api (fork
// face-api.js yang masih dirawat & kompatibel sama TensorFlow.js versi baru).
// Model weight-nya disalin ke public/models saat setup (lihat README) — dimuat dari situ, bukan CDN,
// biar tetap bisa dites/dipakai offline setelah pemuatan pertama (cache browser).
//
// Library-nya berat, jadi diimpor DINAMIS — baru didownload pas fitur kenal wajah/daftar
// pelanggan beneran dipakai, bukan ikut ke-bundle di halaman utama.
const MODEL_URL = '/models';
const TIMEOUT_MODEL_MS = 25000; // koneksi lambat/tunnel kadang bikin fetch model nggak pernah resolve/reject sama sekali - tanpa ini UI bisa nyangkut selamanya tanpa error apapun
let faceapiPromise = null;
let dimuat = null;

function muatLibrary() {
  if (!faceapiPromise) faceapiPromise = import('@vladmandic/face-api');
  return faceapiPromise;
}

function denganTimeout(promise, ms, pesan) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(pesan)), ms)),
  ]);
}

export async function muatModelWajah() {
  const faceapi = await muatLibrary();
  if (!dimuat) {
    dimuat = denganTimeout(
      Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]),
      TIMEOUT_MODEL_MS,
      'Gagal memuat model pengenal wajah - koneksi kelamaan/kurang stabil. Coba lagi.'
    ).catch((e) => {
      // JANGAN simpen promise yang gagal - kalau nggak, percobaan BERIKUTNYA bakal kena error
      // yang sama terus-terusan tanpa pernah nyoba ulang beneran (dulu ini bug: gagal sekali =
      // gagal selamanya sampai halaman di-reload).
      dimuat = null;
      throw e;
    });
  }
  return dimuat;
}

// Bikin elemen <img> dari data URL (hasil <input capture> atau FileReader) buat diproses face-api.
export function gambarDariDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gagal memuat foto'));
    img.src = dataUrl;
  });
}

// videoOrImg: elemen <video>/<img>/<canvas> yang lagi nampilin wajah. Balikin array 128 angka
// (face descriptor) kalau ketemu wajah, atau null kalau nggak ada wajah kedeteksi.
//
// Setting default TinyFaceDetector (inputSize 416, scoreThreshold 0.5) ternyata kegedean
// standarnya buat foto asli (wajah kejauhan/miring/kurang cahaya sering nggak kedeteksi sama
// sekali — pernah ketauan 2 dari 4 pendaftaran gagal diam-diam). Sekarang dicoba beberapa
// kombinasi inputSize + scoreThreshold, dari yang paling ketat ke paling longgar, biar recall-nya
// naik — cuma dipakai buat DETEKSI, keakuratan pencocokan tetap dijaga lewat face descriptor-nya
// sendiri (128 dimensi) + threshold similarity di /api/wajah/identifikasi.
const KOMBINASI_DETEKSI = [
  { inputSize: 416, scoreThreshold: 0.5 },
  { inputSize: 512, scoreThreshold: 0.3 },
  { inputSize: 608, scoreThreshold: 0.15 },
];

// Setelan buat VIDEO LANGSUNG - SATU kali jalan, ukuran kecil.
//
// Sapuan 3 kombinasi di atas itu buat FOTO DIAM: cuma ada satu gambar, nggak ada kesempatan kedua,
// jadi wajar dicoba sampai mentok. Di video LANGSUNG hitungannya beda total - frame berikutnya
// dateng tiap ~0,7 detik, jadi "gagal di frame ini" bukan masalah. Maksain 3 kombinasi tiap frame
// bikin tiap percobaan ~5x lebih berat (608x608 itu 2x kerjaan 416x416) buat keuntungan yang
// nol - HP-nya panas, preview-nya patah-patah, dan deteksinya malah kerasa lebih lama.
//
// 320 cukup karena kasusnya selfie jarak dekat ("arahkan kamera depan ke pembeli"), bukan wajah
// kejauhan di foto rame. Threshold 0.4 sedikit lebih longgar dari 0.5 buat ngimbangin ukuran
// yang dikecilin.
const KOMBINASI_VIDEO = [{ inputSize: 320, scoreThreshold: 0.4 }];

// `cepat: true` buat sumber VIDEO yang di-loop, default (false) buat foto sekali jepret.
export async function ambilDeskriptorWajah(videoOrImg, { cepat = false } = {}) {
  const faceapi = await muatLibrary();
  await muatModelWajah();
  for (const opsi of cepat ? KOMBINASI_VIDEO : KOMBINASI_DETEKSI) {
    const hasil = await faceapi
      .detectSingleFace(videoOrImg, new faceapi.TinyFaceDetectorOptions(opsi))
      .withFaceLandmarks(true)
      .withFaceDescriptor();
    if (hasil) return Array.from(hasil.descriptor);
  }
  return null;
}

// Panasin mesinnya pakai gambar kosong. TensorFlow.js baru nyusun & meng-compile shader WebGL-nya
// pas inferensi PERTAMA dijalanin - itu makan waktu sendiri (bisa 1-3 detik), dan tanpa ini
// ongkosnya nempel ke percobaan pertama user, persis pas dia lagi ngarahin kamera ke pembeli dan
// paling nggak sabar nunggu. Dijalanin pas model kelar dimuat, waktu user masih baca "Mengenali
// wajah..." - jadi nggak kerasa.
//
// Kegagalan di sini SENGAJA ditelan: ini murni optimasi, kalau gagal ya deteksi asli tetap jalan
// (cuma percobaan pertamanya balik lambat kayak dulu).
export async function panaskanModelWajah() {
  try {
    const faceapi = await muatLibrary();
    await muatModelWajah();
    const kanvas = document.createElement('canvas');
    kanvas.width = 320;
    kanvas.height = 320;
    const ctx = kanvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, 320, 320);
    }
    await faceapi.detectSingleFace(kanvas, new faceapi.TinyFaceDetectorOptions(KOMBINASI_VIDEO[0]));
  } catch {
    /* optimasi doang - gagal nggak apa-apa */
  }
}
