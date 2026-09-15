import { Fragment } from 'react';

// Teks biasa yang alamat web-nya (https://..., http://..., www....) jadi link yang bisa diklik - dipakai di
// postingan & komentar Komunitas. Sengaja NGGAK pakai dangerouslySetInnerHTML: teksnya dari warung lain,
// jadi tetap di-escape React, dan href cuma bisa http/https (bukan javascript: dsb).
const POLA_URL = /((?:https?:\/\/|www\.)[^\s<>"']+)/gi;

export default function TeksBerlink({ teks }) {
  if (!teks) return null;
  // split pakai grup tangkap: indeks ganjil = alamat web, genap = teks biasa di antaranya
  return String(teks)
    .split(POLA_URL)
    .map((bagian, i) => {
      if (i % 2 === 0) return bagian ? <Fragment key={i}>{bagian}</Fragment> : null;
      // Tanda baca di ujung kalimat ("cek www.contoh.com.") bukan bagian alamatnya
      const [, alamat, sisa = ''] = /^(.*?)([.,!?;:)\]]+)?$/.exec(bagian);
      const href = /^https?:\/\//i.test(alamat) ? alamat : `https://${alamat}`;
      return (
        <Fragment key={i}>
          <a
            className="tautan"
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            // kartu feed-nya sendiri bisa diklik (buka detail) - klik link jangan ikut buka detail
            onClick={(e) => e.stopPropagation()}
          >
            {alamat}
          </a>
          {sisa}
        </Fragment>
      );
    });
}
