import { useCallback, useEffect, useState } from 'react';
import { tgl } from '../../lib/format.js';

// Akun demo buat sales: nggak bisa ganti kata sandi/nomor HP/PIN, nggak bisa lupa-password, nggak bisa langganan,
// lisensinya nggak pernah habis. Kata sandinya cuma bisa diganti dari sini.
export default function AkunDemo({ api }) {
  const [daftar, setDaftar] = useState(null);
  const [error, setError] = useState('');
  const [pesan, setPesan] = useState('');

  const muat = useCallback(async () => {
    try {
      setDaftar(await api('GET', '/akun-demo'));
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, [api]);

  useEffect(() => {
    let batal = false;
    api('GET', '/akun-demo')
      .then((d) => !batal && setDaftar(d))
      .catch((e) => !batal && setError(e.message));
    return () => {
      batal = true;
    };
  }, [api]);

  const aksi = async (fn, sukses) => {
    setError('');
    setPesan('');
    try {
      await fn();
      setPesan(sukses);
      await muat();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    }
  };

  return (
    <>
      <header className="adm-kepala">
        <div>
          <h2 className="adm-judul-tab">Akun demo</h2>
          <p className="adm-sub">
            Buat dipinjemin ke sales. Kata sandi, nomor HP &amp; PIN nggak bisa diubah dari aplikasi, nggak bisa langganan, dan nggak pernah
            habis masa aktifnya.
          </p>
        </div>
      </header>
      {error && <p className="adm-error">{error}</p>}
      {pesan && <p className="adm-ok">{pesan}</p>}

      <div className="adm-kolom">
        <section className="adm-kartu">
          <h2>Daftar akun demo</h2>
          {!daftar ? (
            <p className="adm-sub">Memuat…</p>
          ) : daftar.length === 0 ? (
            <p className="adm-sub">Belum ada. Bikin baru atau tandai akun yang udah ada.</p>
          ) : (
            <ul className="adm-daftar">
              {daftar.map((a) => (
                <BarisDemo
                  key={a.id}
                  a={a}
                  onGantiPassword={(password) => aksi(() => api('PATCH', `/akun-demo/${a.id}/password`, { password }), `Kata sandi @${a.username} diganti ✓`)}
                  onLepas={() => aksi(() => api('POST', '/akun-demo/tandai', { username: a.username, demo: false }), `@${a.username} udah bukan akun demo`)}
                />
              ))}
            </ul>
          )}
        </section>

        <div>
          <FormBuat onBuat={(isi) => aksi(() => api('POST', '/akun-demo', isi), `Akun demo @${isi.username} dibuat ✓`)} />
          <FormTandai onTandai={(username) => aksi(() => api('POST', '/akun-demo/tandai', { username }), `@${username} sekarang akun demo ✓`)} />
        </div>
      </div>
    </>
  );
}

function BarisDemo({ a, onGantiPassword, onLepas }) {
  const [buka, setBuka] = useState(false);
  const [pw, setPw] = useState('');
  const [yakin, setYakin] = useState(false);
  return (
    <li style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <b>{a.nama}</b> <span className="adm-redup">@{a.username}</span>
          <div className="adm-redup">
            Dibuat {tgl(a.created_at)} · {a.jumlah_barang} barang · terakhir dipakai {a.terakhir_dipakai ? tgl(a.terakhir_dipakai) : '-'}
          </div>
        </div>
        <div className="adm-tombol" style={{ marginTop: 0 }}>
          <button className="btn kecil" onClick={() => setBuka((v) => !v)}>
            Ganti kata sandi
          </button>
          {yakin ? (
            <>
              <button className="btn kecil bahaya" onClick={onLepas}>
                Ya, lepas
              </button>
              <button className="btn kecil" onClick={() => setYakin(false)}>
                Batal
              </button>
            </>
          ) : (
            <button className="btn kecil" onClick={() => setYakin(true)}>
              Lepas demo
            </button>
          )}
        </div>
      </div>
      {buka && (
        <form
          className="adm-cari"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await onGantiPassword(pw)) {
              setPw('');
              setBuka(false);
            }
          }}
        >
          <input value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Kata sandi baru (min. 6)" autoComplete="new-password" />
          <button className="btn kecil" type="submit" disabled={pw.length < 6}>
            Simpan
          </button>
        </form>
      )}
    </li>
  );
}

function FormBuat({ onBuat }) {
  const [isi, setIsi] = useState({ nama: 'Warung Demo', username: '', password: '' });
  const ubah = (k) => (e) => setIsi((x) => ({ ...x, [k]: e.target.value }));
  return (
    <form
      className="adm-kartu"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await onBuat(isi)) setIsi({ nama: 'Warung Demo', username: '', password: '' });
      }}
    >
      <h2>Bikin akun demo baru</h2>
      <div className="field">
        <label>Nama warung</label>
        <input value={isi.nama} onChange={ubah('nama')} />
      </div>
      <div className="field">
        <label>Username</label>
        <input value={isi.username} onChange={ubah('username')} placeholder="demosales1" autoCapitalize="none" />
      </div>
      <div className="field">
        <label>Kata sandi (min. 6)</label>
        <input value={isi.password} onChange={ubah('password')} autoComplete="new-password" />
      </div>
      <button className="btn utama" style={{ marginTop: 14 }} type="submit" disabled={!isi.nama.trim() || !isi.username.trim() || isi.password.length < 6}>
        Bikin akun demo
      </button>
    </form>
  );
}

function FormTandai({ onTandai }) {
  const [username, setUsername] = useState('');
  return (
    <form
      className="adm-kartu"
      style={{ marginTop: 16 }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (await onTandai(username.trim())) setUsername('');
      }}
    >
      <h2>Tandai akun yang udah ada</h2>
      <p className="adm-redup">Misal akun "demo" yang dari dulu dipinjemin ke sales - data & barangnya tetap.</p>
      <div className="adm-cari">
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username akunnya" autoCapitalize="none" />
        <button className="btn kecil" type="submit" disabled={!username.trim()}>
          Jadikan demo
        </button>
      </div>
    </form>
  );
}
