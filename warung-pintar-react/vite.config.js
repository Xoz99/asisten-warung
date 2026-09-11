import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
