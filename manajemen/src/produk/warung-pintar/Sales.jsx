import { useCallback, useEffect, useState } from 'react';
import { rupiah, tgl } from '../../lib/format.js';

// Warung Pintar > Sales: warung bawaan tiap sales, siapa yang udah bayar langganan, dan berapa duitnya.
// `api(method, path, body)` udah nempel ke /api/warung-pintar + kunci admin (lihat App.jsx).
const NAMA_PLAN = { trial: 'Trial', bulanan: 'Bulanan', triwulan: '3 Bulan', tahunan: 'Tahunan', permanen: 'Permanen' };
const linkSales = (urlProduk, kode) => `${urlProduk}/?ref=${kode}`;

export default function Sales({ api, produk }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [memuat, setMemuat] = useState(false);
  const [pilihan, setPilihan] = useState(null); // { id, judul } - sales yang dibuka daftar warungnya

  const muat = useCallback(async () => {
    setMemuat(true);
    setError('');
    try {
      setData(await api('GET', '/ringkasan'));
    } catch (e) {
      setError(e.message);
    } finally {
      setMemuat(false);
    }
  }, [api]);

  useEffect(() => {
    let batal = false;
    api('GET', '/ringkasan')
      .then((d) => !batal && setData(d))
      .catch((e) => !batal && setError(e.message));
    return () => {
      batal = true;
    };
  }, [api]);

  const semua = data ? [...data.sales, data.tanpaSales] : [];
  const total = (f) => semua.reduce((n, s) => n + (s?.[f] || 0), 0);

  return (
    <>
      <header className="adm-kepala">
        <div>
          <h1>Sales</h1>
          <p className="adm-sub">Warung bawaan tiap sales & siapa yang udah langganan {produk.nama}.</p>
        </div>
        <button className="btn kecil" onClick={muat} disabled={memuat}>
          {memuat ? 'Memuat…' : 'Muat ulang'}
        </button>
      </header>

      {error && <p className="adm-error">{error}</p>}

      {!data ? (
        !error && <p className="adm-sub">Memuat…</p>
      ) : (
        <>
          <div className="adm-angka">
            <Angka label="Warung daftar" nilai={total('daftar')} />
            <Angka label="Pernah bayar" nilai={total('bayar')} />
            <Angka label="Omzet bulan ini" nilai={rupiah(total('omzet_bulan_ini'))} />
            <Angka label="Omzet total" nilai={rupiah(total('omzet'))} />
          </div>

          <div className="adm-kolom">
            <section className="adm-kartu">
              <h2>Daftar sales</h2>
              <TabelSales
                urlProduk={produk.url}
                sales={data.sales}
                tanpa={data.tanpaSales}
                onBuka={setPilihan}
                onUbah={async (id, perubahan) => {
                  try {
                    await api('PATCH', '/sales/' + id, perubahan);
                    muat();
                  } catch (e) {
                    setError(e.message);
                  }
                }}
              />
              <TambahSales
                urlProduk={produk.url}
                onTambah={async (isi) => {
                  await api('POST', '/sales', isi);
                  muat();
                }}
              />
            </section>

            <section className="adm-kartu">
              <h2>Pembayaran terbaru</h2>
              {data.pembayaran.length === 0 ? (
                <p className="adm-sub">Belum ada pembayaran lunas.</p>
              ) : (
                <ul className="adm-daftar">
                  {data.pembayaran.map((p) => (
                    <li key={p.order_id}>
                      <div>
                        <b>{p.warung}</b> <span className="adm-redup">@{p.username}</span>
                        <div className="adm-redup">
                          {NAMA_PLAN[p.plan] || p.plan} · {tgl(p.lunas_pada)}
                        </div>
                      </div>
                      <div className="adm-kanan">
                        <b>{rupiah(p.jumlah)}</b>
                        <span className={'adm-lencana' + (p.sales_nama ? '' : ' kosong')}>
                          {p.sales_nama ? `${p.sales_nama} (${p.sales_kode})` : 'Tanpa sales'}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <CariWarung api={api} sales={data.sales} onBerubah={muat} />
        </>
      )}

      {pilihan && <DaftarWarung api={api} pilihan={pilihan} sales={data?.sales || []} onTutup={() => setPilihan(null)} onBerubah={muat} />}
    </>
  );
}

function Angka({ label, nilai }) {
  return (
    <div className="adm-kartu adm-angka-item">
      <span className="adm-redup">{label}</span>
      <b className="p-num">{nilai}</b>
    </div>
  );
}

function TabelSales({ urlProduk, sales, tanpa, onBuka, onUbah }) {
  const [tersalin, setTersalin] = useState('');
  const salin = async (kode) => {
    try {
      await navigator.clipboard.writeText(linkSales(urlProduk, kode));
      setTersalin(kode);
      setTimeout(() => setTersalin((k) => (k === kode ? '' : k)), 1500);
    } catch {
      window.prompt('Salin link ini:', linkSales(urlProduk, kode));
    }
  };
  return (
    <div className="adm-gulir">
      <table className="adm-tabel">
        <thead>
          <tr>
            <th>Sales</th>
            <th>Daftar</th>
            <th>Bayar</th>
            <th>Aktif</th>
            <th>Bulan ini</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {sales.length === 0 && (
            <tr>
              <td colSpan={6} className="adm-redup">
                Belum ada sales. Tambahin di bawah.
              </td>
            </tr>
          )}
          {sales.map((s) => (
            <tr key={s.id} className={s.aktif ? '' : 'mati'}>
              <td>
                <button className="adm-link" onClick={() => onBuka({ id: s.id, judul: `${s.nama} (${s.kode})` })}>
                  {s.nama}
                </button>
                <div className="adm-redup">
                  {s.kode}
                  {s.no_hp ? ` · ${s.no_hp}` : ''}
                  {s.aktif ? '' : ' · nonaktif'}
                </div>
                <div className="adm-tombol">
                  <button className="btn kecil" onClick={() => salin(s.kode)}>
                    {tersalin === s.kode ? 'Tersalin ✓' : 'Salin link'}
                  </button>
                  <button className="btn kecil" onClick={() => onUbah(s.id, { aktif: !s.aktif })}>
                    {s.aktif ? 'Nonaktifkan' : 'Aktifkan'}
                  </button>
                </div>
              </td>
              <td>{s.daftar}</td>
              <td>{s.bayar}</td>
              <td>{s.langganan_aktif}</td>
              <td>{rupiah(s.omzet_bulan_ini)}</td>
              <td>{rupiah(s.omzet)}</td>
            </tr>
          ))}
          <tr className="adm-tanpa">
            <td>
              <button className="adm-link" onClick={() => onBuka({ id: 'tanpa', judul: 'Tanpa sales' })}>
                Tanpa sales
              </button>
              <div className="adm-redup">daftar sendiri</div>
            </td>
            <td>{tanpa.daftar}</td>
            <td>{tanpa.bayar}</td>
            <td>{tanpa.langganan_aktif}</td>
            <td>{rupiah(tanpa.omzet_bulan_ini)}</td>
            <td>{rupiah(tanpa.omzet)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function TambahSales({ urlProduk, onTambah }) {
  const [kode, setKode] = useState('');
  const [nama, setNama] = useState('');
  const [noHp, setNoHp] = useState('');
  const [error, setError] = useState('');
  const [simpan, setSimpan] = useState(false);
  return (
    <form
      className="adm-tambah"
      onSubmit={async (e) => {
        e.preventDefault();
        setError('');
        setSimpan(true);
        try {
          await onTambah({ kode, nama, noHp: noHp || undefined });
          setKode('');
          setNama('');
          setNoHp('');
        } catch (err) {
          setError(err.message);
        } finally {
          setSimpan(false);
        }
      }}
    >
      <h3>Tambah sales</h3>
      <div className="adm-baris">
        <div className="field">
          <label>Kode</label>
          <input value={kode} onChange={(e) => setKode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20).toUpperCase())} placeholder="BUDI" />
        </div>
        <div className="field">
          <label>Nama</label>
          <input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Budi Santoso" />
        </div>
        <div className="field">
          <label>No. HP (opsional)</label>
          <input value={noHp} onChange={(e) => setNoHp(e.target.value)} placeholder="0812…" inputMode="tel" />
        </div>
      </div>
      {error && <p className="adm-error">{error}</p>}
      <button className="btn utama" style={{ marginTop: 12 }} type="submit" disabled={simpan || kode.length < 3 || !nama.trim()}>
        {simpan ? 'Menyimpan…' : 'Tambah sales'}
      </button>
      {kode.length >= 3 && <p className="adm-redup" style={{ marginTop: 8 }}>Link-nya nanti: {linkSales(urlProduk, kode)}</p>}
    </form>
  );
}

// Baris warung + pilihan sales-nya (buat benerin warung yang lupa ngisi kode pas daftar).
function BarisWarung({ w, api, sales, onBerubah }) {
  const [salesKode, setSalesKode] = useState(w.sales_kode || '');
  const [status, setStatus] = useState('');
  const ganti = async (kode) => {
    setSalesKode(kode);
    setStatus('menyimpan…');
    try {
      await api('PUT', `/warung/${w.id}/sales`, { kode: kode || null });
      setStatus('tersimpan ✓');
      onBerubah();
    } catch (e) {
      setSalesKode(w.sales_kode || '');
      setStatus(e.message);
    }
  };
  return (
    <li>
      <div>
        <b>{w.nama}</b> <span className="adm-redup">@{w.username}</span>
        <div className="adm-redup">
          Daftar {tgl(w.created_at)}
          {w.no_hp ? ` · ${w.no_hp}` : ''}
        </div>
        <div className="adm-redup">
          {w.langganan_aktif ? `${NAMA_PLAN[w.plan] || w.plan} s/d ${tgl(w.lisensi_berlaku_sampai)}` : w.plan === 'trial' ? 'Masih trial' : 'Langganan habis'}
          {w.total_bayar > 0 ? ` · total bayar ${rupiah(w.total_bayar)}` : ''}
        </div>
      </div>
      <div className="adm-kanan">
        <select value={salesKode} onChange={(e) => ganti(e.target.value)}>
          <option value="">Tanpa sales</option>
          {sales.map((s) => (
            <option key={s.id} value={s.kode}>
              {s.nama} ({s.kode})
            </option>
          ))}
        </select>
        {status && <span className="adm-redup">{status}</span>}
      </div>
    </li>
  );
}

function DaftarWarung({ api, pilihan, sales, onTutup, onBerubah }) {
  const [warung, setWarung] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let batal = false;
    api('GET', `/sales/${pilihan.id}/warung`)
      .then((r) => !batal && setWarung(r))
      .catch((e) => !batal && setError(e.message));
    return () => {
      batal = true;
    };
  }, [api, pilihan.id]);
  return (
    <div className="adm-latar" onClick={onTutup}>
      <div className="adm-kartu adm-panel" onClick={(e) => e.stopPropagation()}>
        <div className="adm-kepala">
          <h2>Warung · {pilihan.judul}</h2>
          <button className="btn kecil" onClick={onTutup}>
            Tutup
          </button>
        </div>
        {error && <p className="adm-error">{error}</p>}
        {!warung ? (
          !error && <p className="adm-sub">Memuat…</p>
        ) : warung.length === 0 ? (
          <p className="adm-sub">Belum ada warung.</p>
        ) : (
          <ul className="adm-daftar">
            {warung.map((w) => (
              <BarisWarung key={w.id} w={w} api={api} sales={sales} onBerubah={onBerubah} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CariWarung({ api, sales, onBerubah }) {
  const [q, setQ] = useState('');
  const [hasil, setHasil] = useState(null);
  const [error, setError] = useState('');
  const cari = async (e) => {
    e.preventDefault();
    setError('');
    try {
      setHasil(await api('GET', '/warung?q=' + encodeURIComponent(q.trim())));
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <section className="adm-kartu" style={{ marginTop: 16 }}>
      <h2>Cari warung</h2>
      <p className="adm-redup">Buat nempelin sales ke warung yang lupa ngisi kode pas daftar.</p>
      <form className="adm-cari" onSubmit={cari}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nama warung, username, atau no. HP" />
        <button className="btn kecil" type="submit" disabled={q.trim().length < 2}>
          Cari
        </button>
      </form>
      {error && <p className="adm-error">{error}</p>}
      {hasil &&
        (hasil.length === 0 ? (
          <p className="adm-sub">Nggak ketemu.</p>
        ) : (
          <ul className="adm-daftar">
            {hasil.map((w) => (
              <BarisWarung key={w.id} w={w} api={api} sales={sales} onBerubah={onBerubah} />
            ))}
          </ul>
        ))}
    </section>
  );
}
