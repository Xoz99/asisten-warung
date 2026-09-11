import { useEffect, useRef } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { FONTS } from '../lib/data';
import Auth from '../screens/Auth.jsx';
import LisensiHabis from '../screens/LisensiHabis.jsx';
import Login from '../screens/Login.jsx';
import Beranda from '../screens/Beranda.jsx';
import Catat from '../screens/Catat.jsx';
import Stok from '../screens/Stok.jsx';
import Laporan from '../screens/Laporan.jsx';
import Chat from '../screens/Chat.jsx';
import Pelanggan from '../screens/Pelanggan.jsx';
import Riwayat from '../screens/Riwayat.jsx';
import Lainnya from '../screens/Lainnya.jsx';
import SharedSheets from './SharedSheets.jsx';

const NAV = [
  {
    id: 's-home',
    label: 'Beranda',
    icon: (
      <svg viewBox="0 0 24 24">
        <path className="fillme" d="M3.5 10.5 12 4l8.5 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-4v-6h-6v6H5A1.5 1.5 0 0 1 3.5 19z" />
      </svg>
    ),
  },
  {
    id: 's-stok',
    label: 'Stok',
    icon: (
      <svg viewBox="0 0 24 24">
        <path className="fillme" d="M12 3.2 20 7.4v9.2L12 20.8 4 16.6V7.4z" />
        <path d="M4 7.4 12 11.6l8-4.2M12 11.6v9.2" />
      </svg>
    ),
  },
  { id: 's-catat', fab: true },
  {
    id: 's-chat',
    label: 'Tanya',
    icon: (
      <svg viewBox="0 0 24 24">
        <path className="fillme" d="M4 5.8h16v10.4h-8.6L7 20v-3.8H4z" />
      </svg>
    ),
  },
  {
    id: 's-lainnya',
    label: 'Lainnya',
    icon: (
      <svg viewBox="0 0 24 24">
        <circle className="fillme" cx="5.5" cy="12" r="1.7" />
        <circle className="fillme" cx="12" cy="12" r="1.7" />
        <circle className="fillme" cx="18.5" cy="12" r="1.7" />
      </svg>
    ),
  },
];

