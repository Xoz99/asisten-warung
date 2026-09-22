import { useEffect, useState } from 'react';
import { waktu } from '../lib/format.js';
import { keWebp } from '../lib/gambar.js';
import FotoProfil from '../komponen/FotoProfil.jsx';
import { NAMA_AKSI, ringkasDetail } from './Admin.jsx';

const hpTampil = (v) => (v ? String(v).replace(/^62/, '0') : '');
const tanggal = (t) => (t ? new Date(t).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-');

// Profile akun yang lagi login: foto, data akun, keamanan, dan aktivitas sendiri.
export default function Profile({ api, admin, onKeluar, onProfil }) {
  const [profil, setProfil] = useState(null);
  const [error, setError] = useState('');
  const [pesan, setPesan] = useState('');
  const [versiFoto, setVersiFoto] = useState(0);
  const [sibukFoto, setSibukFoto] = useState(false);

  useEffect(() => {
    api('GET', '/saya/profil').then(setProfil, (e) => setError(e.message));
  }, [api]);
  useEffect(() => {
    if (!pesan) return;
    const t = setTimeout(() => setPesan(''), 4000);
    return () => clearTimeout(t);
  }, [pesan]);

  const perbarui = (p) => {
    setProfil(p);
    onProfil?.(p);
  };
  async function gantiFoto(file) {
    setSibukFoto(true);
    try {
      await api('PUT', '/saya/foto', { foto: await keWebp(file, 512, 0.85) });
      setVersiFoto((v) => v + 1);
      perbarui({ ...profil, ada_foto: true, versiFoto: Date.now() });
      setPesan('Foto profil diganti.');
    } catch (e) {
      setPesan('Gagal ganti foto: ' + e.message);
    } finally {
      setSibukFoto(false);
    }
  }
  async function hapusFoto() {
    setSibukFoto(true);
    try {
      await api('DELETE', '/saya/foto');
      perbarui({ ...profil, ada_foto: false, versiFoto: Date.now() });
      setPesan('Foto profil dihapus.');
    } catch (e) {
      setPesan('Gagal hapus foto: ' + e.message);
    } finally {
      setSibukFoto(false);
    }
  }

  const p = profil || { nama: admin.nama, username: admin.username, peran: admin.peran };
  return (
    <>
      <h1 className="sr-only">Profile</h1>
      {error && <p className="adm-error">{error}</p>}

      <section className="adm-kartu pf-hero">
        <div className="pf-foto">
          <FotoProfil src="/api/saya/foto" ada={profil?.ada_foto} nama={p.nama} ukuran={104} versi={versiFoto} />
          <div className="pf-foto-tombol">
            <label className={'btn kecil' + (sibukFoto ? ' mati' : '')}>
              {sibukFoto ? 'Nyimpen…' : profil?.ada_foto ? 'Ganti foto' : 'Pasang foto'}
              <input
                type="file"
                accept="image/*"
                hidden
                disabled={sibukFoto}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) gantiFoto(f);
                }}
              />
            </label>
            {profil?.ada_foto && (
              <button className="btn kecil" onClick={hapusFoto} disabled={sibukFoto}>
                Hapus
              </button>
            )}
          </div>
        </div>
        <div className="pf-identitas">
          <div className="pf-nama">
            <h2>{p.nama}</h2>
            <span className="adm-chip">{p.peran === 'sales' ? 'Sales' : 'Admin'}</span>
          </div>
          <p className="adm-redup">@{p.username}</p>
          <dl className="pf-info">
            <div>
              <dt>Bergabung</dt>
              <dd>{profil ? tanggal(profil.created_at) : '…'}</dd>
            </div>
            <div>
              <dt>Terakhir masuk</dt>
              <dd>{profil ? (profil.terakhir_masuk ? waktu(profil.terakhir_masuk) : '-') : '…'}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{profil?.email || <span className="adm-redup">Belum diisi</span>}</dd>
            </div>
          </dl>
        </div>
        <button className="btn pf-keluar" onClick={() => onKeluar()}>
          Keluar
        </button>
      </section>
      {pesan && (
        <p className={pesan.startsWith('Gagal') ? 'adm-error' : 'adm-ok'} role="status">
          {pesan}
        </p>
      )}

      <div className="pf-grid">
        <div className="pf-kiri">
          {profil && <DataAkun api={api} profil={profil} onSimpan={(x) => (perbarui({ ...profil, ...x }), setPesan('Data akun disimpan.'))} />}
          <Keamanan api={api} onKeluar={onKeluar} />
        </div>
        <Aktivitas api={api} />
      </div>
    </>
  );
}

