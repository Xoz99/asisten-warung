import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { tangkapKodeSalesDariLink } from './lib/kodeSales.js';

tangkapKodeSalesDariLink();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Daftarin service worker - syarat biar aplikasi bisa dipasang ke layar HP (lihat public/sw.js,
// isinya sengaja nggak nge-cache apa pun). Ditaruh SETELAH render biar nggak nunda tampilan
// pertama, dan kegagalannya ditelan: gagal daftar cuma berarti tombol "Pasang aplikasi" nggak
// muncul di Android - aplikasinya sendiri tetap jalan normal.
//
// Cuma di HTTPS (atau localhost). Browser emang nolak service worker di http biasa, jadi nggak
// usah dicoba - dan itu bukan masalah, karena produksi udah HTTPS.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
    // Model AI (±25 MB) disimpen duluan cuma kalau lagi Wi-Fi & mode hemat data mati - biar kuota warung aman.
    // Pakai data seluler: model tetap disimpen pas scan foto / kenal wajah pertama kali dipakai.
    const koneksi = navigator.connection;
    if (koneksi?.type === 'wifi' && !koneksi.saveData) {
      navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage({ jenis: 'simpan-model' })).catch(() => {});
    }
  });
}
