import { useEffect, useRef, useState } from 'react';
import { bukaKamera, siapkanKamera, tutupKamera } from '../lib/kamera';
import { mulaiScanBarcode } from '../lib/barcodeScan';
import KontrolKamera from './KontrolKamera.jsx';

// Layar scan barcode serbaguna: cuma baca kodenya, yang ngolah pemanggilnya lewat onKode(kode).
// - Sekali scan (default): dipakai kolom cari Stok.
// - terus: kamera tetap nyala buat barang berikutnya (Ambil dari katalog - nyecan satu rak). onKode boleh balikin
//   teks/Promise<teks> yang ditampilin sebagai hasil terakhir ("✓ Indomie Goreng dicentang").
export default function SheetScanBarcode({ judul = 'Scan barcode', onKode, onClose, terus = false, tombolSelesai = 'Batal' }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const matiRef = useRef(false);
  const kontrolRef = useRef(null);
  const [status, setStatus] = useState('memuat'); // memuat | scan | error
  const [pesan, setPesan] = useState('');
  const [hasil, setHasil] = useState('');
  const [kap, setKap] = useState(null);
  const [manual, setManual] = useState('');

  const proses = async (kode) => {
    try {
      const t = await onKode(kode);
      if (terus && t) setHasil(t);
    } catch (e) {
      if (terus) setHasil(e.message || 'Gagal');
    }
    // Mode terus: kasih jeda sebentar biar barcode yang sama nggak kebaca dobel, lalu scan lagi.
    if (terus && !matiRef.current) setTimeout(() => !matiRef.current && mulai(), 1200);
  };
  const mulai = () => {
    kontrolRef.current?.stop();
    kontrolRef.current = mulaiScanBarcode({ videoRef, matiRef, onDetect: proses });
  };

  useEffect(() => {
    let batal = false;
    matiRef.current = false;
    (async () => {
      try {
        const stream = await bukaKamera('environment');
        if (batal) return tutupKamera(stream);
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        if (batal) return;
        siapkanKamera(stream, { zoom: 1.5 }).then((k) => !batal && setKap(k));
        mulai();
        setStatus('scan');
      } catch (e) {
        if (!batal) {
          setPesan(e.message || 'Gagal membuka kamera');
          setStatus('error');
        }
      }
    })();
    return () => {
      batal = true;
      matiRef.current = true;
      kontrolRef.current?.stop();
      tutupKamera(streamRef.current);
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="sheet tengah show" style={{ zIndex: 30 }}>
      <div className="panel mid">
        <h3>{judul}</h3>
        <div className="viewfinder" style={{ marginTop: 14 }}>
          <div className="frame" />
          <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          {status === 'scan' && <KontrolKamera streamRef={streamRef} kap={kap} />}
        </div>
        {hasil && <p className="scan-hasil" role="status">{hasil}</p>}
        <p>
          {status === 'error'
            ? pesan
            : status === 'memuat'
              ? 'Membuka kamera…'
              : terus
                ? 'Arahkan ke barcode - tiap barang yang kebaca langsung dicentang, lanjut ke barang berikutnya.'
                : 'Arahkan ke barcode barang - kebaca otomatis.'}
        </p>
        <form
          className="cari"
          style={{ marginTop: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.replace(/\D/g, '').length >= 6) {
              const k = manual.trim();
              setManual('');
              proses(k);
            }
          }}
        >
          <input inputMode="numeric" placeholder="Atau ketik nomor barcode" value={manual} onChange={(e) => setManual(e.target.value.replace(/\D/g, '').slice(0, 20))} aria-label="Nomor barcode" />
        </form>
        <button className={'btn' + (terus ? ' utama' : '')} style={{ width: '100%', marginTop: 12 }} onClick={onClose}>
          {tombolSelesai}
        </button>
      </div>
    </div>
  );
}
