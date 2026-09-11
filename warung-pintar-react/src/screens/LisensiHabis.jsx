import { useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { escapeHtml } from '../lib/format';
import { rupiah } from '../lib/format';
import KartuPaket from '../components/KartuPaket.jsx';


export default function LisensiHabis() {
  const { lisensi, mulaiCheckout, logout, toast } = useApp();
  const [pilih, setPilih] = useState('bulanan');
  // Paket datang dari backend (lihat KATALOG_PLAN di midtrans.service.js) - bukan ditulis ulang
  // di sini. Ini layar PAYWALL: harga yang salah di sini paling mahal akibatnya.
  const paket = lisensi?.paket || [];
  const planAktif = paket.find((p) => p.id === pilih) || paket[0];
  const [loading, setLoading] = useState(false);

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
    <div className="login">
      <p className="p-h1">
        Masa langganan
        <br />
        sudah habis
      </p>
      <p className="p-sub">
        {lisensi?.plan === 'trial' ? 'Masa coba gratis sudah selesai.' : 'Langganan warung ini sudah berakhir.'} Perpanjang dulu buat lanjut pakai
        Warung Pintar.
      </p>

      <div style={{ marginTop: 24 }}>
        <KartuPaket paket={paket} pilih={pilih} onPilih={setPilih} />
        {planAktif && <p className="opnhint" style={{ marginTop: 12 }}>{planAktif.sub}</p>}
      </div>

      <button className="btn utama" style={{ width: '100%', marginTop: 16 }} onClick={bayar} disabled={loading || !planAktif}>
        {loading ? 'Membuka halaman pembayaran…' : planAktif ? `Lanjut bayar — ${rupiah(planAktif.harga)}` : 'Memuat paket…'}
      </button>
      <button className="btn kecil" style={{ marginTop: 10, width: '100%' }} onClick={logout}>
        Keluar akun
      </button>
    </div>
  );
}
