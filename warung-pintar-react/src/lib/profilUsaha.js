// Pilihan di layar "kenalan dulu" (Onboarding.jsx). Kunci-kuncinya HARUS sama kayak di backend
// (services/profilUsaha.service.js) - yang nggak dikenal dibuang server waktu disimpan.
export const JENIS_USAHA = [
  { k: 'kelontong', label: 'Warung / toko kelontong', ket: 'Sembako, rokok, minuman, jajanan' },
  { k: 'bangunan', label: 'Toko bangunan', ket: 'Semen, cat, paku, pipa, alat listrik' },
  { k: 'konter', label: 'Konter HP & pulsa', ket: 'Pulsa, kuota, casing, charger' },
  { k: 'pertanian', label: 'Toko pertanian / pakan', ket: 'Pupuk, benih, obat hama, pakan ternak' },
  { k: 'kosmetik', label: 'Toko kosmetik & perawatan', ket: 'Skincare, sabun, make up, parfum' },
  { k: 'makanan', label: 'Warung makan / kedai minuman', ket: 'Makanan & minuman siap saji' },
  { k: 'lainnya', label: 'Lainnya', ket: 'Tulis sendiri jenis usahanya' },
];

export const PENJAGA = [
  { k: 'sendiri', label: 'Aku sendiri', ket: 'Jaga & ngurus semuanya sendirian' },
  { k: 'keluarga', label: 'Gantian sama keluarga', ket: 'Suami/istri/anak ikut jaga' },
  { k: 'karyawan', label: 'Ada karyawan', ket: 'Ada yang digaji buat jaga' },
];

export const KEBUTUHAN = [
  { k: 'jualan', label: 'Catat penjualan', ket: 'Biar tau pemasukan tiap hari' },
  { k: 'stok', label: 'Stok & kulakan', ket: 'Tau barang yang mau habis' },
  { k: 'kasbon', label: 'Kasbon / utang pelanggan', ket: 'Nggak lupa siapa yang belum bayar' },
  { k: 'laporan', label: 'Laporan untung', ket: 'Tau sebenernya untung berapa' },
  { k: 'harga', label: 'Nentuin harga jual', ket: 'Biar nggak kemurahan / kemahalan' },
  { k: 'qris', label: 'Terima bayar QRIS', ket: 'Pembeli bisa bayar pakai e-wallet' },
];

export const BARCODE = [
  { k: 'banyak', label: 'Iya, kebanyakan ada', ket: 'Tinggal scan pakai kamera' },
  { k: 'campur', label: 'Campur', ket: 'Sebagian ada, sebagian nggak' },
  { k: 'jarang', label: 'Jarang / nggak ada', ket: 'Barang curah, eceran, atau bikinan sendiri' },
];

export function labelJenisUsaha(profil) {
  if (!profil || profil.dilewati) return null;
  if (profil.jenis === 'lainnya') return profil.jenisLain || 'Usaha lainnya';
  return JENIS_USAHA.find((j) => j.k === profil.jenis)?.label || null;
}
