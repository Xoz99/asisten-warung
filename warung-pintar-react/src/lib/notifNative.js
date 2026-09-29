// Pengingat harian di APK (notifikasi lokal Android): stok hampir habis tiap pagi, kasbon belum lunas tiap malam.
// Isinya dihitung dari data di HP & dijadwal ulang tiap datanya berubah, jadi notifikasi tetap muncul walau
// aplikasinya lagi ditutup. Di browser modul ini nggak ngapa-ngapain.
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { kritisQ } from './voice';

const ID_STOK = 1001;
const ID_KASBON = 1002;
export const pakaiNotifNative = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('LocalNotifications');

const rupiahPendek = (n) => 'Rp ' + Math.round(n).toLocaleString('id-ID');

// Berulang tiap hari jam `jam`:00 - isinya diperbarui tiap data di HP berubah.
const tiapHari = (jam) => ({ on: { hour: jam, minute: 0 }, repeats: true, allowWhileIdle: true });

export async function izinNotif() {
  try {
    const cek = await LocalNotifications.checkPermissions();
    if (cek.display === 'granted') return true;
    if (cek.display === 'denied') return false; // udah ditolak: jangan dipaksa minta terus
    return (await LocalNotifications.requestPermissions()).display === 'granted';
  } catch {
    return false;
  }
}

// Jadwal ulang dua pengingat harian dari data terbaru. Aman dipanggil berkali-kali (yang lama dibatalin dulu).
export async function jadwalkanPengingat({ produk, kasbon }) {
  if (!pakaiNotifNative() || !(await izinNotif())) return;
  await LocalNotifications.cancel({ notifications: [{ id: ID_STOK }, { id: ID_KASBON }] }).catch(() => {});
  const jadwal = [];

  const habis = produk.filter(kritisQ);
  if (habis.length) {
    const nama = habis.slice(0, 3).map((p) => p.nama).join(', ');
    jadwal.push({
      id: ID_STOK,
      title: `${habis.length} barang hampir habis`,
      body: habis.length > 3 ? `${nama}, dan ${habis.length - 3} lainnya. Cek sebelum belanja.` : `${nama}. Cek sebelum belanja.`,
      schedule: tiapHari(7),
      extra: { layar: 's-stok' },
    });
  }

  const belum = kasbon.filter((k) => !k.lunas);
  if (belum.length) {
    const orang = new Set(belum.map((k) => k.nama)).size;
    const total = belum.reduce((a, k) => a + (Number(k.jml) || 0), 0);
    jadwal.push({
      id: ID_KASBON,
      title: `Kasbon belum lunas: ${orang} orang`,
      body: `Totalnya ${rupiahPendek(total)}. Ketuk buat lihat siapa aja.`,
      schedule: tiapHari(19),
      extra: { layar: 's-pelanggan' },
    });
  }

  if (jadwal.length) await LocalNotifications.schedule({ notifications: jadwal }).catch(() => {});
}

// Notifikasi diketuk -> buka layar yang dimaksud.
export function dengarKetukNotif(goTo) {
  if (!pakaiNotifNative()) return () => {};
  const h = LocalNotifications.addListener('localNotificationActionPerformed', (e) => {
    const layar = e?.notification?.extra?.layar;
    if (layar) goTo(layar);
  });
  return () => h.then((x) => x.remove()).catch(() => {});
}
