// Pilihan bank & e-wallet buat rekening pencairan bagi hasil. Tetap bisa ngetik sendiri kalau nggak ada di daftar.
export const DAFTAR_BANK = ['BCA', 'BRI', 'BNI', 'Mandiri', 'BSI', 'CIMB Niaga', 'Permata', 'Danamon', 'BTN', 'Bank Jago', 'SeaBank', 'blu by BCA Digital', 'Bank Neo Commerce', 'DANA', 'GoPay', 'OVO', 'ShopeePay'];
export const EWALLET = ['DANA', 'GoPay', 'OVO', 'ShopeePay'];
export const samarRekening = (r) => (r ? '•••• ' + String(r).slice(-4) : '');
// Status rekening buat pencairan: siap (lengkap & udah dicek) / cek (lengkap tapi belum dicek) / kosong.
export function statusRekening(p) {
  if (!p || p.kurang?.length) return { id: 'kosong', nama: 'Rekening belum diisi', warna: 'merah' };
  if (!p.rekening_dicek_at) return { id: 'cek', nama: 'Rekening belum dicek', warna: 'kuning' };
  return { id: 'siap', nama: 'Siap cair', warna: 'hijau' };
}
