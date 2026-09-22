import { useCallback, useEffect, useState } from 'react';
import { rupiah, tampilHp, tgl, waktu, waktuRelatif } from '../lib/format.js';
import { Gagal, Kosong, Memuat, Modal, Tabs, useData } from '../komponen/Ui.jsx';
import { bukaFile } from '../lib/api.js';
import Board, { DetailKandidat, Ketersediaan, KuisMateri } from './RekrutmenBoard.jsx';

// Rekrutmen Sales Partner (PRD v0.2 §7-10). Tahap nggak boleh dilompati; tahap bertes majunya lewat hasil tes.
export const TAHAP = [
  { id: 'new', nama: 'New', ket: 'Baru masuk' },
  { id: 'screening', nama: 'Screening', ket: 'Lagi dicek' },
  { id: 'screening_passed', nama: 'Lolos screening', ket: 'Siap kirim materi' },
  { id: 'pelajari_produk', nama: 'Pelajari produk', ket: 'Pakai APK + baca materi + kuis' },
  { id: 'product_test', nama: 'Product test', ket: 'Kuis 5 soal, benar semua' },
  { id: 'interview', nama: 'Interview', ket: 'Kandidat pilih slot, pewawancara mutusin' },
  { id: 'field_test_24h', nama: 'Trial H+1', ket: '3 warung daftar pakai kodenya dalam 24 jam' },
  { id: 'closing_test', nama: 'Trial H+6', ket: '3 warung bayar dalam 6 hari' },
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
  { id: 'papan', nama: 'Board kandidat' },
  { id: 'jadwal', nama: 'Ketersediaan interview' },
  { id: 'kuis', nama: 'Pengaturan' },
  { id: 'sumber', nama: 'Sumber & kampanye' },
  { id: 'arsip', nama: 'Arsip' },
];

export default function Rekrutmen({ api, tab }) {
  const aktif = TABS.some((t) => t.id === tab) ? tab : 'papan';
  const { data: r, muat: muatRingkasan } = useData(api, '/rekrutmen/ringkasan');
  const [tambah, setTambah] = useState(false);
  const [dipilih, setDipilih] = useState(null);
  const [versi, setVersi] = useState(0);
  const [pesan, setPesan] = useState('');
  const [urutan, setUrutan] = useState([]);
  const segarkan = useCallback(() => {
    setVersi((v) => v + 1);
    muatRingkasan();
  }, [muatRingkasan]);
  const linkDaftar = `${r?.linkDaftar || window.location.origin + '/daftar'}`;

  return (
    <>
      <header className="adm-kepala">
        <h1 className="sr-only">Rekrutmen</h1>
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

      {aktif === 'papan' && <Board api={api} versi={versi} onBuka={setDipilih} setPesan={setPesan} onUrutan={setUrutan} />}
      {aktif === 'jadwal' && <Ketersediaan api={api} versi={versi} onBuka={setDipilih} />}
      {aktif === 'kuis' && <KuisMateri api={api} />}
      {aktif === 'sumber' && <Sumber api={api} />}
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
      {dipilih && <DetailKandidat key={dipilih} api={api} id={dipilih} urutan={aktif === 'papan' ? urutan : []} onTutup={() => setDipilih(null)} onBerubah={segarkan} onBuka={setDipilih} />}
    </>
  );
}

const URUT_JAWABAN = ['tanggalLahir', 'jenisKelamin', 'kota', 'kecamatan', 'pendidikan', 'pekerjaan', 'pengalamanSales', 'bidangPengalaman', 'waktuKerja', 'ketersediaan', 'kendaraan', 'hpAndroid', 'area', 'kenalWarung', 'skemaKerja', 'tempatProspek', 'tempatProspekLain', 'waktuHubungi', 'sosmed'];
export function DataLamaran({ jawaban, label, dokumen, onError }) {
  if (!jawaban && !dokumen?.length) return null;
  const j = jawaban || {};
  const nilai = (k) => {
    if (k === 'tanggalLahir') return `${tgl(j[k])} (${Math.floor((Date.now() - new Date(j[k]).getTime()) / (365.25 * 86400000))} tahun)`;
    if (k === 'hpAndroid') return j[k] ? 'Punya HP Android + kuota' : 'Belum punya HP Android';
    if (Array.isArray(j[k])) return j[k].join('; ');
    if (k === 'sosmed' && /^https?:\/\//.test(j[k])) return <a href={j[k]} target="_blank" rel="noopener noreferrer">{j[k]}</a>;
    return j[k];
  };
  return (
    <>
      <h4 className="adm-label" style={{ fontSize: 11, margin: '16px 0 6px' }}>
        Data lamaran
      </h4>
      <div className="adm-kartu" style={{ boxShadow: 'none', padding: 12 }}>
        {dokumen?.length > 0 && (
          <div className="adm-tombol" style={{ marginTop: 0, marginBottom: 10 }}>
            {dokumen.map((x) => (
              <button key={x.id} className="btn kecil" onClick={() => bukaFile(`/rekrutmen/dokumen/${x.id}`).catch((e) => onError(e.message))}>
                Lihat {x.jenis === 'cv' ? 'CV' : 'foto'} ({x.ukuran < 1024 ? `${x.ukuran} B` : `${Math.round(x.ukuran / 1024)} KB`})
              </button>
            ))}
          </div>
        )}
        <dl className="adm-jawaban">
          {URUT_JAWABAN.filter((k) => j[k] !== undefined && j[k] !== '').map((k) => (
            <div key={k}>
              <dt>{k === 'tanggalLahir' ? 'Tanggal lahir' : k === 'hpAndroid' ? 'HP Android' : label?.[k] || k}</dt>
              <dd>{nilai(k)}</dd>
            </div>
          ))}
        </dl>
        {j.alasan && (
          <>
            <p className="adm-label" style={{ fontSize: 10, margin: '10px 0 4px' }}>
              Alasan tertarik
            </p>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{j.alasan}</p>
          </>
        )}
        {jawaban && (
          <p className="adm-redup" style={{ margin: '10px 0 0' }}>
            {j.setujuData ? 'Setuju data dipakai buat seleksi' : 'Belum setuju pemakaian data'} · {j.setujuWa ? 'boleh dihubungi WA' : 'nggak mau dihubungi WA'}
          </p>
        )}
      </div>
    </>
  );
}

export function FollowUp({ l, hari, kirim }) {
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

export function Catatan({ kirim }) {
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
          <KartuKampanye key={k.id} api={api} k={k} titik={data.titik.filter((t) => t.kampanye_id === k.id)} kanal={data.kanal} linkDaftar={data.linkDaftar} onBerubah={muat} setPesan={setPesan} />
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

function KartuKampanye({ api, k, titik, kanal, linkDaftar, onBerubah, setPesan }) {
  const [f, setF] = useState({ kanal: 'FB', area: k.area ? k.area.slice(0, 3).toUpperCase() : '', deskripsi: '', biaya: '' });
  const [error, setError] = useState('');
  const totalBiaya = k.biaya + titik.reduce((a, t) => a + t.biaya, 0);
  const diterima = titik.reduce((a, t) => a + t.diterima, 0);
  const salin = (kode) => {
    const link = `${linkDaftar || window.location.origin + '/daftar'}?s=${kode}`;
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
