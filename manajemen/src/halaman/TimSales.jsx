import { useState } from 'react';
import { tampilHp, tgl, waktu } from '../lib/format.js';
import { Gagal, Kosong, Memuat, Modal, useData } from '../komponen/Ui.jsx';
import FotoProfil from '../komponen/FotoProfil.jsx';
import { keWebp } from '../lib/gambar.js';
import { DAFTAR_BANK, EWALLET, statusRekening } from '../lib/bank.js';

// Tim sales (admin): tambah sales sekali jalan (akun login + kode referral + data karyawan + rekening + foto), ubah profil,
// dan cek rekening pencairan bagi hasil. Rekening yang diganti sales sendiri harus dicek di sini sebelum bisa ditransfer.
const URL_MAKALIN = typeof window !== 'undefined' ? window.location.origin : '';
const passwordAcak = () => {
  const huruf = 'abcdefghjkmnpqrstuvwxyz23456789';
  const a = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(a, (n) => huruf[n % huruf.length]).join('');
};

export default function TimSales({ api }) {
  const { data, error, muat } = useData(api, '/tim-sales');
  const [form, setForm] = useState(null); // { awal } | null
  const [hasil, setHasil] = useState(null); // info login sales baru (sekali tampil)
  const [pesan, setPesan] = useState('');
  const [versiFoto, setVersiFoto] = useState(0);

  if (error) return <Gagal apa="tim sales" pesan={error} onUlang={muat} />;
  if (!data) return <Memuat apa="tim sales" />;
  const aktif = data.sales.filter((s) => s.aktif);
  const perluCek = data.sales.filter((s) => statusRekening(s).id === 'cek');
  const siap = aktif.filter((s) => s.siap_cair).length;

  const cek = async (s) => {
    setPesan('');
    try {
      await api('POST', `/tim-sales/${s.id}/cek-rekening`);
      setPesan(`Rekening ${s.nama} ditandai udah dicek. Bagi hasilnya bisa ditransfer ke situ.`);
      muat();
    } catch (e) {
      setPesan('Gagal: ' + e.message);
    }
  };

  return (
    <>
      <div className="adm-kepala" style={{ marginTop: 0 }}>
        <p className="adm-sub" style={{ margin: 0, maxWidth: 640 }}>
          Satu sales = akun login + kode referral + data karyawan (kemitraan). Rekening di sini yang dipakai buat nyairin bagi hasil tiap tanggal 5.
        </p>
        <button className="btn utama" onClick={() => setForm({ awal: {} })}>
          + Tambah sales
        </button>
      </div>
      {pesan && (
        <p className={pesan.startsWith('Gagal') ? 'adm-error' : 'adm-ok'} role="status" style={{ marginBottom: 12 }}>
          {pesan}
        </p>
      )}

      <div className="adm-angka">
        <div className="adm-kartu adm-angka-item">
          <span className="adm-label">Sales aktif</span>
          <b>{aktif.length}</b>
        </div>
        <div className="adm-kartu adm-angka-item">
          <span className="adm-label">Rekening siap cair</span>
          <b>
            {siap} / {aktif.length}
          </b>
        </div>
        <div className="adm-kartu adm-angka-item" style={perluCek.length ? { background: 'var(--kuning)' } : undefined}>
          <span className="adm-label">Rekening perlu dicek</span>
          <b>{perluCek.length}</b>
        </div>
        <div className="adm-kartu adm-angka-item">
          <span className="adm-label">Kode referral belum dipakai akun</span>
          <b>{data.kodeBebas.length}</b>
        </div>
      </div>

      {data.sales.length === 0 ? (
        <Kosong judul="Belum ada sales" aksi={<button className="btn utama" onClick={() => setForm({ awal: {} })}>+ Tambah sales</button>}>
          Tambah sales pertama: akun login, kode referral, dan rekening pencairannya dibikin sekalian.
        </Kosong>
      ) : (
        <div className="adm-tim-grid">
          {data.sales.map((s) => (
            <KartuSales key={s.id} s={s} versiFoto={versiFoto} onUbah={() => setForm({ awal: s })} onCek={() => cek(s)} />
          ))}
        </div>
      )}

      {form && (
        <FormSales
          api={api}
          awal={form.awal}
          kodeBebas={data.kodeBebas}
          karyawanBebas={data.karyawanBebas}
          onTutup={() => setForm(null)}
          onSelesai={(t, info) => {
            setForm(null);
            setPesan(t);
            setVersiFoto((v) => v + 1);
            if (info) setHasil(info);
            muat();
          }}
        />
      )}
      {hasil && <HasilTambah info={hasil} onTutup={() => setHasil(null)} />}
    </>
  );
}

