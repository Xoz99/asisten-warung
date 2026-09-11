import { useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { singkat, escapeHtml } from '../lib/format';
import { api } from '../lib/api';
import { ambilDeskriptorWajah, gambarDariDataUrl } from '../lib/wajah';
import { keWebp } from '../lib/kamera';
import { CameraIcon, Ikon } from '../lib/icons.jsx';

export default function Pelanggan() {
  const { S, goTo, setPelangganFormOpen } = useApp();
  const [daftarWajahUntuk, setDaftarWajahUntuk] = useState(null); // pelanggan | null

  const utangOf = (nama) => S.kasbon.filter((k) => !k.lunas && k.nama === nama).reduce((a, b) => a + b.jml, 0);

  return (
    <>
      <div style={{ paddingTop: 14 }}>
        <button className="btn kecil" onClick={() => goTo('s-home')}>
          ‹ Kembali
        </button>
        <p className="p-h1" style={{ marginTop: 16 }}>
          Pelanggan
        </p>
        <p className="p-sub">Catat pelanggan tetap — foto wajah sifatnya opsional, buat yang mau kenal wajah otomatis aja</p>
      </div>

      <div className="card">
        {S.pelanggan.length === 0 && <div className="kosong">Belum ada pelanggan terdaftar</div>}
        {S.pelanggan.map((p) => {
          const utang = utangOf(p.nama);
          return (
            <div className="item" key={p.id}>
              <div>
                <div className="nama">{p.nama}</div>
                <div className="tgl">
                  {p.wa || 'Tanpa nomor WA'}
                  {!p.punyaWajah && (
                    <>
                      {' · '}
                      {/* opsional — sengaja dibikin nggak nyolok/nge-warning kayak dulu, biar nggak
                          kerasa maksa (misal buat pelanggan yang lagi kasbon & nggak nyaman difoto) */}
                      <button
                        onClick={() => setDaftarWajahUntuk(p)}
                        style={{ color: 'var(--abu)', fontWeight: 600, background: 'none', border: 0, padding: 0, font: 'inherit', cursor: 'pointer' }}
                      >
                        + foto wajah (opsional)
                      </button>
                    </>
                  )}
                </div>
              </div>
              <span className={'utang-teks' + (utang ? '' : ' lunas')}>{utang ? singkat(utang) : 'lunas'}</span>
            </div>
          );
        })}
      </div>

      <button className="btn utama" style={{ width: '100%', marginTop: 16 }} onClick={() => setPelangganFormOpen(true)}>
        + Daftarkan pelanggan
      </button>

      {daftarWajahUntuk && <SheetDaftarWajah pelanggan={daftarWajahUntuk} onClose={() => setDaftarWajahUntuk(null)} />}
    </>
  );
}

// Buat pelanggan yang udah kesimpen tapi belum punya wajah terdaftar (misal deteksi gagal pas
// awal daftar) — bisa dicoba lagi kapan saja dari sini, tanpa harus bikin pelanggan baru.
function SheetDaftarWajah({ pelanggan, onClose }) {
  const { toast, refreshData } = useApp();
  const [foto, setFoto] = useState(null);
  const [status, setStatus] = useState(null); // null | 'mengecek' | 'oke' | 'gagal'
  const [descriptor, setDescriptor] = useState(null);
  const [loading, setLoading] = useState(false);

  const ambilFoto = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = async () => {
      setStatus('mengecek');
      try {
        // foto dari app kamera NATIVE HP (bukan video-stream) - bisa beneran 3-8MB di resolusi
        // asli. Dikecilin dulu SEBELUM disimpen/dipakai, ini yang bakal ikut ke-upload jadi
        // fotoUrl pelanggan - 800px lebih dari cukup jelas buat deteksi wajah & tampilan.
        const dataUrl = await keWebp(r.result, 800);
        setFoto(dataUrl);
        const img = await gambarDariDataUrl(dataUrl);
        const d = await ambilDeskriptorWajah(img);
        setDescriptor(d);
        setStatus(d ? 'oke' : 'gagal');
      } catch {
        setStatus('gagal');
      }
    };
    r.readAsDataURL(f);
  };

  const simpan = async () => {
    if (!descriptor) return;
    setLoading(true);
    try {
      await api.wajah.daftarkan(pelanggan.id, descriptor);
      toast(`Wajah <b>${escapeHtml(pelanggan.nama)}</b> berhasil didaftarkan`);
      await refreshData();
      onClose();
    } catch (e) {
      toast(e.message ? escapeHtml(e.message) : 'Gagal menyimpan wajah');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sheet show">
      <div className="panel">
        <h3>Daftarkan wajah {pelanggan.nama}</h3>
        <p>Foto sebelumnya (kalau ada) nggak kedeteksi jelas — coba ambil ulang lebih dekat &amp; terang.</p>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
          <div className="ava" style={{ width: 110, height: 110, borderRadius: 34, fontSize: 34 }}>
            {foto ? <img src={foto} alt="" /> : <Ikon nama="orang" />}
          </div>
        </div>
        <label className="btn" style={{ width: '100%', marginTop: 14, display: 'block', textAlign: 'center' }}>
          <CameraIcon /> {foto ? 'Ganti foto' : 'Ambil foto wajah'}
          <input type="file" accept="image/*" capture="user" style={{ display: 'none' }} onChange={ambilFoto} />
        </label>
        {status === 'mengecek' && (
          <p className="p-sub" style={{ textAlign: 'center', marginTop: 8 }}>
            Mengecek wajahnya…
          </p>
        )}
        {status === 'oke' && (
          <p className="p-sub" style={{ textAlign: 'center', marginTop: 8, color: 'var(--ink)', fontWeight: 700 }}>
            ✓ Wajah kedeteksi jelas
          </p>
        )}
        {status === 'gagal' && (
          <p className="p-sub" style={{ textAlign: 'center', marginTop: 8, color: '#e5484d', fontWeight: 700 }}>
            ⚠ Masih nggak kedeteksi — coba lebih dekat, lebih terang, hadap langsung ke kamera
          </p>
        )}
        <button className="btn utama" style={{ width: '100%', marginTop: 16 }} onClick={simpan} disabled={!descriptor || loading}>
          {loading ? 'Menyimpan…' : 'Simpan wajah'}
        </button>
        <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={onClose}>
          Batal
        </button>
      </div>
    </div>
  );
}
