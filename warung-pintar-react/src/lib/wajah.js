// Kasbon Kenal Wajah (PRD 10.3), lewat @vladmandic/face-api (fork face-api.js yang masih dirawat &
// kompatibel sama TensorFlow.js versi baru). Model weight-nya ada di public/models (lihat README) -
// dimuat dari situ, bukan CDN, biar tetap bisa dipakai offline setelah pemuatan pertama (cache browser).
//
// Library-nya berat, jadi diimpor DINAMIS - baru didownload pas fitur kenal wajah/daftar pelanggan
// beneran dipakai, bukan ikut ke-bundle di halaman utama.
//
// SUSUNAN MODEL (versi 2): SSD MobileNet v1 (deteksi) + landmark 68 PENUH + face recognition net.
// Dulu (versi 1) pakai TinyFaceDetector + landmark tiny biar ringan - ternyata descriptor-nya terlalu
// acak buat dipakai ngenalin orang: diukur di 40 foto 8 orang, jarak "orang yang sama" (median 0.70)
// sama "orang beda" (median 0.74) numpuk, nggak ada batas yang aman. Di lapangan: bapak-bapak dikenali
// sebagai pelanggan lain. Landmark penuh doang nggak nolong (masih numpuk) - kotak wajah dari tiny
// detector-nya yang kurang pas. Dengan SSD: orang sama median 0.47, orang beda paling dekat 0.60.
// Harganya: model ~5,6MB lebih besar & tiap deteksi lebih berat.
//
// Descriptor beda susunan model NGGAK BISA dibandingin - makanya ada VERSI_MODEL_WAJAH yang ikut
// dikirim ke backend. Ganti susunan model = naikin versinya.
export const VERSI_MODEL_WAJAH = 2;

const MODEL_URL = '/models';
const TIMEOUT_MODEL_MS = 40000; // model SSD lebih gede - koneksi lambat kadang bikin fetch nggak pernah resolve/reject, tanpa ini UI bisa nyangkut selamanya
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
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
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

// FOTO DIAM digambar ulang ke kanvas maks 640px sebelum dideteksi. SSD ngecilin input apa pun ke
// 512x512 tanpa jaga rasio - foto potret 600x800 jadi gepeng & wajahnya sering nggak kedeteksi (diukur:
// foto mentah cuma 9/40 kedeteksi). Ditaruh di tengah kanvas 4:3 bergaya bingkai kamera, sama persis kayak
// yang dilihat model waktu ngenalin dari video - biar descriptor pendaftaran & pengenalan sebanding.
function siapkanFoto(img) {
  const W = 640;
  const H = 480;
  const kanvas = document.createElement('canvas');
  kanvas.width = W;
  kanvas.height = H;
  const ctx = kanvas.getContext('2d');
  ctx.fillStyle = '#777';
  ctx.fillRect(0, 0, W, H);
  const lebar = img.naturalWidth || img.videoWidth || img.width;
  const tinggi = img.naturalHeight || img.videoHeight || img.height;
  const s = Math.min(W / lebar, H / tinggi) * 0.8;
  ctx.drawImage(img, (W - lebar * s) / 2, (H - tinggi * s) / 2, lebar * s, tinggi * s);
  return kanvas;
}

// Foto sekali jepret: nggak ada kesempatan kedua, jadi dicoba sampai ambang yang lebih longgar.
const AMBANG_FOTO = [0.5, 0.3];
// Video langsung: frame berikutnya dateng lagi sebentar, jadi cukup sekali jalan dengan ambang yang
// wajar - wajah yang samar/ketutup mending dilewat daripada ngasilin descriptor jelek.
const AMBANG_VIDEO = [0.5];

// videoOrImg: elemen <video>/<img>/<canvas> yang lagi nampilin wajah. Balikin array 128 angka
// (face descriptor) kalau ketemu wajah, atau null kalau nggak ada wajah kedeteksi.
// `cepat: true` buat sumber VIDEO yang di-loop, default (false) buat foto sekali jepret.
export async function ambilDeskriptorWajah(videoOrImg, { cepat = false } = {}) {
  const faceapi = await muatLibrary();
  await muatModelWajah();
  const input = cepat ? videoOrImg : siapkanFoto(videoOrImg);
  for (const minConfidence of cepat ? AMBANG_VIDEO : AMBANG_FOTO) {
    const hasil = await faceapi
      .detectSingleFace(input, new faceapi.SsdMobilenetv1Options({ minConfidence }))
      .withFaceLandmarks()
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
    kanvas.height = 240;
    const ctx = kanvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, 320, 240);
    }
    await faceapi.detectSingleFace(kanvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }));
  } catch {
    /* optimasi doang - gagal nggak apa-apa */
  }
}
