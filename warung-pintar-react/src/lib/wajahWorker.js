// Pengenal wajah yang jalan di WEB WORKER (thread terpisah dari tampilan).
//
// Kenapa: face-api/TensorFlow.js di thread utama bikin SELURUH aplikasi beku tiap satu deteksi jalan -
// garis scan berhenti, video patah-patah, tombol "Tutup" nggak bisa dipencet. Tiap deteksi SSD itu ratusan
// milidetik sampai beberapa detik di HP, dan hasil GPU-nya ditarik balik secara sinkron. Di worker, semua
// kerja berat itu nggak nyentuh thread tampilan sama sekali.
//
// Worker nggak punya document/<img>/<video>, jadi yang dikirim ke sini PIXEL mentah (RGBA dari kanvas di
// thread utama), dan face-api dikasih "environment" versi worker (OffscreenCanvas + fetch).
//
// Pesan masuk:  { id, tipe: 'muat' }
//               { id, tipe: 'deteksi', data: ArrayBuffer RGBA, lebar, tinggi, ambang: [0.5, 0.3] }
// Pesan keluar: { id, ok: true, descriptor: number[] | null }  atau  { id, ok: false, pesan }
import * as faceapi from '@vladmandic/face-api';

const MODEL_URL = '/models';

faceapi.env.setEnv({
  Canvas: OffscreenCanvas,
  CanvasRenderingContext2D: OffscreenCanvasRenderingContext2D,
  Image: class {},
  ImageData,
  Video: class {},
  createCanvasElement: () => new OffscreenCanvas(1, 1),
  createImageElement: () => {
    throw new Error('Nggak ada <img> di worker');
  },
  createVideoElement: () => {
    throw new Error('Nggak ada <video> di worker');
  },
  fetch: (...arg) => fetch(...arg),
  readFile: () => {
    throw new Error('Nggak ada filesystem di worker');
  },
});

let siap = null;

function muat() {
  if (!siap) {
    siap = (async () => {
      const tf = faceapi.tf;
      // WebGL di worker jalan lewat OffscreenCanvas. HP/browser yang belum dukung jatuh ke CPU - lebih lambat,
      // tapi tetap di thread terpisah, jadi tampilan nggak ikut beku.
      try {
        await tf.setBackend('webgl');
      } catch {
        await tf.setBackend('cpu');
      }
      await tf.ready();
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      // Panasin: shader WebGL baru dikompilasi pas inferensi pertama (bisa 1-3 detik). Dijalanin di sini biar
      // ongkosnya nggak nempel ke percobaan pertama pas kamera udah diarahin ke pembeli.
      const kosong = tf.zeros([240, 320, 3], 'int32');
      try {
        await faceapi.detectSingleFace(kosong, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }));
      } finally {
        kosong.dispose();
      }
      return tf.getBackend();
    })().catch((e) => {
      siap = null; // gagal jangan disimpen - percobaan berikutnya nyoba muat ulang beneran
      throw e;
    });
  }
  return siap;
}

async function deteksi({ data, lebar, tinggi, ambang }) {
  await muat();
  const tf = faceapi.tf;
  const gambar = tf.browser.fromPixels({ data: new Uint8Array(data), width: lebar, height: tinggi });
  try {
    for (const minConfidence of ambang) {
      const hasil = await faceapi
        .detectSingleFace(gambar, new faceapi.SsdMobilenetv1Options({ minConfidence }))
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (hasil) return Array.from(hasil.descriptor);
    }
    return null;
  } finally {
    gambar.dispose();
  }
}

self.onmessage = async ({ data: pesan }) => {
  try {
    if (pesan.tipe === 'muat') {
      const backend = await muat();
      self.postMessage({ id: pesan.id, ok: true, backend });
    } else if (pesan.tipe === 'deteksi') {
      self.postMessage({ id: pesan.id, ok: true, descriptor: await deteksi(pesan) });
    }
  } catch (e) {
    self.postMessage({ id: pesan.id, ok: false, pesan: e?.message || String(e) });
  }
};
