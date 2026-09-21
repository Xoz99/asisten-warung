import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { authRouter, requireAdmin } from './auth.js';
import adminRoutes from './admin.routes.js';
import opsRoutes from './ops.routes.js';
import rekrutmenRoutes, { publikRouter, DAFTAR_URL } from './rekrutmen.routes.js';
import karyawanRoutes from './karyawan.routes.js';
import artifactRoutes, { berkasRouter as artifactBerkas } from './artifact.routes.js';
import lapanganRoutes from './lapangan.routes.js';
import { PRODUK } from './produk/index.js';

// Server aplikasi manajemen Konsulin: API /api/* (wajib login admin, lihat auth.js) + nyajiin hasil build tampilannya (dist/).
// SENGAJA terpisah dari aplikasi produk (warung-pintar-*): proses, port, dan domain sendiri.
const app = express();
app.set('trust proxy', Number(process.env.TRUST_PROXY || 0));
app.use(helmet({ contentSecurityPolicy: false }));
// Halaman internal - jangan sampai keindeks mesin pencari.
app.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});
// Form daftar publik boleh bawa CV + foto (maks 3 MB masing-masing, dikirim base64) - batas lebih longgar khusus rute ini.
app.use('/api/publik/daftar', express.json({ limit: '9mb' }));
// Log Sales Lapangan bawa sampai 3 foto bukti (base64, udah dikecilin di HP).
app.use('/api/lapangan', express.json({ limit: '13mb' }));
app.use(express.json({ limit: '100kb' }));

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRouter);
// Form daftar calon Sales Partner - publik (tanpa login), dibatasi rate limit (lihat rekrutmen.routes.js).
app.use('/api/publik', publikRouter);
// File Artifact dibuka lewat link bertoken sementara (buat <img>/<video>/<iframe>), bukan token sesi.
app.use('/api', artifactBerkas);
app.use('/api', requireAdmin);
app.use('/api', adminRoutes);
app.use('/api', opsRoutes);
app.use('/api', rekrutmenRoutes);
app.use('/api', karyawanRoutes);
app.use('/api', artifactRoutes);
app.use('/api', lapanganRoutes);
app.get('/api/produk', (req, res) => {
  res.json(PRODUK.filter((p) => p.aktif).map(({ id, nama, url }) => ({ id, nama, url })));
});
for (const p of PRODUK) {
  if (p.aktif) app.use('/api/' + p.id, p.router);
}
app.use('/api', (req, res) => res.status(404).json({ error: 'Tidak ditemukan' }));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '../dist');

// Form lamaran publik ada di konsulin.com/karir (repo konsulin-landing-page) - server landing yang nerusin kiriman
// ke /api/publik/*. Link lama makalin.konsulin.com/daftar?s=... dialihin ke sana, kode ?s= ikut kebawa.
if (DAFTAR_URL) {
  app.get(['/daftar', '/daftar/'], (req, res) => {
    const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    res.redirect(301, DAFTAR_URL + qs);
  });
}

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
