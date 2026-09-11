export function errorHandler(err, req, res, next) {
  console.error(err);
  const status = err.status || 500;
  // err.message aman ditampilkan HANYA kalau errornya sengaja dibikin developer dengan status
  // eksplisit (mis. `Object.assign(new Error('...'), { status: 400 })` di tiap route) - itu emang
  // ditulis buat dibaca user. Error TAK TERDUGA (exception mentah dari DB/library, status 500
  // default) messagenya sering ngebocorin detail internal (nama tabel/kolom/query) - jangan
  // diteruskan apa adanya ke client, cukup dicatat di log server (baris di atas).
  // `internal: true` = pesan buat DEVELOPER, bukan buat user (mis. "OPENROUTER_API_KEY belum
  // diisi di .env"). Punya status eksplisit, tapi tetap nggak boleh nongol di layar pemilik
  // warung - dia nggak ngerti & itu bukan urusannya. Tetap kecatat di log baris atas.
  const pesan = err.status && !err.internal ? err.message : 'Terjadi kesalahan di server';
  // `jatahAiHabis` (lihat panggilGemini di gemini.service.js) - flag KHUSUS biar frontend bisa
  // beda-in "jatah token AI harian habis" dari error 402 LAIN (lisensi/langganan abis, ditangani
  // middleware/lisensi.js) - dua-duanya sama-sama pakai status 402 tapi maknanya beda, jangan cuma
  // ngandelin status code doang buat mutusin UI mana yang muncul.
  res.status(status).json({ error: pesan || 'Terjadi kesalahan di server', ...(err.jatahAiHabis ? { jatahAiHabis: true } : {}) });
}
