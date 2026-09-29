// Cetak struk ke printer thermal Bluetooth (58mm / 80mm, perintah ESC/POS). Cuma jalan di APK Asisten Warung -
// printer Bluetooth klasik nggak bisa diakses dari browser. Plugin native-nya: PrinterBluetoothPlugin.java.
import { Capacitor, registerPlugin } from '@capacitor/core';

const PrinterBluetooth = registerPlugin('PrinterBluetooth');
const KUNCI = 'aw_printer'; // printer terakhir yang dipilih di HP ini: { nama, alamat, lebar }

export const bisaCetakBluetooth = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export function printerTersimpan() {
  try {
    return JSON.parse(localStorage.getItem(KUNCI) || 'null');
  } catch {
    return null;
  }
}
export function simpanPrinter(p) {
  try {
    if (p) localStorage.setItem(KUNCI, JSON.stringify(p));
    else localStorage.removeItem(KUNCI);
  } catch {
    /* storage diblok - printernya ditanya lagi tiap cetak */
  }
}

// Printer yang udah dipasangkan (pairing) di pengaturan Bluetooth HP.
export const daftarPrinter = () => PrinterBluetooth.daftar().then((r) => r.printer || []);

// ---- Penyusun perintah ESC/POS ----
const ESC = 0x1b;
const GS = 0x1d;
// Printer murah pakai set huruf lama (CP437) - huruf di luar ASCII diganti biar nggak jadi karakter aneh.
const aman = (t) =>
  String(t ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // tanda aksen (é -> e)
    .replace(/[\u2012-\u2015]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u00b7/g, '-')
    .replace(/[^\x20-\x7e]/g, ''); // sisanya (emoji dsb.) dibuang

export function susunStruk({ kop, subKop, baris, lebar = 32 }) {
  const out = [];
  const tulis = (t) => {
    for (const c of aman(t)) out.push(c.charCodeAt(0));
    out.push(0x0a);
  };
  const perintah = (...b) => out.push(...b);
  const garis = () => tulis('-'.repeat(lebar));
  // Teks kiri + teks kanan dalam satu baris (kiri dipotong kalau kepanjangan).
  const duaSisi = (kiri, kanan) => {
    const k = aman(kanan);
    const ruang = Math.max(1, lebar - k.length - 1);
    const l = aman(kiri);
    tulis((l.length > ruang ? l.slice(0, ruang) : l.padEnd(ruang)) + ' ' + k);
  };
  // Teks panjang dipecah per kata biar pas lebar kertas.
  const bungkus = (t) => {
    const kata = aman(t).split(/\s+/);
    let s = '';
    for (const w of kata) {
      if ((s + ' ' + w).trim().length > lebar) {
        if (s) tulis(s);
        s = w.slice(0, lebar);
      } else s = (s + ' ' + w).trim();
    }
    if (s) tulis(s);
  };

  perintah(ESC, 0x40); // reset printer
  perintah(ESC, 0x61, 1); // rata tengah
  perintah(ESC, 0x45, 1, ESC, 0x21, 0x10); // tebal + tinggi ganda
  bungkus(kop);
  perintah(ESC, 0x21, 0x00, ESC, 0x45, 0);
  if (subKop) bungkus(subKop);
  perintah(ESC, 0x61, 0); // rata kiri
  garis();
  for (const b of baris) {
    if (b.jenis === 'garis') garis();
    else if (b.jenis === 'dua') {
      if (b.tebal) perintah(ESC, 0x45, 1);
      duaSisi(b.kiri, b.kanan);
      if (b.tebal) perintah(ESC, 0x45, 0);
    } else if (b.jenis === 'tengah') {
      perintah(ESC, 0x61, 1);
      bungkus(b.teks);
      perintah(ESC, 0x61, 0);
    } else bungkus(b.teks);
  }
  perintah(ESC, 0x64, 4); // dorong kertas biar gampang disobek
  perintah(GS, 0x56, 0x42, 0); // potong kertas (printer tanpa pisau ngabaikan perintah ini)
  return Uint8Array.from(out);
}

const keBase64 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

export const cetak = (alamat, bytes) => PrinterBluetooth.cetak({ alamat, data: keBase64(bytes) });
