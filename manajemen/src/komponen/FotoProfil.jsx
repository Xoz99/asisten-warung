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

// Foto dari server yang butuh login (foto rekan kerja, foto diri kandidat). Satu orang bisa muncul di puluhan kartu,
// jadi hasilnya disimpan per sesi halaman: cukup sekali ambil per foto (yang nggak ada juga diingat, biar nggak nembak
// 404 berulang).
const cacheFoto = new Map();
function ambilFoto(src) {
  if (!cacheFoto.has(src)) {
    cacheFoto.set(
      src,
      fetch(src, { headers: { Authorization: 'Bearer ' + (bacaSesi()?.token || '') } })
        .then((r) => (r.ok ? r.blob() : null))
        .then((b) => (b ? URL.createObjectURL(b) : null))
        .catch(() => {
          cacheFoto.delete(src);
          return null;
        })
    );
  }
  return cacheFoto.get(src);
}
export function FotoTersimpan({ src, nama, ukuran = 26, className = 'kotak', title }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let batal = false;
    setUrl(null);
    if (src) ambilFoto(src).then((u) => !batal && setUrl(u));
    return () => {
      batal = true;
    };
  }, [src]);
  return (
    <span className={'foto-profil ' + className} style={{ width: ukuran, height: ukuran, fontSize: Math.round(ukuran * 0.42) }} title={title} aria-hidden={title ? undefined : 'true'}>
      {url ? <img src={url} alt="" /> : (nama || '?').trim()[0]?.toUpperCase()}
    </span>
  );
}
export const FotoAdmin = ({ id, ...p }) => <FotoTersimpan src={id ? `/api/tim/foto/${id}` : null} {...p} />;
export const FotoKandidat = ({ fotoId, ...p }) => <FotoTersimpan src={fotoId ? `/api/rekrutmen/dokumen/${fotoId}` : null} {...p} />;
