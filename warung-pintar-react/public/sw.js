// Service worker MINIMAL - syarat teknis biar aplikasi bisa di-install ke layar HP.
//
// Chrome baru mau nawarin "install" kalau situsnya punya manifest + service worker yang punya
// handler fetch. Jadi berkas ini ADA buat memenuhi syarat itu, bukan buat nyimpen cache.
//
// SENGAJA NGGAK NGE-CACHE APA PUN. Alasannya: service worker yang nyimpen cache itu sumber bug
// paling nyebelin di aplikasi yang masih sering di-deploy - user nyangkut di versi lama berhari-
// hari, dan dia nggak punya cara buat maksa refresh. Aplikasi ini juga UDAH punya penyimpanan
// offline sendiri lewat IndexedDB (lihat lib/localdb.js + outbox.js) buat data warungnya, yang
// jauh lebih tepat sasaran daripada nge-cache berkas mentah.
//
// Kalau nanti beneran butuh offline penuh (buka aplikasi tanpa internet sama sekali), itu
// perubahan tersendiri yang harus dipikir mateng - jangan ditempel diam-diam di sini.

// Langsung ambil alih tanpa nunggu tab lama ditutup - biar versi baru service worker nggak
// ngantre di belakang versi lama waktu ada deploy.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// Diteruskan apa adanya ke jaringan. Handler ini HARUS ada (itu syarat installable-nya), tapi
// nggak boleh ngubah apa pun.
self.addEventListener('fetch', () => {});
