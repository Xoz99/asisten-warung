// Loop scan barcode LIVE — dipakai bareng antara Stok (menu "Scan Barcode" khusus) & Catat Jualan
// (mode hybrid: barcode ATAU foto barang, PRD 10.1). Diekstrak ke sini biar logic-nya cuma sekali
// ada, gak keduplikat & gampang ketinggalan pas ada perbaikan di satu tempat doang.

// Format barcode yang umum dipakai kemasan retail Indonesia.
export const FORMAT_RETAIL = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'];

// Ambil frame video, di-CROP cuma bagian yang kelihatan di kotak scan (kotak putih ".frame", CSS-nya
// inset 16% — lihat index.css .viewfinder .frame) — bukan seluruh frame kamera. Ini yang dipakai app
// scanner beneran (bukan cuma kita) buat 2 alasan: (1) LEBIH CEPET — area yang diproses jauh lebih
// kecil ketimbang scan seluruh gambar 1280x720/1920x1080, (2) LEBIH AKURAT — background di luar
// kotak (rak, tangan, dll) gak ikut ganggu si decoder nyari pola barcode.
// .viewfinder sendiri persegi (aspect-ratio:1) sedangkan video biasanya landscape & object-fit:
// cover, jadi yang kelihatan di layar cuma bagian tengah video seluas sisi terpendeknya — makanya
// itung ROI-nya dari situ, bukan dari videoWidth/videoHeight mentah.
//
// `canvasTujuan` (opsional): canvas yang mau DIPAKAI ULANG, bukan bikin baru. Fungsi ini dipanggil
// tiap TICK di loop scan live (tiap ~30-40ms selama sheet-nya kebuka) - kalau tiap panggilan bikin
// `document.createElement('canvas')` baru (perilaku lama), dalam beberapa detik aja udah numpuk
// ratusan-ribuan elemen canvas belum ke-GC, sampai akhirnya browser nolak bikin canvas/context baru
// lagi ("Could not create a Canvas element" - nemu ini pas ada laporan barcode gagal MULU walau
// TRY_HARDER udah nyala). Pemanggil yang manggil ini di dalam LOOP wajib nyiapin 1 canvas di luar
// loop-nya lalu oper ke sini terus-terusan (lihat mulaiScanBarcode & ambilFotoBarcode di Stok.jsx) -
// pemanggil sekali-jepret biasa (bukan loop) boleh biarin kosong, otomatis dibikinin 1 baru.
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
  const canvas = canvasTujuan || document.createElement('canvas');
  canvas.width = Math.round(sw * skala);
  canvas.height = Math.round(sh * skala);
  canvas.getContext('2d').drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// Mulai loop scan barcode live di background. `onDetect(kode)` dipanggil begitu ketemu — si