function DataAkun({ api, profil, onSimpan }) {
  const awal = { nama: profil.nama || '', email: profil.email || '', no_hp: hpTampil(profil.no_hp) };
  const [isi, setIsi] = useState(awal);
  const [error, setError] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const ubah = (k) => (e) => setIsi((x) => ({ ...x, [k]: e.target.value }));
  const berubah = Object.keys(awal).some((k) => isi[k].trim() !== awal[k]);
  return (
    <form
      className="adm-kartu"
      onSubmit={async (e) => {
        e.preventDefault();
        setError('');
        setSibuk(true);
        try {
          const r = await api('PATCH', '/saya/profil', { nama: isi.nama.trim(), email: isi.email.trim(), no_hp: isi.no_hp.trim() });
          setIsi({ nama: r.nama || '', email: r.email || '', no_hp: hpTampil(r.no_hp) });
          onSimpan(r);
        } catch (err) {
          setError(err.message);
        } finally {
          setSibuk(false);
        }
      }}
    >
      <div className="adm-kartu-kepala">
        <h2>Data akun</h2>
      </div>
      <div className="pf-field-grid">
        <div className="field" style={{ marginTop: 0 }}>
          <label htmlFor="pf-nama">Nama tampilan</label>
          <input id="pf-nama" value={isi.nama} maxLength={60} onChange={ubah('nama')} autoComplete="name" />
        </div>
        <div className="field" style={{ marginTop: 0 }}>
          <label htmlFor="pf-username">Username</label>
          <input id="pf-username" value={'@' + profil.username} disabled />
          <small className="adm-redup">Username dipakai buat masuk, nggak bisa diganti.</small>
        </div>
        <div className="field">
          <label htmlFor="pf-email">Email</label>
          <input id="pf-email" type="email" value={isi.email} maxLength={120} onChange={ubah('email')} autoComplete="email" placeholder="nama@contoh.com" />
        </div>
        <div className="field">
          <label htmlFor="pf-hp">No. HP / WhatsApp</label>
          <input id="pf-hp" type="tel" inputMode="tel" value={isi.no_hp} maxLength={20} onChange={ubah('no_hp')} autoComplete="tel" placeholder="08…" />
        </div>
      </div>
      {error && <p className="adm-error">{error}</p>}
      <div className="adm-tombol">
        <button className="btn utama" type="submit" disabled={sibuk || !berubah || !isi.nama.trim()}>
          {sibuk ? 'Menyimpan…' : 'Simpan perubahan'}
        </button>
        {berubah && (
          <button type="button" className="btn" onClick={() => (setIsi(awal), setError(''))} disabled={sibuk}>
            Batal
          </button>
        )}
      </div>
    </form>
  );
}

