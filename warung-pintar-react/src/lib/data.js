export const STORAGE_KEY = 'warungpintar_react_v1';

export function dataAwal() {
  return {
    tema: 't-mono',
    warna: '#ffc001',
    font: 'Inter',
    ukuran: 'sedang',
    akun: { login: 'budi@warung.id', tipe: 'email', password: '123456' },
    pin: '1234',
    penjagaAktif: null,
    penjagaList: ['Pak Budi', 'Istri', 'Anak'],
    untung: 184500,
    trx: 47,
    produk: [
      { id: 'mie', nama: 'Mie instan goreng', harga: 3500, modal: 2800, untung: 700, stok: 3, laku: 12, kat: 'sembako' },
      { id: 'minyak', nama: 'Minyak goreng 1L', harga: 17000, modal: 14500, untung: 2500, stok: 2, laku: 4, kat: 'sembako' },
      { id: 'telur', nama: 'Telur ayam (kg)', harga: 30000, modal: 27000, untung: 3000, stok: 1, laku: 5, kat: 'sembako' },
      { id: 'teh', nama: 'Teh gelas', harga: 2000, modal: 1500, untung: 500, stok: 64, laku: 20, kat: 'minuman' },
      { id: 'beras', nama: 'Beras Pandan 5 kg', harga: 68000, modal: 62000, untung: 6000, stok: 9, laku: 2, kat: 'sembako' },
      { id: 'roti', nama: 'Roti tawar', harga: 14000, modal: 12000, untung: 2000, stok: 11, laku: 3, kat: 'sembako' },
      { id: 'kopi', nama: 'Kopi sachet', harga: 2500, modal: 1900, untung: 600, stok: 48, laku: 14, kat: 'minuman' },
      { id: 'sabun', nama: 'Sabun mandi', harga: 5000, modal: 4100, untung: 900, stok: 22, laku: 2, kat: 'sembako' },
    ],
    kasbon: [
      { id: 'bs', ini: 'BS', nama: 'Bu Sri', hari: '5 hari lalu', jml: 85000, lunas: false },
      { id: 'pj', ini: 'PJ', nama: 'Pak Jaya', hari: '2 hari lalu', jml: 47000, lunas: false },
      { id: 'mi', ini: 'MI', nama: 'Mbak Ina', hari: 'Kemarin', jml: 178000, lunas: false },
    ],
    pelanggan: [
      { id: 'p1', nama: 'Bu Sri', wa: '081234567890', foto: null },
      { id: 'p2', nama: 'Pak Jaya', wa: '', foto: null },
    ],
    terjual: { teh: 142, mie: 96, kopi: 88 },
    transaksi: [],
    riwayatJaga: [],
    stokAwalShift: null,
    masukLog: [],
    modalLog: [
      { waktu: new Date(Date.now() - 864e5 * 1).toISOString(), ket: 'Belanja pasar · Toko Sembako Jaya', jml: 842000 },
      { waktu: new Date(Date.now() - 864e5 * 3).toISOString(), ket: 'Agen Minuman Rejeki', jml: 516000 },
      { waktu: new Date(Date.now() - 864e5 * 6).toISOString(), ket: 'Belanja pasar · sayur & telur', jml: 394000 },
    ],
  };
}

export const notaTemplate = [
  {
    toko: 'Toko Sembako Jaya',
    baris: [
      { nama: 'Mie instan goreng', qty: 40, harga: 2800 },
      { nama: 'Minyak goreng 1L', qty: 12, harga: 14500 },
      { nama: 'Telur ayam (kg)', qty: 10, harga: 27000 },
      { nama: 'Gula pasir 1kg', qty: 8, harga: 15500 },
    ],
  },
  {
    toko: 'Agen Minuman Rejeki',
    baris: [
      { nama: 'Teh gelas', qty: 120, harga: 1500 },
      { nama: 'Kopi sachet', qty: 100, harga: 1900 },
      { nama: 'Air mineral 600ml', qty: 48, harga: 2700 },
    ],
  },
];

export const WARNA = [
  { h: '#ffc001', n: 'Kuning warung' },
  { h: '#f55c4c', n: 'Merah bata' },
  { h: '#5ed27c', n: 'Hijau daun' },
  { h: '#c2ff6e', n: 'Hijau limau' },
  { h: '#68c6ff', n: 'Biru langit' },
  { h: '#6beaec', n: 'Toska' },
  { h: '#896ce3', n: 'Ungu' },
  { h: '#ff83ce', n: 'Merah muda' },
  { h: '#b7b7b7', n: 'Abu netral' },
];

export const FONTS = [
  { f: "'Inter'", n: 'Inter', d: 'Modern, standar iOS' },
  { f: "'Poppins'", n: 'Poppins', d: 'Bulat & ramah' },
  { f: "'Plus Jakarta Sans'", n: 'Plus Jakarta Sans', d: 'Rapi untuk angka' },
  { f: "'Nunito'", n: 'Nunito', d: 'Lembut, mudah dibaca' },
  { f: "'Bricolage Grotesque'", n: 'Bricolage Grotesque', d: 'Tegas & berkarakter' },
  { f: "'Times New Roman', Times, serif", n: 'Times New Roman', d: 'Klasik, seperti koran' },
];

export const UKURAN = [
  { k: 'kecil', n: 'Kecil', d: 'Lebih ringkas, muat banyak info' },
  { k: 'sedang', n: 'Sedang', d: 'Bawaan aplikasi' },
  { k: 'besar', n: 'Besar', d: 'Lebih gampang dibaca' },
];

export const TEMA_CAPTION = {
  't-mono': 'Terang. Data tersimpan di HP (localStorage) - tutup lalu buka lagi, isinya tetap.',
  't-dark': 'Gelap. Nyaman dipakai subuh sebelum warung buka.',
};

// deret nilai untung harian pseudo-acak (demo) untuk grafik Laporan
function nilaiHari(d) {
  const s = Math.sin((d.getFullYear() * 372 + (d.getMonth() + 1) * 31 + d.getDate()) * 12.9898) * 43758.5453;
  const f = s - Math.floor(s);
  return 85000 + Math.round((f * 190000) / 1000) * 1000;
}

export function seriLaporan(n, offset) {
  const akhir = new Date();
  akhir.setHours(0, 0, 0, 0);
  akhir.setDate(akhir.getDate() - offset * n);
  const arr = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(akhir);
    d.setDate(akhir.getDate() - i);
    arr.push({ d, v: nilaiHari(d) });
  }
  return arr;
}
