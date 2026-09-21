import { useEffect, useState } from 'react';
import { rupiah } from '../../lib/format.js';

// Riwayat pembayaran langganan - baris yang sama kayak di dashboard Midtrans (cari pakai Order ID), plus siapa warungnya.
const NAMA_PLAN = { bulanan: 'Bulanan', triwulan: '3 Bulan', tahunan: 'Tahunan', permanen: 'Permanen' };
const NAMA_STATUS = { settlement: 'Lunas', pending: 'Menunggu', gagal: 'Gagal', kedaluwarsa: 'Kedaluwarsa' };
const NAMA_METODE = { qris: 'QRIS', gopay: 'GoPay', shopeepay: 'ShopeePay', bank_transfer: 'Transfer VA', echannel: 'Mandiri VA', cstore: 'Minimarket', credit_card: 'Kartu kredit' };
const waktu = (t) => (t ? new Date(t).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-');
const tampilHp = (hp) => (hp ? (hp.startsWith('62') ? '0' + hp.slice(2) : hp) : '-');

export default function Pembayaran({ api }) {
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [cari, setCari] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let batal = false;
    const p = new URLSearchParams();
    if (status) p.set('status', status);
    if (cari) p.set('q', cari);
    api('GET', '/pembayaran?' + p)
      .then((d) => !batal && (setData(d), setError('')))
      .catch((e) => !batal && setError(e.message));
    return () => {
      batal = true;
    };
  }, [api, status, cari]);

  const ringkas = Object.fromEntries((data?.ringkas || []).map((r) => [r.status, r]));

  return (
    <>
      <header className="adm-kepala">
        <div>
          <h1>Pembayaran</h1>
          <p className="adm-sub">Semua transaksi langganan. Order ID-nya sama persis kayak di dashboard Midtrans.</p>
        </div>
      </header>

      <div className="adm-angka">
        {['settlement', 'pending', 'gagal', 'kedaluwarsa'].map((s) => (
          <button key={s} className={'adm-kartu adm-angka-item adm-saring' + (status === s ? ' on' : '')} onClick={() => setStatus((x) => (x === s ? '' : s))}>
            <span className="adm-redup">{NAMA_STATUS[s]}</span>
            <b className="p-num">{ringkas[s]?.jumlah || 0}</b>
            <span className="adm-redup">{rupiah(ringkas[s]?.total || 0)}</span>
          </button>
        ))}
      </div>

      <section className="adm-kartu">
        <form
          className="adm-cari"
          style={{ marginTop: 0, marginBottom: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            setCari(q.trim());
          }}
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari order ID, nama warung, username, no. HP" />
          <button className="btn kecil" type="submit">
            Cari
          </button>
          {(cari || status) && (
            <button
              className="btn kecil"
              type="button"
              onClick={() => {
                setQ('');
                setCari('');
                setStatus('');
              }}
            >
              Reset
            </button>
          )}
        </form>
        {error && <p className="adm-error">{error}</p>}
        {!data ? (
          !error && <p className="adm-sub">Memuat…</p>
        ) : data.pembayaran.length === 0 ? (
          <p className="adm-sub">Nggak ada pembayaran{status || cari ? ' yang cocok' : ''}.</p>
        ) : (
          <div className="adm-gulir">
            <table className="adm-tabel">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Warung</th>
                  <th>Paket</th>
                  <th>Jumlah</th>
                  <th>Status</th>
                  <th>Metode</th>
                  <th>Sales</th>
                  <th>Order ID</th>
                </tr>
              </thead>
              <tbody>
                {data.pembayaran.map((p) => (
                  <tr key={p.order_id}>
                    <td>
                      {waktu(p.created_at)}
                      {p.status === 'settlement' && <div className="adm-redup">lunas {waktu(p.updated_at)}</div>}
                    </td>
                    <td>
                      <b>{p.warung}</b>
                      <div className="adm-redup">
                        @{p.username} · {tampilHp(p.no_hp)}
                      </div>
                    </td>
                    <td>{NAMA_PLAN[p.plan] || p.plan}</td>
                    <td>
                      {rupiah(p.jumlah)}
                      {p.jumlah_bersih != null && <div className="adm-redup">bersih {rupiah(p.jumlah_bersih)}</div>}
                    </td>
                    <td>
                      <span className={'adm-status ' + p.status}>{NAMA_STATUS[p.status] || p.status}</span>
                    </td>
                    <td>{NAMA_METODE[p.payment_type] || p.payment_type || '-'}</td>
                    <td>{p.sales_nama ? `${p.sales_nama} (${p.sales_kode})` : <span className="adm-redup">-</span>}</td>
                    <td className="adm-mono">{p.order_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
