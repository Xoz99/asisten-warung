// Loop scan barcode LIVE — dipakai bareng antara Stok (menu "Scan Barcode" khusus) & Catat Jualan
// (mode hybrid: barcode ATAU foto barang, PRD 10.1). Diekstrak ke sini biar logic-nya cuma sekali
// ada, gak keduplikat & gampang ketinggalan pas ada perbaikan di satu tempat doang.

// Format barcode yang umum dipakai kemasan retail Indonesia.
export const FORMAT_RETAIL = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'];

// Ambil frame video, di-CROP cuma bagian yang kelihatan di kotak scan (kotak putih ".frame", CSS-nya
// inset 16% — lihat index.css .viewfinder .frame) — bukan seluruh frame kamera. Lebih cepat (area
// yang diproses jauh lebih kecil) dan lebih akurat (rak/tangan di luar kotak nggak ikut ganggu).
// .viewfinder persegi sedangkan video landscape & object-fit: cover, jadi yang kelihatan cuma
// bagian tengah seluas sisi terpendeknya - makanya ROI dihitung dari situ.
//
// `canvasTujuan` (opsional): canvas yang DIPAKAI ULANG. Pemanggil di dalam LOOP wajib nyiapin 1
// canvas di luar loop - bikin canvas baru tiap putaran bikin ratusan elemen numpuk sampai browser
// nolak bikin canvas baru ("Could not create a Canvas element").
export function ambilCanvasROI(video, maksSisi, canvasTujuan) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const sisi = Math.min(vw, vh);
  const ox = (vw - sisi) / 2;
  const oy = (vh - sisi) / 2;
  const inset = sisi * 0.16; // samain sama CSS .viewfinder .frame{ inset: 16% }
  const sx = ox + inset;
  const sy = oy + inset;
  const sw = sisi - inset * 2;
  const sh = sisi - inset * 2;
  const skala = Math.min(1, maksSisi / sw);
  const lebar = Math.round(sw * skala);
  const tinggi = Math.round(sh * skala);
  const canvas = canvasTujuan || document.createElement('canvas');
  // Ukuran cuma diset kalau BERUBAH. Ngisi canvas.width - walau nilainya sama persis - itu
  // ngebuang & ngalokasi ulang seluruh isi canvas; di loop live itu kejadian tiap putaran.
  if (canvas.width !== lebar) canvas.width = lebar;
  if (canvas.height !== tinggi) canvas.height = tinggi;
  // willReadFrequently: ZXing baca pikselnya lewat getImageData tiap putaran. Tanpa petunjuk ini
  // Chrome naruh canvas-nya di GPU, dan tiap pembacaan harus narik balik datanya dari GPU.
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, lebar, tinggi);
  return canvas;
}

