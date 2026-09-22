import { useEffect, useMemo, useState } from 'react';
import { tgl, waktu } from '../lib/format.js';
import { Gagal, Konfirmasi, Kosong, Memuat, Modal, Tabs, useData } from '../komponen/Ui.jsx';
import { bacaSesi } from '../lib/api.js';
import { keWebp } from '../lib/gambar.js';
import QRCode from 'qrcode';

// Sales Lapangan: bank keberatan pelanggan + log kunjungan sales + insight. Akun peran sales cuma lihat punyanya sendiri.
const tabsUntuk = (sales) => [
  { id: 'log', nama: 'Log kunjungan' },
  { id: 'toko', nama: sales ? 'Toko saya' : 'Toko per sales' },
  { id: 'bank', nama: 'Bank keberatan' },
  { id: 'insight', nama: 'Insight' },
];
export const STATUS_TOKO = {
  langganan: { nama: 'Langganan aktif', warna: 'hijau' },
  permanen: { nama: 'Permanen', warna: 'ungu' },
  trial: { nama: 'Trial', warna: 'biru' },
  trial_habis: { nama: 'Trial habis', warna: '' },
  berhenti: { nama: 'Berhenti', warna: 'merah' },
};
const NAMA_TAHAP_CRM = { awareness: 'Awareness', trial: 'Trial 7 hari', konversi: 'Konversi', repeat_order: 'Repeat order', stuck: 'Stuck' };
const koordinat = (lat, lng) => `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
export const HASIL = {
  berhasil: { nama: 'Berhasil (daftar / trial)', pendek: 'Berhasil', warna: 'hijau', isi: 'var(--hijau)' },
  tertarik: { nama: 'Tertarik, follow up', pendek: 'Tertarik', warna: 'biru', isi: 'var(--biru)' },
  pikir: { nama: 'Pikir-pikir', pendek: 'Pikir-pikir', warna: 'kuning', isi: 'var(--kuning)' },
  ditolak: { nama: 'Ditolak', pendek: 'Ditolak', warna: 'merah', isi: 'var(--merah)' },
};
const MAKS_FOTO = 3;
const hariIniWib = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const JAM_UBAH_SALES = 24;

export default function Lapangan({ api, admin, tab }) {
  const sales = admin.peran === 'sales';
  const TABS = tabsUntuk(sales);
  const aktif = TABS.some((t) => t.id === tab) ? tab : 'log';
  const [form, setForm] = useState(null); // { awal } | null
  const [dipilih, setDipilih] = useState(null);
  const [versi, setVersi] = useState(0);
  const [pesan, setPesan] = useState('');
  const segarkan = () => setVersi((v) => v + 1);

  return (
    <>
      <header className="adm-kepala">
        <div>
          <h1>Sales Lapangan</h1>
          <p className="adm-sub">
            {sales
              ? 'Catat tiap keberatan pelanggan waktu kunjungan: apa katanya, kamu jawab apa, dan hasilnya.'
              : 'Keberatan pelanggan yang ditemui sales di lapangan, cara ngejawabnya, dan hasilnya.'}
          </p>
        </div>
        <button className="btn utama" onClick={() => setForm({ awal: {} })}>
          + Catat kunjungan
        </button>
      </header>
      {sales && <LinkSaya api={api} />}
      <Tabs daftar={TABS} aktif={aktif} href={(id) => `#/lapangan/${id}`} />
      {pesan && (
        <p className={pesan.startsWith('Gagal') ? 'adm-error' : 'adm-ok'} role="status">
          {pesan}
        </p>
      )}

      {aktif === 'log' && <Log api={api} sales={sales} versi={versi} onBuka={setDipilih} onCatat={() => setForm({ awal: {} })} />}
      {aktif === 'toko' && <Toko api={api} sales={sales} />}
      {aktif === 'bank' && <Bank api={api} sales={sales} setPesan={setPesan} onPakai={(k) => setForm({ awal: { keberatan_id: k.id } })} />}
      {aktif === 'insight' && <Insight api={api} sales={sales} versi={versi} />}

      {form && (
        <FormLog
          api={api}
          awal={form.awal}
          wajibGps={sales}
          onTutup={() => setForm(null)}
          onSelesai={(t) => {
            setForm(null);
            setPesan(t);
            segarkan();
          }}
        />
      )}
      {dipilih && (
        <Detail
          key={dipilih.id + versi}
          api={api}
          l={dipilih}
          admin={admin}
          onTutup={() => setDipilih(null)}
          onUbah={(l) => (setDipilih(null), setForm({ awal: l }))}
          onHapus={(t) => (setDipilih(null), setPesan(t), segarkan())}
        />
      )}
    </>
  );
}

const bisaUbah = (l, admin) => admin.peran !== 'sales' || (l.sales_id === admin.id && Date.now() - new Date(l.created_at).getTime() < JAM_UBAH_SALES * 3600000);

