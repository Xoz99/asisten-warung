import { useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { escapeHtml } from '../lib/format';
import mangWarungImg from '../assets/mangwarung.webp';

// Harga di sini cuma buat tampilan - sumber kebenarannya tetap di backend (HARGA_PLAN di
// midtrans.service.js). Kalau harga di backend diubah, samakan juga angka yang ditampilin di sini.
// `jatahAi` juga cuma tampilan - sumber kebenarannya JATAH_TOKEN_HARIAN di aiQuota.service.js
// (backend) - samain juga sama daftar plan di Lainnya.jsx (PLAN_LANGGANAN) kalau angkanya diubah.
const PLAN = [
  { id: 'bulanan', label: 'Bulanan', harga: 'Rp 49.000', sub: 'per bulan', jatahAi: 50_000 },
  { id: 'tahunan', label: 'Tahunan', harga: 'Rp 490.000', sub: 'per tahun · hemat 2 bulan', jatahAi: 120_000 },
  { id: 'permanen', label: 'Permanen', harga: 'Rp 3.620.000', sub: 'sekali bayar, seumur hidup - nggak perlu perpanjang lagi', jatahAi: 250_000 },
];

export default function LisensiHabis() {
  const { lisensi, mulaiCheckout, logout, toast } = useApp();
  const [pilih, setPilih] = useState('bulanan');
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
        {/* dulu highlight kartu yang kepilih pakai borderColor doang - di tema ini border-nya
            "none" (garisnya beneran dari box-shadow), jadi borderColor nggak keliatan efeknya
            sama sekali. Klik-nya sebenernya udah kerekam ke state `pilih`, cuma nggak ada tanda
            visual apa-apa yang berubah, jadi kesannya kayak "nggak bisa milih". */}
        {PLAN.map((p) => (
          <button
            key={p.id}
            className="penjaga"
            onClick={() => setPilih(p.id)}
            style={pilih === p.id ? { boxShadow: 'inset 0 0 0 2px var(--brand)' } : undefined}
          >
            <div>
              <b>{p.label}</b>
              <span className="kecil">{p.sub}</span>
              <span className="kecil" style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                <img src={mangWarungImg} alt="" style={{ width: 14, height: 14, objectFit: 'contain', flex: 'none' }} />
                Jatah AI {p.jatahAi.toLocaleString('id-ID')} token/hari
              </span>
            </div>
            <b style={{ marginLeft: 'auto' }}>{p.harga}</b>
          </button>
        ))}
      </div>

      <button className="btn utama" style={{ width: '100%', marginTop: 16 }} onClick={bayar} disabled={loading}>
        {loading ? 'Membuka halaman pembayaran…' : `Lanjut bayar ${PLAN.find((p) => p.id === pilih).label}`}
      </button>
      <button className="btn kecil" style={{ marginTop: 10, width: '100%' }} onClick={logout}>
        Keluar akun
      </button>
    </div>
  );
}