// --- Dekoder ZXing TANPA canvas baru ----------------------------------------------------------
// ZXing versi browser (decodeFromCanvas) bikin objek sumber gambar baru tiap dekode, dan waktu
// TRY_HARDER nyoba barcode yang TEGAK dia muter gambarnya lewat CANVAS SEMENTARA - satu canvas
// baru tiap dekode yang gagal. Di loop yang muter terus, canvas itu numpuk sampai browser nolak
// bikin canvas lagi ("Could not create a Canvas element", kebukti muncul pas dites) - dan keadaan
// itu nggak ilang sampai aplikasinya dimatiin paksa.
//
// Di sini pikselnya dibaca sekali dari canvas yang dipakai ulang, diubah jadi abu-abu ke buffer
// yang juga dipakai ulang, lalu dikasih ke ZXing sebagai array. Sumber model ini (RGBLuminanceSource)
// nggak dukung rotasi, jadi ZXing nggak bikin canvas apa pun. Barcode tegak tetap kebaca: muter
// 90 derajatnya dikerjain sendiri di array (tanpa canvas), dipanggil pakai putar=true.
export async function buatDekoderZxing() {
  const { MultiFormatReader, BinaryBitmap, HybridBinarizer, RGBLuminanceSource, DecodeHintType, BarcodeFormat } =
    await import('@zxing/library');
  const reader = new MultiFormatReader();
  const hints = new Map();
  // TRY_HARDER tetap nyala - sempat dimatiin buat ngejar kecepatan, tapi akurasi kejauhan jadi
  // korban. Bebannya diatur lewat jeda di loop, bukan dengan ngorbanin ketelitian.
  hints.set(DecodeHintType.TRY_HARDER, true);
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.QR_CODE,
  ]);
  reader.setHints(hints);
  let lum = null;
  let lumPutar = null;

  // Balikin teks barcode, atau null kalau nggak ketemu.
  const dekode = (canvas, putar = false) => {
    const w = canvas.width;
    const h = canvas.height;
    if (!w || !h) return null;
    const data = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    const n = w * h;
    if (!lum || lum.length !== n) lum = new Uint8ClampedArray(n);
    // Rumus abu-abunya sama persis kayak yang dipakai ZXing versi browser sendiri. HARUS
    // Uint8ClampedArray: RGBLuminanceSource cuma nganggep array 1-byte sebagai nilai abu-abu jadi;
    // array 4-byte (Int32Array) dia anggap warna RGB dan dikonversi ulang.
    for (let i = 0, j = 0; i < n; i++, j += 4) lum[i] = (306 * data[j] + 601 * data[j + 1] + 117 * data[j + 2] + 0x200) >> 10;
    let sumber = lum;
    let lebar = w;
    let tinggi = h;
    if (putar) {
      if (!lumPutar || lumPutar.length !== n) lumPutar = new Uint8ClampedArray(n);
      // Putar 90 derajat berlawanan jarum jam: titik (x, y) pindah ke (y, w-1-x), lebar baru = h.
      for (let y = 0; y < h; y++) {
        const baris = y * w;
        for (let x = 0; x < w; x++) lumPutar[(w - 1 - x) * h + y] = lum[baris + x];
      }
      sumber = lumPutar;
      lebar = h;
      tinggi = w;
    }
    try {
      return reader.decodeWithState(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(sumber, lebar, tinggi)))).getText();
    } catch {
      return null; // NotFound/Checksum/Format - frame ini emang belum kebaca, bukan error beneran
    } finally {
      reader.reset();
    }
  };

  return { dekode };
}

// --- Pengatur beban loop ---------------------------------------------------------------------
// Diukur di build produksi dengan CPU dilambatin 6x (kira-kira HP kelas menengah), loop versi lama
// bikin main thread KEBLOKIR 84-87% dan layar turun ke ~12 fps - itu "gelag" waktu scan. Dua sebab:
//
// 1. Detektor bawaan (BarcodeDetector, ringan & dibantu hardware) DIBUANG PERMANEN begitu 25x
//    balikin kosong (~1 detik). Padahal "kosong" itu keadaan NORMAL selama barcode belum masuk
//    kamera. Jadi di pemakaian biasa, HP Android pun ujungnya pindah ke ZXing.
// 2. ZXing (TRY_HARDER, 900px) makan ~250ms per putaran di main thread, dan putaran berikutnya
//    langsung disambung 30ms kemudian - HP nggak pernah dikasih napas buat gambar layar/nerima tap.
//
// Sekarang: detektor bawaan TETAP jalan terus kalau ada; ZXing cuma NYELANG kalau bawaan belum
// nemu apa-apa, dan tiap selesai dekode dia dijeda minimal 3x lama dekodenya sendiri. Jedanya
// ngikutin kecepatan HP: HP lambat otomatis dapet jeda lebih panjang, jadi ZXing nggak pernah
// makan lebih dari ~25% main thread.
const BATAS_KOSONG_NATIVE = 25; // ~1 detik kosong dulu baru ZXing ikut nyelang
const JEDA_NATIVE_MS = 40;
const JEDA_ZXING_MIN_MS = 250;
const KALI_JEDA_ZXING = 3;

