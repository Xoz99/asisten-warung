import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import router, { validateAction, redact, sanitasiAi } from '../server/ai.routes.js';

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
