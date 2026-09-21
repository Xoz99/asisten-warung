import { useState } from 'react';
import { bulanLabel, rupiah, tgl } from '../lib/format.js';
import GrafikKas from '../komponen/GrafikKas.jsx';
import { Gagal, Konfirmasi, Kosong, Memuat, Modal, Tabs, useData } from '../komponen/Ui.jsx';
import Pembayaran from '../produk/warung-pintar/Pembayaran.jsx';

// Keuangan: uang masuk (langganan Midtrans + catatan manual) & keluar (catatan manual) per bulan.
const TABS = [
  { id: 'ringkasan', nama: 'Ringkasan & transaksi' },
  { id: 'pembayaran', nama: 'Pembayaran Midtrans' },
];
const NAMA_KATEGORI = {
  gaji: 'Gaji & tunjangan',
  operasional: 'Operasional',
  marketing: 'Marketing & iklan',
  server: 'Server & software',
  pajak: 'Pajak',
  penjualan: 'Penjualan',
  proyek: 'Proyek',
  investasi: 'Investasi',
  langganan: 'Langganan Warung Pintar',
  lainnya: 'Lain-lain',
};
const NAMA_METODE = { qris: 'QRIS', gopay: 'GoPay', shopeepay: 'ShopeePay', bank_transfer: 'Transfer VA', echannel: 'Mandiri VA', cstore: 'Minimarket', credit_card: 'Kartu kredit' };

export default function Keuangan({ api, apiProduk, tab }) {
  const aktif = TABS.some((t) => t.id === tab) ? tab : 'ringkasan';
  return (
    <>
      <header className="adm-kepala">
        <div>
          <h1>Keuangan</h1>
          <p className="adm-sub">Uang masuk dari langganan Warung Pintar dan semua transaksi yang dicatat tim.</p>
        </div>
      </header>
      <Tabs daftar={TABS} aktif={aktif} href={(id) => `#/keuangan/${id}`} />
      {aktif === 'ringkasan' && <Ringkasan api={api} />}
      {aktif === 'pembayaran' &&
        (apiProduk ? (
          <Pembayaran api={apiProduk} />
        ) : (
          <Kosong judul="Warung Pintar belum disambungin">Isi WARUNG_PINTAR_DATABASE_URL di .env server manajemen.</Kosong>
        ))}
    </>
  );
}

