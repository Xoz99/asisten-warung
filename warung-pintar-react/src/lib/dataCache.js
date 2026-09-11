// Layer di atas localdb.js khusus buat 7 koleksi data warung (produk, kasbon, pelanggan,
// transaksi, riwayatJaga, masukLog, modalLog) + data pendukung kecil (penjagaRows, terjual,
// ngendap) yang disimpan di store `meta`. Dipakai dari AppContext.jsx: simpanSemuaKeCache()
// dipanggil tiap refreshData() sukses, muatSemuaDariCache() dipanggil pas app baru mount
// (sebelum ada network call apapun) buat langsung nampilin data terakhir yang tersimpan.
import { gantiSemua, getAll, getMeta, setMeta } from './localdb';

export async function simpanSemuaKeCache({
  produkRows,
  kasbonRows,
  pelangganRows,
  trxRows,
  riwayatRows,
  masukRows,
  modalRows,
  penjagaR,
  larisRows,
  ngendapRows,
}) {
  await Promise.all([
    gantiSemua('produk', produkRows),
    gantiSemua('kasbon', kasbonRows),
    gantiSemua('pelanggan', pelangganRows),
    gantiSemua('transaksi', trxRows),
    gantiSemua('riwayatJaga', riwayatRows),
    gantiSemua('masukLog', masukRows),
    gantiSemua('modalLog', modalRows),
    setMeta('penjagaR', penjagaR),
    setMeta('larisRows', larisRows),
    setMeta('ngendapRows', ngendapRows),
  ]);
}

// Balikin bentuk yang PERSIS sama kayak hasil Promise.all di refreshData() (raw rows, belum
// di-norm) - biar kode yang manggil bisa reuse fungsi norm* yang sama tanpa duplikasi logic.
// Kalau cache masih kosong sama sekali (device baru pertama kali), semua field balik array
// kosong - pemanggil (muatDariCache di AppContext) tetap aman jalan, cuma nampilin state kosong.
export async function muatSemuaDariCache() {
  const [produkRows, kasbonRows, pelangganRows, trxRows, riwayatRows, masukRows, modalRows, penjagaR, larisRows, ngendapRows] = await Promise.all([
    getAll('produk'),
    getAll('kasbon'),
    getAll('pelanggan'),
    getAll('transaksi'),
    getAll('riwayatJaga'),
    getAll('masukLog'),
    getAll('modalLog'),
    getMeta('penjagaR'),
    getMeta('larisRows'),
    getMeta('ngendapRows'),
  ]);
  return {
    produkRows,
    kasbonRows,
    pelangganRows,
    trxRows,
    riwayatRows,
    masukRows,
    modalRows,
    penjagaR: penjagaR || [],
    larisRows: larisRows || [],
    ngendapRows: ngendapRows || [],
  };
}
