import { useCallback, useEffect, useState } from 'react';
import { rupiah, tampilHp, tgl, waktu, waktuRelatif } from '../lib/format.js';
import { Gagal, Kosong, Memuat, Modal, Tabs, useData } from '../komponen/Ui.jsx';

// Rekrutmen Sales Partner (PRD v0.2 §7-10). Tahap nggak boleh dilompati; tahap bertes majunya lewat hasil tes.
export const TAHAP = [
  { id: 'new', nama: 'New', ket: 'Baru masuk' },
  { id: 'screening', nama: 'Screening', ket: 'Lagi dicek' },
  { id: 'screening_passed', nama: 'Lolos screening', ket: 'Siap product test' },
  { id: 'product_test', nama: 'Product test', ket: '5 soal, benar semua' },
  { id: 'interview', nama: 'Interview', ket: 'Keputusan pewawancara' },
  { id: 'field_test_24h', nama: '24H field test', ket: '3 warung + laporan' },
  { id: 'closing_test', nama: 'Closing test', ket: '3 customer, maks 6 hari' },
  { id: 'hired', nama: 'Hired', ket: 'Jadi Sales Partner' },
];
const KELUAR = {
  rejected: { nama: 'Ditolak', warna: 'merah' },
  withdrawn: { nama: 'Mundur', warna: 'oranye' },
  no_response: { nama: 'No response', warna: '' },
  on_hold: { nama: 'On hold', warna: 'kuning' },
  talent_pool: { nama: 'Talent pool', warna: 'ungu' },
};
const namaStatus = (s) => TAHAP.find((t) => t.id === s)?.nama || KELUAR[s]?.nama || s;
const KEYAKINAN = { tinggi: { nama: 'Keyakinan tinggi', warna: 'hijau' }, rendah: { nama: 'Keyakinan rendah', warna: 'kuning' }, unknown: { nama: 'Sumber nggak diketahui', warna: '' } };
const hariSejak = (t) => Math.max(0, Math.floor((Date.now() - new Date(t).getTime()) / 86400000));
const TABS = [
  { id: 'papan', nama: 'Papan kandidat' },
  { id: 'sumber', nama: 'Sumber & kampanye' },
  { id: 'jadwal', nama: 'Jadwal interview' },
  { id: 'arsip', nama: 'Arsip' },
];

export default function Rekrutmen({ api, tab }) {
  const aktif = TABS.some((t) => t.id === tab) ? tab : 'papan';
  const { data: r, muat: muatRingkasan } = useData(api, '/rekrutmen/ringkasan');
  const [tambah, setTambah] = useState(false);
  const [dipilih, setDipilih] = useState(null);
  const [versi, setVersi] = useState(0);
  const [pesan, setPesan] = useState('');
  const segarkan = useCallback(() => {
    setVersi((v) => v + 1);
    muatRingkasan();
  }, [muatRingkasan]);
  const linkDaftar = `${window.location.origin}/daftar`;

  return (
    <>
      <header className="adm-kepala">
        <div>
          <h1>Rekrutmen</h1>
          <p className="adm-sub">Calon Sales Partner dari lamaran masuk sampai diangkat. Tahap nggak bisa dilompati, dan tiap percobaan tercatat.</p>
        </div>
        <div className="adm-tombol" style={{ marginTop: 0 }}>
          <button
            className="btn"
            onClick={() => navigator.clipboard?.writeText(linkDaftar).then(() => setPesan(`Link daftar disalin: ${linkDaftar}`), () => window.prompt('Salin link ini:', linkDaftar))}
          >
            Salin link daftar
          </button>
          <button className="btn utama" onClick={() => setTambah(true)}>
            + Tambah kandidat
          </button>
        </div>
      </header>

      <section className="adm-dashboard-atas" aria-label="Ringkasan rekrutmen">
        <div className="adm-kartu adm-stat fokus">
          <span className="adm-label">Kandidat dalam proses</span>
          <span className="nilai p-num">{r ? r.aktif : '…'}</span>
          <span className="adm-redup">{r ? `${r.mingguIni} lamaran masuk 7 hari terakhir` : ''}</span>
        </div>
        <div className="adm-kartu adm-stat" style={r?.perluFollowup ? { background: 'var(--kuning)' } : undefined}>
          <span className="adm-label">Perlu di-follow-up</span>
          <span className="nilai p-num">{r ? r.perluFollowup : '…'}</span>
          <span className="adm-redup" style={r?.perluFollowup ? { color: 'var(--tinta)' } : undefined}>
            Nggak disentuh lebih dari 2 hari
          </span>
        </div>
        <div className="adm-kartu adm-stat">
          <span className="adm-label">Interview terdekat</span>
          <span className="nilai" style={{ fontSize: 22 }}>
            {r?.jadwalTerdekat ? waktu(r.jadwalTerdekat.jadwal) : r ? 'Belum ada' : '…'}
          </span>
          <span className="adm-redup">{r?.jadwalTerdekat ? `${r.jadwalTerdekat.nama} · ${r.jadwalTerdekat.pewawancara}` : 'Jadwalkan dari panel kandidat'}</span>
        </div>
        <div className="adm-kartu adm-stat">
          <span className="adm-label">Sales Partner diangkat</span>
          <span className="nilai p-num">{r ? r.jumlahHired : '…'}</span>
          <span className="adm-redup">{r?.rataHariHired != null ? `Rata-rata ${r.rataHariHired} hari dari lamaran` : 'Belum ada yang diangkat'}</span>
        </div>
      </section>

      <Tabs daftar={TABS} aktif={aktif} href={(id) => `#/rekrutmen/${id}`} />
      {pesan && (
        <p className="adm-ok" role="status">
          {pesan}
        </p>
      )}

      {aktif === 'papan' && <Papan api={api} versi={versi} onBuka={setDipilih} onTambah={() => setTambah(true)} />}
      {aktif === 'sumber' && <Sumber api={api} />}
      {aktif === 'jadwal' && <Jadwal api={api} versi={versi} onBuka={setDipilih} />}
      {aktif === 'arsip' && <Arsip api={api} versi={versi} onBuka={setDipilih} />}

      {tambah && (
        <FormKandidat
          api={api}
          pilihanSumber={r?.pilihanSumber || []}
          onTutup={() => setTambah(false)}
          onSelesai={(nama) => {
            setTambah(false);
            setPesan(`${nama} masuk sebagai kandidat baru.`);
            segarkan();
          }}
        />
      )}
      {dipilih && <Detail key={dipilih} api={api} id={dipilih} onTutup={() => setDipilih(null)} onBerubah={segarkan} onBuka={setDipilih} />}
    </>
  );
}

