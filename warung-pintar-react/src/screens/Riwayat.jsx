import { useApp } from '../state/AppContext.jsx';
import { rupiah } from '../lib/format';

export default function Riwayat() {
  const { S, goTo } = useApp();

  return (
    <>
      <div style={{ paddingTop: 14 }}>
        <button className="btn kecil" onClick={() => goTo('s-home')}>
          ‹ Kembali
        </button>
        <p className="p-h1" style={{ marginTop: 16 }}>
          Riwayat jaga
        </p>
        <p className="p-sub">Catatan serah terima tiap giliran</p>
      </div>

      {S.riwayatJaga.length === 0 && (
        <div className="card">
          <div className="kosong">Belum ada serah terima</div>
        </div>
      )}
      {S.riwayatJaga.map((r, i) => {
        const d = new Date(r.waktu);
        return (
          <div className="card" key={i}>
            <div className="between">
              <div className="nama">
                {r.dari} → {r.ke}
              </div>
              <span className="tag">
                {d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} {d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="item" style={{ border: 0, padding: '12px 0 0' }}>
              <div className="nama">Uang laci</div>
              <div className="kanan p-num">{rupiah(r.uang)}</div>
            </div>
            <div className="item" style={{ padding: '12px 0' }}>
              <div className="nama">Penjualan</div>
              <div className="kanan p-num">
                {rupiah(r.jual)} · {r.trx}×
              </div>
            </div>
            <div className="tgl">Stok menipis: {r.habis.length ? r.habis.join(', ') : '—'}</div>
            <div className="tgl">Utang baru: {r.utangBaru.length ? r.utangBaru.join(', ') : '—'}</div>
          </div>
        );
      })}
    </>
  );
}
