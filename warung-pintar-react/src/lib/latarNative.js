// Jembatan ke kerja latar Android (SinkronLatarPlugin.java): sinkron transaksi offline & notifikasi dari backend
// walau aplikasinya ditutup. Cuma aktif di APK - di browser semua fungsi di sini nggak ngapa-ngapain.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { ambilOutboxPending, hapusDariOutbox } from './outbox';

const SinkronLatar = registerPlugin('SinkronLatar');
export const pakaiLatar = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

// Alamat API per jenis antrean outbox (lihat outbox.js - cuma 2 aksi yang aman diulang).
const PATH = { SELESAI_BAYAR: '/api/transaksi/bayar', CATAT_KASBON: '/api/transaksi/kasbon' };

// Token login + alamat server buat kerja latar. token null = logout (kerja latar dimatiin & datanya dihapus).
export async function aturLatar(token) {
  if (!pakaiLatar()) return;
  await SinkronLatar.atur({ token: token || '', baseUrl: window.location.origin }).catch(() => {});
}

// Titip salinan antrean outbox ke Android - dia yang ngirim begitu ada internet, walau aplikasi ditutup.
export async function titipAntrean() {
  if (!pakaiLatar()) return;
  const rows = await ambilOutboxPending().catch(() => []);
  const antrean = rows.filter((r) => r.status === 'pending' && PATH[r.type]).map((r) => ({ clientId: r.clientId, path: PATH[r.type], body: r.payload }));
  await SinkronLatar.simpanAntrean({ antrean }).catch(() => {});
}

// Yang udah dikirim Android di latar dihapus dari antrean aplikasi. Balikin jumlahnya (> 0 = perlu refresh data).
export async function bereskanTerkirimLatar() {
  if (!pakaiLatar()) return 0;
  const { clientId = [] } = await SinkronLatar.ambilTerkirim().catch(() => ({}));
  for (const id of clientId) await hapusDariOutbox(id).catch(() => {});
  return clientId.length;
}

// Notifikasi dari backend diketuk -> buka layarnya (baik pas aplikasi ditutup maupun kebuka di belakang).
export function dengarLayarNotifLatar(goTo) {
  if (!pakaiLatar()) return () => {};
  SinkronLatar.ambilLayarAwal()
    .then(({ layar }) => layar && goTo(layar))
    .catch(() => {});
  const h = SinkronLatar.addListener('bukaLayar', ({ layar }) => layar && goTo(layar));
  return () => h.then((x) => x.remove()).catch(() => {});
}