// pemanggil yang nentuin next step-nya (lookup produk dkk), function ini nggak nyentuh state UI
// apa pun di luar viewfinder-nya sendiri. Return {stop()} buat ngehentiin loop.
//
// - `videoRef`: ref ke elemen <video> yang lagi nampilin live camera.
// - `matiRef`: ref boolean — true kalau komponen pemanggilnya udah unmount/sheet ditutup, dicek
//   tiap tick biar loop-nya beneran berhenti (bukan cuma di-flag tapi masih jalan di background).
// - `onDetect`: callback(kode: string) pas barcode ketemu. Loop OTOMATIS berhenti sesaat sebelum
//   manggil ini (biar gak dobel-detect selagi pemanggilnya mroses hasilnya) — kalau pemanggil mau
//   lanjut scan lagi setelah itu (misal gagal lookup-nya), panggil ulang mulaiScanBarcode().
export function mulaiScanBarcode({ videoRef, matiRef, onDetect }) {
  // BarcodeDetector: API bawaan browser (Chrome/Edge Android & desktop) - deteksinya
  // di-hardware-accelerate langsung sama OS, jauh lebih akurat & cepet ketimbang ZXing buat
  // kondisi kamera HP asli (resolusi/fokus/cahaya nggak ideal). Dipakai DULUAN kalau tersedia.
  // CATATAN: di Android jalannya lewat Google Play Services (ML Kit) di belakang layar — kalau
  // Play Services-nya belum update / gak ada model barcode-nya, detect() TIDAK error, cuma
  // diam-diam selalu balikin array kosong. Makanya dikasih batas waktu: sekian detik gak nemu
  // apa-apa sama sekali -> otomatis pindah ke ZXing (pure JS, gak bergantung Play Services).
  // eslint-disable-next-line no-console
  console.log('[barcode] BarcodeDetector tersedia di browser ini:', 'BarcodeDetector' in window);
  let detector = null;
  if ('BarcodeDetector' in window) {
    try {
      detector = new window.BarcodeDetector({ formats: FORMAT_RETAIL });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('[barcode] format list ditolak, pakai default:', e.message);
      detector = new window.BarcodeDetector(); // salah satu format di atas ditolak browser -> pakai default-nya
    }
  }
  let zxingReader = null; // di-load & disiapin sekali aja pas beneran dibutuhin (lumayan berat)
  const siapkanZXing = async () => {
    if (zxingReader) return zxingReader;
    const [{ BrowserMultiFormatReader, BarcodeFormat }, { DecodeHintType }] = await Promise.all([
      import('@zxing/browser'),
      import('@zxing/library'),
    ]);
    const hints = new Map();
    // TRY_HARDER dinyalain — sempat dimatiin buat ngejar kecepatan, tapi ternyata korbanin akurasi
    // kejauhan (banyak yang cuma kebaca via jepret manual yang makenya, gak pernah kebaca lewat
    // loop otomatis). Percuma cepet kalau gak pernah berhasil.
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
    zxingReader = new BrowserMultiFormatReader(hints);
    return zxingReader;
  };

  // Diperpendek dari 70 (±2.8 detik) ke 25 (±1 detik) - kalau BarcodeDetector native-nya nggak
  // beneran jalan di device ini (diam-diam selalu balikin kosong, lihat komentar di atas soal
  // Play Services/ML Kit), jangan buang hampir 3 detik tiap kali scan sebelum pindah ke ZXing yang
  // beneran bisa baca. Native yang jalan normal biasanya nemu barcode jauh lebih cepat dari 1 detik
  // (hardware-accelerated) - jadi limit ini nggak kesenggol kalau native-nya emang berfungsi.
  const BATAS_PERCOBAAN_NATIVE = 25; // ~25 x 40ms = ±1 detik sebelum nyerah & pindah ke ZXing
  const canvasScan = document.createElement('canvas'); // 1 canvas dipakai ULANG tiap tick, lihat komentar ambilCanvasROI
  let berhenti = false;
  let percobaan = 0;
  const loop = async () => {
    if (matiRef.current || berhenti || !videoRef.current || videoRef.current.readyState < 2) {
      if (!matiRef.current && !berhenti) setTimeout(loop, 60);
      return;
    }
    percobaan++;
    // Resolusi disamain sama jepret manual (900px) — sisi terpanjang kecil doang (500-640px)
    // ternyata korbanin akurasi kejauhan buat ZXing, apalagi barengan sama TRY_HARDER di atas.
    const canvas = ambilCanvasROI(videoRef.current, 900, canvasScan);
    try {
      if (detector) {
        const timeoutDetect = new Promise((resolve) => setTimeout(() => resolve([]), 2000));
        const hasil = await Promise.race([detector.detect(canvas), timeoutDetect]);
        if (percobaan % 40 === 1) {
          // eslint-disable-next-line no-console
          console.log(`[barcode] percobaan #${percobaan} - ketemu:`, hasil.length, hasil.map((h) => h.format));
        }
        if (hasil.length) {
          berhenti = true;
          return onDetect(hasil[0].rawValue);
        }
      } else {
        const reader = await siapkanZXing();
        if (matiRef.current || berhenti) return;
        try {
          const result = reader.decodeFromCanvas(canvas);
          berhenti = true;
          return onDetect(result.getText());
        } catch (e) {
          if (percobaan % 40 === 1) {
            // eslint-disable-next-line no-console
            console.log(`[barcode][zxing] percobaan #${percobaan} - error:`, e.name);
          }
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('[barcode] detect() error:', e.name, e.message);
    }
    if (detector && percobaan >= BATAS_PERCOBAAN_NATIVE) {
      // eslint-disable-next-line no-console
      console.log(`[barcode] ${percobaan}x percobaan native nggak nemu apa-apa, nyerah & pindah ke ZXing`);
      detector = null;
      percobaan = 0;
    }
    // Jeda ZXing sengaja kecil (30ms) karena decodeFromCanvas sekarang lebih berat (900px +
    // TRY_HARDER) — proses sinkronnya sendiri udah makan waktu, gak perlu nambah jeda lagi di
    // atasnya. Native tetep 40ms karena detect()-nya hardware-accelerated, ringan aja.
    if (!matiRef.current && !berhenti) setTimeout(loop, detector ? 40 : 30);
  };
  loop();
  return { stop: () => (berhenti = true) };
}
