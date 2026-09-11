// Helper getUserMedia dipakai bareng sama semua fitur kamera (scan barang, scan barcode, kenal wajah).
// Minta resolusi setinggi mungkin + autofokus terus-menerus — penting banget buat barcode
// (barcode kecil & rapat butuh gambar tajam, resolusi default browser suka kekecilan/lowres).
// Beberapa constraint (resolusi tinggi, focusMode) mungkin nggak didukung semua kamera/browser,
// jadi dicoba bertahap dari yang paling ideal ke yang paling longgar.
const CONSTRAINT_BERTAHAP = [
  (facingMode) => ({ video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 }, advanced: [{ focusMode: 'continuous' }] } }),
  (facingMode) => ({ video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } } }),
  (facingMode) => ({ video: { facingMode } }),
];

export async function bukaKamera(facingMode = 'environment') {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Kamera tidak didukung di browser/perangkat ini');
  }
  let errTerakhir;
  for (const buatConstraint of CONSTRAINT_BERTAHAP) {
    try {
      return await navigator.mediaDevices.getUserMedia(buatConstraint(facingMode));
    } catch (e) {
      errTerakhir = e;
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        throw new Error('Akses kamera ditolak — izinkan dulu lewat pengaturan browser');
      }
      if (e.name === 'NotFoundError') {
        throw new Error('Kamera tidak ditemukan di perangkat ini');
      }
      // OverconstrainedError dkk — lanjut coba constraint yang lebih longgar
    }
  }
  throw new Error('Gagal membuka kamera: ' + (errTerakhir?.message || 'tidak diketahui'));
}

export function tutupKamera(stream) {
  stream?.getTracks().forEach((t) => t.stop());
}

// Jepret frame video jadi gambar diam (data URL, format WEBP — lebih kecil ukurannya dibanding
// JPEG di kualitas yang sama) — dipakai buat NAMPILIN ke user apa yang barusan difoto (biar
// keliatan hasilnya, bukan cuma ikon generik), terpisah dari ambilEmbedding yang makan videoEl
// langsung buat diproses model AI.
export function jepretFrame(videoEl) {
  const canvas = document.createElement('canvas');
  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  canvas.getContext('2d').drawImage(videoEl, 0, 0);
  return canvas.toDataURL('image/webp', 0.85);
}

// Konversi file foto (hasil <input type="file"> / FileReader, biasanya JPEG dari kamera HP) ke
// WEBP — dipakai pas daftarin foto produk manual, biar formatnya konsisten sama hasil jepretFrame.
export function keWebp(dataUrl, maxLebar = 1024) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const skala = Math.min(1, maxLebar / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * skala);
      canvas.height = Math.round(img.height * skala);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/webp', 0.85));
    };
    img.onerror = () => reject(new Error('Gagal memuat foto'));
    img.src = dataUrl;
  });
}
