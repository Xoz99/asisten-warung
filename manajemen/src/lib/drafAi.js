// Oper draf pesan ke halaman AI Chat (dipakai tombol "Eksekusi di AI Chat" di laporan Kantor Konsulin).
// Lewat sessionStorage biar tetap kebawa walau halamannya ganti lewat alamat (#/ai).
const KUNCI = 'makalin_ai_draf';
const MAKS = 6000; // batas pesan AI Chat

export function kirimKeAiChat(teks) {
  try {
    sessionStorage.setItem(KUNCI, String(teks).slice(0, MAKS));
  } catch {
    // storage diblok: AI Chat kebuka kosong, pengguna bisa nempel manual
  }
  window.location.hash = '#/ai';
}
export function bacaDrafAi() {
  try {
    return sessionStorage.getItem(KUNCI) || '';
  } catch {
    return '';
  }
}
export function hapusDrafAi() {
  try {
    sessionStorage.removeItem(KUNCI);
  } catch {
    // nggak apa-apa
  }
}
