import { Kosong, Tabs } from '../komponen/Ui.jsx';
import Admin from './Admin.jsx';
import AkunDemo from '../produk/warung-pintar/AkunDemo.jsx';

// Pengaturan: pengguna & tim (akun admin + aktivitas) dan akun demo Warung Pintar buat sales.
const TABS = [
  { id: 'tim', nama: 'Pengguna & tim' },
  { id: 'demo', nama: 'Akun demo Warung Pintar' },
];

export default function Pengaturan({ api, apiProduk, admin, tab }) {
  const aktif = TABS.some((t) => t.id === tab) ? tab : 'tim';
  return (
    <>
      <header className="adm-kepala">
        <div>
          <h1>Pengaturan</h1>
          <p className="adm-sub">Siapa aja yang bisa masuk Makalin Ops, dan akun demo yang dipinjemin ke sales.</p>
        </div>
      </header>
      <Tabs daftar={TABS} aktif={aktif} href={(id) => `#/pengaturan/${id}`} />
      {aktif === 'tim' && <Admin api={api} admin={admin} />}
      {aktif === 'demo' &&
        (apiProduk ? (
          <AkunDemo api={apiProduk} />
        ) : (
          <Kosong judul="Warung Pintar belum disambungin">Isi WARUNG_PINTAR_DATABASE_URL di .env server manajemen.</Kosong>
        ))}
    </>
  );
}
