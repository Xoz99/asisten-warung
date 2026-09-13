import { useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { inisial, escapeHtml } from '../lib/format';

export default function Login() {
  const { S, dispatch, toast } = useApp();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [nama, setNama] = useState('');

  const pilih = (n) => dispatch({ type: 'PILIH_PENJAGA', nama: n });

  const simpan = async () => {
    const n = nama.trim();
    if (!n) return;
    // Ditunggu dulu: nama kembar ditolak server, dan sheet-nya harus TETAP kebuka biar namanya
    // bisa langsung dibenerin. Dulu langsung bilang "ditambahkan" & nutup sheet tanpa nunggu.
    const ok = await dispatch({ type: 'TAMBAH_PENJAGA', nama: n });
    if (!ok) return;
    toast(`<b>${escapeHtml(n)}</b> ditambahkan sebagai penjaga`);
    setNama('');
    setSheetOpen(false);
  };

  return (
    <div className="login">
      <p className="p-h1">
        Siapa yang
        <br />
        jaga sekarang?
      </p>
      <p className="p-sub">Semua catatan hari ini disimpan atas nama ini</p>

      <div style={{ marginTop: 24 }}>
        {S.penjagaList.map((n) => (
          <button key={n} className="penjaga" onClick={() => pilih(n)}>
            <div className="ava">{inisial(n)}</div>
            <div>
              <b>{n}</b>
              <span className="kecil">Tap untuk mulai jaga</span>
            </div>
          </button>
        ))}
      </div>

      <button className="btn kecil" style={{ marginTop: 16, width: '100%' }} onClick={() => setSheetOpen(true)}>
        + Tambah penjaga
      </button>

      {sheetOpen && (
        <div className="sheet tengah show">
          <div className="panel">
            <h3>Tambah penjaga</h3>
            <div className="field">
              <label>Nama</label>
              <input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Contoh: Menantu" />
            </div>
            <button className="btn utama" style={{ width: '100%', marginTop: 14 }} onClick={simpan}>
              Simpan
            </button>
            <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={() => setSheetOpen(false)}>
              Batal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
