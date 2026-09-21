import { useCallback, useEffect, useMemo, useState } from 'react';
import { bacaKunci, panggil, simpanKunci } from './lib/api.js';
import SalesWarungPintar from './produk/warung-pintar/Sales.jsx';

// Halaman per produk. Nambah produk/halaman baru: daftarin komponennya di sini, dengan id produk yang sama kayak
// di server/produk/index.js.
const HALAMAN = {
  'warung-pintar': [{ id: 'sales', nama: 'Sales', Komponen: SalesWarungPintar }],
};

export default function App() {
  const [kunci, setKunci] = useState(bacaKunci);
  const [produk, setProduk] = useState(null);
  const [error, setError] = useState('');
  const [aktif, setAktif] = useState(null); // { produk, halaman }

  const keluar = useCallback((pesan = '') => {
    simpanKunci('');
    setKunci('');
    setProduk(null);
    setError(pesan);
  }, []);

  // Kunci ditolak di tengah jalan (diganti di server) -> balik ke layar masuk.
  const api = useCallback(
    async (method, path, body) => {
      try {
        return await panggil(kunci, method, path, body);
      } catch (e) {
        if (e.status === 401 || e.status === 503) keluar(e.message);
        throw e;
      }
    },
    [kunci, keluar]
  );

  useEffect(() => {
    if (!kunci) return;
    let batal = false;
    panggil(kunci, 'GET', '/produk')
      .then((p) => {
        if (batal) return;
        setProduk(p);
        const pertama = p.find((x) => HALAMAN[x.id]);
        if (pertama) setAktif({ produk: pertama.id, halaman: HALAMAN[pertama.id][0].id });
      })
      .catch((e) => !batal && keluar(e.message));
    return () => {
      batal = true;
    };
  }, [kunci, keluar]);

  const produkAktif = produk?.find((p) => p.id === aktif?.produk);
  const halamanAktif = produkAktif && HALAMAN[produkAktif.id]?.find((h) => h.id === aktif.halaman);
  const Komponen = halamanAktif?.Komponen;
  const idProduk = produkAktif?.id;
  // Harus stabil - halaman produk ngambil datanya di useEffect yang bergantung sama fungsi ini.
  const apiProduk = useMemo(() => (idProduk ? (m, path, b) => api(m, '/' + idProduk + path, b) : null), [api, idProduk]);

  if (!kunci) {
    return (
      <Masuk
        error={error}
        onMasuk={(k) => {
          simpanKunci(k);
          setError('');
          setKunci(k);
        }}
      />
    );
  }

  return (
    <div className="adm">
      <aside className="adm-samping">
        <div className="adm-merek">
          Konsulin <span>Manajemen</span>
        </div>
        <nav>
          {(produk || []).map((p) => (
            <div key={p.id} className="adm-nav-grup">
              <div className="adm-nav-produk">{p.nama}</div>
              {(HALAMAN[p.id] || []).map((h) => (
                <button
                  key={h.id}
                  className={'adm-nav' + (aktif?.produk === p.id && aktif?.halaman === h.id ? ' on' : '')}
                  onClick={() => setAktif({ produk: p.id, halaman: h.id })}
                >
                  {h.nama}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <button className="btn kecil adm-keluar" onClick={() => keluar()}>
          Keluar
        </button>
      </aside>
      <main className="adm-isi">
        {!produk ? (
          <p className="adm-sub">Memuat…</p>
        ) : !Komponen ? (
          <p className="adm-sub">Belum ada produk yang aktif. Isi database produknya di .env server manajemen.</p>
        ) : (
          // key: ganti produk = state halaman mulai dari nol
          <Komponen key={produkAktif.id + halamanAktif.id} produk={produkAktif} api={apiProduk} />
        )}
      </main>
    </div>
  );
}

function Masuk({ error, onMasuk }) {
  const [isi, setIsi] = useState('');
  return (
    <div className="adm-tengah">
      <form
        className="adm-kartu adm-masuk"
        onSubmit={(e) => {
          e.preventDefault();
          if (isi.trim()) onMasuk(isi.trim());
        }}
      >
        <div className="adm-merek">
          Konsulin <span>Manajemen</span>
        </div>
        <p className="adm-sub">Khusus internal. Masukin kunci (ADMIN_KEY di .env server manajemen).</p>
        <div className="field">
          <label htmlFor="kunci">Kunci</label>
          <input id="kunci" type="password" value={isi} onChange={(e) => setIsi(e.target.value)} autoFocus autoComplete="current-password" />
        </div>
        {error && <p className="adm-error">{error}</p>}
        <button className="btn utama" style={{ width: '100%', marginTop: 16 }} type="submit" disabled={!isi.trim()}>
          Masuk
        </button>
      </form>
    </div>
  );
}
