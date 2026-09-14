// Hal-hal soal mikrofon/kamera yang dipakai DI LEBIH DARI SATU layar (Catat "Sebut barang",
// dikte suara di chat Mang AI, baris "Siapkan izin" di Lainnya). Sesi SpeechRecognition &
// perekamannya sendiri tetap diurus masing-masing layar, soalnya kebutuhannya beda jauh: Catat
// butuh sheet + parse nama barang/qty, chat cuma butuh teksnya masuk ke kotak ketik.
//
// Langkah membuka izin yang terlanjur diblokir TIDAK di sini - itu di lib/panduanIzin.js, karena
// isinya beda-beda per perangkat & ditampilin sebagai layar sendiri (SheetIzin), bukan teks biasa.

// Semua browser di iOS/iPadOS (Safari, Chrome, dst) WAJIB pakai mesin WebKit-nya Apple
// (kebijakan App Store) - jadi keterbatasan WebKit soal mic kena ke SEMUANYA, bukan Safari doang.
export function perangkatIOS() {
  if (typeof navigator === 'undefined') return false;
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return true;
  // iPadOS 13+ nyamar jadi "Mac" di user-agent, dibedain dari Mac beneran lewat touch support.
  return /macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
}

// Minta izin kamera + mikrofon SEKALIGUS dalam satu panggilan - Chrome nampilin SATU dialog kalau
// digabung, dua panggilan terpisah jadi dua dialog beruntun & yang kedua sering keburu ditutup.
//
// Dipakai bareng sama baris "Siapkan izin" di Lainnya DAN tombol "Sudah, cek lagi" di panduan
// izin. Disatuin biar dua tempat itu nggak bisa beda perilaku - sebelumnya logika ini cuma ada di
// dalam komponen Lainnya, jadi tempat lain yang butuh hal sama terpaksa nulis ulang.
//
// Balikin { ok, alasan }. `ok` true kalau minimal salah satu perangkat berhasil dibuka.
export async function mintaIzinMedia() {
  if (!navigator.mediaDevices?.getUserMedia) return { ok: false, alasan: 'tidak-didukung' };
  const lepas = (stream) => stream.getTracks().forEach((t) => t.stop());
  try {
    // Track-nya langsung dilepas: tujuannya minta izin, bukan mulai ngerekam. Kalau dibiarin
    // hidup, lampu kamera & indikator mic nyala terus tanpa sebab - itu justru bikin pemilik
    // warung curiga terus nyabut izinnya.
    lepas(await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: true }));
    return { ok: true };
  } catch (e) {
    if (e.name !== 'NotFoundError' && e.name !== 'OverconstrainedError') {
      return { ok: false, alasan: e.name === 'NotAllowedError' || e.name === 'SecurityError' ? 'ditolak' : 'gagal' };
    }
    // Perangkat yang cuma punya salah satunya (mis. laptop tanpa kamera) bikin permintaan
    // gabungan GAGAL TOTAL - nggak ada izin yang kekasih sama sekali, padahal yang satunya
    // sebenernya bisa. Jadi dicoba satu-satu, biar yang ada tetap kepegang izinnya.
    const satuan = await Promise.allSettled([
      navigator.mediaDevices.getUserMedia({ video: true }),
      navigator.mediaDevices.getUserMedia({ audio: true }),
    ]);
    satuan.forEach((h) => h.status === 'fulfilled' && lepas(h.value));
    if (satuan.some((h) => h.status === 'fulfilled')) return { ok: true, alasan: 'sebagian' };
    const pertama = satuan[0].reason;
    return { ok: false, alasan: pertama?.name === 'NotAllowedError' ? 'ditolak' : 'tidak-ada-perangkat' };
  }
}
