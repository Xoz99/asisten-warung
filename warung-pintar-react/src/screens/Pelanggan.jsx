import { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { singkat, escapeHtml, inisial } from '../lib/format';
import { api } from '../lib/api';
import { ambilDeskriptorWajah, gambarDariDataUrl } from '../lib/wajah';
import { perbaruiWajahLama, perluPerbaruiWajah } from '../lib/wajahLama';
import { keWebp } from '../lib/kamera';
import { CameraIcon, Ikon } from '../lib/icons.jsx';

export default function Pelanggan() {
  const { S, goTo, setPelangganFormOpen, refreshData } = useApp();
  const [daftarWajahUntuk, setDaftarWajahUntuk] = useState(null); // pelanggan | null

  // Data wajah model lama dihitung ulang dari foto pelanggannya, diem-diem di belakang (lihat lib/wajahLama.js).
  useEffect(() => {
    if (!S.pelanggan.some(perluPerbaruiWajah)) return;
    perbaruiWajahLama(S.pelanggan).then((n) => n > 0 && refreshData());
  }, [S.pelanggan, refreshData]);

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
        <p className="p-sub">Catat pelanggan tetap - foto wajah sifatnya opsional, buat yang mau kenal wajah otomatis aja</p>
      </div>

      <div className="card">
        {S.pelanggan.length === 0 && <div className="kosong">Belum ada pelanggan terdaftar</div>}
        {S.pelanggan.map((p) => {
          const utang = utangOf(p.nama);
          return (
            <div className="item" key={p.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                {/* Foto pelanggan ditampilkan - sama kayak daftar pembeli di Catat jualan. Dulu daftar ini cuma
                    nama, jadi foto yang diambil di sini nggak kelihatan di mana pun. */}
                <div className="bulat">{p.foto ? <img src={p.foto} alt="" /> : inisial(p.nama)}</div>
                <div style={{ minWidth: 0 }}>
                <div className="nama">{p.nama}</div>
                <div className="tgl">
                  {p.wa || 'Tanpa nomor WA'}
                  {/* Muncul buat SEMUA pelanggan yang belum punya foto - dulu cuma yang belum punya data wajah.
                      Pelanggan yang wajahnya udah kedaftar tapi fotonya kebuang (bug lama "+ foto wajah")
                      nggak punya jalan buat dikasih foto, jadi di daftar kasbon Catat selamanya inisial. */}
                  {(!p.foto || !p.punyaWajah) && (
                    <>
                      {' \u00b7 '}
                      {/* opsional - sengaja dibikin nggak nyolok/nge-warning kayak dulu, biar nggak
                          kerasa maksa (misal buat pelanggan yang lagi kasbon & nggak nyaman difoto) */}
                      <button
                        onClick={() => setDaftarWajahUntuk(p)}
                        style={{ color: 'var(--abu)', fontWeight: 600, background: 'none', border: 0, padding: 0, font: 'inherit', cursor: 'pointer' }}
                      >
                        {p.foto ? '+ daftarkan wajah (opsional)' : '+ foto (opsional)'}
                      </button>
                    </>
                  )}
                </div>
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

  // Foto & data pengenal wajah itu dua kegunaan beda. Foto buat TAMPILAN (daftar kasbon di Catat, daftar
  // Pelanggan) - itu nggak butuh wajahnya kedeteksi. Data wajah buat KENAL WAJAH otomatis - itu yang butuh.
  // Dulu tombol simpan mati kalau wajahnya nggak kedeteksi, jadi foto yang kurang terang/agak miring nggak
  // bisa disimpen sama sekali, padahal buat tampilan fotonya udah cukup.
  const simpan = async () => {
    if (!foto) return;
    setLoading(true);
    try {
      if (descriptor) await api.wajah.daftarkan(pelanggan.id, descriptor);
      // Fotonya ikut disimpen jadi foto pelanggan. Dulu CUMA data pengenal wajahnya yang dikirim - fotonya
      // kebuang, jadi pelanggan yang didaftarin wajahnya dari sini tetap tampil inisial di daftar pembeli
      // Catat jualan (padahal fotonya jelas-jelas udah diambil).
      await api.pelanggan.gantiFoto(pelanggan.id, foto);
      toast(
        descriptor
          ? `Foto & wajah <b>${escapeHtml(pelanggan.nama)}</b> tersimpan`
          : `Foto <b>${escapeHtml(pelanggan.nama)}</b> tersimpan (kenal wajah belum aktif buat orang ini)`
      );
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
        <h3>Foto {pelanggan.nama}</h3>
        <p>
          {pelanggan.punyaWajah
            ? 'Wajahnya udah kedaftar - tinggal fotonya, biar kelihatan di daftar kasbon.'
            : 'Fotonya tampil di daftar kasbon. Kalau wajahnya kedeteksi jelas, sekalian dipakai buat kenal wajah otomatis.'}
        </p>
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
            Wajah nggak kedeteksi - fotonya tetap bisa disimpen buat tampilan, tapi kenal wajah nggak jalan pakai foto ini.
            Mau dipakai kenal wajah? Foto ulang lebih dekat &amp; terang, hadap langsung ke kamera.
          </p>
        )}
        <button className="btn utama" style={{ width: '100%', marginTop: 16 }} onClick={simpan} disabled={!foto || status === 'mengecek' || loading}>
          {loading ? 'Menyimpan…' : 'Simpan foto'}
        </button>
        <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={onClose}>
          Batal
        </button>
      </div>
    </div>
  );
}
