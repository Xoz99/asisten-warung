import { useCallback, useEffect, useMemo, useState } from 'react';
import { bacaSesi, panggil, simpanSesi } from './lib/api.js';
import SalesWarungPintar from './produk/warung-pintar/Sales.jsx';
import PembayaranWarungPintar from './produk/warung-pintar/Pembayaran.jsx';
import AkunDemoWarungPintar from './produk/warung-pintar/AkunDemo.jsx';
import Admin from './halaman/Admin.jsx';

// Halaman per produk. Nambah produk/halaman baru: daftarin komponennya di sini, dengan id produk yang sama kayak
// di server/produk/index.js.
const HALAMAN_PRODUK = {
  'warung-pintar': [
    { id: 'sales', nama: 'Sales', Komponen: SalesWarungPintar },
    { id: 'pembayaran', nama: 'Pembayaran', Komponen: PembayaranWarungPintar },
    { id: 'demo', nama: 'Akun demo', Komponen: AkunDemoWarungPintar },
  ],
};
// Halaman umum manajemen (bukan punya produk tertentu).
const HALAMAN_UMUM = [{ id: 'admin', nama: 'Admin & aktivitas', Komponen: Admin }];

export default function App() {
  const [sesi, setSesi] = useState(bacaSesi); // { token, admin }
  const [produk, setProduk] = useState(null);
  const [error, setError] = useState('');
  const [aktif, setAktif] = useState(null); // { produk: id | null, halaman }

  const keluar = useCallback((pesan = '') => {
    simpanSesi(null);
    setSesi(null);
    setProduk(null);
    setError(pesan);
  }, []);

  const token = sesi?.token;
  // Sesi ditolak di tengah jalan (habis 12 jam, password diganti, dinonaktifin) -> balik ke layar masuk.
  const api = useCallback(
    async (method, path, body) => {
      try {
        return await panggil(token, method, path, body);
      } catch (e) {
        if (e.status === 401) keluar(e.message);
        throw e;
      }
    },
    [token, keluar]
  );

  useEffect(() => {
    if (!token) return;
    let batal = false;
    panggil(token, 'GET', '/produk')
      .then((p) => {
        if (batal) return;
        setProduk(p);
        const pertama = p.find((x) => HALAMAN_PRODUK[x.id]);
        setAktif(pertama ? { produk: pertama.id, halaman: HALAMAN_PRODUK[pertama.id][0].id } : { produk: null, halaman: 'admin' });
      })
      .catch((e) => !batal && keluar(e.message));
    return () => {
      batal = true;
    };
  }, [token, keluar]);

  const produkAktif = aktif?.produk ? produk?.find((p) => p.id === aktif.produk) : null;
  const halamanAktif = produkAktif
    ? HALAMAN_PRODUK[produkAktif.id]?.find((h) => h.id === aktif.halaman)
    : HALAMAN_UMUM.find((h) => h.id === aktif?.halaman);
  const Komponen = halamanAktif?.Komponen;
  const idProduk = produkAktif?.id;
  // Harus stabil - halaman ngambil datanya di useEffect yang bergantung sama fungsi ini.
  const apiHalaman = useMemo(() => (idProduk ? (m, path, b) => api(m, '/' + idProduk + path, b) : api), [api, idProduk]);

  if (!sesi) {
    return (
      <Masuk
        error={error}
        onMasuk={(s) => {
          simpanSesi(s);
          setError('');
          setSesi(s);
        }}
      />
    );
  }

  const tombolNav = (produkId, h) => (
    <button
      key={h.id}
      className={'adm-nav' + (aktif?.produk === produkId && aktif?.halaman === h.id ? ' on' : '')}
      onClick={() => setAktif({ produk: produkId, halaman: h.id })}
    >
      {h.nama}
    </button>
  );

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
              {(HALAMAN_PRODUK[p.id] || []).map((h) => tombolNav(p.id, h))}
            </div>
          ))}
          <div className="adm-nav-grup">
            <div className="adm-nav-produk">Manajemen</div>
            {HALAMAN_UMUM.map((h) => tombolNav(null, h))}
          </div>
        </nav>
        <div className="adm-akun">
          <span className="adm-redup">Masuk sebagai</span>
          <b>{sesi.admin?.nama}</b>
          <button className="btn kecil" onClick={() => keluar()}>
            Keluar
          </button>
        </div>
      </aside>
      <main className="adm-isi">
        {!produk ? (
          <p className="adm-sub">Memuat…</p>
        ) : !Komponen ? (
          <p className="adm-sub">Belum ada produk yang aktif. Isi database produknya di .env server manajemen.</p>
        ) : (
          // key: ganti halaman = state halaman mulai dari nol
          <Komponen key={(idProduk || '') + halamanAktif.id} produk={produkAktif} api={apiHalaman} admin={sesi.admin} />
        )}
      </main>
    </div>
  );
}

function Masuk({ error, onMasuk }) {
  const [perluSetup, setPerluSetup] = useState(null);
  const [isi, setIsi] = useState({ username: '', password: '', nama: '', kunciSetup: '' });
  const [salah, setSalah] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let batal = false;
    panggil(null, 'GET', '/auth/status')
      .then((r) => !batal && setPerluSetup(r.perluSetup))
      .catch((e) => !batal && setSalah(e.message));
    return () => {
      batal = true;
    };
  }, []);

  const ubah = (k) => (e) => setIsi((x) => ({ ...x, [k]: e.target.value }));
  const kirim = async (e) => {
    e.preventDefault();
    setSalah('');
    setLoading(true);
    try {
      onMasuk(await panggil(null, 'POST', perluSetup ? '/auth/setup' : '/auth/masuk', isi));
    } catch (err) {
      setSalah(err.message);
      setLoading(false);
    }
  };

  const field = (k, label, props = {}) => (
    <div className="field">
      <label htmlFor={k}>{label}</label>
      <input id={k} value={isi[k]} onChange={ubah(k)} {...props} />
    </div>
  );

  return (
    <div className="adm-tengah">
      <form className="adm-kartu adm-masuk" onSubmit={kirim}>
        <div className="adm-merek">
          Konsulin <span>Manajemen</span>
        </div>
        {perluSetup === null ? (
          <p className="adm-sub">{salah || 'Memuat…'}</p>
        ) : (
          <>
            <p className="adm-sub">
              {perluSetup
                ? 'Belum ada admin. Bikin akun admin pertama pakai kunci setup (ADMIN_KEY di .env server).'
                : 'Khusus internal. Masuk pakai akun adminmu.'}
            </p>
            {perluSetup && field('kunciSetup', 'Kunci setup', { type: 'password', autoComplete: 'off' })}
            {perluSetup && field('nama', 'Nama kamu')}
            {field('username', 'Username', { autoCapitalize: 'none', autoComplete: 'username', autoFocus: !perluSetup })}
            {field('password', perluSetup ? 'Password (min. 8 karakter)' : 'Password', {
              type: 'password',
              autoComplete: perluSetup ? 'new-password' : 'current-password',
            })}
            {(salah || error) && <p className="adm-error">{salah || error}</p>}
            <button className="btn utama" style={{ width: '100%', marginTop: 16 }} type="submit" disabled={loading}>
              {loading ? 'Memproses…' : perluSetup ? 'Buat admin & masuk' : 'Masuk'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
