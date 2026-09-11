import { useEffect, useState } from 'react';
import { Ikon } from '../lib/icons.jsx';
import { useApp } from '../state/AppContext.jsx';
import { WARNA, FONTS, UKURAN } from '../lib/data';
import { escapeHtml, tampilNoHp, rupiah } from '../lib/format';
import { api } from '../lib/api.js';
import KartuPaket from '../components/KartuPaket.jsx';
import mangWarungImg from '../assets/mangwarung.webp';

export default function Lainnya() {
  const { S, dispatch, goTo, kosongkanCart, setPelangganTerpilih, logout, authWarung } = useApp();
  const [sheet, setSheet] = useState(null); // 'warna' | 'font' | 'ukuran' | 'pass' | 'pin' | 'nohp' | null
  const ukuranAktif = UKURAN.find((u) => u.k === S.ukuran) || UKURAN[1];

  const warnaAktif = WARNA.find((w) => w.h === S.warna) || WARNA[0];

  const keluarAkun = () => {
    if (!window.confirm('Keluar dari akun warung ini di HP ini?')) return;
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
      </div>

      <p className="p-sec">Aplikasi</p>
      <BarisPasangApp />

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
              {authWarung?.noHp ? tampilNoHp(authWarung.noHp) : 'Belum diisi — isi sekarang biar bisa pulih kalau lupa sandi'}
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
            <span>Sedang jaga: {S.penjagaAktif || '—'}</span>
          </span>
          <span className="ar">›</span>
        </button>
        <button className="mrow" onClick={keluarAkun}>
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
      <div className={'geser-akordeon' + (buka ? ' buka' : '')}>
        <div>
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
            {loading ? 'Membuka pembayaran…' : planAktif ? `Lanjut bayar — ${rupiah(planAktif.harga)}` : 'Memuat paket…'}
          </button>
          <p className="opnhint" style={{ marginTop: 10, textAlign: 'center' }}>
            Pembayaran lewat QRIS. Langganan nggak otomatis diperpanjang — kamu yang atur sendiri
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
// PIN itu kunci LOKAL per-HP (disimpan di prefs browser, lihat AppContext), bukan kredensial
// server — jadi yang dikerjain server cuma MEMBUKTIKAN ini pemiliknya (kode dikirim ke nomor
// terdaftar), penyimpanan PIN barunya tetap di sini. Gunanya: orang yang kebetulan pegang HP
// warung yang lagi kebuka nggak bisa diam-diam ganti PIN pelindung data modal.
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
    if (baru !== ulang) return toast('Ulangi PIN belum sama');
    setLoading(true);
    try {
      // Kode diverifikasi ke server DULU; PIN baru cuma ditulis kalau server bilang cocok.
      await api.pinOtp.verifikasi(kode.trim());
      dispatch({ type: 'SET_PIN', pin: baru });
      toast('PIN berhasil diganti ✓');
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

// Isi/ganti nomor HP pemulihan. Password diminta lagi (dipaksa backend) supaya HP warung yang
// lagi kebuka nggak bisa dipakai orang lain mindahin nomor pemulihan ke nomornya sendiri —
// itu jalan pintas paling gampang buat ambil alih akun.
function SheetNoHp({ onClose }) {
  const { gantiNoHp, authWarung, toast } = useApp();
  const [noHp, setNoHp] = useState(authWarung?.noHp ? tampilNoHp(authWarung.noHp) : '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const simpan = async () => {
    if (noHp.replace(/\D/g, '').length < 10) return toast('Nomor HP belum benar');
    if (!password) return toast('Masukkan kata sandi kamu');
    setLoading(true);
    try {
      await gantiNoHp(password, noHp.trim());
      toast('Nomor HP tersimpan ✓');
      onClose();
    } catch (e) {
      toast(e.message ? escapeHtml(e.message) : 'Gagal menyimpan nomor HP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sheet show">
      <div className="panel">
        <h3>Nomor HP pemulihan</h3>
        <p>Dipakai buat kirim kode kalau kamu lupa kata sandi atau mau ganti PIN. Pakai nomor yang WhatsApp-nya aktif.</p>
        <div className="field">
          <label>Nomor HP (WhatsApp)</label>
          <input value={noHp} onChange={(e) => setNoHp(e.target.value)} inputMode="tel" placeholder="0812-3456-7890" />
        </div>
        <div className="field">
          <label>Kata sandi kamu (buat memastikan)</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" />
        </div>
        <button className="btn utama" style={{ width: '100%', marginTop: 18 }} onClick={simpan} disabled={loading}>
          {loading ? 'Menyimpan…' : 'Simpan nomor HP'}
        </button>
        <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={onClose}>
          Batal
        </button>
      </div>
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

  // Udah kebuka SEBAGAI aplikasi terpasang? Dua cara deteksinya beda: standar web pakai
  // display-mode, Safari iOS pakai properti non-standar navigator.standalone.
  const terpasang =
    (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)')?.matches) ||
    (typeof navigator !== 'undefined' && navigator.standalone === true);

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
              Di iPhone, pemasangan harus lewat menu Safari — Apple nggak ngizinin aplikasi
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
              Kalau kamu buka dari dalam WhatsApp atau Instagram, menunya nggak lengkap — buka
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
