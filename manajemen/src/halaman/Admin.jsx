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
  'admin.profil.ubah': 'ubah profil sendiri',
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
  'rekrutmen.titik.ubah': 'ubah titik sebar',
  'rekrutmen.kampanye.ubah': 'ubah kampanye',
  'rekrutmen.kampanye.biaya': 'nambah biaya kampanye',
  'rekrutmen.kampanye.hapus': 'hapus kampanye',
  'rekrutmen.titik.hapus': 'hapus titik sebar',
  'rekrutmen.titik.status': 'ubah status posting',
  'rekrutmen.template.ubah': 'ubah template WA rekrutmen',
  'rekrutmen.slot.tambah': 'nambah slot interview',
  'admin.ubah_peran': 'ganti peran akun',
  'admin.ubah_jabatan': 'ganti jabatan akun',
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
  'hr.karyawan.foto': 'ganti foto karyawan',
  'wp.katalog.tambah': 'nambah barang katalog',
  'wp.katalog.ubah': 'ubah barang katalog',
  'wp.katalog.status': 'ubah status barang katalog',
  'wp.katalog.hapus': 'hapus draf katalog',
  'wp.katalog.impor': 'impor CSV katalog',
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
  const [versiLog, setVersiLog] = useState(0);
  const [error, setError] = useState('');
  const [pesan, setPesan] = useState('');

  const muat = useCallback(async () => {
    try {
      setDaftar(await api('GET', '/admin'));
      setVersiLog((v) => v + 1);
    } catch (e) {
      setError(e.message);
    }
  }, [api]);

  useEffect(() => {
    let batal = false;
    api('GET', '/admin')
      .then((a) => !batal && setDaftar(a))
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

  const baris = (a) => (
    <BarisAdmin
      key={a.id}
      a={a}
      diriSendiri={a.id === admin?.id}
      onAktif={(aktif) => aksi(() => api('PATCH', '/admin/' + a.id, { aktif }), `${a.nama} ${aktif ? 'diaktifin' : 'dinonaktifin'}`)}
      onReset={(password) => aksi(() => api('PATCH', '/admin/' + a.id, { password }), `Password ${a.nama} direset ✓`)}
      onJabatan={(jabatan) => aksi(() => api('PATCH', '/admin/' + a.id, { jabatan }), jabatan ? `Jabatan ${a.nama}: ${jabatan}` : `Jabatan ${a.nama} dikosongin`)}
      onPeran={(peran) => aksi(() => api('PATCH', '/admin/' + a.id, { peran }), `${a.nama} sekarang ${peran}. Dia perlu masuk ulang.`)}
      wpSales={wpSales}
      onHubung={(wp_sales_id) => aksi(() => api('PATCH', '/admin/' + a.id, { wp_sales_id }), wp_sales_id ? `${a.nama} dihubungin ke kode sales.` : `${a.nama} dilepas dari kode sales.`)}
    />
  );
  // Aktif dulu, baru yang nonaktif; di dalamnya urut nama.
  const urut = (xs) => [...xs].sort((a, b) => Number(b.aktif) - Number(a.aktif) || a.nama.localeCompare(b.nama, 'id'));
  const daftarAdmin = daftar ? urut(daftar.filter((a) => a.peran !== 'sales')) : null;
  const daftarSales = daftar ? urut(daftar.filter((a) => a.peran === 'sales')) : null;

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          <section className="adm-kartu">
            <div className="adm-kartu-kepala" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
              <h2 style={{ margin: 0 }}>Admin &amp; pimpinan</h2>
              {daftarAdmin && <span className="adm-redup">{daftarAdmin.filter((a) => a.aktif).length} aktif</span>}
            </div>
            <p className="adm-redup" style={{ marginTop: 0 }}>
              Bisa buka semua halaman Makalin. Jabatan (mis. Direktur Utama) cuma label, hak aksesnya sama.
            </p>
            {!daftarAdmin ? <p className="adm-sub">Memuat…</p> : <ul className="adm-daftar">{daftarAdmin.map(baris)}</ul>}
            <FormTambah peran="admin" onTambah={(isi) => aksi(() => api('POST', '/admin', isi), `Admin ${isi.nama} ditambah ✓ - kasih tau username & password-nya`)} />
          </section>

          <section className="adm-kartu">
            <div className="adm-kartu-kepala" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
              <h2 style={{ margin: 0 }}>Sales lapangan</h2>
              {daftarSales && <span className="adm-redup">{daftarSales.filter((a) => a.aktif).length} aktif</span>}
            </div>
            <p className="adm-redup" style={{ marginTop: 0 }}>
              Cuma bisa buka Sales Lapangan &amp; profilnya sendiri. Data karyawan, kode referral, dan rekening pencairannya diatur di Tim sales.
            </p>
            {!daftarSales ? (
              <p className="adm-sub">Memuat…</p>
            ) : daftarSales.length === 0 ? (
              <p className="adm-redup">Belum ada akun sales.</p>
            ) : (
              <ul className="adm-daftar">{daftarSales.map(baris)}</ul>
            )}
            <a className="btn utama" href="#/lapangan/tim" style={{ marginTop: 12 }}>
              + Tambah sales di Tim sales
            </a>
          </section>
        </div>

        <Aktivitas api={api} versi={versiLog} />
      </div>
    </>
  );
}

