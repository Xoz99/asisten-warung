import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Dev: tampilan di 5174, API ke server manajemen (npm run dev:server, port 4100).
  server: { port: 5174, proxy: { '/api': 'http://localhost:4100' } },
});
