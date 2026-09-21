// Semua request ke server manajemen bawa kunci admin di header. Kuncinya cuma di sessionStorage - tab ditutup =
// harus masukin lagi.
const KUNCI_SESI = 'konsulin_manajemen_kunci';

export function bacaKunci() {
  try {
    return sessionStorage.getItem(KUNCI_SESI) || '';
  } catch {
    return '';
  }
}

export function simpanKunci(k) {
  try {
    if (k) sessionStorage.setItem(KUNCI_SESI, k);
    else sessionStorage.removeItem(KUNCI_SESI);
  } catch {
    /* sessionStorage diblok - kuncinya cuma hidup di memori */
  }
}

export async function panggil(kunci, method, path, body) {
  let res;
  try {
    const opsi = { method, headers: { 'X-Admin-Key': kunci } };
    if (body) {
      opsi.headers['Content-Type'] = 'application/json';
      opsi.body = JSON.stringify(body);
    }
    res = await fetch('/api' + path, opsi);
  } catch {
    throw new Error('Tidak bisa menghubungi server');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(data?.error || `Gagal (${res.status})`), { status: res.status });
  return data;
}
