// Gemini is primary; OpenRouter is the fallback for provider failures, including 429.
// Provider quota (Google/OpenRouter) is separate from the application's daily tenant
// budget. Both providers reserve against that shared budget; switching providers does
// not grant extra daily tokens. Timeouts retain only the failed call's allowance.
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