function Ringkasan({ api }) {
  const [bulan, setBulan] = useState(new Date().toISOString().slice(0, 7));
  const [catat, setCatat] = useState(false);
  const [hapus, setHapus] = useState(null);
  const { data: d, error, muat } = useData(api, `/keuangan?bulan=${bulan}`);

  const maksKategori = Math.max(1, ...(d?.perKategori || []).map((k) => k.total));

  return (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 18 }}>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="bulan-keuangan">Bulan</label>
          <input id="bulan-keuangan" type="month" value={bulan} max={new Date().toISOString().slice(0, 7)} onChange={(e) => e.target.value && setBulan(e.target.value)} />
        </div>
        <button className="btn utama" onClick={() => setCatat(true)}>
          + Catat transaksi
        </button>
      </div>

      {error ? (
        <Gagal apa="data keuangan" pesan={error} onUlang={muat} />
      ) : !d ? (
        <Memuat apa="data keuangan" />
      ) : (
        <>
          <section className="adm-angka" aria-label={`Ringkasan ${bulanLabel(bulan, true)}`}>
            <div className="adm-kartu adm-stat fokus">
              <span className="adm-label">Masuk {bulanLabel(bulan)}</span>
              <span className="nilai p-num" style={{ fontSize: 30 }}>
                {rupiah(d.masuk)}
              </span>
            </div>
            <div className="adm-kartu adm-stat">
              <span className="adm-label">Keluar {bulanLabel(bulan)}</span>
              <span className="nilai p-num">{rupiah(d.keluar)}</span>
            </div>
            <div className="adm-kartu adm-stat">
              <span className="adm-label">Selisih bulan ini</span>
              <span className="nilai p-num" style={{ color: d.selisih < 0 ? 'var(--merah)' : undefined }}>
                {d.selisih < 0 ? '-' : '+'}
                {rupiah(Math.abs(d.selisih))}
              </span>
            </div>
            <div className="adm-kartu adm-stat">
              <span className="adm-label">Saldo kas (semua waktu)</span>
              <span className="nilai p-num">{rupiah(d.saldo)}</span>
              <span className="adm-redup">Masuk dikurangi keluar sejak awal dicatat</span>
            </div>
          </section>

          <div className="adm-kolom">
            <section className="adm-kartu">
              <div className="adm-kartu-kepala">
                <h2>Masuk vs keluar, 6 bulan terakhir</h2>
              </div>
              <GrafikKas kas={d.kas} />
            </section>
            <section className="adm-kartu">
              <div className="adm-kartu-kepala hitam">
                <h2>Ke mana uang keluar, {bulanLabel(bulan)}</h2>
              </div>
              {d.perKategori.length === 0 ? (
                <Kosong judul="Belum ada pengeluaran" aksi={<button className="btn kecil" onClick={() => setCatat(true)}>Catat pengeluaran</button>}>
                  Pengeluaran bulan ini belum dicatat.
                </Kosong>
              ) : (
                <div className="adm-batang">
                  {d.perKategori.map((k) => (
                    <div key={k.kategori} className="adm-batang-baris">
                      <span className="adm-label" style={{ fontSize: 12 }}>
                        {NAMA_KATEGORI[k.kategori] || k.kategori} · {Math.round((k.total / d.keluar) * 100)}%
                      </span>
                      <span className="p-num" style={{ fontWeight: 700 }}>
                        {rupiah(k.total)}
                      </span>
                      <div className="adm-batang-isi" aria-hidden="true">
                        <span style={{ width: `${(k.total / maksKategori) * 100}%`, background: 'var(--oranye)' }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <h2 className="adm-judul-tab" style={{ margin: '28px 0 12px' }}>
            Transaksi {bulanLabel(bulan, true)}
          </h2>
          {d.transaksi.length === 0 ? (
            <Kosong judul="Belum ada transaksi di bulan ini" aksi={<button className="btn kecil utama" onClick={() => setCatat(true)}>+ Catat transaksi</button>}>
              Pembayaran langganan yang lunas masuk sendiri. Pengeluaran & pemasukan lain dicatat manual.
            </Kosong>
          ) : (
            <div className="adm-gulir">
              <table className="adm-tabel">
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Deskripsi</th>
                    <th>Kategori</th>
                    <th>Metode</th>
                    <th>Sumber</th>
                    <th className="kanan">Jumlah</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {d.transaksi.map((t) => (
                    <tr key={t.sumber + t.id}>
                      <td>{tgl(t.tanggal)}</td>
                      <td>
                        <b>{t.deskripsi}</b>
                        {t.pihak && <div className="adm-redup">{t.pihak}</div>}
                      </td>
                      <td>
                        <span className="adm-chip">{NAMA_KATEGORI[t.kategori] || t.kategori}</span>
                      </td>
                      <td>{NAMA_METODE[t.metode] || t.metode || '-'}</td>
                      <td>
                        {t.sumber === 'midtrans' ? (
                          <span className="adm-chip biru">Midtrans</span>
                        ) : (
                          <span className="adm-redup">dicatat {t.admin_nama || 'admin'}</span>
                        )}
                      </td>
                      <td className="kanan">
                        <b className="p-num" style={{ color: t.jenis === 'keluar' ? 'var(--merah)' : undefined }}>
                          {t.jenis === 'keluar' ? '-' : '+'}
                          {rupiah(t.jumlah)}
                        </b>
                      </td>
                      <td>
                        {t.sumber === 'manual' && (
                          <button className="btn kecil" onClick={() => setHapus(t)} aria-label={`Hapus transaksi ${t.deskripsi}`}>
                            Hapus
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {catat && d && (
        <FormTransaksi
          kategori={d.kategori}
          onTutup={() => setCatat(false)}
          onSimpan={async (isi) => {
            await api('POST', '/keuangan/transaksi', isi);
            setCatat(false);
            if (isi.tanggal.slice(0, 7) !== bulan) setBulan(isi.tanggal.slice(0, 7));
            else muat();
          }}
        />
      )}
      {hapus && (
        <Konfirmasi
          judul="Hapus transaksi"
          pesan={`Hapus "${hapus.deskripsi}" (${rupiah(hapus.jumlah)})? Saldo kas ikut berubah.`}
          onBatal={() => setHapus(null)}
          onYa={async () => {
            await api('DELETE', `/keuangan/transaksi/${hapus.id}`).catch(() => {});
            setHapus(null);
            muat();
          }}
        />
      )}
    </>
  );
}

function FormTransaksi({ kategori, onTutup, onSimpan }) {
  const [isi, setIsi] = useState({ jenis: 'keluar', tanggal: new Date().toISOString().slice(0, 10), kategori: 'operasional', deskripsi: '', pihak: '', jumlah: '', metode: '' });
  const [error, setError] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const ubah = (k) => (e) => setIsi((x) => ({ ...x, [k]: e.target.value }));
  const gantiJenis = (jenis) => setIsi((x) => ({ ...x, jenis, kategori: kategori[jenis][0] }));
  const jumlah = Number(isi.jumlah.replace(/\D/g, '')) || 0;
  return (
    <Modal judul="Catat transaksi" onTutup={onTutup}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          setSibuk(true);
          try {
            await onSimpan({ ...isi, jumlah });
          } catch (err) {
            setError(err.message);
            setSibuk(false);
          }
        }}
      >
        <div className="adm-toggle" role="group" aria-label="Jenis transaksi">
          <button type="button" className={isi.jenis === 'masuk' ? 'on' : ''} onClick={() => gantiJenis('masuk')} aria-pressed={isi.jenis === 'masuk'}>
            Pemasukan
          </button>
          <button type="button" className={isi.jenis === 'keluar' ? 'on keluar' : ''} onClick={() => gantiJenis('keluar')} aria-pressed={isi.jenis === 'keluar'}>
            Pengeluaran
          </button>
        </div>
        <div className="adm-baris" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="field">
            <label htmlFor="tr-tanggal">Tanggal</label>
            <input id="tr-tanggal" type="date" value={isi.tanggal} onChange={ubah('tanggal')} required />
          </div>
          <div className="field">
            <label htmlFor="tr-kategori">Kategori</label>
            <select id="tr-kategori" value={isi.kategori} onChange={ubah('kategori')} style={{ maxWidth: 'none', width: '100%', minHeight: 44 }}>
              {kategori[isi.jenis].map((k) => (
                <option key={k} value={k}>
                  {NAMA_KATEGORI[k] || k}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="tr-deskripsi">Deskripsi</label>
          <input id="tr-deskripsi" value={isi.deskripsi} onChange={ubah('deskripsi')} placeholder="Misal: gaji sales September" required />
        </div>
        <div className="field">
          <label htmlFor="tr-pihak">Klien / vendor (opsional)</label>
          <input id="tr-pihak" value={isi.pihak} onChange={ubah('pihak')} placeholder="Nama pihak ketiga" />
        </div>
        <div className="adm-baris" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="field">
            <label htmlFor="tr-jumlah">Jumlah (Rp)</label>
            <input id="tr-jumlah" value={isi.jumlah} onChange={(e) => setIsi((x) => ({ ...x, jumlah: e.target.value.replace(/[^\d]/g, '') }))} inputMode="numeric" placeholder="0" required />
          </div>
          <div className="field">
            <label htmlFor="tr-metode">Metode (opsional)</label>
            <input id="tr-metode" value={isi.metode} onChange={ubah('metode')} placeholder="Transfer BCA, tunai, dst" />
          </div>
        </div>
        {jumlah > 0 && (
          <p className="adm-redup" style={{ marginBottom: 0 }}>
            {isi.jenis === 'masuk' ? 'Masuk' : 'Keluar'} {rupiah(jumlah)}
          </p>
        )}
        {error && <p className="adm-error">{error}</p>}
        <div className="adm-tombol" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
          <button type="button" className="btn" onClick={onTutup}>
            Batal
          </button>
          <button type="submit" className="btn utama" disabled={sibuk || !isi.deskripsi.trim() || !jumlah}>
            {sibuk ? 'Menyimpan…' : 'Simpan transaksi'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
