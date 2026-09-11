import { query } from '../db.js';

// Jatah token AI HARIAN per plan langganan - 1 TANGKI BARENG dipakai Gemini MAUPUN OpenRouter (lihat
// panggilGemini di gemini.service.js & panggilOpenRouter di openrouter.service.js, dua-duanya nge-
// cek+nyatet ke tabel & fungsi yang SAMA di file ini) - berlaku buat SEMUA pemakaian AI: fitur
// scan/nota/suara (barcode-ai, visual-ai/visual-ai-banyak, cari-referensi produk, scan nota
// belanja, parse suara AI) DAN chat Mang AI.
//
// Chat dulu SENGAJA dikecualiin, alasannya "model chat jauh lebih murah per panggilan dibanding
// Vision". Itu bener selama balesannya cuma beberapa kalimat. Begitu chat bisa ngusulin DAFTAR
// BELANJA (aksi "belanja_banyak"), satu pesan bisa ngeluarin 2.500 token output ditambah konteks
// warung yang ikut tiap pesan - jalur tak-terhitung sebesar itu nggak kelihatan di angka manapun,
// dan justru dia yang paling gampang nguras jatah dari sisi provider.
//
// Chat NGGAK ikut mati pas jatah abis: panggilan Gemini/OpenRouter-nya ditolak duluan (402), tapi
// route chat nangkep itu dan jatuh ke jawabRuleBased (lihat asisten.routes.js) - jadi user tetap
// dapet jawaban, cuma versi kaku tanpa AI. Beda dari fitur scan/nota yang emang nggak punya
// cadangan setara, makanya di situ `jatahAiHabis` diteruskan ke frontend jadi ajakan upgrade.
//
// KENAPA 1 tangki bareng (bukan jatah kepisah per provider): OpenRouter di sini perannya "gantiin"
// Gemini pas dia gagal (down/limit dari sisi Google) - kalau jatahnya kepisah, orang bisa muter-muter
// nunggu Gemini "gagal" buat dapet jatah EKSTRA dari OpenRouter tanpa batas, itu bukan tujuannya.
// Efek sampingnya malah bagus: begitu Gemini abis jatah HARInya, OpenRouter OTOMATIS nerusin pake
// SISA jatah yang sama (swap provider di belakang layar, user nggak kerasa putus) - baru bener-bener
// keblokir kalau tangkinya kosong buat DUA-duanya (lihat cobaGeminiLaluOpenRouter di aiFallback.js).
//
// Reset HARIAN (bukan bulanan) - biar warung yang kepake banyak di 1 hari nggak keblokir lama-lama,
// besok jatahnya penuh lagi otomatis.
//
// ⚠️ Angka di bawah PERKIRAAN KASAR (belum divalidasi dari data pemakaian beneran, jumlah token per
// panggilan Vision itu variatif tergantung resolusi foto) - sengaja dikumpulin di 1 tempat ini biar
// gampang disetel ulang belakangan tanpa nyebar ke banyak file kalau ternyata kegedean/kekecilan.
export const JATAH_TOKEN_HARIAN = {
  trial: 15000,
  bulanan: 50000,
  tahunan: 120000,
  permanen: 250000,
};

function jatahUntukPlan(plan) {
  return JATAH_TOKEN_HARIAN[plan] ?? JATAH_TOKEN_HARIAN.trial;
}

// Dipanggil DI DALAM panggilGemini (gemini.service.js) SEBELUM beneran manggil API Gemini - kalau
// jatah hari ini abis, Gemini nggak jadi dipanggil sama sekali (hemat biaya ASLI, bukan cuma nolak
// belakangan setelah kepanggil). `CASE WHEN ai_token_tanggal = CURRENT_DATE` di query nanganin reset
// harian tanpa perlu cron/scheduled job terpisah - begitu tanggalnya beda dari hari ini, kepakenya
// dianggap 0 lagi di query ini (belum ditulis ulang ke kolomnya sampai catatPemakaianAi kepanggil).
export async function cekJatahAi(warungId) {
  const { rows } = await query(
    `SELECT plan, CASE WHEN ai_token_tanggal = CURRENT_DATE THEN ai_token_hari_ini ELSE 0 END AS terpakai
     FROM warung WHERE id=$1`,
    [warungId]
  );
  const w = rows[0];
  // warungId nggak ketemu itu harusnya nggak kejadian (req.warungId udah divalidasi middleware auth
  // sebelum nyampe ke sini) - kalau toh kejadian, jangan sampai nge-block gara-gara ini sendiri,
  // biarin lolos & biar error LAIN (kalau ada) yang beneran nangkep masalahnya.
  if (!w) return { boleh: true, sisa: Infinity, jatah: Infinity, terpakai: 0, plan: 'trial' };
  const jatah = jatahUntukPlan(w.plan);
  const terpakai = Number(w.terpakai) || 0;
  return { boleh: terpakai < jatah, sisa: Math.max(0, jatah - terpakai), jatah, terpakai, plan: w.plan };
}

// Nyatetin token yang BENERAN kepake, dipanggil SETELAH panggilan Gemini sukses (lihat panggilGemini)
// - upsert-style lewat CASE di query yang sama: kalau tanggal kesimpen udah beda dari hari ini,
// mulai ulang dari 0 + token baru ini (bukan numpuk dari kemarin).
export async function catatPemakaianAi(warungId, tokens) {
  if (!tokens || tokens <= 0) return;
  await query(
    `UPDATE warung SET
       ai_token_hari_ini = CASE WHEN ai_token_tanggal = CURRENT_DATE THEN ai_token_hari_ini + $2 ELSE $2 END,
       ai_token_tanggal = CURRENT_DATE
     WHERE id=$1`,
    [warungId, tokens]
  );
}
