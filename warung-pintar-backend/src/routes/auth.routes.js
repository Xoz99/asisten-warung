import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { loginLimiter, otpLimiter, otpIpLimiter, pinLimiter } from '../middleware/rateLimit.js';
import { normalisasiNoHp, samarkanNoHp } from '../utils/noHp.js';
import { kirimOtpWa, waAktif } from '../services/wa.service.js';
import { simpanMemori } from '../services/memori.service.js';
import { ambilProfilUsaha, bersihkanProfil, pastikanKolomProfil } from '../services/profilUsaha.service.js';
import { cariSalesAktif, pastikanTabelSales } from '../services/sales.service.js';

const router = Router();
const SECRET = process.env.JWT_SECRET || 'dev-secret-ganti-ini';

const OTP_MENIT = 10;         // umur kode sejak dikirim
const OTP_MAKS_SALAH = 5;     // batas salah masukin kode sebelum kodenya dianggap hangus
const OTP_MAKS_KIRIM = 6;     // batas kirim per akun dalam OTP_JENDELA_MENIT
const OTP_JENDELA_MENIT = 15;

function buatToken(warungId) {
  return jwt.sign({ warungId }, SECRET, { expiresIn: '30d' });
}

// Bentuk data warung yang aman dikirim ke frontend - JANGAN pernah sebar password_hash.
function warungPublik(w) {
  return {
    id: w.id, nama: w.nama, username: w.username, noHp: w.no_hp || null,
    tema: w.tema, warna: w.warna, font: w.font, ukuran: w.ukuran,
  };
}

// ---- Daftar akun warung baru, WAJIB verifikasi nomor WhatsApp (1 akun dipakai bareng di beberapa device) ----
//
// Dua langkah: (1) isi form -> kode 6 angka dikirim ke WA lewat gateway (Fonnte), data daftarnya disimpen
// SEMENTARA di pendaftaran_otp; (2) kode dimasukin -> baru akun warung beneran dibuat. Tujuannya:
//  - nomor pemulihan (lupa password/PIN) dijamin nomor WA aktif milik yang daftar, bukan salah ketik/ngarang
//    - dulu nomor ngawur lolos, dan orangnya baru sadar pas butuh reset password (kekunci permanen)
//  - satu nomor nggak bisa dipakai orang lain buat daftar atas nama nomor itu
//  - bot nggak bisa bikin akun trial massal tanpa nomor WA beneran
//
// Isi form (termasuk password) disimpen di tabel sementara, BUKAN di tabel warung, sampai kodenya cocok -
// password-nya udah di-hash dari awal, kodenya juga (sama kayak kode_otp lupa password).
let tabelDaftarSiap = null;
function pastikanTabelDaftar() {
  if (!tabelDaftarSiap) {
    tabelDaftarSiap = (async () => {
      await query(`CREATE TABLE IF NOT EXISTS pendaftaran_otp (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nama TEXT NOT NULL,
        username TEXT NOT NULL,
        no_hp TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        kode_hash TEXT NOT NULL,
        kedaluwarsa TIMESTAMPTZ NOT NULL,
        percobaan INT NOT NULL DEFAULT 0,
        dipakai BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT now()
      )`);
      await query('CREATE INDEX IF NOT EXISTS idx_pendaftaran_otp_hp ON pendaftaran_otp (no_hp, created_at DESC)');
      // Sales yang bawa warung ini (kode sales dari link /?ref= atau diketik di form) - lihat sales.service.js.
      await pastikanTabelSales();
      await query('ALTER TABLE pendaftaran_otp ADD COLUMN IF NOT EXISTS sales_id UUID');
    })().catch((e) => {
      tabelDaftarSiap = null;
      throw e;
    });
  }
  return tabelDaftarSiap;
}

const POLA_UUID_DAFTAR = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Cek kode sales dari halaman daftar (buat nampilin "Dibantu sales: Budi" sebelum kirim form). Yang dibalikin
// cuma nama - nomor HP sales nggak ikut.
router.get('/sales/:kode', otpIpLimiter, async (req, res, next) => {
  try {
    const s = await cariSalesAktif(req.params.kode);
    if (!s) return res.status(404).json({ error: 'Kode sales nggak dikenal' });
    res.json({ kode: s.kode, nama: s.nama });
  } catch (e) {
    next(e);
  }
});

// Username & nomor HP belum dipakai warung lain? Balikin pesan error, atau null kalau aman.
async function cekBelumDipakai(username, hp) {
  const ada = await query('SELECT id FROM warung WHERE username=$1', [username]);
  if (ada.rows.length) return 'Username sudah dipakai';
  const adaHp = await query('SELECT id FROM warung WHERE no_hp=$1', [hp]);
  if (adaHp.rows.length) return 'Nomor HP ini sudah dipakai warung lain';
  return null;
}

