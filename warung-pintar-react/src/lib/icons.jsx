import { useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { IKON_PRODUK, cariProduk, ikonValid, tebakIkon } from './ikonProduk';

// Ikon produk (dulunya emoji) — dipetakan dari id barang.
export const PRODUCT_ICONS = {
  mie: '<svg viewBox="0 0 24 24"><path d="M4 12h16a8 8 0 0 1-16 0Z"/><path d="M6.5 12c.4-2 .9-3 .8-5M12 12c.4-2.5.8-4 .3-6M17.5 12c-.3-2 .2-3 .7-4.5"/></svg>',
  minyak:
    '<svg viewBox="0 0 24 24"><path d="M9 3h6v3.2l1.5 1.8v11a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2v-11L9 6.2Z"/><path d="M9 10h6"/></svg>',
  telur:
    '<svg viewBox="0 0 24 24"><path d="M12 3c3.5 4 6 8.3 6 11.5a6 6 0 0 1-12 0C6 11.3 8.5 7 12 3Z"/></svg>',
  teh: '<svg viewBox="0 0 24 24"><path d="M6 8h12l-1.2 11.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8Z"/><path d="M9 8V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V8M15 3v3"/></svg>',
  beras:
    '<svg viewBox="0 0 24 24"><path d="M8.5 4h7l1 4.5-1.2 11a2 2 0 0 1-2 1.8h-2.6a2 2 0 0 1-2-1.8l-1.2-11Z"/><path d="M9.5 4c0-1.2.9-2 2.5-2s2.5.8 2.5 2"/></svg>',
  roti: '<svg viewBox="0 0 24 24"><path d="M4 12a8 4 0 0 1 16 0v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><path d="M9 10.5v8.5M14 10.5v8.5"/></svg>',
  kopi: '<svg viewBox="0 0 24 24"><path d="M5 9h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4Z"/><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M9 6c0-.8.6-1 .6-1.8S9 3 9 3M12.5 6c0-.8.6-1 .6-1.8S12.5 3 12.5 3"/></svg>',
  sabun:
    '<svg viewBox="0 0 24 24"><rect x="4" y="8" width="16" height="9" rx="4.5"/><path d="M8 12.2c0-1 .8-1.8 2-1.8h4c1.2 0 2 .8 2 1.8"/></svg>',
  default:
    '<svg viewBox="0 0 24 24"><path d="M3.5 8 12 4l8.5 4-8.5 4-8.5-4Z"/><path d="M3.5 8v8.5L12 20l8.5-3.5V8"/><path d="M12 12v8"/></svg>',
  wajah:
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.2"/><path d="M9 10.2h.01M15 10.2h.01M8.6 14.4a4.4 4.4 0 0 0 6.8 0"/></svg>',
};

// foto (opsional): kalau barangnya udah punya foto beneran (bukan cuma ikon generik), tampilin itu.
// 'produk-ikon' = bingkai membulat 44px (lihat index.css) - dulu ikon & foto produk sama-sama dikunci 26x26
// tanpa sudut bulat kayak ikon UI biasa, jadi foto barang cuma jadi kotak kecil tajam yang isinya nggak kebaca.
// `ikon` (opsional): paksa ikon tertentu - dipakai pratinjau di layar edit barang sebelum disimpan. Kalau nggak
// dikasih, ikon diambil dari data barang (S.produk, dicari lewat id): pilihan pemilik -> ditebak dari nama barang.
export function ProductIcon({ id, foto, ikon, className = 'emo picon produk-ikon' }) {
  const { S } = useApp();
  // Foto yang gagal dimuat (mis. link ke server luar yang lagi down) jatuh ke ikon barang - dulu jadi kotak hitam.
  const [fotoGagal, setFotoGagal] = useState(null);
  if (foto && fotoGagal !== foto) return <img className={className} src={foto} alt="" style={{ objectFit: 'cover' }} onError={() => setFotoGagal(foto)} />;
  const p = cariProduk(S?.produk, id);
  const pilihan = ikon !== undefined ? ikon : p?.ikon;
  const kunci = ikonValid(pilihan) ? pilihan : PRODUCT_ICONS[id] ? null : p ? tebakIkon(p.nama, p.kat) : 'default';
  const html = kunci ? IKON_PRODUK[kunci].svg : PRODUCT_ICONS[id];
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

// Dipakai di tiap tombol "jepret/ambil foto" (nota, produk, wajah, dsb) - gantiin emoji 📷/📸
// biar tampilan konsisten (nggak beda-beda gaya render antar OS/browser kayak emoji). Gaya
// stroke-based nyamain ikon-ikon lain di app ini (bukan filled/emoji).
export function CameraIcon({ style }) {
  return (
    <svg
      viewBox="0 0 24 24"
      style={{
        width: 18,
        height: 18,
        verticalAlign: -4,
        marginRight: 6,
        stroke: 'currentColor',
        fill: 'none',
        strokeWidth: 1.75,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        ...style,
      }}
    >
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1-1.6A1.5 1.5 0 0 1 9.8 4.6h4.4a1.5 1.5 0 0 1 1.3.8L16.5 7h2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5Z" />
      <circle cx="12" cy="12.5" r="3.6" />
    </svg>
  );
}

// Tombol "lihat/sembunyiin password" di field login/daftar/ganti password - satu komponen yang
// gantiin sendiri ikonnya (mata terbuka/dicoret) sesuai state `show` dari pemanggilnya.
export function EyeIcon({ open, style }) {
  return (
    <svg
      viewBox="0 0 24 24"
      style={{
        width: 20,
        height: 20,
        stroke: 'currentColor',
        fill: 'none',
        strokeWidth: 1.75,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        ...style,
      }}
    >
      {open ? (
        <>
          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="M3.5 3.5l17 17" />
          <path d="M10.6 5.7A9.7 9.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a15.4 15.4 0 0 1-3.2 4M6.2 6.9C3.6 8.8 2.5 12 2.5 12S6 18.5 12 18.5a9.5 9.5 0 0 0 3.4-.65" />
          <path d="M9.9 10a3 3 0 0 0 4.15 4.1" />
        </>
      )}
    </svg>
  );
}

// Ikon garis buat menggantikan emoji di UI. Kenapa diganti: emoji itu DIGAMBAR OLEH SISTEM, jadi
// bentuk & warnanya beda-beda per HP (Android satu merek bisa beda sama merek lain, iOS beda
// lagi) - aplikasi jadi kelihatan nggak konsisten & nggak rapi. Ikon SVG tampil sama persis di
// semua HP dan ikut warna teks di sekitarnya lewat currentColor.
//
// Dipakai sebagai <Ikon nama="modal" /> - satu komponen, nggak perlu impor belasan nama.
const IKON = {
  modal: '<path d="M12 3v18"/><path d="M16.5 7.5c-.6-1.4-2.3-2.2-4.5-2.2-2.5 0-4.2 1.1-4.2 2.8 0 4 8.7 2 8.7 6.1 0 1.8-1.8 3-4.5 3-2.4 0-4.2-.9-4.8-2.4"/>',
  belanja: '<path d="M4 6h2.2l1.9 9.6a2 2 0 0 0 2 1.6h6.5a2 2 0 0 0 2-1.6L20 9H7"/><circle cx="10.5" cy="20" r="1.1"/><circle cx="17" cy="20" r="1.1"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
  petir: '<path d="M13.5 3 6 13.2h5l-.8 7.8 7.6-10.3h-5Z"/>',
  pesta: '<path d="M4.5 20 9 8.5l6.5 6.5L4.5 20Z"/><path d="M14 4.5v2M18.5 7l-1.4 1.4M20 12.5h-2"/>',
  web: '<circle cx="12" cy="12" r="8.2"/><path d="M3.8 12h16.4"/><path d="M12 3.8c2.2 2.3 3.3 5.1 3.3 8.2s-1.1 5.9-3.3 8.2c-2.2-2.3-3.3-5.1-3.3-8.2S9.8 6.1 12 3.8Z"/>',
  chat: '<path d="M20 12.5c0 3.7-3.6 6.7-8 6.7-1 0-2-.2-2.9-.5L4 20l1.4-3.6A6.4 6.4 0 0 1 4 12.5c0-3.7 3.6-6.7 8-6.7s8 3 8 6.7Z"/>',
  nota: '<path d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4Z"/><path d="M9 8h6M9 11.5h6M9 15h3"/>',
  // Dipakai buat Kasbon. Sempat digambar jabat tangan, tapi di ukuran 26px bentuknya cuma kebaca
  // zigzag nggak jelas - dompet jauh lebih kebaca di ukuran kecil, dan artinya tetap nyambung.
  dompet: '<rect x="3.5" y="6.5" width="17" height="12" rx="2.5"/><path d="M3.5 10h17"/><circle cx="16.5" cy="14" r="1.2"/>',
  label: '<path d="M4 11.5V5.5A1.5 1.5 0 0 1 5.5 4h6l8.5 8.5-7 7L4 11.5Z"/><circle cx="8.5" cy="8.5" r="1.2"/>',
  printer: '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="7" rx="2"/><path d="M7 14h10v6H7z"/>',
  robot: '<rect x="4.5" y="8" width="15" height="11" rx="3"/><path d="M12 8V4.5"/><circle cx="12" cy="3.5" r="1.2"/><path d="M9 13h.01M15 13h.01"/><path d="M9.5 16.2h5"/>',
  mikrofon: '<rect x="9.5" y="3" width="5" height="10" rx="2.5"/><path d="M6 11.5a6 6 0 0 0 12 0"/><path d="M12 17.5V21"/>',
  orang: '<circle cx="12" cy="8.5" r="3.6"/><path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6"/>',
  tambah: '<path d="M12 5.5v13M5.5 12h13"/>',
  ubah: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="M14.5 5.5 18.5 9.5"/>',
  hapus: '<path d="M4.5 6.5h15"/><path d="M9 6.5V4.5h6v2"/><path d="M6.5 6.5 7.5 20h9l1-13.5"/><path d="M10 10v6.5M14 10v6.5"/>',
};

// `nama` wajib ada di IKON. Sengaja nggak ada fallback diam-diam ke ikon lain: kalau salah ketik
// nama, lebih baik kelihatan kosong waktu dites daripada nongol ikon yang salah arti di produksi.
//
// Default class-nya 'emo picon', BUKAN 'emo' doang - dan ini penting. '.emo' cuma ngatur
// font-size, yang ngaruh ke emoji (teks) tapi NGGAK NGARUH SAMA SEKALI ke SVG: tanpa lebar/tinggi
// eksplisit, SVG muai memenuhi wadahnya. Pernah kejadian: ikon nota di Beranda jadi setinggi
// kartunya. Aturan '.emo.picon' (lihat index.css) yang ngunci 26x26 - itu yang dipakai
// ProductIcon dari dulu, jadi tinggal dipakai ulang, bukan bikin aturan baru.
export function Ikon({ nama, className = 'emo picon', style }) {
  const isi = IKON[nama];
  if (!isi) return null;
  return (
    <span
      className={className}
      style={style}
      aria-hidden="true"
      dangerouslySetInnerHTML={{
        __html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${isi}</svg>`,
      }}
    />
  );
}
