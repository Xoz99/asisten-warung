import { useEffect, useState } from 'react';
import { bacaSesi } from '../lib/api.js';

// Foto profil butuh login, jadi diambil lewat fetch + token lalu ditampilin sebagai blob. Belum ada foto = huruf depan.
// `versi` diganti tiap habis upload biar fotonya kebaca ulang.
export default function FotoProfil({ src, ada, nama, ukuran = 44, versi = 0, className = '' }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!ada || !src) {
      setUrl(null);
      return;
    }
    let u = null;
    let batal = false;
    fetch(src, { headers: { Authorization: 'Bearer ' + (bacaSesi()?.token || '') } })
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((b) => {
        if (batal) return;
        u = URL.createObjectURL(b);
        setUrl(u);
      })
      .catch(() => !batal && setUrl(null));
    return () => {
      batal = true;
      if (u) URL.revokeObjectURL(u);
    };
  }, [src, ada, versi]);
  return (
    <span className={'foto-profil ' + className} style={{ width: ukuran, height: ukuran, fontSize: Math.round(ukuran * 0.42) }} aria-hidden="true">
      {url ? <img src={url} alt="" /> : (nama || '?').trim()[0]?.toUpperCase()}
    </span>
  );
}
