// Hanya membaca Product JSON-LD publik. Tidak menebak SKU sebagai barcode.
export const HOST_SUMBER = {
  'tokopedia.com': 'tokopedia', 'www.tokopedia.com': 'tokopedia',
  'shopee.co.id': 'shopee', 'www.shopee.co.id': 'shopee',
  'alfagift.id': 'alfagift', 'www.alfagift.id': 'alfagift',
  'klikindogrosir.com': 'klikindogrosir', 'www.klikindogrosir.com': 'klikindogrosir',
};

export function validasiUrl(input) {
  const u = new URL(input);
  if (u.protocol !== 'https:' || u.port || u.username || u.password || !HOST_SUMBER[u.hostname]) {
    throw new Error('URL harus HTTPS dari Tokopedia, Shopee, Alfagift, atau Klik Indogrosir');
  }
  u.hash = '';
  return u;
}

export function bacaProduk(html) {
  const hasil = [];
  const kunjungi = (x) => {
    if (!x || typeof x !== 'object') return;
    if (Array.isArray(x)) return x.forEach(kunjungi);
    if ([].concat(x['@type'] || []).some((t) => /^(https?:\/\/schema.org\/)?Product$/.test(t))) {
      if (typeof x.name === 'string' && x.name.trim().length >= 2) hasil.push(x);
    }
    Object.values(x).forEach(kunjungi);
  };
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (!/\btype\s*=\s*["']application\/ld\+json["']/i.test(m[1])) continue;
    try { kunjungi(JSON.parse(m[2])); } catch { /* blok lain tetap dibaca */ }
  }
  return hasil;
}

export async function ambilHalaman(input, fetcher = fetch) {
  let url = validasiUrl(input);
  for (let i = 0; i < 4; i++) {
    const res = await fetcher(url.href, {
      redirect: 'manual', signal: AbortSignal.timeout(20000),
      headers: { 'User-Agent': 'AsistenWarung/1.0 (konsulinsupport@gmail.com)', Accept: 'text/html' },
    });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      await res.body?.cancel();
      const next = validasiUrl(new URL(res.headers.get('location'), url));
      if (HOST_SUMBER[next.hostname] !== HOST_SUMBER[url.hostname]) throw new Error('Redirect pindah sumber ditolak');
      url = next;
      continue;
    }
    if (!res.ok || !res.headers.get('content-type')?.includes('text/html')) {
      await res.body?.cancel();
      throw new Error(`Halaman tidak tersedia: HTTP ${res.status}`);
    }
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 5_000_000) throw new Error('Halaman melebihi 5 MB');
        chunks.push(Buffer.from(value));
      }
    } finally { await reader.cancel(); }
    return { html: Buffer.concat(chunks).toString('utf8'), url: url.href, sumber: HOST_SUMBER[url.hostname] };
  }
  throw new Error('Terlalu banyak redirect');
}
