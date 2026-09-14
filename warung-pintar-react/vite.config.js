import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const lokal = (p) => fileURLToPath(new URL(p, import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // face-api versi TANPA bundel. Versi bawaannya (face-api.esm.js, 1,3 MB) ngebawa TensorFlow.js
      // lengkap sendiri, jadi aplikasi ini jalan dengan DUA mesin TensorFlow - satu buat scan barang,
      // satu buat kenal wajah - yang rebutan memori GPU HP yang sama. Versi tanpa bundel (83 KB) pakai
      // @tensorflow/tfjs punya kita. Versinya cocok: face-api 1.7.15 dibikin buat tfjs ^4.22.0, yang
      // terpasang 4.22.0. Pakai path berkas langsung biar nggak ketahan aturan "exports" paketnya.
      { find: /^@vladmandic\/face-api$/, replacement: lokal('./node_modules/@vladmandic/face-api/dist/face-api.esm-nobundle.js') },
      // Versi tanpa bundel itu ikut import backend WASM yang nggak terpasang & nggak pernah dipakai -
      // diganti modul kosong. Alasannya di src/lib/stubTfjsWasm.js.
      { find: '@tensorflow/tfjs-backend-wasm/dist/index.js', replacement: lokal('./src/lib/stubTfjsWasm.js') },
    ],
  },
  server: {
    // Proxy /api/* ke backend Express (port 4000) - biar frontend bisa diakses dari IP/domain
    // apapun (localhost, IP LAN, tunnel ngrok, dst) tanpa perlu hardcode alamat backend di .env.
    // Ini juga sekalian bikin webhook Midtrans yang nembak ke tunnel ngrok yang sama tetap
    // ke-teruskan ke backend asli, nggak usah bikin tunnel kedua (akun gratis cuma boleh 1).
    proxy: {
      '/api': 'http://localhost:4000',
    },
    // Vite nolak request yang Host header-nya nggak dikenal (proteksi DNS rebinding) - domain
    // tunnel ngrok buat testing dari HP/device luar ditambahin di sini biar nggak keblokir.
    allowedHosts: ['prejuvenile-trickly-jacqui.ngrok-free.dev'],
  },
})
