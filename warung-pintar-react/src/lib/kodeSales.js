// Kode sales yang bawa pengunjung ini. Sales bagiin link /?ref=BUDI - kodenya disimpen di HP ini biar tetap
// kebawa walau orangnya baru daftar belakangan (buka link hari ini, daftar besok), terus ikut dikirim pas daftar
// (lihat Auth.jsx) supaya warung barunya kecatat bawaan sales itu.
const KUNCI = 'warungpintar_ref';
const POLA = /^[A-Z0-9]{3,20}$/;

// Dipanggil sekali pas aplikasi dibuka (main.jsx). Param ?ref= dibuang dari alamat biar nggak ikut kesebar
// kalau linknya dibagiin ulang sama pemilik warung.
export function tangkapKodeSalesDariLink() {
  try {
    const url = new URL(window.location.href);
    const ref = (url.searchParams.get('ref') || '').trim().toUpperCase();
    if (!url.searchParams.has('ref')) return;
    if (POLA.test(ref)) localStorage.setItem(KUNCI, ref);
    url.searchParams.delete('ref');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  } catch {
    /* localStorage diblok - kodenya masih bisa diketik manual di form daftar */
  }
}

export function kodeSalesTersimpan() {
  try {
    return localStorage.getItem(KUNCI) || '';
  } catch {
    return '';
  }
}

export function hapusKodeSales() {
  try {
    localStorage.removeItem(KUNCI);
  } catch {
    /* nggak apa-apa */
  }
}
