import { Sheet } from './SharedSheets.jsx';

// Popup "yakin?" yang seragam buat semua aksi hapus/keluar - gantiin window.confirm() bawaan browser (tampilannya
// beda-beda tiap HP & nggak nyatu sama desain app) dan konfirmasi inline yang nongol di tengah form panjang.
// Taruh SETELAH sheet yang lagi kebuka biar tampil di atasnya.
export default function KonfirmasiHapus({ judul, pesan, labelYa = 'Ya, hapus', labelSibuk = 'Menghapus…', sibuk = false, onYa, onBatal }) {
  return (
    <Sheet center mid>
      <h3>{judul}</h3>
      {pesan && <p>{pesan}</p>}
      <button
        className="btn utama"
        style={{ width: '100%', marginTop: 20, background: '#e5484d', color: '#fff' }}
        disabled={sibuk}
        onClick={onYa}
      >
        {sibuk ? labelSibuk : labelYa}
      </button>
      <button className="btn" style={{ width: '100%', marginTop: 10 }} disabled={sibuk} onClick={onBatal}>
        Batal
      </button>
    </Sheet>
  );
}