export default function PhoneShell() {
  const { S, screen, goTo, cart, toastMsg, authed, authLoading, lisensi, syncStatus, lastSyncAt, outboxCount, perluOnlineDuluan, cobaLagiKoneksi, upgradeSukses, tutupUpgradeSukses } =
    useApp();
  const vpRef = useRef(null);

  useEffect(() => {
    if (vpRef.current) vpRef.current.scrollTop = 0;
  }, [screen]);

  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const fontFamily = FONTS.find((f) => f.n === S.font)?.f || FONTS[0].f;

  // belum login ke akun warung sama sekali -> layar daftar/masuk
  if (!authed) {
    return (
      <div className={`phone ${S.tema} sz-${S.ukuran || 'sedang'}`} style={{ '--brand': S.warna, '--f-body': fontFamily }}>
        <Auth />
      </div>
    );
  }

  // sudah login tapi data warung dari server belum selesai dimuat
  if (authLoading) {
    return (
      <div className={`phone ${S.tema} sz-${S.ukuran || 'sedang'}`} style={{ '--brand': S.warna, '--f-body': fontFamily }}>
        <div className="login">
          <p className="p-h1">Memuat data warung…</p>
          <p className="p-sub">Sebentar ya, lagi ambil data dari server</p>
        </div>
      </div>
    );
  }

  // device ini BELUM PERNAH tervalidasi lisensinya sama sekali (nggak ada cache) DAN lagi
  // offline - diblokir total (bukan disuguhin app kosong), biar token yang dicuri/kedaluwarsa
  // nggak bisa dipakai selamanya tanpa pernah nyentuh server. Beda dari kasus "sudah pernah
  // divalidasi, cuma sekarang offline" yang tetap boleh masuk pakai cache (lihat lisensi di bawah).
  if (perluOnlineDuluan) {
    return (
      <div className={`phone ${S.tema} sz-${S.ukuran || 'sedang'}`} style={{ '--brand': S.warna, '--f-body': fontFamily }}>
        <div className="login">
          <p className="p-h1">Perlu koneksi internet</p>
          <p className="p-sub">Perangkat ini belum pernah tervalidasi — sambungkan ke internet dulu buat masuk pertama kali di sini.</p>
          <button className="btn utama" style={{ width: '100%', marginTop: 16 }} onClick={cobaLagiKoneksi}>
            Coba lagi
          </button>
        </div>
      </div>
    );
  }

  // sudah login tapi lisensinya kedaluwarsa -> ajakan perpanjang, bukan langsung ke app
  if (lisensi && !lisensi.aktif) {
    return (
      <div className={`phone ${S.tema} sz-${S.ukuran || 'sedang'}`} style={{ '--brand': S.warna, '--f-body': fontFamily }}>
        <LisensiHabis />
      </div>
    );
  }

  const showLogin = !S.penjagaAktif;

  return (
    <div className={`phone ${S.tema} sz-${S.ukuran || 'sedang'}`} style={{ '--brand': S.warna, '--f-body': fontFamily }}>
      {showLogin && <Login />}
      {upgradeSukses && <SheetUpgradeSukses data={upgradeSukses} onClose={tutupUpgradeSukses} />}

      <div className="layout">
        <aside className="sidebar">
          <div className="sidebar-brand">
            <div className="sidebar-logo">
              <svg viewBox="0 0 24 24">
                <path d="M4 9.3 5 4h14l1 5.3" />
                <path d="M4 9.3a2.4 2.4 0 0 0 4.8 0 2.4 2.4 0 0 0 4.8 0 2.4 2.4 0 0 0 4.8 0 2.4 2.4 0 0 0 4.8 0" />
                <path d="M5 9.8V20h14V9.8" />
                <path d="M10 20v-5a2 2 0 0 1 4 0v5" />
              </svg>
            </div>
            <div>
              <b>Warung Berkah</b>
              <span>Asisten Warung</span>
            </div>
          </div>

          <nav className="sidenav">
            {NAV.map((n) =>
              n.fab ? (
                <button key="fab" className="sn-catat" onClick={() => goTo(n.id)}>
                  <svg viewBox="0 0 24 24">
                    <path d="M2 6.5V4A1.5 1.5 0 0 1 3.5 2.5H6" />
                    <path d="M18 2.5h2.5A1.5 1.5 0 0 1 22 4v2.5" />
                    <path d="M2 17.5V20A1.5 1.5 0 0 0 3.5 21.5H6" />
                    <path d="M18 21.5h2.5A1.5 1.5 0 0 0 22 20v-2.5" />
                    <path d="M2.5 12h19" />
                  </svg>
                  Catat jualan
                  {cartCount > 0 && <span className="badge show">{cartCount}</span>}
                </button>
              ) : (
                <button key={n.id} className={'sn' + (screen === n.id ? ' on' : '')} onClick={() => goTo(n.id)}>
                  {n.icon}
                  {n.label}
                </button>
              )
            )}
          </nav>
        </aside>

        <div className="main">
          <div className="vp" ref={vpRef}>
            <Screen id="s-home" active={screen === 's-home'}>
              <Beranda />
            </Screen>
            <Screen id="s-catat" active={screen === 's-catat'}>
              <Catat />
            </Screen>
            <Screen id="s-stok" active={screen === 's-stok'}>
              <Stok />
            </Screen>
            <Screen id="s-laporan" active={screen === 's-laporan'}>
              <Laporan />
            </Screen>
            <Screen id="s-chat" active={screen === 's-chat'}>
              <Chat />
            </Screen>
            <Screen id="s-pelanggan" active={screen === 's-pelanggan'}>
              <Pelanggan />
            </Screen>
            <Screen id="s-riwayat" active={screen === 's-riwayat'}>
              <Riwayat />
            </Screen>
            <Screen id="s-lainnya" active={screen === 's-lainnya'}>
              <Lainnya />
            </Screen>
          </div>
        </div>
      </div>

      <div className={'toast' + (toastMsg ? ' show' : '')} dangerouslySetInnerHTML={{ __html: toastMsg || '' }} />

      <BadgeSync status={syncStatus} lastSyncAt={lastSyncAt} outboxCount={outboxCount} lisensiDicekPada={lisensi?.dicekPada} />

      <SharedSheets />

      <nav className="nav">
        {NAV.map((n) =>
          n.fab ? (
            <button key="fab" className="fab" onClick={() => goTo(n.id)} aria-label="Catat jualan">
              <svg viewBox="0 0 24 24">
                <path d="M2 6.5V4A1.5 1.5 0 0 1 3.5 2.5H6" />
                <path d="M18 2.5h2.5A1.5 1.5 0 0 1 22 4v2.5" />
                <path d="M2 17.5V20A1.5 1.5 0 0 0 3.5 21.5H6" />
                <path d="M18 21.5h2.5A1.5 1.5 0 0 0 22 20v-2.5" />
                <path d="M2.5 12h19" />
              </svg>
              <span className="fab-label">Catat</span>
              {cartCount > 0 && <span className="badge show">{cartCount}</span>}
            </button>
          ) : (
            <button key={n.id} className={'nb' + (screen === n.id ? ' on' : '')} onClick={() => goTo(n.id)}>
              {n.icon}
              {n.label}
            </button>
          )
        )}
      </nav>
    </div>
  );
}

