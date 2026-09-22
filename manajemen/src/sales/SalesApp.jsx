import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { rupiah, tgl, waktu } from '../lib/format.js';
import { Gagal, Kosong, Memuat, Modal, useData } from '../komponen/Ui.jsx';
import { Detail, FormLog, HASIL, STATUS_TOKO, daftarKelompok, saringKamus, sisaHari } from '../halaman/Lapangan.jsx';

// Tampilan khusus akun peran sales: app HP buat di lapangan, beda dari panel admin. Nggak ada sidebar; menu di bawah
// (Beranda, Toko, Catat, Riwayat, Contekan) biar gampang dipencet satu tangan. Datanya dari API /lapangan/* yang sama,
// dan server tetap ngunci akun sales cuma ke data miliknya (RUTE_SALES di server/auth.js).
const MENU = [
  { id: 'beranda', nama: 'Beranda' },
  { id: 'toko', nama: 'Toko' },
  { id: 'catat', nama: 'Catat' },
  { id: 'riwayat', nama: 'Riwayat' },
  { id: 'contekan', nama: 'Contekan' },
];
const HALAMAN = ['beranda', 'toko', 'riwayat', 'contekan', 'akun'];
const hariIniWib = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);

function bacaHalaman() {
  const h = window.location.hash.replace(/^#\/?/, '').split('/')[0];
  return HALAMAN.includes(h) ? h : 'beranda';
}

// Ikon menu bawah: bentuk sederhana yang gampang dikenali (sales nggak selalu sempat baca label di jalan).
function Ikon({ nama }) {
  const p = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  if (nama === 'beranda') return <svg {...p}><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></svg>;
  if (nama === 'toko') return <svg {...p}><path d="M4 9l1.5-5h13L20 9" /><path d="M4 9h16v2a3 3 0 0 1-6 0 3 3 0 0 1-4 0 3 3 0 0 1-6 0z" /><path d="M5 13v7h14v-7" /></svg>;
  if (nama === 'catat') return <svg {...p} strokeWidth={3}><path d="M12 5v14M5 12h14" /></svg>;
  if (nama === 'riwayat') return <svg {...p}><path d="M8 6h12M8 12h12M8 18h12" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></svg>;
  return <svg {...p}><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" /><path d="M5 17a3 3 0 0 1 3-3h11" /></svg>;
}

export default function SalesApp({ api, admin, onKeluar }) {
  const [halaman, setHalaman] = useState(bacaHalaman);
  const [form, setForm] = useState(null);
  const [dipilih, setDipilih] = useState(null);
  const [versi, setVersi] = useState(0);
  const [pesan, setPesan] = useState('');
  const segarkan = useCallback(() => setVersi((v) => v + 1), []);

  useEffect(() => {
    const ganti = () => {
      setHalaman(bacaHalaman());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', ganti);
    return () => window.removeEventListener('hashchange', ganti);
  }, []);
  useEffect(() => {
    if (!pesan) return;
    const t = setTimeout(() => setPesan(''), 3500);
    return () => clearTimeout(t);
  }, [pesan]);

  const catat = (awal = {}) => setForm({ awal });
  const props = { api, admin, versi, onBuka: setDipilih, onCatat: catat };

  return (
    <div className="sl-app">
      <header className="sl-atas">
        <a href="#/beranda" className="sl-merek" aria-label="Beranda Makalin Sales">
          <span className="sl-merek-kotak" aria-hidden="true">
            <img src="/logo-konsulin.png" alt="" />
          </span>
          <span>
            Makalin <b>Sales</b>
          </span>
        </a>
        <a href="#/akun" className={'sl-avatar' + (halaman === 'akun' ? ' on' : '')} aria-label={`Akun ${admin.nama}`}>
          {admin.nama?.[0]?.toUpperCase()}
        </a>
      </header>

      <main className="sl-isi">
        {halaman === 'beranda' && <Beranda {...props} />}
        {halaman === 'toko' && <Toko api={api} />}
        {halaman === 'riwayat' && <Riwayat {...props} />}
        {halaman === 'contekan' && <Contekan api={api} onCatat={catat} />}
        {halaman === 'akun' && <Akun api={api} admin={admin} onKeluar={onKeluar} />}
      </main>

      {pesan && (
        <div className="sl-toast" role="status">
          {pesan}
        </div>
      )}

      <nav className="sl-menu" aria-label="Menu sales">
        {MENU.map((m) =>
          m.id === 'catat' ? (
            <button key={m.id} className="sl-menu-catat" onClick={() => catat()} aria-label="Catat kunjungan">
              <Ikon nama="catat" />
              <span>Catat</span>
            </button>
          ) : (
            <a key={m.id} href={`#/${m.id}`} className={halaman === m.id ? 'on' : ''} aria-current={halaman === m.id ? 'page' : undefined}>
              <Ikon nama={m.id} />
              <span>{m.nama}</span>
            </a>
          )
        )}
      </nav>

      {form && (
        <FormLog
          api={api}
          awal={form.awal}
          wajibGps
          onTutup={() => setForm(null)}
          onSelesai={(t) => {
            setForm(null);
            setPesan(t);
            segarkan();
          }}
        />
      )}
      {dipilih && (
        <Detail
          key={dipilih.id + versi}
          api={api}
          l={dipilih}
          admin={admin}
          onTutup={() => setDipilih(null)}
          onUbah={(l) => (setDipilih(null), setForm({ awal: l }))}
          onHapus={(t) => (setDipilih(null), setPesan(t), segarkan())}
        />
      )}
    </div>
  );
}

// ---------------- Beranda ----------------
function Beranda({ api, admin, versi, onBuka, onCatat }) {
  const { data: log, error, muat } = useData(api, `/lapangan/log?v=${versi}`);
  const { data: toko } = useData(api, `/lapangan/toko?v=${versi}`);
  const hari = hariIniWib();
  const hariIni = (log || []).filter((l) => l.tanggal === hari);
  const jam = new Date(Date.now() + 7 * 3600000).getUTCHours();
  const salam = jam < 11 ? 'Pagi' : jam < 15 ? 'Siang' : jam < 18 ? 'Sore' : 'Malam';
  const berlangganan = toko?.terhubung ? (toko.ringkas.langganan || 0) + (toko.ringkas.permanen || 0) : null;

  return (
    <>
      <section className="sl-sapa">
        <p>
          {salam}, <b>{admin.nama?.split(' ')[0]}</b>
        </p>
        <span>{new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
      </section>

      <section className="sl-angka" aria-label="Ringkasan hari ini">
        <div>
          <b className="p-num">{log ? hariIni.length : '…'}</b>
          <span>kunjungan hari ini</span>
        </div>
        <div>
          <b className="p-num">{log ? hariIni.filter((l) => l.hasil === 'berhasil').length : '…'}</b>
          <span>berhasil hari ini</span>
        </div>
        <a href="#/toko">
          <b className="p-num">{berlangganan ?? '-'}</b>
          <span>toko berlangganan</span>
        </a>
      </section>

      <button className="sl-cta" onClick={() => onCatat()}>
        <span>
          <b>Catat kunjungan</b>
          <small>Keberatan pelanggan, jawabanmu, hasilnya, foto & lokasi</small>
        </span>
        <Ikon nama="catat" />
      </button>

      <LinkKartu api={api} />

      <div className="sl-judul">
        <h2>Terakhir dicatat</h2>
        {log?.length > 0 && <a href="#/riwayat">Lihat semua</a>}
      </div>
      {error ? (
        <Gagal apa="kunjungan" pesan={error} onUlang={muat} />
      ) : !log ? (
        <Memuat apa="kunjungan" />
      ) : log.length === 0 ? (
        <div className="sl-kosong">Belum ada kunjungan. Pencet tombol Catat di bawah tiap selesai ngobrol sama pemilik warung.</div>
      ) : (
        <KartuLog daftar={log.slice(0, 3)} onBuka={onBuka} />
      )}
    </>
  );
}

function KartuLog({ daftar, onBuka }) {
  return (
    <ul className="sl-daftar">
      {daftar.map((l) => (
        <li key={l.id}>
          <button className="sl-kartu sl-log" onClick={() => onBuka(l)}>
            <div className="sl-baris">
              <span className="sl-tag">{l.kategori}</span>
              <span className={`sl-hasil ${l.hasil}`}>{HASIL[l.hasil]?.pendek}</span>
            </div>
            <b>{l.ucapan ? `"${l.ucapan}"` : 'Langsung mau, tanpa keberatan'}</b>
            <span className="sl-redup">
              {tgl(l.tanggal)}
              {l.id_kunjungan ? ` · ${l.id_kunjungan}` : ''}
              {l.foto.length ? ` · ${l.foto.length} foto` : ''}
              {l.lat != null ? ' · lokasi GPS' : ''}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// ---------------- Link & kode ----------------
function LinkKartu({ api }) {
  const { data, error, muat } = useData(api, '/lapangan/link');
  const [qr, setQr] = useState(null);
  const [bukaQr, setBukaQr] = useState(false);
  const [tersalin, setTersalin] = useState(false);
  useEffect(() => {
    if (!data?.link) return;
    let batal = false;
    QRCode.toDataURL(data.link, { width: 480, margin: 2 }).then((u) => !batal && setQr(u), () => {});
    return () => {
      batal = true;
    };
  }, [data?.link]);
  if (error) return <Gagal apa="link kamu" pesan={error} onUlang={muat} />;
  if (!data) return null;
  if (!data.terhubung) {
    return <div className="sl-kartu sl-peringatan">Link & kode sales kamu belum aktif. Minta admin nyambungin akunmu ke kode sales Warung Pintar.</div>;
  }
  const teksWa = `Halo, ini link daftar Asisten Warung, aplikasi catat jualan, stok, dan kasbon warung di HP. Bisa coba gratis 7 hari: ${data.link} (kode sales: ${data.sales.kode})`;
  const salin = () =>
    navigator.clipboard?.writeText(data.link).then(
      () => {
        setTersalin(true);
        setTimeout(() => setTersalin(false), 2000);
      },
      () => window.prompt('Salin link ini:', data.link)
    ) ?? window.prompt('Salin link ini:', data.link);
  return (
    <section className="sl-kartu sl-link" aria-label="Link dan kode kamu">
      <div className="sl-baris">
        <span className="sl-label">Kode kamu</span>
        {!data.sales.aktif && <span className="sl-hasil ditolak">Nonaktif</span>}
      </div>
      <b className="sl-kode adm-mono">{data.sales.kode}</b>
      <div className="sl-salin">
        <input value={data.link} readOnly aria-label="Link daftar kamu" onFocus={(e) => e.target.select()} />
        <button onClick={salin}>{tersalin ? 'Tersalin' : 'Salin'}</button>
      </div>
      <div className="sl-aksi">
        <a href={`https://wa.me/?text=${encodeURIComponent(teksWa)}`} target="_blank" rel="noopener noreferrer">
          WhatsApp
        </a>
        <button onClick={() => setBukaQr(true)} disabled={!qr}>
          Tunjukin QR
        </button>
      </div>
      {bukaQr && qr && (
        <Modal judul={`Scan buat daftar · ${data.sales.kode}`} onTutup={() => setBukaQr(false)} lebar={420}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <img src={qr} alt={`QR code link daftar dengan kode ${data.sales.kode}`} className="adm-lap-qr-besar" />
            <p className="adm-redup" style={{ margin: 0, textAlign: 'center' }}>
              Minta pemilik warung scan pakai kamera HP-nya.
            </p>
            <a className="btn" href={qr} download={`qr-sales-${data.sales.kode}.png`}>
              Unduh QR
            </a>
          </div>
        </Modal>
      )}
    </section>
  );
}

// ---------------- Toko ----------------
function Toko({ api }) {
  const { data, error, muat } = useData(api, '/lapangan/toko');
  const [filter, setFilter] = useState('');
  if (error) return <Gagal apa="toko" pesan={error} onUlang={muat} />;
  if (!data) return <Memuat apa="toko" />;
  if (!data.terhubung) return <div className="sl-kartu sl-peringatan">Akunmu belum disambungin ke kode sales. Minta admin nyambungin dulu, nanti toko kamu muncul di sini.</div>;
  const daftar = data.toko.filter((t) => !filter || t.tahap === filter);
  return (
    <>
      <h1 className="sl-h1">Toko kamu</h1>
      <section className="sl-angka" aria-label="Ringkasan toko">
        <div>
          <b className="p-num">{data.toko.length}</b>
          <span>toko dipegang</span>
        </div>
        <div>
          <b className="p-num">{(data.ringkas.langganan || 0) + (data.ringkas.permanen || 0)}</b>
          <span>masih berlangganan</span>
        </div>
        <div>
          <b className="p-num" style={{ fontSize: 17 }}>
            {rupiah(data.total.bulanIni)}
          </b>
          <span>dibayar bulan ini</span>
        </div>
      </section>
      <p className="sl-redup" style={{ margin: '0 0 12px' }}>
        Angka pembayaran itu uang yang dibayar toko, bukan komisi.
      </p>
      <div className="sl-chip-gulir">
        <button className={filter === '' ? 'on' : ''} onClick={() => setFilter('')}>
          Semua {data.toko.length}
        </button>
        {Object.entries(STATUS_TOKO).map(([id, st]) =>
          data.ringkas[id] ? (
            <button key={id} className={filter === id ? 'on' : ''} onClick={() => setFilter(id)} aria-pressed={filter === id}>
              {st.nama} {data.ringkas[id]}
            </button>
          ) : null
        )}
      </div>
      {daftar.length === 0 ? (
        <div className="sl-kosong">{data.toko.length ? 'Nggak ada toko dengan status ini.' : 'Belum ada toko. Warung yang daftar pakai link atau kode kamu bakal muncul di sini.'}</div>
      ) : (
        <ul className="sl-daftar">
          {daftar.map((t) => (
            <li key={t.id} className="sl-kartu sl-toko">
              <div className="sl-baris">
                <b>{t.nama}</b>
                <span className={`sl-status ${t.tahap}`}>{STATUS_TOKO[t.tahap]?.nama}</span>
              </div>
              <span className="sl-redup">
                {t.tahap === 'permanen' ? 'Paket permanen, seumur hidup' : `Paket ${t.plan} · s/d ${tgl(t.lisensi_berlaku_sampai)} (${sisaHari(t.lisensi_berlaku_sampai)})`}
              </span>
              <span className="sl-redup">
                Dibayar {rupiah(t.total_bayar)} · pakai app {t.terakhir_aktif ? waktu(t.terakhir_aktif) : 'belum pernah'}
              </span>
              {t.no_hp && (
                <a className="sl-wa" href={`https://wa.me/${t.no_hp.replace(/\D/g, '').replace(/^0/, '62')}`} target="_blank" rel="noopener noreferrer">
                  Chat pemilik di WhatsApp
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
      {data.pembayaran.length > 0 && (
        <>
          <div className="sl-judul">
            <h2>Pembayaran masuk</h2>
          </div>
          <ul className="sl-daftar">
            {data.pembayaran.slice(0, 20).map((p) => (
              <li key={p.order_id} className="sl-kartu sl-bayar">
                <div>
                  <b>{p.warung_nama}</b>
                  <span className="sl-redup">
                    {waktu(p.lunas_pada)} · {p.plan} · {p.urutan === 1 ? 'bayar pertama' : `perpanjangan ke-${p.urutan - 1}`}
                  </span>
                </div>
                <b className="p-num">{rupiah(p.jumlah)}</b>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

// ---------------- Riwayat ----------------
function Riwayat({ api, versi, onBuka }) {
  const [hasil, setHasil] = useState('');
  const { data, error, muat } = useData(api, `/lapangan/log?v=${versi}${hasil ? `&hasil=${hasil}` : ''}`);
  return (
    <>
      <h1 className="sl-h1">Riwayat kunjungan</h1>
      <div className="sl-chip-gulir">
        <button className={hasil === '' ? 'on' : ''} onClick={() => setHasil('')}>
          Semua
        </button>
        {Object.entries(HASIL).map(([id, h]) => (
          <button key={id} className={hasil === id ? 'on' : ''} onClick={() => setHasil(id)} aria-pressed={hasil === id}>
            {h.pendek}
          </button>
        ))}
      </div>
      {error ? (
        <Gagal apa="riwayat" pesan={error} onUlang={muat} />
      ) : !data ? (
        <Memuat apa="riwayat" />
      ) : data.length === 0 ? (
        <div className="sl-kosong">{hasil ? 'Belum ada kunjungan dengan hasil ini.' : 'Belum ada kunjungan yang dicatat.'}</div>
      ) : (
        <KartuLog daftar={data} onBuka={onBuka} />
      )}
    </>
  );
}

// ---------------- Contekan (kamus keberatan) ----------------
function Contekan({ api, onCatat }) {
  const { data, error, muat } = useData(api, '/lapangan/keberatan');
  const [buka, setBuka] = useState(null);
  const [q, setQ] = useState('');
  const [kelompok, setKelompok] = useState('');
  const tampil = saringKamus(data, q, kelompok);
  return (
    <>
      <h1 className="sl-h1">Contekan jawaban</h1>
      <p className="sl-redup" style={{ margin: '0 0 12px' }}>
        Keberatan yang sering keluar dari pemilik warung, fakta produk buat ngejawab, dan contoh omongannya.
      </p>
      <div className="sl-cari">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder='Cari: "mahal", "gaptek", "utang"…' aria-label="Cari contekan" />
      </div>
      {data && data.length > 0 && (
        <div className="sl-chip-gulir">
          <button className={kelompok === '' ? 'on' : ''} onClick={() => setKelompok('')}>
            Semua
          </button>
          {daftarKelompok(data).map((g) => (
            <button key={g} className={kelompok === g ? 'on' : ''} onClick={() => setKelompok(g)} aria-pressed={kelompok === g}>
              {g}
            </button>
          ))}
        </div>
      )}
      {error ? (
        <Gagal apa="contekan" pesan={error} onUlang={muat} />
      ) : !data ? (
        <Memuat apa="contekan" />
      ) : data.length === 0 ? (
        <Kosong judul="Contekan masih kosong">Minta admin ngisi bank keberatan.</Kosong>
      ) : tampil.length === 0 ? (
        <div className="sl-kosong">Nggak ketemu. Coba kata lain, atau catat sebagai "Lainnya" biar admin nambahin.</div>
      ) : (
        <ul className="sl-daftar">
          {tampil.map((k) => (
            <li key={k.id} className="sl-kartu sl-contekan">
              <button className="sl-contekan-buka" onClick={() => setBuka(buka === k.id ? null : k.id)} aria-expanded={buka === k.id}>
                <span className="sl-baris">
                  <span className="sl-tag">{k.kategori}</span>
                  {k.kelompok && k.kelompok !== k.kategori && <span className="sl-redup">{k.kelompok}</span>}
                </span>
                <b>"{k.ucapan}"</b>
              </button>
              {buka === k.id && (
                <div className="sl-fakta">
                  {k.variasi && (
                    <p className="sl-redup" style={{ margin: '0 0 10px' }}>
                      Juga sering diomongin: {k.variasi.split('\n').filter(Boolean).map((v) => `"${v}"`).join(', ')}
                    </p>
                  )}
                  <span className="sl-label">Jawab pakai fakta ini</span>
                  <p>{k.fakta}</p>
                  {k.contoh_jawaban && (
                    <>
                      <span className="sl-label">Contoh omongan</span>
                      <p className="sl-contoh">"{k.contoh_jawaban}"</p>
                    </>
                  )}
                  {k.jangan && (
                    <p className="sl-jangan">
                      <b>Jangan:</b> {k.jangan}
                    </p>
                  )}
                  <button className="sl-tombol" onClick={() => onCatat({ keberatan_id: k.id })}>
                    Catat kunjungan dengan keberatan ini
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ---------------- Akun ----------------
function Akun({ api, admin, onKeluar }) {
  const { data: link } = useData(api, '/lapangan/link');
  const [isi, setIsi] = useState({ passwordLama: '', passwordBaru: '' });
  const [error, setError] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const ubah = (k) => (e) => setIsi((x) => ({ ...x, [k]: e.target.value }));
  return (
    <>
      <section className="sl-kartu sl-profil">
        <span className="sl-avatar besar" aria-hidden="true">
          {admin.nama?.[0]?.toUpperCase()}
        </span>
        <div>
          <b>{admin.nama}</b>
          <span className="sl-redup">@{admin.username} · sales</span>
          {link?.terhubung && <span className="sl-redup">Kode sales {link.sales.kode}</span>}
        </div>
      </section>
      <form
        className="sl-kartu"
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          setSibuk(true);
          try {
            await api('POST', '/saya/password', isi);
            onKeluar('Password diganti. Masuk lagi pakai password baru.');
          } catch (err) {
            setError(err.message);
            setSibuk(false);
          }
        }}
      >
        <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>Ganti password</h2>
        <div className="field">
          <label htmlFor="sl-pw-lama">Password lama</label>
          <input id="sl-pw-lama" type="password" value={isi.passwordLama} onChange={ubah('passwordLama')} autoComplete="current-password" />
        </div>
        <div className="field">
          <label htmlFor="sl-pw-baru">Password baru (min. 8)</label>
          <input id="sl-pw-baru" type="password" value={isi.passwordBaru} onChange={ubah('passwordBaru')} autoComplete="new-password" />
        </div>
        {error && <p className="adm-error">{error}</p>}
        <button className="sl-tombol" type="submit" disabled={sibuk || !isi.passwordLama || isi.passwordBaru.length < 8} style={{ marginTop: 14 }}>
          {sibuk ? 'Menyimpan…' : 'Ganti password'}
        </button>
      </form>
      <button className="sl-tombol keluar" onClick={() => onKeluar()}>
        Keluar
      </button>
    </>
  );
}
