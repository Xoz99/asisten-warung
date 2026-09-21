import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Build khusus form daftar publik -> dist-daftar/, disajikan di /daftar (lihat server/index.js). Dipisah dari bundle
// admin biar halaman publik di konsulin.com nggak ikut ngirim kode panel internal.
export default defineConfig({
  plugins: [react()],
  base: '/daftar/',
  build: { outDir: 'dist-daftar', rollupOptions: { input: 'daftar.html' } },
});
