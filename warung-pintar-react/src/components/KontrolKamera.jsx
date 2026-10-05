import { useEffect, useState } from 'react';
import { aturSenter, fokusKeTitik } from '../lib/kamera';

// Lapisan di atas video kamera (scan barcode / foto barang): ketuk di mana aja = fokus ke titik itu, plus tombol
// senter kalau kameranya punya lampu. `kap` = hasil siapkanKamera() ({ senter, fokusTitik }), null = kamera belum siap.
export default function KontrolKamera({ streamRef, kap }) {
  const [titik, setTitik] = useState(null); // { x, y, n } posisi lingkaran fokus (persen)
  const [senter, setSenter] = useState(false);

  // Kamera ditutup/diganti -> senter dianggap mati lagi.
  useEffect(() => setSenter(false), [kap]);

  if (!kap) return null;
  const ketuk = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    setTitik((t) => ({ x: x * 100, y: y * 100, n: (t?.n || 0) + 1 }));
    fokusKeTitik(streamRef.current, x, y);
  };
  const gantiSenter = async (e) => {
    e.stopPropagation();
    if (await aturSenter(streamRef.current, !senter)) setSenter(!senter);
  };
  return (
    <div className="kamera-kontrol" onClick={ketuk} role="presentation">
      {titik && <span key={titik.n} className="kamera-fokus" style={{ left: titik.x + '%', top: titik.y + '%' }} aria-hidden="true" />}
      {kap.senter && (
        <button type="button" className={'kamera-senter' + (senter ? ' on' : '')} onClick={gantiSenter} aria-pressed={senter} aria-label={senter ? 'Matikan senter' : 'Nyalakan senter'}>
          <svg viewBox="0 0 24 24">
            <path d="M8 2h8l-1 6h-6zM9 8h6v3l-1.5 2v9h-3v-9L9 11z" />
          </svg>
        </button>
      )}
      <span className="kamera-tips">Ketuk buat fokus · jauhin dikit kalau buram</span>
    </div>
  );
}
