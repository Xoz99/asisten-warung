import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import pg from 'pg';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('Set TEST_DATABASE_URL to an isolated PostgreSQL database');
// Never use the application's DATABASE_URL or .env for these tests.
process.env.DATABASE_URL = url;
process.env.JWT_SECRET = 'security-test-only-secret-at-least-32-characters';
const schema = 'security_' + randomUUID().replaceAll('-', '');
const admin = new pg.Pool({ connectionString: url });
const connection = new URL(url);
connection.searchParams.set('options', `-c search_path=${schema},public`);
process.env.DATABASE_URL = connection.toString();
const { pool, query } = await import('../src/db.js');
const { simpanTransaksi } = await import('../src/routes/transaksi.routes.js');
const { reservasiJatahAi, selesaikanJatahAi, cekJatahAi } = await import('../src/services/aiQuota.service.js');
let a, b, customer, productA, productB;
const sql = await readFile(new URL('../src/schema.sql', import.meta.url), 'utf8');
before(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await query(sql);
  [a, b] = (await query("INSERT INTO warung(nama, username, password_hash) VALUES ('A','a','test'),('B','b','test') RETURNING id")).rows.map(r => r.id);
  customer = (await query("INSERT INTO pelanggan(warung_id,nama) VALUES ($1,'Customer A') RETURNING id", [a])).rows[0].id;
  productA = (await query("INSERT INTO produk(warung_id,nama,harga,modal,stok) VALUES ($1,'A',100,50,100) RETURNING id", [a])).rows[0].id;
  productB = (await query("INSERT INTO produk(warung_id,nama,harga,modal,stok) VALUES ($1,'B',100,50,100) RETURNING id", [b])).rows[0].id;
});
after(async () => {
  await pool.end();
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});
async function save(warungId, produkId, clientId, pembeliId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await simpanTransaksi(client, { warungId, mode:'bayar', items:[{produkId,qty:1}], clientId, pembeliId });
    await client.query('COMMIT');
    return result;
  } catch(e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

test('legacy global client_id constraint migrates idempotently', async () => {
  await query('DROP INDEX idx_transaksi_warung_client');
  await query('ALTER TABLE transaksi ADD CONSTRAINT transaksi_client_id_key UNIQUE(client_id)');
  await query(sql);
  await query(sql);
});
test('same clientId in two tenants creates separate transactions', async () => {
  const one = await save(a, productA, 'shared-client-id');
  const two = await save(b, productB, 'shared-client-id');
  assert.notEqual(one.id, two.id);
  assert.equal(two.warung_id, b);
});
test('concurrent retries create one transaction and deduct stock once', async () => {
  const before = Number((await query('SELECT stok FROM produk WHERE id=$1',[productA])).rows[0].stok);
  const results = await Promise.all(Array.from({length:12}, () => save(a, productA, 'parallel-id')));
  assert.equal(new Set(results.map(r => r.id)).size, 1);
  assert.equal(results.filter(r => !r.sudahAda).length, 1);
  assert.equal(Number((await query('SELECT stok FROM produk WHERE id=$1',[productA])).rows[0].stok), before-1);
});
test('foreign customer is rejected before stock or transaction writes', async () => {
  const before = (await query('SELECT stok FROM produk WHERE id=$1',[productB])).rows[0].stok;
  await assert.rejects(save(b, productB, 'foreign-customer', customer), {status:400});
  assert.equal((await query('SELECT stok FROM produk WHERE id=$1',[productB])).rows[0].stok,before);
  assert.equal((await query("SELECT id FROM transaksi WHERE client_id='foreign-customer'")).rows.length,0);
  assert.equal((await save(a, productA, 'own-customer', customer)).pembeli_id,customer);
});
test('parallel AI reservations cannot reserve beyond the daily budget', async () => {
  const outcomes = await Promise.allSettled(Array.from({length:30}, () => reservasiJatahAi(a)));
  const passed = outcomes.filter(r => r.status==='fulfilled');
  assert.equal(passed.length, 4);
  assert.equal(passed.reduce((sum,r)=>sum+r.value.dipesan,0),15000);
  assert.ok(outcomes.filter(r=>r.status==='rejected').every(r=>r.reason.jatahAiHabis));
  await Promise.all(passed.map((r,i)=>selesaikanJatahAi(r.value,i===0?123:0)));
  assert.equal((await cekJatahAi(a)).terpakai,123);
  const second = await reservasiJatahAi(a);
  await selesaikanJatahAi(second, 77);
  assert.equal((await cekJatahAi(a)).terpakai,200);
});
test('missing tenant and exhausted quota fail closed', async () => {
  await assert.rejects(reservasiJatahAi(randomUUID()), {status:402});
  await assert.rejects(reservasiJatahAi(), {status:401});
  await query('UPDATE warung SET ai_token_hari_ini=15000 WHERE id=$1',[a]);
  await assert.rejects(reservasiJatahAi(a), {status:402});
});
test('unknown provider usage retains debit; daily reset and late completion stay isolated', async () => {
  const r = await reservasiJatahAi(b);
  await selesaikanJatahAi(r, undefined);
  assert.equal((await cekJatahAi(b)).terpakai,4096);
  await query("UPDATE warung SET ai_token_tanggal=CURRENT_DATE-1 WHERE id=$1",[b]);
  const fresh = await reservasiJatahAi(b);
  await selesaikanJatahAi({...r,tanggal:'2000-01-01'},1);
  assert.equal((await cekJatahAi(b)).terpakai,4096);
  await selesaikanJatahAi(fresh,300);
  assert.equal((await cekJatahAi(b)).terpakai,300);
});
test('JWT config refuses missing/short secrets', () => {
  for (const secret of ['', 'dev-secret-ganti-ini']) {
    const child = spawnSync(process.execPath,['--input-type=module','-e',"await import('./src/config/jwt.js')"],{
      cwd:new URL('..',import.meta.url),env:{...process.env,JWT_SECRET:secret},encoding:'utf8'
    });
    assert.notEqual(child.status,0);
    assert.match(child.stderr,/JWT_SECRET wajib/);
  }
});
test('both providers await accounting; explicit rejection permits fallback; timeout charges a bounded allowance and preserves fallback', async (t) => {
  process.env.GEMINI_API_KEY='fake-test-key';
  process.env.OPENROUTER_API_KEY='fake-test-key';
  const {parseUcapanGemini}=await import('../src/services/gemini.service.js');
  const {parseUcapanOpenRouter}=await import('../src/services/openrouter.service.js');
  await query('UPDATE warung SET ai_token_hari_ini=0 WHERE id=$1',[a]);
  const args={transkrip:'test',produkList:[],warungId:a};
  const mock=t.mock.method(globalThis,'fetch',async () => ({ok:true,json:async()=>({candidates:[{content:{parts:[{text:'[]'}]}}],usageMetadata:{totalTokenCount:100}})}));
  await parseUcapanGemini(args);
  assert.equal((await cekJatahAi(a)).terpakai,100);
  mock.mock.mockImplementation(async()=>({ok:false,status:429,json:async()=>({error:{message:'rejected'}})}));
  await assert.rejects(parseUcapanGemini(args),{status:429});
  assert.equal((await cekJatahAi(a)).terpakai,100);
  mock.mock.mockImplementation(async()=>({ok:true,json:async()=>({choices:[{message:{content:'{"hasil":[]}'}}],usage:{total_tokens:50}})}));
  await parseUcapanOpenRouter(args);
  assert.equal((await cekJatahAi(a)).terpakai,150);
  mock.mock.mockImplementation(async()=>{throw Object.assign(new Error('timeout'),{name:'AbortError'});});
  await assert.rejects(parseUcapanGemini(args),{status:502});
  assert.equal((await cekJatahAi(a)).terpakai,150+4096);
  mock.mock.mockImplementation(async()=>({ok:true,json:async()=>({choices:[{message:{content:'{"hasil":[]}'}}],usage:{total_tokens:50}})}));
  const {cobaGeminiLaluOpenRouter}=await import('../src/utils/aiFallback.js');
  const result=await cobaGeminiLaluOpenRouter(async()=>{throw Object.assign(new Error('Gemini timeout'),{status:502});},()=>parseUcapanOpenRouter(args),'test');
  assert.deepEqual(result,[]);
  assert.equal((await cekJatahAi(a)).terpakai,200+4096);
});

test('HTTP auth, kasbon ownership, debt aggregation and account throttle', async () => {
  const {default:express}=await import('express');
  const {default:jwt}=await import('jsonwebtoken');
  const {requireAuth}=await import('../src/middleware/auth.js');
  const {aiLimiter}=await import('../src/middleware/rateLimit.js');
  const {default:transaksi}=await import('../src/routes/transaksi.routes.js');
  const {default:pelanggan}=await import('../src/routes/pelanggan.routes.js');
  const app=express();app.use(express.json());app.use(requireAuth);
  app.use('/transaksi',transaksi);app.use('/pelanggan',pelanggan);
  app.post('/ai',aiLimiter,(_req,res)=>res.json({ok:true}));
  app.use((err,_req,res,_next)=>res.status(err.status||500).json({error:err.message}));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const base=`http://127.0.0.1:${server.address().port}`;
  const token=(id,secret=process.env.JWT_SECRET)=>jwt.sign({warungId:id},secret);
  const request=(path,id,body,secret)=>fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token(id,secret),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  try {
    assert.equal((await request('/pelanggan',a,null,'dev-secret-ganti-ini')).status,401);
    assert.equal((await request('/pelanggan','not-a-uuid')).status,401);
    assert.equal((await request('/transaksi/kasbon',b,{items:[{produkId:productB,qty:1}],pembeliId:customer,pembeliNama:'A'})).status,400);
    // Existing polluted rows must not inflate the victim's customer balance.
    await query("INSERT INTO kasbon(warung_id,pelanggan_id,nama,jumlah) VALUES ($1,$2,'polluted',999)",[b,customer]);
    const people=await (await request('/pelanggan',a)).json();
    assert.equal(Number(people.find(p=>p.id===customer).total_utang),0);
    for(let i=0;i<12;i++) assert.equal((await request('/ai',a,{})).status,200);
    assert.equal((await request('/ai',a,{})).status,429);
    assert.equal((await request('/ai',b,{})).status,200);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
