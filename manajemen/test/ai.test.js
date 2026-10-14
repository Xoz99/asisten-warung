import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import router, { validateAction, redact, sanitasiAi, bacaGosip, jadwalBerikutnya, bacaJadwal, isiPlaceholder } from '../server/ai.routes.js';

test('jadwal laporan Kantor: waktu jalan berikutnya dihitung pakai jam WIB', () => {
  // 14 Okt 2026 (Rabu) 10:00 WIB = 03:00 UTC
  const dari = new Date('2026-10-14T03:00:00Z');
  assert.equal(jadwalBerikutnya({ frekuensi: 'harian', jam: 8 }, dari).toISOString(), '2026-10-15T01:00:00.000Z');
  assert.equal(jadwalBerikutnya({ frekuensi: 'harian', jam: 17 }, dari).toISOString(), '2026-10-14T10:00:00.000Z');
  assert.equal(jadwalBerikutnya({ frekuensi: 'mingguan', jam: 8, hari: 1 }, dari).toISOString(), '2026-10-19T01:00:00.000Z');
  assert.equal(jadwalBerikutnya({ frekuensi: 'mingguan', jam: 23, hari: 3 }, dari).toISOString(), '2026-10-14T16:00:00.000Z');
  assert.equal(jadwalBerikutnya({ frekuensi: 'bulanan', jam: 7, tanggal: 1 }, dari).toISOString(), '2026-11-01T00:00:00.000Z');
  // Lewat tengah malam WIB tapi masih tanggal sebelumnya di UTC
  assert.equal(jadwalBerikutnya({ frekuensi: 'harian', jam: 6 }, new Date('2026-10-14T18:30:00Z')).toISOString(), '2026-10-14T23:00:00.000Z');
});
test('jadwal laporan Kantor: input dicek', () => {
  assert.throws(() => bacaJadwal({ nama: 'x', tugas: 'y', frekuensi: 'tahunan', jam: 8 }));
  assert.throws(() => bacaJadwal({ nama: 'x', tugas: 'y', frekuensi: 'mingguan', jam: 8 }));
  assert.throws(() => bacaJadwal({ nama: 'x', tugas: 'y', frekuensi: 'bulanan', jam: 8, tanggal: 31 }));
  assert.throws(() => bacaJadwal({ nama: 'x', tugas: 'y', frekuensi: 'harian', jam: 24 }));
  assert.deepEqual(bacaJadwal({ nama: ' Laporan ', tugas: 'Rekap', frekuensi: 'mingguan', jam: '8', hari: '1', tanggal: 5 }), { nama: 'Laporan', tugas: 'Rekap', template: null, frekuensi: 'mingguan', jam: 8, hari: 1, tanggal: null, revisi: true, aktif: true });
  assert.doesNotMatch(isiPlaceholder('Laporan {bulan_ini} vs {bulan_lalu}'), /\{bulan/);
});

test('reject arbitrary URLs, traversal, auth and credential mutations', () => {
  for (const path of ['https://evil.example', '//evil.example', '/leads/../admin', '/leads%2f..', '/auth/setup', '/ai/chat', '/admin/123', '/saya/password']) {
    assert.throws(() => validateAction({ method: 'POST', path }));
  }
  assert.throws(() => validateAction({ method: 'POST', path: '/leads', body: { password: 'secret' } }));
  assert.equal(validateAction({ method: 'GET', path: '/leads' }).path, '/leads');
});
test('strip credentials recursively', () => {
  assert.deepEqual(redact({ nama: 'A', data: [{ token: 'secret', password_hash: 'hash', nama: 'B' }] }), { nama: 'A', data: [{ nama: 'B' }] });
});
test('data pribadi dibuang/disamarkan sebelum dikirim ke model', () => {
  const hasil = sanitasiAi({ sales: [{ nama: 'Budi', no_hp: '6281234567890', email: 'budi@contoh.id', rekening: '123456', nik_ktp: '3201', alamat: 'Jl. X', password_hash: 'h' }] });
  assert.deepEqual(hasil, { sales: [{ nama: 'Budi', no_hp: '••••7890', email: 'b•••@contoh.id' }] });
});
test('AI nggak boleh ngusulin ubah rekening/NIK', () => {
  assert.throws(() => validateAction({ method: 'PATCH', path: '/tim-sales/abc', body: { rekening: '999' } }));
  assert.throws(() => validateAction({ method: 'PATCH', path: '/tim-sales/abc', body: { profil: { nik_ktp: '1' } } }));
  assert.equal(validateAction({ method: 'PATCH', path: '/tim-sales/abc', body: { nama: 'Budi' } }).body.nama, 'Budi');
});
test('agent proposes writes, isolates owners, consumes actions once, and forwards caller auth', async () => {
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { req.admin = { id: req.get('x-user') || 'one' }; next(); });
  app.use(router);
  app.use((err, req, res, _next) => res.status(err.status || 500).json({ error: err.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const original = globalThis.fetch;
  const oldKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'test';
  let writes = 0;
  globalThis.fetch = async (url, opts) => {
    if (String(url).startsWith(origin)) return original(url, opts);
    if (String(url).startsWith('https://openrouter.ai/')) return Response.json({ choices: [{ message: { role: 'assistant', tool_calls: [{ id: 'call1', type: 'function', function: { name: 'tindakan', arguments: JSON.stringify({ method: 'POST', path: '/leads', body: { perusahaan: 'Test' }, ringkasan: 'Tambah lead Test' }) } }] } }] });
    writes++;
    assert.equal(opts.headers.Authorization, 'Bearer caller');
    assert.equal(new URL(url).hostname, '127.0.0.1');
    return Response.json({ id: 'new-lead', token: 'never-expose' }, { status: 201 });
  };
  const post = async (path, body, user = 'one') => {
    const res = await fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user': user, Authorization: 'Bearer caller' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  try {
    assert.equal((await post('/ai/chat', { message: '' })).status, 400);
    const chat = await post('/ai/chat', { message: 'Tambah lead Test' });
    assert.equal(chat.status, 200); assert.equal(writes, 0);
    const action = { sessionId: chat.body.sessionId, actionId: chat.body.pending.id, approve: true };
    assert.equal((await post('/ai/action', action, 'two')).status, 404);
    assert.equal(writes, 0);
    const done = await post('/ai/action', action);
    assert.equal(done.body.result.ok, true); assert.equal(writes, 1);
    assert.equal(done.body.result.data.token, undefined);
    assert.equal((await post('/ai/action', action)).status, 409); assert.equal(writes, 1);
    const another = await post('/ai/chat', { message: 'Tambah lagi' });
    await post('/ai/action', { sessionId: another.body.sessionId, actionId: another.body.pending.id, approve: false });
    assert.equal(writes, 1);
  } finally {
    globalThis.fetch = original;
    if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = oldKey;
    await new Promise(resolve => server.close(resolve));
  }
});
test('model dicoba per putaran: putaran 1 penuh (429) -> putaran 2 dipakai', async () => {
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { req.admin = { id: 'putaran' }; next(); });
  app.use(router);
  app.use((err, req, res, _next) => res.status(err.status || 500).json({ error: err.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const original = globalThis.fetch;
  const lama = { key: process.env.OPENROUTER_API_KEY, model: process.env.OPENROUTER_MODEL, models: process.env.OPENROUTER_MODELS };
  process.env.OPENROUTER_API_KEY = 'test'; process.env.OPENROUTER_MODEL = ''; process.env.OPENROUTER_MODELS = 'a,b,c,d,e';
  const dikirim = [];
  globalThis.fetch = async (url, opts) => {
    if (String(url).startsWith(origin)) return original(url, opts);
    const body = JSON.parse(opts.body);
    dikirim.push(body.models || [body.model]);
    if (dikirim.length === 1) return Response.json({ error: { message: 'penuh' } }, { status: 429 });
    return Response.json({ choices: [{ message: { role: 'assistant', content: 'halo dari putaran dua' } }] });
  };
  try {
    const res = await fetch(origin + '/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'halo' }) });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.message, 'halo dari putaran dua');
    assert.deepEqual(dikirim, [['a', 'b', 'c'], ['d', 'e']]);
  } finally {
    globalThis.fetch = original;
    for (const [k, v] of [['OPENROUTER_API_KEY', lama.key], ['OPENROUTER_MODEL', lama.model], ['OPENROUTER_MODELS', lama.models]]) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    await new Promise(resolve => server.close(resolve));
  }
});
test('gosip kantor: JSON dari model dibaca, sisanya dibuang', () => {
  assert.deepEqual(bacaGosip('Nih:\n[{"who":"A","text":" Halo "},{"who":"b","text":"Hai"},{"who":"A"}]'), [{ who: 'A', text: 'Halo' }, { who: 'B', text: 'Hai' }]);
  assert.deepEqual(bacaGosip('bukan json'), []);
  assert.deepEqual(bacaGosip('[{"who":"A","text":"Kopi dulu ☕ biar waras 😂"},{"who":"B","text":"🙄"}]'), [{ who: 'A', text: 'Kopi dulu biar waras' }]);
});
test('kantor: peran dicek, kerja & gosip lewat OpenRouter, gosip dijatah per admin', async () => {
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { req.admin = { id: 'kantor', nama: 'Andri' }; next(); });
  app.use(router);
  app.use((err, req, res, _next) => res.status(err.status || 500).json({ error: err.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const original = globalThis.fetch;
  const oldKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'test';
  const dikirim = [];
  const dataDibaca = [];
  globalThis.fetch = async (url, opts) => {
    if (String(url).startsWith(origin)) return original(url, opts);
    if (String(url).includes('127.0.0.1:') && String(url).includes('/api/')) {
      dataDibaca.push({ url: String(url), method: opts.method, auth: opts.headers.Authorization });
      return Response.json([{ nama: 'Tita', status: 'baru', no_hp: '6281234567890', nik_ktp: '3201' }]);
    }
    const body = JSON.parse(opts.body);
    dikirim.push(body);
    const gosip = body.messages[0].content.includes('JSON array');
    if (gosip) {
      assert.equal(body.tools, undefined);
      return Response.json({ choices: [{ message: { role: 'assistant', content: '[{"who":"A","text":"Eh tau gak"},{"who":"B","text":"Apa?"}]' } }] });
    }
    assert.deepEqual(body.tools.map((t) => t.function.name), ['fitur', 'baca']);
    const hasilAlat = body.messages.filter((m) => m.role === 'tool');
    if (body.messages[1].content.includes('rekrutmen') && hasilAlat.length === 0)
      return Response.json({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'baca', arguments: '{"path":"/auth/setup"}' } }] } }] });
    if (body.messages[1].content.includes('rekrutmen') && hasilAlat.length === 1)
      return Response.json({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'c2', type: 'function', function: { name: 'baca', arguments: '{"path":"/rekrutmen/lamaran","query":{"q":"Tita"}}' } }] } }] });
    if (hasilAlat.length === 2) return Response.json({ choices: [{ message: { role: 'assistant', content: '1 pelamar: Tita (baru)' } }] });
    return Response.json({ choices: [{ message: { role: 'assistant', content: 'Rencana: 1. Riset' } }] });
  };
  const post = async (path, body) => {
    const res = await fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  try {
    assert.equal((await post('/ai/kantor/kerja', { peran: 'hacker', isi: 'x' })).status, 400);
    assert.equal((await post('/ai/kantor/kerja', { peran: 'constructor', isi: 'x' })).status, 400);
    const kerja = await post('/ai/kantor/kerja', { peran: 'planner', isi: 'Bikin promo' });
    assert.equal(kerja.body.teks, 'Rencana: 1. Riset');
    assert.match(dikirim[0].messages[0].content, /Planner/);
    assert.equal((await post('/ai/kantor/gosip', { a: 'coder', b: 'coder' })).status, 400);
    const gosip = await post('/ai/kantor/gosip', { a: 'bos', b: 'writer', situasi: 'santai', terakhir: ['Coder: halo'] });
    assert.deepEqual(gosip.body.baris, [{ who: 'A', text: 'Eh tau gak' }, { who: 'B', text: 'Apa?' }]);
    assert.match(dikirim[1].messages[1].content, /Andri \(Bos\)/);
    assert.equal((await post('/ai/kantor/gosip', { a: 'coder', b: 'writer' })).status, 429);
    assert.equal(dikirim.length, 2);

    // Researcher baca data asli: path terlarang ditolak, GET jalan pakai sesi pengguna, data pribadi disamarkan.
    const riset = await fetch(origin + '/ai/kantor/kerja', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer sesi-admin' }, body: JSON.stringify({ peran: 'researcher', isi: 'Rekap rekrutmen' }) }).then((r) => r.json());
    assert.equal(riset.teks, '1 pelamar: Tita (baru)');
    assert.deepEqual(riset.dibaca, ['/rekrutmen/lamaran']);
    assert.equal(dataDibaca.length, 1);
    assert.equal(dataDibaca[0].method, 'GET');
    assert.equal(dataDibaca[0].auth, 'Bearer sesi-admin');
    assert.match(dataDibaca[0].url, /\/api\/rekrutmen\/lamaran\?q=Tita$/);
    const alat = dikirim.at(-1).messages.filter((m) => m.role === 'tool').map((m) => m.content);
    assert.match(alat[0], /error/);
    assert.match(alat[1], /••••7890/);
    assert.doesNotMatch(alat[1], /6281234567890|3201/);
  } finally {
    globalThis.fetch = original;
    if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = oldKey;
    await new Promise(resolve => server.close(resolve));
  }
});