router.post('/register/kirim-kode', otpIpLimiter, otpLimiter, async (req, res, next) => {
  try {
    const { namaWarung, username, password, noHp, kodeSales } = req.body;
    const nama = typeof namaWarung === 'string' ? namaWarung.trim() : '';
    const user = typeof username === 'string' ? username.trim() : '';
    if (!nama || !user || !password || !noHp) {
      return res.status(400).json({ error: 'Nama warung, username, password, dan nomor HP wajib diisi' });
    }
    if (password.length < 6) return res.status(400).json({ error: 'Password minimal 6 karakter' });
    const hp = normalisasiNoHp(noHp);
    if (!hp) return res.status(400).json({ error: 'Nomor HP tidak valid. Contoh: 0812-3456-7890' });
    const dipakai = await cekBelumDipakai(user, hp);
    if (dipakai) return res.status(409).json({ error: dipakai });
    // Kode sales opsional, tapi kalau diisi harus bener - salah ketik jangan diem-diem bikin warungnya nggak
    // kecatat ke sales mana pun.
    let sales = null;
    if (typeof kodeSales === 'string' && kodeSales.trim()) {
      sales = await cariSalesAktif(kodeSales);
      if (!sales) return res.status(400).json({ error: 'Kode sales nggak dikenal. Cek lagi, atau kosongin aja kalau nggak ada.' });
    }

    await pastikanTabelDaftar();
    // Batas kirim per NOMOR dihitung dari tabel (sama alasannya kayak buatDanKirimOtp) - tiap kirim itu pesan WA
    // berbayar ke nomor orang, jangan bisa dipakai nyepam nomor korban.
    const { rows: hitung } = await query(
      `SELECT count(*)::int AS n FROM pendaftaran_otp WHERE no_hp=$1 AND created_at > now() - ($2 || ' minutes')::interval`,
      [hp, String(OTP_JENDELA_MENIT)]
    );
    if (hitung[0].n >= OTP_MAKS_KIRIM) {
      return res.status(429).json({ error: `Sudah terlalu sering minta kode ke nomor ini. Coba lagi ${OTP_JENDELA_MENIT} menit lagi.` });
    }

    // Kode lama yang masih hidup buat nomor ini dihanguskan - cuma kode terakhir yang berlaku.
    await query('UPDATE pendaftaran_otp SET dipakai=true WHERE no_hp=$1 AND dipakai=false', [hp]);
    const kode = String(Math.floor(100000 + Math.random() * 900000));
    const { rows } = await query(
      `INSERT INTO pendaftaran_otp (nama, username, no_hp, password_hash, kode_hash, kedaluwarsa, sales_id)
       VALUES ($1,$2,$3,$4,$5, now() + ($6 || ' minutes')::interval, $7) RETURNING id`,
      [nama, user, hp, await bcrypt.hash(password, 10), await bcrypt.hash(kode, 10), String(OTP_MENIT), sales?.id || null]
    );
    const terkirim = await kirimOtpWa(hp, kode, 'daftar');
    // Gateway WA aktif tapi pesannya ditolak (nomor nggak punya WhatsApp, dst): daftar nggak bisa lanjut, karena
    // kodenya nggak akan pernah nyampe. Kalau gateway belum diisi sama sekali (laptop developer), kodenya ada di
    // log server (lihat kirimOtpWa) - alurnya tetap bisa dicoba.
    if (!terkirim && waAktif()) {
      await query('UPDATE pendaftaran_otp SET dipakai=true WHERE id=$1', [rows[0].id]);
      return res.status(502).json({ error: 'Kode gagal dikirim ke WhatsApp nomor ini. Pastikan nomornya benar & WhatsApp-nya aktif, lalu coba lagi.' });
    }
    res.json({ pendaftaranId: rows[0].id, noHpSamar: samarkanNoHp(hp), berlakuMenit: OTP_MENIT });
  } catch (e) {
    next(e);
  }
});

