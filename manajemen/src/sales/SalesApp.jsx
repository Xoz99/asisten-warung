import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { bulanLabel, rupiah, tgl, waktu } from '../lib/format.js';
import { Gagal, Kosong, Memuat, Modal, useData } from '../komponen/Ui.jsx';
import { Detail, FormLog, HASIL, STATUS_TOKO, daftarKelompok, saringKamus, sisaHari } from '../halaman/Lapangan.jsx';
import FotoProfil from '../komponen/FotoProfil.jsx';
import LeadDetail from '../halaman/LeadDetail.jsx';
import { TAHAP_CRM } from '../halaman/LeadsCrm.jsx';
import { keWebp } from '../lib/gambar.js';
import { DAFTAR_BANK, EWALLET, samarRekening, statusRekening } from '../lib/bank.js';

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
const HALAMAN = ['beranda', 'toko', 'pipeline', 'riwayat', 'contekan', 'akun', 'penghasilan'];
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
  // Profil (foto & rekening pencairan) dipakai di pojok atas, Akun, dan Penghasilan.
  const { data: profil, muat: muatProfil } = useData(api, '/saya/profil');
  const [versiFoto, setVersiFoto] = useState(0);

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
  const props = { api, admin, versi, profil, onBuka: setDipilih, onCatat: catat };

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
          <FotoProfil src="/api/saya/foto" ada={profil?.ada_foto} nama={admin.nama} ukuran={40} versi={versiFoto} />
        </a>
      </header>

      <main className="sl-isi">
        {halaman === 'beranda' && <Beranda {...props} />}
        {halaman === 'toko' && <Toko api={api} />}
        {halaman === 'pipeline' && <Pipeline api={api} versi={versi} onCatat={segarkan} />}
        {halaman === 'riwayat' && <Riwayat {...props} />}
        {halaman === 'contekan' && <Contekan api={api} onCatat={catat} />}
        {halaman === 'akun' && (
          <Akun
            api={api}
            admin={admin}
            onKeluar={onKeluar}
            profil={profil}
            versiFoto={versiFoto}
            setPesan={setPesan}
            onBerubah={(foto) => {
              muatProfil();
              if (foto) setVersiFoto((v) => v + 1);
            }}
          />
        )}
        {halaman === 'penghasilan' && <Penghasilan api={api} profil={profil} />}
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
            <a key={m.id} href={`#/${m.id}`} className={halaman === m.id || (m.id === 'toko' && halaman === 'pipeline') ? 'on' : ''} aria-current={halaman === m.id ? 'page' : undefined}>
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
function Beranda({ api, admin, versi, profil, onBuka, onCatat }) {
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

      <PemberitahuanCair api={api} versi={versi} />

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

      <KartuPenghasilan api={api} versi={versi} profil={profil} />

      {toko?.terhubung && tokoMauHabis(toko.toko).length > 0 && (
        <a href="#/toko" className="sl-kartu sl-mau-habis-ringkas">
          <b>{tokoMauHabis(toko.toko).length} toko mau habis minggu ini</b>
          <span>
            {tokoMauHabis(toko.toko)
              .slice(0, 3)
              .map((t) => t.nama)
              .join(', ')}
            {tokoMauHabis(toko.toko).length > 3 ? ', …' : ''}
          </span>
          <span className="sl-wa">Lihat & ingatkan</span>
        </a>
      )}

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
// "Mau habis" = langganan / trial yang masa aktifnya tinggal 7 hari atau kurang. Ini yang paling perlu didatengin:
// langganan biar diperpanjang, trial biar jadi bayar pertama.
const HARI_MAU_HABIS = 7;
const sisaHariAngka = (t) => Math.ceil((new Date(t) - Date.now()) / 86400000);
export const tokoMauHabis = (toko) =>
  (toko || [])
    .filter((t) => ['langganan', 'trial'].includes(t.tahap) && sisaHariAngka(t.lisensi_berlaku_sampai) <= HARI_MAU_HABIS)
    .sort((a, b) => new Date(a.lisensi_berlaku_sampai) - new Date(b.lisensi_berlaku_sampai));
const kapanHabis = (t) => {
  const h = sisaHariAngka(t.lisensi_berlaku_sampai);
  const apa = t.tahap === 'trial' ? 'Trial' : 'Langganan';
  return h <= 0 ? `${apa} habis hari ini` : h === 1 ? `${apa} habis besok` : `${apa} habis ${h} hari lagi`;
};
const waPemilik = (t, teks) => `https://wa.me/${t.no_hp.replace(/\D/g, '').replace(/^0/, '62')}${teks ? `?text=${encodeURIComponent(teks)}` : ''}`;
const teksIngatkan = (t) =>
  t.tahap === 'trial'
    ? `Halo, ini dari Konsulin. Masa coba Asisten Warung di ${t.nama} habis ${tgl(t.lisensi_berlaku_sampai)}. Mau lanjut langganan? Saya bisa bantu.`
    : `Halo, ini dari Konsulin. Langganan Asisten Warung di ${t.nama} habis ${tgl(t.lisensi_berlaku_sampai)}. Mau diperpanjang? Saya bisa bantu.`;

function Toko({ api }) {
  const { data, error, muat } = useData(api, '/lapangan/toko');
  const [filter, setFilter] = useState('');
  if (error) return <Gagal apa="toko" pesan={error} onUlang={muat} />;
  if (!data) return <Memuat apa="toko" />;
  if (!data.terhubung) return <div className="sl-kartu sl-peringatan">Akunmu belum disambungin ke kode sales. Minta admin nyambungin dulu, nanti toko kamu muncul di sini.</div>;
  const mauHabis = tokoMauHabis(data.toko);
  const daftar = filter === 'mau_habis' ? mauHabis : data.toko.filter((t) => !filter || t.tahap === filter);
  return (
    <>
      <PilihTokoPipeline aktif="toko" />
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
      {mauHabis.length > 0 && filter === '' && (
        <section className="sl-kartu sl-mau-habis" aria-label="Toko yang mau habis">
          <div className="sl-baris">
            <b>Perlu di-follow-up</b>
            <span className="sl-hasil pikir">{mauHabis.length} mau habis</span>
          </div>
          <p className="sl-redup" style={{ margin: '4px 0 8px' }}>
            Masa aktifnya tinggal {HARI_MAU_HABIS} hari atau kurang. Datengin atau chat sebelum lewat.
          </p>
          <ul>
            {mauHabis.map((t) => (
              <li key={t.id}>
                <div style={{ minWidth: 0 }}>
                  <b>{t.nama}</b>
                  <span className={sisaHariAngka(t.lisensi_berlaku_sampai) <= 1 ? 'sl-mendesak' : 'sl-redup'}>{kapanHabis(t)}</span>
                </div>
                {t.no_hp && (
                  <a className="sl-wa-kecil" href={waPemilik(t, teksIngatkan(t))} target="_blank" rel="noopener noreferrer" aria-label={`Ingatkan ${t.nama} lewat WhatsApp`}>
                    Ingatkan
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="sl-chip-gulir">
        <button className={filter === '' ? 'on' : ''} onClick={() => setFilter('')}>
          Semua {data.toko.length}
        </button>
        {mauHabis.length > 0 && (
          <button className={filter === 'mau_habis' ? 'on' : ''} onClick={() => setFilter('mau_habis')} aria-pressed={filter === 'mau_habis'}>
            Mau habis {mauHabis.length}
          </button>
        )}
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
              <span className={mauHabis.includes(t) ? 'sl-mendesak' : 'sl-redup'}>
                {t.tahap === 'permanen' ? 'Paket permanen, seumur hidup' : `Paket ${t.plan} · s/d ${tgl(t.lisensi_berlaku_sampai)} (${sisaHari(t.lisensi_berlaku_sampai)})`}
              </span>
              <span className="sl-redup">
                Dibayar {rupiah(t.total_bayar)} · pakai app {t.terakhir_aktif ? waktu(t.terakhir_aktif) : 'belum pernah'}
              </span>
              {t.no_hp && (
                <a className="sl-wa" href={waPemilik(t, mauHabis.includes(t) ? teksIngatkan(t) : '')} target="_blank" rel="noopener noreferrer">
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

// ---------------- Penghasilan (bagi hasil) ----------------
const JENIS_KOMISI = { pertama: 'Order pertama', perpanjangan: 'Perpanjangan', permanen: 'Permanen' };
const persen = (r) => `${Math.round(r * 100)}%`;

function KartuPenghasilan({ api, versi, profil }) {
  const { data } = useData(api, `/lapangan/komisi?v=${versi}`);
  if (!data?.terhubung) return null;
  const rek = statusRekening(profil);
  return (
    <>
      <a href="#/penghasilan" className="sl-kartu sl-penghasilan-ringkas">
        <span className="sl-label">Bagi hasil {bulanLabel(data.bulanIni.periode, true)} (estimasi)</span>
        <b className="p-num">{rupiah(data.bulanIni.neto)}</b>
        <span className="sl-redup">
          {data.bulanIni.baris.length} pembayaran · dicairkan {tgl(data.bulanIni.jadwalCair)}
        </span>
        <span className="sl-wa">Lihat rincian</span>
      </a>
      {profil && rek.id === 'kosong' && (
        <a href="#/akun" className="sl-kartu sl-peringatan sl-rek-ingat">
          <b>Rekening pencairan belum diisi</b>
          <span className="sl-redup">Isi dulu di Akun biar bagi hasilmu bisa ditransfer tanggal 5.</span>
        </a>
      )}
    </>
  );
}

// Pemberitahuan pencairan: muncul sampai sales bilang "udah masuk". Kalau dia lapor belum masuk, admin dapet notifikasi.
const samarTujuan = (t) => (t || '').replace(/\d(?=\d{4})/g, '•');
const tunai = (m) => /tunai|cash/i.test(m || '');
function PemberitahuanCair({ api, versi, onBerubah }) {
  const [v, setV] = useState(0);
  const { data } = useData(api, `/lapangan/komisi?v=${versi}-${v}`);
  const [lapor, setLapor] = useState(null); // periode yang lagi diisi laporan "belum masuk"
  const [catatan, setCatatan] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [error, setError] = useState('');
  if (!data?.terhubung) return null;
  const daftar = data.riwayat.filter((r) => r.dicairkan_tanggal && r.konfirmasi_sales !== 'masuk');
  if (!daftar.length) return null;
  const kirim = async (periode, status) => {
    setSibuk(true);
    setError('');
    try {
      await api('POST', '/lapangan/komisi/konfirmasi', { periode, status, catatan: status === 'belum' ? catatan : undefined });
      setLapor(null);
      setCatatan('');
      setV((x) => x + 1);
      onBerubah?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSibuk(false);
    }
  };
  return daftar.map((r) =>
    r.konfirmasi_sales === 'belum' ? (
      <section key={r.periode} className="sl-kartu sl-cair lapor" role="status">
        <span className="sl-label">Dilaporin ke admin</span>
        <b>
          Bagi hasil {bulanLabel(r.periode, true)} ({rupiah(r.neto)}) belum masuk
        </b>
        <span className="sl-redup">Admin udah dikabarin {waktu(r.konfirmasi_at)}. Kalau ternyata udah masuk, pencet tombol di bawah.</span>
        {error && <p className="adm-error">{error}</p>}
        <button className="sl-tombol" disabled={sibuk} onClick={() => kirim(r.periode, 'masuk')}>
          Sekarang udah masuk
        </button>
      </section>
    ) : (
      <section key={r.periode} className="sl-kartu sl-cair" role="status">
        <span className="sl-label">{tunai(r.metode) ? 'Bagi hasil udah dibayar' : 'Bagi hasil udah ditransfer'}</span>
        <b className="p-num sl-cair-angka">{rupiah(r.neto)}</b>
        <span>
          {bulanLabel(r.periode, true)} · {tunai(r.metode) ? 'tunai' : 'ditransfer'} {tgl(r.dicairkan_tanggal)}
          {r.rekening_tujuan ? ` ke ${samarTujuan(r.rekening_tujuan)}` : ''}
        </span>
        {r.referensi && <span className="sl-redup">Catatan admin: {r.referensi}</span>}
        {lapor === r.periode ? (
          <>
            <div className="field">
              <label htmlFor={`lapor-${r.periode}`}>Ceritain singkat (opsional)</label>
              <textarea id={`lapor-${r.periode}`} rows={2} maxLength={300} value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Misal: udah cek mutasi BCA sampai hari ini, belum ada" />
            </div>
            {error && <p className="adm-error">{error}</p>}
            <div className="sl-cair-tombol">
              <button className="sl-tombol keluar" style={{ marginTop: 0 }} disabled={sibuk} onClick={() => setLapor(null)}>
                Batal
              </button>
              <button className="sl-tombol" disabled={sibuk} onClick={() => kirim(r.periode, 'belum')}>
                {sibuk ? 'Ngirim…' : 'Kirim laporan'}
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="sl-redup">{tunai(r.metode) ? 'Udah kamu terima?' : 'Cek mutasi rekeningmu, terus kabarin di sini.'}</span>
            {error && <p className="adm-error">{error}</p>}
            <div className="sl-cair-tombol">
              <button className="sl-tombol keluar" style={{ marginTop: 0 }} disabled={sibuk} onClick={() => setLapor(r.periode)}>
                Belum masuk
              </button>
              <button className="sl-tombol" disabled={sibuk} onClick={() => kirim(r.periode, 'masuk')}>
                Udah masuk
              </button>
            </div>
          </>
        )}
      </section>
    )
  );
}

// ---------------- Pipeline (kanban kartu CRM milik sales) ----------------
function PilihTokoPipeline({ aktif }) {
  return (
    <nav className="sl-seg" aria-label="Toko atau pipeline">
      <a href="#/toko" className={aktif === 'toko' ? 'on' : ''} aria-current={aktif === 'toko' ? 'page' : undefined}>
        Toko langganan
      </a>
      <a href="#/pipeline" className={aktif === 'pipeline' ? 'on' : ''} aria-current={aktif === 'pipeline' ? 'page' : undefined}>
        Pipeline
      </a>
    </nav>
  );
}

const hariDiTahap = (t) => Math.max(0, Math.floor((Date.now() - new Date(t).getTime()) / 86400000));

function Pipeline({ api, versi }) {
  const [v, setV] = useState(0);
  const { data, error, muat } = useData(api, `/lapangan/crm?v=${versi}-${v}`);
  const [cari, setCari] = useState('');
  const [dibuka, setDibuka] = useState(null);
  if (error) return <Gagal apa="pipeline" pesan={error} onUlang={muat} />;
  if (!data) return <Memuat apa="pipeline" />;
  const q = cari.trim().toLowerCase();
  const leads = q ? data.filter((l) => [l.perusahaan, l.pic_nama, l.telepon].some((x) => (x || '').toLowerCase().includes(q))) : data;
  const total = data.reduce((a, l) => a + (Number(l.nilai) || 0), 0);
  const lead = dibuka ? data.find((l) => l.id === dibuka) || null : null;
  return (
    <>
      <PilihTokoPipeline aktif="pipeline" />
      <h1 className="sl-h1">Pipeline kamu</h1>
      <section className="sl-angka" aria-label="Ringkasan pipeline">
        <div>
          <b className="p-num">{data.length}</b>
          <span>kartu jalan</span>
        </div>
        <div>
          <b className="p-num" style={{ fontSize: 17 }}>
            {rupiah(total)}
          </b>
          <span>total potensial</span>
        </div>
        <div>
          <b className="p-num">{data.filter((l) => l.tahap === 'stuck').length}</b>
          <span>macet</span>
        </div>
      </section>
      <div className="sl-cari">
        <input type="search" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari toko, PIC, atau nomor" aria-label="Cari kartu" />
      </div>
      {data.length === 0 ? (
        <div className="sl-kosong">Belum ada kartu. Kartu muncul otomatis waktu kamu nyatet kunjungan, atau waktu toko daftar pakai link/kode kamu.</div>
      ) : (
        <>
          <p className="sl-redup" style={{ margin: '0 0 8px' }}>
            Geser ke samping buat lihat tahap lain. Ketuk kartu buat buka detail &amp; pindah tahap.
          </p>
          <div className="sl-kanban">
            {TAHAP_CRM.map((t) => {
              const isi = leads.filter((l) => l.tahap === t.id);
              return (
                <section key={t.id} className="sl-kanban-kolom" aria-label={`Tahap ${t.nama}`}>
                  <header className={`sl-kanban-kepala tahap-${t.id}`}>
                    <span>
                      <b>{t.nama}</b>
                      <span className="p-num">{rupiah(isi.reduce((a, l) => a + (Number(l.nilai) || 0), 0))}</span>
                    </span>
                    <span className="sl-kanban-jumlah">{isi.length}</span>
                  </header>
                  {isi.length === 0 ? (
                    <p className="sl-redup" style={{ textAlign: 'center', margin: '12px 0' }}>
                      Kosong
                    </p>
                  ) : (
                    isi.map((l) => (
                      <button key={l.id} className="sl-kartu sl-kanban-kartu" onClick={() => setDibuka(l.id)}>
                        <span className="sl-baris">
                          <b>{l.perusahaan}</b>
                          <span className="sl-redup">{hariDiTahap(l.tahap_sejak)} hari</span>
                        </span>
                        <span className="sl-redup">{l.pic_nama || 'PIC belum diisi'}</span>
                        <span className="sl-baris" style={{ marginTop: 6 }}>
                          <b className="p-num">{rupiah(l.nilai)}</b>
                          <span className="sl-redup">{l.jumlah_kunjungan ? `${l.jumlah_kunjungan} kunjungan` : 'belum dikunjungi'}</span>
                        </span>
                        {l.prioritas === 'tinggi' && <span className="sl-hasil ditolak" style={{ alignSelf: 'flex-start' }}>Prioritas tinggi</span>}
                      </button>
                    ))
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
      {lead && (
        <div className="sl-lead-laci">
          <LeadDetail key={lead.id} api={api} lead={lead} base="/lapangan/crm" modeSales onTutup={() => setDibuka(null)} onBerubah={() => setV((x) => x + 1)} />
        </div>
      )}
    </>
  );
}

// Rekening tujuan transfer bagi hasil (dipakai di Penghasilan).
function KartuRekening({ profil }) {
  if (!profil) return null;
  const rek = statusRekening(profil);
  return (
    <a href="#/akun" className={'sl-kartu sl-rek' + (rek.id === 'siap' ? '' : ' sl-peringatan')}>
      <span className="sl-label">Dicairkan ke</span>
      {rek.id === 'kosong' ? (
        <>
          <b>Rekening belum diisi</b>
          <span className="sl-redup">Ketuk buat ngisi. Tanpa rekening, bagi hasil nggak bisa ditransfer.</span>
        </>
      ) : (
        <>
          <b>
            {profil.bank} {samarRekening(profil.rekening)}
          </b>
          <span className="sl-redup">
            a.n. {profil.atas_nama} · {rek.id === 'siap' ? 'udah dicek admin' : 'lagi dicek admin, transfer ditahan sampai beres'}
          </span>
        </>
      )}
    </a>
  );
}

function Penghasilan({ api, profil }) {
  const { data, error, muat } = useData(api, '/lapangan/komisi');
  if (error) return <Gagal apa="penghasilan" pesan={error} onUlang={muat} />;
  if (!data) return <Memuat apa="penghasilan" />;
  if (!data.terhubung) return <div className="sl-kartu sl-peringatan">Akunmu belum disambungin ke kode sales, jadi bagi hasilnya belum bisa dihitung.</div>;
  const b = data.bulanIni;
  const butuh = data.ambangTokoBaru + 1;
  return (
    <>
      <h1 className="sl-h1">Penghasilan</h1>
      <PemberitahuanCair api={api} versi={0} onBerubah={muat} />
      <section className="sl-kartu sl-penghasilan">
        <span className="sl-label">Bulan ini, {bulanLabel(b.periode, true)}</span>
        <b className="p-num sl-penghasilan-angka">{rupiah(b.neto)}</b>
        <span className="sl-redup">
          Komisi {rupiah(b.bruto)} dikurangi pajak {persen(data.rate.pajak)} ({rupiah(b.pajak)}). Masih estimasi, dikunci admin awal bulan depan, dicairkan {tgl(b.jadwalCair)}.
        </span>
      </section>
      <div style={{ marginTop: 12 }}>
        <KartuRekening profil={profil} />
      </div>

      <section className="sl-kartu" style={{ marginTop: 12 }}>
        <div className="sl-baris">
          <b>Toko baru bulan ini</b>
          <b className="p-num">
            {b.toko_baru} / {butuh}
          </b>
        </div>
        <div className="sl-progres" role="progressbar" aria-valuenow={b.toko_baru} aria-valuemin={0} aria-valuemax={butuh} aria-label="Toko baru bulan ini">
          <div style={{ width: `${Math.min(100, (b.toko_baru / butuh) * 100)}%` }} />
        </div>
        <span className="sl-redup">
          {b.toko_baru > data.ambangTokoBaru
            ? `Mantap! Semua perpanjangan bulan ini dapat ${persen(data.rate.perpanjanganTier)}.`
            : `${butuh - b.toko_baru} toko baru lagi biar semua perpanjangan bulan ini naik dari ${persen(data.rate.perpanjangan)} jadi ${persen(data.rate.perpanjanganTier)}.`}
        </span>
      </section>

      <div className="sl-judul">
        <h2>Rincian bulan ini</h2>
      </div>
      {b.baris.length === 0 ? (
        <div className="sl-kosong">Belum ada pembayaran dari toko kamu bulan ini.</div>
      ) : (
        <ul className="sl-daftar">
          {b.baris.map((x) => (
            <li key={x.order_id} className="sl-kartu sl-bayar">
              <div>
                <b>{x.warung_nama}</b>
                <span className="sl-redup">
                  {JENIS_KOMISI[x.jenis]} · {persen(x.rate)} dari {rupiah(x.jumlah)} · {tgl(x.lunas_pada)}
                </span>
              </div>
              <b className="p-num">{rupiah(x.komisi)}</b>
            </li>
          ))}
        </ul>
      )}

      {data.bulanLalu && (
        <section className="sl-kartu" style={{ marginTop: 16 }}>
          <div className="sl-baris">
            <b>{bulanLabel(data.bulanLalu.periode, true)}</b>
            <b className="p-num">{rupiah(data.bulanLalu.neto)}</b>
          </div>
          <span className="sl-redup">Nunggu dikunci admin, dicairkan {tgl(data.bulanLalu.jadwalCair)}.</span>
        </section>
      )}

      <div className="sl-judul">
        <h2>Riwayat</h2>
      </div>
      {data.riwayat.length === 0 ? (
        <div className="sl-kosong">Belum ada bulan yang dikunci.</div>
      ) : (
        <ul className="sl-daftar">
          {data.riwayat.map((r) => (
            <li key={r.periode} className="sl-kartu sl-bayar">
              <div>
                <b>{bulanLabel(r.periode, true)}</b>
                <span className="sl-redup">
                  {r.dicairkan_tanggal
                    ? `Dicairkan ${tgl(r.dicairkan_tanggal)}${r.rekening_tujuan ? ` ke ${samarTujuan(r.rekening_tujuan)}` : r.metode ? ` · ${r.metode}` : ''}`
                    : `Dikunci, dicairkan ${tgl(r.jadwalCair)}`}
                </span>
              </div>
              <span style={{ textAlign: 'right' }}>
                <b className="p-num">{rupiah(r.neto)}</b>
                <span
                  className={`sl-hasil ${!r.dicairkan_tanggal ? 'pikir' : r.konfirmasi_sales === 'belum' ? 'ditolak' : r.konfirmasi_sales === 'masuk' ? 'berhasil' : 'tertarik'}`}
                  style={{ display: 'block', marginTop: 4 }}
                >
                  {!r.dicairkan_tanggal ? 'Siap cair' : r.konfirmasi_sales === 'belum' ? 'Belum masuk' : r.konfirmasi_sales === 'masuk' ? 'Diterima' : 'Cair'}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <details className="sl-kartu" style={{ marginTop: 16 }}>
        <summary style={{ fontWeight: 700, cursor: 'pointer' }}>Cara ngitung bagi hasil</summary>
        <ul style={{ margin: '10px 0 0', paddingLeft: 20, lineHeight: 1.7 }}>
          <li>Toko bayar pertama kali: {persen(data.rate.pertama)}</li>
          <li>
            Toko perpanjang: {persen(data.rate.perpanjangan)}, atau {persen(data.rate.perpanjanganTier)} kalau bulan itu kamu dapat lebih dari {data.ambangTokoBaru} toko baru
          </li>
          <li>Paket permanen: {persen(data.rate.permanen)}</li>
          <li>Dipotong pajak {persen(data.rate.pajak)}, dicairkan tiap tanggal 5 buat bulan sebelumnya</li>
          <li>Yang dihitung cuma toko yang kamu pegang waktu dia bayar</li>
        </ul>
      </details>
    </>
  );
}

// ---------------- Akun ----------------
function Akun({ api, admin, onKeluar, profil, versiFoto, setPesan, onBerubah }) {
  const { data: link } = useData(api, '/lapangan/link');
  const [isi, setIsi] = useState({ passwordLama: '', passwordBaru: '' });
  const [error, setError] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [sibukFoto, setSibukFoto] = useState(false);
  const ubah = (k) => (e) => setIsi((x) => ({ ...x, [k]: e.target.value }));
  const rek = statusRekening(profil);
  // Satu bagian kebuka dalam satu waktu. Rekening kosong = langsung dibuka biar keisi.
  const [buka, setBuka] = useState(null);
  const [udahAwal, setUdahAwal] = useState(false);
  if (profil && !udahAwal) {
    setUdahAwal(true);
    if (rek.id === 'kosong') setBuka('rekening');
  }
  return (
    <>
      <section className="sl-kartu sl-profil">
        <label className="sl-foto-ganti" aria-label="Ganti foto profil">
          <FotoProfil src="/api/saya/foto" ada={profil?.ada_foto} nama={admin.nama} ukuran={72} versi={versiFoto} />
          <span>{sibukFoto ? '…' : 'Ganti'}</span>
          <input
            type="file"
            accept="image/*"
            hidden
            disabled={sibukFoto}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              setSibukFoto(true);
              try {
                await api('PUT', '/saya/foto', { foto: await keWebp(f, 512, 0.85) });
                setPesan('Foto profil diganti.');
                onBerubah(true);
              } catch (err) {
                setPesan('Foto gagal diganti: ' + err.message);
              } finally {
                setSibukFoto(false);
              }
            }}
          />
        </label>
        <div>
          <b>{admin.nama}</b>
          <span className="sl-redup">@{admin.username} · sales</span>
          {link?.terhubung && <span className="sl-redup">Kode sales {link.sales.kode}</span>}
        </div>
      </section>

      {profil && rek.id !== 'siap' && (
        <div className="sl-kartu sl-peringatan">
          {rek.id === 'kosong'
            ? 'Rekening pencairan belum lengkap. Isi di bawah biar bagi hasilmu bisa ditransfer tiap tanggal 5.'
            : 'Rekening barumu lagi dicek admin. Sampai dicek, transfer bagi hasil ditahan dulu.'}
        </div>
      )}
      {profil && (
        <Lipat
          judul="Rekening pencairan"
          ringkas={rek.id === 'kosong' ? 'Belum diisi' : `${profil.bank} ${samarRekening(profil.rekening)} · a.n. ${profil.atas_nama}`}
          status={rek.id === 'siap' ? ['berhasil', 'Udah dicek'] : rek.id === 'cek' ? ['pikir', 'Lagi dicek'] : ['ditolak', 'Belum diisi']}
          terbuka={buka === 'rekening'}
          onToggle={() => setBuka((x) => (x === 'rekening' ? null : 'rekening'))}
        >
          <FormRekening api={api} profil={profil} setPesan={setPesan} onSelesai={() => (onBerubah(false), setBuka(null))} />
        </Lipat>
      )}
      {profil && (
        <Lipat
          judul="Data diri"
          ringkas={ringkasDataDiri(profil)}
          terbuka={buka === 'data'}
          onToggle={() => setBuka((x) => (x === 'data' ? null : 'data'))}
        >
          <FormDataDiri api={api} profil={profil} setPesan={setPesan} onSelesai={() => (onBerubah(false), setBuka(null))} />
        </Lipat>
      )}

      <Lipat judul="Ganti password" ringkas="Buat masuk ke Makalin" terbuka={buka === 'password'} onToggle={() => setBuka((x) => (x === 'password' ? null : 'password'))}>
      <form
        className="sl-lipat-form"
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
      </Lipat>
      <button className="sl-tombol keluar" onClick={() => onKeluar()}>
        Keluar
      </button>
    </>
  );
}

// Bagian yang bisa dibuka-tutup (animasi tinggi lewat grid-template-rows). Isi yang ketutup di-`inert` biar nggak
// kena Tab / pembaca layar.
function Lipat({ judul, ringkas, status, terbuka, onToggle, children }) {
  const id = 'lipat-' + judul.toLowerCase().replace(/\W+/g, '-');
  return (
    <section className={'sl-kartu sl-lipat' + (terbuka ? ' buka' : '')}>
      <button type="button" className="sl-lipat-kepala" aria-expanded={terbuka} aria-controls={id} onClick={onToggle}>
        <span className="sl-lipat-teks">
          <b>{judul}</b>
          <span className="sl-redup">{ringkas}</span>
        </span>
        {status && <span className={`sl-hasil ${status[0]}`}>{status[1]}</span>}
        <span className="sl-lipat-panah" aria-hidden="true" />
      </button>
      <div className="sl-lipat-isi" id={id} inert={!terbuka}>
        <div className="sl-lipat-dalam">{children}</div>
      </div>
    </section>
  );
}
function ringkasDataDiri(p) {
  const kurang = [!p.no_hp && 'no. HP', !p.email && 'email', !p.nik_ktp && 'NIK'].filter(Boolean);
  const isi = [tampilNoHp(p.no_hp), p.lokasi].filter(Boolean).join(' · ');
  return kurang.length ? `Belum diisi: ${kurang.join(', ')}` : isi || 'Lengkap';
}

const tampilNoHp = (hp) => (hp ? (hp.startsWith('62') ? '0' + hp.slice(2) : hp) : '');

function FormRekening({ api, profil, setPesan, onSelesai }) {
  const [isi, setIsi] = useState({ bank: profil.bank || '', rekening: profil.rekening || '', atas_nama: profil.atas_nama || '', npwp: profil.npwp || '' });
  const [error, setError] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const ubah = (k) => (e) => setIsi((x) => ({ ...x, [k]: e.target.value }));
  const ewallet = EWALLET.includes(isi.bank);
  const gantiRek = ['bank', 'rekening', 'atas_nama'].some((k) => (isi[k] || '').replace(k === 'rekening' ? /[\s.-]/g : /^$/, '').trim() !== (profil[k] || ''));
  return (
    <form
      className="sl-lipat-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setError('');
        setSibuk(true);
        try {
          const h = await api('PATCH', '/saya/profil', isi);
          setPesan(h.rekeningBerubah ? 'Rekening disimpan. Nunggu dicek admin dulu ya.' : 'Disimpan.');
          onSelesai();
        } catch (err) {
          setError(err.message);
        } finally {
          setSibuk(false);
        }
      }}
    >
      <span className="sl-redup">Bagi hasil ditransfer ke sini tiap tanggal 5. Nama pemilik harus sama dengan KTP kamu.</span>
      <div className="field">
        <label htmlFor="sl-bank">Bank / e-wallet</label>
        <input id="sl-bank" value={isi.bank} onChange={ubah('bank')} list="sl-daftar-bank" placeholder="BCA" required />
        <datalist id="sl-daftar-bank">
          {DAFTAR_BANK.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
      </div>
      <div className="field">
        <label htmlFor="sl-rek">{ewallet ? `Nomor ${isi.bank}` : 'Nomor rekening'}</label>
        <input id="sl-rek" value={isi.rekening} onChange={ubah('rekening')} inputMode="numeric" maxLength={30} required />
      </div>
      <div className="field">
        <label htmlFor="sl-an">Atas nama</label>
        <input id="sl-an" value={isi.atas_nama} onChange={ubah('atas_nama')} maxLength={100} required />
      </div>
      <div className="field">
        <label htmlFor="sl-npwp">NPWP (kalau ada)</label>
        <input id="sl-npwp" value={isi.npwp} onChange={ubah('npwp')} inputMode="numeric" maxLength={25} />
      </div>
      {gantiRek && profil.rekening && <p className="sl-redup" style={{ marginTop: 10 }}>Rekening yang diganti perlu dicek admin lagi sebelum bisa ditransfer.</p>}
      {error && <p className="adm-error">{error}</p>}
      <button className="sl-tombol" type="submit" disabled={sibuk} style={{ marginTop: 14 }}>
        {sibuk ? 'Menyimpan…' : 'Simpan rekening'}
      </button>
    </form>
  );
}

function FormDataDiri({ api, profil, setPesan, onSelesai }) {
  const [isi, setIsi] = useState({
    no_hp: tampilNoHp(profil.no_hp),
    email: profil.email || '',
    nik_ktp: profil.nik_ktp || '',
    tanggal_lahir: profil.tanggal_lahir || '',
    lokasi: profil.lokasi || '',
    alamat: profil.alamat || '',
  });
  const [error, setError] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const ubah = (k) => (e) => setIsi((x) => ({ ...x, [k]: e.target.value }));
  return (
    <form
      className="sl-lipat-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setError('');
        setSibuk(true);
        try {
          await api('PATCH', '/saya/profil', isi);
          setPesan('Data diri disimpan.');
          onSelesai();
        } catch (err) {
          setError(err.message);
        } finally {
          setSibuk(false);
        }
      }}
    >
      <div className="field">
        <label htmlFor="sl-hp">No. HP / WA</label>
        <input id="sl-hp" value={isi.no_hp} onChange={ubah('no_hp')} inputMode="tel" />
      </div>
      <div className="field">
        <label htmlFor="sl-email">Email (buat kabar pencairan bagi hasil)</label>
        <input id="sl-email" type="email" value={isi.email} onChange={ubah('email')} autoCapitalize="none" />
      </div>
      <div className="field">
        <label htmlFor="sl-nik">NIK KTP</label>
        <input id="sl-nik" value={isi.nik_ktp} onChange={ubah('nik_ktp')} inputMode="numeric" maxLength={20} placeholder="16 angka" />
      </div>
      <div className="field">
        <label htmlFor="sl-lahir">Tanggal lahir</label>
        <input id="sl-lahir" type="date" value={isi.tanggal_lahir} onChange={ubah('tanggal_lahir')} />
      </div>
      <div className="field">
        <label htmlFor="sl-kota">Kota / area</label>
        <input id="sl-kota" value={isi.lokasi} onChange={ubah('lokasi')} maxLength={60} />
      </div>
      <div className="field">
        <label htmlFor="sl-alamat">Alamat</label>
        <textarea id="sl-alamat" value={isi.alamat} onChange={ubah('alamat')} rows={2} maxLength={300} />
      </div>
      {error && <p className="adm-error">{error}</p>}
      <button className="sl-tombol" type="submit" disabled={sibuk} style={{ marginTop: 14 }}>
        {sibuk ? 'Menyimpan…' : 'Simpan data diri'}
      </button>
    </form>
  );
}
