import { useCallback, useEffect, useMemo, useState } from 'react';
import { bacaSesi, panggil, simpanSesi } from './lib/api.js';
import Dashboard from './halaman/Dashboard.jsx';
import Leads from './halaman/Leads.jsx';
import Keuangan from './halaman/Keuangan.jsx';
import Notifikasi from './halaman/Notifikasi.jsx';
import Pengaturan from './halaman/Pengaturan.jsx';
import Profile from './halaman/Profile.jsx';
import Rekrutmen from './halaman/Rekrutmen.jsx';
import Karyawan from './halaman/Karyawan.jsx';
import Artifact from './halaman/Artifact.jsx';
import Lapangan from './halaman/Lapangan.jsx';
import SalesApp from './sales/SalesApp.jsx';
import DaftarPublik from './halaman/DaftarPublik.jsx';

// Makalin Ops: kerangka (sidebar + topbar), login per admin, dan navigasi lewat alamat (#/leads/crm dst) biar
// halaman yang lagi dibuka tetap kebuka pas di-refresh & bisa dibagiin linknya.
const NAMA_HALAMAN = { dashboard: 'Dashboard', leads: 'Leads', lapangan: 'Sales Lapangan', rekrutmen: 'Rekrutmen', karyawan: 'Karyawan', artifact: 'Artifact', keuangan: 'Keuangan', notifikasi: 'Notifikasi', pengaturan: 'Pengaturan', profile: 'Profile' };

