import { useCallback, useEffect, useRef, useState } from 'react';

// Ambil data dari API + keadaannya (memuat / gagal / data). `muat()` buat ngulang setelah ada perubahan.
export function useData(api, path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [versi, setVersi] = useState(0);
  useEffect(() => {
    if (!path) return;
    let batal = false;
    api('GET', path)
      .then((d) => {
        if (batal) return;
        setData(d);
        setError('');
      })
      .catch((e) => !batal && setError(e.message));
    return () => {
      batal = true;
    };
  }, [api, path, versi]);
  const muat = useCallback(() => setVersi((v) => v + 1), []);
  return { data, error, muat };
}

export function Memuat({ apa }) {
  return <p className="adm-muat">Memuat {apa}…</p>;
}

export function Gagal({ apa, pesan, onUlang }) {
  return (
    <div className="adm-gagal" role="alert">
      <div>
        <b>Gagal memuat {apa}.</b> <span className="adm-redup">{pesan}</span>
      </div>
      {onUlang && (
        <button className="btn kecil" onClick={onUlang}>
          Coba lagi
        </button>
      )}
    </div>
  );
}

// Keadaan kosong: bilang kenapa kosong + satu langkah yang ngisinya (antislop R-27).
export function Kosong({ judul, children, aksi }) {
  return (
    <div className="adm-kosong">
      <b>{judul}</b>
      {children && <p>{children}</p>}
      {aksi}
    </div>
  );
}

export function Tabs({ daftar, aktif, href }) {
  return (
    <nav className="adm-tabs" aria-label="Bagian halaman">
      {daftar.map((t) => (
        <a key={t.id} href={href(t.id)} className={'adm-tab' + (aktif === t.id ? ' on' : '')} aria-current={aktif === t.id ? 'page' : undefined}>
          {t.nama}
        </a>
      ))}
    </nav>
  );
}

// Modal: tutup pakai Escape / klik latar / tombol ×, fokus pindah ke dalam pas kebuka.
export function Modal({ judul, onTutup, children, lebar }) {
  const ref = useRef(null);
  useEffect(() => {
    const tekan = (e) => e.key === 'Escape' && onTutup();
    document.addEventListener('keydown', tekan);
    ref.current?.querySelector('input,select,textarea,button:not(.adm-tutup)')?.focus();
    return () => document.removeEventListener('keydown', tekan);
  }, [onTutup]);
  return (
    <div className="adm-latar" onMouseDown={(e) => e.target === e.currentTarget && onTutup()}>
      <div className="adm-modal" role="dialog" aria-modal="true" aria-label={judul} ref={ref} style={lebar ? { maxWidth: lebar } : undefined}>
        <div className="adm-modal-kepala">
          <h2>{judul}</h2>
          <button className="adm-tutup" onClick={onTutup} aria-label="Tutup">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Konfirmasi buat aksi yang nggak bisa dibalikin (hapus).
export function Konfirmasi({ judul, pesan, label = 'Ya, hapus', onYa, onBatal }) {
  const [sibuk, setSibuk] = useState(false);
  return (
    <Modal judul={judul} onTutup={onBatal}>
      <p style={{ marginTop: 0 }}>{pesan}</p>
      <div className="adm-tombol" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onBatal}>
          Batal
        </button>
        <button
          className="btn bahaya"
          disabled={sibuk}
          onClick={async () => {
            setSibuk(true);
            await onYa();
            setSibuk(false);
          }}
        >
          {sibuk ? 'Memproses…' : label}
        </button>
      </div>
    </Modal>
  );
}