router.post('/register/verifikasi', otpIpLimiter, otpLimiter, async (req, res, next) => {
  try {
    const { pendaftaranId, kode } = req.body;
    if (!POLA_UUID_DAFTAR.test(pendaftaranId || '') || !kode) return res.status(400).json({ error: 'Kode wajib diisi' });
    await pastikanTabelDaftar();
    const { rows } = await query('SELECT * FROM pendaftaran_otp WHERE id=$1 AND dipakai=false AND kedaluwarsa > now()', [pendaftaranId]);
    const p = rows[0];
    if (!p) return res.status(400).json({ error: 'Kode sudah kedaluwarsa. Minta kode baru.' });
    if (p.percobaan >= OTP_MAKS_SALAH) {
      await query('UPDATE pendaftaran_otp SET dipakai=true WHERE id=$1', [p.id]);
      return res.status(429).json({ error: 'Terlalu banyak percobaan. Minta kode baru.' });
    }
    if (!(await bcrypt.compare(String(kode).trim(), p.kode_hash))) {
      await query('UPDATE pendaftaran_otp SET percobaan=percobaan+1 WHERE id=$1', [p.id]);
      const sisa = OTP_MAKS_SALAH - (p.percobaan + 1);
      return res.status(400).json({ error: sisa > 0 ? `Kode salah. Sisa ${sisa} percobaan.` : 'Kode salah. Minta kode baru.' });
    }
    // Dicek ulang: selama nunggu kode, username/nomornya bisa keburu dipakai pendaftaran lain.
    const dipakai = await cekBelumDipakai(p.username, p.no_hp);
    if (dipakai) {
      await query('UPDATE pendaftaran_otp SET dipakai=true WHERE id=$1', [p.id]);
      return res.status(409).json({ error: dipakai });
    }
    const { rows: w } = await query(
      `INSERT INTO warung (nama, username, password_hash, no_hp, sales_id)
       VALUES ($1,$2,$3,$4, (SELECT id FROM sales WHERE id=$5)) RETURNING *`,
      [p.nama, p.username, p.password_hash, p.no_hp, p.sales_id]
    );
    await query('UPDATE pendaftaran_otp SET dipakai=true WHERE id=$1', [p.id]);
    const warung = warungPublik(w[0]);
    res.status(201).json({ warung, token: buatToken(warung.id) });
  } catch (e) {
    next(e);
  }
});

// Jalur daftar LAMA (tanpa verifikasi WA) ditutup - kalau dibiarin, verifikasi bisa dilewatin tinggal manggil
// endpoint ini langsung. Aplikasi versi lama yang masih ke-cache di HP dikasih tau buat buka ulang.
router.post('/register', (req, res) => {
  res.status(410).json({ error: 'Pendaftaran sekarang pakai verifikasi WhatsApp. Tutup lalu buka lagi aplikasinya, terus daftar ulang.' });
});

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username dan password wajib diisi' });
    const { rows } = await query('SELECT * FROM warung WHERE username=$1', [username]);
    const w = rows[0];
    if (!w || !(await bcrypt.compare(password, w.password_hash))) {
      return res.status(401).json({ error: 'Username atau password salah' });
    }
    res.json({ warung: warungPublik(w), token: buatToken(w.id) });
  } catch (e) {
    next(e);
  }
});

