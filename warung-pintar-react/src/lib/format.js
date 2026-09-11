// Banyak toast/dialog di app ini dirender lewat dangerouslySetInnerHTML biar bisa nyisipin <b>,
// dan sering nyelipin nama yang DIKETIK USER (pelanggan, produk, penjaga) ke dalamnya. Nama itu
// harus di-escape dulu sebelum masuk template HTML - kalau nggak, orang bisa ngetik nama kayak
// `<img src=x onerror=...>` dan kode itu beneran kejalanin di browser siapapun yang lihat toast-nya
// (curi token login dari localStorage, dst). Angka hasil rupiah()/singkat() dst TIDAK perlu
// di-escape (selalu angka), cuma string bebas dari user yang wajib lewat ini dulu.
export const escapeHtml = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const rupiah = (n) => 'Rp ' + Math.round(n).toLocaleString('id-ID');

export const singkat = (n) =>
  n >= 1000000 ? (n / 1000000).toFixed(2).replace('.', ',') + 'jt' : Math.round(n / 1000) + 'rb';

export const inisial = (n) =>
  n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export const tglID = (d) =>
  new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

export const jamID = (d) =>
  new Date(d).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

// Nomor HP disimpan di backend dalam bentuk baku 62xxx (lihat backend utils/noHp.js), tapi yang
// dikenal pemilik warung itu bentuk 08xx - jadi dibalikin lagi pas ditampilkan.
export const tampilNoHp = (noHp) => {
  if (!noHp) return '';
  const lokal = String(noHp).startsWith('62') ? '0' + String(noHp).slice(2) : String(noHp);
  return lokal.replace(/(\d{4})(\d{4})(\d+)/, '$1-$2-$3');
};
