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

// ---- Jalur WORKER (utama) ----------------------------------------------------------------------------
// Semua deteksi & pemuatan model jalan di lib/wajahWorker.js, bukan di thread tampilan. Diukur dengan CPU
// dilambatin kayak HP menengah: di thread utama, sheet Kenal wajah bikin aplikasi beku sampai 11,8 detik
// sekali jalan (garis scan berhenti, tombol Tutup nggak nanggap). Jalur lama di bawah cuma cadangan buat
// browser yang nggak bisa jalanin worker-nya.
let worker = null;
let workerRusak = false;
let nomorPesan = 0;
const nungguBalasan = new Map();

function ambilWorker() {
  if (workerRusak) return null;
  if (!worker) {
    try {
      worker = new Worker(new URL('./wajahWorker.js', import.meta.url), { type: 'module' });
    } catch {
      workerRusak = true;
      return null;
    }
    worker.onmessage = ({ data }) => {
      const tunggu = nungguBalasan.get(data.id);
      if (!tunggu) return;
      nungguBalasan.delete(data.id);
      if (data.ok) tunggu.resolve(data);
      else tunggu.reject(new Error(data.pesan));
    };
    // Worker gagal dimuat/crash (browser lama, modulnya error) - semua yang lagi nunggu dilepas, dan
    // selanjutnya pakai jalur thread utama.
    worker.onerror = (e) => {
      e.preventDefault?.();
      workerRusak = true;
      worker = null;
      for (const t of nungguBalasan.values()) t.reject(new Error('WORKER_RUSAK'));
      nungguBalasan.clear();
    };
  }
  return worker;
}

function kirimKeWorker(w, pesan, transfer = []) {
  return new Promise((resolve, reject) => {
    const id = ++nomorPesan;
    nungguBalasan.set(id, { resolve, reject });
    w.postMessage({ ...pesan, id }, transfer);
  });
}

let workerSiap = null;
function siapkanWorker() {
  const w = ambilWorker();
  if (!w) return null;
  if (!workerSiap) {
    workerSiap = denganTimeout(kirimKeWorker(w, { tipe: 'muat' }), TIMEOUT_MODEL_MS, 'Gagal memuat model pengenal wajah - koneksi kelamaan/kurang stabil. Coba lagi.').catch((e) => {
      workerSiap = null;
      throw e;
    });
  }
  return workerSiap;
}

// Kanvas buat ngambil pixel frame video - dipakai ulang, nggak bikin baru tiap percobaan.
let kanvasFrame = null;
const LEBAR_MAKS_FRAME = 640;

function ambilPixel(sumber) {
  const lebarAsli = sumber.videoWidth || sumber.naturalWidth || sumber.width;
  const tinggiAsli = sumber.videoHeight || sumber.naturalHeight || sumber.height;
  if (!lebarAsli || !tinggiAsli) return null; // video belum siap
  const skala = Math.min(1, LEBAR_MAKS_FRAME / Math.max(lebarAsli, tinggiAsli));
  const lebar = Math.round(lebarAsli * skala);
  const tinggi = Math.round(tinggiAsli * skala);
  if (!kanvasFrame) kanvasFrame = document.createElement('canvas');
  if (kanvasFrame.width !== lebar) kanvasFrame.width = lebar;
  if (kanvasFrame.height !== tinggi) kanvasFrame.height = tinggi;
  const ctx = kanvasFrame.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(sumber, 0, 0, lebar, tinggi);
  return { data: ctx.getImageData(0, 0, lebar, tinggi).data.buffer, lebar, tinggi };
}

// ---- Jalur thread utama (cadangan) ------------------------------------------------------------------
// Foto sekali jepret: nggak ada kesempatan kedua, jadi dicoba sampai ambang yang lebih longgar.
const AMBANG_FOTO = [0.5, 0.3];
// Video langsung: coba ambang wajar dulu, kalau nggak nemu wajah baru longgarin sekali. Dulu cuma [0.5] -
// wajah yang agak miring/kena bayangan di kamera depan HP sering dilewat padahal jelas & terang. Descriptor
// jelek dari frame longgar nggak bahaya: hasilnya dirata-rata beberapa frame & tetap harus lolos batas cocok
// di server (lihat lib/sampelWajah.js). Jalannya di worker, jadi percobaan kedua nggak bikin layar macet.
const AMBANG_VIDEO = [0.5, 0.3];

// videoOrImg: elemen <video>/<img>/<canvas> yang lagi nampilin wajah. Balikin array 128 angka
// (face descriptor) kalau ketemu wajah, atau null kalau nggak ada wajah kedeteksi.
// `cepat: true` buat sumber VIDEO yang di-loop, default (false) buat foto sekali jepret.
export async function ambilDeskriptorWajah(videoOrImg, { cepat = false } = {}) {
  if (siapkanWorker()) {
    try {
      await siapkanWorker();
      const pixel = ambilPixel(cepat ? videoOrImg : siapkanFoto(videoOrImg));
      if (!pixel) return null;
      const balasan = await kirimKeWorker(
        worker,
        { tipe: 'deteksi', ...pixel, ambang: cepat ? AMBANG_VIDEO : AMBANG_FOTO },
        [pixel.data]
      );
      return balasan.descriptor;
    } catch (e) {
      if (e.message !== 'WORKER_RUSAK') throw e;
      // worker mati di tengah jalan -> lanjut pakai jalur thread utama di bawah
    }
  }
  return ambilDeskriptorWajahThreadUtama(videoOrImg, { cepat });
}

async function ambilDeskriptorWajahThreadUtama(videoOrImg, { cepat }) {
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
    if (siapkanWorker()) {
      await siapkanWorker(); // worker udah manasin model sendiri pas dimuat
      return;
    }
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
