// Porting dari src/lib/voice.js di frontend (warung-pintar-react), dipakai bareng buat:
// - parse ucapan hasil Web Speech API (STT jalan di browser, sini cuma cocokkin kata ke katalog barang)
// - cocokkan nama barang hasil OCR nota ke produk yang sudah ada

const angkaKata = { satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10, se: 1 };
const keAngka = (t) => (angkaKata[t] !== undefined ? angkaKata[t] : parseInt(t, 10));

export function cocokProduk(produk, teks) {
  const kata = teks.toLowerCase().split(/\s+/).filter(Boolean);
  let best = null;
  let skor = 0;
  produk.forEach((p) => {
    const target = (p.nama + ' ' + p.id).toLowerCase();
    let s = 0;
    kata.forEach((k) => {
      if (k.length > 2 && target.includes(k)) s += k.length;
    });
    if (s > skor) {
      skor = s;
      best = p;
    }
  });
  return skor >= 3 ? best : null;
}

export function parseUcapan(produk, teks) {
  const t = ' ' + teks.toLowerCase().replace(/[.,]/g, ' ') + ' ';
  const pola =
    /(\d+|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh)\s+([a-zA-Z\s]+?)(?=\s+(?:\d+|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh)\s|\s*$)/g;
  const hasil = [];
  let m;
  while ((m = pola.exec(t)) !== null) {
    const q = keAngka(m[1]);
    const p = cocokProduk(produk, m[2]);
    if (p && q > 0) hasil.push({ produkId: p.id, nama: p.nama, harga: p.harga, stok: p.stok, qty: q });
  }
  if (!hasil.length) {
    const p = cocokProduk(produk, t);
    if (p) hasil.push({ produkId: p.id, nama: p.nama, harga: p.harga, stok: p.stok, qty: 1 });
  }
  return hasil;
}

// HPP rata-rata tertimbang: stok lama + stok baru masuk
export function hppRata(p, qtyBaru, hargaBeliBaru) {
  const stokLama = Math.max(0, p.stok);
  const modalLama = p.modal || hargaBeliBaru;
  const total = stokLama + qtyBaru;
  return total ? Math.round((stokLama * modalLama + qtyBaru * hargaBeliBaru) / total) : hargaBeliBaru;
}

export function produkSetelahMasuk(p, qty, hargaBeli) {
  return { ...p, modal: hppRata(p, qty, hargaBeli), stok: p.stok + qty };
}
