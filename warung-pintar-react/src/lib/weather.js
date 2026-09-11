// Cuaca ringan pakai Open-Meteo (gratis, tanpa API key) + lokasi browser.
// Kalau offline atau lokasi ditolak, jatuh ke cache terakhir / kota default.

const CACHE_KEY = 'warungpintar_cuaca_v1';
const JAKARTA = { lat: -6.2088, lon: 106.8456 };
const CACHE_MAKS_JAM = 3; // cache dianggap "baru" kalau umurnya < 3 jam

const IKON = {
  cerah: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.3"/><path d="M12 3v2.2M12 18.8V21M4.2 12H6.4M17.6 12h2.2M6.2 6.2l1.6 1.6M16.2 16.2l1.6 1.6M17.8 6.2l-1.6 1.6M7.8 16.2l-1.6 1.6"/></svg>',
  cerahBerawan:
    '<svg viewBox="0 0 24 24"><circle cx="8" cy="8.5" r="3.2"/><path d="M8 2.8v1.6M3.6 8.5h1.6M8 2.8l1.2 1.2M13.4 5.7 12.2 6.9"/><path d="M11 20h6.5a3.5 3.5 0 0 0 .5-6.96A5 5 0 0 0 8.2 12.3 3.6 3.6 0 0 0 8.5 20Z"/></svg>',
  berawan:
    '<svg viewBox="0 0 24 24"><path d="M7 18.5h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 6.8 12.2 3.8 3.8 0 0 0 7 18.5Z"/></svg>',
  kabut:
    '<svg viewBox="0 0 24 24"><path d="M5 8h11M4 12h16M5 16h11" /></svg>',
  gerimis:
    '<svg viewBox="0 0 24 24"><path d="M7 13.5h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 6.8 7.2 3.8 3.8 0 0 0 7 13.5Z"/><path d="M9 17.5v2M13 17.5v2"/></svg>',
  hujan:
    '<svg viewBox="0 0 24 24"><path d="M7 12.5h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 6.8 6.2 3.8 3.8 0 0 0 7 12.5Z"/><path d="M8.5 16.5 7 20M13 16.5l-1.5 3.5M17.5 16.5 16 20"/></svg>',
  badai:
    '<svg viewBox="0 0 24 24"><path d="M7 11.5h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 6.8 5.2 3.8 3.8 0 0 0 7 11.5Z"/><path d="M13 14.5l-3 4.2h3.4L11 22.5"/></svg>',
  salju:
    '<svg viewBox="0 0 24 24"><path d="M7 11.5h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 6.8 5.2 3.8 3.8 0 0 0 7 11.5Z"/><path d="M12 15v7M9.2 17l5.6 3M14.8 17l-5.6 3"/></svg>',
  offline:
    '<svg viewBox="0 0 24 24"><path d="M3 5.5c5.7-4.4 12.3-4.4 18 0M6 10.2a10.7 10.7 0 0 1 12 0M9.2 14.8a6.3 6.3 0 0 1 5.6 0"/><circle cx="12" cy="19" r="1.1"/><path d="M2.5 3.5 21.5 20.5" /></svg>',
};

// kode cuaca WMO (dipakai Open-Meteo) -> kategori kita
function kategori(kode) {
  if (kode === 0) return { k: 'cerah', label: 'Cerah' };
  if (kode === 1 || kode === 2) return { k: 'cerahBerawan', label: 'Cerah berawan' };
  if (kode === 3) return { k: 'berawan', label: 'Berawan' };
  if (kode === 45 || kode === 48) return { k: 'kabut', label: 'Berkabut' };
  if ([51, 53, 55, 56, 57].includes(kode)) return { k: 'gerimis', label: 'Gerimis' };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(kode)) return { k: 'hujan', label: 'Hujan' };
  if ([71, 73, 75, 77, 85, 86].includes(kode)) return { k: 'salju', label: 'Salju' };
  if ([95, 96, 99].includes(kode)) return { k: 'badai', label: 'Badai petir' };
  return { k: 'berawan', label: 'Berawan' };
}

export function ikonCuaca(k) {
  return IKON[k] || IKON.berawan;
}

function bacaCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function simpanCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    /* penuh / diblokir — abaikan */
  }
}

function lokasi() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(JAKARTA);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(JAKARTA), // ditolak / gagal → kota default
      { timeout: 6000, maximumAge: 10 * 60 * 1000 }
    );
  });
}

async function fetchDenganTimeout(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

// nama kota/kecamatan dari koordinat — BigDataCloud, gratis & tanpa API key (endpoint khusus client-side)
async function namaDaerah(lat, lon) {
  try {
    const res = await fetchDenganTimeout(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=id`,
      6000
    );
    if (!res.ok) return null;
    const j = await res.json();
    return j.city || j.locality || j.principalSubdivision || null;
  } catch {
    return null; // gagal dapet nama daerah bukan alasan buat gagalin seluruh cuaca
  }
}

async function ambilDariApi() {
  const { lat, lon } = await lokasi();
  const urlCuaca = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`;

  const [resCuaca, nama] = await Promise.all([fetchDenganTimeout(urlCuaca, 7000), namaDaerah(lat, lon)]);
  if (!resCuaca.ok) throw new Error('cuaca gagal dimuat');
  const j = await resCuaca.json();
  const suhu = Math.round(j.current.temperature_2m);
  const { k, label } = kategori(j.current.weather_code);
  const data = { suhu, ikon: k, label, nama, waktu: Date.now() };
  simpanCache(data);
  return data;
}

/**
 * Ambil data cuaca. Selalu resolve (nggak pernah throw) supaya UI aman dipanggil langsung.
 * Bentuk hasil: { suhu, ikon, label, offline, dariCache }
 * - offline true + suhu ada  → tampilkan cache lama dengan penanda "data lama"
 * - offline true + suhu null → belum pernah ada data sama sekali (baru pertama kali & langsung offline)
 */
export async function ambilCuaca() {
  const cache = bacaCache();

  if (!navigator.onLine) {
    return cache
      ? { ...cache, offline: true, dariCache: true }
      : { suhu: null, ikon: 'offline', label: 'Offline', nama: null, offline: true, dariCache: false };
  }

  try {
    const data = await ambilDariApi();
    return { ...data, offline: false, dariCache: false };
  } catch {
    // online tapi request gagal (mis. wifi lemot / API down) → pakai cache kalau ada
    return cache
      ? { ...cache, offline: true, dariCache: true }
      : { suhu: null, ikon: 'offline', label: 'Cuaca tidak tersedia', nama: null, offline: true, dariCache: false };
  }
}

export function cacheMasihBaru(waktu) {
  if (!waktu) return false;
  return Date.now() - waktu < CACHE_MAKS_JAM * 3600 * 1000;
}
