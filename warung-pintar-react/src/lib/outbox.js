// Antrean aksi Tingkat A (SELESAI_BAYAR & CATAT_KASBON) yang belum sempet kekirim ke server -
// SATU-SATUNYA 2 aksi yang aman diulang tanpa efek dobel, karena backend udah punya jaminan
// idempotency lewat client_id UNIQUE (lihat transaksi.routes.js, fungsi simpanTransaksi - kalau
// client_id yang sama dikirim lagi, backend balikin data lama dengan flag sudahAda:true, BUKAN
// insert baru/potong stok lagi). Aksi lain (lunasin kasbon, stok masuk, dst) belum punya jaminan
// ini, jadi TIDAK lewat outbox - lihat guard navigator.onLine di dispatch() AppContext.jsx.
import { api } from './api';
import { outboxTambah, outboxSemua, outboxHapus } from './localdb';

// entry: { clientId, type: 'SELESAI_BAYAR'|'CATAT_KASBON', payload, dibuatPada, status }
export async function tambahKeOutbox(entry) {
  await outboxTambah({ ...entry, status: 'pending', dibuatPada: entry.dibuatPada || Date.now() });
}

export async function ambilOutboxPending() {
  return outboxSemua();
}

export async function hapusDariOutbox(clientId) {
  await outboxHapus(clientId);
}

function panggilApi(entry) {
  if (entry.type === 'SELESAI_BAYAR') return api.transaksi.bayar(entry.payload);
  if (entry.type === 'CATAT_KASBON') return api.transaksi.kasbon(entry.payload);
  return Promise.reject(new Error('Tipe outbox tidak dikenali: ' + entry.type));
}

// Coba kirim ulang semua entri outbox yang masih pending, satu-satu (bukan paralel — biar kalau
// koneksi baru balik & masih labil, nggak sekaligus nembak banyak request barengan). Pakai
// clientId yang SAMA persis kayak percobaan pertama, jadi aman kalau ternyata request pertama
// itu SEBENARNYA udah sukses di server tapi respons-nya yang nggak sempet nyampe balik ke client
// (backend bakal balikin sudahAda:true, bukan bikin transaksi baru/motong stok dobel).
//
// onSukses(entry) dipanggil tiap 1 entri berhasil terkirim & dihapus dari outbox - dipakai
// AppContext.jsx buat refreshData() setelahnya biar angka pasti (stok/laba final dari server)
// gantiin angka optimistic yang dipajang sebelumnya.
export async function prosesOutbox({ onSukses } = {}) {
  const entries = await ambilOutboxPending();
  for (const entry of entries) {
    if (entry.status !== 'pending') continue;
    try {
      await panggilApi(entry);
      await hapusDariOutbox(entry.clientId);
      await onSukses?.(entry);
    } catch (e) {
      if (e.status === undefined) {
        // masih offline / gagal network lagi - biarin di outbox, coba lagi nanti (dipicu ulang
        // dari listener 'online' atau interval jaga-jaga di AppContext.jsx)
        continue;
      }
      // HTTP error beneran (401/402/dst, BUKAN soal koneksi) - bukan masalah "belum online",
      // nggak ada gunanya diulang terus-terusan. Buang dari outbox biar nggak nyangkut selamanya;
      // efeknya (stok/kasbon optimistic) udah kejadian di UI dan TIDAK di-rollback di sini secara
      // otomatis (pemanggil yang perlu nanganin lewat refreshData() biar user liat kondisi asli).
      await hapusDariOutbox(entry.clientId);
    }
  }
}