// Catatan siapa ngapain, 20 per halaman.
function Aktivitas({ api, versi }) {
  const [halaman, setHalaman] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let batal = false;
    api('GET', `/log?halaman=${halaman}`)
      .then((d) => !batal && (setData(d), setError('')))
      .catch((e) => !batal && setError(e.message));
    return () => {
      batal = true;
    };
  }, [api, halaman, versi]);
  const jumlahHalaman = data ? Math.max(1, Math.ceil(data.total / data.perHalaman)) : 1;
  const ke = (n) => setHalaman(Math.max(1, Math.min(jumlahHalaman, n)));
  return (
    <section className="adm-kartu" style={{ padding: 0 }}>
      <h2 style={{ margin: 0, padding: '18px 18px 0' }}>Aktivitas terbaru</h2>
      <div style={{ padding: '0 18px 12px' }}>
        {error ? (
          <p className="adm-error">{error}</p>
        ) : !data ? (
          <p className="adm-sub">Memuat…</p>
        ) : data.items.length === 0 ? (
          <p className="adm-sub">Belum ada aktivitas.</p>
        ) : (
          <ul className="adm-daftar">
            {data.items.map((l) => (
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
      </div>
      {data && data.total > data.perHalaman && (
        <div className="adm-halaman">
          <span className="adm-label" style={{ fontSize: 11 }}>
            Menampilkan {(data.halaman - 1) * data.perHalaman + 1}-{Math.min(data.total, data.halaman * data.perHalaman)} dari {data.total} aktivitas
          </span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="btn kecil" onClick={() => ke(halaman - 1)} disabled={halaman <= 1} aria-label="Halaman sebelumnya">
              ‹
            </button>
            {Array.from({ length: jumlahHalaman }, (_, i) => i + 1)
              .filter((n) => n === 1 || n === jumlahHalaman || Math.abs(n - halaman) <= 1)
              .map((n, i, arr) => (
                <span key={n} style={{ display: 'contents' }}>
                  {i > 0 && n - arr[i - 1] > 1 && (
                    <span className="adm-redup" style={{ alignSelf: 'center' }} aria-hidden="true">
                      …
                    </span>
                  )}
                  <button className={'btn kecil' + (n === halaman ? ' utama' : '')} onClick={() => ke(n)} aria-current={n === halaman ? 'page' : undefined}>
                    {n}
                  </button>
                </span>
              ))}
            <button className="btn kecil" onClick={() => ke(halaman + 1)} disabled={halaman >= jumlahHalaman} aria-label="Halaman berikutnya">
              ›
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function BarisAdmin({ a, diriSendiri, onAktif, onReset, onPeran, onJabatan, wpSales, onHubung }) {
  const [reset, setReset] = useState(false);
  const [pw, setPw] = useState('');
  return (
    <li style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <b style={a.aktif ? undefined : { color: 'var(--abu)' }}>{a.nama}</b> <span className="adm-redup">@{a.username}</span>
          <span className={`adm-chip ${a.peran === 'sales' ? 'kuning' : ''}`} style={{ marginLeft: 6 }}>
            {a.jabatan || (a.peran === 'sales' ? 'Sales' : 'Admin')}
          </span>
          {diriSendiri && <span className="adm-lencana" style={{ marginLeft: 6 }}>kamu</span>}
          <div className="adm-redup">
            {a.aktif ? 'Aktif' : 'Nonaktif'} · terakhir masuk {waktu(a.terakhir_masuk)}
          </div>
        </div>
        <div className="adm-tombol" style={{ marginTop: 0 }}>
          <button
            className="btn kecil"
            onClick={() => {
              const j = window.prompt(`Jabatan ${a.nama} (mis. Dirut). Kosongin buat balik ke "${a.peran === 'sales' ? 'Sales' : 'Admin'}".`, a.jabatan || '');
              if (j !== null) onJabatan(j.trim());
            }}
          >
            Jabatan
          </button>
          {!diriSendiri && (
            <>
              <button className="btn kecil" onClick={() => setReset((v) => !v)}>
                Reset password
              </button>
              <button className="btn kecil" onClick={() => window.confirm(`Jadiin ${a.nama} ${a.peran === 'sales' ? 'admin (bisa buka semua halaman)' : 'sales (cuma Sales Lapangan)'}?`) && onPeran(a.peran === 'sales' ? 'admin' : 'sales')}>
                Jadiin {a.peran === 'sales' ? 'admin' : 'sales'}
              </button>
              <button className="btn kecil" onClick={() => onAktif(!a.aktif)}>
                {a.aktif ? 'Nonaktifkan' : 'Aktifkan'}
              </button>
            </>
          )}
        </div>
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

function FormTambah({ onTambah, peran = 'admin' }) {
  const kosong = { nama: '', username: '', password: '', jabatan: '' };
  const [buka, setBuka] = useState(false);
  const [isi, setIsi] = useState(kosong);
  const ubah = (k) => (e) => setIsi((x) => ({ ...x, [k]: e.target.value }));
  if (!buka)
    return (
      <button className="btn" style={{ marginTop: 12 }} onClick={() => setBuka(true)}>
        + Tambah {peran}
      </button>
    );
  return (
    <form
      className="adm-tambah"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await onTambah({ ...isi, peran })) {
          setIsi(kosong);
          setBuka(false);
        }
      }}
    >
      <h3>Tambah {peran}</h3>
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
          <label>Jabatan (opsional)</label>
          <input value={isi.jabatan} onChange={ubah('jabatan')} maxLength={30} placeholder="mis. Manajer Operasional" />
        </div>
      </div>
      <div className="adm-tombol">
        <button className="btn utama" type="submit" disabled={!isi.nama.trim() || isi.username.trim().length < 3 || isi.password.length < 8}>
          Tambah {peran}
        </button>
        <button type="button" className="btn" onClick={() => (setIsi(kosong), setBuka(false))}>
          Batal
        </button>
      </div>
    </form>
  );
}
