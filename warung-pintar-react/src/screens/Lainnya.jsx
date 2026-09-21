import { useEffect, useRef, useState } from 'react';
import { Ikon } from '../lib/icons.jsx';
import { useApp } from '../state/AppContext.jsx';
import { WARNA, FONTS, UKURAN } from '../lib/data';
import { escapeHtml, tampilNoHp, rupiah, inisial } from '../lib/format';
import { mintaIzinMedia } from '../lib/mic';
import { terpasangSebagaiApp } from '../lib/pwa';
import { api } from '../lib/api.js';
import { PIN_GAMPANG, hashPinLokal } from '../lib/pin';
import KartuPaket from '../components/KartuPaket.jsx';
import KonfirmasiHapus from '../components/KonfirmasiHapus.jsx';
import Onboarding from './Onboarding.jsx';
import { BARCODE, KEBUTUHAN, PENJAGA, labelJenisUsaha } from '../lib/profilUsaha';
import mangWarungImg from '../assets/mangwarung.webp';

export default function Lainnya() {
  const { S, dispatch, goTo, kosongkanCart, setPelangganTerpilih, logout, authWarung, profilUsaha } = useApp();
  const [sheet, setSheet] = useState(null); // 'warna' | 'font' | 'ukuran' | 'pass' | 'pin' | 'nohp' | null
  const ukuranAktif = UKURAN.find((u) => u.k === S.ukuran) || UKURAN[1];

  const warnaAktif = WARNA.find((w) => w.h === S.warna) || WARNA[0];

  // Konfirmasi keluar lewat popup app (dulu window.confirm() bawaan browser - tampilannya beda-beda tiap HP).
  const [yakinKeluar, setYakinKeluar] = useState(false);
  const keluarAkun = () => {
    setYakinKeluar(false);
    kosongkanCart();
    setPelangganTerpilih(null);
    logout();
  };

  return (
    <>
      <div style={{ paddingTop: 14 }}>
        <p className="p-h1">Lainnya</p>
        <p className="p-sub">Laporan, pengaturan, dan akun</p>
      </div>

      <div className="menu">
        <button className="mrow hi" onClick={() => goTo('s-laporan')}>
          <span className="ic">
            <svg viewBox="0 0 24 24">
              <path d="M4 19V5M4 19h16M8 16V11M12.5 16V7.5M17 16v-4" />
            </svg>
          </span>
          <span className="tx">
            <b>Laporan untung rugi</b>
            <span>Grafik harian &amp; ringkasan minggu ini</span>
          </span>
          <span className="ar">›</span>
        </button>
        <button className="mrow" onClick={() => goTo('s-pelanggan')}>
          <span className="ic">
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="8" r="3.4" />
              <path d="M5 19.5c1.4-3.4 4-5 7-5s5.6 1.6 7 5" />
            </svg>
          </span>
          <span className="tx">
            <b>Pelanggan</b>
            <span>Daftar langganan &amp; kasbon</span>
          </span>
          <span className="ar">›</span>
        </button>
        <button className="mrow" onClick={() => goTo('s-riwayat')}>
          <span className="ic">
            <svg viewBox="0 0 24 24">
              <path d="M6 4h12v16l-6-3-6 3z" />
              <path d="M9.5 9h5M9.5 12.5h5" />
            </svg>
          </span>
          <span className="tx">
            <b>Riwayat serah terima</b>
            <span>Catatan tiap giliran jaga</span>
          </span>
          <span className="ar">›</span>
        </button>
        <button className="mrow" onClick={() => setSheet('memori')}>
          <span className="ic">
            <svg viewBox="0 0 24 24">
              <path d="M9 18h6M10 21h4" />
              <path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3Z" />
            </svg>
          </span>
          <span className="tx">
            <b>Memori Mang AI</b>
            <span>Hal yang diinget Mang AI tentang warungmu</span>
          </span>
          <span className="ar">›</span>
        </button>
        <button className="mrow" onClick={() => setSheet('profil')}>
          <span className="ic">
            <svg viewBox="0 0 24 24">
              <path d="M4 9.3 5 4h14l1 5.3" />
              <path d="M5 9.8V20h14V9.8" />
              <path d="M10 20v-5a2 2 0 0 1 4 0v5" />
            </svg>
          </span>
          <span className="tx">
            <b>Profil usaha</b>
            <span>{labelJenisUsaha(profilUsaha?.data) || 'Belum diisi - biar saran Mang AI pas sama usahamu'}</span>
          </span>
          <span className="ar">›</span>
        </button>
      </div>

      <p className="p-sec">Aplikasi</p>
      <BarisPasangApp />
      <BarisIzinMedia />

      <p className="p-sec">Langganan</p>
      <SectionLangganan />

      <p className="p-sec">Tampilan</p>
      <div className="seg">
        <button className={S.tema === 't-mono' ? 'on' : ''} onClick={() => dispatch({ type: 'SET_TEMA', tema: 't-mono' })}>
          Terang
        </button>
        <button className={S.tema === 't-dark' ? 'on' : ''} onClick={() => dispatch({ type: 'SET_TEMA', tema: 't-dark' })}>
          Gelap
        </button>
      </div>
      <div className="menu" style={{ marginTop: 12 }}>
        <button className="mrow" onClick={() => setSheet('warna')}>
          <span className="ic aksen">
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="8" />
              <path d="M12 4a8 8 0 0 1 0 16" />
            </svg>
          </span>
          <span className="tx">
            <b>Warna utama</b>
            <span>{warnaAktif.n}</span>
          </span>
          <span className="ar">
            <span style={{ display: 'inline-block', width: 26, height: 26, borderRadius: 10, background: S.warna, verticalAlign: 'middle' }} />
          </span>
        </button>
        <button className="mrow" onClick={() => setSheet('font')}>
          <span className="ic">
            <svg viewBox="0 0 24 24">
              <path d="M5 18 10 6l5 12M6.8 14h6.4M16 18h4" />
            </svg>
          </span>
          <span className="tx">
            <b>Jenis huruf</b>
            <span>{S.font}</span>
          </span>
          <span className="ar">›</span>
        </button>
        <button className="mrow" onClick={() => setSheet('ukuran')}>
          <span className="ic">
            <svg viewBox="0 0 24 24">
              <path d="M6 7h12M6 12h8M6 17h5" />
            </svg>
          </span>
          <span className="tx">
            <b>Ukuran teks</b>
            <span>{ukuranAktif.n}</span>
          </span>
          <span className="ar">›</span>
        </button>
      </div>

      <p className="p-sec">Akun &amp; keamanan</p>
      <div className="menu">
        <button className="mrow" disabled style={{ cursor: 'default' }}>
          <span className="ic">
            <svg viewBox="0 0 24 24">
              <rect x="3.5" y="6" width="17" height="12" rx="3" />
              <path d="M4.5 8.5 12 13l7.5-4.5" />
            </svg>
          </span>
          <span className="tx">
            <b>{authWarung?.nama || 'Warung'}</b>
            <span>Username: {authWarung?.username}</span>
          </span>
        </button>
        <button className="mrow" onClick={() => setSheet('nohp')}>
          <span className={authWarung?.noHp ? 'ic' : 'ic aksen'}>
            <svg viewBox="0 0 24 24">
              <rect x="7" y="3" width="10" height="18" rx="2.5" />
              <path d="M11 18.5h2" />
            </svg>
          </span>
          <span className="tx">
            <b>Nomor HP pemulihan</b>
            {/* Akun yang dibikin sebelum fitur ini ada nomornya masih kosong - dikasih peringatan
                jelas, bukan cuma strip, karena tanpa nomor mereka nggak punya jalan pulih sama
                sekali kalau lupa sandi (nggak ada CS yang bisa reset manual). */}
            <span style={authWarung?.noHp ? undefined : { color: '#e5484d' }}>
              {authWarung?.noHp ? tampilNoHp(authWarung.noHp) : 'Belum diisi - isi sekarang biar bisa pulih kalau lupa sandi'}
            </span>
          </span>
          <span className="ar">›</span>
        </button>
        <button className="mrow" onClick={() => setSheet('pass')}>
          <span className="ic">
            <svg viewBox="0 0 24 24">
              <rect x="4.5" y="10.5" width="15" height="9.5" rx="3" />
              <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
            </svg>
          </span>
          <span className="tx">
            <b>Ganti kata sandi</b>
            <span>Terakhir diubah 2 bulan lalu</span>
          </span>
          <span className="ar">›</span>
        </button>
        <button className="mrow" onClick={() => setSheet('pin')}>
          <span className="ic">
            <svg viewBox="0 0 24 24">
              <rect x="4" y="4" width="16" height="16" rx="4" />
              <circle cx="9" cy="10" r="1.2" fill="currentColor" stroke="none" />
              <circle cx="15" cy="10" r="1.2" fill="currentColor" stroke="none" />
              <circle cx="9" cy="15" r="1.2" fill="currentColor" stroke="none" />
              <circle cx="15" cy="15" r="1.2" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <span className="tx">
            <b>Ganti PIN</b>
            <span>PIN 4 angka untuk buka data modal</span>
          </span>
          <span className="ar">›</span>
        </button>
        <button className="mrow" onClick={() => dispatch({ type: 'KOSONGKAN_PENJAGA' })}>
          <span className="ic">
            <svg viewBox="0 0 24 24">
              <path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13A1.5 1.5 0 0 1 18.5 20H15" />
              <path d="M10 8l-4 4 4 4M6 12h9" />
            </svg>
          </span>
          <span className="tx">
            <b>Ganti penjaga</b>
            <span>Sedang jaga: {S.penjagaAktif || '-'}</span>
          </span>
          <span className="ar">›</span>
        </button>
        <button className="mrow" onClick={() => setYakinKeluar(true)}>
          <span className="ic">
            <svg viewBox="0 0 24 24">
              <path d="M9 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20H9" />
              <path d="M15 15.5 19.5 11 15 6.5M19.5 11h-11" />
            </svg>
          </span>
          <span className="tx">
            <b>Keluar akun</b>
            <span>Keluar dari akun warung di HP ini</span>
          </span>
          <span className="ar">›</span>
        </button>
      </div>

      <p className="p-sec">Bantuan Konsulin</p>
      <div className="linkrow">
        <a href="https://www.konsulin.com" target="_blank" rel="noopener noreferrer">
          <Ikon nama="web" /> Website Konsulin
        </a>
        <a href="https://wa.me/6281234567890" target="_blank" rel="noopener noreferrer">
          <Ikon nama="chat" /> WhatsApp Konsulin
        </a>
      </div>

      {sheet === 'warna' && <SheetWarna onClose={() => setSheet(null)} />}
      {sheet === 'font' && <SheetFont onClose={() => setSheet(null)} />}
      {sheet === 'ukuran' && <SheetUkuran onClose={() => setSheet(null)} />}
      {sheet === 'pass' && <SheetPass onClose={() => setSheet(null)} />}
      {sheet === 'pin' && <SheetGantiPin onClose={() => setSheet(null)} />}
      {sheet === 'memori' && <SheetMemori onClose={() => setSheet(null)} />}
      {sheet === 'profil' && <SheetProfilUsaha onClose={() => setSheet(null)} />}
      {yakinKeluar && (
        <KonfirmasiHapus
          judul="Keluar dari akun?"
          pesan="Kamu keluar dari akun warung ini di HP ini. Data warung tetap aman di server - tinggal login lagi."
          labelYa="Ya, keluar"
          onYa={keluarAkun}
          onBatal={() => setYakinKeluar(false)}
        />
      )}
      {sheet === 'nohp' && <SheetNoHp onClose={() => setSheet(null)} />}
    </>
  );
}

