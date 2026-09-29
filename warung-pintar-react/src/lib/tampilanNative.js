// APK: warna ikon jam/baterai & tombol navigasi disamain sama tema aplikasi (TampilanSistemPlugin.java).
// Di browser nggak ngapa-ngapain - di sana warna bar sistem diatur lewat <meta name="theme-color">.
import { Capacitor, registerPlugin } from '@capacitor/core';

const TampilanSistem = registerPlugin('TampilanSistem');

// warna = warna latar aplikasi ("#F1F1EF", "rgb(10, 10, 10)", ...).
export function samakanBarSistem(warna) {
  if (!Capacitor.isNativePlatform() || !warna) return;
  const hex = warna.trim().match(/^#([0-9a-f]{6})$/i);
  const rgb = warna.match(/(\d+)\D+(\d+)\D+(\d+)/);
  const [r, g, b] = hex ? [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)) : rgb ? rgb.slice(1, 4).map(Number) : [255, 255, 255];
  const terang = 0.299 * r + 0.587 * g + 0.114 * b > 140;
  TampilanSistem.aturIkon({ latarTerang: terang }).catch(() => {});
}
