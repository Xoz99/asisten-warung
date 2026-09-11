import { Router } from 'express';
import { pool, query } from '../db.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { dari, sampai, limit = 100 } = req.query;
    const params = [req.warungId];
    let sql = 'SELECT * FROM transaksi WHERE warung_id=$1';
    if (dari) {
      params.push(dari);
      sql += ` AND waktu >= $${params.length}`;
    }
    if (sampai) {
      params.push(sampai);
      sql += ` AND waktu <= $${params.length}`;
    }
    sql += ' ORDER BY waktu DESC LIMIT ' + Math.min(+limit || 100, 500);
    const { rows: transaksi } = await query(sql, params);
    const ids = transaksi.map((t) => t.id);
    let items = [];
    if (ids.length) {
      const r = await query('SELECT * FROM transaksi_item WHERE transaksi_id = ANY($1)', [ids]);
      items = r.rows;
    }
    res.json(transaksi.map((t) => ({ ...t, items: items.filter((i) => i.transaksi_id === t.id) })));
  } catch (e) {
    next(e);
  }
});

// Inti pencatatan transaksi: kurangi stok & hitung total/laba dalam satu transaksi DB (atomik),
// biar aman kalau 2 device catat transaksi bersamaan (multi-user 1 akun warung).
// clientId dipakai buat idempotency waktu offline-first sync (catat transaksi harus tetap
// jalan walau sinyal jelek, baru di-sync begitu online — kalau clientId sudah pernah masuk, jangan dobel).
async function simpanTransaksi(client, { warungId, penjagaNama, mode, metode, pembeliId, pembeliNama, items, sumberInput, clientId }) {
  if (clientId) {
    const cek = await client.query('SELECT id FROM transaksi WHERE client_id=$1', [clientId]);
    if (cek.rows.length) {
      const trx = await client.query('SELECT * FROM transaksi WHERE id=$1', [cek.rows[0].id]);
      const itemRows = await client.query('SELECT * FROM transaksi_item WHERE transaksi_id=$1', [cek.rows[0].id]);
      return { ...trx.rows[0], items: itemRows.rows, sudahAda: true };
    }
  }

  let total = 0;
  let laba = 0;
  const rincian = [];
  for (const it of items) {
    const { rows } = await client.query('SELECT * FROM produk WHERE id=$1 AND warung_id=$2 FOR UPDATE', [it.produkId, warungId]);
    const p = rows[0];
    if (!p) throw Object.assign(new Error(`Produk ${it.produkId} tidak ditemukan`), { status: 400 });
    if (p.stok < it.qty) throw Object.assign(new Error(`Stok ${p.nama} tinggal ${p.stok}`), { status: 409 });
    await client.query('UPDATE produk SET stok = stok - $1, updated_at = now() WHERE id=$2', [it.qty, p.id]);
    total += Number(p.harga) * it.qty;
    laba += (Number(p.harga) - Number(p.modal)) * it.qty;
    rincian.push({ produkId: p.id, nama: p.nama, qty: it.qty, harga: Number(p.harga), modal: Number(p.modal) });
  }

  const labaFinal = mode === 'kasbon' ? 0 : laba;
  const { rows: trxRows } = await client.query(
    `INSERT INTO transaksi (client_id, warung_id, penjaga_nama, mode, metode, pembeli_id, pembeli_nama, total, laba, sumber_input)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [clientId || null, warungId, penjagaNama || null, mode, metode || null, pembeliId || null, pembeliNama || null, total, labaFinal, sumberInput || 'manual']
  );
  const trx = trxRows[0];
  for (const r of rincian) {
    await client.query(
      'INSERT INTO transaksi_item (transaksi_id, produk_id, nama_produk, qty, harga_satuan, modal_satuan) VALUES ($1,$2,$3,$4,$5,$6)',
      [trx.id, r.produkId, r.nama, r.qty, r.harga, r.modal]
    );
  }
  return { ...trx, items: rincian, total, laba: labaFinal, sudahAda: false };
}

// bayar tunai/QRIS langsung
router.post('/bayar', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { items, metode, penjagaNama, pembeliId, pembeliNama, sumberInput, clientId } = req.body;
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items wajib diisi' });
    const trx = await simpanTransaksi(client, {
      warungId: req.warungId,
      penjagaNama,
      mode: 'bayar',
      metode,
      pembeliId,
      pembeliNama,
      items,
      sumberInput,
      clientId,
    });
    if (!trx.sudahAda) {
      await client.query('INSERT INTO masuk_log (warung_id, keterangan, jumlah, metode) VALUES ($1,$2,$3,$4)', [
        req.warungId,
        trx.items.map((i) => `${i.qty}x ${i.nama}`).join(', '),
        trx.total,
        metode || 'Tunai',
      ]);
    }
    await client.query('COMMIT');
    res.status(trx.sudahAda ? 200 : 201).json(trx);
  } catch (e) {
    await client.query('ROLLBACK');
    next(e);
  } finally {
    client.release();
  }
});

// catat sebagai kasbon/utang pelanggan
router.post('/kasbon', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { items, penjagaNama, pembeliId, pembeliNama, sumberInput, clientId } = req.body;
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items wajib diisi' });
    if (!pembeliNama) return res.status(400).json({ error: 'pembeliNama wajib diisi' });
    const trx = await simpanTransaksi(client, {
      warungId: req.warungId,
      penjagaNama,
      mode: 'kasbon',
      pembeliId,
      pembeliNama,
      items,
      sumberInput,
      clientId,
    });
    if (!trx.sudahAda) {
      await client.query('INSERT INTO kasbon (warung_id, transaksi_id, pelanggan_id, nama, jumlah) VALUES ($1,$2,$3,$4,$5)', [
        req.warungId,
        trx.id,
        pembeliId || null,
        pembeliNama,
        trx.total,
      ]);
    }
    await client.query('COMMIT');
    res.status(trx.sudahAda ? 200 : 201).json(trx);
  } catch (e) {
    await client.query('ROLLBACK');
    next(e);
  } finally {
    client.release();
  }
});

export default router;