// Harga di sini cuma buat tampilan - sumber kebenarannya tetap di backend (HARGA_PLAN di
// midtrans.service.js). Samain juga dengan daftar plan di LisensiHabis.jsx kalau harganya berubah.
// `jatahAi` juga cuma tampilan - sumber kebenarannya JATAH_TOKEN_HARIAN di aiQuota.service.js
function SectionLangganan() {
  const { lisensi, mulaiCheckout, toast } = useApp();
  const [buka, setBuka] = useState(false); // baris status di-tap dulu baru pilihan plan-nya kebuka
  // Tinggi isi akordeon DIUKUR, nggak dipatok angka. Dulu CSS-nya nahan max-height:600px dengan
  // catatan "kontennya nggak akan setinggi itu" - dan itu basi begitu isinya nambah: tombol
  // bayarnya kepotong separuh di HP. ResizeObserver dipakai karena tingginya BERUBAH walau lagi
  // kebuka (daftar manfaat beda panjang tiap paket dipilih), jadi ngukur sekali aja nggak cukup.
  const isiRef = useRef(null);
  const [tinggiIsi, setTinggiIsi] = useState(0);
  useEffect(() => {
    const el = isiRef.current;
    if (!el) return;
    const ukur = () => setTinggiIsi(el.scrollHeight);
    ukur();
    const ro = new ResizeObserver(ukur);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [pilih, setPilih] = useState('bulanan');
  const [loading, setLoading] = useState(false);

  if (!lisensi) return null;

  const sisaHari = Math.max(0, Math.ceil((new Date(lisensi.berlakuSampai) - new Date()) / 86400000));
  const labelPlan = { trial: 'Masa coba gratis', bulanan: 'Bulanan', triwulan: '3 Bulan', tahunan: 'Tahunan', permanen: 'Permanen' }[lisensi.plan] || lisensi.plan;
  // Paket datang dari backend (lisensi.paket) - satu sumber harga sama yang ditagih Midtrans.
  const paket = lisensi.paket || [];
  const planAktif = paket.find((p) => p.id === pilih) || paket[0];
  // paket permanen di-backend direpresentasiin "berlaku 100 tahun" - nampilin "36500 hari lagi"
  // apa adanya bakal aneh/nggak masuk akal buat user, tampilin "Aktif selamanya" aja
  const statusMasaAktif = lisensi.plan === 'permanen' ? 'Aktif selamanya' : sisaHari > 0 ? `${sisaHari} hari lagi` : 'Sudah habis';

  const bayar = async () => {
    setLoading(true);
    try {
      await mulaiCheckout(pilih);
    } catch (e) {
      toast(e.message ? escapeHtml(e.message) : 'Gagal membuka halaman pembayaran');
      setLoading(false);
    }
  };

  return (
    <>
      <div className="menu">
        {/* baris status ini sekaligus tombol buka/tutup - baru kalau di-tap, kartu pilihan plan
            + tombol bayarnya kebuka di bawah (bukan langsung nongol semua sekaligus) */}
        <button className="mrow" onClick={() => setBuka((v) => !v)}>
          <span className="ic aksen">
            <svg viewBox="0 0 24 24">
              <rect x="3.5" y="5.5" width="17" height="13" rx="3" />
              <path d="M3.5 10h17" />
            </svg>
          </span>
          <span className="tx">
            <b>{labelPlan}</b>
            <span>{statusMasaAktif}</span>
          </span>
          <span className={'ar panah' + (buka ? ' buka' : '')}>›</span>
        </button>
      </div>

      {/* Jatah token AI HARIAN (fitur scan/nota/suara AI - lihat aiQuota.service.js backend, BUKAN
          chat Mang AI yang nggak kena batasan) - kartu `.menu` TERPISAH sendiri (bukan numpuk di
          dalam kartu status plan di atas) biar tampilannya konsisten sama baris menu lain (Laporan/
          Pelanggan/Riwayat) - icon box 44px + teks, cuma di sini bukan tombol navigasi (murni info,
          nggak ada aksi tap). Reset otomatis tiap hari jam 00:00. */}
      {lisensi.aiUsage && (
        <div className="menu" style={{ marginTop: 12 }}>
          <div className="mrow" style={{ cursor: 'default' }}>
            <span className="ic aksen" style={{ overflow: 'hidden', padding: 0 }}>
              <img src={mangWarungImg} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </span>
            <span className="tx" style={{ flex: 1 }}>
              <b>Jatah AI Mang Warung</b>
              <span>Mang AI v1 55B · paling ngerti warung kamu</span>
            </span>
            <b style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--abu)', whiteSpace: 'nowrap' }}>
              {lisensi.aiUsage.terpakai.toLocaleString('id-ID')} / {lisensi.aiUsage.jatah.toLocaleString('id-ID')}
            </b>
          </div>
          <div style={{ padding: '0 16px 18px' }}>
            <div className="bar">
              <i
                style={{
                  width: Math.max(3, lisensi.aiUsage.persen) + '%',
                  background: lisensi.aiUsage.persen >= 100 ? '#e5484d' : lisensi.aiUsage.persen >= 80 ? '#f5a623' : 'var(--aksen)',
                }}
              />
            </div>
            {lisensi.aiUsage.persen >= 100 && (
              <p style={{ fontSize: 12, color: '#e5484d', margin: '10px 0 0', fontWeight: 600 }}>
                Habis buat hari ini - reset otomatis besok jam 00:00, atau upgrade plan buat jatah lebih besar.
              </p>
            )}
          </div>
        </div>
      )}

      {/* kontennya TETAP di-render pas ketutup (bukan {buka && ...} yang langsung ilang), biar
          transisi CSS-nya (grid-template-rows + fade) sempet jalan mulus - bukan lompat instan */}
      <div className={'geser-akordeon' + (buka ? ' buka' : '')} style={{ maxHeight: buka ? tinggiIsi : 0 }}>
        <div ref={isiRef}>
          {/* Daftar manfaat ikut PAKET YANG DIPILIH, bukan satu daftar buat semua - jadi bedanya
              kelihatan waktu user nge-tap kartu yang lain. Isinya datang dari backend, dan SENGAJA
              cuma nyebut yang beneran beda: di aplikasi ini nggak ada fitur yang dikunci per paket
              (middleware cuma ngecek langganan aktif), yang beda cuma jatah AI & durasinya. Nulis
              fitur eksklusif yang nggak ada itu janji palsu yang balik jadi komplain. */}
          {planAktif?.manfaat?.length > 0 && (
            <div className="card" style={{ marginTop: 4 }}>
              <p className="p-sub" style={{ margin: '0 0 12px', fontWeight: 700, color: 'var(--ink)' }}>
                Yang kamu dapat di paket {planAktif.label}
              </p>
              {planAktif.manfaat.map((m) => (
                <div key={m} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 9 }}>
                  <span
                    style={{
                      width: 20, height: 20, borderRadius: 7, flex: 'none', marginTop: 1,
                      background: 'var(--brand)', color: '#0A0A0A',
                      display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800,
                    }}
                  >
                    ✓
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>{m}</span>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 2 }}>
                <img src={mangWarungImg} alt="" style={{ width: 20, height: 20, objectFit: 'contain', flex: 'none' }} />
                <span style={{ fontSize: 14, fontWeight: 600 }}>
                  Jatah AI {Number(planAktif.jatahAi).toLocaleString('id-ID')} token/hari
                </span>
              </div>
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <KartuPaket paket={paket} pilih={pilih} onPilih={setPilih} />
          </div>

          {planAktif && <p className="opnhint" style={{ marginTop: 12 }}>{planAktif.sub}</p>}

          <button className="btn utama" style={{ width: '100%', marginTop: 10 }} onClick={bayar} disabled={loading || !planAktif}>
            {loading ? 'Membuka pembayaran…' : planAktif ? `Lanjut bayar - ${rupiah(planAktif.harga)}` : 'Memuat paket…'}
          </button>
          <p className="opnhint" style={{ marginTop: 10, textAlign: 'center' }}>
            Pembayaran lewat QRIS. Langganan nggak otomatis diperpanjang - kamu yang atur sendiri
            kapan mau lanjut.
          </p>
        </div>
      </div>
    </>
  );
}

function SheetWarna({ onClose }) {
  const { S, dispatch, toast } = useApp();
  return (
    <div className="sheet show">
      <div className="panel">
        <h3>Warna utama</h3>
        <p>Pilih warna aksen warungmu. Semua tombol penting ikut berubah.</p>
        <div className="warna-grid">
          {WARNA.map((w) => (
            <button
              key={w.h}
              className={'sw' + (S.warna === w.h ? ' on' : '')}
              style={{ background: w.h }}
              title={w.n}
              aria-label={w.n}
              onClick={() => {
                dispatch({ type: 'SET_WARNA', warna: w.h });
                toast(`Warna utama: <b>${w.n}</b>`);
              }}
            />
          ))}
        </div>
        <button className="btn utama" style={{ width: '100%', marginTop: 22 }} onClick={onClose}>
          Selesai
        </button>
      </div>
    </div>
  );
}

function SheetFont({ onClose }) {
  const { S, dispatch, toast } = useApp();
  return (
    <div className="sheet show">
      <div className="panel">
        <h3>Jenis huruf</h3>
        <p>Pilih huruf yang paling enak dibaca.</p>
        <div className="fontlist">
          {FONTS.map((f) => (
            <button
              key={f.n}
              className={'fbtn' + (S.font === f.n ? ' on' : '')}
              onClick={() => {
                dispatch({ type: 'SET_FONT', font: f.n });
                toast(`Huruf diganti ke <b>${f.n}</b>`);
              }}
            >
              <span style={{ fontFamily: f.f + ',sans-serif' }}>
                {f.n}
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--abu)', marginTop: 3 }}>{f.d}</span>
              </span>
              <span className="cek">✓</span>
            </button>
          ))}
        </div>
        <button className="btn utama" style={{ width: '100%', marginTop: 20 }} onClick={onClose}>
          Selesai
        </button>
      </div>
    </div>
  );
}

function SheetUkuran({ onClose }) {
  const { S, dispatch, toast } = useApp();
  return (
    <div className="sheet show">
      <div className="panel">
        <h3>Ukuran teks</h3>
        <p>Pilih yang paling nyaman dibaca. Berlaku di semua halaman.</p>
        <div className="fontlist">
          {UKURAN.map((u) => (
            <button
              key={u.k}
              className={'fbtn' + (S.ukuran === u.k ? ' on' : '')}
              onClick={() => {
                dispatch({ type: 'SET_UKURAN', ukuran: u.k });
                toast(`Ukuran teks: <b>${u.n}</b>`);
              }}
            >
              <span className={'sz-' + u.k}>
                <span style={{ fontSize: 'var(--body)', fontWeight: 700 }}>{u.n}</span>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--abu)', marginTop: 3 }}>{u.d}</span>
              </span>
              <span className="cek">✓</span>
            </button>
          ))}
        </div>
        <button className="btn utama" style={{ width: '100%', marginTop: 20 }} onClick={onClose}>
          Selesai
        </button>
      </div>
    </div>
  );
}

