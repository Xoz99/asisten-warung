import { useCallback, useEffect, useState } from 'react';

// Akun admin manajemen (tiap orang punya akun sendiri) + catatan siapa ngapain.
const waktu = (t) => (t ? new Date(t).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-');
export const NAMA_AKSI = {
  'admin.setup': 'bikin admin pertama',
  'admin.tambah': 'nambah admin',
  'admin.aktifkan': 'ngaktifin admin',
  'admin.nonaktifkan': 'nonaktifin admin',
  'admin.reset_password': 'reset password admin',
  'admin.ganti_password_sendiri': 'ganti password sendiri',
  'warung-pintar.sales.tambah': 'nambah sales',
  'warung-pintar.sales.ubah': 'ubah sales',
  'warung-pintar.warung.ganti_sales': 'ganti sales warung',
  'warung-pintar.demo.buat': 'bikin akun demo',
  'warung-pintar.demo.tandai': 'jadiin akun demo',
  'warung-pintar.demo.lepas': 'lepas akun demo',
  'warung-pintar.demo.ganti_password': 'ganti kata sandi akun demo',
  'ops.lead.tambah': 'nambah lead CRM',
  'ops.lead.ubah': 'ubah lead CRM',
  'ops.lead.hapus': 'hapus lead CRM',
  'ops.lead.massal': 'ubah lead CRM sekaligus',
  'ops.lead.impor': 'impor lead CRM dari CSV',
  'ops.keuangan.catat': 'catat transaksi',
  'rekrutmen.lamaran.tambah': 'nambah kandidat',
  'rekrutmen.lamaran.maju': 'majuin tahap kandidat',
  'rekrutmen.attempt': 'catat hasil tes kandidat',
  'rekrutmen.keputusan_hiring': 'keputusan hiring',
  'rekrutmen.lamaran.keluar': 'keluarin kandidat',
  'rekrutmen.lamaran.ulang': 'lamaran ulang kandidat',
  'rekrutmen.kampanye.tambah': 'bikin kampanye rekrutmen',
  'rekrutmen.titik.tambah': 'nambah titik sebar',
  'rekrutmen.titik.status': 'ubah status posting',
  'admin.ubah_peran': 'ganti peran akun',
  'komisi.tutup': 'nutup bulan bagi hasil',
  'komisi.cairkan': 'nyairin bagi hasil sales',
  'komisi.konfirmasi_masuk': 'bilang bagi hasilnya udah masuk',
  'komisi.lapor_belum_masuk': 'lapor bagi hasilnya BELUM masuk',
  'tim.sales.tambah': 'nambah sales (akun + kode + data karyawan)',
  'tim.sales.ubah': 'ubah profil sales',
  'tim.sales.cek_rekening': 'ngecek rekening sales',
  'tim.profil.ubah': 'ubah profil sendiri (sales)',
  'admin.hubung_sales': 'nyambungin akun ke kode sales',
  'lapangan.keberatan.tambah': 'nambah keberatan di bank',
  'lapangan.keberatan.ubah': 'ubah keberatan di bank',
  'lapangan.log.tambah': 'nyatet kunjungan lapangan',
  'lapangan.log.ubah': 'ubah log kunjungan',
  'lapangan.log.hapus': 'hapus log kunjungan',
  'hr.karyawan.tambah': 'nambah karyawan',
  'hr.karyawan.ubah': 'ubah data karyawan',
  'hr.karyawan.status': 'ubah status karyawan',
  'hr.kehadiran.simpan': 'nyatet kehadiran',
  'hr.cuti.ajukan': 'nyatet pengajuan cuti',
  'hr.cuti.putus': 'mutusin pengajuan cuti',
  'hr.payroll.draf': 'bikin draf payroll',
  'hr.payroll.ubah': 'ubah potongan payroll',
  'hr.payroll.dibayar': 'nandain gaji dibayar',
  'artifact.folder.tambah': 'bikin folder artifact',
  'artifact.folder.ubah': 'ganti nama folder artifact',
  'artifact.folder.hapus': 'hapus folder artifact',
  'artifact.catatan.tambah': 'bikin catatan',
  'artifact.unggah': 'unggah file artifact',
  'artifact.versi.tambah': 'unggah versi baru artifact',
  'artifact.versi.pulihkan': 'mulihin versi lama artifact',
  'artifact.ubah': 'ubah artifact',
  'artifact.sampah': 'buang artifact ke sampah',
  'artifact.pulih': 'mulihin artifact dari sampah',
  'artifact.hapus': 'hapus permanen artifact',
  'artifact.sampah.kosongkan': 'ngosongin sampah artifact',
  'artifact.unduh': 'unduh file artifact',
  'ops.keuangan.hapus': 'hapus transaksi',
};
export const ringkasDetail = (d) =>
  d
    ? Object.entries(d)
        .map(([k, v]) => `${k}: ${v === null ? '-' : v}`)
        .join(' · ')
    : '';

export default function Admin({ api, admin }) {
  const [daftar, setDaftar] = useState(null);
  // Daftar kode sales Warung Pintar, buat nyambungin akun sales Makalin (tab "Toko saya" di Sales Lapangan).
  const [wpSales, setWpSales] = useState(null);
  useEffect(() => {
    api('GET', '/lapangan/wp-sales').then(setWpSales, () => setWpSales([]));
  }, [api]);
  const [log, setLog] = useState(null);
  const [error, setError] = useState('');
  const [pesan, setPesan] = useState('');

  const muat = useCallback(async () => {
    try {
      const [a, l] = await Promise.all([api('GET', '/admin'), api('GET', '/log')]);
      setDaftar(a);
      setLog(l);
    } catch (e) {
      setError(e.message);
    }
  }, [api]);

  useEffect(() => {
    let batal = false;
    Promise.all([api('GET', '/admin'), api('GET', '/log')])
      .then(([a, l]) => !batal && (setDaftar(a), setLog(l)))
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
          <h2 className="adm-judul-tab">Pengguna &amp; tim</h2>
          <p className="adm-sub">Tiap orang punya akun sendiri, jadi ketauan siapa ngapain. Ganti password kamu sendiri di Profile.</p>
        </div>
      </header>
      {error && <p className="adm-error">{error}</p>}
      {pesan && <p className="adm-ok">{pesan}</p>}

      <div className="adm-kolom">
        <section className="adm-kartu">
          <h2>Akun</h2>
          <p className="adm-redup" style={{ marginTop: 0 }}>
            Admin bisa buka semua halaman. Sales cuma bisa buka Sales Lapangan &amp; profilnya sendiri.
          </p>
          <p className="adm-redup" style={{ marginTop: 0 }}>
            Mau nambah sales? Pakai <a href="#/lapangan/tim">Sales Lapangan → Tim sales</a> biar akun, kode referral, data karyawan, dan rekening pencairannya kebikin sekalian.
          </p>
          {!daftar ? (
            <p className="adm-sub">Memuat…</p>
          ) : (
            <ul className="adm-daftar">
              {daftar.map((a) => (
                <BarisAdmin
                  key={a.id}
                  a={a}
                  diriSendiri={a.id === admin?.id}
                  onAktif={(aktif) => aksi(() => api('PATCH', '/admin/' + a.id, { aktif }), `${a.nama} ${aktif ? 'diaktifin' : 'dinonaktifin'}`)}
                  onReset={(password) => aksi(() => api('PATCH', '/admin/' + a.id, { password }), `Password ${a.nama} direset ✓`)}
                  onPeran={(peran) => aksi(() => api('PATCH', '/admin/' + a.id, { peran }), `${a.nama} sekarang ${peran}. Dia perlu masuk ulang.`)}
                  wpSales={wpSales}
                  onHubung={(wp_sales_id) => aksi(() => api('PATCH', '/admin/' + a.id, { wp_sales_id }), wp_sales_id ? `${a.nama} dihubungin ke kode sales.` : `${a.nama} dilepas dari kode sales.`)}
                />
              ))}
            </ul>
          )}
          <FormTambah onTambah={(isi) => aksi(() => api('POST', '/admin', isi), `Akun ${isi.peran} ${isi.nama} ditambah ✓ - kasih tau username & password-nya`)} />
        </section>

        <section className="adm-kartu">
          <h2>Aktivitas terbaru</h2>
          {!log ? (
            <p className="adm-sub">Memuat…</p>
          ) : log.length === 0 ? (
            <p className="adm-sub">Belum ada aktivitas.</p>
          ) : (
            <ul className="adm-daftar">
              {log.map((l) => (
                <li key={l.id}>
                  <div>
                    <b>{l.admin_nama || '(admin dihapus)'}</b> {NAMA_AKSI[l.aksi] || l.aksi}
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

function BarisAdmin({ a, diriSendiri, onAktif, onReset, onPeran, wpSales, onHubung }) {
  const [reset, setReset] = useState(false);
  const [pw, setPw] = useState('');
  return (
    <li style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <b style={a.aktif ? undefined : { color: 'var(--abu)' }}>{a.nama}</b> <span className="adm-redup">@{a.username}</span>
          <span className={`adm-chip ${a.peran === 'sales' ? 'kuning' : ''}`} style={{ marginLeft: 6 }}>
            {a.peran === 'sales' ? 'Sales' : 'Admin'}
          </span>
          {diriSendiri && <span className="adm-lencana" style={{ marginLeft: 6 }}>kamu</span>}
          <div className="adm-redup">
            {a.aktif ? 'Aktif' : 'Nonaktif'} · terakhir masuk {waktu(a.terakhir_masuk)}
          </div>
        </div>
        {!diriSendiri && (
          <div className="adm-tombol" style={{ marginTop: 0 }}>
            <button className="btn kecil" onClick={() => setReset((v) => !v)}>
              Reset password
            </button>
            <button className="btn kecil" onClick={() => window.confirm(`Jadiin ${a.nama} ${a.peran === 'sales' ? 'admin (bisa buka semua halaman)' : 'sales (cuma Sales Lapangan)'}?`) && onPeran(a.peran === 'sales' ? 'admin' : 'sales')}>
              Jadiin {a.peran === 'sales' ? 'admin' : 'sales'}
            </button>
            <button className="btn kecil" onClick={() => onAktif(!a.aktif)}>
              {a.aktif ? 'Nonaktifkan' : 'Aktifkan'}
            </button>
          </div>
        )}
      </div>
      {a.peran === 'sales' && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
          <label className="adm-redup" htmlFor={`wp-${a.id}`}>
            Kode sales Warung Pintar
          </label>
          <select id={`wp-${a.id}`} value={a.wp_sales_id || ''} onChange={(e) => onHubung(e.target.value || null)}>
            <option value="">Belum dihubungin</option>
            {(wpSales || []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.kode} · {s.nama}
                {s.aktif ? '' : ' (nonaktif)'}
              </option>
            ))}
          </select>
        </div>
      )}
      {reset && (
        <form
          className="adm-cari"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await onReset(pw)) {
              setPw('');
              setReset(false);
            }
          }}
        >
          <input value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password baru (min. 8)" autoComplete="new-password" />
          <button className="btn kecil" type="submit" disabled={pw.length < 8}>
            Simpan
          </button>
        </form>
      )}
    </li>
  );
}

function FormTambah({ onTambah }) {
  const kosong = { nama: '', username: '', password: '', peran: 'sales' };
  const [isi, setIsi] = useState(kosong);
  const ubah = (k) => (e) => setIsi((x) => ({ ...x, [k]: e.target.value }));
  return (
    <form
      className="adm-tambah"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await onTambah(isi)) setIsi(kosong);
      }}
    >
      <h3>Tambah akun</h3>
      <div className="adm-baris">
        <div className="field">
          <label>Nama</label>
          <input value={isi.nama} onChange={ubah('nama')} placeholder="Nama temenmu" />
        </div>
        <div className="field">
          <label>Username</label>
          <input value={isi.username} onChange={ubah('username')} placeholder="huruf kecil" autoCapitalize="none" />
        </div>
        <div className="field">
          <label>Password (min. 8)</label>
          <input value={isi.password} onChange={ubah('password')} autoComplete="new-password" />
        </div>
        <div className="field">
          <label htmlFor="t-peran">Peran</label>
          <select id="t-peran" value={isi.peran} onChange={ubah('peran')} style={{ maxWidth: 'none', width: '100%', minHeight: 44 }}>
            <option value="sales">Sales (cuma Sales Lapangan)</option>
            <option value="admin">Admin (semua halaman)</option>
          </select>
        </div>
      </div>
      <button className="btn utama" style={{ marginTop: 12 }} type="submit" disabled={!isi.nama.trim() || isi.username.trim().length < 3 || isi.password.length < 8}>
        Tambah {isi.peran === 'sales' ? 'sales' : 'admin'}
      </button>
    </form>
  );
}
