// Audit read-only katalog dan smoke test route GET dengan server loopback sementara.
// Tidak mencetak identitas warung, token, atau konfigurasi database.
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { pool, query } from './db.js';
import router from './routes/katalog.routes.js';

let server;
try {
  const { rows: total } = await query('SELECT sumber,aktif,count(*)::int AS jumlah FROM katalog_barang GROUP BY sumber,aktif ORDER BY sumber');
  console.log(JSON.stringify({ total }));
  const { rows: audit } = await query(`SELECT count(*)::int AS lotte,
    count(*) FILTER (WHERE barcode IS NOT NULL)::int AS barcode_lotte,
    count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM katalog_impor_sumber s WHERE s.katalog_id=k.id AND s.sumber='lotte'))::int AS tanpa_sumber
    FROM katalog_barang k WHERE sumber='lotte'`);
  assert.equal(audit[0].barcode_lotte, 0);
  assert.equal(audit[0].tanpa_sumber, 0);
  console.log(JSON.stringify({ audit: audit[0] }));
  const { rows } = await query('SELECT id FROM warung LIMIT 1');
  if (!rows.length) throw new Error('Warung lokal belum tersedia untuk smoke test');
  const app = express();
  app.use((req, res, next) => { req.warungId = rows[0].id; next(); });
  app.use('/katalog', router);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/katalog`;
  for (const q of ['silverqueen 82g', 'silver queen 82 g']) {
    const r = await fetch(`${base}?q=${encodeURIComponent(q)}`);
    assert.equal(r.status, 200);
    const data = await r.json();
    assert.ok(data.barang.some((b) => /almond/i.test(b.nama) && /82 g/i.test(b.nama)));
    assert.ok(data.barang.some((b) => /cashew/i.test(b.nama) && /82 g/i.test(b.nama)));
    console.log(JSON.stringify({ pencarian: q, hasil: data.barang.map((b) => b.nama) }));
  }
  const p1 = await (await fetch(`${base}?limit=1&offset=5000`)).json();
  const p2 = await (await fetch(`${base}?limit=1&offset=5001`)).json();
  assert.ok(p1.barang[0] && p2.barang[0]);
  assert.notEqual(p1.barang[0].id, p2.barang[0].id);
  console.log('Paginasi melewati 5.000 barang: OK');
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  await pool.end();
}
