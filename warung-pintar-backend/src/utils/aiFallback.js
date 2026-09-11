// Helper kecil dipakai bareng di semua route yang punya cadangan Gemini -> OpenRouter (scan.routes.js,
// nota.routes.js, voice.routes.js, produk.routes.js) - biar polanya konsisten & nggak disalin-tempel
// try/catch yang sama berkali-kali. `gemini` dicoba DULUAN, kalau gagal baru `openrouter`.
//
// Gemini & OpenRouter di sini SAMA-SAMA narik dari TANGKI JATAH TOKEN HARIAN yang SAMA per warung
// (lihat aiQuota.service.js) - jadi kalau Gemini gagal gara-gara jatahnya abis (`jatahAiHabis`),
// OpenRouter TETAP dicoba di sini (bukan di-skip) - tapi begitu dicoba, dia bakal ngecek jatah yang
// SAMA lagi (masih 0, karena tangkinya sama) dan nolak duluan SEBELUM beneran manggil API OpenRouter
// (nggak ada biaya nyata kekeluar, cuma 1x query database lokal) - hasil akhirnya sama-sama kena
// `jatahAiHabis`, cuma jalannya lewat 2 pengecekan, bukan 1. Ini justru YANG DIMAU: begitu Gemini
// abis jatah, OpenRouter otomatis "gantiin" pakai SISA jatah yang sama (kalau masih ada) - baru
// bener-bener keblokir kalau tangkinya beneran kosong di kedua percobaan.
export async function cobaGeminiLaluOpenRouter(gemini, openrouter, labelLog) {
  let errGemini;
  try {
    return await gemini();
  } catch (e) {
    errGemini = e;
    console.warn(`[${labelLog}] Gemini gagal (status ${e.status || '?'}), coba OpenRouter:`, e.message);
  }
  try {
    return await openrouter();
  } catch (e2) {
    // Kalau cadangannya gagal cuma karena BELUM DIKONFIGURASI (nggak ada API key), yang dilempar
    // ke user harus error ASLI dari Gemini - itu sebab sebenarnya kenapa fiturnya nggak jalan.
    // Dulu error OpenRouter yang kelempar, jadi user liat "OPENROUTER_API_KEY belum diisi di .env"
    // padahal masalah aslinya di Gemini (kuota habis/timeout//dst).
    throw e2.internal && errGemini ? errGemini : e2;
  }
}
