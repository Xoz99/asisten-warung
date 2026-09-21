import { useEffect, useState } from 'react';
import { rupiah, tampilHp, tgl, waktu, waktuRelatif } from '../lib/format.js';
import { Gagal, Kosong, Memuat, useData } from '../komponen/Ui.jsx';

// Pelanggan Warung Pintar & sales pemiliknya (PRD v0.2 §13-15): siapa pelanggannya, langganan lewat sales siapa,
// dari link atau kode, riwayat pindah pemilik, dan tiap pembayaran jatuh ke sales siapa pada saat bayar.
const TAHAP = {
  trial: { nama: 'Trial', warna: 'kuning', ket: 'Masa coba 7 hari' },
  trial_habis: { nama: 'Trial habis', warna: 'merah', ket: 'Belum pernah bayar' },
  langganan: { nama: 'Berlangganan', warna: 'hijau', ket: 'Bayar & masih aktif' },
  permanen: { nama: 'Permanen', warna: 'biru', ket: 'Nggak pernah berakhir' },
  berhenti: { nama: 'Churned', warna: 'oranye', ket: 'Pernah bayar, udah lewat' },
};
const SUMBER = {
  link: { nama: 'Link', warna: 'ungu' },
  kode: { nama: 'Kode', warna: 'biru' },
  mandiri: { nama: 'Daftar sendiri', warna: '' },
  lama: { nama: 'Belum tercatat', warna: '' },
};
const NAMA_PLAN = { bulanan: '1 bulan', triwulan: '3 bulan', tahunan: '12 bulan', permanen: 'Permanen' };