function KartuSales({ s, versiFoto, onUbah, onCek }) {
  const st = statusRekening(s);
  return (
    <section className="adm-kartu adm-tim-kartu" style={s.aktif ? undefined : { opacity: 0.6 }}>
      <div className="adm-tim-kepala">
        <FotoProfil src={`/api/tim-sales/${s.id}/foto`} ada={s.ada_foto} nama={s.nama} ukuran={56} versi={versiFoto} />
        <div>
          <b>{s.nama}</b>
          <span className="adm-redup">
            @{s.username}
            {s.nik ? ` · ${s.nik}` : ''}
          </span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
            {s.kode ? <span className="adm-chip biru">{s.kode.kode}</span> : <span className="adm-chip merah">Belum ada kode</span>}
            {!s.aktif && <span className="adm-chip">Akun nonaktif</span>}
          </div>
        </div>
      </div>
      <div className="adm-redup" style={{ fontSize: 14 }}>
        {s.no_hp ? `WA ${tampilHp(s.no_hp)}` : 'No. HP belum diisi'}
        {s.lokasi ? ` · ${s.lokasi}` : ''}
        <br />
        Terakhir masuk {waktu(s.terakhir_masuk)}
      </div>
      <div className={'adm-tim-rek' + (st.id === 'kosong' ? ' kosong' : '')}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
          <span className="adm-label">Rekening pencairan</span>
          <span className={`adm-chip ${st.warna}`}>{st.nama}</span>
        </div>
        {st.id === 'kosong' ? (
          <span className="adm-redup">Kurang: {s.kurang.join(', ')}</span>
        ) : (
          <>
            <b>
              {s.bank} {s.rekening}
            </b>
            <span>a.n. {s.atas_nama}</span>
            <span className="adm-redup" style={{ fontSize: 13 }}>
              {st.id === 'cek'
                ? `Diganti ${s.rekening_diubah_oleh === 'sales sendiri' ? 'sama salesnya sendiri' : 'oleh ' + (s.rekening_diubah_oleh || '-')} ${waktu(s.rekening_diubah_at)}. Cocokin nama pemilik rekening dulu.`
                : `Dicek ${s.rekening_dicek_oleh || '-'} · ${tgl(s.rekening_dicek_at)}`}
            </span>
          </>
        )}
      </div>
      <div className="adm-tombol" style={{ marginTop: 0 }}>
        <button className="btn kecil" onClick={onUbah}>
          Ubah profil
        </button>
        {st.id === 'cek' && (
          <button className="btn kecil aksen" onClick={onCek}>
            Rekening udah dicek
          </button>
        )}
      </div>
    </section>
  );
}

const KOSONG = { nama: '', username: '', password: '', kode: '', wp_sales_id: '', karyawan_id: '', no_hp: '', email: '', nik_ktp: '', tanggal_lahir: '', lokasi: '', alamat: '', bank: '', rekening: '', atas_nama: '', npwp: '' };
const PROFIL = ['no_hp', 'email', 'nik_ktp', 'tanggal_lahir', 'lokasi', 'alamat', 'bank', 'rekening', 'atas_nama', 'npwp'];

