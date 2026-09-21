// Sesi login admin manajemen: token disimpen di sessionStorage doang - tab ditutup = masuk lagi.
const KUNCI_SESI = 'konsulin_manajemen_sesi';

export function bacaSesi() {
  try {
    return JSON.parse(sessionStorage.getItem(KUNCI_SESI) || 'null');
  } catch {
    return null;
  }
}

export function simpanSesi(sesi) {
  try {
    if (sesi) sessionStorage.setItem(KUNCI_SESI, JSON.stringify(sesi));
    else sessionStorage.removeItem(KUNCI_SESI);
  } catch {
    /* sessionStorage diblok - sesinya cuma hidup di memori */
  }
}

export async function panggil(token, method, path, body) {
  let res;
  try {
    const opsi = { method, headers: {} };
    if (token) opsi.headers.Authorization = 'Bearer ' + token;
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
