import { useState } from 'react';
import { tgl, waktu } from '../lib/format.js';
import { Gagal, Kosong, Memuat, useData } from '../komponen/Ui.jsx';
import { NAMA_AKSI, ringkasDetail } from './Admin.jsx';

// Notifikasi 30 hari terakhir: warung baru daftar, pembayaran lunas, & aktivitas admin LAIN (aktivitas sendiri nggak).
const JENIS = {
  warung_daftar: { nama: 'Warung baru', warna: 'kuning' },
  bayar: { nama: 'Bayar lunas', warna: 'hijau' },
  aktivitas: { nama: 'Aktivitas tim', warna: 'ungu' },
};

export default function Notifikasi({ api, onDibaca }) {
  const { data, error, muat } = useData(api, '/notifikasi');
  const [saring, setSaring] = useState('');
  const [sibuk, setSibuk] = useState(false);

  const tandaiDibaca = async () => {
    setSibuk(true);
    try {
      await api('POST', '/notifikasi/baca');
      muat();
      onDibaca();
    } finally {
      setSibuk(false);
    }
  };

  const items = (data?.items || []).filter((n) => !saring || n.jenis === saring);
  // Dikelompokin per hari biar gampang dipindai.
  const perHari = [];
  for (const n of items) {
    const hari = tgl(n.waktu);
    const grup = perHari.at(-1);
    if (grup?.hari === hari) grup.items.push(n);
    else perHari.push({ hari, items: [n] });
  }

  return (
    <>
      <header className="adm-kepala">
        <h1 className="sr-only">Notifikasi</h1>
        <button className="btn" onClick={tandaiDibaca} disabled={sibuk || !data?.belumDibaca}>
          {data?.belumDibaca ? `Tandai ${data.belumDibaca} dibaca` : 'Semua udah dibaca'}
        </button>
      </header>

      <div className="adm-tombol" style={{ marginBottom: 16 }} role="group" aria-label="Saring notifikasi">
        <button className={'btn kecil' + (saring === '' ? ' aksen' : '')} onClick={() => setSaring('')} aria-pressed={saring === ''}>
          Semua
        </button>
        {Object.entries(JENIS).map(([id, j]) => (
          <button key={id} className={'btn kecil' + (saring === id ? ' aksen' : '')} onClick={() => setSaring(id)} aria-pressed={saring === id}>
            {j.nama}
          </button>
        ))}
      </div>

      {error ? (
        <Gagal apa="notifikasi" pesan={error} onUlang={muat} />
      ) : !data ? (
        <Memuat apa="notifikasi" />
      ) : items.length === 0 ? (
        <Kosong judul={saring ? 'Nggak ada notifikasi jenis ini' : 'Belum ada notifikasi'}>
          {saring ? 'Coba pilih "Semua".' : 'Warung yang daftar, pembayaran yang lunas, dan perubahan dari admin lain bakal muncul di sini.'}
        </Kosong>
      ) : (
        perHari.map((g) => (
          <section key={g.hari} style={{ marginBottom: 20 }}>
            <h2 className="adm-label" style={{ fontSize: 12, margin: '0 0 8px' }}>
              {g.hari}
            </h2>
            <div className="adm-kartu" style={{ padding: '0 18px' }}>
              <ul className="adm-daftar">
                {g.items.map((n, i) => (
                  <li key={i} style={n.baru ? { background: '#FEF9C3', margin: '0 -18px', padding: '12px 18px' } : undefined}>
                    <div>
                      <span className={`adm-chip ${JENIS[n.jenis].warna}`}>{JENIS[n.jenis].nama}</span> <b>{n.judul}</b>{' '}
                      {n.jenis === 'aktivitas' ? NAMA_AKSI[n.isi] || n.isi : ''}
                      <div className="adm-redup">{n.jenis === 'aktivitas' ? ringkasDetail(n.detail) : n.isi}</div>
                    </div>
                    <div className="adm-kanan">
                      <span className="adm-redup">{waktu(n.waktu)}</span>
                      {n.baru && <span className="adm-chip merah">Baru</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ))
      )}
    </>
  );
}