// ---------------- Papan ----------------
function Papan({ api, versi, onBuka, onTambah }) {
  const [q, setQ] = useState('');
  const [cari, setCari] = useState('');
  const { data, error, muat } = useData(api, `/rekrutmen/lamaran?mode=aktif${cari ? `&q=${encodeURIComponent(cari)}` : ''}&v=${versi}`);
  if (error) return <Gagal apa="kandidat" pesan={error} onUlang={muat} />;
  return (
    <>
      <form
        className="adm-cari"
        style={{ marginTop: 0, marginBottom: 16 }}
        onSubmit={(e) => {
          e.preventDefault();
          setCari(q.trim());
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama, no. HP, kode sumber" aria-label="Cari kandidat" />
        <button className="btn" type="submit">
          Cari
        </button>
      </form>
      {!data ? (
        <Memuat apa="kandidat" />
      ) : data.length === 0 && !cari ? (
        <Kosong judul="Papan kosong" aksi={<button className="btn kecil utama" onClick={onTambah}>+ Tambah kandidat</button>}>
          Belum ada kandidat yang lagi diproses. Bagiin link daftar (tombol "Salin link daftar") atau tambah manual.
        </Kosong>
      ) : (
        <div className="adm-kanban" style={{ gridTemplateColumns: 'repeat(7, minmax(210px, 1fr))' }}>
          {TAHAP.filter((t) => t.id !== 'hired').map((t) => {
            const isi = data.filter((l) => l.status === t.id);
            return (
              <section key={t.id} className="adm-kanban-kolom" aria-label={`Tahap ${t.nama}`}>
                <header className="adm-kanban-kepala" style={t.id === 'closing_test' ? { background: 'var(--biru)', color: '#fff' } : t.id === 'interview' ? { background: 'var(--kuning)' } : undefined}>
                  <span>{t.nama}</span>
                  <span className="adm-chip" style={{ background: '#000', color: '#fff' }}>
                    {isi.length}
                  </span>
                </header>
                <div className="adm-kanban-daftar">
                  {isi.length === 0 && (
                    <p className="adm-redup" style={{ margin: 0, textAlign: 'center' }}>
                      {t.ket}
                    </p>
                  )}
                  {isi.map((l) => (
                    <KartuKandidat key={l.id} l={l} onBuka={onBuka} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function KartuKandidat({ l, onBuka }) {
  const perluFu = hariSejak(l.terakhir_followup || l.created_at) >= 2;
  const sisaClosing = l.status === 'closing_test' ? 6 - hariSejak(l.closing_mulai || l.status_sejak) : null;
  const jadwal = l.attempt_terakhir?.hasil === 'dijadwalkan' ? l.attempt_terakhir.jadwal : null;
  return (
    <article
      className="adm-kanban-kartu"
      style={{ cursor: 'pointer' }}
      onClick={() => onBuka(l.id)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onBuka(l.id))}
      tabIndex={0}
      aria-label={`Buka ${l.nama}`}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
        <b>{l.nama}</b>
        <span className="adm-chip" title="Hari di tahap ini">
          {hariSejak(l.status_sejak)} hr
        </span>
      </div>
      <div className="adm-redup adm-mono">{l.kode}</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
        {l.sumber_kode ? <span className="adm-chip">{l.sumber_kode}</span> : l.referrer_nama ? <span className="adm-chip ungu">Referral</span> : <span className="adm-chip">{l.sumber_dropdown || 'Sumber ?'}</span>}
        {l.jumlah_lamaran > 1 && <span className="adm-chip">Lamaran ke-{l.jumlah_lamaran}</span>}
        {perluFu && <span className="adm-chip kuning">Perlu FU</span>}
        {jadwal && <span className="adm-chip biru">{waktu(jadwal)}</span>}
        {sisaClosing !== null && <span className={`adm-chip ${sisaClosing <= 1 ? 'merah' : ''}`}>{sisaClosing > 0 ? `Sisa ${sisaClosing} hari` : 'Tenggat lewat'}</span>}
      </div>
    </article>
  );
}

// ---------------- Detail kandidat ----------------
function Detail({ api, id, onTutup, onBerubah, onBuka }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [pesan, setPesan] = useState('');
  const [versi, setVersi] = useState(0);

  useEffect(() => {
    let batal = false;
    api('GET', `/rekrutmen/lamaran/${id}`)
      .then((x) => !batal && (setD(x), setError('')))
      .catch((e) => !batal && setError(e.message));
    return () => {
      batal = true;
    };
  }, [api, id, versi]);
  useEffect(() => {
    const tekan = (e) => e.key === 'Escape' && !document.querySelector('.adm-modal') && onTutup();
    document.addEventListener('keydown', tekan);
    return () => document.removeEventListener('keydown', tekan);
  }, [onTutup]);

  const kirim = async (path, body, ok) => {
    setError('');
    setPesan('');
    try {
      const hasil = await api('POST', `/rekrutmen/lamaran/${id}${path}`, body);
      setPesan(typeof ok === 'function' ? ok(hasil) : ok);
      setVersi((v) => v + 1);
      onBerubah();
      return hasil;
    } catch (e) {
      setError(e.message);
      return null;
    }
  };

  const l = d?.lamaran;
  const selesai = l && (KELUAR[l.status] || l.status === 'hired');
  const idx = l ? TAHAP.findIndex((t) => t.id === l.status) : -1;

  return (
    <>
      <div className="adm-latar" style={{ padding: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onTutup()} />
      <aside className="adm-laci" role="dialog" aria-modal="true" aria-label="Detail kandidat" style={{ width: 'min(540px, 100%)' }}>
        <div className="adm-modal-kepala">
          <h2 className="adm-mono">{l ? `Detail kandidat · ${l.kode}` : 'Detail kandidat'}</h2>
          <button className="adm-tutup" onClick={onTutup} aria-label="Tutup">
            ×
          </button>
        </div>
        {!d ? (
          error ? <p className="adm-error">{error}</p> : <Memuat apa="kandidat" />
        ) : (
          <>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span className="adm-inisial" style={{ width: 56, height: 56, fontSize: 24 }} aria-hidden="true">
                {l.nama?.[0]?.toUpperCase()}
              </span>
              <div>
                <h3 style={{ fontSize: 22, margin: 0 }}>{l.nama}</h3>
                <span className={`adm-chip ${KELUAR[l.status]?.warna || (l.status === 'hired' ? 'hijau' : 'biru')}`}>{namaStatus(l.status)}</span>{' '}
                <span className="adm-redup">sejak {tgl(l.status_sejak)}</span>
              </div>
            </div>
            <div className="adm-kartu" style={{ boxShadow: 'none', padding: 12, marginTop: 14 }}>
              <div className="adm-mono">{tampilHp(l.no_hp)}</div>
              {l.email && <div className="adm-mono">{l.email}</div>}
              {l.domisili && <div className="adm-redup">Domisili {l.domisili}</div>}
              <div className="adm-tombol">
                <a className="btn kecil" href={`https://wa.me/${l.no_hp}`} target="_blank" rel="noopener noreferrer">
                  WhatsApp
                </a>
                <a className="btn kecil" href={`tel:+${l.no_hp}`}>
                  Telepon
                </a>
              </div>
              <p className="adm-redup" style={{ margin: '10px 0 0' }}>
                Sumber:{' '}
                <b style={{ color: 'var(--tinta)' }}>
                  {l.sumber_kode ? `${l.sumber_kode}${l.kampanye_nama ? ` (${l.kampanye_nama})` : ''}` : l.referrer_nama ? `Referral dari ${l.referrer_nama}` : l.sumber_dropdown || 'nggak diketahui'}
                </b>{' '}
                <span className={`adm-chip ${KEYAKINAN[l.keyakinan].warna}`}>{KEYAKINAN[l.keyakinan].nama}</span>
              </p>
              <p className="adm-redup" style={{ margin: '4px 0 0' }}>
                Kode referral orang ini: <b className="adm-mono">{l.kode_ref}</b>
              </p>
            </div>

            <h4 className="adm-label" style={{ fontSize: 11, margin: '16px 0 6px' }}>
              Tahapan rekrutmen
            </h4>
            <ol className="adm-tahapan">
              {TAHAP.map((t, i) => {
                const lewat = l.status === 'hired' || (idx >= 0 && i < idx);
                const sekarang = t.id === l.status;
                return (
                  <li key={t.id} className={sekarang ? 'sekarang' : lewat ? 'lewat' : ''}>
                    <span>{lewat ? '✓' : i + 1}</span>
                    <b>{t.nama}</b>
                    <em>{sekarang ? 'Sedang berjalan' : lewat ? 'Selesai' : t.ket}</em>
                  </li>
                );
              })}
            </ol>

            {error && <p className="adm-error">{error}</p>}
            {pesan && <p className="adm-ok">{pesan}</p>}

            {!selesai && <AksiTahap l={l} attempt={d.attempt} hariClosing={d.hariClosing} kirim={kirim} />}
            {!selesai && <FollowUp l={l} hari={d.hariNoResponse} kirim={kirim} />}
            {!selesai && <Keluarkan kirim={kirim} />}
            {KELUAR[l.status] && (
              <div className="adm-kartu" style={{ boxShadow: 'none', padding: 12, marginTop: 14 }}>
                <b>Alasan: </b>
                {l.alasan_keluar || '-'}
                <p className="adm-redup" style={{ margin: '6px 0' }}>
                  Balik lagi = lamaran baru dari New. Hasil tahap lama nggak berlaku (D-31), dan retry nggak dibatasi (D-30).
                </p>
                <button
                  className="btn kecil utama"
                  onClick={async () => {
                    const baru = await kirim('/lamar-ulang', {}, 'Lamaran baru dibuat dari tahap New.');
                    if (baru?.id) onBuka(baru.id);
                  }}
                >
                  Lamar ulang (lamaran baru)
                </button>
              </div>
            )}

            <Catatan kirim={kirim} />

            {d.attempt.length > 0 && (
              <>
                <h4 className="adm-label" style={{ fontSize: 11, margin: '16px 0 6px' }}>
                  Riwayat percobaan ({d.attempt.length})
                </h4>
                <div className="adm-riwayat">
                  {d.attempt.map((a) => (
                    <div key={a.id} className="adm-riwayat-item">
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span>
                          <b>{namaStatus(a.tahap)}</b> <span className={`adm-chip ${a.hasil === 'lulus' ? 'hijau' : a.hasil === 'gagal' ? 'merah' : 'kuning'}`}>{a.hasil}</span>
                        </span>
                        <span className="adm-redup">{waktu(a.created_at)}</span>
                      </div>
                      <div className="adm-redup">{ringkasAttempt(a)}</div>
                      {a.catatan && <div style={{ marginTop: 4 }}>{a.catatan}</div>}
                      <div className="adm-redup">oleh {a.aktor}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <h4 className="adm-label" style={{ fontSize: 11, margin: '16px 0 6px' }}>
              Riwayat kejadian
            </h4>
            <div className="adm-riwayat">
              {d.event.map((e) => (
                <div key={e.id} className="adm-riwayat-item">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span className="adm-chip">{e.jenis}</span>
                    <span className="adm-redup">{waktu(e.created_at)}</span>
                  </div>
                  <div style={{ marginTop: 4 }}>
                    {e.dari && e.ke && e.jenis === 'status' ? `${namaStatus(e.dari)} → ${namaStatus(e.ke)}` : ''} {e.jenis !== 'attempt' ? e.isi : `Hasil: ${e.ke}`}
                  </div>
                  <div className="adm-redup">oleh {e.aktor}</div>
                </div>
              ))}
            </div>

            {d.riwayat.length > 0 && (
              <>
                <h4 className="adm-label" style={{ fontSize: 11, margin: '16px 0 6px' }}>
                  Lamaran sebelumnya
                </h4>
                <ul className="adm-daftar">
                  {d.riwayat.map((x) => (
                    <li key={x.id}>
                      <div>
                        <button className="adm-link" onClick={() => onBuka(x.id)}>
                          {x.kode}
                        </button>{' '}
                        <span className={`adm-chip ${KELUAR[x.status]?.warna || ''}`}>{namaStatus(x.status)}</span>
                        <div className="adm-redup">
                          {tgl(x.created_at)} · sumber {x.sumber_kode || '-'} {x.alasan_keluar ? `· ${x.alasan_keluar}` : ''}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </aside>
    </>
  );
}

function ringkasAttempt(a) {
  const d = a.data || {};
  if (a.tahap === 'product_test') return `${d.benar}/${d.dari} benar · ${d.setujuBagiHasil ? 'setuju' : 'belum setuju'} bagi hasil`;
  if (a.tahap === 'interview') return a.hasil === 'dijadwalkan' ? `Dijadwalkan ${waktu(a.jadwal)} · ${a.pewawancara}` : `Pewawancara ${a.pewawancara || '-'} · ${d.alasan || ''}`;
  if (a.tahap === 'field_test_24h') return `${d.warung} warung dikunjungi · laporan ${d.laporan ? 'terkirim' : 'belum'}`;
  if (a.tahap === 'closing_test') return `${d.customer} customer · hari ke-${d.hariBerjalan}`;
  return '';
}

// Form sesuai tahap. Aturan lulusnya dicek server (D-33); di sini cuma input.
function AksiTahap({ l, attempt, hariClosing, kirim }) {
  const [f, setF] = useState({ benar: '', setuju: false, pewawancara: '', jadwal: '', hasil: '', alasan: '', warung: '', laporan: false, customer: '', keputusan: '', catatan: '' });
  const ubah = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const kotak = { boxShadow: 'none', padding: 12, marginTop: 14, background: '#FEF9C3' };
  const judul = (t) => (
    <h4 className="adm-label" style={{ fontSize: 11, margin: '0 0 8px' }}>
      {t}
    </h4>
  );
  const berikut = TAHAP[TAHAP.findIndex((t) => t.id === l.status) + 1];

  if (['new', 'screening', 'screening_passed'].includes(l.status)) {
    return (
      <div className="adm-kartu" style={kotak}>
        {judul(`Langkah berikutnya: ${berikut.nama}`)}
        <input className="adm-input" value={f.catatan} onChange={ubah('catatan')} placeholder="Catatan (opsional)" aria-label="Catatan" />
        <button className="btn utama" style={{ marginTop: 10 }} onClick={() => kirim('/maju', { catatan: f.catatan }, `Maju ke ${berikut.nama}.`)}>
          Maju ke {berikut.nama}
        </button>
      </div>
    );
  }
  if (l.status === 'product_test') {
    return (
      <div className="adm-kartu" style={kotak}>
        {judul('Hasil product test (lulus = 5/5 benar + setuju bagi hasil)')}
        <div className="field" style={{ marginTop: 0 }}>
          <label htmlFor="pt-benar">Jawaban benar (dari 5)</label>
          <input id="pt-benar" type="number" min="0" max="5" value={f.benar} onChange={ubah('benar')} />
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, fontWeight: 700 }}>
          <input type="checkbox" className="adm-centang" checked={f.setuju} onChange={ubah('setuju')} /> Setuju model bagi hasil
        </label>
        <button className="btn utama" style={{ marginTop: 10 }} disabled={f.benar === ''} onClick={() => kirim('/attempt', { benar: Number(f.benar), setujuBagiHasil: f.setuju }, (r) => (r.hasil === 'lulus' ? 'Lulus product test, maju ke Interview.' : 'Belum lulus. Percobaan dicatat, bisa dicoba lagi.'))}>
          Simpan hasil
        </button>
      </div>
    );
  }
  if (l.status === 'interview') {
    return (
      <div className="adm-kartu" style={kotak}>
        {judul('Interview')}
        <div className="field" style={{ marginTop: 0 }}>
          <label htmlFor="iv-pw">Pewawancara</label>
          <input id="iv-pw" value={f.pewawancara} onChange={ubah('pewawancara')} placeholder="Nama pewawancara" />
        </div>
        <div className="adm-baris" style={{ gridTemplateColumns: '1fr auto', alignItems: 'end' }}>
          <div className="field">
            <label htmlFor="iv-jadwal">Jadwal</label>
            <input id="iv-jadwal" type="datetime-local" value={f.jadwal} onChange={ubah('jadwal')} />
          </div>
          <button className="btn" disabled={!f.pewawancara.trim() || !f.jadwal} onClick={() => kirim('/attempt', { jadwalkan: true, jadwal: new Date(f.jadwal).toISOString(), pewawancara: f.pewawancara }, 'Interview dijadwalkan.')}>
            Jadwalkan
          </button>
        </div>
        <div className="field">
          <label htmlFor="iv-hasil">Hasil interview</label>
          <select id="iv-hasil" value={f.hasil} onChange={ubah('hasil')} style={{ maxWidth: 'none', width: '100%', minHeight: 44 }}>
            <option value="">Belum ada hasil</option>
            <option value="lulus">Lulus</option>
            <option value="gagal">Gagal</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="iv-alasan">Alasan keputusan (wajib)</label>
          <input id="iv-alasan" value={f.alasan} onChange={ubah('alasan')} />
        </div>
        <button className="btn utama" style={{ marginTop: 10 }} disabled={!f.pewawancara.trim() || !f.hasil || !f.alasan.trim()} onClick={() => kirim('/attempt', { hasil: f.hasil, pewawancara: f.pewawancara, alasan: f.alasan }, (r) => (r.hasil === 'lulus' ? 'Lulus interview, lanjut 24H field test.' : 'Hasil interview dicatat: gagal.'))}>
          Simpan hasil interview
        </button>
      </div>
    );
  }
  if (l.status === 'field_test_24h') {
    return (
      <div className="adm-kartu" style={kotak}>
        {judul('24H field test (lulus = 3 warung + laporan)')}
        <div className="field" style={{ marginTop: 0 }}>
          <label htmlFor="ft-w">Warung yang dikunjungi</label>
          <input id="ft-w" type="number" min="0" value={f.warung} onChange={ubah('warung')} />
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, fontWeight: 700 }}>
          <input type="checkbox" className="adm-centang" checked={f.laporan} onChange={ubah('laporan')} /> Laporan & objection udah dikirim
        </label>
        <button className="btn utama" style={{ marginTop: 10 }} disabled={f.warung === ''} onClick={() => kirim('/attempt', { warung: Number(f.warung), laporan: f.laporan }, (r) => (r.hasil === 'lulus' ? 'Lulus field test, closing test dimulai (6 hari).' : 'Belum lulus. Percobaan dicatat.'))}>
          Simpan hasil
        </button>
      </div>
    );
  }
  if (l.status === 'closing_test') {
    const lulus = attempt.some((a) => a.tahap === 'closing_test' && a.hasil === 'lulus');
    const sisa = hariClosing - hariSejak(l.closing_mulai || l.status_sejak);
    if (lulus) {
      return (
        <div className="adm-kartu" style={{ ...kotak, background: '#DCFCE7' }}>
          {judul('Closing test lulus. Butuh keputusan hiring')}
          <select value={f.keputusan} onChange={ubah('keputusan')} aria-label="Keputusan" style={{ maxWidth: 'none', width: '100%', minHeight: 44 }}>
            <option value="">Pilih keputusan</option>
            <option value="terima">Terima jadi Sales Partner</option>
            <option value="tolak">Tolak</option>
          </select>
          <div className="field">
            <label htmlFor="hd-alasan">Alasan (wajib)</label>
            <input id="hd-alasan" value={f.alasan} onChange={ubah('alasan')} />
          </div>
          <button className="btn utama" style={{ marginTop: 10 }} disabled={!f.keputusan || !f.alasan.trim()} onClick={() => kirim('/keputusan', { keputusan: f.keputusan, alasan: f.alasan }, f.keputusan === 'terima' ? 'Diangkat jadi Sales Partner.' : 'Ditolak, keputusan dicatat.')}>
            Simpan keputusan
          </button>
        </div>
      );
    }
    return (
      <div className="adm-kartu" style={kotak}>
        {judul(`Closing test: 3 customer dalam ${hariClosing} hari · ${sisa > 0 ? `sisa ${sisa} hari` : 'tenggat lewat'}`)}
        <div className="field" style={{ marginTop: 0 }}>
          <label htmlFor="ct-c">Warung yang udah jadi customer</label>
          <input id="ct-c" type="number" min="0" value={f.customer} onChange={ubah('customer')} />
        </div>
        <button className="btn utama" style={{ marginTop: 10 }} disabled={f.customer === ''} onClick={() => kirim('/attempt', { customer: Number(f.customer) }, (r) => (r.hasil === 'lulus' ? 'Lulus closing test. Tinggal keputusan hiring.' : 'Closing test gagal (tenggat lewat).'))}>
          Catat hasil
        </button>
      </div>
    );
  }
  return null;
}

function FollowUp({ l, hari, kirim }) {
  return (
    <div className="adm-kartu" style={{ boxShadow: 'none', padding: 12, marginTop: 14 }}>
      <h4 className="adm-label" style={{ fontSize: 11, margin: '0 0 6px' }}>
        Follow-up (dilakukan di luar sistem)
      </h4>
      <p className="adm-redup" style={{ margin: 0 }}>
        Terakhir di-follow-up: {l.terakhir_followup ? waktuRelatif(l.terakhir_followup) : 'belum pernah'} · terakhir membalas: {l.terakhir_respon ? waktuRelatif(l.terakhir_respon) : 'belum pernah'}.
        Nggak membalas {hari} hari setelah di-follow-up = otomatis No response (D-32).
      </p>
      <div className="adm-tombol">
        <button className="btn kecil" onClick={() => kirim('/followup', { jenis: 'followup' }, 'Follow-up dicatat.')}>
          Sudah di-follow-up
        </button>
        <button className="btn kecil" onClick={() => kirim('/followup', { jenis: 'respon' }, 'Balasan kandidat dicatat.')}>
          Kandidat membalas
        </button>
      </div>
    </div>
  );
}

function Keluarkan({ kirim }) {
  const [status, setStatus] = useState('');
  const [alasan, setAlasan] = useState('');
  return (
    <div className="adm-kartu" style={{ boxShadow: 'none', padding: 12, marginTop: 14 }}>
      <h4 className="adm-label" style={{ fontSize: 11, margin: '0 0 6px' }}>
        Keluarkan dari proses
      </h4>
      <div className="adm-baris" style={{ gridTemplateColumns: 'auto 1fr' }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status keluar" style={{ minHeight: 44 }}>
          <option value="">Pilih</option>
          {Object.entries(KELUAR).map(([k, v]) => (
            <option key={k} value={k}>
              {v.nama}
            </option>
          ))}
        </select>
        <input className="adm-input" value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="Alasan (wajib)" aria-label="Alasan keluar" />
      </div>
      <button className="btn kecil bahaya" style={{ marginTop: 10 }} disabled={!status || !alasan.trim()} onClick={() => kirim('/keluar', { status, alasan }, `Kandidat dipindah ke ${KELUAR[status].nama}.`)}>
        Simpan
      </button>
    </div>
  );
}

function Catatan({ kirim }) {
  const [isi, setIsi] = useState('');
  return (
    <form
      className="adm-cari"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await kirim('/catatan', { isi }, 'Catatan disimpan.')) setIsi('');
      }}
    >
      <input value={isi} onChange={(e) => setIsi(e.target.value)} placeholder="Tambah catatan" aria-label="Catatan kandidat" />
      <button className="btn kecil" type="submit" disabled={!isi.trim()}>
        Simpan catatan
      </button>
    </form>
  );
}

// ---------------- Tambah kandidat ----------------
function FormKandidat({ api, pilihanSumber, onTutup, onSelesai }) {
  const [isi, setIsi] = useState({ nama: '', noHp: '', email: '', domisili: '', s: '', dropdown: '', referral: '' });
  const [error, setError] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const ubah = (k) => (e) => setIsi((x) => ({ ...x, [k]: e.target.value }));
  const field = (k, label, props = {}) => (
    <div className="field">
      <label htmlFor={`k-${k}`}>{label}</label>
      <input id={`k-${k}`} value={isi[k]} onChange={ubah(k)} {...props} />
    </div>
  );
  return (
    <Modal judul="Tambah kandidat" onTutup={onTutup}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          setSibuk(true);
          try {
            await api('POST', '/rekrutmen/lamaran', isi);
            onSelesai(isi.nama);
          } catch (err) {
            setError(err.message);
            setSibuk(false);
          }
        }}
      >
        {field('nama', 'Nama', { required: true })}
        <div className="adm-baris" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          {field('noHp', 'Nomor HP / WA', { required: true, inputMode: 'tel', placeholder: '0812-3456-7890' })}
          {field('email', 'Email (opsional)', { type: 'email' })}
          {field('domisili', 'Domisili')}
          {field('s', 'Kode titik sebar (kalau ada)', { placeholder: 'FB-KRW-001' })}
          {field('referral', 'Kode referral (kalau ada)', { placeholder: 'REF-A1B2C3' })}
          <div className="field">
            <label htmlFor="k-dropdown">Tahu Konsulin dari mana?</label>
            <select id="k-dropdown" value={isi.dropdown} onChange={ubah('dropdown')} style={{ maxWidth: 'none', width: '100%', minHeight: 44 }}>
              <option value="">Nggak tau / nggak jawab</option>
              {pilihanSumber.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="adm-redup">Kode titik sebar atau referral = sumber keyakinan tinggi. Pilihan "tahu dari mana" = keyakinan rendah, dilaporkan terpisah (D-72).</p>
        {error && <p className="adm-error">{error}</p>}
        <div className="adm-tombol" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="btn" onClick={onTutup}>
            Batal
          </button>
          <button type="submit" className="btn utama" disabled={sibuk || !isi.nama.trim() || !isi.noHp.trim()}>
            {sibuk ? 'Menyimpan…' : 'Simpan kandidat'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------- Sumber & kampanye ----------------
const STATUS_TITIK = { queued: 'Antri', ready: 'Siap posting', posted: 'Terposting', failed: 'Gagal', skipped: 'Dilewati', expired: 'Kedaluwarsa' };

function Sumber({ api }) {
  const { data, error, muat } = useData(api, '/rekrutmen/kampanye');
  const [baru, setBaru] = useState(false);
  const [pesan, setPesan] = useState('');
  if (error) return <Gagal apa="sumber" pesan={error} onUlang={muat} />;
  if (!data) return <Memuat apa="sumber" />;
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <p className="adm-redup" style={{ margin: 0, maxWidth: 640 }}>
          Satu kode per titik sebar (satu grup, satu poster), bukan per kanal. "Menemukan" = sumber lamaran pertama orang itu, "Mengonversi" = sumber lamaran yang diterima. Dua angka ini nggak dijumlah (D-71).
        </p>
        <button className="btn utama" onClick={() => setBaru(true)}>
          + Kampanye baru
        </button>
      </div>
      {pesan && <p className="adm-ok">{pesan}</p>}
      {data.kampanye.length === 0 ? (
        <Kosong judul="Belum ada kampanye" aksi={<button className="btn kecil utama" onClick={() => setBaru(true)}>+ Kampanye baru</button>}>
          Bikin kampanye (misal "Karawang September"), terus tambah titik sebarnya. Tiap titik dapet link daftar sendiri.
        </Kosong>
      ) : (
        data.kampanye.map((k) => (
          <KartuKampanye key={k.id} api={api} k={k} titik={data.titik.filter((t) => t.kampanye_id === k.id)} kanal={data.kanal} onBerubah={muat} setPesan={setPesan} />
        ))
      )}
      <section className="adm-kolom" style={{ marginTop: 22 }}>
        <div className="adm-kartu">
          <div className="adm-kartu-kepala kuning">
            <h2>Sumber keyakinan rendah</h2>
          </div>
          <p className="adm-redup" style={{ marginTop: 0 }}>
            Dari pilihan "Tahu Konsulin dari mana?" atau nggak dijawab. Nggak dicampur ke laporan titik sebar (D-72).
          </p>
          {data.rendah.length === 0 ? (
            <p className="adm-redup">Belum ada.</p>
          ) : (
            <ul className="adm-daftar">
              {data.rendah.map((x) => (
                <li key={x.sumber + x.keyakinan}>
                  <span>
                    {x.sumber} <span className={`adm-chip ${KEYAKINAN[x.keyakinan].warna}`}>{x.keyakinan}</span>
                  </span>
                  <span className="p-num">
                    {x.pelamar} pelamar · {x.diterima} diterima
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="adm-kartu">
          <div className="adm-kartu-kepala">
            <h2>Referral</h2>
          </div>
          <p className="p-num" style={{ margin: 0 }}>
            {data.referral.pelamar} pelamar lewat kode referral · {data.referral.diterima} diterima
          </p>
          <p className="adm-redup">Pembayaran bonus referral (Rp50.000 + Rp100.000, D-69) belum dibangun.</p>
        </div>
      </section>
      {baru && (
        <FormKampanye
          onTutup={() => setBaru(false)}
          onSimpan={async (isi) => {
            await api('POST', '/rekrutmen/kampanye', isi);
            setBaru(false);
            muat();
          }}
        />
      )}
    </>
  );
}

function KartuKampanye({ api, k, titik, kanal, onBerubah, setPesan }) {
  const [f, setF] = useState({ kanal: 'FB', area: k.area ? k.area.slice(0, 3).toUpperCase() : '', deskripsi: '', biaya: '' });
  const [error, setError] = useState('');
  const totalBiaya = k.biaya + titik.reduce((a, t) => a + t.biaya, 0);
  const diterima = titik.reduce((a, t) => a + t.diterima, 0);
  const salin = (kode) => {
    const link = `${window.location.origin}/daftar?s=${kode}`;
    navigator.clipboard?.writeText(link).then(() => setPesan(`Link ${kode} disalin: ${link}`), () => window.prompt('Salin link ini:', link));
  };
  const ubahStatus = async (t, status) => {
    setError('');
    let bukti;
    if (status === 'posted') {
      bukti = window.prompt('Tempel URL bukti postingan (wajib buat status Terposting):', t.bukti_url || 'https://');
      if (!bukti) return;
    }
    try {
      await api('PATCH', `/rekrutmen/titik/${t.id}`, { status, bukti_url: bukti });
      onBerubah();
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <section className="adm-kartu" style={{ marginBottom: 18 }}>
      <div className="adm-kartu-kepala hitam">
        <h2>
          {k.nama} {k.area ? `· ${k.area}` : ''}
        </h2>
        <span className="adm-redup">
          {[k.mulai && `${tgl(k.mulai)}${k.selesai ? ` s/d ${tgl(k.selesai)}` : ''}`, `biaya ${rupiah(totalBiaya)}`, diterima && `${rupiah(totalBiaya / diterima)} per orang diterima`].filter(Boolean).join(' · ')}
        </span>
      </div>
      {error && <p className="adm-error">{error}</p>}
      {titik.length === 0 ? (
        <p className="adm-redup">Belum ada titik sebar. Tambah di bawah.</p>
      ) : (
        <div className="adm-gulir" style={{ boxShadow: 'none', margin: '0 -18px', borderWidth: '3px 0' }}>
          <table className="adm-tabel">
            <thead>
              <tr>
                <th>Kode</th>
                <th>Tempat</th>
                <th>Status posting</th>
                <th className="kanan">Biaya</th>
                <th className="kanan">Pelamar</th>
                <th className="kanan">Menemukan</th>
                <th className="kanan">Interview</th>
                <th className="kanan">Closing</th>
                <th className="kanan">Mengonversi</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {titik.map((t) => (
                <tr key={t.id}>
                  <td className="adm-mono">{t.kode}</td>
                  <td>
                    {kanal[t.kanal]}
                    <div className="adm-redup">{t.deskripsi || ''}</div>
                  </td>
                  <td>
                    <select value={t.status} onChange={(e) => ubahStatus(t, e.target.value)} aria-label={`Status ${t.kode}`}>
                      {Object.entries(STATUS_TITIK).map(([v, n]) => (
                        <option key={v} value={v}>
                          {n}
                        </option>
                      ))}
                    </select>
                    {t.bukti_url && (
                      <div>
                        <a href={t.bukti_url} target="_blank" rel="noopener noreferrer" className="adm-redup">
                          bukti
                        </a>
                      </div>
                    )}
                  </td>
                  <td className="kanan">{rupiah(t.biaya)}</td>
                  <td className="kanan">{t.pelamar}</td>
                  <td className="kanan">{t.menemukan}</td>
                  <td className="kanan">{t.sampai_interview}</td>
                  <td className="kanan">{t.sampai_closing}</td>
                  <td className="kanan">
                    <b>{t.diterima}</b>
                  </td>
                  <td>
                    <button className="btn kecil" onClick={() => salin(t.kode)}>
                      Salin link
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form
        className="adm-cari"
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          try {
            const t = await api('POST', `/rekrutmen/kampanye/${k.id}/titik`, { ...f, biaya: Number(f.biaya) || 0 });
            setPesan(`Titik ${t.kode} ditambah.`);
            setF((x) => ({ ...x, deskripsi: '', biaya: '' }));
            onBerubah();
          } catch (err) {
            setError(err.message);
          }
        }}
      >
        <select value={f.kanal} onChange={(e) => setF((x) => ({ ...x, kanal: e.target.value }))} aria-label="Kanal">
          {Object.entries(kanal).map(([v, n]) => (
            <option key={v} value={v}>
              {n}
            </option>
          ))}
        </select>
        <input style={{ maxWidth: 90 }} value={f.area} onChange={(e) => setF((x) => ({ ...x, area: e.target.value }))} placeholder="Area (KRW)" aria-label="Kode area" />
        <input value={f.deskripsi} onChange={(e) => setF((x) => ({ ...x, deskripsi: e.target.value }))} placeholder="Nama grup / lokasi poster" aria-label="Deskripsi titik" />
        <input style={{ maxWidth: 140 }} value={f.biaya} onChange={(e) => setF((x) => ({ ...x, biaya: e.target.value.replace(/\D/g, '') }))} placeholder="Biaya (Rp)" inputMode="numeric" aria-label="Biaya titik" />
        <button className="btn kecil utama" type="submit">
          + Titik sebar
        </button>
      </form>
    </section>
  );
}

function FormKampanye({ onTutup, onSimpan }) {
  const [isi, setIsi] = useState({ nama: '', area: '', mulai: '', selesai: '', biaya: '' });
  const [error, setError] = useState('');
  const ubah = (k) => (e) => setIsi((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Modal judul="Kampanye baru" onTutup={onTutup}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await onSimpan({ ...isi, biaya: Number(isi.biaya.replace(/\D/g, '')) || 0 });
          } catch (err) {
            setError(err.message);
          }
        }}
      >
        <div className="field" style={{ marginTop: 0 }}>
          <label htmlFor="kp-nama">Nama kampanye</label>
          <input id="kp-nama" value={isi.nama} onChange={ubah('nama')} placeholder="Misal: Karawang September" required />
        </div>
        <div className="adm-baris" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <div className="field">
            <label htmlFor="kp-area">Area</label>
            <input id="kp-area" value={isi.area} onChange={ubah('area')} placeholder="Karawang" />
          </div>
          <div className="field">
            <label htmlFor="kp-mulai">Mulai</label>
            <input id="kp-mulai" type="date" value={isi.mulai} onChange={ubah('mulai')} />
          </div>
          <div className="field">
            <label htmlFor="kp-selesai">Selesai</label>
            <input id="kp-selesai" type="date" value={isi.selesai} onChange={ubah('selesai')} />
          </div>
          <div className="field">
            <label htmlFor="kp-biaya">Biaya umum (Rp)</label>
            <input id="kp-biaya" value={isi.biaya} onChange={ubah('biaya')} inputMode="numeric" placeholder="0" />
          </div>
        </div>
        {error && <p className="adm-error">{error}</p>}
        <div className="adm-tombol" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="btn" onClick={onTutup}>
            Batal
          </button>
          <button type="submit" className="btn utama" disabled={!isi.nama.trim()}>
            Simpan kampanye
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------- Jadwal & arsip ----------------
function Jadwal({ api, versi, onBuka }) {
  const { data, error, muat } = useData(api, `/rekrutmen/lamaran?mode=aktif&v=${versi}`);
  if (error) return <Gagal apa="jadwal" pesan={error} onUlang={muat} />;
  if (!data) return <Memuat apa="jadwal" />;
  const jadwal = data
    .filter((l) => l.status === 'interview' && l.attempt_terakhir?.hasil === 'dijadwalkan')
    .sort((a, b) => new Date(a.attempt_terakhir.jadwal) - new Date(b.attempt_terakhir.jadwal));
  const belum = data.filter((l) => l.status === 'interview' && l.attempt_terakhir?.hasil !== 'dijadwalkan');
  return (
    <>
      {jadwal.length === 0 ? (
        <Kosong judul="Belum ada interview terjadwal">Jadwalkan dari panel kandidat yang udah sampai tahap Interview.</Kosong>
      ) : (
        <div className="adm-angka" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
          {jadwal.map((l) => {
            const t = new Date(l.attempt_terakhir.jadwal);
            const lewat = t < new Date();
            return (
              <button key={l.id} className="adm-kartu adm-angka-item adm-saring" style={lewat ? { borderColor: 'var(--merah)' } : undefined} onClick={() => onBuka(l.id)}>
                <b className="p-num" style={{ fontSize: 22 }}>
                  {t.toLocaleString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </b>
                {lewat && <span className="adm-chip merah" style={{ alignSelf: 'flex-start' }}>Lewat, hasil belum dicatat</span>}
                <span style={{ fontWeight: 700 }}>{l.nama}</span>
                <span className="adm-redup">Pewawancara {l.attempt_terakhir.pewawancara}</span>
              </button>
            );
          })}
        </div>
      )}
      {belum.length > 0 && (
        <p className="adm-redup">
          {belum.length} kandidat di tahap Interview belum dijadwalkan: {belum.map((l) => l.nama).join(', ')}.
        </p>
      )}
    </>
  );
}

function Arsip({ api, versi, onBuka }) {
  const { data, error, muat } = useData(api, `/rekrutmen/lamaran?mode=arsip&v=${versi}`);
  if (error) return <Gagal apa="arsip" pesan={error} onUlang={muat} />;
  if (!data) return <Memuat apa="arsip" />;
  if (data.length === 0) return <Kosong judul="Arsip kosong">Kandidat yang diangkat, ditolak, mundur, atau no response muncul di sini.</Kosong>;
  return (
    <div className="adm-gulir">
      <table className="adm-tabel">
        <thead>
          <tr>
            <th>Kandidat</th>
            <th>Status</th>
            <th>Alasan</th>
            <th>Sumber</th>
            <th>Tanggal</th>
          </tr>
        </thead>
        <tbody>
          {data.map((l) => (
            <tr key={l.id} className="klik" onClick={() => onBuka(l.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onBuka(l.id)}>
              <td>
                <b>{l.nama}</b>
                <div className="adm-redup adm-mono">{l.kode}</div>
              </td>
              <td>
                <span className={`adm-chip ${KELUAR[l.status]?.warna || 'hijau'}`}>{namaStatus(l.status)}</span>
              </td>
              <td>{l.alasan_keluar || '-'}</td>
              <td>{l.sumber_kode || l.sumber_dropdown || (l.referrer_nama ? 'Referral' : '-')}</td>
              <td>{tgl(l.status_sejak)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
