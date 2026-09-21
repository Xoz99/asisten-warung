import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { requireAdmin } from './auth.js';
import { PRODUK } from './produk/index.js';

// Server aplikasi manajemen Konsulin: API /api/* (dikunci ADMIN_KEY) + nyajiin hasil build tampilannya (dist/).
// SENGAJA terpisah dari aplikasi produk (warung-pintar-*): proses, port, dan domain sendiri.
const app = express();
app.set('trust proxy', Number(process.env.TRUST_PROXY || 0));
app.use(helmet({ contentSecurityPolicy: false }));
// Halaman internal - jangan sampai keindeks mesin pencari.
app.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});
app.use(express.json({ limit: '100kb' }));

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api', requireAdmin);
app.get('/api/produk', (req, res) => {
  res.json(PRODUK.filter((p) => p.aktif).map(({ id, nama, url }) => ({ id, nama, url })));
});
for (const p of PRODUK) {
  if (p.aktif) app.use('/api/' + p.id, p.router);
}
app.use('/api', (req, res) => res.status(404).json({ error: 'Tidak ditemukan' }));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '../dist');
if (fs.existsSync(path.join(DIST, 'index.html'))) {
  app.use(
    express.static(DIST, {
      index: false,
      setHeaders: (res, berkas) => {
        if (berkas.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
        else res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    })
  );
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(DIST, 'index.html'));
  });
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Terjadi kesalahan di server' });
});

const PORT = Number(process.env.PORT || 4100);
app.listen(PORT, () => console.log(`Manajemen Konsulin jalan di port ${PORT}`));
