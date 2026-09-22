import { query } from '../db.js';

// Shared daily budget for every Gemini/OpenRouter feature, including chat.
// Admission reserves a per-call allowance before contacting a provider. Successful
// responses reconcile actual usage; explicit rejected requests refund their reservation.
// Unknown usage retains only that call's allowance, leaving other calls/fallback available.
// Chat can still fall back to local rules when paid AI is unavailable.
export const JATAH_TOKEN_HARIAN = {
  trial: 15000,
  bulanan: 50000,
  triwulan: 75000,
  tahunan: 120000,
  permanen: 250000,
};

function jatahUntukPlan(plan) {
  return JATAH_TOKEN_HARIAN[plan] ?? JATAH_TOKEN_HARIAN.trial;
}

// Read-only status for UI; provider admission MUST use reservasiJatahAi.
export async function cekJatahAi(warungId) {
  const { rows } = await query(
    `SELECT plan, CASE WHEN ai_token_tanggal = CURRENT_DATE THEN ai_token_hari_ini ELSE 0 END AS terpakai
     FROM warung WHERE id=$1`, [warungId]);
  const w = rows[0];
  if (!w) return { boleh: false, sisa: 0, jatah: 0, terpakai: 0, plan: 'trial' };
  const jatah = jatahUntukPlan(w.plan);
  const terpakai = Number(w.terpakai) || 0;
  return { boleh: terpakai < jatah, sisa: Math.max(0, jatah - terpakai), jatah, terpakai, plan: w.plan };
}

// Reserve at most 4096 tokens per call, atomically across processes/providers.
// This is an accounting estimate, not an exact provider token count; reconcile actual
// usage after completion. A timeout/crash retains this call's allowance, not the entire
// daily balance. The final call may reserve less if the daily balance is almost empty.
export const RESERVASI_TOKEN_AI = 4096;
export async function reservasiJatahAi(warungId) {
  if (!warungId) throw Object.assign(new Error('Identitas warung wajib diisi'), { status: 401 });
  const { rows } = await query(
    `WITH budget AS (
       SELECT id, CASE WHEN ai_token_tanggal = CURRENT_DATE THEN ai_token_hari_ini ELSE 0 END AS terpakai, CASE plan
         WHEN 'bulanan' THEN $2::bigint WHEN 'triwulan' THEN $3::bigint
         WHEN 'tahunan' THEN $4::bigint WHEN 'permanen' THEN $5::bigint
         ELSE $6::bigint END AS jatah
       FROM warung WHERE id=$1 FOR UPDATE
     )
     UPDATE warung w SET ai_token_hari_ini = b.terpakai + LEAST($7::bigint, b.jatah - b.terpakai), ai_token_tanggal = CURRENT_DATE
     FROM budget b WHERE w.id=b.id
       AND b.terpakai < b.jatah
     RETURNING w.ai_token_tanggal::text AS tanggal, b.jatah, b.terpakai, LEAST($7::bigint, b.jatah - b.terpakai) AS dipesan`,
    [warungId, JATAH_TOKEN_HARIAN.bulanan, JATAH_TOKEN_HARIAN.triwulan,
      JATAH_TOKEN_HARIAN.tahunan, JATAH_TOKEN_HARIAN.permanen, JATAH_TOKEN_HARIAN.trial, RESERVASI_TOKEN_AI]);
  if (!rows.length) throw Object.assign(new Error('Jatah AI habis atau sedang dipesan oleh permintaan berjalan. Coba lagi nanti.'), { status: 402, jatahAiHabis: true });
  return { warungId, tanggal: rows[0].tanggal, jatah: Number(rows[0].jatah), terpakai: Number(rows[0].terpakai), dipesan: Number(rows[0].dipesan) };
}

export async function selesaikanJatahAi(reservasi, tokens) {
  // Unknown usage (timeout, missing metadata) keeps this call's reservation. Refunding
  // unknown provider usage would allow repeated timeouts to bypass the daily budget.
  if (!Number.isSafeInteger(tokens) || tokens < 0) return;
  await query(
    `UPDATE warung SET ai_token_hari_ini = ai_token_hari_ini + $3
     WHERE id=$1 AND ai_token_tanggal = $2::date`,
    [reservasi.warungId, reservasi.tanggal, tokens - reservasi.dipesan]);
}
