import { useEffect, useState } from 'react';
import { bulanLabel, rupiah, tgl, waktu } from '../lib/format.js';
import { Gagal, Konfirmasi, Kosong, Memuat, Modal, useData } from '../komponen/Ui.jsx';

// Bagi hasil Sales Partner (admin): estimasi bulan berjalan, tutup bulan (angka dikunci), cairkan tiap tanggal 5.
// Aturan hitungnya di server/komisi.routes.js.
const JENIS = { pertama: 'Order pertama', perpanjangan: 'Perpanjangan', permanen: 'Permanen' };
const persen = (r) => `${Math.round(r * 100)}%`;

export default function BagiHasil({ api }) {
  const [periode, setPeriode] = useState('');
  const [versi, setVersi] = useState(0);
  const { data, error, muat } = useData(api, `/komisi?${periode ? `periode=${periode}&` : ''}v=${versi}`);
  const [detail, setDetail] = useState(null);
  const [cair, setCair] = useState(null);
  const [tutup, setTutup] = useState(false);
  const [pesan, setPesan] = useState('');
  const segarkan = () => setVersi((v) => v + 1);

  if (error) return <Gagal apa="bagi hasil" pesan={error} onUlang={muat} />;
  if (!data) return <Memuat apa="bagi hasil" />;
  const p = data.periode;
  const bulanBerjalan = p === data.sekarang;

  return (
    <>
      <section className="adm-kartu" style={{ marginBottom: 14, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="bh-periode">Bulan</label>
          <input id="bh-periode" type="month" value={p} max={data.sekarang} onChange={(e) => e.target.value && setPeriode(e.target.value)} />
        </div>
        <div style={{ marginRight: 'auto' }}>
          {data.ditutup ? (
            <span className="adm-chip hijau">Ditutup {waktu(data.ditutup.ditutup_at)} oleh {data.ditutup.ditutup_oleh}</span>
          ) : bulanBerjalan ? (
            <span className="adm-chip kuning">Bulan berjalan: angka masih estimasi</span>
          ) : (
            <span className="adm-chip oranye">Belum ditutup</span>
          )}
          <div className="adm-redup" style={{ marginTop: 4 }}>
            Dicairkan tanggal {tgl(data.jadwalCair)}
          </div>
        </div>
        {data.bisaDitutup && (
          <button className="btn utama" onClick={() => setTutup(true)}>
            Tutup bulan {bulanLabel(p, true)}
          </button>
        )}
      </section>

      <details className="adm-kartu" style={{ marginBottom: 14 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Aturan bagi hasil</summary>
        <ul style={{ margin: '10px 0 0', paddingLeft: 20, lineHeight: 1.7 }}>
          <li>Order pertama per toko: {persen(data.rate.pertama)}</li>
          <li>
            Perpanjangan: {persen(data.rate.perpanjangan)}, atau {persen(data.rate.perpanjanganTier)} kalau bulan itu sales dapat lebih dari {data.ambangTokoBaru} toko baru
          </li>
          <li>Paket permanen: {persen(data.rate.permanen)} dari harga yang ditagih</li>
          <li>Dipotong pajak {persen(data.rate.pajak)} dari total komisi</li>
          <li>Komisi punya sales yang megang toko waktu pembayaran lunas. Toko tanpa sales nggak ada komisinya.</li>
          <li>Tutup bulan ngunci angka persis seperti yang tampil di tabel. Pembayaran yang telat masuk setelah bulannya ditutup ikut penutupan bulan berikutnya (tanda "susulan"). Bulan yang belum ditutup harus ditutup sendiri, nggak ikut kesedot.</li>
        </ul>
        <p className="adm-redup" style={{ marginBottom: 0 }}>
          Belum dihitung: aturan pindah pemilik (sales keluar), potongan chargeback, bonus rekrutmen. Waktu lunas masih dari catatan webhook, belum dicek ke laporan Midtrans (NV-03).
        </p>
      </details>

      {pesan && (
        <p className={pesan.startsWith('Gagal') ? 'adm-error' : 'adm-ok'} role="status">
          {pesan}
        </p>
      )}

      <div className="adm-angka" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <div className="adm-kartu adm-angka-item">
          <span className="adm-label">Komisi kotor</span>
          <b className="p-num">{rupiah(data.total.bruto)}</b>
        </div>
        <div className="adm-kartu adm-angka-item">
          <span className="adm-label">Pajak {persen(data.rate.pajak)}</span>
          <b className="p-num">{rupiah(data.total.pajak)}</b>
        </div>
        <div className="adm-kartu adm-angka-item">
          <span className="adm-label">Dibayar ke sales</span>
          <b className="p-num">{rupiah(data.total.neto)}</b>
        </div>
      </div>

      {data.sales.length === 0 ? (
        <Kosong judul={`Belum ada bagi hasil ${bulanLabel(p, true)}`}>Komisi muncul begitu ada pembayaran lunas dari toko yang dipegang sales.</Kosong>
      ) : (
        <div className="adm-gulir">
          <table className="adm-tabel">
            <thead>
              <tr>
                <th>Sales</th>
                <th className="kanan">Toko baru</th>
                <th className="kanan">Rate perpanjangan</th>
                <th className="kanan">Komisi kotor</th>
                <th className="kanan">Pajak</th>
                <th className="kanan">Dibayar</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.sales.map((s) => (
                <tr key={s.wp_sales_id}>
                  <td>
                    <b>{s.sales_nama || '-'}</b>
                    <div className="adm-mono adm-redup">{s.sales_kode}</div>
                    {s.susulan > 0 && <div className="adm-chip oranye">{s.susulan} pembayaran susulan</div>}
                  </td>
                  <td className="kanan p-num">{s.toko_baru}</td>
                  <td className="kanan p-num">{persen(s.rate_perpanjangan)}</td>
                  <td className="kanan p-num">{rupiah(s.bruto)}</td>
                  <td className="kanan p-num">-{rupiah(s.pajak)}</td>
                  <td className="kanan p-num">
                    <b>{rupiah(s.neto)}</b>
                  </td>
                  <td>
                    {s.status === 'dicairkan' ? (
                      <>
                        <span className="adm-chip hijau">Dicairkan</span>
                        <div className="adm-redup">
                          {tgl(s.dicairkan_tanggal)} · {s.metode}
                        </div>
                      </>
                    ) : s.status === 'ditutup' ? (
                      <span className="adm-chip kuning">Siap dicairkan</span>
                    ) : (
                      <span className="adm-chip">Estimasi</span>
                    )}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn kecil" onClick={() => setDetail(s)}>
                      Rincian
                    </button>{' '}
                    {s.status === 'ditutup' && (
                      <button className="btn kecil utama" onClick={() => setCair(s)}>
                        Cairkan
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.riwayat.length > 0 && (
        <section className="adm-kartu" style={{ marginTop: 20 }}>
          <h2 style={{ marginTop: 0 }}>Bulan yang udah ditutup</h2>
          <ul className="adm-daftar">
            {data.riwayat.map((r) => (
              <li key={r.periode}>
                <button className="adm-link" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', fontWeight: 700 }} onClick={() => setPeriode(r.periode)}>
                  {bulanLabel(r.periode, true)}
                </button>
                <span className="adm-redup">
                  {r.sales} sales · {rupiah(r.neto)} · {r.belum_cair ? `${r.belum_cair} belum dicairkan` : 'semua udah dicairkan'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {detail && <Rincian api={api} periode={p} s={detail} onTutup={() => setDetail(null)} />}
      {cair && (
        <Cairkan
          api={api}
          periode={p}
          s={cair}
          jadwal={data.jadwalCair}
          onTutup={() => setCair(null)}
          onSelesai={() => {
            setCair(null);
            setPesan(`Bagi hasil ${cair.sales_nama} ${bulanLabel(p, true)} dicatat dicairkan dan masuk pengeluaran Keuangan.`);
            segarkan();
          }}
        />
      )}
      {tutup && (
        <Konfirmasi
          judul={`Tutup bulan ${bulanLabel(p, true)}?`}
          pesan={`Komisi ${data.sales.length} sales dikunci persis seperti tabel di halaman ini: total ${rupiah(data.total.neto)} setelah pajak. Setelah ditutup angkanya nggak berubah lagi; pembayaran bulan ini yang telat masuk nanti ikut penutupan bulan berikutnya.`}
          label="Tutup bulan"
          onBatal={() => setTutup(false)}
          onYa={async () => {
            try {
              const h = await api('POST', '/komisi/tutup', { periode: p });
              setPesan(`${bulanLabel(p, true)} ditutup: ${h.sales} sales, ${rupiah(h.neto)} siap dicairkan.`);
              segarkan();
            } catch (e) {
              setPesan('Gagal: ' + e.message);
            }
            setTutup(false);
          }}
        />
      )}
    </>
  );
}

function Rincian({ api, periode, s, onTutup }) {
  const { data, error } = useData(api, `/komisi/detail?periode=${periode}&sales=${s.wp_sales_id}`);
  return (
    <Modal judul={`Rincian ${s.sales_nama} · ${bulanLabel(periode, true)}`} onTutup={onTutup} lebar={760}>
      {error ? (
        <p className="adm-error">{error}</p>
      ) : !data ? (
        <Memuat apa="rincian" />
      ) : data.length === 0 ? (
        <p className="adm-redup">Nggak ada pembayaran.</p>
      ) : (
        <div className="adm-gulir">
          <table className="adm-tabel">
            <thead>
              <tr>
                <th>Lunas</th>
                <th>Toko</th>
                <th>Jenis</th>
                <th className="kanan">Dibayar toko</th>
                <th className="kanan">Rate</th>
                <th className="kanan">Komisi</th>
              </tr>
            </thead>
            <tbody>
              {data.map((b) => (
                <tr key={b.order_id}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {waktu(b.lunas_pada)}
                    {b.susulan && <div className="adm-chip oranye">Susulan</div>}
                  </td>
                  <td>
                    {b.warung_nama}
                    <div className="adm-mono adm-redup" style={{ fontSize: 12 }}>
                      {b.order_id}
                    </div>
                  </td>
                  <td>
                    {JENIS[b.jenis]}
                    <div className="adm-redup">paket {b.plan}</div>
                  </td>
                  <td className="kanan p-num">{rupiah(b.jumlah)}</td>
                  <td className="kanan p-num">{persen(b.rate)}</td>
                  <td className="kanan p-num">
                    <b>{rupiah(b.komisi)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

function Cairkan({ api, periode, s, jadwal, onTutup, onSelesai }) {
  const hariIni = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const [isi, setIsi] = useState({ tanggal: hariIni < jadwal ? jadwal : hariIni, metode: '', catatan: '' });
  const [error, setError] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const ubah = (k) => (e) => setIsi((x) => ({ ...x, [k]: e.target.value }));
  useEffect(() => setError(''), [isi]);
  return (
    <Modal judul={`Cairkan bagi hasil ${s.sales_nama}`} onTutup={onTutup}>
      <p style={{ marginTop: 0 }}>
        {bulanLabel(periode, true)}: komisi {rupiah(s.bruto)} dikurangi pajak {rupiah(s.pajak)} = <b>{rupiah(s.neto)}</b>
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSibuk(true);
          try {
            await api('POST', '/komisi/cairkan', { periode, sales: s.wp_sales_id, ...isi });
            onSelesai();
          } catch (err) {
            setError(err.message);
            setSibuk(false);
          }
        }}
      >
        <div className="field">
          <label htmlFor="c-tgl">Tanggal transfer</label>
          <input id="c-tgl" type="date" value={isi.tanggal} max={hariIni} onChange={ubah('tanggal')} required />
        </div>
        <div className="field">
          <label htmlFor="c-metode">Metode</label>
          <input id="c-metode" value={isi.metode} onChange={ubah('metode')} placeholder="Transfer BCA / DANA / tunai" maxLength={60} required />
        </div>
        <div className="field">
          <label htmlFor="c-catatan">Catatan (opsional)</label>
          <input id="c-catatan" value={isi.catatan} onChange={ubah('catatan')} placeholder="No. referensi transfer" maxLength={300} />
        </div>
        <p className="adm-redup">Otomatis dicatat sebagai pengeluaran kategori "komisi" di Keuangan sebesar {rupiah(s.neto)}.</p>
        {error && <p className="adm-error">{error}</p>}
        <div className="adm-tombol" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onTutup}>
            Batal
          </button>
          <button type="submit" className="btn utama" disabled={sibuk || !isi.metode.trim()}>
            {sibuk ? 'Menyimpan…' : 'Tandai dicairkan'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
