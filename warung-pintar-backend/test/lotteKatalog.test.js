import test from 'node:test';
import assert from 'node:assert/strict';
import { produkLotte, dariLotte, sidikNama } from '../src/services/lotteKatalog.js';

const p = { prod_cd: '1088201000', prod_nm: 'INDOMIE MIE AYAM SPECIAL 68GR', slug: 'indomie-mie-ayam-special-68gr', active: true, l4_nm: 'SOUP NOODLE', l1_nm: 'Bulk Product', weight: 75 };
test('membaca data yang terpotong antar frame, tanpa duplikat objek', () => {
  const payload = `24:${JSON.stringify(p)}\na:${JSON.stringify({ product: p })}\n`;
  const html = [payload.slice(0, 33), payload.slice(33)].map((s) => `<script>self.__next_f.push(${JSON.stringify([1, s])})</script>`).join('');
  assert.deepEqual(produkLotte(html), [p]);
  assert.deepEqual(produkLotte('<script>throw new Error("jangan dieksekusi")</script>'), []);
});
test('SKU tidak dianggap barcode dan ukuran berasal dari nama, bukan berat kirim', () => {
  const b = dariLotte(p, 'https://order.lottemart.co.id/product/test/lotte-grosir-jatake');
  assert.equal(b.barcode, null);
  assert.equal(b.sumber_id, '1088201000');
  assert.equal(b.ukuran, '68GR');
  assert.equal(b.kategori, 'mie instan');
  assert.equal(b.foto_url, null);
});
test('barang tidak aktif dan elektronik ditolak', () => {
  assert.equal(dariLotte({ ...p, active: false }, ''), null);
  assert.equal(dariLotte({ ...p, l1_nm: 'Electronics' }, ''), null);
});
test('barang timbang memakai kg dan sayuran tidak menjadi susu karena substring butter', () => {
  const b = dariLotte({ ...p, prod_nm: 'PUMPKIN BUTTERNUT / KG', l4_nm: 'VEGETABLES' }, 'halaman');
  assert.equal(b.satuan, 'kg');
  assert.equal(b.kategori, 'sembako');
  assert.equal(b.ukuran, null);
});
test('duplikat ejaan satuan digabung, ukuran berbeda tetap terpisah', () => {
  assert.equal(sidikNama('Silver Queen Almond 82 GR'), sidikNama('Silverqueen Almond 82g'));
  assert.notEqual(sidikNama('Silverqueen Almond 82g'), sidikNama('Silverqueen Almond 85g'));
});