function Keamanan({ api, onKeluar }) {
  const [buka, setBuka] = useState(false);
  const [isi, setIsi] = useState({ passwordLama: '', passwordBaru: '', ulang: '' });
  const [lihat, setLihat] = useState(false);
  const [error, setError] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const ubah = (k) => (e) => setIsi((x) => ({ ...x, [k]: e.target.value }));
  const beda = isi.ulang && isi.ulang !== isi.passwordBaru;
  return (
    <section className="adm-kartu pf-keamanan">
      <button type="button" className="pf-lipat" onClick={() => setBuka((b) => !b)} aria-expanded={buka} aria-controls="pf-password">
        <span>
          <b>Ganti password</b>
          <small className="adm-redup">Habis diganti, semua perangkat otomatis keluar.</small>
        </span>
        <span className={'pf-panah' + (buka ? ' buka' : '')} aria-hidden="true">
          ▾
        </span>
      </button>
      <div id="pf-password" className={'pf-lipat-isi' + (buka ? ' buka' : '')}>
        <div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError('');
              setSibuk(true);
              try {
                await api('POST', '/saya/password', { passwordLama: isi.passwordLama, passwordBaru: isi.passwordBaru });
                // Sesi lama otomatis nggak berlaku setelah ganti password - langsung ke layar masuk.
                onKeluar('Password diganti. Masuk lagi pakai password baru.');
              } catch (err) {
                setError(err.message);
                setSibuk(false);
              }
            }}
          >
            <div className="field">
              <label htmlFor="pw-lama">Password lama</label>
              <input id="pw-lama" type={lihat ? 'text' : 'password'} value={isi.passwordLama} onChange={ubah('passwordLama')} autoComplete="current-password" tabIndex={buka ? 0 : -1} />
            </div>
            <div className="field">
              <label htmlFor="pw-baru">Password baru (min. 8 karakter)</label>
              <input id="pw-baru" type={lihat ? 'text' : 'password'} value={isi.passwordBaru} onChange={ubah('passwordBaru')} autoComplete="new-password" tabIndex={buka ? 0 : -1} />
            </div>
            <div className="field">
              <label htmlFor="pw-ulang">Ulangi password baru</label>
              <input id="pw-ulang" type={lihat ? 'text' : 'password'} value={isi.ulang} onChange={ubah('ulang')} autoComplete="new-password" tabIndex={buka ? 0 : -1} />
              {beda && <small className="adm-error" style={{ margin: 0 }}>Password baru belum sama.</small>}
            </div>
            <label className="pf-cek">
              <input type="checkbox" checked={lihat} onChange={(e) => setLihat(e.target.checked)} tabIndex={buka ? 0 : -1} /> Tampilkan password
            </label>
            {error && <p className="adm-error">{error}</p>}
            <button
              className="btn utama"
              style={{ marginTop: 14 }}
              type="submit"
              tabIndex={buka ? 0 : -1}
              disabled={sibuk || !isi.passwordLama || isi.passwordBaru.length < 8 || isi.ulang !== isi.passwordBaru}
            >
              {sibuk ? 'Menyimpan…' : 'Ganti password'}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

function Aktivitas({ api }) {
  const [halaman, setHalaman] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let batal = false;
    api('GET', `/saya/aktivitas?halaman=${halaman}`)
      .then((d) => !batal && (setData(d), setError('')))
      .catch((e) => !batal && setError(e.message));
    return () => {
      batal = true;
    };
  }, [api, halaman]);
  const jumlahHalaman = data ? Math.max(1, Math.ceil(data.total / data.perHalaman)) : 1;
  return (
    <section className="adm-kartu" style={{ padding: 0, alignSelf: 'start' }}>
      <div className="pf-akt-kepala">
        <h2>Aktivitas kamu</h2>
        {data && <span className="adm-redup">{data.total} total</span>}
      </div>
      <div style={{ padding: '0 18px 8px' }}>
        {error ? (
          <p className="adm-error">{error}</p>
        ) : !data ? (
          <p className="adm-redup">Memuat…</p>
        ) : data.items.length === 0 ? (
          <p className="adm-redup">Belum ada perubahan yang kamu bikin.</p>
        ) : (
          <ul className="adm-daftar">
            {data.items.map((l) => (
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
      </div>
      {data && data.total > data.perHalaman && (
        <div className="adm-halaman">
          <span className="adm-label" style={{ fontSize: 11 }}>
            Halaman {data.halaman} dari {jumlahHalaman}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn kecil" onClick={() => setHalaman((h) => Math.max(1, h - 1))} disabled={halaman <= 1}>
              ‹ Baru
            </button>
            <button className="btn kecil" onClick={() => setHalaman((h) => Math.min(jumlahHalaman, h + 1))} disabled={halaman >= jumlahHalaman}>
              Lama ›
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
