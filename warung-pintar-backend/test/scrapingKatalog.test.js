import test from 'node:test';
import assert from 'node:assert/strict';
import { ambilHalaman, bacaProduk, validasiUrl } from '../src/services/scrapingKatalog.js';

test('membaca Product dalam graph, melewati JSON rusak dan halaman biasa', () => {
  const html = `<script type="application/ld+json">rusak</script>
    <script type='application/ld+json'>{"@graph":[{"@type":"Product","name":"Susu 200 ml","sku":"123"},{"@type":"WebSite","name":"Toko"}]}</script>`;
  assert.deepEqual(bacaProduk(html), [{ '@type': 'Product', name: 'Susu 200 ml', sku: '123' }]);
  assert.deepEqual(bacaProduk('<h1>Login</h1>'), []);
});

test('URL asing, kredensial, port dan HTTP ditolak', () => {
  for (const u of ['http://alfagift.id/p', 'https://alfagift.id.evil.test/p', 'https://localhost/p', 'https://a:b@alfagift.id/p', 'https://alfagift.id:8443/p']) {
    assert.throws(() => validasiUrl(u));
  }
  assert.equal(validasiUrl('https://alfagift.id/p#x').href, 'https://alfagift.id/p');
});

test('redirect keluar allowlist ditolak sebelum request kedua', async () => {
  let calls = 0;
  await assert.rejects(ambilHalaman('https://alfagift.id/p', async () => {
    calls++;
    return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/' } });
  }), /URL harus/);
  assert.equal(calls, 1);
});

test('respons blokir dilaporkan dan HTML publik dibaca', async () => {
  await assert.rejects(ambilHalaman('https://shopee.co.id/p', async () => new Response('', { status: 403 })), /403/);
  const result = await ambilHalaman('https://www.klikindogrosir.com/p', async () => new Response('<html></html>', { headers: { 'content-type': 'text/html' } }));
  assert.equal(result.sumber, 'klikindogrosir');
  assert.equal(result.html, '<html></html>');
});
