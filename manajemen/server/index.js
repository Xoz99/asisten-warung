import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { authRouter, requireAdmin } from './auth.js';
import adminRoutes from './admin.routes.js';
import aiRoutes from './ai.routes.js';
import opsRoutes from './ops.routes.js';
import rekrutmenRoutes, { publikRouter, DAFTAR_URL } from './rekrutmen.routes.js';
import rekrutmenAlurRoutes, { publikAlurRouter } from './rekrutmenAlur.js';
import karyawanRoutes from './karyawan.routes.js';
import artifactRoutes, { berkasRouter as artifactBerkas } from './artifact.routes.js';
import lapanganRoutes from './lapangan.routes.js';
import komisiRoutes from './komisi.routes.js';
import timRoutes from './tim.routes.js';
import leadDetailRoutes from './leadDetail.routes.js';
import { PRODUK } from './produk/index.js';
import { DIR_FOTO_KATALOG } from './produk/warung-pintar/katalog.routes.js';

// Server aplikasi manajemen Konsulin: API /api/* (wajib login admin, lihat auth.js) + nyajiin hasil build tampilannya (dist/).
// SENGAJA terpisah dari aplikasi produk (warung-pintar-*): proses, port, dan domain sendiri.
const app = express();
app.set('trust proxy', Number(process.env.TRUST_PROXY || 0));
// Referrer: cuma asal situs (tanpa path/hash) yang dikirim ke luar. Server peta OpenStreetMap nolak permintaan tile
// tanpa Referer (kebijakan pemakaian tile mereka), jadi bawaan helmet "no-referrer" bikin petanya diblok.
app.use(helmet({ contentSecurityPolicy: false, referrerPolicy: { policy: 'strict-origin-when-cross-origin' } }));
// Halaman internal - jangan sampai keindeks mesin pencari.
app.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});
// Form daftar publik boleh bawa CV + foto (maks 3 MB masing-masing, dikirim base64) - batas lebih longgar khusus rute ini.
app.use('/api/publik/daftar', express.json({ limit: '9mb' }));
// Log Sales Lapangan bawa sampai 3 foto bukti (base64, udah dikecilin di HP).
app.use('/api/lapangan', express.json({ limit: '13mb' }));
// Foto profil sales (udah dikecilin di HP, maks 1 MB -> base64 ~1,4 MB).
app.use(['/api/tim-sales', '/api/saya/foto', /^\/api\/karyawan\/[^/]+\/foto$/], express.json({ limit: '2mb' }));
// Foto warung di detail lead (maks 1,5 MB -> base64 ~2 MB).
app.use(['/api/leads', '/api/lapangan/crm'], express.json({ limit: '3mb' }));
// Impor CSV katalog barang (sampai 2.000 baris, di-parse di browser).
app.use('/api/warung-pintar/katalog/impor', express.json({ limit: '2mb' }));
// Upload foto barang katalog (udah dikecilin di browser, maks 1,5 MB -> base64 ~2 MB).
app.use(/^\/api\/warung-pintar\/katalog\/[^/]+\/foto$/, express.json({ limit: '3mb' }));
// Jawaban kuis kandidat: esai jumlahnya bebas (tiap jawaban maks 3.000 huruf), jadi nggak muat di batas 100kb.
app.use('/api/publik/kuis', express.json({ limit: '1mb' }));
app.use(express.json({ limit: '100kb' }));

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRouter);
// Form daftar calon Sales Partner - publik (tanpa login), dibatasi rate limit (lihat rekrutmen.routes.js).
app.use('/api/publik', publikRouter);
// Kuis online & pilih jadwal interview kandidat (dibuka lewat konsulin.com/kuis/... dan /jadwal/...).
app.use('/api/publik', publikAlurRouter);
// File Artifact dibuka lewat link bertoken sementara (buat <img>/<video>/<iframe>), bukan token sesi.
app.use('/api', artifactBerkas);
app.use('/api', requireAdmin);
app.use('/api', aiRoutes);
app.use('/api', adminRoutes);
app.use('/api', opsRoutes);
app.use('/api', rekrutmenRoutes);
app.use('/api', rekrutmenAlurRoutes);
app.use('/api', karyawanRoutes);
app.use('/api', artifactRoutes);
app.use('/api', lapanganRoutes);
app.use('/api', komisiRoutes);
app.use('/api', timRoutes);
app.use('/api', leadDetailRoutes);
app.get('/api/produk', (req, res) => {
  res.json(PRODUK.filter((p) => p.aktif).map(({ id, nama, url }) => ({ id, nama, url })));
});
for (const p of PRODUK) {
  if (p.aktif) app.use('/api/' + p.id, p.router);
}
app.use('/api', (req, res) => res.status(404).json({ error: 'Tidak ditemukan' }));
// Foto katalog Warung Pintar (folder yang sama dengan yang disajikan app warung) - buat pratinjau di halaman Katalog.
app.use('/katalog-foto', express.static(DIR_FOTO_KATALOG, { index: false, maxAge: '365d', immutable: true, fallthrough: false }));

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
