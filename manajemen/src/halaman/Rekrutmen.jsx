import { useCallback, useEffect, useState } from 'react';
import { rupiah, tampilHp, tgl, waktu, waktuRelatif } from '../lib/format.js';
import { Gagal, Kosong, Memuat, Modal, Tabs, useData } from '../komponen/Ui.jsx';
import { bukaFile } from '../lib/api.js';
import { FotoKandidat } from '../komponen/FotoProfil.jsx';
import QRCode from 'qrcode';
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

// Jawaban form lamaran dikelompokin per topik biar gampang dibaca sekilas (dulu 1 grid panjang 20-an isian).
const GRUP_JAWABAN = [
  ['Data diri', ['tanggalLahir', 'jenisKelamin', 'kota', 'kecamatan', 'pendidikan', 'pekerjaan']],
  ['Pengalaman', ['pengalamanSales', 'bidangPengalaman', 'kenalWarung']],
  ['Ketersediaan & alat kerja', ['waktuKerja', 'ketersediaan', 'kendaraan', 'hpAndroid']],
  ['Rencana kerja', ['area', 'skemaKerja', 'tempatProspek', 'tempatProspekLain']],
  ['Kontak', ['waktuHubungi', 'sosmed']],
];
const DIKELOMPOKKAN = new Set([...GRUP_JAWABAN.flatMap(([, k]) => k), 'alasan', 'setujuData', 'setujuWa']);
const ukuranFile = (n) => (n < 1024 ? `${n} B` : `${Math.round(n / 1024)} KB`);
export function DataLamaran({ jawaban, label, dokumen, onError }) {
  if (!jawaban && !dokumen?.length) return null;
  const j = jawaban || {};
  const ada = (k) => j[k] !== undefined && j[k] !== '' && j[k] !== null && !(Array.isArray(j[k]) && !j[k].length);
  const nilai = (k) => {
    if (k === 'tanggalLahir') return `${tgl(j[k])} (${Math.floor((Date.now() - new Date(j[k]).getTime()) / (365.25 * 86400000))} tahun)`;
    if (k === 'hpAndroid') return j[k] ? 'Punya HP Android + kuota' : 'Belum punya HP Android';
    if (Array.isArray(j[k])) return j[k].join('; ');
    if (k === 'sosmed' && /^https?:\/\//.test(j[k])) return <a href={j[k]} target="_blank" rel="noopener noreferrer">{j[k]}</a>;
    if (typeof j[k] === 'boolean') return j[k] ? 'Ya' : 'Tidak';
    return String(j[k]);
  };
  const namaIsian = (k) => (k === 'tanggalLahir' ? 'Tanggal lahir' : k === 'hpAndroid' ? 'HP Android' : label?.[k] || k);
  const grup = [...GRUP_JAWABAN, ['Lainnya', Object.keys(j).filter((k) => !DIKELOMPOKKAN.has(k))]].map(([judul, k]) => [judul, k.filter(ada)]).filter(([, k]) => k.length);
  const buka = (x) => bukaFile(`/rekrutmen/dokumen/${x.id}`).catch((e) => onError(e.message));
  const foto = dokumen?.filter((x) => x.jenis === 'foto').at(-1);
  const lain = dokumen?.filter((x) => x !== foto) || [];
  return (
    <div className="rk-lamaran">
      {dokumen?.length > 0 && (
        <div className="rk-lamaran-dok">
          {foto && (
            <button className="rk-lamaran-foto" onClick={() => buka(foto)} title="Buka foto ukuran penuh">
              <FotoKandidat fotoId={foto.id} nama="?" ukuran={72} />
              <span>Foto · {ukuranFile(foto.ukuran)}</span>
            </button>
          )}
          <div className="adm-tombol" style={{ margin: 0 }}>
            {lain.map((x) => (
              <button key={x.id} className="btn kecil" onClick={() => buka(x)}>
                Lihat {x.jenis === 'cv' ? 'CV' : 'foto'} ({ukuranFile(x.ukuran)})
              </button>
            ))}
          </div>
        </div>
      )}
      {ada('alasan') && (
        <blockquote className="rk-lamaran-alasan">
          <span className="adm-label">Alasan tertarik</span>
          {j.alasan}
        </blockquote>
      )}
      {grup.map(([judul, k]) => (
        <section key={judul} className="rk-lamaran-grup">
          <h5>{judul}</h5>
          <dl>
            {k.map((x) => (
              <div key={x}>
                <dt>{namaIsian(x)}</dt>
                <dd>{nilai(x)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      {jawaban && (
        <p className="adm-redup rk-lamaran-setuju">
          {j.setujuData ? '✓ Setuju data dipakai buat seleksi' : '✗ Belum setuju pemakaian data'} · {j.setujuWa ? '✓ boleh dihubungi WA' : '✗ nggak mau dihubungi WA'}
        </p>
      )}
    </div>
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
          <KartuKampanye key={k.id} api={api} k={k} titik={data.titik.filter((t) => t.kampanye_id === k.id)} biaya={(data.biaya || []).filter((b) => b.kampanye_id === k.id)} kanal={data.kanal} linkDaftar={data.linkDaftar} onBerubah={muat} setPesan={setPesan} />
        ))
      )}
      {data.arsip?.length > 0 && <KampanyeArsip api={api} arsip={data.arsip} onBerubah={muat} setPesan={setPesan} />}
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

// Kampanye yang lagi dilipat diingat per browser, biar pas balik ke tab ini susunannya sama.
const KUNCI_LIPAT = 'makalin_kampanye_lipat';
function bacaLipat() {
  try {
    return new Set(JSON.parse(localStorage.getItem(KUNCI_LIPAT) || '[]'));
  } catch {
    return new Set();
  }
}
function simpanLipat(id, lipat) {
  try {
    const x = bacaLipat();
    if (lipat) x.add(id);
    else x.delete(id);
    localStorage.setItem(KUNCI_LIPAT, JSON.stringify([...x].slice(-200)));
  } catch {
    /* storage diblok - cukup di memori */
  }
}

function KartuKampanye({ api, k, titik, biaya, kanal, linkDaftar, onBerubah, setPesan }) {
  const [modal, setModal] = useState(null); // 'kampanye' | 'biaya' | {titik}
  const [buka, setBuka] = useState(() => !bacaLipat().has(k.id));
  const pelamar = titik.reduce((a, t) => a + t.pelamar, 0);
  const lipat = () => {
    simpanLipat(k.id, buka);
    setBuka(!buka);
  };
  const jalan = async (fn, ok) => {
    setError('');
    try {
      await fn();
      setPesan(ok);
      onBerubah();
    } catch (e) {
      setError(e.message);
      setBuka(true);
    }
  };
  const arsipkan = () =>
    window.confirm(`Arsipkan kampanye ${k.nama}? Datanya tetap kesimpen dan link titiknya tetap jalan, cuma disembunyiin dari daftar.`) &&
    jalan(() => api('PATCH', `/rekrutmen/kampanye/${k.id}`, { arsip: true }), `Kampanye ${k.nama} diarsipkan.`);
  const hapus = () =>
    window.confirm(`Hapus kampanye ${k.nama} beserta ${titik.length} titik sebar dan riwayat biayanya? Nggak bisa dibalikin.`) &&
    jalan(() => api('DELETE', `/rekrutmen/kampanye/${k.id}`), `Kampanye ${k.nama} dihapus.`);
  const hapusTitik = (t) =>
    window.confirm(`Hapus titik ${t.kode}? Link ?s=${t.kode} nggak kehitung lagi.`) && jalan(() => api('DELETE', `/rekrutmen/titik/${t.id}`), `Titik ${t.kode} dihapus.`);
  const [f, setF] = useState({ kanal: 'JOB', area: k.area ? k.area.slice(0, 3).toUpperCase() : '', deskripsi: '', biaya: '' });
  const [error, setError] = useState('');
  const totalBiaya = k.biaya + titik.reduce((a, t) => a + t.biaya, 0);
  const diterima = titik.reduce((a, t) => a + t.diterima, 0);
  const linkTitik = (kode) => `${linkDaftar || window.location.origin + '/daftar'}?s=${kode}`;
  const salin = (kode) => {
    const link = linkTitik(kode);
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
    <section className={'adm-kartu rk-kampanye' + (buka ? '' : ' lipat')} style={{ marginBottom: 18 }}>
      <div className="adm-kartu-kepala hitam">
        <button type="button" className="rk-kampanye-lipat" onClick={lipat} aria-expanded={buka} aria-controls={`kp-${k.id}`}>
          <span className="rk-panah" aria-hidden="true">▾</span>
          <span className="rk-kampanye-judul">
            <b>
              {k.nama} {k.area ? `· ${k.area}` : ''}
            </b>
            <span className="adm-redup">
              {[
                k.mulai && `${tgl(k.mulai)}${k.selesai ? ` s/d ${tgl(k.selesai)}` : ''}`,
                `${titik.length} titik`,
                `${pelamar} pelamar`,
                `biaya ${rupiah(totalBiaya)}`,
                diterima && `${rupiah(totalBiaya / diterima)} per orang diterima`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
        </button>
        <span className="rk-kampanye-aksi">
          <button className="btn kecil" onClick={() => setModal('kampanye')}>
            Ubah
          </button>
          <button className="btn kecil" onClick={() => setModal('biaya')}>
            + Biaya
          </button>
          {pelamar ? (
            <button className="btn kecil" onClick={arsipkan} title="Kampanye yang udah bawa pelamar diarsipkan, bukan dihapus">
              Arsipkan
            </button>
          ) : (
            <button className="btn kecil bahaya" onClick={hapus}>
              Hapus
            </button>
          )}
        </span>
      </div>
      <div id={`kp-${k.id}`} className="rk-kampanye-isi" hidden={!buka}>
      {k.catatan && <p className="adm-redup" style={{ margin: '0 0 10px' }}>{k.catatan}</p>}
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
                  <td className="adm-mono" style={{ whiteSpace: 'nowrap' }}>{t.kode}</td>
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
                    <span style={{ display: 'flex', gap: 6 }}>
                      <button className="btn kecil" onClick={() => setModal({ titik: t })}>
                        Ubah
                      </button>
                      <button className="btn kecil" onClick={() => setModal({ link: t })}>
                        Link & QR
                      </button>
                      {!t.pelamar && (
                        <button className="btn kecil bahaya" onClick={() => hapusTitik(t)} aria-label={`Hapus titik ${t.kode}`}>
                          Hapus
                        </button>
                      )}
                    </span>
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
      </div>
      {modal === 'kampanye' && (
        <FormKampanye
          awal={k}
          onTutup={() => setModal(null)}
          onSimpan={async (isi) => {
            await api('PATCH', `/rekrutmen/kampanye/${k.id}`, isi);
            setModal(null);
            setPesan(`Kampanye ${isi.nama} diperbarui.`);
            onBerubah();
          }}
        />
      )}
      {modal === 'biaya' && (
        <FormBiaya
          k={k}
          titik={titik}
          riwayat={biaya}
          onTutup={() => setModal(null)}
          onSimpan={async (isi) => {
            await api('POST', `/rekrutmen/kampanye/${k.id}/biaya`, isi);
            setModal(null);
            setPesan(`Biaya ${rupiah(isi.jumlah)} ditambah ke ${isi.titik_id ? titik.find((t) => t.id === isi.titik_id)?.kode : 'biaya umum kampanye'}.`);
            onBerubah();
          }}
        />
      )}
      {modal?.link && <ModalLink t={modal.link} k={k} kanal={kanal} link={linkTitik(modal.link.kode)} onTutup={() => setModal(null)} onSalin={() => salin(modal.link.kode)} />}
      {modal?.titik && (
        <FormTitik
          t={modal.titik}
          kanal={kanal}
          onTutup={() => setModal(null)}
          onSimpan={async (isi) => {
            await api('PATCH', `/rekrutmen/titik/${modal.titik.id}`, isi);
            setModal(null);
            setPesan(`Titik ${modal.titik.kode} diperbarui.`);
            onBerubah();
          }}
        />
      )}
    </section>
  );
}

// QR dengan logo Konsulin di tengah. Pakai koreksi error level H (tahan ~30% bagian ketutup), logonya cuma ~20% lebar QR
// plus bingkai putih, jadi masih kebaca kamera HP biasa.
let logoKonsulin = null;
function muatLogo() {
  if (!logoKonsulin) {
    logoKonsulin = new Promise((ok, gagal) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => {
        logoKonsulin = null;
        gagal(new Error('Logo nggak kebaca'));
      };
      img.src = '/logo-konsulin.png';
    });
  }
  return logoKonsulin;
}
async function qrDenganLogo(link, ukuran) {
  const c = document.createElement('canvas');
  await QRCode.toCanvas(c, link, { width: ukuran, margin: 2, errorCorrectionLevel: 'H' });
  try {
    const logo = await muatLogo();
    const x = c.getContext('2d');
    const bingkai = Math.round(c.width * 0.24);
    const sisi = Math.round(c.width * 0.18);
    const b0 = Math.round((c.width - bingkai) / 2);
    const r = Math.round(bingkai * 0.18);
    x.fillStyle = '#ffffff';
    x.beginPath();
    x.roundRect ? x.roundRect(b0, b0, bingkai, bingkai, r) : x.rect(b0, b0, bingkai, bingkai);
    x.fill();
    x.drawImage(logo, Math.round((c.width - sisi) / 2), Math.round((c.height - sisi) / 2), sisi, sisi);
  } catch {
    /* logo gagal dimuat - QR polos tetap bisa dipakai */
  }
  return c.toDataURL('image/png');
}

// Link daftar + QR per titik sebar. QR bisa diunduh versi polos atau versi siap tempel (ada kode & keterangan) buat poster.
function ModalLink({ t, k, kanal, link, onTutup, onSalin }) {
  const [qr, setQr] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let batal = false;
    qrDenganLogo(link, 600)
      .then((u) => !batal && setQr(u))
      .catch(() => !batal && setQr(false));
    return () => {
      batal = true;
    };
  }, [link]);
  const unduh = (url, nama) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = nama;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  const unduhPoster = async () => {
    setError('');
    try {
      const img = new Image();
      img.src = await qrDenganLogo(link, 900);
      await img.decode();
      const c = document.createElement('canvas');
      c.width = 1080;
      c.height = 1350;
      const x = c.getContext('2d');
      x.fillStyle = '#ffffff';
      x.fillRect(0, 0, c.width, c.height);
      x.fillStyle = '#111111';
      x.textAlign = 'center';
      x.font = 'bold 64px system-ui, sans-serif';
      x.fillText('Lowongan Sales Partner', 540, 120);
      x.font = '40px system-ui, sans-serif';
      x.fillText('Scan buat daftar - Konsulin', 540, 180);
      x.drawImage(img, 90, 230, 900, 900);
      x.font = 'bold 48px ui-monospace, Menlo, monospace';
      x.fillText(t.kode, 540, 1220);
      x.font = '30px system-ui, sans-serif';
      x.fillStyle = '#52525B';
      x.fillText(link.replace(/^https?:\/\//, ''), 540, 1280);
      unduh(c.toDataURL('image/png'), `poster-${t.kode}.png`);
    } catch {
      setError('Poster gagal dibikin. Unduh QR polos aja.');
    }
  };
  const bisaBagikan = typeof navigator !== 'undefined' && Boolean(navigator.share);
  return (
    <Modal judul={`Link & QR · ${t.kode}`} onTutup={onTutup}>
      <p className="adm-redup" style={{ marginTop: 0 }}>
        {k.nama} · {kanal[t.kanal]}
        {t.deskripsi ? ` · ${t.deskripsi}` : ''}. Semua yang daftar lewat link atau QR ini kehitung ke titik {t.kode}.
      </p>
      <div className="rk-link-qr">
        <div className="rk-qr">{qr ? <img src={qr} alt={`QR link daftar ${t.kode}`} /> : qr === false ? <span className="adm-error">QR gagal dibikin</span> : <span className="adm-redup">Bikin QR…</span>}</div>
        <div className="rk-link-isi">
          <label className="adm-label" htmlFor="rk-link" style={{ fontSize: 11 }}>
            Link daftar
          </label>
          <input id="rk-link" className="adm-input adm-mono" readOnly value={link} onFocus={(e) => e.target.select()} />
          <div className="adm-tombol">
            <button className="btn kecil utama" onClick={onSalin}>
              Salin link
            </button>
            {bisaBagikan && (
              <button className="btn kecil" onClick={() => navigator.share({ title: 'Lowongan Sales Partner Konsulin', url: link }).catch(() => {})}>
                Bagikan
              </button>
            )}
            <a className="btn kecil" href={link} target="_blank" rel="noopener noreferrer">
              Buka
            </a>
          </div>
          <div className="adm-tombol">
            <button className="btn kecil" disabled={!qr} onClick={() => unduh(qr, `qr-${t.kode}.png`)}>
              Unduh QR
            </button>
            <button className="btn kecil" disabled={!qr} onClick={unduhPoster}>
              Unduh QR siap poster
            </button>
          </div>
          {error && <p className="adm-error">{error}</p>}
        </div>
      </div>
    </Modal>
  );
}

function KampanyeArsip({ api, arsip, onBerubah, setPesan }) {
  const [buka, setBuka] = useState(false);
  const [error, setError] = useState('');
  const jalan = async (fn, ok) => {
    setError('');
    try {
      await fn();
      setPesan(ok);
      onBerubah();
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <section className="adm-kartu" style={{ marginBottom: 18 }}>
      <button type="button" className="rk-arsip-lipat" onClick={() => setBuka(!buka)} aria-expanded={buka}>
        <span className={'rk-panah' + (buka ? '' : ' tutup')} aria-hidden="true">▾</span>
        <b>Kampanye diarsipkan</b> <span className="adm-redup">({arsip.length})</span>
      </button>
      {buka && (
        <>
          {error && <p className="adm-error">{error}</p>}
          <ul className="adm-daftar">
            {arsip.map((k) => (
              <li key={k.id}>
                <div>
                  <b>
                    {k.nama} {k.area ? `· ${k.area}` : ''}
                  </b>
                  <div className="adm-redup">
                    {k.jumlah_titik} titik · {k.pelamar} pelamar · biaya {rupiah(k.total_biaya)}
                  </div>
                </div>
                <span style={{ display: 'flex', gap: 6 }}>
                  <button className="btn kecil" onClick={() => jalan(() => api('PATCH', `/rekrutmen/kampanye/${k.id}`, { arsip: false }), `Kampanye ${k.nama} dipulihkan.`)}>
                    Pulihkan
                  </button>
                  {!k.pelamar && (
                    <button
                      className="btn kecil bahaya"
                      onClick={() => window.confirm(`Hapus kampanye ${k.nama} permanen?`) && jalan(() => api('DELETE', `/rekrutmen/kampanye/${k.id}`), `Kampanye ${k.nama} dihapus.`)}
                    >
                      Hapus
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function FormTitik({ t, kanal, onTutup, onSimpan }) {
  const [isi, setIsi] = useState({ kanal: t.kanal, deskripsi: t.deskripsi || '', biaya: String(t.biaya || '') });
  const [error, setError] = useState('');
  const [sibuk, setSibuk] = useState(false);
  return (
    <Modal judul={`Ubah titik ${t.kode}`} onTutup={onTutup}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          setSibuk(true);
          try {
            await onSimpan({ kanal: isi.kanal, deskripsi: isi.deskripsi.trim(), biaya: Number(isi.biaya) || 0 });
          } catch (err) {
            setError(err.message);
            setSibuk(false);
          }
        }}
      >
        <p className="adm-redup" style={{ marginTop: 0 }}>
          Kode <b className="adm-mono">{t.kode}</b> nggak bisa diganti biar link yang udah disebar tetap kehitung.
        </p>
        <div className="field">
          <label htmlFor="tt-kanal">Kanal</label>
          <select id="tt-kanal" value={isi.kanal} onChange={(e) => setIsi((x) => ({ ...x, kanal: e.target.value }))} style={{ maxWidth: 'none', width: '100%', minHeight: 44 }}>
            {Object.entries(kanal).map(([v, n]) => (
              <option key={v} value={v}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="tt-desk">Nama grup / lokasi poster</label>
          <input id="tt-desk" value={isi.deskripsi} maxLength={200} onChange={(e) => setIsi((x) => ({ ...x, deskripsi: e.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor="tt-biaya">Biaya total titik ini (Rp)</label>
          <input id="tt-biaya" value={isi.biaya} inputMode="numeric" onChange={(e) => setIsi((x) => ({ ...x, biaya: e.target.value.replace(/\D/g, '') }))} placeholder="0" />
          <small className="adm-redup">Buat koreksi angka. Kalau nambah biaya baru, pakai tombol "+ Biaya" di kampanye biar ada riwayatnya.</small>
        </div>
        {error && <p className="adm-error">{error}</p>}
        <div className="adm-tombol" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="btn" onClick={onTutup}>
            Batal
          </button>
          <button type="submit" className="btn utama" disabled={sibuk}>
            {sibuk ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function FormBiaya({ k, titik, riwayat, onTutup, onSimpan }) {
  const [isi, setIsi] = useState({ jumlah: '', titik_id: '', catatan: '' });
  const [error, setError] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const jumlah = Number(isi.jumlah) || 0;
  return (
    <Modal judul={`Tambah biaya · ${k.nama}`} onTutup={onTutup}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          setSibuk(true);
          try {
            await onSimpan({ jumlah, titik_id: isi.titik_id || null, catatan: isi.catatan.trim() });
          } catch (err) {
            setError(err.message);
            setSibuk(false);
          }
        }}
      >
        <p className="adm-redup" style={{ marginTop: 0 }}>
          Buat biaya yang muncul di tengah jalan: boost iklan, cetak poster lagi, bayar admin grup, dll. Angkanya ditambahin ke biaya yang udah ada.
        </p>
        <div className="adm-baris" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <div className="field">
            <label htmlFor="bi-jumlah">Jumlah (Rp)</label>
            <input id="bi-jumlah" value={isi.jumlah} inputMode="numeric" autoFocus onChange={(e) => setIsi((x) => ({ ...x, jumlah: e.target.value.replace(/\D/g, '') }))} placeholder="50000" />
            {jumlah > 0 && <small className="adm-redup">{rupiah(jumlah)}</small>}
          </div>
          <div className="field">
            <label htmlFor="bi-untuk">Buat</label>
            <select id="bi-untuk" value={isi.titik_id} onChange={(e) => setIsi((x) => ({ ...x, titik_id: e.target.value }))} style={{ maxWidth: 'none', width: '100%', minHeight: 44 }}>
              <option value="">Biaya umum kampanye</option>
              {titik.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.kode}
                  {t.deskripsi ? ` · ${t.deskripsi}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="bi-catatan">Keterangan (opsional)</label>
          <input id="bi-catatan" value={isi.catatan} maxLength={200} onChange={(e) => setIsi((x) => ({ ...x, catatan: e.target.value }))} placeholder="Misal: boost iklan minggu ke-2" />
        </div>
        {error && <p className="adm-error">{error}</p>}
        <div className="adm-tombol" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="btn" onClick={onTutup}>
            Batal
          </button>
          <button type="submit" className="btn utama" disabled={sibuk || jumlah <= 0}>
            {sibuk ? 'Menyimpan…' : 'Tambah biaya'}
          </button>
        </div>
      </form>
      <h3 style={{ fontSize: 14, margin: '20px 0 6px' }}>Riwayat tambahan biaya</h3>
      {riwayat.length === 0 ? (
        <p className="adm-redup" style={{ margin: 0 }}>
          Belum ada tambahan. Biaya awal diisi waktu kampanye & titik dibikin.
        </p>
      ) : (
        <ul className="adm-daftar">
          {riwayat.map((b) => (
            <li key={b.id}>
              <div>
                <b className="p-num">+{rupiah(b.jumlah)}</b> <span className="adm-redup">{b.titik_kode || 'biaya umum'}</span>
                {b.catatan && <div className="adm-redup">{b.catatan}</div>}
              </div>
              <span className="adm-redup" style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                {b.oleh}
                <br />
                {waktu(b.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

// Tanggal dari server (DATE -> ISO) ke format input type=date, pakai tanggal lokal biar nggak mundur sehari.
function tglInput(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const dua = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dua(d.getMonth() + 1)}-${dua(d.getDate())}`;
}
function FormKampanye({ awal, onTutup, onSimpan }) {
  const [isi, setIsi] = useState(
    awal
      ? { nama: awal.nama || '', area: awal.area || '', mulai: tglInput(awal.mulai), selesai: tglInput(awal.selesai), biaya: String(awal.biaya || ''), catatan: awal.catatan || '' }
      : { nama: '', area: '', mulai: '', selesai: '', biaya: '', catatan: '' }
  );
  const [error, setError] = useState('');
  const ubah = (k) => (e) => setIsi((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Modal judul={awal ? `Ubah kampanye` : 'Kampanye baru'} onTutup={onTutup}>
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
        <div className="field">
          <label htmlFor="kp-catatan">Catatan (opsional)</label>
          <input id="kp-catatan" value={isi.catatan} maxLength={300} onChange={ubah('catatan')} placeholder="Target, PIC, dll" />
        </div>
        {error && <p className="adm-error">{error}</p>}
        <div className="adm-tombol" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="btn" onClick={onTutup}>
            Batal
          </button>
          <button type="submit" className="btn utama" disabled={!isi.nama.trim()}>
            {awal ? 'Simpan perubahan' : 'Simpan kampanye'}
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
