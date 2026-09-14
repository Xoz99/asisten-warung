// Pencocokan wajah pelanggan (Kasbon Kenal Wajah).
//
// Data wajah = face descriptor 128 angka dari face-api (dihitung di HP). Dulu dicocokin pakai cosine
// similarity >= 0.8 - itu KELIRU buat descriptor ini: semua wajah manusia ujungnya dapet cosine
// 0.85-0.95 satu sama lain, jadi siapa pun yang berdiri di depan kamera pasti "cocok" sama pelanggan
// yang skornya paling tinggi (pernah kejadian: bapak-bapak dikenali sebagai "Pak Joko", "kecocokan 88%").
// Diukur di 40 foto 8 orang: cara lama bener 8/28, SALAH ORANG 20/28, orang asing diterima 28/28.
//
// Yang bener buat descriptor face-api itu JARAK EUCLIDEAN (standar FaceMatcher-nya sendiri), plus:
//  - model versi 2 (SSD MobileNet + landmark penuh di HP). Versi lama (tiny detector) descriptor-nya
//    terlalu acak - jarak orang sama & orang beda numpuk, nggak ada batas yang aman.
//  - selisih ke kandidat kedua: kalau dua pelanggan sama-sama mirip, mending nggak nebak.
//
// BATAS_JARAK 0.45 sengaja lebih ketat dari angka set uji (orang beda paling dekat 0.60 di foto orang barat):
// model face-api dilatih kebanyakan wajah barat, jadi wajah orang Indonesia saling lebih "deket". Diukur
// di data asli: dua pemuda BEDA orang jaraknya 0.499. Salah tolak cuma berarti kamera nyoba frame
// berikutnya / pilih manual; salah orang berarti utang nyasar - jadi ditimbang ke arah ketat.
export const VERSI_MODEL_WAJAH = 2;
export const BATAS_JARAK = 0.45;
export const SELISIH_MINIMAL = 0.05;

// Kolom embedding (JSONB) bisa berisi:
//  - array angka          -> data lama (model versi 1), SENGAJA nggak dipakai buat nyocokin lagi
//  - { v: 2, d: [...] }   -> data model versi 2
export function bacaEmbedding(nilai) {
  const e = typeof nilai === 'string' ? JSON.parse(nilai) : nilai;
  if (e && !Array.isArray(e) && e.v === VERSI_MODEL_WAJAH && Array.isArray(e.d)) return e.d;
  return null;
}

export function jarakEuclid(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return Infinity;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

// rows: [{ pelanggan_id / id, embedding }]. Satu pelanggan bisa punya beberapa foto wajah - yang dihitung
// jarak TERDEKAT per pelanggan, baru dibandingin antar pelanggan (biar 2 foto orang yang sama nggak
// dianggap "dua kandidat mirip" terus malah ditolak).
export function cocokkanWajah(embedding, rows, { batas = BATAS_JARAK, selisih = SELISIH_MINIMAL } = {}) {
  const perPelanggan = new Map();
  for (const r of rows) {
    const d = bacaEmbedding(r.embedding);
    if (!d) continue;
    const jarak = jarakEuclid(embedding, d);
    const lama = perPelanggan.get(r.id);
    if (!lama || jarak < lama.jarak) perPelanggan.set(r.id, { row: r, jarak });
  }
  const urut = [...perPelanggan.values()].sort((a, b) => a.jarak - b.jarak);
  const [pertama, kedua] = urut;
  if (!pertama || pertama.jarak > batas) return null;
  if (kedua && kedua.jarak - pertama.jarak < selisih) return null;
  return pertama;
}