function Screen({ active, children }) {
  return <section className={'screen' + (active ? ' on' : '')}>{active ? children : null}</section>;
}

// waktu relatif ringkas ("5 menit lalu", "2 jam lalu") - dipakai buat tooltip badge sync,
// nggak perlu presisi kayak hariRelatif() di AppContext.jsx (yang khusus buat label kasbon)
function waktuLalu(ts) {
  if (!ts) return null;
  const menit = Math.floor((Date.now() - ts) / 60000);
  if (menit < 1) return 'barusan';
  if (menit < 60) return `${menit} menit lalu`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  return `${Math.floor(jam / 24)} hari lalu`;
}

// Badge kecil persisten (nggak nempel ke 1 layar tertentu, biar keliatan di mana aja) buat
// nunjukin status sinkronisasi cache lokal - lihat AppContext.jsx (syncStatus/outboxCount) &
// rencana offline-first-cache. Sengaja nggak nongol apa-apa pas online normal & outbox kosong,
// biar nggak berisik - cuma muncul pas ada yang perlu diketahui user.
function BadgeSync({ status, lastSyncAt, outboxCount, lisensiDicekPada }) {
  const JAM_24 = 24 * 3600 * 1000;
  const lisensiBasi = lisensiDicekPada && Date.now() - lisensiDicekPada > JAM_24;
  if (status === 'online' && !outboxCount && !lisensiBasi) return null;

  const teks = outboxCount > 0 ? `${outboxCount} transaksi menunggu dikirim` : status === 'offline' ? 'Offline — pakai data cache' : 'Menyinkronkan…';
  const titleDasar =
    outboxCount > 0
      ? `${outboxCount} transaksi tersimpan lokal, dikirim otomatis begitu online`
      : status === 'offline'
        ? `Data terakhir disinkron ${waktuLalu(lastSyncAt) || 'belum pernah'}`
        : undefined;
  // lisensi belum tervalidasi ulang lebih dari 24 jam - cuma nempel di tooltip yang udah ada
  // (kalau lagi offline) atau tampil sendiri (kalau ternyata online tapi belum sempat re-cek)
  const title =
    lisensiBasi && lisensiDicekPada
      ? `${titleDasar ? titleDasar + ' — ' : ''}Lisensi terakhir dicek ${waktuLalu(lisensiDicekPada)}`
      : titleDasar;

  return (
    <div className={'badge-sync' + (status === 'offline' ? ' offline' : '')} title={title}>
      {teks || `Lisensi terakhir dicek ${waktuLalu(lisensiDicekPada)}`}
    </div>
  );
}

// Popup setelah pembayaran langganan berhasil. Ditaruh di PhoneShell (bukan di layar tertentu)
// karena pelanggan balik dari Midtrans bisa mendarat di layar mana pun.
//
// Sengaja sheet, bukan toast: ini momen orang baru ngeluarin duit - konfirmasinya harus jelas &
// nunggu di-tap, bukan notifikasi kecil yang ilang sendiri dalam 3 detik. Kalau kelewat, pemilik
// warung bakal ngira pembayarannya gagal dan nyoba bayar lagi.
function SheetUpgradeSukses({ data, onClose }) {
  const LABEL = { bulanan: '1 Bulan', tahunan: '1 Tahun', permanen: 'Permanen (Seumur Hidup)' };
  const sampai = data.berlakuSampai
    ? new Date(data.berlakuSampai).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;
  return (
    <div className="sheet show">
      <div className="panel" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, lineHeight: 1, marginBottom: 8 }}>🎉</div>
        <h3>Mantap, langganan aktif!</h3>
        <p>
          Paket <b style={{ color: 'var(--ink)' }}>{LABEL[data.plan] || data.plan}</b> udah nyala.
          {sampai && <> Berlaku sampai <b style={{ color: 'var(--ink)' }}>{sampai}</b>.</>}
          <br />
          Jatah AI Mang Warung ikut naik mulai sekarang.
        </p>
        <button className="btn utama" style={{ width: '100%', marginTop: 18 }} onClick={onClose}>
          Lanjut jualan
        </button>
      </div>
    </div>
  );
}
