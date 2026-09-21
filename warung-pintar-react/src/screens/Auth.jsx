import { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { api } from '../lib/api.js';
import { EyeIcon } from '../lib/icons.jsx';
import { hapusKodeSales, kodeSalesTersimpan } from '../lib/kodeSales.js';

// Konsulin (landing page) ngarahin ke sini pakai link kayak /?plan=bulanan waktu orang klik
// paket harga. Begitu berhasil daftar/masuk, langsung lanjut ke pembayaran Midtrans — nggak
// perlu muter-muter cari menu langganan dulu.
// Paket yang boleh datang lewat ?plan= dari landing page Konsulin. HARUS disamakan sama
// HARGA_PLAN di backend - dulu di sini cuma 'bulanan' & 'tahunan', jadi orang yang klik paket
// PERMANEN di landing page (paket paling mahal) diam-diam kelewat: dia cuma kedaftar, nggak
// pernah dibawa ke pembayaran. Ditulis sebagai daftar biar nambah paket cukup nambah satu kata.
const PLAN_DARI_LINK = ['bulanan', 'triwulan', 'tahunan', 'permanen'];
function planDariUrl() {
  const p = new URLSearchParams(window.location.search).get('plan');
  return PLAN_DARI_LINK.includes(p) ? p : null;
}

export default function Auth() {
  const { login, selesaiDaftar, mulaiCheckout } = useApp();
  const planUrl = planDariUrl();
  // Kode sales dari link /?ref= (lihat lib/kodeSales.js). Orang yang dateng lewat link sales hampir pasti mau daftar.
  const [kodeSales, setKodeSales] = useState(kodeSalesTersimpan);
  const [mode, setMode] = useState(() => (planUrl || kodeSalesTersimpan() ? 'daftar' : 'login')); // 'login' | 'daftar' | 'lupa'
  const [namaWarung, setNamaWarung] = useState('');
  const [username, setUsername] = useState('');
  const [noHp, setNoHp] = useState('');
  const [password, setPassword] = useState('');
  const [lihatPassword, setLihatPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Daftar = 2 langkah: form -> kode WhatsApp. `pendaftaran` terisi setelah kode dikirim.
  const [pendaftaran, setPendaftaran] = useState(null); // { id, noHpSamar, berlakuMenit }
  const [kode, setKode] = useState('');
  const [tungguKirimUlang, setTungguKirimUlang] = useState(0); // detik
  // Hasil cek kode sales: { kode, nama } kalau dikenal, { kode, nama: null } kalau nggak. Cuma ditampilin kalau
  // `kode`-nya masih sama sama yang lagi diketik.
  const [infoSales, setInfoSales] = useState(null);
  const kodeSalesRapi = kodeSales.trim().toUpperCase();
  const salesTampil = infoSales && infoSales.kode === kodeSalesRapi ? infoSales : null;

  useEffect(() => {
    if (tungguKirimUlang <= 0) return;
    const t = setTimeout(() => setTungguKirimUlang((d) => d - 1), 1000);
    return () => clearTimeout(t);
  }, [tungguKirimUlang]);

  useEffect(() => {
    if (mode !== 'daftar' || !/^[A-Z0-9]{3,20}$/.test(kodeSalesRapi)) return;
    let batal = false;
    const t = setTimeout(async () => {
      try {
        const s = await api.daftar.cekSales(kodeSalesRapi);
        if (!batal) setInfoSales({ kode: kodeSalesRapi, nama: s.nama });
      } catch (err) {
        if (!batal && err.status === 404) setInfoSales({ kode: kodeSalesRapi, nama: null });
      }
    }, 400);
    return () => {
      batal = true;
      clearTimeout(t);
    };
  }, [kodeSalesRapi, mode]);

  const lanjutCheckout = async () => {
    if (planUrl) {
      window.history.replaceState({}, '', window.location.pathname);
      await mulaiCheckout(planUrl);
    }
  };

  const kirimKodeDaftar = async () => {
    const r = await api.daftar.kirimKode(namaWarung.trim(), username.trim(), password, noHp.trim(), kodeSalesRapi || undefined, kodeSalesTersimpan() || undefined);
    setPendaftaran({ id: r.pendaftaranId, noHpSamar: r.noHpSamar, berlakuMenit: r.berlakuMenit });
    setKode('');
    setTungguKirimUlang(60);
  };

  const verifikasiDaftar = async (e) => {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(kode.trim())) return setError('Kode itu 6 angka');
    setLoading(true);
    try {
      await selesaiDaftar(pendaftaran.id, kode.trim());
      hapusKodeSales();
      await lanjutCheckout();
    } catch (err) {
      setError(err.message || 'Gagal, coba lagi');
    } finally {
      setLoading(false);
    }
  };

  const kirimUlang = async () => {
    setError('');
    setLoading(true);
    try {
      await kirimKodeDaftar();
    } catch (err) {
      setError(err.message || 'Gagal kirim ulang kode');
    } finally {
      setLoading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'daftar') {
        if (!namaWarung.trim() || !username.trim() || password.length < 6) {
          throw new Error('Nama warung & username wajib diisi, password minimal 6 karakter');
        }
        // Nomor HP dicek kasar di sini biar salah ketik ketahuan sebelum kirim; aturan
        // sebenarnya tetap di backend (utils/noHp.js), ini cuma biar nggak bolak-balik request.
        if (noHp.replace(/\D/g, '').length < 10) {
          throw new Error('Nomor HP belum benar. Contoh: 0812-3456-7890');
        }
        await kirimKodeDaftar(); // lanjut ke layar kode - akun baru dibuat setelah kodenya cocok
      } else {
        if (!username.trim() || !password) throw new Error('Username & password wajib diisi');
        await login(username.trim(), password);
        await lanjutCheckout();
      }
    } catch (err) {
      setError(err.message || 'Gagal, coba lagi');
    } finally {
      setLoading(false);
    }
  };

  if (mode === 'lupa') {
    return <LupaPassword awalUsername={username} onSelesai={() => { setMode('login'); setPassword(''); }} />;
  }

  // Langkah 2 daftar: masukin kode yang dikirim ke WhatsApp.
  if (mode === 'daftar' && pendaftaran) {
    return (
      <div className="login">
        <p className="p-h1">
          Cek
          <br />
          WhatsApp-mu
        </p>
        <p className="p-sub">
          Kode 6 angka dikirim ke WhatsApp <b style={{ color: 'var(--ink)', whiteSpace: 'nowrap' }}>{pendaftaran.noHpSamar}</b>. Berlaku{' '}
          {pendaftaran.berlakuMenit || 10} menit. Jangan kasih kode ini ke siapa pun.
        </p>
        <form onSubmit={verifikasiDaftar} style={{ marginTop: 24 }}>
          <div className="field">
            <label>Kode verifikasi</label>
            <input
              value={kode}
              onChange={(e) => setKode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="______"
              autoFocus
            />
          </div>
          {error && (
            <p className="p-sub" style={{ color: '#e5484d', marginTop: 10 }}>
              {error}
            </p>
          )}
          <button className="btn utama" style={{ width: '100%', marginTop: 16 }} type="submit" disabled={loading || kode.length !== 6}>
            {loading ? 'Memproses…' : 'Verifikasi & masuk'}
          </button>
        </form>
        <button className="linkkecil" style={{ marginTop: 14 }} disabled={loading || tungguKirimUlang > 0} onClick={kirimUlang}>
          {tungguKirimUlang > 0 ? `Kirim ulang kode (${tungguKirimUlang} detik)` : 'Kirim ulang kode'}
        </button>
        <button
          className="btn kecil"
          style={{ marginTop: 12, width: '100%' }}
          disabled={loading}
          onClick={() => {
            setError('');
            setPendaftaran(null);
          }}
        >
          Ganti nomor / ubah data
        </button>
      </div>
    );
  }

  return (
    <div className="login">
      <p className="p-h1">
        {mode === 'login' ? (
          <>
            Masuk ke
            <br />
            warungmu
          </>
        ) : (
          <>
            Daftarkan
            <br />
            warungmu
          </>
        )}
      </p>
      <p className="p-sub">
        {mode === 'login' ? 'Satu akun bisa dipakai di beberapa HP (HP kamu, istri, anak).' : 'Sekali daftar, dipakai bareng-bareng di semua HP warung.'}
      </p>

      {planUrl && (
        <p className="p-sub" style={{ marginTop: 8, color: 'var(--ink)', fontWeight: 700 }}>
          Paket dipilih: {{ bulanan: 'Bulanan', triwulan: '3 Bulan', tahunan: 'Tahunan', permanen: 'Permanen' }[planUrl] || planUrl} - lanjut ke pembayaran setelah ini
        </p>
      )}

      <form onSubmit={submit} style={{ marginTop: 24 }}>
        {mode === 'daftar' && (
          <div className="field">
            <label>Nama warung</label>
            <input value={namaWarung} onChange={(e) => setNamaWarung(e.target.value)} placeholder="Contoh: Warung Berkah" />
          </div>
        )}
        <div className="field">
          <label>Username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Contoh: budi" autoCapitalize="none" />
        </div>
        {mode === 'daftar' && (
          <div className="field">
            <label>Nomor HP (WhatsApp)</label>
            <input
              value={noHp}
              onChange={(e) => setNoHp(e.target.value)}
              placeholder="0812-3456-7890"
              inputMode="tel"
              autoComplete="tel"
            />
            <p className="p-sub" style={{ marginTop: 6, fontSize: 12 }}>
              Kode verifikasi dikirim ke WhatsApp nomor ini, juga dipakai kalau kamu lupa kata sandi. Pakai nomor yang WhatsApp-nya aktif.
            </p>
          </div>
        )}
        <div className="field field-pass">
          <label>Password</label>
          <input
            type={lihatPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••"
            autoComplete={mode === 'daftar' ? 'new-password' : 'current-password'}
          />
          <button
            type="button"
            className="mata"
            onClick={() => setLihatPassword((v) => !v)}
            aria-label={lihatPassword ? 'Sembunyikan password' : 'Lihat password'}
          >
            <EyeIcon open={lihatPassword} />
          </button>
        </div>
        {mode === 'daftar' && (
          <div className="field">
            <label>Kode sales (opsional)</label>
            <input
              value={kodeSales}
              onChange={(e) => setKodeSales(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20).toUpperCase())}
              placeholder="Kalau dibantu sales, isi kodenya"
              autoCapitalize="characters"
              autoComplete="off"
            />
            {salesTampil && (
              <p className="p-sub" style={{ marginTop: 6, fontSize: 12, color: salesTampil.nama ? 'var(--ink)' : '#e5484d' }}>
                {salesTampil.nama ? `Dibantu sales: ${salesTampil.nama} ✓` : 'Kode sales ini nggak dikenal. Cek lagi, atau kosongin aja.'}
              </p>
            )}
          </div>
        )}

        {error && (
          <p className="p-sub" style={{ color: '#e5484d', marginTop: 10 }}>
            {error}
          </p>
        )}

        <button className="btn utama" style={{ width: '100%', marginTop: 16 }} type="submit" disabled={loading}>
          {loading ? 'Memproses…' : mode === 'login' ? 'Masuk' : 'Kirim kode verifikasi'}
        </button>
      </form>

      {mode === 'login' && (
        <button className="linkkecil" style={{ marginTop: 14 }} onClick={() => { setError(''); setMode('lupa'); }}>
          Lupa kata sandi?
        </button>
      )}

      <button
        className="btn kecil"
        style={{ marginTop: 12, width: '100%' }}
        onClick={() => {
          setError('');
          setMode((m) => (m === 'login' ? 'daftar' : 'login'));
        }}
      >
        {mode === 'login' ? 'Belum punya akun? Daftar warung baru' : 'Sudah punya akun? Masuk'}
      </button>
    </div>
  );
}

// Lupa kata sandi — 3 langkah: minta kode ke WA -> masukkan kode -> pasang sandi baru.
// Sengaja SATU layar bertahap (bukan 3 halaman) supaya pemilik warung nggak kehilangan konteks:
// kode WA-nya baru dibaca di aplikasi sebelah, balik lagi ke sini harus langsung ketemu kolomnya.
function LupaPassword({ awalUsername, onSelesai }) {
  const [langkah, setLangkah] = useState(1);
  const [id, setId] = useState(awalUsername || ''); // username ATAU nomor HP
  const [noHpSamar, setNoHpSamar] = useState(null);
  const [kode, setKode] = useState('');
  const [token, setToken] = useState('');
  const [baru, setBaru] = useState('');
  const [ulang, setUlang] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const jalankan = async (fn) => {
    setError('');
    setLoading(true);
    try {
      await fn();
    } catch (e) {
      setError(e.message || 'Gagal, coba lagi');
    } finally {
      setLoading(false);
    }
  };

  const kirimKode = () =>
    jalankan(async () => {
      if (!id.trim()) throw new Error('Isi username atau nomor HP dulu');
      const r = await api.lupa.kirimKode(id.trim());
      setNoHpSamar(r.noHpSamar || null);
      setInfo(r.pesan || '');
      setLangkah(2);
    });

  const verifikasi = () =>
    jalankan(async () => {
      if (!/^\d{6}$/.test(kode.trim())) throw new Error('Kode itu 6 angka');
      const r = await api.lupa.verifikasi(id.trim(), kode.trim());
      setToken(r.token);
      setLangkah(3);
    });

  const simpan = () =>
    jalankan(async () => {
      if (baru.length < 6) throw new Error('Kata sandi baru minimal 6 karakter');
      if (baru !== ulang) throw new Error('Ulangi kata sandi belum sama');
      await api.lupa.reset(token, baru);
      onSelesai();
    });

  return (
    <div className="login">
      <p className="p-h1">
        Lupa
        <br />
        kata sandi
      </p>
      <p className="p-sub">
        {langkah === 1 && 'Kami kirim kode ke WhatsApp yang kamu daftarkan.'}
        {langkah === 2 && (
          noHpSamar
            ? <>Kode dikirim ke WhatsApp <b style={{ color: 'var(--ink)' }}>{noHpSamar}</b>. Berlaku 10 menit.</>
            : (info || 'Kalau akunnya terdaftar, kodenya sudah dikirim lewat WhatsApp.')
        )}
        {langkah === 3 && 'Kode cocok. Sekarang buat kata sandi baru.'}
      </p>

      <div style={{ marginTop: 24 }}>
        {langkah === 1 && (
          <div className="field">
            <label>Username atau nomor HP</label>
            <input value={id} onChange={(e) => setId(e.target.value)} placeholder="budi / 0812-3456-7890" autoCapitalize="none" />
          </div>
        )}

        {langkah === 2 && (
          <div className="field">
            <label>Kode verifikasi (6 angka)</label>
            <input value={kode} onChange={(e) => setKode(e.target.value)} inputMode="numeric" maxLength={6} placeholder="______" />
          </div>
        )}

        {langkah === 3 && (
          <>
            <div className="field">
              <label>Kata sandi baru (min. 6 huruf/angka)</label>
              <input type="password" value={baru} onChange={(e) => setBaru(e.target.value)} placeholder="••••••" autoComplete="new-password" />
            </div>
            <div className="field">
              <label>Ulangi kata sandi baru</label>
              <input type="password" value={ulang} onChange={(e) => setUlang(e.target.value)} placeholder="••••••" autoComplete="new-password" />
            </div>
          </>
        )}

        {error && <p className="p-sub" style={{ color: '#e5484d', marginTop: 10 }}>{error}</p>}

        <button
          className="btn utama"
          style={{ width: '100%', marginTop: 16 }}
          onClick={langkah === 1 ? kirimKode : langkah === 2 ? verifikasi : simpan}
          disabled={loading}
        >
          {loading ? 'Memproses…' : langkah === 1 ? 'Kirim kode ke WhatsApp' : langkah === 2 ? 'Lanjut' : 'Simpan kata sandi baru'}
        </button>

        {langkah === 2 && (
          <button className="linkkecil" onClick={kirimKode} disabled={loading}>
            Kirim ulang kode
          </button>
        )}
      </div>

      <button className="btn kecil" style={{ marginTop: 12, width: '100%' }} onClick={onSelesai}>
        Kembali ke halaman masuk
      </button>
    </div>
  );
}
