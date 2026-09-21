# Konsulin Manajemen

Aplikasi internal buat ngelola produk-produk Konsulin (sekarang: Warung Pintar > Sales). **Sengaja terpisah** dari
aplikasi produknya: proses pm2, port, dan domain sendiri. Aplikasi Warung Pintar nggak punya halaman/API admin sama sekali.
Manajemen baca/tulis langsung ke database produk.

## Setup di server

```bash
cd manajemen
npm install
cp .env.example .env   # isi ADMIN_KEY (openssl rand -hex 24) & WARUNG_PINTAR_DATABASE_URL
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

## Development

`npm run dev:server` (API, port 4100) + `npm run dev` (tampilan, http://localhost:5174).

## Nambah produk

1. Server: bikin `server/produk/<id>/` berisi router-nya, daftarin di `server/produk/index.js`.
2. Tampilan: bikin `src/produk/<id>/…jsx`, daftarin di `HALAMAN` di `src/App.jsx`.