function FormSales({ api, awal, kodeBebas, karyawanBebas, onTutup, onSelesai }) {
  const edit = Boolean(awal.id);
  const [isi, setIsi] = useState(() => {
    const x = { ...KOSONG, password: edit ? '' : passwordAcak() };
    for (const k of Object.keys(KOSONG)) if (awal[k] != null) x[k] = k === 'no_hp' ? tampilHp(awal[k]) : awal[k];
    return x;
  });
  const [pakaiKodeLama, setPakaiKodeLama] = useState(false);
  const [foto, setFoto] = useState(null); // { data } hasil keWebp
  const [error, setError] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const ubah = (k) => (e) => setIsi((x) => ({ ...x, [k]: e.target.value }));
  const field = (k, label, props = {}) => (
    <div className="field">
      <label htmlFor={`ts-${k}`}>{label}</label>
      <input id={`ts-${k}`} value={isi[k] ?? ''} onChange={ubah(k)} {...props} />
    </div>
  );
  const grid = { gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' };
  const ewallet = EWALLET.includes(isi.bank);
  const pilihSelect = { maxWidth: 'none', width: '100%', minHeight: 44 };

  const kirim = async (e) => {
    e.preventDefault();
    setError('');
    setSibuk(true);
    try {
      if (edit) {
        const body = { nama: isi.nama };
        for (const k of PROFIL) body[k] = isi[k];
        await api('PATCH', `/tim-sales/${awal.id}`, body);
        if (foto) await api('PUT', `/tim-sales/${awal.id}/foto`, { foto });
        onSelesai(`Profil ${isi.nama} disimpan.`);
      } else {
        const body = { nama: isi.nama, username: isi.username, password: isi.password };
        if (pakaiKodeLama) body.wp_sales_id = isi.wp_sales_id;
        else body.kode = isi.kode;
        if (isi.karyawan_id) body.karyawan_id = isi.karyawan_id;
        for (const k of PROFIL) if (isi[k]) body[k] = isi[k];
        if (foto) body.foto = foto;
        const h = await api('POST', '/tim-sales', body);
        onSelesai(`Sales ${h.nama} ditambah dengan kode ${h.kode}.`, { nama: h.nama, username: h.username, password: isi.password, kode: h.kode, no_hp: isi.no_hp });
      }
    } catch (err) {
      setError(err.message);
      setSibuk(false);
    }
  };

  return (
    <Modal judul={edit ? `Profil ${awal.nama}` : 'Tambah sales'} onTutup={onTutup} lebar={780}>
      <form onSubmit={kirim}>
        <div className="adm-tim-foto">
          {foto ? (
            <span className="foto-profil" style={{ width: 72, height: 72 }}>
              <img src={foto.data} alt="Foto baru" />
            </span>
          ) : (
            <FotoProfil src={edit ? `/api/tim-sales/${awal.id}/foto` : null} ada={edit && awal.ada_foto} nama={isi.nama} ukuran={72} />
          )}
          <div>
            <label className="btn kecil" style={{ cursor: 'pointer' }}>
              {edit && awal.ada_foto ? 'Ganti foto' : 'Pilih foto'}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  try {
                    setFoto(await keWebp(f, 512, 0.85));
                  } catch (err) {
                    setError('Foto gagal dibaca: ' + err.message);
                  }
                }}
              />
            </label>
            <p className="adm-redup" style={{ margin: '6px 0 0', fontSize: 13 }}>
              Foto wajah yang jelas. Otomatis dikecilin &amp; diubah ke WEBP.
            </p>
          </div>
        </div>

        {!edit && karyawanBebas.length > 0 && (
          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="ts-karyawan">Ambil dari data karyawan (opsional)</label>
            <select
              id="ts-karyawan"
              value={isi.karyawan_id}
              style={pilihSelect}
              onChange={(e) => {
                const k = karyawanBebas.find((x) => x.id === e.target.value);
                setIsi((x) => ({ ...x, karyawan_id: e.target.value, ...(k ? { nama: k.nama, no_hp: tampilHp(k.no_hp) === '-' ? '' : tampilHp(k.no_hp) } : {}) }));
              }}
            >
              <option value="">Nggak, bikin data karyawan baru</option>
              {karyawanBebas.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nama}
                  {k.jabatan ? ` · ${k.jabatan}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <span className="adm-label">{edit ? 'Nama' : 'Akun login'}</span>
        <div className="adm-baris" style={grid}>
          {field('nama', 'Nama lengkap', { required: true, maxLength: 60 })}
          {!edit && field('username', 'Username', { required: true, autoCapitalize: 'none', placeholder: 'huruf kecil, misal budi' })}
          {!edit && (
            <div className="field">
              <label htmlFor="ts-password">Password awal</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input id="ts-password" value={isi.password} onChange={ubah('password')} autoComplete="new-password" style={{ minWidth: 0 }} />
                <button type="button" className="btn kecil" onClick={() => setIsi((x) => ({ ...x, password: passwordAcak() }))}>
                  Acak
                </button>
              </div>
            </div>
          )}
        </div>
        {edit && (
          <p className="adm-redup" style={{ fontSize: 13, margin: '6px 0 0' }}>
            Username @{awal.username}
            {awal.kode ? ` · kode ${awal.kode.kode}` : ''}. Reset password &amp; nonaktifin akun ada di Pengguna &amp; tim.
          </p>
        )}

        {!edit && (
          <>
            <span className="adm-label" style={{ display: 'block', marginTop: 16 }}>
              Kode referral
            </span>
            {kodeBebas.length > 0 && (
              <div className="adm-toggle" style={{ margin: '6px 0 8px' }}>
                <button type="button" className={!pakaiKodeLama ? 'on' : ''} onClick={() => setPakaiKodeLama(false)}>
                  Bikin kode baru
                </button>
                <button type="button" className={pakaiKodeLama ? 'on' : ''} onClick={() => setPakaiKodeLama(true)}>
                  Pakai kode yang udah ada
                </button>
              </div>
            )}
            <div className="adm-baris" style={grid}>
              {pakaiKodeLama ? (
                <div className="field">
                  <label htmlFor="ts-wp">Kode yang belum dipakai akun</label>
                  <select id="ts-wp" value={isi.wp_sales_id} onChange={ubah('wp_sales_id')} required style={pilihSelect}>
                    <option value="">Pilih kode…</option>
                    {kodeBebas.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.kode} · {k.nama}
                        {k.aktif ? '' : ' (nonaktif)'}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                field('kode', 'Kode baru', {
                  required: true,
                  placeholder: 'BUDI',
                  maxLength: 20,
                  autoCapitalize: 'characters',
                  pattern: '[A-Za-z0-9]{3,20}',
                  title: '3-20 huruf/angka tanpa spasi',
                })
              )}
            </div>
            <p className="adm-redup" style={{ fontSize: 13, margin: '6px 0 0' }}>
              Kode ini yang diketik warung pas daftar, dan jadi link referral sales. Kodenya nggak bisa diganti setelah dibikin.
            </p>
          </>
        )}

        <span className="adm-label" style={{ display: 'block', marginTop: 16 }}>
          Data diri
        </span>
        <div className="adm-baris" style={grid}>
          {field('no_hp', 'No. HP / WA', { inputMode: 'tel', placeholder: '0812…' })}
          {field('email', 'Email', { type: 'email' })}
          {field('nik_ktp', 'NIK KTP', { inputMode: 'numeric', maxLength: 20, placeholder: '16 angka' })}
          {field('tanggal_lahir', 'Tanggal lahir', { type: 'date' })}
          {field('lokasi', 'Kota / area', { placeholder: 'Karawang' })}
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="ts-alamat">Alamat</label>
          <textarea id="ts-alamat" value={isi.alamat} onChange={ubah('alamat')} rows={2} maxLength={300} />
        </div>

        <span className="adm-label" style={{ display: 'block', marginTop: 16 }}>
          Rekening pencairan bagi hasil
        </span>
        <div className="adm-baris" style={grid}>
          <div className="field">
            <label htmlFor="ts-bank">Bank / e-wallet</label>
            <input id="ts-bank" value={isi.bank} onChange={ubah('bank')} list="ts-daftar-bank" placeholder="BCA" />
            <datalist id="ts-daftar-bank">
              {DAFTAR_BANK.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </div>
          {field('rekening', ewallet ? `Nomor ${isi.bank}` : 'Nomor rekening', { inputMode: 'numeric', maxLength: 30 })}
          {field('atas_nama', 'Atas nama', { placeholder: 'Sesuai buku tabungan' })}
          {field('npwp', 'NPWP (kalau ada)', { inputMode: 'numeric', maxLength: 25 })}
        </div>
        <p className="adm-redup" style={{ fontSize: 13, margin: '6px 0 0' }}>
          Rekening yang kamu isi di sini langsung dianggap udah dicek. Kalau salesnya ganti sendiri dari HP, transfer ditahan sampai dicek lagi.
        </p>

        {error && <p className="adm-error">{error}</p>}
        <div className="adm-tombol" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
          <button type="button" className="btn" onClick={onTutup}>
            Batal
          </button>
          <button type="submit" className="btn utama" disabled={sibuk}>
            {sibuk ? 'Menyimpan…' : edit ? 'Simpan profil' : 'Tambah sales'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Info login sales baru, ditampilin sekali (password nggak disimpan dalam bentuk asli).
function HasilTambah({ info, onTutup }) {
  const [tersalin, setTersalin] = useState(false);
  const teks = `Halo ${info.nama}, ini akun Makalin Sales kamu:\n${URL_MAKALIN}\nUsername: ${info.username}\nPassword: ${info.password}\nKode referral: ${info.kode}\n\nGanti password setelah masuk ya (menu Akun). Lengkapi juga foto & rekening buat pencairan bagi hasil.`;
  const hp = (info.no_hp || '').replace(/\D/g, '').replace(/^0/, '62');
  return (
    <Modal judul="Sales ditambah" onTutup={onTutup}>
      <p style={{ marginTop: 0 }}>Kirim info login ini ke {info.nama}. Password-nya cuma kelihatan sekarang.</p>
      <pre className="adm-hasil-login">{teks}</pre>
      <div className="adm-tombol" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
        <button
          className="btn"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(teks);
              setTersalin(true);
            } catch {
              setTersalin(false);
            }
          }}
        >
          {tersalin ? 'Tersalin ✓' : 'Salin'}
        </button>
        {hp.length >= 10 && (
          <a className="btn utama" href={`https://wa.me/${hp}?text=${encodeURIComponent(teks)}`} target="_blank" rel="noreferrer">
            Kirim lewat WhatsApp
          </a>
        )}
      </div>
    </Modal>
  );
}
