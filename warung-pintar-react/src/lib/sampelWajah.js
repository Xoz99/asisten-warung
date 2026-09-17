// Pengumpul sampel wajah dari beberapa frame kamera (dipakai SheetWajah di Catat.jsx).
//
// Kenapa: descriptor dari SATU frame itu "berisik" - kedip, agak noleh, sedikit blur, atau bayangan bikin
// jaraknya ke data pendaftaran naik di atas batas cocok (0.45), padahal orangnya benar. Dulu tiap frame
// dinilai sendiri-sendiri (dan harus 2 frame berturut-turut lolos), jadi di HP nyata sering gagal padahal
// cahayanya terang. Rata-rata beberapa frame orang yang sama jauh lebih stabil & lebih dekat ke datanya.
//
// Kalau frame baru jauh beda dari rata-rata yang lagi dikumpulin (orang di depan kamera ganti), kumpulan
// direset - biar wajah dua orang nggak kecampur jadi satu.
export const jarakWajah = (a, b) => Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0));

export function rataDeskriptor(daftar) {
  const n = daftar.length;
  return daftar[0].map((_, i) => daftar.reduce((s, d) => s + d[i], 0) / n);
}

export function buatPengumpulSampel({ maks = 3, batasBeda = 0.55 } = {}) {
  let sampel = [];
  return {
    tambah(descriptor) {
      if (sampel.length && jarakWajah(descriptor, rataDeskriptor(sampel)) > batasBeda) sampel = [];
      sampel.push(descriptor);
      if (sampel.length > maks) sampel.shift();
      return { rata: rataDeskriptor(sampel), jumlah: sampel.length };
    },
    reset() {
      sampel = [];
    },
    get jumlah() {
      return sampel.length;
    },
  };
}

// Nama baru ditampilkan kalau rata-rata >= 2 frame cocok, ATAU satu frame yang cocoknya sangat meyakinkan.
// Satu frame yang cuma "pas-pasan" di bawah batas belum cukup - itu yang dulu bikin salah orang.
export const JARAK_YAKIN_SATU_FRAME = 0.38;
export const layakDitampilkan = (hasil, jumlahSampel) =>
  Boolean(hasil?.cocok && (jumlahSampel >= 2 || hasil.jarak <= JARAK_YAKIN_SATU_FRAME));