function SheetPass({ onClose }) {
  const { gantiPassword, toast } = useApp();
  const [lama, setLama] = useState('');
  const [baru, setBaru] = useState('');
  const [ulang, setUlang] = useState('');
  const [loading, setLoading] = useState(false);

  const simpan = async () => {
    if (baru.length < 6) return toast('Kata sandi baru minimal 6 karakter');
    if (baru !== ulang) return toast('Ulangi kata sandi belum sama');
    setLoading(true);
    try {
      await gantiPassword(lama, baru);
      toast('Kata sandi berhasil diganti ✓');
      onClose();
    } catch (e) {
      toast(e.message ? escapeHtml(e.message) : 'Gagal mengganti kata sandi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sheet show">
      <div className="panel">
        <h3>Ganti kata sandi</h3>
        <p>Berlaku buat semua HP yang login pakai akun warung ini.</p>
        <div className="field">
          <label>Kata sandi lama</label>
          <input type="password" placeholder="••••••" value={lama} onChange={(e) => setLama(e.target.value)} />
        </div>
        <div className="field">
          <label>Kata sandi baru (min. 6 huruf/angka)</label>
          <input type="password" placeholder="••••••" value={baru} onChange={(e) => setBaru(e.target.value)} />
        </div>
        <div className="field">
          <label>Ulangi kata sandi baru</label>
          <input type="password" placeholder="••••••" value={ulang} onChange={(e) => setUlang(e.target.value)} />
        </div>
        <button className="btn utama" style={{ width: '100%', marginTop: 18 }} onClick={simpan} disabled={loading}>
          {loading ? 'Menyimpan…' : 'Simpan kata sandi'}
        </button>
        <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={onClose}>
          Batal
        </button>
      </div>
    </div>
  );
}

// Ganti PIN — verifikasi lewat kode WhatsApp dulu, baru boleh pasang PIN baru.
//
// PIN berlaku buat SEMUA HP yang login pakai akun ini (disimpan di server). Kode WA membuktikan ini pemiliknya,
// dan PIN barunya disimpan server di langkah yang sama. Gunanya: orang yang kebetulan pegang HP warung yang lagi
// kebuka nggak bisa diam-diam ganti PIN pelindung data modal.
function SheetGantiPin({ onClose }) {
  const { dispatch, authWarung, toast } = useApp();
  const [step, setStep] = useState(1);
  const [noHpSamar, setNoHpSamar] = useState(null);
  const [kode, setKode] = useState('');
  const [baru, setBaru] = useState('');
  const [ulang, setUlang] = useState('');
  const [loading, setLoading] = useState(false);

  const belumPunyaNomor = !authWarung?.noHp;

  const kirimKode = async () => {
    setLoading(true);
    try {
      const r = await api.pinOtp.kirimKode();
      setNoHpSamar(r.noHpSamar || null);
      setStep(2);
      toast('Kode dikirim lewat WhatsApp');
    } catch (e) {
      toast(e.message ? escapeHtml(e.message) : 'Gagal mengirim kode');
    } finally {
      setLoading(false);
    }
  };

  const simpan = async () => {
    if (!/^\d{4}$/.test(baru)) return toast('PIN baru harus 4 angka');
    if (PIN_GAMPANG.has(baru)) return toast('PIN itu gampang ditebak - pilih kombinasi lain ya');
    if (baru !== ulang) return toast('Ulangi PIN belum sama');
    setLoading(true);
    try {
      // Server nyocokin kode & nyimpen PIN baru sekaligus.
      await api.pinOtp.verifikasi(kode.trim(), baru);
      dispatch({ type: 'SET_PIN', pinHash: await hashPinLokal(authWarung?.id, baru) });
      toast('PIN berhasil diganti ✓ - berlaku di semua HP akun ini');
      onClose();
    } catch (e) {
      toast(e.message ? escapeHtml(e.message) : 'Kode salah');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sheet show">
      <div className="panel">
        <h3>Ganti PIN</h3>
        <p>
          {belumPunyaNomor
            ? 'Akun ini belum punya nomor HP pemulihan. Isi dulu lewat menu "Nomor HP pemulihan" di atas.'
            : step === 1
              ? 'Demi keamanan, kami kirim kode ke WhatsApp kamu dulu.'
              : <>Kode dikirim ke WhatsApp <b style={{ color: 'var(--ink)' }}>{noHpSamar || tampilNoHp(authWarung?.noHp)}</b>. Berlaku 10 menit.</>}
        </p>

        {belumPunyaNomor ? null : step === 1 ? (
          <>
            <div className="menu" style={{ marginTop: 14 }}>
              <div className="mrow" style={{ cursor: 'default' }}>
                <span className="ic aksen">
                  <svg viewBox="0 0 24 24">
                    <rect x="7" y="3" width="10" height="18" rx="2.5" />
                    <path d="M11 18.5h2" />
                  </svg>
                </span>
                <span className="tx">
                  <b>Kirim kode ke</b>
                  <span>{tampilNoHp(authWarung?.noHp)}</span>
                </span>
              </div>
            </div>
            <button className="btn utama" style={{ width: '100%', marginTop: 16 }} onClick={kirimKode} disabled={loading}>
              {loading ? 'Mengirim…' : 'Kirim kode verifikasi'}
            </button>
          </>
        ) : (
          <>
            <div className="field">
              <label>Kode verifikasi (6 angka)</label>
              <input value={kode} onChange={(e) => setKode(e.target.value)} inputMode="numeric" maxLength={6} placeholder="______" />
            </div>
            <div className="field">
              <label>PIN baru (4 angka)</label>
              <input value={baru} onChange={(e) => setBaru(e.target.value)} inputMode="numeric" maxLength={4} placeholder="••••" />
            </div>
            <div className="field">
              <label>Ulangi PIN baru</label>
              <input value={ulang} onChange={(e) => setUlang(e.target.value)} inputMode="numeric" maxLength={4} placeholder="••••" />
            </div>
            <button className="btn utama" style={{ width: '100%', marginTop: 16 }} onClick={simpan} disabled={loading}>
              {loading ? 'Menyimpan…' : 'Simpan PIN baru'}
            </button>
            <button className="linkkecil" onClick={kirimKode} disabled={loading}>
              Kirim ulang kode
            </button>
          </>
        )}
        <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={onClose}>
          {belumPunyaNomor ? 'Tutup' : 'Batal'}
        </button>
      </div>
    </div>
  );
}

// Isi/ganti nomor HP pemulihan - 2 langkah (dipaksa backend, lihat auth.routes.js /no-hp/*):
// 1. nomor baru + kata sandi -> kode dikirim ke WA nomor LAMA (izin pemilik) & WA nomor BARU;
// 2. dua kode dimasukin -> nomornya diganti.
// Password doang nggak cukup, karena password sering dibagi (istri, penjaga, akun demo buat sales) - tanpa HP nomor
// lama, nomor pemulihan nggak bisa dipindah orang lain.
function SheetNoHp({ onClose }) {
  const { gantiNoHp, authWarung, toast } = useApp();
  const [noHp, setNoHp] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [permintaan, setPermintaan] = useState(null); // hasil kirim-kode
  const [kodeLama, setKodeLama] = useState('');
  const [kodeBaru, setKodeBaru] = useState('');
  const [error, setError] = useState('');

  const kirimKode = async () => {
    setError('');
    if (noHp.replace(/\D/g, '').length < 10) return setError('Nomor HP belum benar');
    if (!password) return setError('Masukkan kata sandi kamu');
    setLoading(true);
    try {
      setPermintaan(await api.noHp.kirimKode(password, noHp.trim()));
      setKodeLama('');
      setKodeBaru('');
    } catch (e) {
      setError(e.message || 'Gagal kirim kode');
    } finally {
      setLoading(false);
    }
  };

  const verifikasi = async () => {
    setError('');
    if (permintaan.perluKodeLama && kodeLama.length !== 6) return setError('Kode dari nomor lama itu 6 angka');
    if (kodeBaru.length !== 6) return setError('Kode dari nomor baru itu 6 angka');
    setLoading(true);
    try {
      await gantiNoHp(permintaan.id, kodeLama, kodeBaru);
      toast('Nomor HP tersimpan ✓');
      onClose();
    } catch (e) {
      setError(e.message || 'Gagal menyimpan nomor HP');
    } finally {
      setLoading(false);
    }
  };

  const inputKode = (nilai, set, label) => (
    <div className="field">
      <label>{label}</label>
      <input
        value={nilai}
        onChange={(e) => set(e.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder="______"
      />
    </div>
  );

  return (
    <div className="sheet show">
      <div className="panel">
        <h3>Nomor HP pemulihan</h3>
        {!permintaan ? (
          <>
            <p>
              {authWarung?.noHp ? (
                <>
                  Nomor sekarang <b>{tampilNoHp(authWarung.noHp)}</b>. Buat ganti, kode dikirim ke WhatsApp nomor ini{' '}
                  <b>dan</b> nomor baru - jadi cuma pemilik nomor sekarang yang bisa mindahinnya.
                </>
              ) : (
                'Dipakai buat kirim kode kalau kamu lupa kata sandi atau mau ganti PIN. Pakai nomor yang WhatsApp-nya aktif.'
              )}
            </p>
            <div className="field">
              <label>Nomor HP baru (WhatsApp)</label>
              <input value={noHp} onChange={(e) => setNoHp(e.target.value)} inputMode="tel" placeholder="0812-3456-7890" />
            </div>
            <div className="field">
              <label>Kata sandi kamu (buat memastikan)</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" />
            </div>
          </>
        ) : (
          <>
            <p>
              {permintaan.perluKodeLama ? (
                <>
                  Kode dikirim ke WhatsApp nomor lama <b style={{ whiteSpace: 'nowrap' }}>{permintaan.noHpLamaSamar}</b> dan nomor baru{' '}
                  <b style={{ whiteSpace: 'nowrap' }}>{permintaan.noHpBaruSamar}</b>. Berlaku {permintaan.berlakuMenit || 10} menit.
                </>
              ) : (
                <>
                  Kode dikirim ke WhatsApp <b style={{ whiteSpace: 'nowrap' }}>{permintaan.noHpBaruSamar}</b>. Berlaku {permintaan.berlakuMenit || 10} menit.
                </>
              )}
            </p>
            {permintaan.perluKodeLama && inputKode(kodeLama, setKodeLama, `Kode dari nomor lama (${permintaan.noHpLamaSamar})`)}
            {inputKode(kodeBaru, setKodeBaru, permintaan.perluKodeLama ? `Kode dari nomor baru (${permintaan.noHpBaruSamar})` : 'Kode verifikasi')}
          </>
        )}
        {error && <p style={{ color: '#e5484d', fontWeight: 600, marginTop: 10 }}>{error}</p>}
        <button className="btn utama" style={{ width: '100%', marginTop: 18 }} onClick={permintaan ? verifikasi : kirimKode} disabled={loading}>
          {loading ? 'Memproses…' : permintaan ? 'Verifikasi & simpan' : 'Kirim kode'}
        </button>
        <button
          className="btn"
          style={{ width: '100%', marginTop: 10 }}
          onClick={() => {
            if (permintaan) {
              setPermintaan(null);
              setError('');
            } else onClose();
          }}
          disabled={loading}
        >
          {permintaan ? 'Kembali' : 'Batal'}
        </button>
      </div>
    </div>
  );
}

// Penanda LOKAL "izin kamera+mic udah pernah dikasih di HP ini". BUKAN sumber kebenaran - user
// bisa nyabut izinnya lewat setelan browser kapan aja tanpa aplikasi ini tau. Gunanya cuma biar
// barisnya berhenti ngajak-ngajak di HP yang emang udah beres, khususnya di Safari yang nggak
// punya Permissions API buat kamera/mikrofon (lihat cekIzin di bawah).
const KUNCI_IZIN_MEDIA = 'warungpintar_izin_media_v1';

// "Siapkan izin kamera & mikrofon" - minta izinnya SEKALI di waktu senggang, bukan pas lagi
// dipakai.
//
// Kenapa ada: izin kamera/mic itu kepakai di tengah-tengah kerjaan yang lagi buru-buru - scan
// barcode pas pembeli ngantre, "Sebut barang" pas tangan penuh. Kalau dialog izinnya baru nongol
// DI SITU, alurnya putus: pemilik warung nge-tap "Blokir" karena kaget/buru-buru, dan sekali
// diblokir, dialognya NGGAK BAKAL nongol lagi - fiturnya kelihatan rusak selamanya padahal cuma
// salah tap sekali.
//
// getUserMedia-nya minta video + audio BARENGAN dalam satu panggilan, bukan dua panggilan
// terpisah: Chrome nampilin SATU dialog buat dua-duanya kalau dimintanya sekaligus. Dua panggilan
// = dua dialog beruntun, dan yang kedua paling sering keburu ditutup.
function BarisIzinMedia() {
  const { toast, openIzin } = useApp();
  const [status, setStatus] = useState(() => {
    try {
      return localStorage.getItem(KUNCI_IZIN_MEDIA) === 'ya' ? 'siap' : 'belum';
    } catch {
      return 'belum'; // mode privat / storage diblokir - anggap belum, paling-paling nawarin ulang
    }
  });
  const [lagiMinta, setLagiMinta] = useState(false);

  // Status ASLI dari browser kalau dia mau ngasih tau. Chrome/Edge bisa; Safari nolak query buat
  // 'camera'/'microphone' (dilempar sebagai error), makanya dibungkus try - kalau gagal, penanda
  // lokal di atas yang dipakai apa adanya.
  useEffect(() => {
    let batal = false;
    const langganan = [];
    (async () => {
      if (!navigator.permissions?.query) return;
      try {
        const hasil = await Promise.all([
          navigator.permissions.query({ name: 'camera' }),
          navigator.permissions.query({ name: 'microphone' }),
        ]);
        if (batal) return;
        const perbarui = () => {
          const keadaan = hasil.map((h) => h.state);
          if (keadaan.includes('denied')) setStatus('ditolak');
          else if (keadaan.every((k) => k === 'granted')) setStatus('siap');
          else setStatus('belum');
        };
        perbarui();
        // Ikutin perubahannya, jangan cuma dibaca sekali pas dipasang. Izinnya bisa berubah dari
        // LUAR baris ini: lewat tombol "Sudah, cek lagi" di panduan (SheetIzin), atau user ngubah
        // sendiri di setelan HP terus balik ke aplikasi. Tanpa ini, barisnya nyangkut bilang
        // "Diblokir" padahal izinnya barusan dikasih - dan itu kejadian beneran waktu dites:
        // panduannya bilang "Sip, izinnya udah masuk" tapi barisnya masih merah.
        hasil.forEach((h) => {
          h.onchange = perbarui;
          langganan.push(h);
        });
      } catch {
        /* Safari & kawan-kawan - biarin pakai penanda lokal */
      }
    })();
    return () => {
      batal = true;
      langganan.forEach((h) => {
        h.onchange = null;
      });
    };
  }, []);

  const tap = async () => {
    // Udah diblokir duluan: dialog izinnya NGGAK akan nongol lagi berapa kali pun dicoba, jadi
    // langsung kasih langkah bukanya - bukan nyoba lagi terus gagal diem-diem.
    if (status === 'ditolak') return openIzin();
    setLagiMinta(true);
    const { ok, alasan } = await mintaIzinMedia();
    setLagiMinta(false);
    if (ok) {
      try {
        localStorage.setItem(KUNCI_IZIN_MEDIA, 'ya');
      } catch {
        /* nggak kesimpen - nggak apa-apa, izinnya sendiri tetep kepegang browser */
      }
      setStatus('siap');
      toast(
        alasan === 'sebagian'
          ? 'Izin kesimpen. Yang nggak kedeteksi di HP ini dilewatin ya.'
          : 'Beres. Scan barang & sebut barang nggak bakal nanya izin lagi.'
      );
      return;
    }
    if (alasan === 'ditolak') {
      setStatus('ditolak');
      openIzin();
      return;
    }
    toast(
      alasan === 'tidak-didukung' || alasan === 'tidak-ada-perangkat'
        ? 'Kamera/mikrofonnya nggak kedeteksi di perangkat ini'
        : 'Gagal minta izin. Coba lagi sebentar lagi ya.'
    );
  };

  const keterangan =
    status === 'siap' ? 'Buat scan barang & sebut barang'
    : status === 'ditolak' ? 'Diblokir - tap buat lihat cara ngizinin lagi'
    : lagiMinta ? 'Nunggu jawaban kamu...'
    : 'Biar nggak ditanya pas lagi ngelayanin pembeli';

  return (
    <div className="menu">
      <button className="mrow" onClick={status === 'siap' || lagiMinta ? undefined : tap} disabled={status === 'siap' || lagiMinta}>
        <span className={status === 'siap' ? 'ic' : 'ic aksen'}>
          <svg viewBox="0 0 24 24">
            {/* kamera + titik mic kecil - satu ikon buat dua izin yang diminta barengan */}
            <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h2L9 4h6l1.5 2h2A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z" />
            <circle cx="12" cy="13" r="3.2" />
          </svg>
        </span>
        <span className="tx">
          <b>{status === 'siap' ? 'Kamera & mikrofon siap dipakai' : 'Siapkan izin kamera & mikrofon'}</b>
          <span>{keterangan}</span>
        </span>
        {status !== 'siap' && <span className="ar">›</span>}
      </button>
    </div>
  );
}

// Tombol "Pasang aplikasi" - biar Warung Pintar nongol sebagai ikon di layar HP, kebuka tanpa
// address bar browser, persis kayak aplikasi biasa.
//
// Cara masangnya BEDA JAUH antara Android & iPhone, dan itu yang bikin komponen ini nggak bisa
// cuma satu tombol:
//
//   Android/Chrome - browser ngasih event 'beforeinstallprompt'. Kita tahan event-nya, terus
//                    dipanggil pas user nge-tap. Sekali tap, muncul dialog resmi Android.
//   iPhone/Safari  - Apple NGGAK nyediain event itu sama sekali. Nggak ada cara memicu dialog
//                    dari kode - user WAJIB lewat tombol Share > "Add to Home Screen" manual.
//                    Jadi buat iPhone yang bisa kita kasih cuma petunjuk langkahnya.
//
// Kalau petunjuk iPhone ini nggak ada, pemilik warung ber-iPhone bakal nge-tap tombol yang nggak
// ngapa-ngapain & nyimpulin aplikasinya rusak.
function BarisPasangApp() {
  const [promptPasang, setPromptPasang] = useState(null);
  const [sheetIos, setSheetIos] = useState(false);

  // Udah kebuka SEBAGAI aplikasi terpasang? Pengecekannya pindah ke lib/pwa.js - dulu di sini,
  // dan cuma nyari 'standalone', jadi langsung salah begitu manifest-nya dipindah ke fullscreen.
  const terpasang = terpasangSebagaiApp();

  // iPad generasi baru ngaku-ngaku Macintosh di userAgent, makanya dicek juga lewat maxTouchPoints -
  // Mac beneran nggak punya layar sentuh.
  const iOS =
    typeof navigator !== 'undefined' &&
    (/iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1));

  useEffect(() => {
    const tangkap = (e) => {
      // Ditahan supaya Chrome nggak nampilin banner-nya sendiri di tempat yang nggak kita atur -
      // event-nya disimpen buat dipakai pas user nge-tap baris ini.
      e.preventDefault();
      setPromptPasang(e);
    };
    window.addEventListener('beforeinstallprompt', tangkap);
    const selesai = () => setPromptPasang(null);
    window.addEventListener('appinstalled', selesai);
    return () => {
      window.removeEventListener('beforeinstallprompt', tangkap);
      window.removeEventListener('appinstalled', selesai);
    };
  }, []);

  const tap = async () => {
    if (promptPasang) {
      promptPasang.prompt();
      await promptPasang.userChoice.catch(() => {});
      setPromptPasang(null); // event cuma bisa dipakai SEKALI
      return;
    }
    setSheetIos(true);
  };

  const keterangan = terpasang
    ? 'Sudah terpasang di HP ini'
    : promptPasang
      ? 'Buka langsung dari layar HP, tanpa browser'
      : iOS
        ? 'Lihat caranya buat iPhone'
        : 'Lihat caranya';

  return (
    <>
      <div className="menu">
        <button className="mrow" onClick={terpasang ? undefined : tap} disabled={terpasang} style={terpasang ? { cursor: 'default' } : undefined}>
          <span className={terpasang ? 'ic' : 'ic aksen'}>
            <svg viewBox="0 0 24 24">
              <path d="M12 4v11" />
              <path d="M8 11.5 12 15.5l4-4" />
              <path d="M5 19h14" />
            </svg>
          </span>
          <span className="tx">
            <b>{terpasang ? 'Aplikasi terpasang' : 'Pasang aplikasi di HP'}</b>
            <span>{keterangan}</span>
          </span>
          {!terpasang && <span className="ar">›</span>}
        </button>
      </div>
      {sheetIos && <SheetCaraPasang iOS={iOS} onClose={() => setSheetIos(false)} />}
    </>
  );
}

// Petunjuk manual - dipakai buat iPhone (yang emang nggak punya tombol pasang otomatis), dan juga
// buat browser lain yang belum ngasih event-nya (mis. Chrome yang baru sekali buka situsnya -
// dia nunggu user "cukup sering" berkunjung dulu sebelum nawarin install).
function SheetCaraPasang({ iOS, onClose }) {
  return (
    <div className="sheet show">
      <div className="panel">
        <h3>Pasang di layar HP</h3>
        {iOS ? (
          <>
            <p>
              Di iPhone, pemasangan harus lewat menu Safari - Apple nggak ngizinin aplikasi
              memunculkan tombolnya sendiri. Caranya:
            </p>
            <div className="menu" style={{ marginTop: 12 }}>
              <div className="mrow" style={{ cursor: 'default' }}>
                <span className="ic aksen">1</span>
                <span className="tx"><b>Tap tombol Bagikan</b><span>Ikon kotak dengan panah ke atas, di bawah layar Safari</span></span>
              </div>
              <div className="mrow" style={{ cursor: 'default' }}>
                <span className="ic aksen">2</span>
                <span className="tx"><b>Geser ke bawah</b><span>Cari "Add to Home Screen" / "Tambah ke Layar Utama"</span></span>
              </div>
              <div className="mrow" style={{ cursor: 'default' }}>
                <span className="ic aksen">3</span>
                <span className="tx"><b>Tap Tambah</b><span>Ikon Mang Warung muncul di layar HP</span></span>
              </div>
            </div>
            <p className="opnhint" style={{ marginTop: 12 }}>
              Harus lewat <b>Safari</b>. Kalau kamu buka lewat Chrome atau dari dalam WhatsApp,
              menunya nggak ada.
            </p>
          </>
        ) : (
          <>
            <p>
              Chrome belum nawarin tombol pasang otomatis buat aplikasi ini. Biasanya karena dia
              nunggu kamu beberapa kali buka dulu. Sementara itu bisa lewat menu Chrome:
            </p>
            <div className="menu" style={{ marginTop: 12 }}>
              <div className="mrow" style={{ cursor: 'default' }}>
                <span className="ic aksen">1</span>
                <span className="tx"><b>Tap titik tiga</b><span>Pojok kanan atas layar Chrome</span></span>
              </div>
              <div className="mrow" style={{ cursor: 'default' }}>
                <span className="ic aksen">2</span>
                <span className="tx"><b>Pilih "Tambahkan ke layar Utama"</b><span>Di sebagian Chrome tertulis "Instal aplikasi"</span></span>
              </div>
              <div className="mrow" style={{ cursor: 'default' }}>
                <span className="ic aksen">3</span>
                <span className="tx"><b>Tap Instal</b><span>Ikon Mang Warung muncul di layar HP</span></span>
              </div>
            </div>
            <p className="opnhint" style={{ marginTop: 12 }}>
              Kalau kamu buka dari dalam WhatsApp atau Instagram, menunya nggak lengkap - buka
              dulu di Chrome.
            </p>
          </>
        )}
        <button className="btn utama" style={{ width: '100%', marginTop: 18 }} onClick={onClose}>
          Mengerti
        </button>
      </div>
    </div>
  );
}

// Memori Mang AI - catatan jangka panjang per akun warung (disimpan server, lihat memori.service.js di backend).
// Diisi otomatis dari obrolan ("ingat ya ..."), dan di sini pemilik bisa lihat, nambah, & hapus - biar jelas apa
// aja yang diinget & ikut kekirim ke AI tiap chat, bukan kotak hitam.
function SheetMemori({ onClose }) {
  const { toast } = useApp();
  const [daftar, setDaftar] = useState(null); // null = lagi dimuat
  const [baru, setBaru] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [yakinHapusSemua, setYakinHapusSemua] = useState(false);
  const [hapusTarget, setHapusTarget] = useState(null); // catatan yang mau dihapus (nunggu konfirmasi popup)

  useEffect(() => {
    let batal = false;
    api.memori
      .list()
      .then((rows) => !batal && setDaftar(rows))
      .catch((e) => {
        if (batal) return;
        setDaftar([]);
        toast(escapeHtml(e.message || 'Gagal memuat memori'));
      });
    return () => {
      batal = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tambah = async () => {
    const isi = baru.trim();
    if (!isi || sibuk) return;
    setSibuk(true);
    try {
      const r = await api.memori.tambah(isi);
      setDaftar((d) => [r, ...(d || [])]);
      setBaru('');
    } catch (e) {
      toast(escapeHtml(e.message || 'Gagal nyimpen catatan'));
    } finally {
      setSibuk(false);
    }
  };

  const hapus = async (id) => {
    setHapusTarget(null);
    try {
      await api.memori.hapus(id);
      setDaftar((d) => d.filter((m) => m.id !== id));
    } catch (e) {
      toast(escapeHtml(e.message || 'Gagal hapus catatan'));
    }
  };

  const hapusSemua = async () => {
    setSibuk(true);
    try {
      await api.memori.hapusSemua();
      setDaftar([]);
      setYakinHapusSemua(false);
      toast('Memori Mang AI dikosongkan');
    } catch (e) {
      toast(escapeHtml(e.message || 'Gagal hapus memori'));
    } finally {
      setSibuk(false);
    }
  };

  return (
    <>
    <div className="sheet show">
      <div className="panel">
        <h3>Memori Mang AI</h3>
        <p>
          Hal-hal yang diinget Mang AI tentang warungmu dari obrolan sebelumnya. Berlaku di semua HP akun ini. Bilang aja
          di chat "ingat ya ...", atau tulis sendiri di bawah.
        </p>
        <div className="field">
          <label>Tambah catatan</label>
          <input
            value={baru}
            onChange={(e) => setBaru(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && tambah()}
            maxLength={200}
            placeholder="Misal: supplier beras langganan Toko Makmur"
          />
        </div>
        <button className="btn utama" style={{ width: '100%', marginTop: 10 }} disabled={sibuk || !baru.trim()} onClick={tambah}>
          Simpan catatan
        </button>

        <div className="memori-daftar">
          {daftar === null ? (
            <div className="kosong">Memuat…</div>
          ) : daftar.length === 0 ? (
            <div className="kosong">Belum ada yang diinget.</div>
          ) : (
            daftar.map((m) => (
              <div className="memori-item" key={m.id}>
                <span>{m.isi}</span>
                <button type="button" onClick={() => setHapusTarget(m)} aria-label="Hapus catatan ini" title="Hapus catatan ini">
                  ×
                </button>
              </div>
            ))
          )}
        </div>

        {daftar?.length > 0 && (
          <button type="button" className="ed-hapus" onClick={() => setYakinHapusSemua(true)}>
            Hapus semua memori
          </button>
        )}

        <button className="btn" style={{ width: '100%', marginTop: 12 }} onClick={onClose}>
          Tutup
        </button>
      </div>
    </div>

    {hapusTarget && (
      <KonfirmasiHapus
        judul="Hapus catatan ini?"
        pesan={`"${hapusTarget.isi}" - Mang AI nggak bakal inget ini lagi.`}
        onYa={() => hapus(hapusTarget.id)}
        onBatal={() => setHapusTarget(null)}
      />
    )}
    {yakinHapusSemua && (
      <KonfirmasiHapus
        judul="Hapus semua memori?"
        pesan="Semua catatan yang diinget Mang AI tentang warungmu bakal hilang, di semua HP akun ini."
        labelYa="Ya, hapus semua"
        sibuk={sibuk}
        onYa={hapusSemua}
        onBatal={() => setYakinHapusSemua(false)}
      />
    )}
    </>
  );
}

// Profil usaha: tampil PROFIL-nya dulu (nama warung, jenis usaha, jawaban kenalan, angka komunitas), baru tombol
// "Ubah" yang buka pertanyaan kenalan. Dulu barisnya langsung loncat ke pertanyaan nomor 1 - nggak bisa sekadar lihat.
function SheetProfilUsaha({ onClose }) {
  const { authWarung, profilUsaha } = useApp();
  const [mode, setMode] = useState('lihat'); // lihat | ubah
  const [komunitas, setKomunitas] = useState(null);

  useEffect(() => {
    if (!authWarung?.id) return;
    let batal = false;
    api.komunitas.warung
      .profil(authWarung.id)
      .then((d) => !batal && setKomunitas(d))
      .catch(() => {
        /* offline - angka komunitas cuma nggak ditampilin */
      });
    return () => {
      batal = true;
    };
  }, [authWarung?.id]);

  if (mode === 'ubah') {
    return (
      <div className="sheet show">
        <div className="panel">
          <Onboarding modeUbah onTutup={() => setMode('lihat')} />
        </div>
      </div>
    );
  }

  const p = profilUsaha?.data && !profilUsaha.data.dilewati ? profilUsaha.data : null;
  const label = (daftar, k) => daftar.find((x) => x.k === k)?.label || '-';

  return (
    <div className="sheet show">
      <div className="panel profil-usaha">
        <div className="profil-kepala">
          <div className="bulat">{inisial(authWarung?.nama || '')}</div>
          <div style={{ minWidth: 0 }}>
            <b>{authWarung?.nama}</b>
            <span>{labelJenisUsaha(p) || 'Jenis usaha belum diisi'}</span>
            {authWarung?.username && <small>@{authWarung.username}</small>}
          </div>
        </div>

        {komunitas && (
          <div className="profil-angka">
            <div>
              <b>{komunitas.jumlah_postingan}</b>
              <span>Postingan</span>
            </div>
            <div>
              <b>{komunitas.jumlah_pengikut}</b>
              <span>Pengikut</span>
            </div>
            <div>
              <b>{komunitas.jumlah_mengikuti}</b>
              <span>Mengikuti</span>
            </div>
          </div>
        )}

        {p ? (
          <div className="profil-detail">
            <div className="ed-baris">
              <span>Yang jaga</span>
              <b>{label(PENJAGA, p.penjaga)}</b>
            </div>
            <div className="ed-baris">
              <span>Barang ber-barcode</span>
              <b>{label(BARCODE, p.barcode)}</b>
            </div>
            <div className="ed-baris">
              <span>Mang AI manggil</span>
              <b>{p.namaPanggilan || '-'}</b>
            </div>
            <div className="profil-sub">Paling butuh bantuan</div>
            <div className="profil-chip">
              {p.kebutuhan?.length ? p.kebutuhan.map((k) => <span key={k} className="tag">{label(KEBUTUHAN, k)}</span>) : <span className="tag">-</span>}
            </div>
          </div>
        ) : (
          <div className="kom-kosong" style={{ marginTop: 14 }}>
            Profil usaha belum diisi. Isi biar saran Mang AI & langkah awal di Beranda pas sama usahamu.
          </div>
        )}

        <button className="btn utama" style={{ width: '100%', marginTop: 16 }} onClick={() => setMode('ubah')}>
          {p ? 'Ubah profil usaha' : 'Isi profil usaha'}
        </button>
        <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={onClose}>
          Tutup
        </button>
      </div>
    </div>
  );
}