// ---------------- Log ----------------
function Log({ api, sales, versi, onBuka, onCatat }) {
  const [f, setF] = useState({ q: '', sales: '', kategori: '', hasil: '', dari: '', sampai: '' });
  const [ketik, setKetik] = useState('');
  const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), v: versi });
  const { data, error, muat } = useData(api, `/lapangan/log?${qs}`);
  const { data: bank } = useData(api, '/lapangan/keberatan');
  const { data: ins } = useData(api, sales ? null : '/lapangan/insight');
  const ubah = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const adaFilter = Object.values(f).some(Boolean);
  const kategori = useMemo(() => [...new Set([...(bank || []).map((k) => k.kategori), ...(data || []).map((l) => l.kategori)])].sort(), [bank, data]);

  const ekspor = () => {
    const kepala = ['No', 'Tanggal', 'Sales', 'Kategori', 'Ucapan pelanggan', 'Fakta produk', 'Respon sales', 'Respon customer', 'Hasil', 'Catatan / insight', 'Toko', 'Latitude', 'Longitude', 'Akurasi GPS (m)', 'Waktu GPS', 'Jumlah foto'];
    const sel = (v) => {
      const s = v == null ? '' : String(v);
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const baris = data.map((l) => [l.nomor, l.tanggal, l.sales_nama, l.kategori, l.ucapan, l.fakta, l.respon_sales, l.respon_customer, HASIL[l.hasil]?.pendek, l.catatan, l.id_kunjungan, l.lat ?? '', l.lng ?? '', l.akurasi_m ?? '', l.lokasi_at || '', l.foto.length]);
    const url = URL.createObjectURL(new Blob(['﻿' + [kepala, ...baris].map((r) => r.map(sel).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' }));
    Object.assign(document.createElement('a'), { href: url, download: `sales-lapangan-${hariIniWib()}.csv` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <>
      <section className="adm-kartu" style={{ marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
        <form
          style={{ flex: '1 1 220px', display: 'flex', minWidth: 0 }}
          onSubmit={(e) => {
            e.preventDefault();
            ubah('q', ketik.trim());
          }}
        >
          <input value={ketik} onChange={(e) => setKetik(e.target.value)} placeholder="Cari ucapan, respon, catatan, ID kunjungan" aria-label="Cari log" style={{ flex: 1, minWidth: 0, maxWidth: 'none' }} />
          <button className="btn" type="submit" style={{ flexShrink: 0 }}>
            Cari
          </button>
        </form>
        {!sales && (
          <select value={f.sales} onChange={(e) => ubah('sales', e.target.value)} aria-label="Filter sales">
            <option value="">Semua sales</option>
            {(ins?.sales || []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.nama}
                {s.aktif ? '' : ' (nonaktif)'}
              </option>
            ))}
          </select>
        )}
        <select value={f.kategori} onChange={(e) => ubah('kategori', e.target.value)} aria-label="Filter kategori">
          <option value="">Semua kategori</option>
          {kategori.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
        <select value={f.hasil} onChange={(e) => ubah('hasil', e.target.value)} aria-label="Filter hasil">
          <option value="">Semua hasil</option>
          {Object.entries(HASIL).map(([id, h]) => (
            <option key={id} value={id}>
              {h.pendek}
            </option>
          ))}
        </select>
        <label className="adm-redup" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          Dari
          <input type="date" value={f.dari} max={f.sampai || hariIniWib()} onChange={(e) => ubah('dari', e.target.value)} aria-label="Dari tanggal" />
        </label>
        <label className="adm-redup" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          Sampai
          <input type="date" value={f.sampai} min={f.dari} max={hariIniWib()} onChange={(e) => ubah('sampai', e.target.value)} aria-label="Sampai tanggal" />
        </label>
        {!sales && (
          <button className="btn" onClick={ekspor} disabled={!data?.length}>
            Ekspor
          </button>
        )}
        {adaFilter && (
          <button
            className="btn kecil"
            onClick={() => {
              setF({ q: '', sales: '', kategori: '', hasil: '', dari: '', sampai: '' });
              setKetik('');
            }}
          >
            Hapus filter
          </button>
        )}
      </section>

      {error ? (
        <Gagal apa="log kunjungan" pesan={error} onUlang={muat} />
      ) : !data ? (
        <Memuat apa="log kunjungan" />
      ) : data.length === 0 ? (
        adaFilter ? (
          <Kosong judul="Nggak ada yang cocok">Coba hapus salah satu filter.</Kosong>
        ) : (
          <Kosong
            judul="Belum ada kunjungan yang dicatat"
            aksi={
              <button className="btn utama" onClick={onCatat}>
                + Catat kunjungan
              </button>
            }
          >
            {sales ? 'Tiap ketemu pelanggan yang nolak atau ragu, catat di sini. Makin banyak catatan, makin ketauan jawaban yang ampuh.' : 'Log muncul di sini begitu sales mulai nyatet kunjungan.'}
          </Kosong>
        )
      ) : (
        <>
          <div className="adm-gulir adm-lap-tabel">
            <table className="adm-tabel">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Tanggal</th>
                  {!sales && <th>Sales</th>}
                  <th>Kategori</th>
                  <th>Ucapan pelanggan</th>
                  <th>Respon kamu</th>
                  <th>Respon customer</th>
                  <th>Hasil</th>
                  <th>Catatan / insight</th>
                  <th>Toko &amp; lokasi (lat, long)</th>
                  <th>Foto</th>
                </tr>
              </thead>
              <tbody>
                {data.map((l) => (
                  <tr key={l.id} className="adm-saring" tabIndex={0} onClick={() => onBuka(l)} onKeyDown={(e) => e.key === 'Enter' && onBuka(l)} style={{ cursor: 'pointer', verticalAlign: 'top' }}>
                    <td className="adm-mono">{l.nomor}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{tgl(l.tanggal)}</td>
                    {!sales && <td>{l.sales_nama || '-'}</td>}
                    <td>
                      <span className="adm-chip">{l.kategori}</span>
                    </td>
                    <td className="adm-lap-sel">{l.ucapan}</td>
                    <td className="adm-lap-sel">{l.respon_sales}</td>
                    <td className="adm-lap-sel">{l.respon_customer || <span className="adm-redup">-</span>}</td>
                    <td>
                      <span className={`adm-chip ${HASIL[l.hasil]?.warna}`}>{HASIL[l.hasil]?.pendek}</span>
                    </td>
                    <td className="adm-lap-sel">{l.catatan || <span className="adm-redup">-</span>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <b>{l.id_kunjungan || <span className="adm-redup">Toko nggak dicatat</span>}</b>
                      {l.lat != null ? (
                        <div className="adm-mono" style={{ fontSize: 13 }}>
                          {koordinat(l.lat, l.lng)}
                          {l.akurasi_m != null && <span className="adm-redup" style={l.akurasi_m > 100 ? { color: 'var(--merah)' } : undefined}> ±{l.akurasi_m} m</span>}
                        </div>
                      ) : (
                        <div className="adm-redup" style={{ fontSize: 13 }}>tanpa GPS</div>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{l.foto.length ? `${l.foto.length} foto` : <span className="adm-redup">-</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="adm-lap-kartu">
            {data.map((l) => (
              <li key={l.id}>
                <button className="adm-kartu adm-saring" onClick={() => onBuka(l)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <span className="adm-chip">{l.kategori}</span>
                    <span className={`adm-chip ${HASIL[l.hasil]?.warna}`}>{HASIL[l.hasil]?.pendek}</span>
                  </div>
                  <b>"{l.ucapan}"</b>
                  <span className="adm-redup">Kamu: {l.respon_sales}</span>
                  <span className="adm-redup">
                    #{l.nomor} · {tgl(l.tanggal)}
                    {!sales && l.sales_nama ? ` · ${l.sales_nama}` : ''}
                    {l.foto.length ? ` · ${l.foto.length} foto` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {data.length === 300 && <p className="adm-redup">Nampilin 300 log terbaru. Pakai filter tanggal buat yang lebih lama.</p>}
        </>
      )}
    </>
  );
}

// Foto bukti butuh login, jadi diambil lewat fetch + token lalu ditampilin sebagai blob.
export function Foto({ id, onBuka }) {
  const [url, setUrl] = useState(null);
  const [gagal, setGagal] = useState(false);
  useEffect(() => {
    let u = null;
    let batal = false;
    fetch(`/api/lapangan/foto/${id}`, { headers: { Authorization: 'Bearer ' + (bacaSesi()?.token || '') } })
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((b) => {
        if (batal) return;
        u = URL.createObjectURL(b);
        setUrl(u);
      })
      .catch(() => !batal && setGagal(true));
    return () => {
      batal = true;
      if (u) URL.revokeObjectURL(u);
    };
  }, [id]);
  if (gagal) return <div className="adm-lap-foto adm-redup">Foto nggak kebuka</div>;
  if (!url) return <div className="adm-lap-foto adm-redup">Memuat…</div>;
  return (
    <button className="adm-lap-foto" onClick={() => onBuka?.(url)} aria-label="Lihat foto bukti ukuran penuh">
      <img src={url} alt="Foto bukti kunjungan" />
    </button>
  );
}

export function Detail({ api, l, admin, onTutup, onUbah, onHapus }) {
  const [besar, setBesar] = useState(null);
  const [hapus, setHapus] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    const tekan = (e) => {
      if (e.key !== 'Escape' || document.querySelector('.adm-modal')) return;
      if (besar) setBesar(null);
      else onTutup();
    };
    document.addEventListener('keydown', tekan);
    return () => document.removeEventListener('keydown', tekan);
  }, [onTutup, besar]);
  const boleh = bisaUbah(l, admin);
  const bagian = (judul, isi) => (
    <div style={{ marginTop: 14 }}>
      <span className="adm-label" style={{ fontSize: 11 }}>
        {judul}
      </span>
      <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{isi || <span className="adm-redup">-</span>}</p>
    </div>
  );
  return (
    <>
      <div className="adm-latar" style={{ padding: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onTutup()} />
      <aside className="adm-laci" role="dialog" aria-modal="true" aria-label="Detail kunjungan" style={{ width: 'min(520px, 100%)' }}>
        <div className="adm-modal-kepala">
          <h2 className="adm-mono">Kunjungan #{l.nomor}</h2>
          <button className="adm-tutup" onClick={onTutup} aria-label="Tutup">
            ×
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span className="adm-chip">{l.kategori}</span>
          <span className={`adm-chip ${HASIL[l.hasil]?.warna}`}>{HASIL[l.hasil]?.nama}</span>
        </div>
        <p className="adm-redup" style={{ margin: '8px 0 0' }}>
          {tgl(l.tanggal)} · {l.sales_nama || 'Sales dihapus'}
          {l.id_kunjungan ? ` · ${l.id_kunjungan}` : ''}
        </p>
        {bagian('Ucapan pelanggan', l.ucapan)}
        {l.fakta && (
          <div className="adm-kartu" style={{ boxShadow: 'none', padding: 12, marginTop: 14, background: 'var(--kertas)' }}>
            <span className="adm-label" style={{ fontSize: 11 }}>
              Fakta dari produk (bank keberatan)
            </span>
            <p style={{ margin: '4px 0 0' }}>{l.fakta}</p>
          </div>
        )}
        {bagian('Respon sales', l.respon_sales)}
        {bagian('Respon customer', l.respon_customer)}
        {bagian('Catatan / insight', l.catatan)}
        <div style={{ marginTop: 14 }}>
          <span className="adm-label" style={{ fontSize: 11 }}>
            Bukti
          </span>
          {l.foto.length ? (
            <div className="adm-lap-galeri">
              {l.foto.map((f) => (
                <Foto key={f.id} id={f.id} onBuka={setBesar} />
              ))}
            </div>
          ) : (
            <p className="adm-redup" style={{ margin: '4px 0 0' }}>
              Nggak ada foto.
            </p>
          )}
          {l.lat != null ? (
            <p style={{ margin: '8px 0 0' }}>
              {l.id_kunjungan && (
                <>
                  <b>{l.id_kunjungan}</b>
                  <br />
                </>
              )}
              <span className="adm-mono">
                <b>{koordinat(l.lat, l.lng)}</b>
              </span>
              <span className="adm-redup">
                {l.akurasi_m != null ? ` · akurasi ±${l.akurasi_m} m` : ''}
                {l.lokasi_at ? ` · diambil ${waktu(l.lokasi_at)}` : ''}
              </span>{' '}
              <a href={l.lokasi_url} target="_blank" rel="noopener noreferrer" className="adm-link" style={{ whiteSpace: 'nowrap' }}>
                buka peta
              </a>
            </p>
          ) : l.lokasi_url ? (
            <p style={{ margin: '8px 0 0' }}>
              <a href={l.lokasi_url} target="_blank" rel="noopener noreferrer" className="adm-link">
                Buka link lokasi
              </a>
            </p>
          ) : (
            <p className="adm-redup" style={{ margin: '8px 0 0' }}>
              Nggak ada lokasi.
            </p>
          )}
        </div>
        <p className="adm-redup" style={{ marginTop: 14 }}>
          Dicatat {waktu(l.created_at)}
          {l.diubah_at && new Date(l.diubah_at) - new Date(l.created_at) > 60000 ? ` · diubah ${waktu(l.diubah_at)}` : ''}
        </p>
        {err && <p className="adm-error">{err}</p>}
        {boleh ? (
          <div className="adm-tombol">
            <button className="btn utama" onClick={() => onUbah(l)}>
              Ubah
            </button>
            <button className="btn bahaya" onClick={() => setHapus(true)}>
              Hapus
            </button>
          </div>
        ) : (
          <p className="adm-redup">Lewat {JAM_UBAH_SALES} jam, log cuma bisa dikoreksi admin.</p>
        )}
        {besar && (
          <div className="adm-latar" style={{ zIndex: 60 }} onMouseDown={() => setBesar(null)} role="dialog" aria-label="Foto bukti">
            <img src={besar} alt="Foto bukti kunjungan ukuran penuh" style={{ maxWidth: '95vw', maxHeight: '90vh', border: 'var(--garis)', background: 'var(--putih)' }} />
          </div>
        )}
        {hapus && (
          <Konfirmasi
            judul={`Hapus kunjungan #${l.nomor}?`}
            pesan="Log dan foto buktinya dihapus permanen."
            onBatal={() => setHapus(false)}
            onYa={async () => {
              try {
                await api('DELETE', `/lapangan/log/${l.id}`);
                onHapus(`Kunjungan #${l.nomor} dihapus.`);
              } catch (e) {
                setErr(e.message);
                setHapus(false);
              }
            }}
          />
        )}
      </aside>
    </>
  );
}

// Titik GPS HP. Diambil otomatis pas form dibuka; butuh izin lokasi & HTTPS (makalin.konsulin.com udah HTTPS).
function ambilGps() {
  return new Promise((ok, gagal) => {
    if (!('geolocation' in navigator)) return gagal(new Error('Browser ini nggak bisa baca lokasi'));
    if (!window.isSecureContext) return gagal(new Error('Lokasi cuma bisa dibaca lewat HTTPS'));
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude, akurasi: p.coords.accuracy, waktu: new Date(p.timestamp).toISOString() }),
      (e) =>
        gagal(
          new Error(
            e.code === 1
              ? 'Izin lokasi ditolak. Buka pengaturan situs di browser, izinin Lokasi, lalu ambil lagi.'
              : e.code === 3
                ? 'GPS kelamaan nyari sinyal. Coba di tempat terbuka, lalu ambil lagi.'
                : 'Lokasi nggak kebaca. Pastiin GPS HP nyala, lalu ambil lagi.'
          )
        ),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 }
    );
  });
}

function LokasiGps({ gps, status, error, lama, onAmbil, toko }) {
  const titik = gps || lama;
  return (
    <div className="adm-kartu" style={{ boxShadow: 'none', padding: 12, marginTop: 12 }} aria-live="polite">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="adm-label" style={{ fontSize: 11 }}>
          Lokasi GPS
        </span>
        <button type="button" className="btn kecil" onClick={onAmbil} disabled={status === 'jalan'}>
          {status === 'jalan' ? 'Mencari lokasi…' : titik ? 'Ambil ulang' : 'Ambil lokasi'}
        </button>
      </div>
      {titik ? (
        <p style={{ margin: '6px 0 0' }}>
          <b>{toko || (gps ? 'Lokasi terkunci' : 'Lokasi tersimpan')}</b>
          <span className="adm-redup">{toko ? '' : ' (isi nama toko di atas)'}</span>
          <br />
          <span className="adm-mono">{koordinat(titik.lat, titik.lng)}</span>
          {titik.akurasi != null && <span className={titik.akurasi > 100 ? '' : 'adm-redup'} style={titik.akurasi > 100 ? { color: 'var(--merah)' } : undefined}> · akurasi ±{Math.round(titik.akurasi)} m</span>}
        </p>
      ) : status === 'jalan' ? (
        <p className="adm-redup" style={{ margin: '6px 0 0' }}>Nyari sinyal GPS, biasanya beberapa detik…</p>
      ) : null}
      {titik?.akurasi > 100 && <p className="adm-redup" style={{ margin: '4px 0 0' }}>Akurasinya kurang bagus. Kalau bisa, keluar ruangan lalu ambil ulang.</p>}
      {error && <p className="adm-error" style={{ margin: '6px 0 0' }}>{error}</p>}
    </div>
  );
}

// ---------------- Form catat / ubah ----------------
export function FormLog({ api, awal, wajibGps, onTutup, onSelesai }) {
  const edit = Boolean(awal.id);
  const { data: bank } = useData(api, '/lapangan/keberatan');
  // Toko yang pernah dia kunjungi (kartu CRM miliknya) - buat saran nama toko biar kunjungan nempel ke kartu yang sama.
  const { data: tokoCrm } = useData(api, edit ? null : '/lapangan/crm-toko');
  const [pemilikToko, setPemilikToko] = useState({ nama: '', hp: '' });
  const [isi, setIsi] = useState(() => ({
    tanggal: awal.tanggal || hariIniWib(),
    id_kunjungan: awal.id_kunjungan || '',
    keberatan_id: awal.keberatan_id || '',
    kategori: awal.kategori || '',
    ucapan: awal.ucapan || '',
    respon_sales: awal.respon_sales || '',
    respon_customer: awal.respon_customer || '',
    hasil: awal.hasil || '',
    catatan: awal.catatan || '',
  }));
  const [lainnya, setLainnya] = useState(edit && !awal.keberatan_id);
  const [fotoLama, setFotoLama] = useState(awal.foto || []);
  const [hapusFoto, setHapusFoto] = useState([]);
  const [fotoBaru, setFotoBaru] = useState([]);
  const [error, setError] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [gps, setGps] = useState(null);
  const [gpsStatus, setGpsStatus] = useState('');
  const [gpsError, setGpsError] = useState('');
  const lokasiLama = awal.lat != null ? { lat: awal.lat, lng: awal.lng, akurasi: awal.akurasi_m } : null;
  const ambilLokasi = () => {
    setGpsStatus('jalan');
    setGpsError('');
    ambilGps()
      .then((g) => {
        setGps(g);
        setGpsStatus('ok');
      })
      .catch((e) => {
        setGpsError(e.message);
        setGpsStatus('gagal');
      });
  };
  // Catatan baru: lokasi langsung diambil begitu form dibuka.
  useEffect(() => {
    if (!edit) ambilLokasi();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const ubah = (k) => (e) => setIsi((x) => ({ ...x, [k]: e.target.value }));
  const dipilih = bank?.find((k) => k.id === isi.keberatan_id) || null;
  const tokoLama = !edit && isi.id_kunjungan.trim() ? (tokoCrm || []).find((t) => t.nama.trim().toLowerCase() === isi.id_kunjungan.trim().toLowerCase()) || null : null;
  const sisaFoto = MAKS_FOTO - fotoLama.length - fotoBaru.length;
  const gaya = { maxWidth: 'none', width: '100%', minHeight: 44 };

  // Bank keberatan dari link "Pakai di kunjungan": isi ucapan standarnya biar tinggal disesuaiin.
  useEffect(() => {
    if (!edit && dipilih && !isi.ucapan) setIsi((x) => ({ ...x, ucapan: dipilih.ucapan }));
  }, [dipilih, edit, isi.ucapan]);

  const pilihBank = (e) => {
    const v = e.target.value;
    if (v === '__lain') {
      setLainnya(true);
      setIsi((x) => ({ ...x, keberatan_id: '' }));
      return;
    }
    setLainnya(false);
    const k = bank.find((b) => b.id === v);
    setIsi((x) => ({ ...x, keberatan_id: v, ucapan: !x.ucapan || bank.some((b) => b.ucapan === x.ucapan) ? k?.ucapan || '' : x.ucapan }));
  };

  const tambahFoto = async (e) => {
    const files = [...(e.target.files || [])].slice(0, sisaFoto);
    e.target.value = '';
    setError('');
    try {
      const hasil = [];
      for (const f of files) hasil.push(await keWebp(f, 1600));
      setFotoBaru((x) => [...x, ...hasil]);
    } catch (err) {
      setError('Foto gagal dibaca: ' + err.message);
    }
  };

  return (
    <Modal judul={edit ? `Ubah kunjungan #${awal.nomor}` : 'Catat kunjungan'} onTutup={onTutup} lebar={720}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          setSibuk(true);
          try {
            const body = { ...isi, keberatan_id: lainnya ? null : isi.keberatan_id || null, ...(gps ? { gps } : {}) };
            if (edit) {
              await api('PATCH', `/lapangan/log/${awal.id}`, { ...body, foto_baru: fotoBaru, hapus_foto: hapusFoto });
              onSelesai(`Kunjungan #${awal.nomor} disimpan.`);
            } else {
              const h = await api('POST', '/lapangan/log', {
                ...body,
                toko: isi.id_kunjungan,
                lead_id: tokoLama?.id || null,
                pemilik_nama: tokoLama ? null : pemilikToko.nama,
                pemilik_hp: tokoLama ? null : pemilikToko.hp,
                foto: fotoBaru,
              });
              onSelesai(`Kunjungan #${h.nomor} dicatat.`);
            }
          } catch (err) {
            setError(err.message);
            setSibuk(false);
          }
        }}
      >
        <div className="adm-baris" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <div className="field">
            <label htmlFor="l-tgl">Tanggal kunjungan</label>
            <input id="l-tgl" type="date" value={isi.tanggal} max={hariIniWib()} onChange={ubah('tanggal')} required />
          </div>
          <div className="field">
            <label htmlFor="l-id">Toko</label>
            <input
              id="l-id"
              value={isi.id_kunjungan}
              onChange={ubah('id_kunjungan')}
              maxLength={100}
              placeholder="Misal: Warung Bu Siti"
              list="l-toko-lama"
              autoComplete="off"
              readOnly={edit}
              required={!edit}
            />
            <datalist id="l-toko-lama">
              {(tokoCrm || []).map((t) => (
                <option key={t.id} value={t.nama} />
              ))}
            </datalist>
          </div>
        </div>
        {!edit && isi.id_kunjungan.trim() && (
          tokoLama ? (
            <p className="adm-redup" style={{ margin: '6px 0 0' }}>
              Toko lama, nempel ke kartu CRM yang sama (sekarang di tahap <b>{NAMA_TAHAP_CRM[tokoLama.tahap] || tokoLama.tahap}</b>).
            </p>
          ) : (
            <div className="adm-kartu" style={{ boxShadow: 'none', padding: 12, marginTop: 10 }}>
              <p style={{ margin: 0 }}>
                <b>Toko baru.</b> <span className="adm-redup">Dibikinin kartu CRM baru atas namamu.</span>
              </p>
              <div className="adm-baris" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                <div className="field">
                  <label htmlFor="l-pemilik">Nama pemilik (opsional)</label>
                  <input id="l-pemilik" value={pemilikToko.nama} onChange={(e) => setPemilikToko((x) => ({ ...x, nama: e.target.value }))} maxLength={80} placeholder="Bu Siti" />
                </div>
                <div className="field">
                  <label htmlFor="l-pemilik-hp">No. HP pemilik (opsional)</label>
                  <input id="l-pemilik-hp" value={pemilikToko.hp} onChange={(e) => setPemilikToko((x) => ({ ...x, hp: e.target.value }))} inputMode="tel" maxLength={20} placeholder="0812…" />
                </div>
              </div>
            </div>
          )
        )}

        <div className="field">
          <label htmlFor="l-bank">Keberatan pelanggan</label>
          <select id="l-bank" value={lainnya ? '__lain' : isi.keberatan_id} onChange={pilihBank} style={gaya} required={!lainnya}>
            <option value="">{bank ? 'Pilih dari bank keberatan' : 'Memuat…'}</option>
            {(bank || []).map((k) => (
              <option key={k.id} value={k.id}>
                {k.kategori}: {k.ucapan.length > 70 ? k.ucapan.slice(0, 70) + '…' : k.ucapan}
              </option>
            ))}
            <option value="__lain">Lainnya (belum ada di bank)</option>
          </select>
        </div>
        {lainnya && (
          <div className="field">
            <label htmlFor="l-kat">Kategori</label>
            <input id="l-kat" value={isi.kategori} onChange={ubah('kategori')} maxLength={60} placeholder="Misal: Sinyal / Internet" required />
          </div>
        )}
        {dipilih && !lainnya && (
          <div className="adm-kartu" style={{ boxShadow: 'none', padding: 12, marginTop: 12, background: 'var(--kertas)' }}>
            <span className="adm-label" style={{ fontSize: 11 }}>
              Fakta buat ngejawab
            </span>
            <p style={{ margin: '4px 0 0' }}>{dipilih.fakta}</p>
          </div>
        )}
        <div className="field">
          <label htmlFor="l-ucapan">Ucapan pelanggan (kata-katanya langsung)</label>
          <textarea id="l-ucapan" value={isi.ucapan} onChange={ubah('ucapan')} rows={2} maxLength={1000} required />
        </div>
        <div className="field">
          <label htmlFor="l-respon">Respon kamu</label>
          <textarea id="l-respon" value={isi.respon_sales} onChange={ubah('respon_sales')} rows={3} maxLength={2000} placeholder="Apa yang kamu bilang ke pelanggan" required />
        </div>
        <div className="field">
          <label htmlFor="l-cust">Respon customer</label>
          <textarea id="l-cust" value={isi.respon_customer} onChange={ubah('respon_customer')} rows={2} maxLength={2000} placeholder="Jawaban pelanggan setelah kamu jelasin" />
        </div>

        <fieldset className="field" style={{ border: 0, padding: 0, margin: '12px 0 0' }}>
          <legend className="adm-label" style={{ fontSize: 11, marginBottom: 6 }}>
            Hasil
          </legend>
          <div className="adm-lap-hasil">
            {Object.entries(HASIL).map(([id, h]) => (
              <button key={id} type="button" className={isi.hasil === id ? 'on ' + id : ''} aria-pressed={isi.hasil === id} onClick={() => setIsi((x) => ({ ...x, hasil: id }))}>
                {h.nama}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="field">
          <label htmlFor="l-catatan">Catatan / insight</label>
          <textarea id="l-catatan" value={isi.catatan} onChange={ubah('catatan')} rows={2} maxLength={2000} placeholder="Yang bikin berhasil / gagal, pola yang kamu lihat" />
        </div>
        <LokasiGps gps={gps} status={gpsStatus} error={gpsError} lama={lokasiLama} onAmbil={ambilLokasi} toko={isi.id_kunjungan.trim()} />

        <div className="field">
          <span className="adm-label" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>
            Foto bukti (maksimal {MAKS_FOTO})
          </span>
          <div className="adm-lap-galeri">
            {fotoLama.map((f) => (
              <div key={f.id} className="adm-lap-foto-wadah">
                <Foto id={f.id} />
                <button
                  type="button"
                  className="btn kecil"
                  onClick={() => {
                    setFotoLama((x) => x.filter((y) => y.id !== f.id));
                    setHapusFoto((x) => [...x, f.id]);
                  }}
                >
                  Buang
                </button>
              </div>
            ))}
            {fotoBaru.map((f, i) => (
              <div key={i} className="adm-lap-foto-wadah">
                <div className="adm-lap-foto">
                  <img src={f.data} alt={`Foto baru ${i + 1}`} />
                </div>
                <button type="button" className="btn kecil" onClick={() => setFotoBaru((x) => x.filter((_, j) => j !== i))}>
                  Buang
                </button>
              </div>
            ))}
            {sisaFoto > 0 && (
              <label className="adm-lap-foto adm-lap-tambah">
                <input type="file" accept="image/*" capture="environment" multiple onChange={tambahFoto} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} />
                <b>+ Foto</b>
                <span className="adm-redup">kamera / galeri</span>
              </label>
            )}
          </div>
        </div>

        {error && <p className="adm-error">{error}</p>}
        <div className="adm-tombol" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="btn" onClick={onTutup}>
            Batal
          </button>
          {wajibGps && !edit && !gps && <span className="adm-redup" style={{ alignSelf: 'center', marginRight: 'auto' }}>Ambil lokasi GPS dulu buat nyimpen.</span>}
          <button type="submit" className="btn utama" disabled={sibuk || !isi.hasil || isi.ucapan.trim().length < 3 || isi.respon_sales.trim().length < 3 || (!edit && !isi.id_kunjungan.trim()) || (wajibGps && !edit && !gps)}>
            {sibuk ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------- Toko saya ----------------
const rupiah = (n) => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
export function sisaHari(t) {
  if (!t) return '';
  const h = Math.ceil((new Date(t) - Date.now()) / 86400000);
  return h >= 0 ? `sisa ${h} hari` : `lewat ${-h} hari`;
}

// Link & kode referral sales. Warung yang daftar lewat link ini (atau ngetik kodenya) otomatis jadi toko sales ini.
const KUNCI_LINK_CIUT = 'makalin_link_sales_ciut';

function LinkSales({ link, sales, milikSendiri }) {
  const [qr, setQr] = useState(null);
  const [bukaQr, setBukaQr] = useState(false);
  const [pesan, setPesan] = useState('');
  // Disembunyiin / ditampilin - diingat di browser ini aja (preferensi tampilan, bukan data).
  const [ciut, setCiut] = useState(() => {
    try {
      return localStorage.getItem(KUNCI_LINK_CIUT) === '1';
    } catch {
      return false;
    }
  });
  const gantiCiut = (v) => {
    setCiut(v);
    try {
      localStorage.setItem(KUNCI_LINK_CIUT, v ? '1' : '0');
    } catch {
      /* diblok - cukup di memori */
    }
  };
  useEffect(() => {
    let batal = false;
    QRCode.toDataURL(link, { width: 480, margin: 2, errorCorrectionLevel: 'M' })
      .then((u) => !batal && setQr(u))
      .catch(() => !batal && setQr(false));
    return () => {
      batal = true;
    };
  }, [link]);
  const teksWa = `Halo, ini link daftar Asisten Warung, aplikasi catat jualan, stok, dan kasbon warung di HP. Bisa coba gratis 7 hari: ${link}${sales?.kode ? ` (kode sales: ${sales.kode})` : ''}`;
  const salin = () =>
    navigator.clipboard?.writeText(link).then(
      () => {
        setPesan('Link disalin.');
        setTimeout(() => setPesan(''), 2000);
      },
      () => window.prompt('Salin link ini:', link)
    ) ?? window.prompt('Salin link ini:', link);
  const judul = milikSendiri ? 'Link & kode kamu' : 'Link & kode sales';
  const bisaBagikan = typeof navigator !== 'undefined' && Boolean(navigator.share);
  if (ciut) {
    return (
      <section className="adm-kartu adm-lap-link-ciut" aria-label="Link dan kode sales">
        <span className="adm-label">Kode sales</span>
        <b className="adm-mono" style={{ marginRight: 'auto' }}>
          {sales?.kode}
        </b>
        {pesan && (
          <span className="adm-redup" role="status">
            {pesan}
          </span>
        )}
        <button className="btn kecil" onClick={salin}>
          Salin link
        </button>
        <button className="btn kecil" onClick={() => gantiCiut(false)} aria-expanded={false}>
          Tampilkan
        </button>
      </section>
    );
  }
  return (
    <section className="adm-kartu adm-lap-link" aria-label="Link dan kode sales">
      <div className="adm-lap-link-kepala">
        <span className="adm-label">{judul}</span>
        <button className="adm-lap-link-ciutkan" onClick={() => gantiCiut(true)} aria-expanded={true}>
          Sembunyikan
        </button>
      </div>

      <div className="adm-lap-link-kode">
        <span className="adm-redup">Kode sales</span>
        <b className="adm-mono">{sales?.kode}</b>
        {sales && !sales.aktif && <span className="adm-chip merah">Nonaktif</span>}
      </div>

      <div className="adm-lap-link-salin">
        <input value={link} readOnly aria-label="Link daftar dengan kode sales" onFocus={(e) => e.target.select()} className="adm-mono" />
        <button className="btn utama" onClick={salin}>
          {pesan ? 'Tersalin' : 'Salin'}
        </button>
      </div>

      <div className={'adm-lap-link-aksi' + (bisaBagikan ? '' : ' dua')}>
        <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(teksWa)}`} target="_blank" rel="noopener noreferrer">
          WhatsApp
        </a>
        {bisaBagikan && (
          <button className="btn" onClick={() => navigator.share({ title: 'Daftar Asisten Warung', text: teksWa }).catch(() => {})}>
            Bagikan
          </button>
        )}
        <button className="btn" onClick={() => setBukaQr(true)} disabled={!qr}>
          QR code
        </button>
      </div>

      {sales && !sales.aktif ? (
        <p className="adm-error" style={{ margin: '10px 0 0' }}>
          Kode ini lagi nonaktif di Warung Pintar. Minta admin aktifin dulu sebelum dibagiin.
        </p>
      ) : (
        <p className="adm-redup" style={{ margin: '10px 0 0', fontSize: 13 }}>
          Warung yang daftar lewat link / QR ini, atau ngetik kode {sales?.kode}, otomatis jadi {milikSendiri ? 'toko kamu' : 'toko sales ini'}.
        </p>
      )}

      {bukaQr && qr && (
        <Modal judul={`QR code ${sales?.kode || ''}`} onTutup={() => setBukaQr(false)} lebar={420}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <img src={qr} alt={`QR code link daftar dengan kode sales ${sales?.kode}`} className="adm-lap-qr-besar" />
            <p className="adm-redup" style={{ margin: 0, textAlign: 'center' }}>
              Minta pemilik warung scan pakai kamera HP-nya.
            </p>
            <div className="adm-tombol" style={{ marginTop: 0 }}>
              <a className="btn utama" href={qr} download={`qr-sales-${sales?.kode || 'link'}.png`}>
                Unduh QR
              </a>
              <button className="btn" onClick={() => setBukaQr(false)}>
                Tutup
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}

// Kartu link di atas halaman buat akun sales - alat utama mereka di lapangan, jadi nggak disembunyiin di tab.
function LinkSaya({ api }) {
  const { data, error, muat } = useData(api, '/lapangan/link');
  if (error) return <Gagal apa="link sales" pesan={error} onUlang={muat} />;
  if (!data) return <Memuat apa="link sales" />;
  if (!data.terhubung) {
    return (
      <div className="adm-gagal" style={{ background: 'var(--kuning)', marginBottom: 14 }} role="status">
        <div>
          <b>Link & kode sales kamu belum muncul.</b> Akunmu belum disambungin ke kode sales Warung Pintar. Minta admin buka Pengaturan, Pengguna &amp; tim, lalu pilih kode sales buat akunmu.
        </div>
      </div>
    );
  }
  return <LinkSales link={data.link} sales={data.sales} milikSendiri />;
}

function Toko({ api, sales }) {
  const [akun, setAkun] = useState('');
  const { data: daftar } = useData(api, sales ? null : '/admin');
  const akunSales = (daftar || []).filter((a) => a.peran === 'sales');
  const { data, error, muat } = useData(api, sales ? '/lapangan/toko' : akun ? `/lapangan/toko?akun=${akun}` : null);
  const [filter, setFilter] = useState('');

  return (
    <>
      {!sales && (
        <section className="adm-kartu" style={{ marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <label htmlFor="toko-akun" className="adm-label" style={{ fontSize: 11 }}>
            Akun sales
          </label>
          <select id="toko-akun" value={akun} onChange={(e) => setAkun(e.target.value)}>
            <option value="">{daftar ? 'Pilih akun sales' : 'Memuat…'}</option>
            {akunSales.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nama}
                {a.wp_sales_id ? '' : ' (belum dihubungin)'}
              </option>
            ))}
          </select>
          <span className="adm-redup">Hubungin akun sales ke kode sales Warung Pintar di Pengaturan, Pengguna &amp; tim.</span>
        </section>
      )}
      {!sales && !akun ? (
        <Kosong judul="Pilih akun sales dulu">Tab ini nampilin toko yang dipegang sales itu dan pembayaran dari tokonya.</Kosong>
      ) : error ? (
        <Gagal apa="toko" pesan={error} onUlang={muat} />
      ) : !data ? (
        <Memuat apa="toko" />
      ) : !data.terhubung ? (
        <Kosong judul="Akun ini belum dihubungin ke kode sales">
          {sales ? 'Minta admin nyambungin akunmu ke kode sales Warung Pintar-mu. Setelah itu toko yang kamu pegang muncul di sini.' : 'Buka Pengaturan, Pengguna & tim, lalu pilih kode sales Warung Pintar buat akun ini.'}
        </Kosong>
      ) : (
        <>
          {data.link && !sales && <LinkSales link={data.link} sales={data.sales} milikSendiri={false} />}
          <section className="adm-lap-toko-atas">
            <div className="adm-kartu">
              <span className="adm-label">Toko dipegang</span>
              <b className="p-num" style={{ fontSize: 22 }}>{data.toko.length}</b>
              <span className="adm-redup">
                {(data.ringkas.langganan || 0) + (data.ringkas.permanen || 0)} masih berlangganan · {data.ringkas.trial || 0} trial
              </span>
            </div>
            <div className="adm-kartu">
              <span className="adm-label">Pembayaran bulan ini</span>
              <b className="p-num" style={{ fontSize: 22 }}>{rupiah(data.total.bulanIni)}</b>
              <span className="adm-redup">{data.total.tokoBaruBulanIni} toko bayar pertama kali bulan ini</span>
            </div>
            <div className="adm-kartu">
              <span className="adm-label">Total pembayaran</span>
              <b className="p-num" style={{ fontSize: 22 }}>{rupiah(data.total.semua)}</b>
              <span className="adm-redup">{sales ? 'dari toko waktu kamu pegang' : 'dari toko selama dipegang sales ini'}</span>
            </div>
          </section>
          <p className="adm-redup" style={{ margin: '0 0 14px' }}>
            Angka di atas itu uang yang dibayar toko, bukan komisi. Komisi belum dihitung di sini.
          </p>

          <div className="adm-chip-filter">
            <button className={'adm-chip' + (filter === '' ? ' biru' : '')} onClick={() => setFilter('')}>
              Semua {data.toko.length}
            </button>
            {Object.entries(STATUS_TOKO).map(([id, st]) =>
              data.ringkas[id] ? (
                <button key={id} className={'adm-chip' + (filter === id ? ' biru' : '')} onClick={() => setFilter(id)} aria-pressed={filter === id}>
                  {st.nama} {data.ringkas[id]}
                </button>
              ) : null
            )}
          </div>

          {data.toko.length === 0 ? (
            <Kosong judul={sales ? 'Belum ada toko yang kamu pegang' : 'Sales ini belum pegang toko'}>Toko muncul di sini begitu ada warung yang daftar pakai kode atau link sales ini.</Kosong>
          ) : (
            <>
            <ul className="adm-lap-kartu" style={{ marginBottom: 20 }}>
              {data.toko
                .filter((t) => !filter || t.tahap === filter)
                .map((t) => (
                  <li key={t.id} className="adm-kartu" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                      <b style={{ overflowWrap: 'anywhere' }}>{t.nama}</b>
                      <span className={`adm-chip ${STATUS_TOKO[t.tahap]?.warna}`}>{STATUS_TOKO[t.tahap]?.nama}</span>
                    </div>
                    <span className="adm-redup">
                      {t.plan} · {t.tahap === 'permanen' ? 'seumur hidup' : `${tgl(t.lisensi_berlaku_sampai)} (${sisaHari(t.lisensi_berlaku_sampai)})`}
                    </span>
                    <span className="adm-redup">
                      Dibayar {rupiah(t.total_bayar)} ({t.jumlah_bayar}×) · pakai app {t.terakhir_aktif ? waktu(t.terakhir_aktif) : 'belum pernah'}
                    </span>
                    {t.no_hp && (
                      <a className="adm-link" href={`https://wa.me/${t.no_hp.replace(/\D/g, '').replace(/^0/, '62')}`} target="_blank" rel="noopener noreferrer">
                        WhatsApp pemilik
                      </a>
                    )}
                  </li>
                ))}
            </ul>
            <div className="adm-gulir adm-lap-tabel" style={{ marginBottom: 20 }}>
              <table className="adm-tabel">
                <thead>
                  <tr>
                    <th>Toko</th>
                    <th>Status</th>
                    <th>Paket</th>
                    <th>Berlaku sampai</th>
                    <th className="kanan">Total dibayar</th>
                    <th>Terakhir pakai app</th>
                    <th>Kontak</th>
                  </tr>
                </thead>
                <tbody>
                  {data.toko
                    .filter((t) => !filter || t.tahap === filter)
                    .map((t) => (
                      <tr key={t.id}>
                        <td>
                          <b>{t.nama}</b>
                          <div className="adm-redup">
                            {t.jenis_usaha ? `${t.jenis_usaha} · ` : ''}dipegang sejak {tgl(t.pegang_sejak)}
                          </div>
                        </td>
                        <td>
                          <span className={`adm-chip ${STATUS_TOKO[t.tahap]?.warna}`}>{STATUS_TOKO[t.tahap]?.nama}</span>
                        </td>
                        <td>{t.plan}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {t.tahap === 'permanen' ? (
                            'Seumur hidup'
                          ) : (
                            <>
                              {tgl(t.lisensi_berlaku_sampai)}
                              <div className="adm-redup" style={['berhenti', 'trial_habis'].includes(t.tahap) ? { color: 'var(--merah)' } : undefined}>
                                {sisaHari(t.lisensi_berlaku_sampai)}
                              </div>
                            </>
                          )}
                        </td>
                        <td className="kanan p-num">
                          {rupiah(t.total_bayar)}
                          <div className="adm-redup">{t.jumlah_bayar}× bayar</div>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>{t.terakhir_aktif ? waktu(t.terakhir_aktif) : <span className="adm-redup">Belum pernah</span>}</td>
                        <td>
                          {t.no_hp ? (
                            <a className="adm-link" href={`https://wa.me/${t.no_hp.replace(/\D/g, '').replace(/^0/, '62')}`} target="_blank" rel="noopener noreferrer">
                              WhatsApp
                            </a>
                          ) : (
                            <span className="adm-redup">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            </>
          )}

          <h2 style={{ fontSize: 20 }}>{sales ? 'Pembayaran dari toko kamu' : 'Pembayaran dari toko sales ini'}</h2>
          {data.pembayaran.length === 0 ? (
            <Kosong judul="Belum ada pembayaran">Pembayaran lunas dari toko yang kamu pegang muncul di sini.</Kosong>
          ) : (
            <div className="adm-gulir">
              <table className="adm-tabel">
                <thead>
                  <tr>
                    <th>Lunas</th>
                    <th>Toko</th>
                    <th>Paket</th>
                    <th>Order</th>
                    <th className="kanan">Jumlah</th>
                  </tr>
                </thead>
                <tbody>
                  {data.pembayaran.map((p) => (
                    <tr key={p.order_id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{waktu(p.lunas_pada)}</td>
                      <td>{p.warung_nama}</td>
                      <td>{p.plan}</td>
                      <td>{p.urutan === 1 ? <span className="adm-chip hijau">Pertama</span> : <span className="adm-chip">Perpanjangan ke-{p.urutan - 1}</span>}</td>
                      <td className="kanan p-num">{rupiah(p.jumlah)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}

// ---------------- Bank keberatan ----------------
function Bank({ api, sales, setPesan, onPakai }) {
  const [semua, setSemua] = useState(false);
  const { data, error, muat } = useData(api, `/lapangan/keberatan${semua ? '?semua=1' : ''}`);
  const [form, setForm] = useState(null);
  const simpanAktif = async (k, aktif) => {
    try {
      await api('PATCH', `/lapangan/keberatan/${k.id}`, { aktif });
      setPesan(`${k.kategori} ${aktif ? 'diaktifin lagi' : 'dinonaktifin'}.`);
      muat();
    } catch (e) {
      setPesan('Gagal: ' + e.message);
    }
  };
  if (error) return <Gagal apa="bank keberatan" pesan={error} onUlang={muat} />;
  if (!data) return <Memuat apa="bank keberatan" />;
  return (
    <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <p className="adm-redup" style={{ margin: 0, marginRight: 'auto' }}>
          Keberatan yang sering muncul + fakta produk buat ngejawabnya. {sales ? 'Pakai ini sebagai contekan waktu kunjungan.' : 'Sales milih dari daftar ini waktu nyatet kunjungan.'}
        </p>
        {!sales && (
          <>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" className="adm-centang" checked={semua} onChange={(e) => setSemua(e.target.checked)} /> Tampilkan yang nonaktif
            </label>
            <button className="btn utama" onClick={() => setForm({})}>
              + Tambah keberatan
            </button>
          </>
        )}
      </div>
      {data.length === 0 ? (
        <Kosong judul="Bank keberatan masih kosong">{sales ? 'Minta admin ngisi daftar keberatan.' : 'Tambah keberatan yang sering didengar sales di lapangan.'}</Kosong>
      ) : (
        <div className="adm-lap-bank">
          {data.map((k) => (
            <article key={k.id} className="adm-kartu" style={k.aktif ? undefined : { opacity: 0.6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <span className="adm-chip ungu">{k.kategori}</span>
                <span className="adm-redup p-num" style={{ fontSize: 13 }}>
                  {k.dipakai ? `dipakai ${k.dipakai}× · ${Math.round((k.berhasil / k.dipakai) * 100)}% berhasil` : 'belum dipakai'}
                </span>
              </div>
              <p style={{ margin: '12px 0 0', fontWeight: 700, fontSize: 17 }}>"{k.ucapan}"</p>
              <div style={{ borderTop: '1px solid #E4E4E7', marginTop: 12, paddingTop: 10 }}>
                <span className="adm-label" style={{ fontSize: 11 }}>
                  Fakta dari produk
                </span>
                <p style={{ margin: '4px 0 0' }}>{k.fakta}</p>
              </div>
              <div className="adm-tombol">
                {k.aktif && (
                  <button className="btn kecil utama" onClick={() => onPakai(k)}>
                    Catat kunjungan dengan ini
                  </button>
                )}
                {!sales && (
                  <>
                    <button className="btn kecil" onClick={() => setForm(k)}>
                      Ubah
                    </button>
                    <button className="btn kecil" onClick={() => simpanAktif(k, !k.aktif)}>
                      {k.aktif ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                  </>
                )}
                {!k.aktif && <span className="adm-chip">Nonaktif</span>}
              </div>
            </article>
          ))}
        </div>
      )}
      {form && (
        <FormBank
          api={api}
          awal={form}
          onTutup={() => setForm(null)}
          onSelesai={(t) => {
            setForm(null);
            setPesan(t);
            muat();
          }}
        />
      )}
    </>
  );
}

function FormBank({ api, awal, onTutup, onSelesai }) {
  const [isi, setIsi] = useState({ kategori: awal.kategori || '', ucapan: awal.ucapan || '', fakta: awal.fakta || '' });
  const [error, setError] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const ubah = (k) => (e) => setIsi((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Modal judul={awal.id ? `Ubah ${awal.kategori}` : 'Tambah keberatan'} onTutup={onTutup}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          setSibuk(true);
          try {
            if (awal.id) await api('PATCH', `/lapangan/keberatan/${awal.id}`, isi);
            else await api('POST', '/lapangan/keberatan', isi);
            onSelesai(`${isi.kategori} disimpan.`);
          } catch (err) {
            setError(err.message);
            setSibuk(false);
          }
        }}
      >
        <div className="field">
          <label htmlFor="b-kat">Kategori</label>
          <input id="b-kat" value={isi.kategori} onChange={ubah('kategori')} maxLength={60} placeholder="Gaptek/HP" required />
        </div>
        <div className="field">
          <label htmlFor="b-ucapan">Ucapan pelanggan</label>
          <textarea id="b-ucapan" value={isi.ucapan} onChange={ubah('ucapan')} rows={2} maxLength={500} placeholder="Saya gaptek, gak ngerti HP." required />
        </div>
        <div className="field">
          <label htmlFor="b-fakta">Fakta dari produk (buat ngejawab)</label>
          <textarea id="b-fakta" value={isi.fakta} onChange={ubah('fakta')} rows={4} maxLength={1500} required />
        </div>
        {awal.id && <p className="adm-redup">Log kunjungan lama tetap nyimpen kategori aslinya; fakta yang ditampilin ikut versi terbaru.</p>}
        {error && <p className="adm-error">{error}</p>}
        <div className="adm-tombol" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="btn" onClick={onTutup}>
            Batal
          </button>
          <button type="submit" className="btn utama" disabled={sibuk || !isi.kategori.trim() || !isi.ucapan.trim() || !isi.fakta.trim()}>
            {sibuk ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------- Insight ----------------
function BarHasil({ r, tinggi = 14 }) {
  if (!r.total) return null;
  return (
    <div className="adm-lap-bar" style={{ height: tinggi }} role="img" aria-label={Object.keys(HASIL).map((h) => `${HASIL[h].pendek} ${r[h]}`).join(', ')}>
      {Object.keys(HASIL).map((h) => (r[h] ? <div key={h} style={{ width: `${(r[h] / r.total) * 100}%`, background: HASIL[h].isi }} title={`${HASIL[h].pendek}: ${r[h]}`} /> : null))}
    </div>
  );
}

function Insight({ api, sales, versi }) {
  const [f, setF] = useState({ dari: '', sampai: '' });
  const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), v: versi });
  const { data, error, muat } = useData(api, `/lapangan/insight?${qs}`);
  if (error) return <Gagal apa="insight" pesan={error} onUlang={muat} />;
  if (!data) return <Memuat apa="insight" />;
  const t = data.total;
  const persen = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '-');
  return (
    <>
      <section className="adm-kartu" style={{ marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <label className="adm-redup" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          Dari
          <input type="date" value={f.dari} max={f.sampai || hariIniWib()} onChange={(e) => setF((x) => ({ ...x, dari: e.target.value }))} />
        </label>
        <label className="adm-redup" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          Sampai
          <input type="date" value={f.sampai} min={f.dari} max={hariIniWib()} onChange={(e) => setF((x) => ({ ...x, sampai: e.target.value }))} />
        </label>
        <span className="adm-redup">{sales ? 'Cuma kunjunganmu sendiri.' : 'Semua sales.'}</span>
      </section>
      {!t.total ? (
        <Kosong judul="Belum ada data">Insight muncul setelah ada kunjungan yang dicatat{f.dari || f.sampai ? ' di rentang tanggal ini' : ''}.</Kosong>
      ) : (
        <>
          <section className="adm-kartu" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <span className="adm-label">Hasil {t.total} kunjungan</span>
              <b className="p-num" style={{ fontSize: 22 }}>
                {persen(t.berhasil, t.total)} berhasil
              </b>
            </div>
            <div style={{ marginTop: 10 }}>
              <BarHasil r={t} tinggi={22} />
            </div>
            <ul className="adm-art-legenda" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '6px 18px', marginTop: 10 }}>
              {Object.entries(HASIL).map(([id, h]) => (
                <li key={id}>
                  <i style={{ background: h.isi }} /> {h.pendek} <b className="p-num">{t[id]}</b>
                </li>
              ))}
            </ul>
          </section>

          <div className="adm-kolom">
            <section className="adm-kartu">
              <h2 style={{ marginTop: 0 }}>Per kategori keberatan</h2>
              <div className="adm-gulir">
                <table className="adm-tabel">
                  <thead>
                    <tr>
                      <th>Kategori</th>
                      <th className="kanan">Kunjungan</th>
                      <th style={{ minWidth: 140 }}>Hasil</th>
                      <th className="kanan">Berhasil</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.perKategori.map((k) => (
                      <tr key={k.kategori}>
                        <td>{k.kategori}</td>
                        <td className="kanan p-num">{k.total}</td>
                        <td>
                          <BarHasil r={k} />
                        </td>
                        <td className="kanan p-num">
                          <b>{persen(k.berhasil, k.total)}</b>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="adm-redup" style={{ marginBottom: 0 }}>
                Kategori dengan persen berhasil rendah = fakta buat ngejawabnya perlu diperkuat di bank keberatan.
              </p>
            </section>
            <section className="adm-kartu">
              <h2 style={{ marginTop: 0 }}>Catatan / insight terbaru</h2>
              {data.catatan.length === 0 ? (
                <p className="adm-redup">Belum ada catatan insight.</p>
              ) : (
                <ul className="adm-daftar">
                  {data.catatan.map((c) => (
                    <li key={c.id} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                      <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{c.catatan}</span>
                      <span className="adm-redup">
                        #{c.nomor} · {c.kategori} · {HASIL[c.hasil]?.pendek} · {tgl(c.tanggal)}
                        {!sales && c.sales_nama ? ` · ${c.sales_nama}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {!sales && (
            <section className="adm-kartu" style={{ marginTop: 20 }}>
              <h2 style={{ marginTop: 0 }}>Per sales</h2>
              {data.perSales.length === 0 ? (
                <p className="adm-redup">Belum ada.</p>
              ) : (
                <div className="adm-gulir">
                  <table className="adm-tabel">
                    <thead>
                      <tr>
                        <th>Sales</th>
                        <th className="kanan">Kunjungan</th>
                        <th className="kanan">Hari aktif</th>
                        <th className="kanan">Berhasil</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.perSales.map((s) => (
                        <tr key={s.sales_id}>
                          <td>{s.nama || 'Akun dihapus'}</td>
                          <td className="kanan p-num">{s.total}</td>
                          <td className="kanan p-num">{s.hari_aktif}</td>
                          <td className="kanan p-num">
                            <b>{s.berhasil}</b> ({persen(s.berhasil, s.total)})
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}
