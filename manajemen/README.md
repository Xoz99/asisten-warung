# Makalin Ops

Aplikasi operasional internal (dulu "Konsulin Manajemen"). Tahap 1: Dashboard, Leads (warung dari sales + CRM manual + sales),
Keuangan (Midtrans + catatan manual), Notifikasi, Pengaturan (tim & akun demo), Profile, Rekrutmen Sales Partner, dan Karyawan
(data kepegawaian, kehadiran harian, cuti & izin dengan persetujuan, payroll bulanan, struktur organisasi). Artifact, AI Chat: menyusul.
Arah desain: `DESIGN.md` (neo-brutalism); filter anti-slop: `.claude/skills/antislop*` di root repo. **Sengaja terpisah** dari
aplikasi produknya: proses pm2, port, dan domain sendiri. Aplikasi Warung Pintar nggak punya halaman/API admin sama sekali.
Manajemen baca/tulis langsung ke database produk.

## Setup di server

```bash
cd manajemen
npm install
cp .env.example .env   # isi MANAJEMEN_JWT_SECRET, ADMIN_KEY & WARUNG_PINTAR_DATABASE_URL
npm run build
pm2 start server/index.js --name konsulin-manajemen
```

Terus arahin domain terpisah (mis. `manajemen.konsulin.com`) ke port-nya (default 4100) di reverse proxy. Contoh Caddy:

```
manajemen.konsulin.com {
    reverse_proxy <host>:4100
}
```

Update: `git pull && npm install && npm run build && pm2 restart konsulin-manajemen`.

### Form lamaran Sales Partner di konsulin.com

Form lamaran publik ada di landing page (`konsulin-landing-page`, halaman `/karir`). Server landing yang nerusin
kirimannya ke `http://127.0.0.1:4100/api/publik/daftar` (env `MAKALIN_API_URL` di landing), jadi browser pelamar nggak
pernah nyentuh domain makalin. Isi `DAFTAR_URL=https://konsulin.com/karir` di `.env` Makalin: link yang disalin di
Rekrutmen pakai alamat itu, dan link lama `makalin.konsulin.com/daftar?s=...` dialihin ke sana.

## Login admin

Tiap orang punya akun sendiri (username + password), dan semua perubahan kecatat di **Admin & aktivitas**.
Pertama kali dibuka muncul layar **Buat admin pertama** - isi pakai `ADMIN_KEY` dari `.env`. Admin berikutnya
(temen, dst) ditambah dari halaman Admin & aktivitas. Sesi login berlaku 12 jam; reset password / nonaktifin admin
langsung mutus sesinya.

## Development

`npm run dev` - nyalain API (port 4100) + tampilan (http://localhost:5174) sekaligus. Butuh `.env` (lihat `.env.example`).

## Nambah produk

1. Server: bikin `server/produk/<id>/` berisi router-nya, daftarin di `server/produk/index.js`.
2. Tampilan: bikin `src/produk/<id>/…jsx`, daftarin di `HALAMAN` di `src/App.jsx`.