// ganti password akun warung (butuh login — dipakai dari layar Lainnya)
router.patch('/password', requireAuth, loginLimiter, async (req, res, next) => {
  try {
    const { passwordLama, passwordBaru } = req.body;
    if (!passwordLama || !passwordBaru || passwordBaru.length < 6) {
      return res.status(400).json({ error: 'passwordLama & passwordBaru (min. 6 karakter) wajib diisi' });
    }
    const { rows } = await query('SELECT * FROM warung WHERE id=$1', [req.warungId]);
    const w = rows[0];
    if (!w || !(await bcrypt.compare(passwordLama, w.password_hash))) {
      return res.status(401).json({ error: 'Password lama salah' });
    }
    const hash = await bcrypt.hash(passwordBaru, 10);
    await query('UPDATE warung SET password_hash=$1 WHERE id=$2', [hash, w.id]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---- Isi/ganti nomor HP pemulihan (menu Lainnya) ----
//
// Dulu cukup password. Masalahnya password itu sering DIBAGI (1 akun dipakai istri/anak/penjaga, akun demo dipakai
// rame-rame sama sales) - siapa pun yang tau password bisa mindahin nomor pemulihan ke nomornya sendiri, terus
// pakai "lupa password" buat ngambil alih akun. Sekarang 2 langkah:
//  1. password + nomor baru -> kode dikirim ke WA nomor LAMA (izin pemilik nomor sekarang) DAN ke WA nomor BARU
//     (mastiin nomornya bener & aktif). Akun yang belum punya nomor cuma dapet kode ke nomor baru.
//  2. dua kode dimasukin -> baru nomornya diganti.
// Tanpa pegang HP nomor lama, nomor nggak bisa dipindah.
let tabelGantiHpSiap = null;
function pastikanTabelGantiHp() {
  if (!tabelGantiHpSiap) {
    tabelGantiHpSiap = (async () => {
      await query(`CREATE TABLE IF NOT EXISTS ganti_nohp (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        warung_id UUID NOT NULL REFERENCES warung(id) ON DELETE CASCADE,
        no_hp_lama TEXT,
        no_hp_baru TEXT NOT NULL,
        kode_lama_hash TEXT,
        kode_baru_hash TEXT NOT NULL,
        kedaluwarsa TIMESTAMPTZ NOT NULL,
        percobaan INT NOT NULL DEFAULT 0,
        dipakai BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT now()
      )`);
      await query('CREATE INDEX IF NOT EXISTS idx_ganti_nohp_warung ON ganti_nohp (warung_id, created_at DESC)');
    })().catch((e) => {
      tabelGantiHpSiap = null;
      throw e;
    });
  }
  return tabelGantiHpSiap;
}

const GANTI_HP_MAKS_KIRIM = 4; // per akun per OTP_JENDELA_MENIT - tiap permintaan bisa ngirim 2 pesan WA
const buatKode = () => String(Math.floor(100000 + Math.random() * 900000));

router.post('/no-hp/kirim-kode', requireAuth, otpIpLimiter, otpLimiter, async (req, res, next) => {
  try {
    const { password, noHp } = req.body;
    const hp = normalisasiNoHp(noHp);
    if (!password || !hp) return res.status(400).json({ error: 'Password & nomor HP yang valid wajib diisi' });
    const { rows } = await query('SELECT * FROM warung WHERE id=$1', [req.warungId]);
    const w = rows[0];
    if (!w || !(await bcrypt.compare(password, w.password_hash))) {
      return res.status(401).json({ error: 'Password salah' });
    }
    if (hp === w.no_hp) return res.status(400).json({ error: 'Itu nomor yang sekarang dipakai' });
    const dipakai = await query('SELECT id FROM warung WHERE no_hp=$1 AND id<>$2', [hp, w.id]);
    if (dipakai.rows.length) return res.status(409).json({ error: 'Nomor HP ini sudah dipakai warung lain' });

    await pastikanTabelGantiHp();
    const { rows: hitung } = await query(
      `SELECT count(*)::int AS n FROM ganti_nohp WHERE warung_id=$1 AND created_at > now() - ($2 || ' minutes')::interval`,
      [w.id, String(OTP_JENDELA_MENIT)]
    );
    if (hitung[0].n >= GANTI_HP_MAKS_KIRIM) {
      return res.status(429).json({ error: `Sudah terlalu sering minta kode. Coba lagi ${OTP_JENDELA_MENIT} menit lagi.` });
    }

    await query('UPDATE ganti_nohp SET dipakai=true WHERE warung_id=$1 AND dipakai=false', [w.id]);
    const kodeBaru = buatKode();
    const kodeLama = w.no_hp ? buatKode() : null;
    const { rows: g } = await query(
      `INSERT INTO ganti_nohp (warung_id, no_hp_lama, no_hp_baru, kode_lama_hash, kode_baru_hash, kedaluwarsa)
       VALUES ($1,$2,$3,$4,$5, now() + ($6 || ' minutes')::interval) RETURNING id`,
      [w.id, w.no_hp, hp, kodeLama ? await bcrypt.hash(kodeLama, 10) : null, await bcrypt.hash(kodeBaru, 10), String(OTP_MENIT)]
    );
    // Nomor lama dikirimin juga peringatan: kalau bukan pemiliknya yang minta, dia langsung tau ada yang nyoba.
    const lamaTerkirim = kodeLama ? await kirimOtpWa(w.no_hp, kodeLama, 'nohp-lama', { noHpBaru: samarkanNoHp(hp) }) : true;
    const baruTerkirim = await kirimOtpWa(hp, kodeBaru, 'nohp-baru');
    if (waAktif() && (!lamaTerkirim || !baruTerkirim)) {
      await query('UPDATE ganti_nohp SET dipakai=true WHERE id=$1', [g[0].id]);
      return res.status(502).json({
        error: !baruTerkirim
          ? 'Kode gagal dikirim ke WhatsApp nomor baru. Pastikan nomornya benar & WhatsApp-nya aktif.'
          : 'Kode gagal dikirim ke WhatsApp nomor lama. Coba lagi sebentar lagi.',
      });
    }
    res.json({
      id: g[0].id,
      perluKodeLama: !!kodeLama,
      noHpLamaSamar: w.no_hp ? samarkanNoHp(w.no_hp) : null,
      noHpBaruSamar: samarkanNoHp(hp),
      berlakuMenit: OTP_MENIT,
    });
  } catch (e) {
    next(e);
  }
});

router.post('/no-hp/verifikasi', requireAuth, otpIpLimiter, otpLimiter, async (req, res, next) => {
  try {
    const { id, kodeLama, kodeBaru } = req.body;
    if (!POLA_UUID_DAFTAR.test(id || '') || !kodeBaru) return res.status(400).json({ error: 'Kode wajib diisi' });
    await pastikanTabelGantiHp();
    const { rows } = await query(
      'SELECT * FROM ganti_nohp WHERE id=$1 AND warung_id=$2 AND dipakai=false AND kedaluwarsa > now()',
      [id, req.warungId]
    );
    const g = rows[0];
    if (!g) return res.status(400).json({ error: 'Kode sudah kedaluwarsa. Minta kode baru.' });
    if (g.percobaan >= OTP_MAKS_SALAH) {
      await query('UPDATE ganti_nohp SET dipakai=true WHERE id=$1', [g.id]);
      return res.status(429).json({ error: 'Terlalu banyak percobaan. Minta kode baru.' });
    }
    const lamaCocok = !g.kode_lama_hash || (await bcrypt.compare(String(kodeLama || '').trim(), g.kode_lama_hash));
    const baruCocok = await bcrypt.compare(String(kodeBaru).trim(), g.kode_baru_hash);
    if (!lamaCocok || !baruCocok) {
      await query('UPDATE ganti_nohp SET percobaan=percobaan+1 WHERE id=$1', [g.id]);
      const sisa = OTP_MAKS_SALAH - (g.percobaan + 1);
      const yang = !lamaCocok && !baruCocok ? 'Dua kode salah' : !lamaCocok ? 'Kode dari nomor lama salah' : 'Kode dari nomor baru salah';
      return res.status(400).json({ error: sisa > 0 ? `${yang}. Sisa ${sisa} percobaan.` : `${yang}. Minta kode baru.` });
    }
    // Selama nunggu kode, nomornya bisa keburu berubah (dari HP lain) atau nomor barunya keburu dipakai warung lain.
    const { rows: wr } = await query('SELECT no_hp FROM warung WHERE id=$1', [req.warungId]);
    if ((wr[0]?.no_hp || null) !== (g.no_hp_lama || null)) {
      await query('UPDATE ganti_nohp SET dipakai=true WHERE id=$1', [g.id]);
      return res.status(409).json({ error: 'Nomor akun ini baru aja berubah. Ulangi dari awal.' });
    }
    const dipakai = await query('SELECT id FROM warung WHERE no_hp=$1 AND id<>$2', [g.no_hp_baru, req.warungId]);
    if (dipakai.rows.length) {
      await query('UPDATE ganti_nohp SET dipakai=true WHERE id=$1', [g.id]);
      return res.status(409).json({ error: 'Nomor HP ini sudah dipakai warung lain' });
    }
    await query('UPDATE warung SET no_hp=$1 WHERE id=$2', [g.no_hp_baru, req.warungId]);
    await query('UPDATE ganti_nohp SET dipakai=true WHERE id=$1', [g.id]);
    res.json({ ok: true, noHp: g.no_hp_baru });
  } catch (e) {
    next(e);
  }
});

// Jalur lama (cukup password) ditutup - kalau dibiarin, verifikasi WA bisa dilewatin tinggal manggil ini langsung.
router.patch('/no-hp', requireAuth, (req, res) => {
  res.status(410).json({ error: 'Ganti nomor sekarang pakai kode WhatsApp. Tutup lalu buka lagi aplikasinya, terus coba lagi.' });
});

// ---- OTP: bikin, kirim, verifikasi ----

// Bikin kode baru + kirim ke WA. Kode LAMA yang masih hidup langsung dihanguskan supaya nggak ada
// dua kode valid barengan (kalau user minta kirim ulang, cuma kode terakhir yang berlaku).
async function buatDanKirimOtp(warung, tujuan) {
  // Batas kirim per AKUN, dihitung dari isi tabel - BUKAN dari rate limit di middleware.
  // Alasannya: middleware cuma kenal apa yang diketik pemohon (username ATAU nomor HP), jadi satu
  // akun yang sama kebaca dua identitas beda dan dapat dua jatah terpisah - tinggal selang-seling
  // buat ngirim dua kali lipat WA ke nomor korban. Di sini akunnya sudah pasti (warung.id), jadi
  // hitungannya tepat berapa pun cara dia manggil. Berbasis tabel juga berarti jatahnya nggak
  // ke-reset cuma gara-gara server restart, beda sama penghitung di memori.
  const { rows: hitung } = await query(
    `SELECT count(*)::int AS n FROM kode_otp
     WHERE warung_id=$1 AND created_at > now() - ($2 || ' minutes')::interval`,
    [warung.id, String(OTP_JENDELA_MENIT)]
  );
  if (hitung[0].n >= OTP_MAKS_KIRIM) {
    throw Object.assign(
      new Error(`Sudah terlalu sering minta kode. Coba lagi ${OTP_JENDELA_MENIT} menit lagi.`),
      { status: 429 }
    );
  }

  await query('UPDATE kode_otp SET dipakai=true WHERE warung_id=$1 AND tujuan=$2 AND dipakai=false', [warung.id, tujuan]);
  const kode = String(Math.floor(100000 + Math.random() * 900000));
  const kodeHash = await bcrypt.hash(kode, 10);
  await query(
    `INSERT INTO kode_otp (warung_id, kode_hash, tujuan, kedaluwarsa)
     VALUES ($1,$2,$3, now() + ($4 || ' minutes')::interval)`,
    [warung.id, kodeHash, tujuan, String(OTP_MENIT)]
  );
  await kirimOtpWa(warung.no_hp, kode, tujuan);
}

// Cocokkan kode yang diketik user sama baris OTP terakhir yang masih hidup. Balikin baris OTP-nya
// kalau cocok, atau lempar error yang pesannya udah layak dibaca user.
async function verifikasiOtp(warungId, tujuan, kode) {
  const { rows } = await query(
    `SELECT * FROM kode_otp
     WHERE warung_id=$1 AND tujuan=$2 AND dipakai=false AND kedaluwarsa > now()
     ORDER BY created_at DESC LIMIT 1`,
    [warungId, tujuan]
  );
  const otp = rows[0];
  if (!otp) throw Object.assign(new Error('Kode sudah kedaluwarsa. Minta kode baru.'), { status: 400 });
  if (otp.percobaan >= OTP_MAKS_SALAH) {
    await query('UPDATE kode_otp SET dipakai=true WHERE id=$1', [otp.id]);
    throw Object.assign(new Error('Terlalu banyak percobaan. Minta kode baru.'), { status: 429 });
  }
  if (!(await bcrypt.compare(String(kode || ''), otp.kode_hash))) {
    await query('UPDATE kode_otp SET percobaan=percobaan+1 WHERE id=$1', [otp.id]);
    const sisa = OTP_MAKS_SALAH - (otp.percobaan + 1);
    throw Object.assign(
      new Error(sisa > 0 ? `Kode salah. Sisa ${sisa} percobaan.` : 'Kode salah. Minta kode baru.'),
      { status: 400 }
    );
  }
  await query('UPDATE kode_otp SET dipakai=true WHERE id=$1', [otp.id]);
  return otp;
}

// Minta kode buat LUPA PASSWORD (belum login). Bisa pakai username ATAU nomor HP - orang yang lupa
// password sering lupa username juga, tapi nomor HP-nya sendiri pasti inget.
//
// STATUS-nya selalu 200 & pesannya selalu sama, apa pun hasilnya (akun ketemu/nggak, nomor kosong,
// WA gagal) - biar nggak ada beda sukses/error yang bisa dipakai nebak akun.
//
// TAPI `noHpSamar` di bawah SENGAJA dikecualikan dari keseragaman itu, dan itu memang trade-off
// yang diambil sadar: nomor tersamar cuma muncul kalau akunnya ada, jadi endpoint ini MASIH bisa
// dipakai ngecek "username X kedaftar nggak". Ditukar sama hal yang lebih penting buat pemilik
// warung: banyak yang daftar pakai nomor lama lalu ganti nomor: tanpa petunjuk ini mereka nunggu
// kode yang nggak akan pernah nyampe, tanpa tau kenapa. Yang bocor cuma 4 digit depan + 3 digit
// belakang, nggak cukup buat dihubungi. Kalau nanti kepakai di skala lebih gede dan enumerasi jadi
// masalah beneran, yang dihapus cukup field `noHpSamar` - sisa alurnya nggak ikut berubah.
router.post('/otp/kirim', otpIpLimiter, otpLimiter, async (req, res, next) => {
  try {
    const { username, noHp } = req.body;
    const hp = normalisasiNoHp(noHp);
    if (!username && !hp) return res.status(400).json({ error: 'Username atau nomor HP wajib diisi' });

    const { rows } = await query(
      'SELECT * FROM warung WHERE ($1::text IS NOT NULL AND username=$1) OR ($2::text IS NOT NULL AND no_hp=$2) LIMIT 1',
      [username || null, hp || null]
    );
    const w = rows[0];
    if (w && w.no_hp) await buatDanKirimOtp(w, 'reset');

    res.json({
      ok: true,
      pesan: 'Kalau akunnya terdaftar dan punya nomor HP, kode verifikasi sudah dikirim lewat WhatsApp.',
      // Cuma dikasih kalau akunnya ADA - bentuknya sudah disamarkan (0812-****-890), jadi berguna
      // buat mastiin "oh iya nomor saya", tapi nggak ngasih nomor utuh ke orang yang cuma nebak.
      noHpSamar: w && w.no_hp ? samarkanNoHp(w.no_hp) : null,
    });
  } catch (e) {
    next(e);
  }
});

// Verifikasi kode lupa-password. Sukses -> dapat token khusus reset (10 menit, sekali pakai),
// BUKAN token login - jadi kalau bocor pun nggak bisa dipakai buka data warung.
router.post('/otp/verifikasi', otpIpLimiter, otpLimiter, async (req, res, next) => {
  try {
    const { username, noHp, kode } = req.body;
    const hp = normalisasiNoHp(noHp);
    if ((!username && !hp) || !kode) return res.status(400).json({ error: 'Username/nomor HP dan kode wajib diisi' });

    const { rows } = await query(
      'SELECT * FROM warung WHERE ($1::text IS NOT NULL AND username=$1) OR ($2::text IS NOT NULL AND no_hp=$2) LIMIT 1',
      [username || null, hp || null]
    );
    const w = rows[0];
    // Akun nggak ada: pesannya disamain persis sama "kode salah" biar tetap nggak ketahuan
    // username mana yang beneran ada (lihat alasan panjangnya di /otp/kirim).
    if (!w) return res.status(400).json({ error: 'Kode salah atau sudah kedaluwarsa' });

    const otp = await verifikasiOtp(w.id, 'reset', kode);
    const token = jwt.sign({ warungId: w.id, otpId: otp.id, tujuan: 'reset' }, SECRET, { expiresIn: `${OTP_MENIT}m` });
    res.json({ token, username: w.username });
  } catch (e) {
    next(e);
  }
});

// Pasang password baru pakai token hasil verifikasi OTP. Token dicek 3 lapis: tanda tangannya sah,
// tujuannya memang 'reset' (bukan token login yang dipaksa masuk ke sini), dan baris OTP-nya masih
// ada - baris itu DIHAPUS setelah sukses, jadi satu kode = satu kali ganti password.
router.post('/reset-password', otpIpLimiter, otpLimiter, async (req, res, next) => {
  try {
    const { token, passwordBaru } = req.body;
    if (!token || !passwordBaru || passwordBaru.length < 6) {
      return res.status(400).json({ error: 'Token & password baru (min. 6 karakter) wajib diisi' });
    }
    let payload;
    try {
      payload = jwt.verify(token, SECRET);
    } catch {
      return res.status(401).json({ error: 'Sesi reset kedaluwarsa. Ulangi dari awal.' });
    }
    if (payload.tujuan !== 'reset' || !payload.otpId) {
      return res.status(401).json({ error: 'Token tidak berlaku untuk reset password' });
    }
    const cek = await query('SELECT id FROM kode_otp WHERE id=$1 AND warung_id=$2', [payload.otpId, payload.warungId]);
    if (!cek.rows.length) return res.status(401).json({ error: 'Sesi reset sudah dipakai. Ulangi dari awal.' });

    const hash = await bcrypt.hash(passwordBaru, 10);
    await query('UPDATE warung SET password_hash=$1 WHERE id=$2', [hash, payload.warungId]);
    await query('DELETE FROM kode_otp WHERE id=$1', [payload.otpId]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---- PIN pemilik (sudah login) ----
// Satu PIN per AKUN warung, disimpan di server (hash bcrypt). Dulu PIN disimpan lokal di tiap HP, jadi akun
// yang sama bisa punya PIN beda di tiap HP - bikin bingung & PIN yang diganti di satu HP nggak ngaruh ke HP lain.
const PIN_GAMPANG = new Set(['1234', '4321', '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999']);
const pinValid = (pin) => typeof pin === 'string' && /^\d{4}$/.test(pin);

// Kolom pin_hash ditambah otomatis kalau belum ada. Deploy di VPS cuma git pull + build + restart (nggak
// jalanin `npm run migrate`) - tanpa ini, fitur PIN langsung error 500 sampai ada yang inget migrasi.
let kolomPinSiap = null;
function pastikanKolomPin() {
  if (!kolomPinSiap) {
    kolomPinSiap = query('ALTER TABLE warung ADD COLUMN IF NOT EXISTS pin_hash TEXT').catch((e) => {
      kolomPinSiap = null;
      throw e;
    });
  }
  return kolomPinSiap;
}

async function ambilPinHash(warungId) {
  await pastikanKolomPin();
  const { rows } = await query('SELECT pin_hash FROM warung WHERE id=$1', [warungId]);
  if (!rows.length) throw Object.assign(new Error('Akun tidak ditemukan'), { status: 404 });
  return rows[0].pin_hash;
}

// Udah punya PIN belum? (buat nentuin layar "Masukkan PIN" atau "Bikin PIN")
router.get('/pin', requireAuth, async (req, res, next) => {
  try {
    res.json({ dibuat: Boolean(await ambilPinHash(req.warungId)) });
  } catch (e) {
    next(e);
  }
});

// Bikin PIN pertama kali. Cuma boleh kalau akun BELUM punya PIN - ganti PIN yang udah ada wajib lewat kode WA
// (di bawah), biar orang yang kebetulan megang HP warung nggak bisa nimpa PIN pemilik.
router.post('/pin/buat', requireAuth, loginLimiter, async (req, res, next) => {
  try {
    const { pin } = req.body;
    if (!pinValid(pin)) return res.status(400).json({ error: 'PIN harus 4 angka' });
    if (PIN_GAMPANG.has(pin)) return res.status(400).json({ error: 'PIN itu gampang ditebak - pilih kombinasi lain ya' });
    await pastikanKolomPin();
    const hash = await bcrypt.hash(pin, 10);
    // WHERE pin_hash IS NULL: kalau dua HP bikin barengan, cuma yang pertama yang kesimpen.
    const { rowCount } = await query('UPDATE warung SET pin_hash=$1 WHERE id=$2 AND pin_hash IS NULL', [hash, req.warungId]);
    if (!rowCount) return res.status(409).json({ error: 'Akun ini udah punya PIN - masukkan PIN yang dipakai di HP lain' });
    res.status(201).json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/pin/cek', requireAuth, pinLimiter, async (req, res, next) => {
  try {
    const { pin } = req.body;
    const hash = await ambilPinHash(req.warungId);
    if (!hash) return res.status(404).json({ error: 'PIN belum dibuat', belumDibuat: true });
    if (!pinValid(pin) || !(await bcrypt.compare(pin, hash))) return res.status(401).json({ error: 'PIN salah, coba lagi' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---- OTP buat ganti PIN (sudah login) ----
// Gunanya OTP: orang yang kebetulan pegang HP warung yang lagi kebuka nggak bisa diam-diam ganti PIN
// pelindung data modal tanpa akses ke WA pemiliknya. PIN barunya disimpan di server di langkah yang SAMA
// dengan verifikasi kode - jadi nggak ada celah "kode udah lolos tapi PIN-nya diisi belakangan".
router.post('/pin/otp/kirim', requireAuth, otpIpLimiter, otpLimiter, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM warung WHERE id=$1', [req.warungId]);
    const w = rows[0];
    if (!w) return res.status(404).json({ error: 'Akun tidak ditemukan' });
    if (!w.no_hp) {
      return res.status(400).json({ error: 'Akun ini belum punya nomor HP. Isi dulu di menu Akun & keamanan.' });
    }
    await buatDanKirimOtp(w, 'pin');
    res.json({ ok: true, noHpSamar: samarkanNoHp(w.no_hp) });
  } catch (e) {
    next(e);
  }
});

router.post('/pin/otp/verifikasi', requireAuth, otpIpLimiter, otpLimiter, async (req, res, next) => {
  try {
    const { kode, pinBaru } = req.body;
    if (!kode) return res.status(400).json({ error: 'Kode wajib diisi' });
    // PIN baru dicek SEBELUM kodenya dipakai - kalau PIN-nya ditolak, kodenya masih bisa dipakai lagi.
    if (pinBaru !== undefined) {
      if (!pinValid(pinBaru)) return res.status(400).json({ error: 'PIN baru harus 4 angka' });
      if (PIN_GAMPANG.has(pinBaru)) return res.status(400).json({ error: 'PIN itu gampang ditebak - pilih kombinasi lain ya' });
    }
    await verifikasiOtp(req.warungId, 'pin', kode);
    // Aplikasi versi lama (masih ke-cache) cuma ngirim kode tanpa pinBaru - tetap dijawab ok biar alurnya nggak rusak.
    if (pinBaru !== undefined) {
      await pastikanKolomPin();
      await query('UPDATE warung SET pin_hash=$1 WHERE id=$2', [await bcrypt.hash(pinBaru, 10), req.warungId]);
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---- Profil usaha ("kenalan dulu" pas pertama masuk, bisa diubah dari Lainnya) ----
// null = belum pernah diisi -> aplikasi nampilin layar kenalan dulu sebelum masuk.
router.get('/profil-usaha', requireAuth, async (req, res, next) => {
  try {
    res.json({ profil: await ambilProfilUsaha(req.warungId) });
  } catch (e) {
    next(e);
  }
});

router.put('/profil-usaha', requireAuth, async (req, res, next) => {
  try {
    const profil = bersihkanProfil(req.body);
    if (!profil) return res.status(400).json({ error: 'Pilih jenis usahanya dulu' });
    await pastikanKolomProfil();
    await query('UPDATE warung SET profil_usaha=$1 WHERE id=$2', [JSON.stringify(profil), req.warungId]);
    // Nama panggilan langsung jadi memori Mang AI - tanpa panggilan AI, tanpa token.
    if (profil.namaPanggilan) {
      await simpanMemori(req.warungId, [`Pemilik minta dipanggil ${profil.namaPanggilan}`], 'profil').catch((e) =>
        console.warn('[auth] gagal nyimpen nama panggilan ke memori:', e.message)
      );
    }
    res.json({ profil });
  } catch (e) {
    next(e);
  }
});

export default router;
