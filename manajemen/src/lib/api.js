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
  // 502/504 tanpa isi JSON = yang jawab proxy Vite / Caddy, bukan server manajemen: servernya lagi mati.
  if (!data && (res.status === 502 || res.status === 504)) {
    throw Object.assign(new Error('Server manajemen belum nyala. Di laptop: jalanin "npm run dev" di folder manajemen. Di VPS: cek pm2 konsulin-manajemen.'), { status: res.status });
  }
  if (!res.ok) throw Object.assign(new Error(data?.error || `Gagal (${res.status})`), { status: res.status });
  return data;
}
