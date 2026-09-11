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
export function ProductIcon({ id, foto, className = 'emo picon' }) {
  if (foto) return <img className={className} src={foto} alt="" style={{ objectFit: 'cover' }} />;
  return (
    <span className={className} dangerouslySetInnerHTML={{ __html: PRODUCT_ICONS[id] || PRODUCT_ICONS.default }} />
  );
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
