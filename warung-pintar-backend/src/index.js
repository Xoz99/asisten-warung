import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { requireAuth } from './middleware/auth.js';
import { requireLisensiAktif } from './middleware/lisensi.js';
import { errorHandler } from './middleware/errorHandler.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { cekKonsistensiPlan } from './services/lisensi.service.js';

import authRoutes from './routes/auth.routes.js';
import lisensiWebhookRoutes from './routes/lisensiWebhook.routes.js';
import lisensiRoutes from './routes/lisensi.routes.js';
import penjagaRoutes from './routes/penjaga.routes.js';
import produkRoutes from './routes/produk.routes.js';
import scanRoutes from './routes/scan.routes.js';
import voiceRoutes from './routes/voice.routes.js';
import transaksiRoutes from './routes/transaksi.routes.js';
import kasbonRoutes from './routes/kasbon.routes.js';
import pelangganRoutes from './routes/pelanggan.routes.js';
import wajahRoutes from './routes/wajah.routes.js';
import jagaRoutes from './routes/jaga.routes.js';
import laporanRoutes from './routes/laporan.routes.js';
import notaRoutes from './routes/nota.routes.js';
import cuacaRoutes from './routes/cuaca.routes.js';
import asistenRoutes from './routes/asisten.routes.js';
import koperasiRoutes from './routes/koperasi.routes.js';
import langgananRoutes from './routes/langganan.routes.js';
import tukarRoutes from './routes/tukar.routes.js';
import komunitasRoutes from './routes/komunitas.routes.js';

const app = express();
// Berapa lapis proxy di depan server ini (ngrok/nginx/Cloudflare) - dibaca dari TRUST_PROXY.
// PENTING buat rate limit (middleware/rateLimit.js): tanpa ini req.ip isinya IP PROXY, jadi semua
// pengguna kehitung satu orang dan jatah kirim OTP bareng-bareng habis gara-gara satu orang.
// Default 0 (nggak percaya header apa pun) - SENGAJA, karena X-Forwarded-For gampang dipalsukan
// klien: kalau dipercaya padahal nggak ada proxi beneran, siapa pun bisa nulis IP karangan tiap
// request buat kabur dari rate limit. Isi 1 kalau jalan di belakang ngrok atau satu reverse proxy.
app.set('trust proxy', Number(process.env.TRUST_PROXY || 0));
// helmet nambahin header keamanan standar (X-Content-Type-Options, HSTS, dst) - contentSecurityPolicy
// dimatiin karena ini API JSON polos, bukan yang nyajiin HTML (CSP header nggak relevan di sini &
// bisa bikin bingung kalau suatu saat ada yang buka /health langsung di browser).
app.use(helmet({ contentSecurityPolicy: false }));
// Origin dibatasi lewat ALLOWED_ORIGINS di .env (dipisah koma) kalau diisi - biar bisa dikunci ke
// domain produksi beneran. Default masih allow-all (kosong/nggak diisi) karena app ini sering
// dites dari origin yang beda-beda & suka gonta-ganti (localhost, IP LAN, tunnel ngrok) - auth-nya
// sendiri pakai Bearer token (bukan cookie), jadi CORS di sini murni pembatasan sisi browser,
// bukan lapisan pertahanan utama.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors(allowedOrigins.length ? { origin: allowedOrigins } : {}));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

app.get('/health', (req, res) => res.json({ ok: true, waktu: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
// webhook Midtrans — publik (bukan pelanggan yang manggil), diamankan pakai verifikasi signature, bukan JWT
app.use('/api/lisensi', lisensiWebhookRoutes);

// semua rute di bawah ini butuh login (1 akun warung, token JWT dipakai bareng di beberapa device)
app.use('/api', requireAuth);

// status & checkout lisensi butuh login TAPI harus tetap bisa diakses walau lisensi lagi kedaluwarsa
// (justru itu tujuannya — biar bisa perpanjang), makanya dipasang sebelum requireLisensiAktif
app.use('/api/lisensi', lisensiRoutes);

// mulai dari sini baru digembok: akun harus login DAN lisensinya masih aktif
app.use('/api', requireLisensiAktif);
app.use('/api/penjaga', penjagaRoutes);
app.use('/api/produk', produkRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/voice', voiceRoutes);
app.use('/api/transaksi', transaksiRoutes);
app.use('/api/kasbon', kasbonRoutes);
app.use('/api/pelanggan', pelangganRoutes);
app.use('/api/wajah', wajahRoutes);
app.use('/api/jaga', jagaRoutes);
app.use('/api/laporan', laporanRoutes);
app.use('/api/nota', notaRoutes);
app.use('/api/cuaca', cuacaRoutes);
app.use('/api/asisten', asistenRoutes);
app.use('/api/koperasi', koperasiRoutes);
app.use('/api/langganan', langgananRoutes);
app.use('/api/tukar', tukarRoutes);
app.use('/api/komunitas', komunitasRoutes);

// ---- Melayani frontend (produksi) ----
// Di server, Node ini sekalian nyajiin hasil build React - jadi frontend & API satu origin, satu
// port, satu proses yang diurus pm2. Alasannya praktis: Caddy di VPS jalan DI DALAM container,
// jadi dia nggak bisa baca folder dist/ di host tanpa nambah volume mount ke compose punya
// proyek lain. Dengan cara ini Caddy cukup nerusin satu domain ke satu port, nggak usah tau
// apa-apa soal berkas statis.
//
// Efek sampingnya bagus: `/api` tetap RELATIF kayak waktu development (proxy Vite), jadi
// VITE_API_URL nggak perlu diisi & nggak ada urusan CORS sama sekali.
//
// Kalau dist/ belum ada (mis. lagi jalan di laptop pakai `npm run dev` di frontend terpisah),
// blok ini dilewat - jadi nggak ngerusak alur development.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '../../warung-pintar-react/dist');
if (fs.existsSync(path.join(DIST, 'index.html'))) {
  // Aset ber-hash (index-a1b2c3.js) & model face-api isinya nggak pernah berubah buat nama yang
  // sama - aman di-cache lama. index.html JANGAN: dia yang nunjuk ke nama-nama ber-hash itu,
  // kalau ikut ke-cache user nyangkut di versi lama walau udah deploy ulang.
  app.use(
    express.static(DIST, {
      index: false,
      setHeaders: (res, berkas) => {
        if (berkas.endsWith('index.html')) res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        else res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    })
  );
  // Semua path NON-/api dibalikin index.html. Dicek eksplisit biar URL /api yang salah ketik tetap
  // dapet JSON 404 yang jelas - bukan halaman HTML yang bikin bingung waktu debug.
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    res.sendFile(path.join(DIST, 'index.html'));
  });
  console.log(`Frontend disajikan dari ${DIST}`);
}

app.use((req, res) => res.status(404).json({ error: 'Rute tidak ditemukan' }));
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
// Peringatan dini kalau ada paket yang dijual tapi durasinya belum diisi - lebih baik ketauan
// di terminal pas server nyala daripada pas duit pelanggan udah masuk tapi lisensinya gagal.
cekKonsistensiPlan();

app.listen(PORT, () => {
  console.log(`Warung Pintar API jalan di http://localhost:${PORT}`);
  if (!process.env.DATABASE_URL) {
    console.warn('⚠️  DATABASE_URL belum diisi di .env - endpoint yang butuh database akan gagal sampai ini diisi.');
  }
});