// Mulai loop scan barcode live di background. `onDetect(kode)` dipanggil begitu ketemu - loop
// OTOMATIS berhenti sesaat sebelum manggil ini (biar nggak dobel-detect); kalau pemanggil mau
// lanjut scan lagi, panggil ulang mulaiScanBarcode(). Return {stop()}.
//
// - `videoRef`: ref ke elemen <video> yang lagi nampilin live camera.
// - `matiRef`: ref boolean - true kalau komponen pemanggilnya udah unmount/sheet ditutup.
export function mulaiScanBarcode({ videoRef, matiRef, onDetect }) {
  // BarcodeDetector: API bawaan Chrome/Edge Android & desktop, hardware-accelerated. Di Android
  // jalannya lewat Google Play Services (ML Kit) - kalau Play Services-nya bermasalah, detect()
  // nggak error, cuma diam-diam selalu balikin kosong. Makanya ZXing tetap ikut nyelang kalau
  // bawaan lama nggak nemu apa-apa. iPhone nggak punya BarcodeDetector sama sekali -> ZXing doang.
  // eslint-disable-next-line no-console
  console.log('[barcode] BarcodeDetector tersedia di browser ini:', 'BarcodeDetector' in window);
  let detector = null;
  if ('BarcodeDetector' in window) {
    try {
      detector = new window.BarcodeDetector({ formats: FORMAT_RETAIL });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('[barcode] format list ditolak, pakai default:', e.message);
      detector = new window.BarcodeDetector();
    }
  }
  let zxing = null; // disiapin sekali aja pas beneran dibutuhin (library-nya lumayan berat)
  const siapkanZXing = async () => {
    if (!zxing) zxing = await buatDekoderZxing();
    return zxing;
  };

  const canvasScan = document.createElement('canvas'); // 1 canvas dipakai ULANG tiap putaran
  let berhenti = false;
  let putaran = 0;
  let nativeKosong = 0;
  let zxingBolehLagi = 0; // performance.now() paling cepat ZXing boleh jalan lagi
  let zxingPutar = false; // gantian tiap giliran: posisi normal, lalu diputar 90 derajat

  const lanjut = (ms) => {
    if (!matiRef.current && !berhenti) setTimeout(loop, ms);
  };

  const loop = async () => {
    if (matiRef.current || berhenti) return;
    // Aplikasi lagi di latar (pindah aplikasi, layar HP mati): jangan ngedekode apa-apa. Kamera
    // di latar nggak ngirim gambar baru, jadi kerjaannya sia-sia & cuma nguras baterai.
    if (document.hidden) return lanjut(300);
    const video = videoRef.current;
    if (!video || video.readyState < 2) return lanjut(60);
    putaran++;

    if (detector) {
      const canvas = ambilCanvasROI(video, 900, canvasScan);
      try {
        const timeoutDetect = new Promise((resolve) => setTimeout(() => resolve([]), 2000));
        const hasil = await Promise.race([detector.detect(canvas), timeoutDetect]);
        if (matiRef.current || berhenti) return;
        if (putaran % 40 === 1) {
          // eslint-disable-next-line no-console
          console.log(`[barcode] putaran #${putaran} - bawaan ketemu:`, hasil.length);
        }
        if (hasil.length) {
          berhenti = true;
          return onDetect(hasil[0].rawValue);
        }
        nativeKosong++;
      } catch (e) {
        // detect() beneran ERROR (bukan cuma kosong) - itu tanda bawaannya emang nggak jalan di
        // HP ini, baru di situ dia dilepas.
        // eslint-disable-next-line no-console
        console.log('[barcode] detect() error, lanjut pakai ZXing:', e.name, e.message);
        detector = null;
      }
    }

    const perluZxing = !detector || nativeKosong >= BATAS_KOSONG_NATIVE;
    if (perluZxing && performance.now() >= zxingBolehLagi) {
      const dekoder = await siapkanZXing();
      if (matiRef.current || berhenti) return;
      const canvas = ambilCanvasROI(video, 900, canvasScan); // frame terbaru, bukan sisa putaran tadi
      const mulai = performance.now();
      // Posisi normal & diputar 90 derajat GANTIAN per giliran, bukan dua-duanya sekaligus - biar
      // beban tiap giliran tetap satu dekode. Barcode tegak cuma telat satu giliran kebacanya.
      zxingPutar = !zxingPutar;
      try {
        const kode = dekoder.dekode(canvas, zxingPutar);
        if (kode) {
          berhenti = true;
          return onDetect(kode);
        }
        if (putaran % 40 === 1) {
          // eslint-disable-next-line no-console
          console.log(`[barcode][zxing] putaran #${putaran} - belum nemu (putar=${zxingPutar})`);
        }
      } finally {
        const lama = performance.now() - mulai;
        zxingBolehLagi = performance.now() + Math.max(JEDA_ZXING_MIN_MS, lama * KALI_JEDA_ZXING);
      }
    }

    if (detector) return lanjut(JEDA_NATIVE_MS);
    lanjut(Math.max(30, zxingBolehLagi - performance.now()));
  };

  loop();
  return { stop: () => (berhenti = true) };
}
