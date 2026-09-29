// Service worker Asisten Warung: bikin aplikasinya bisa DIBUKA TANPA INTERNET setelah sekali kebuka online
// (di browser & di APK). Data warung sendiri tetap disimpen lewat IndexedDB (lib/localdb.js + outbox.js).
//
// Dulu berkas ini sengaja nggak nyimpen apa-apa, karena cache yang salah bikin user nyangkut di versi lama
// berhari-hari. Aturan di bawah dibikin biar itu NGGAK kejadian:
// - Halaman (index.html): SELALU ambil dari internet dulu. Cache cuma dipakai kalau offline / internetnya mati.
//   Jadi tiap deploy langsung kebaca begitu ada sinyal.
// - Berkas /assets/ (JS/CSS): namanya ber-hash (isi beda = nama beda), jadi aman disimpen permanen. Semua
//   berkas dari dist/sw-aset.json (dibikin vite.config.js) disimpen sekaligus, biar layar yang belum pernah
//   dibuka pun tetap bisa kebuka offline. Tiap halaman kebuka online, daftarnya dicek ulang: berkas versi
//   baru ditambah, yang udah nggak kepakai dibuang.
// - Model AI (/models/): disimpen begitu pertama dipakai, atau duluan di latar kalau HP pakai Wi-Fi (pesan
//   'simpan-model' dari main.jsx) - biar scan foto & kenal wajah langsung bisa offline.
// - /api/ NGGAK PERNAH di-cache.
const HALAMAN = 'aw-halaman-v1';
const ASET = 'aw-aset-v1';
const MODEL = 'aw-model-v1';
const DAFTAR = '/__aw-daftar-aset';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(Promise.all([segarkanAset(), simpanHalaman()]).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const dipakai = [HALAMAN, ASET, MODEL];
      for (const k of await caches.keys()) if (!dipakai.includes(k)) await caches.delete(k);
      await self.clients.claim();
    })()
  );
});

async function simpanHalaman() {
  const res = await fetch('/', { cache: 'no-store' });
  if (res.ok) await (await caches.open(HALAMAN)).put('/', res);
}

// Samain isi cache aset dengan daftar build terbaru (dist/sw-aset.json).
let lagiSegarkan = null;
function segarkanAset() {
  if (!lagiSegarkan) {
    lagiSegarkan = (async () => {
      const res = await fetch('/sw-aset.json', { cache: 'no-store' });
      if (!res.ok) return;
      const { versi, aset } = await res.json();
      const cache = await caches.open(ASET);
      const lama = await cache.match(DAFTAR);
      if (lama && (await lama.json()).versi === versi) return;
      const ada = new Set((await cache.keys()).map((r) => new URL(r.url).pathname));
      await Promise.allSettled(aset.filter((a) => !ada.has(a)).map((a) => cache.add(a)));
      const baru = new Set(aset);
      for (const r of await cache.keys()) {
        const p = new URL(r.url).pathname;
        if (p !== DAFTAR && !baru.has(p)) await cache.delete(r);
      }
      await cache.put(DAFTAR, new Response(JSON.stringify({ versi })));
    })().finally(() => {
      lagiSegarkan = null;
    });
  }
  return lagiSegarkan;
}

// Internet dulu (maks `batas` ms); gagal/kelamaan -> cache.
async function internetDulu(req, cacheNama, kunci, batas) {
  const cache = await caches.open(cacheNama);
  const dariInternet = fetch(req).then((res) => {
    if (res.ok) cache.put(kunci, res.clone());
    return res;
  });
  const waktuHabis = new Promise((r) => setTimeout(r, batas));
  try {
    const res = await Promise.race([dariInternet, waktuHabis]);
    if (res) return res;
  } catch {
    /* offline */
  }
  const simpanan = await cache.match(kunci);
  if (simpanan) return simpanan;
  return dariInternet; // nggak ada cache: tunggu internetnya aja (atau error aslinya)
}

async function cacheDulu(req, cacheNama) {
  const cache = await caches.open(cacheNama);
  const simpanan = await cache.match(req);
  if (simpanan) return simpanan;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

// Simpan semua model AI (daftar di sw-aset.json) yang belum ada di cache. Satu-satu biar nggak makan memori.
async function simpanModel() {
  const res = await fetch('/sw-aset.json', { cache: 'no-store' });
  if (!res.ok) return;
  const { model = [] } = await res.json();
  const cache = await caches.open(MODEL);
  for (const m of model) {
    if (await cache.match(m)) continue;
    try {
      await cache.add(m);
    } catch {
      return; // koneksi putus di tengah jalan - dilanjut lain kali
    }
  }
}
self.addEventListener('message', (e) => {
  if (e.data?.jenis === 'simpan-model') e.waitUntil(simpanModel().catch(() => {}));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    // Satu halaman buat semua alamat (aplikasinya SPA). Sekalian cek berkas versi terbaru di belakang layar.
    e.respondWith(internetDulu(req, HALAMAN, '/', 4000));
    e.waitUntil(segarkanAset().catch(() => {}));
    return;
  }
  if (url.pathname.startsWith('/assets/')) return e.respondWith(cacheDulu(req, ASET));
  if (url.pathname.startsWith('/models/')) return e.respondWith(cacheDulu(req, MODEL));
  if (url.pathname === '/sw-aset.json') return;
  // Ikon, manifest, dsb: internet dulu, cache kalau offline.
  e.respondWith(internetDulu(req, HALAMAN, url.pathname, 4000));
});
