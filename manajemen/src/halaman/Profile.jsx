import { useState } from 'react';
import { waktu } from '../lib/format.js';
import { Gagal, Memuat, useData } from '../komponen/Ui.jsx';
import { NAMA_AKSI, ringkasDetail } from './Admin.jsx';

export default function Profile({ api, admin, onKeluar }) {
  const { data: daftar } = useData(api, '/admin');
  const { data: aktivitas, error, muat } = useData(api, '/saya/aktivitas');
  const saya = daftar?.find((a) => a.id === admin.id);

  return (
    <>
      <header className="adm-kepala">
        <div>
          <h1>Profile</h1>
          <p className="adm-sub">Akun kamu di Makalin Ops.</p>
        </div>
        <button className="btn" onClick={() => onKeluar()}>
          Keluar
        </button>
      </header>

      <div className="adm-kolom">
        <div>
          <section className="adm-kartu">
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <span className="adm-inisial" style={{ width: 64, height: 64, fontSize: 26 }} aria-hidden="true">
                {admin.nama?.[0]?.toUpperCase()}
              </span>
              <div>
                <h2 style={{ margin: 0, fontSize: 24 }}>{admin.nama}</h2>
                <div className="adm-redup">@{admin.username} · admin</div>
                <div className="adm-redup">Terakhir masuk {saya ? waktu(saya.terakhir_masuk) : '…'}</div>
              </div>
            </div>
          </section>
          <GantiPassword api={api} onKeluar={onKeluar} />
        </div>

        <section className="adm-kartu">
          <div className="adm-kartu-kepala">
            <h2>Aktivitas kamu</h2>
          </div>
          {error ? (
            <Gagal apa="aktivitas" pesan={error} onUlang={muat} />
          ) : !aktivitas ? (
            <Memuat apa="aktivitas" />
          ) : aktivitas.length === 0 ? (
            <p className="adm-redup" style={{ margin: 0 }}>
              Belum ada perubahan yang kamu bikin.
            </p>
          ) : (
            <ul className="adm-daftar">
              {aktivitas.map((l) => (
                <li key={l.id}>
                  <div>
                    <b>{NAMA_AKSI[l.aksi] || l.aksi}</b>
                    <div className="adm-redup">{ringkasDetail(l.detail)}</div>
                  </div>
                  <span className="adm-redup" style={{ whiteSpace: 'nowrap' }}>
                    {waktu(l.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function GantiPassword({ api, onKeluar }) {
  const [isi, setIsi] = useState({ passwordLama: '', passwordBaru: '' });
  const [error, setError] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const ubah = (k) => (e) => setIsi((x) => ({ ...x, [k]: e.target.value }));
  return (
    <form
      className="adm-kartu"
      style={{ marginTop: 20 }}
      onSubmit={async (e) => {
        e.preventDefault();
        setError('');
        setSibuk(true);
        try {
          await api('POST', '/saya/password', isi);
          // Sesi lama otomatis nggak berlaku setelah ganti password - langsung ke layar masuk.
          onKeluar('Password diganti. Masuk lagi pakai password baru.');
        } catch (err) {
          setError(err.message);
          setSibuk(false);
        }
      }}
    >
      <div className="adm-kartu-kepala">
        <h2>Ganti password</h2>
      </div>
      <div className="field" style={{ marginTop: 0 }}>
        <label htmlFor="pw-lama">Password lama</label>
        <input id="pw-lama" type="password" value={isi.passwordLama} onChange={ubah('passwordLama')} autoComplete="current-password" />
      </div>
      <div className="field">
        <label htmlFor="pw-baru">Password baru (min. 8 karakter)</label>
        <input id="pw-baru" type="password" value={isi.passwordBaru} onChange={ubah('passwordBaru')} autoComplete="new-password" />
      </div>
      {error && <p className="adm-error">{error}</p>}
      <button className="btn utama" style={{ marginTop: 16 }} type="submit" disabled={sibuk || !isi.passwordLama || isi.passwordBaru.length < 8}>
        {sibuk ? 'Menyimpan…' : 'Ganti password'}
      </button>
    </form>
  );
}
