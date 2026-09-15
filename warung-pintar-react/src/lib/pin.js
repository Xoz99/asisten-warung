// PIN pemilik: satu PIN per AKUN warung, disimpan di server (lihat /api/auth/pin di backend).
//
// Di HP cuma disimpan HASH-nya (bukan PIN-nya) setelah PIN pernah dicek benar online - dipakai buat buka
// kunci waktu internet mati. Hash digaramin id warung, jadi hash yang sama nggak kepakai di akun lain.
export const PIN_GAMPANG = new Set(['1234', '4321', '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999']);

// null kalau browser nggak nyediain crypto.subtle (halaman non-HTTPS) - buka kunci offline jadi nggak tersedia.
export async function hashPinLokal(warungId, pin) {
  if (!globalThis.crypto?.subtle) return null;
  const data = new TextEncoder().encode(`warungpintar-pin:${warungId}:${pin}`);
  const hasil = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hasil)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Error jaringan (offline / server nggak kejangkau), beda dari jawaban server "PIN salah".
export const errorJaringan = (e) => !e?.status;
