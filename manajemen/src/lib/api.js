// Sesi login: biasanya di sessionStorage (tab ditutup = masuk lagi, token 12 jam). Kalau "Ingat saya 30 hari"
// dicentang, disimpen di localStorage biar tetap nyangkut walau browser ditutup (token-nya juga 30 hari).
const KUNCI_SESI = 'konsulin_manajemen_sesi';

export function bacaSesi() {
  try {
    return JSON.parse(sessionStorage.getItem(KUNCI_SESI) || localStorage.getItem(KUNCI_SESI) || 'null');
  } catch {
    return null;
  }
}

export function simpanSesi(sesi) {
  try {
    sessionStorage.removeItem(KUNCI_SESI);
    localStorage.removeItem(KUNCI_SESI);
    if (sesi) (sesi.ingat ? localStorage : sessionStorage).setItem(KUNCI_SESI, JSON.stringify(sesi));
  } catch {
    /* storage diblok - sesinya cuma hidup di memori */
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

// Buka file yang butuh login (CV/foto pelamar) di tab baru. Nggak bisa pakai <a href> biasa karena token-nya di header.
export async function bukaFile(path) {
  const token = bacaSesi()?.token;
  const tab = window.open('', '_blank');
  const res = await fetch('/api' + path, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
  if (!res.ok) {
    tab?.close();
    const d = await res.json().catch(() => null);
    throw new Error(d?.error || `Gagal membuka file (${res.status})`);
  }
  const url = URL.createObjectURL(await res.blob());
  if (tab) tab.location.href = url;
  else window.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Upload file mentah (bukan JSON) dengan progres - dipakai Artifact. XHR karena fetch belum bisa lapor progres upload.
// Balikin { promise, batal }.
export function unggahBerkas(path, file, onProgres) {
  const token = bacaSesi()?.token;
  const xhr = new XMLHttpRequest();
  const promise = new Promise((ok, gagal) => {
    xhr.open('POST', '/api' + path);
    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgres?.(e.loaded / e.total);
    xhr.onload = () => {
      let d = null;
      try {
        d = JSON.parse(xhr.responseText);
      } catch {
        /* bukan JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) ok(d);
      else if (xhr.status === 413 && !d) gagal(new Error('File kegedean buat server'));
      else gagal(Object.assign(new Error(d?.error || `Gagal upload (${xhr.status})`), { status: xhr.status }));
    };
    xhr.onerror = () => gagal(new Error('Koneksi putus waktu upload'));
    xhr.onabort = () => gagal(Object.assign(new Error('Upload dibatalkan'), { dibatalkan: true }));
    xhr.send(file);
  });
  return { promise, batal: () => xhr.abort() };
}