function bacaRute() {
  const [halaman, tab] = window.location.hash.replace(/^#\/?/, '').split('/');
  return { halaman: NAMA_HALAMAN[halaman] ? halaman : '', tab: tab || '' };
}

export default function App() {
  const [sesi, setSesi] = useState(bacaSesi); // { token, admin }
  const [produk, setProduk] = useState(null);
  const [error, setError] = useState('');
  const [rute, setRute] = useState(bacaRute);
  const [lacibuka, setLaciBuka] = useState(false);
  const [notifBaru, setNotifBaru] = useState(0);

  useEffect(() => {
    const ganti = () => {
      setRute(bacaRute());
      setLaciBuka(false);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', ganti);
    return () => window.removeEventListener('hashchange', ganti);
  }, []);

  const keluar = useCallback((pesan = '') => {
    simpanSesi(null);
    setSesi(null);
    setProduk(null);
    setError(pesan);
  }, []);

  const token = sesi?.token;
  const sales = sesi?.admin?.peran === 'sales';
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
    if (!token || sales) return;
    let batal = false;
    panggil(token, 'GET', '/produk')
      .then((p) => !batal && setProduk(p))
      .catch((e) => !batal && keluar(e.message));
    return () => {
      batal = true;
    };
  }, [token, sales, keluar]);

  // Angka di lonceng: dicek pas buka & tiap menit.
  const cekNotif = useCallback(() => {
    if (!token || sales) return;
    panggil(token, 'GET', '/notifikasi/jumlah')
      .then((r) => setNotifBaru(r.belumDibaca))
      .catch(() => {});
  }, [token, sales]);
  useEffect(() => {
    cekNotif();
    const t = setInterval(cekNotif, 60000);
    return () => clearInterval(t);
  }, [cekNotif]);

  const produkWp = produk?.find((p) => p.id === 'warung-pintar') || null;
  // Harus stabil - halaman ngambil datanya di useEffect yang bergantung sama fungsi ini.
  const apiProduk = useMemo(() => (produkWp ? (m, path, b) => api(m, '/warung-pintar' + path, b) : null), [api, produkWp]);

  useEffect(() => {
    if (!lacibuka) return;
    const tekan = (e) => e.key === 'Escape' && setLaciBuka(false);
    document.addEventListener('keydown', tekan);
    return () => document.removeEventListener('keydown', tekan);
  }, [lacibuka]);

  // Form daftar calon Sales Partner: publik, tanpa login.
  if (window.location.pathname.replace(/\/+$/, '') === '/daftar') return <DaftarPublik />;

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

  // Akun sales dapat tampilan sendiri (app HP buat lapangan), bukan panel admin.
  if (sales) return <SalesApp api={api} admin={sesi.admin} onKeluar={keluar} />;

  const halaman = rute.halaman || 'dashboard';
  const { tab } = rute;
  const props = { api, apiProduk, produkWp, admin: sesi.admin, tab };

  return (
    <div className="adm">
      <Samping halaman={halaman} tab={tab} admin={sesi.admin} notifBaru={notifBaru} buka={lacibuka} />
      {lacibuka && <div className="adm-latar" style={{ zIndex: 25, padding: 0 }} onClick={() => setLaciBuka(false)} aria-hidden="true" />}
      <div className="adm-utama">
        <header className="adm-topbar">
          <button className="adm-menu-tombol" onClick={() => setLaciBuka(true)} aria-label="Buka menu" aria-expanded={lacibuka}>
            MENU
          </button>
          <div className="adm-crumb">
            Makalin Ops / <b>{NAMA_HALAMAN[halaman]}</b>
          </div>
          <a className="adm-bel" href="#/notifikasi" aria-label={notifBaru ? `Notifikasi, ${notifBaru} belum dibaca` : 'Notifikasi'}>
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
              <path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z" />
              <path d="M10 21h4" />
            </svg>
            {notifBaru > 0 && <span className="adm-hitung">{notifBaru > 99 ? '99+' : notifBaru}</span>}
          </a>
          <a className="adm-inisial" href="#/profile" aria-label={`Profile ${sesi.admin.nama}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            {sesi.admin.nama?.[0]?.toUpperCase()}
          </a>
        </header>
        <main className="adm-isi" id="isi">
          {halaman === 'lapangan' && <Lapangan key={tab} {...props} />}
          {halaman === 'dashboard' && <Dashboard {...props} />}
          {halaman === 'leads' && <Leads key={tab} {...props} />}
          {halaman === 'rekrutmen' && <Rekrutmen key={tab} {...props} />}
          {halaman === 'karyawan' && <Karyawan key={tab} {...props} />}
          {halaman === 'artifact' && <Artifact {...props} />}
          {halaman === 'keuangan' && <Keuangan key={tab} {...props} />}
          {halaman === 'notifikasi' && <Notifikasi {...props} onDibaca={cekNotif} />}
          {halaman === 'pengaturan' && <Pengaturan key={tab} {...props} />}
          {halaman === 'profile' && <Profile {...props} onKeluar={keluar} />}
        </main>
      </div>
    </div>
  );
}

// Menu yang belum dibangun ditulis "Segera" & nggak bisa diklik - bukan link ke halaman kosong (antislop R-24).
function Samping({ halaman, admin, notifBaru, buka }) {
  const link = (id, nama, ekstra) => (
    <a key={id} href={`#/${id}`} className={'adm-nav' + (halaman === id ? ' on' : '')} aria-current={halaman === id ? 'page' : undefined}>
      <span>{nama}</span>
      {ekstra}
    </a>
  );
  const segera = (nama, anak) => (
    <span key={nama} className={'adm-nav' + (anak ? ' anak' : '')} aria-disabled="true">
      <span>{nama}</span>
      <span className="adm-segera">Segera</span>
    </span>
  );
  return (
    <aside className={'adm-samping' + (buka ? ' buka' : '')} aria-label="Menu utama">
      <div className="adm-merek">
        <span className="adm-merek-kotak" aria-hidden="true">
          M
        </span>
        <div>
          Makalin Ops
          <small>Workspace internal</small>
        </div>
      </div>
      <nav>
        <div className="adm-nav-grup">
          {link('dashboard', 'Dashboard')}
          {link('leads', 'Leads')}
          {link('lapangan', 'Sales Lapangan')}
          <span className="adm-nav-produk" style={{ marginTop: 8 }}>
            HR
          </span>
          <a href="#/rekrutmen" className={'adm-nav anak' + (halaman === 'rekrutmen' ? ' on' : '')} aria-current={halaman === 'rekrutmen' ? 'page' : undefined}>
            <span>Rekrutmen</span>
          </a>
          <a href="#/karyawan" className={'adm-nav anak' + (halaman === 'karyawan' ? ' on' : '')} aria-current={halaman === 'karyawan' ? 'page' : undefined}>
            <span>Karyawan</span>
          </a>
          {link('keuangan', 'Keuangan')}
        </div>
        <div className="adm-nav-grup">
          {link('artifact', 'Artifact')}
          {segera('AI Chat')}
        </div>
        <div className="adm-nav-grup">
          {link('notifikasi', 'Notifikasi', notifBaru > 0 ? <span className="adm-hitung">{notifBaru > 99 ? '99+' : notifBaru}</span> : null)}
          {link('pengaturan', 'Pengaturan')}
          {link('profile', 'Profile')}
        </div>
      </nav>
      <a className="adm-akun" href="#/profile" style={{ textDecoration: 'none', color: 'inherit' }}>
        <span className="adm-inisial" aria-hidden="true">
          {admin.nama?.[0]?.toUpperCase()}
        </span>
        <div>
          <b>{admin.nama}</b>
          <span className="adm-redup">@{admin.username}</span>
        </div>
      </a>
    </aside>
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
      <form className="adm-kartu adm-masuk" onSubmit={kirim} style={{ boxShadow: '8px 8px 0 #000' }}>
        <div className="adm-kartu-kepala hitam">
          <div className="adm-merek">
            <span className="adm-merek-kotak" style={{ border: '2px solid #fff' }} aria-hidden="true">
              M
            </span>
            Makalin Ops
          </div>
        </div>
        {perluSetup === null ? (
          <p className="adm-sub">{salah || 'Memuat…'}</p>
        ) : (
          <>
            <p className="adm-sub" style={{ marginTop: 0 }}>
              {perluSetup
                ? 'Belum ada admin. Bikin akun admin pertama pakai kunci setup (ADMIN_KEY di .env server).'
                : 'Khusus tim internal. Masuk pakai akun adminmu.'}
            </p>
            {perluSetup && field('kunciSetup', 'Kunci setup', { type: 'password', autoComplete: 'off' })}
            {perluSetup && field('nama', 'Nama kamu')}
            {field('username', 'Username', { autoCapitalize: 'none', autoComplete: 'username', autoFocus: !perluSetup })}
            {field('password', perluSetup ? 'Password (min. 8 karakter)' : 'Password', {
              type: 'password',
              autoComplete: perluSetup ? 'new-password' : 'current-password',
            })}
            {(salah || error) && (
              <p className="adm-error" role="alert">
                {salah || error}
              </p>
            )}
            <button className="btn utama" style={{ width: '100%', marginTop: 18 }} type="submit" disabled={loading}>
              {loading ? 'Memproses…' : perluSetup ? 'Buat admin & masuk' : 'Masuk'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
