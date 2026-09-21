import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import DaftarPublik from './halaman/DaftarPublik.jsx';

// Entry terpisah buat form daftar publik (konsulin.com/daftar). Bundle-nya nggak bawa kode admin sama sekali.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <DaftarPublik />
  </StrictMode>
);
