import { useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { api } from '../lib/api';
import { ambilDeskriptorWajah, gambarDariDataUrl } from '../lib/wajah';
import { keWebp } from '../lib/kamera';
import { CameraIcon, Ikon } from '../lib/icons.jsx';
import { escapeHtml } from '../lib/format';
import { panduanIzin } from '../lib/panduanIzin';
import { mintaIzinMedia } from '../lib/mic';

// Diekspor (bukan cuma dipakai internal file ini) - Chat.jsx pakai ini juga buat sheet detail
// diskusi & konfirmasi hapus di Komunitas, biar gaya popup-nya konsisten sama sheet lain di app.
export function Sheet({ center, mid, children }) {
  return (
    <div className={'sheet show' + (center ? ' tengah' : '')}>
      <div className={'panel' + (mid ? ' mid' : '')}>{children}</div>
    </div>
  );
}

export default function SharedSheets() {
  return (
    <>
      <SheetOk />
      <SheetLunas />
      <SheetPelangganForm />
      <SheetKuotaAiHabis />
      <SheetIzin />
    </>
  );
}

// Panduan buka izin kamera/mikrofon yang TERLANJUR DIBLOKIR.
//
// Sebelumnya ini cuma satu baris toast ("buka setelan browser") yang lewat 3 detik terus ilang -
// dan menu yang dimaksud beda-beda tiap HP, jadi orangnya tetep nggak tau harus ke mana. Sekarang
// langkahnya disebut satu-satu buat perangkat yang lagi dipakai (lihat panduanIzin di
// lib/panduanIzin.js, di situ juga ada alasan kenapa nggak bisa langsung dilempar ke halaman
// setelannya - browser emang ngeblokir itu).
function SheetIzin() {
  const { izinInfo, closeIzin, toast } = useApp();
  const [cek, setCek] = useState(false);
  if (!izinInfo) return null;
  const panduan = panduanIzin();

  // Bukan cuma NGECEK: getUserMedia dipanggil beneran lagi. Kalau setelannya barusan diubah jadi
  // "Tanya", panggilan ini yang bakal munculin dialog izinnya - jadi satu tombol ini nutup dua
  // kemungkinan sekaligus, dan user nggak perlu nebak mana yang berlaku buat HP-nya.
  const cekLagi = async () => {
    setCek(true);
    const { ok } = await mintaIzinMedia();
    setCek(false);
    if (ok) {
      toast('Sip, izinnya udah masuk. Sekarang bisa dipakai.');
      closeIzin();
      return;
    }
    toast('Masih diblokir. Pastikan langkahnya udah kesimpen, ya.');
  };

  return (
    <Sheet center mid>
      <h3>{panduan.judul}</h3>
      <p>{panduan.pembuka}</p>
      <ol className="langkah-izin">
        {panduan.langkah.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ol>
      {panduan.catatan && <p className="p-sub" style={{ marginTop: 12 }}>{panduan.catatan}</p>}
      <button className="btn utama brand" style={{ width: '100%', marginTop: 18 }} onClick={cekLagi} disabled={cek}>
        {cek ? 'Ngecek...' : 'Sudah, cek lagi'}
      </button>
      <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={closeIzin}>
        Nanti aja
      </button>
    </Sheet>
  );
}

// Muncul GANTI toast biasa (lihat tanganiErrorAi di AppContext.jsx) tiap kali fitur AI scan/nota/
// suara kena jatah token harian yang abis (aiQuota.service.js backend) - bukan cuma ngasih tau
// "gagal", tapi langsung kasih jalan keluar (upgrade plan) lewat 1 tombol ke Lainnya > Langganan.
// Chat Mang AI sengaja TIDAK kena jatah ini (lihat komentar lengkap di aiQuota.service.js), jadi
// sheet ini nggak akan muncul dari situ.
function SheetKuotaAiHabis() {
  const { kuotaAiInfo, closeKuotaAi, goTo } = useApp();
  if (!kuotaAiInfo) return null;
  return (
    <Sheet center mid>
      <h3>Jatah AI harian habis</h3>
      <p>{kuotaAiInfo.pesan}</p>
      <button
        className="btn utama brand"
        style={{ width: '100%', marginTop: 20 }}
        onClick={() => {
          closeKuotaAi();
          goTo('s-lainnya');
        }}
      >
        Lihat paket langganan
      </button>
      <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={closeKuotaAi}>
        Nanti aja, lanjut manual
      </button>
    </Sheet>
  );
}

function SheetOk() {
  const { okInfo, closeOk } = useApp();
  if (!okInfo) return null;
  return (
    <Sheet center mid>
      <div className="ok">✓</div>
      <h3>{okInfo.judul}</h3>
      <p dangerouslySetInnerHTML={{ __html: okInfo.pesan }} />
      <button className="btn utama" style={{ width: '100%', marginTop: 20 }} onClick={closeOk}>
        Lanjut jualan
      </button>
    </Sheet>
  );
}

function SheetLunas() {
  const { lunasInfo, closeLunas } = useApp();
  if (!lunasInfo) return null;
  const pilih = (metode) => {
    lunasInfo.onPilih(metode);
    closeLunas();
  };
  return (
    <Sheet>
      <h3>{lunasInfo.judul}</h3>
      <p dangerouslySetInnerHTML={{ __html: lunasInfo.pesan }} />
      <p className="p-sec" style={{ marginBottom: 0 }}>
        Bayar pakai apa?
      </p>
      <div className="metode">
        <button onClick={() => pilih('Tunai')}>
          <svg viewBox="0 0 24 24">
            <rect x="3" y="6.5" width="18" height="11" rx="2.5" />
            <circle cx="12" cy="12" r="2.6" />
          </svg>
          Tunai
        </button>
        <button onClick={() => pilih('QRIS')}>
          <svg viewBox="0 0 24 24">
            <rect x="4" y="4" width="6" height="6" rx="1.4" />
            <rect x="14" y="4" width="6" height="6" rx="1.4" />
            <rect x="4" y="14" width="6" height="6" rx="1.4" />
            <path d="M14 14h3v3h-3zM20 14v6h-3" />
          </svg>
          QRIS
        </button>
      </div>
      <button className="btn" style={{ width: '100%', marginTop: 14 }} onClick={closeLunas}>
        Batal
      </button>
    </Sheet>
  );
}

function SheetPelangganForm() {
  const { pelangganFormOpen, setPelangganFormOpen, toast, refreshData } = useApp();
  const [nama, setNama] = useState('');
  const [wa, setWa] = useState('');
  const [foto, setFoto] = useState(null);
  const [descriptor, setDescriptor] = useState(null);
  const [statusWajah, setStatusWajah] = useState(null); // null | 'mengecek' | 'oke' | 'gagal'
  const [loading, setLoading] = useState(false);

  if (!pelangganFormOpen) return null;

  const close = () => {
    setPelangganFormOpen(false);
    setNama('');
    setWa('');
    setFoto(null);
    setDescriptor(null);
    setStatusWajah(null);
  };

  // Langsung dicek pas foto diambil — biar ketauan SEKARANG kalau wajahnya nggak kedeteksi
  // (kejauhan/miring/gelap), bukan baru ketauan lewat toast SETELAH data pelanggan kesimpen.
  // Dulu ini nyebabin sebagian pelanggan kesimpen tanpa wajah tanpa disadari, jadi nggak akan
  // pernah kekenali sama fitur kenal wajah.
  const ambilFoto = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = async () => {
      setDescriptor(null);
      setStatusWajah('mengecek');
      try {
        // foto dari app kamera NATIVE HP (bukan video-stream) - bisa beneran 3-8MB di resolusi
        // asli. Dikecilin dulu SEBELUM disimpen/dipakai, ini yang bakal ikut ke-upload jadi
        // fotoUrl pelanggan - 800px lebih dari cukup jelas buat deteksi wajah & tampilan.
        const dataUrl = await keWebp(r.result, 800);
        setFoto(dataUrl);
        const img = await gambarDariDataUrl(dataUrl);
        const d = await ambilDeskriptorWajah(img);
        setDescriptor(d);
        setStatusWajah(d ? 'oke' : 'gagal');
      } catch {
        setStatusWajah('gagal');
      }
    };
    r.readAsDataURL(f);
  };

  // Foto yang diambil di sini dipakai buat 2 hal: (1) foto profil pelanggan (foto_url), dan
  // (2) diekstrak jadi face descriptor (face-api.js) buat Kasbon Kenal Wajah — tanpa langkah ini,
  // fitur kenal wajah nggak akan pernah nemu siapa-siapa karena belum ada wajah yang terdaftar.
  const simpan = async () => {
    const n = nama.trim();
    if (!n) return toast('Nama belum diisi');
    setLoading(true);
    try {
      const pelanggan = await api.pelanggan.tambah({ nama: n, wa: wa.trim(), fotoUrl: foto });
      if (descriptor) {
        await api.wajah.daftarkan(pelanggan.id, descriptor);
        toast(`<b>${escapeHtml(n)}</b> terdaftar - wajahnya bisa dikenali otomatis`);
      } else if (foto) {
        toast(`<b>${escapeHtml(n)}</b> terdaftar TANPA wajah (nggak kedeteksi) - foto ulang lewat menu Pelanggan nanti`);
      } else {
        toast(`<b>${escapeHtml(n)}</b> terdaftar`);
      }
      await refreshData();
      close();
    } catch (e) {
      toast(e.message ? escapeHtml(e.message) : 'Gagal menyimpan pelanggan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet>
      <h3>Daftarkan pelanggan</h3>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
        <div className="ava" style={{ width: 110, height: 110, borderRadius: 34, fontSize: 34 }}>
          {foto ? <img src={foto} alt="" /> : <Ikon nama="orang" />}
        </div>
      </div>
      <label className="btn" style={{ width: '100%', marginTop: 14, display: 'block', textAlign: 'center' }}>
        <CameraIcon /> {foto ? 'Ganti foto wajah' : 'Ambil foto wajah (opsional)'}
        <input type="file" accept="image/*" capture="user" style={{ display: 'none' }} onChange={ambilFoto} />
      </label>
      {!foto && (
        <p className="p-sub" style={{ textAlign: 'center', marginTop: 6, fontSize: 13 }}>
          Boleh dilewati - pelanggan (termasuk yang kasbon) tetap bisa dicatat tanpa foto, cuma
          fitur kenal wajah otomatis nggak jalan buat orang ini.
        </p>
      )}
      {statusWajah === 'mengecek' && (
        <p className="p-sub" style={{ textAlign: 'center', marginTop: 8 }}>
          Mengecek wajahnya…
        </p>
      )}
      {statusWajah === 'oke' && (
        <p className="p-sub" style={{ textAlign: 'center', marginTop: 8, color: 'var(--ink)', fontWeight: 700 }}>
          ✓ Wajah kedeteksi jelas
        </p>
      )}
      {statusWajah === 'gagal' && (
        <p className="p-sub" style={{ textAlign: 'center', marginTop: 8, color: '#e5484d', fontWeight: 700 }}>
          ⚠ Wajah nggak kedeteksi - coba foto ulang lebih dekat &amp; terang, atau lanjut tanpa
          wajah (kenal wajah nggak akan jalan buat pelanggan ini)
        </p>
      )}
      <div className="field">
        <label>Nama</label>
        <input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Bu Sri" />
      </div>
      <div className="field">
        <label>Nomor WA (opsional)</label>
        <input value={wa} onChange={(e) => setWa(e.target.value)} inputMode="tel" placeholder="0812…" />
      </div>
      <button className="btn utama" style={{ width: '100%', marginTop: 16 }} onClick={simpan} disabled={loading}>
        {loading ? 'Menyimpan…' : 'Simpan pelanggan'}
      </button>
      <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={close}>
        Batal
      </button>
    </Sheet>
  );
}