export default function PelangganWp({ api }) {
  const [tahap, setTahap] = useState('');
  const [sales, setSales] = useState('');
  const [q, setQ] = useState('');
  const [cari, setCari] = useState('');
  const [dipilih, setDipilih] = useState(null);
  const path = `/leads-warung?${new URLSearchParams({ ...(tahap && { tahap }), ...(sales && { sales }), ...(cari && { q: cari }) })}`;
  const { data, error, muat } = useData(api, path);

  return (
    <>
      <div className="adm-angka" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {Object.entries(TAHAP).map(([id, t]) => (
          <button key={id} className={'adm-kartu adm-angka-item adm-saring' + (tahap === id ? ' on' : '')} onClick={() => setTahap((x) => (x === id ? '' : id))} aria-pressed={tahap === id}>
            <span className={`adm-chip ${t.warna}`} style={{ alignSelf: 'flex-start' }}>
              {t.nama}
            </span>
            <b className="p-num">{data?.ringkas.find((r) => r.tahap === id)?.n ?? '…'}</b>
            <span className="adm-redup">{t.ket}</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <form
          className="adm-cari"
          style={{ margin: 0, flex: 1 }}
          onSubmit={(e) => {
            e.preventDefault();
            setCari(q.trim());
          }}
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama warung, username, no. HP, kode sales" aria-label="Cari pelanggan" />
          <button className="btn" type="submit">
            Cari
          </button>
        </form>
        <select value={sales} onChange={(e) => setSales(e.target.value)} aria-label="Saring per sales">
          <option value="">Semua pemilik</option>
          <option value="house">House account (tanpa sales)</option>
          {(data?.sales || []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.nama} ({s.kode})
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <Gagal apa="daftar pelanggan" pesan={error} onUlang={muat} />
      ) : !data ? (
        <Memuat apa="daftar pelanggan" />
      ) : data.warung.length === 0 ? (
        tahap || cari || sales ? (
          <Kosong judul="Nggak ada pelanggan yang cocok">Ganti kata kunci, status, atau pemiliknya.</Kosong>
        ) : (
          <Kosong judul="Belum ada warung yang daftar" aksi={<a className="btn kecil utama" href="#/leads/sales">Bagiin link sales</a>}>
            Warung yang daftar lewat aplikasi Warung Pintar muncul di sini otomatis, lengkap sama sales yang bawa.
          </Kosong>
        )
      ) : (
        <div className="adm-gulir">
          <table className="adm-tabel">
            <thead>
              <tr>
                <th>Pelanggan</th>
                <th>Status</th>
                <th>Pemilik (sales)</th>
                <th>Masuk lewat</th>
                <th className="kanan">Pembayaran</th>
                <th>Bayar terakhir</th>
                <th>Daftar</th>
              </tr>
            </thead>
            <tbody>
              {data.warung.map((w) => {
                const t = TAHAP[w.tahap];
                const s = SUMBER[w.atribusi_sumber] || SUMBER.lama;
                return (
                  <tr
                    key={w.id}
                    className={'klik' + (dipilih === w.id ? ' pilih' : '')}
                    onClick={() => setDipilih(w.id)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setDipilih(w.id))}
                    tabIndex={0}
                    aria-label={`Buka detail ${w.nama}`}
                  >
                    <td>
                      <b>{w.nama}</b>
                      <div className="adm-redup">
                        @{w.username} · {tampilHp(w.no_hp)}
                      </div>
                    </td>
                    <td>
                      <span className={`adm-chip ${t.warna}`}>{t.nama}</span>
                    </td>
                    <td>
                      {w.sales_nama ? (
                        <>
                          <b>{w.sales_nama}</b> <span className="adm-mono">{w.sales_kode}</span>
                        </>
                      ) : (
                        <span className="adm-chip">House account</span>
                      )}
                      {w.jumlah_periode > 1 && <div className="adm-redup">pernah pindah pemilik</div>}
                    </td>
                    <td>
                      <span className={`adm-chip ${s.warna}`}>{s.nama}</span>
                      {w.klaim_link_kalah && <div className="adm-redup">klaim link {w.link_sales_kode || w.link_kode} kalah</div>}
                    </td>
                    <td className="kanan">
                      <b className="p-num">{rupiah(w.total_bayar)}</b>
                      <div className="adm-redup">{w.jumlah_bayar}x lunas</div>
                    </td>
                    <td>{w.terakhir_bayar ? waktuRelatif(w.terakhir_bayar) : <span className="adm-redup">Belum pernah</span>}</td>
                    <td>{tgl(w.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {dipilih && <LaciPelanggan api={api} id={dipilih} daftarSales={data?.sales || []} onTutup={() => setDipilih(null)} onBerubah={muat} />}
    </>
  );
}

function LaciPelanggan({ api, id, daftarSales, onTutup, onBerubah }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [versi, setVersi] = useState(0);
  const [tujuan, setTujuan] = useState('');
  const [alasan, setAlasan] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState('');

  useEffect(() => {
    let batal = false;
    api('GET', `/pelanggan/${id}`)
      .then((r) => !batal && (setD(r), setError('')))
      .catch((e) => !batal && setError(e.message));
    return () => {
      batal = true;
    };
  }, [api, id, versi]);

  useEffect(() => {
    const tekan = (e) => e.key === 'Escape' && onTutup();
    document.addEventListener('keydown', tekan);
    return () => document.removeEventListener('keydown', tekan);
  }, [onTutup]);

  const aktif = d?.kepemilikan.find((k) => !k.valid_to);
  const pindah = async (e) => {
    e.preventDefault();
    setError('');
    setPesan('');
    setSibuk(true);
    try {
      await api('PUT', `/warung/${id}/sales`, { kode: tujuan === 'house' ? null : tujuan, alasan });
      setPesan('Pemilik dipindah. Periode lama ditutup, riwayatnya tetap tersimpan.');
      setTujuan('');
      setAlasan('');
      setVersi((v) => v + 1);
      onBerubah();
    } catch (err) {
      setError(err.message);
    } finally {
      setSibuk(false);
    }
  };

  return (
    <>
      <div className="adm-latar" style={{ padding: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onTutup()} />
      <aside className="adm-laci" role="dialog" aria-modal="true" aria-label="Detail pelanggan" style={{ width: 'min(520px, 100%)' }}>
        <div className="adm-modal-kepala">
          <h2>Detail pelanggan</h2>
          <button className="adm-tutup" onClick={onTutup} aria-label="Tutup">
            ×
          </button>
        </div>
        {error && <p className="adm-error">{error}</p>}
        {!d ? (
          !error && <Memuat apa="detail" />
        ) : (
          <>
            <span className={`adm-chip ${TAHAP[d.warung.tahap].warna}`}>{TAHAP[d.warung.tahap].nama}</span>
            <h3 style={{ fontSize: 24, margin: '8px 0 2px', textTransform: 'uppercase' }}>{d.warung.nama}</h3>
            <p className="adm-redup" style={{ margin: 0 }}>
              @{d.warung.username} · {tampilHp(d.warung.no_hp)} · daftar {tgl(d.warung.created_at)}
              {d.warung.plan !== 'permanen' && ` · aktif sampai ${tgl(d.warung.lisensi_berlaku_sampai)}`}
            </p>

            <section className="adm-kartu" style={{ boxShadow: 'none', padding: 12, marginTop: 14, background: aktif?.sales_kode ? 'var(--putih)' : 'var(--kertas)' }}>
              <span className="adm-label" style={{ fontSize: 10 }}>
                Pemilik sekarang
              </span>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{aktif?.sales_nama ? `${aktif.sales_nama} (${aktif.sales_kode})` : 'House account (Konsulin)'}</div>
              {aktif && <div className="adm-redup">sejak {waktu(aktif.valid_from)}</div>}
            </section>

            <h4 className="adm-label" style={{ fontSize: 11, margin: '16px 0 6px' }}>
              Atribusi saat daftar
            </h4>
            <Atribusi a={d.atribusi} />

            <h4 className="adm-label" style={{ fontSize: 11, margin: '16px 0 6px' }}>
              Pembayaran ({d.pembayaran.filter((p) => p.status === 'settlement').length} lunas)
            </h4>
            {d.pembayaran.length === 0 ? (
              <p className="adm-redup" style={{ margin: 0 }}>
                Belum pernah bikin pembayaran.
              </p>
            ) : (
              <div className="adm-riwayat">
                {d.pembayaran.map((p) => (
                  <div key={p.order_id} className="adm-riwayat-item">
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <b className="p-num">
                        {rupiah(p.jumlah)} · {NAMA_PLAN[p.plan] || p.plan}
                      </b>
                      {p.status === 'settlement' ? (
                        <span className={`adm-chip ${Number(p.urutan_lunas) === 1 ? 'kuning' : ''}`}>{Number(p.urutan_lunas) === 1 ? 'Order pertama' : `Recurring ke-${Number(p.urutan_lunas) - 1}`}</span>
                      ) : (
                        <span className={`adm-status ${p.status}`}>{p.status === 'pending' ? 'Menunggu' : p.status}</span>
                      )}
                    </div>
                    {p.status === 'settlement' ? (
                      <div className="adm-redup" style={{ marginTop: 4 }}>
                        Lunas {waktu(p.lunas_pada)} · pemilik saat bayar: <b style={{ color: 'var(--tinta)' }}>{p.pemilik_nama ? `${p.pemilik_nama} (${p.pemilik_kode})` : 'House account'}</b>
                      </div>
                    ) : (
                      <div className="adm-redup" style={{ marginTop: 4 }}>
                        Dibuat {waktu(p.created_at)}
                      </div>
                    )}
                    <div className="adm-mono adm-redup">{p.order_id}</div>
                  </div>
                ))}
              </div>
            )}

            <h4 className="adm-label" style={{ fontSize: 11, margin: '16px 0 6px' }}>
              Riwayat kepemilikan
            </h4>
            <div className="adm-riwayat">
              {d.kepemilikan.map((k) => (
                <div key={k.id} className="adm-riwayat-item" style={!k.valid_to ? { background: '#FEF9C3' } : undefined}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <b>{k.sales_nama ? `${k.sales_nama} (${k.sales_kode})` : 'House account'}</b>
                    {!k.valid_to && <span className="adm-chip hijau">Sekarang</span>}
                  </div>
                  <div className="adm-redup">
                    {waktu(k.valid_from)} sampai {k.valid_to ? waktu(k.valid_to) : 'sekarang'}
                  </div>
                  <div style={{ marginTop: 4 }}>{k.alasan}</div>
                  <div className="adm-redup">oleh {k.aktor}</div>
                </div>
              ))}
            </div>

            <form className="adm-kartu" style={{ boxShadow: 'none', padding: 12, marginTop: 16 }} onSubmit={pindah}>
              <h4 className="adm-label" style={{ fontSize: 11, margin: 0 }}>
                Pindah pemilik
              </h4>
              <p className="adm-redup" style={{ margin: '4px 0 0' }}>
                Periode sekarang ditutup & periode baru dibuka. Riwayat & pembayaran lama tetap tercatat ke pemilik lamanya.
              </p>
              <div className="field">
                <label htmlFor="pindah-ke">Pindah ke</label>
                <select id="pindah-ke" value={tujuan} onChange={(e) => setTujuan(e.target.value)} style={{ maxWidth: 'none', width: '100%', minHeight: 44 }}>
                  <option value="">Pilih pemilik baru</option>
                  <option value="house">House account (Konsulin)</option>
                  {daftarSales
                    .filter((s) => s.aktif)
                    .map((s) => (
                      <option key={s.id} value={s.kode}>
                        {s.nama} ({s.kode})
                      </option>
                    ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="pindah-alasan">Alasan (wajib)</label>
                <input id="pindah-alasan" value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="Misal: sales lama keluar, dialihkan ke pengganti" />
              </div>
              {pesan && <p className="adm-ok">{pesan}</p>}
              <button className="btn utama" style={{ marginTop: 12 }} type="submit" disabled={sibuk || !tujuan || alasan.trim().length < 5}>
                {sibuk ? 'Memindahkan…' : 'Pindah pemilik'}
              </button>
            </form>
          </>
        )}
      </aside>
    </>
  );
}

function Atribusi({ a }) {
  if (!a) return <p className="adm-redup">Belum ada data atribusi.</p>;
  if (a.sumber === 'lama') {
    return (
      <p className="adm-redup" style={{ margin: 0 }}>
        Daftar sebelum pencatatan atribusi ada. Sales yang tercatat waktu itu: {a.sales_nama ? `${a.sales_nama} (${a.sales_kode})` : 'nggak ada'}.
      </p>
    );
  }
  return (
    <div className="adm-kartu" style={{ boxShadow: 'none', padding: 12 }}>
      <div>
        <span className={`adm-chip ${SUMBER[a.sumber].warna}`}>{SUMBER[a.sumber].nama}</span>{' '}
        {a.sumber === 'mandiri' ? 'Tanpa link & tanpa kode, jadi house account (D-43).' : <>Jatuh ke <b>{a.sales_nama ? `${a.sales_nama} (${a.sales_kode})` : '-'}</b></>}
      </div>
      <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
        <li>
          Link ?ref=: {a.link_kode ? <b className="adm-mono">{a.link_kode}</b> : 'nggak ada'}
          {a.link_kode && (a.link_sales_nama ? ` (${a.link_sales_nama})` : ' (kode nggak dikenal / sales nonaktif)')}
        </li>
        <li>
          Kode diketik: {a.kode_ketik ? <b className="adm-mono">{a.kode_ketik}</b> : 'nggak ada'}
          {a.kode_ketik && a.kode_sales_nama && ` (${a.kode_sales_nama})`}
        </li>
      </ul>
      {a.link_sales_id && a.kode_sales_id && a.link_sales_id !== a.kode_sales_id && (
        <p className="adm-redup" style={{ margin: '8px 0 0' }}>
          Link & kode nunjuk sales beda: kode menang otomatis (D-65), klaim link tetap disimpan di sini.
        </p>
      )}
    </div>
  );
}
