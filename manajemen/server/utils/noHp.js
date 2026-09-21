// Normalisasi nomor HP Indonesia ke SATU bentuk baku: 62xxxxxxxxx (tanpa +, spasi, strip, kurung).
//
// Kenapa perlu: orang nulis nomor yang SAMA dengan macam-macam gaya - "0812-3456-7890",
// "+62 812 3456 7890", "62812 3456 7890". Kalau disimpan apa adanya, "lupa password" bakal gagal
// nemu akunnya cuma gara-gara pas daftar nulisnya beda sama pas mau pulih. Semua dinormalkan di
// SATU pintu (fungsi ini) sebelum masuk/dicari di database - bukan di tiap route masing-masing.
export function normalisasiNoHp(input) {
  if (typeof input !== 'string') return null;
  // buang semua yang bukan angka (termasuk +, spasi, strip, kurung)
  let d = input.replace(/\D/g, '');
  if (!d) return null;
  // 0812... -> 62812... ; 62812... dibiarkan ; 812... (orang sering skip 0-nya) -> 62812...
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('62')) { /* sudah baku */ }
  else if (d.startsWith('8')) d = '62' + d;
  else return null; // bukan pola nomor HP Indonesia (mis. nomor rumah/negara lain)

  // Setelah "62", nomor HP Indonesia mulai dari 8 dan totalnya wajar di 10-13 digit
  // (jadi 12-15 digit termasuk "62"). Batas ini nolak typo kayak kurang/kelebihan angka.
  if (!/^628\d{8,11}$/.test(d)) return null;
  return d;
}

// Buat DITAMPILKAN ke user (bukan buat disimpan) - 628123456789 -> 0812-3456-789.
// Dipakai di layar "kode dikirim ke ..." biar pemilik warung kenal nomornya sendiri.
export function tampilNoHp(noHp) {
  if (!noHp) return '';
  const lokal = noHp.startsWith('62') ? '0' + noHp.slice(2) : noHp;
  return lokal.replace(/(\d{4})(\d{4})(\d+)/, '$1-$2-$3');
}

// Nomor yang disamarkan buat respons "kode sudah dikirim" - 628123456789 -> 0812-****-789.
// Cukup buat mastiin user kirim ke nomor yang bener, tapi nggak ngebocorin nomor lengkap ke
// orang yang cuma nebak-nebak username punya siapa.
export function samarkanNoHp(noHp) {
  if (!noHp) return '';
  const lokal = noHp.startsWith('62') ? '0' + noHp.slice(2) : noHp;
  if (lokal.length < 7) return lokal;
  return lokal.slice(0, 4) + '-****-' + lokal.slice(-3);
}
