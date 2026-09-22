import { Kosong, Tabs } from '../komponen/Ui.jsx';
import Admin from './Admin.jsx';
import AkunDemo from '../produk/warung-pintar/AkunDemo.jsx';
import { TemplateWa } from './RekrutmenBoard.jsx';

// Pengaturan: pengguna & tim (akun admin + aktivitas), template pesan WA ke kandidat rekrutmen (sama dengan yang di
// Rekrutmen -> Pengaturan), dan akun demo Warung Pintar buat sales.
const TABS = [
  { id: 'tim', nama: 'Pengguna & tim' },
  { id: 'template-wa', nama: 'Template pesan WA' },
  { id: 'demo', nama: 'Akun demo Warung Pintar' },
];

export default function Pengaturan({ api, apiProduk, admin, tab }) {
  const aktif = TABS.some((t) => t.id === tab) ? tab : 'tim';
  return (
    <>
      <header className="adm-kepala">
        <div>
          <h1>Pengaturan</h1>
          <p className="adm-sub">Siapa aja yang bisa masuk Makalin Ops, template pesan WA, dan akun demo yang dipinjemin ke sales.</p>
        </div>
      </header>
      <Tabs daftar={TABS} aktif={aktif} href={(id) => `#/pengaturan/${id}`} />
      {aktif === 'tim' && <Admin api={api} admin={admin} />}
      {aktif === 'template-wa' && (
        <>
          <p className="adm-sub" style={{ marginTop: 0 }}>
            Pesan WA ke kandidat Sales Partner. Materi &amp; soal kuis ada di <a href="#/rekrutmen/kuis">Rekrutmen → Pengaturan</a>.
          </p>
          <TemplateWa api={api} />
        </>
      )}
      {aktif === 'demo' &&
        (apiProduk ? (
          <AkunDemo api={apiProduk} />
        ) : (
          <Kosong judul="Warung Pintar belum disambungin">Isi WARUNG_PINTAR_DATABASE_URL di .env server manajemen.</Kosong>
        ))}
    </>
  );
}
