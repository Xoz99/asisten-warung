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
        throw new Error('Akses kamera ditolak - izinkan dulu lewat pengaturan browser');
      }
      if (e.name === 'NotFoundError') {
        throw new Error('Kamera tidak ditemukan di perangkat ini');
      }
      // OverconstrainedError dkk — lanjut coba constraint yang lebih longgar
    }
  }
  throw new Error('Gagal membuka kamera: ' + (errTerakhir?.message || 'tidak diketahui'));
}

// Atur kamera SETELAH kebuka: banyak HP Android ngabaikan focusMode yang dikirim lewat getUserMedia, baru nurut
// kalau dipasang lagi lewat applyConstraints. `zoom` (opsional, mis. 2) buat scan barcode: HP bisa dipegang agak
// jauh (di jarak yang lensanya masih bisa fokus) tapi barcodenya tetap kelihatan gede - dulu orang nyodorin HP
// mepet ke barcode, dan di jarak segitu kamera HP nggak bisa fokus, jadinya blur. Semua langkah dicoba aja: kamera
// yang nggak dukung cukup dilewat. Balikin kemampuan kamera ({ senter, fokusTitik }) buat nentuin tombol yang tampil.
export async function siapkanKamera(stream, { zoom } = {}) {
  const track = stream?.getVideoTracks?.()[0];
  const kap = track?.getCapabilities?.() || {};
  const coba = async (c) => {
    try {
      await track.applyConstraints({ advanced: [c] });
    } catch {
      /* nggak didukung kamera ini */
    }
  };
  if (kap.focusMode?.includes('continuous')) await coba({ focusMode: 'continuous' });
  if (kap.exposureMode?.includes('continuous')) await coba({ exposureMode: 'continuous' });
  if (zoom && kap.zoom && kap.zoom.max > 1) await coba({ zoom: Math.min(zoom, kap.zoom.max) });
  return {
    senter: !!kap.torch,
    fokusTitik: !!(kap.focusMode?.includes('single-shot') || kap.pointsOfInterest),
  };
}

// Ketuk layar = fokus ke titik itu (x, y: 0-1 dari kiri-atas video), lalu balik ke fokus otomatis terus-menerus.
export async function fokusKeTitik(stream, x, y) {
  const track = stream?.getVideoTracks?.()[0];
  const kap = track?.getCapabilities?.() || {};
  if (!track) return;
  try {
    const c = {};
    if (kap.pointsOfInterest) c.pointsOfInterest = [{ x, y }];
    if (kap.focusMode?.includes('single-shot')) c.focusMode = 'single-shot';
    if (Object.keys(c).length) await track.applyConstraints({ advanced: [c] });
    if (kap.focusMode?.includes('continuous')) setTimeout(() => track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {}), 1500);
  } catch {
    /* nggak didukung */
  }
}

// Senter (lampu flash) buat warung yang raknya gelap. Balikin true kalau berhasil.
export async function aturSenter(stream, nyala) {
  const track = stream?.getVideoTracks?.()[0];
  try {
    await track.applyConstraints({ advanced: [{ torch: !!nyala }] });
    return true;
  } catch {
    return false;
  }
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
// Format keluaran yang BENERAN didukung browser ini. WAJIB dicek, nggak boleh diasumsikan:
// canvas.toDataURL() itu kalau format yang diminta nggak didukung, dia DIAM-DIAM balikin PNG -
// bukan error, bukan null (itu emang perilaku resmi di spesifikasi HTML). Safari lama nggak bisa
// nge-encode WebP, jadi hasilnya PNG.
//
// Akibatnya parah buat foto: PNG itu lossless & parameter kualitas (0.85) diabaikan total, jadi
// foto 800x1000 yang harusnya ~150 KB jadi 1-2 MB. Kejadian beneran di iPhone: foto kesimpen
// kegedean padahal kodenya "udah dikompres".
//
// JPEG dipilih sebagai cadangan (bukan PNG) karena dia lossless-nya nggak dipaksa & didukung
// SEMUA browser sejak dulu. Nggak ada transparansi, tapi ini foto barang/nota/wajah - nggak butuh.
//
// Dicek sekali lalu diingat: bikin canvas 1x1 tiap manggil itu mubazir, dan jawabannya nggak
// mungkin berubah di tengah sesi.
let formatDidukung = null;
function formatGambar() {
  if (formatDidukung) return formatDidukung;
  try {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    formatDidukung = c.toDataURL('image/webp').startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg';
  } catch {
    formatDidukung = 'image/jpeg';
  }
  return formatDidukung;
}

// Namanya tetap keWebp biar pemanggil yang udah ada nggak perlu diubah, tapi keluarannya sekarang
// WebP ATAU JPEG - tergantung yang didukung browser. Dua-duanya sama-sama terkompres & jauh lebih
// kecil dari PNG, dan <img src> maupun backend nerima dua-duanya tanpa beda perlakuan.
export function keWebp(dataUrl, maxLebar = 1024) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Skala dihitung dari sisi TERPANJANG, bukan lebar doang - foto iPhone mayoritas potret
      // (mis. 3024x4032), dan kalau cuma lebar yang dibatasi, tingginya bisa tetap 4000-an px
      // dan berkasnya tetap gede walau "udah diperkecil".
      const sisiTerpanjang = Math.max(img.width, img.height);
      const skala = Math.min(1, maxLebar / sisiTerpanjang);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * skala);
      canvas.height = Math.round(img.height * skala);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL(formatGambar(), 0.85));
    };
    img.onerror = () => reject(new Error('Gagal memuat foto'));
    img.src = dataUrl;
  });
}
