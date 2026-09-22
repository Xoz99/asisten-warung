import { useCallback, useEffect, useMemo, useState } from 'react';
import { bulanLabel, rupiah, tampilHp, tgl } from '../lib/format.js';
import { Gagal, Kosong, Memuat, Modal, Tabs, useData } from '../komponen/Ui.jsx';

// HR Karyawan: data kepegawaian, kehadiran harian, cuti & izin, payroll bulanan, struktur organisasi.
const TABS = [
  { id: 'daftar', nama: 'Daftar karyawan' },
  { id: 'kehadiran', nama: 'Kehadiran' },
  { id: 'cuti', nama: 'Cuti & izin' },
  { id: 'payroll', nama: 'Payroll' },
  { id: 'struktur', nama: 'Struktur organisasi' },
];
const TIPE = { tetap: 'Tetap', kontrak: 'Kontrak', probation: 'Probation', magang: 'Magang', kemitraan: 'Kemitraan' };
const HADIR = {
  hadir: { nama: 'Hadir', warna: 'hijau' },
  wfh: { nama: 'WFH', warna: 'biru' },
  terlambat: { nama: 'Terlambat', warna: 'kuning' },
  dinas_luar: { nama: 'Dinas luar', warna: 'ungu' },
  izin: { nama: 'Izin', warna: 'oranye' },
  sakit: { nama: 'Sakit', warna: 'oranye' },
  cuti: { nama: 'Cuti', warna: 'ungu' },
  alpa: { nama: 'Alpa', warna: 'merah' },
};
const JENIS_CUTI = { cuti_tahunan: 'Cuti tahunan', sakit: 'Sakit', izin: 'Izin', cuti_menikah: 'Cuti menikah', cuti_melahirkan: 'Cuti melahirkan', lainnya: 'Lainnya' };
const STATUS_CUTI = { menunggu: { nama: 'Menunggu', warna: 'kuning' }, disetujui: { nama: 'Disetujui', warna: 'hijau' }, ditolak: { nama: 'Ditolak', warna: 'merah' } };
const STATUS_KARYAWAN = { aktif: { nama: 'Aktif', warna: 'hijau' }, nonaktif: { nama: 'Nonaktif', warna: '' }, keluar: { nama: 'Keluar', warna: 'merah' } };
const hariIniWib = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const jam = (t) => (t ? String(t).slice(0, 5) : '');

function masaKerja(mulai) {
  const a = new Date(mulai + 'T00:00:00');
  const b = new Date();
  let bulan = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
  if (b.getDate() < a.getDate()) bulan--;
  if (bulan < 1) return 'Kurang dari sebulan';
  const t = Math.floor(bulan / 12);
  return [t && `${t} tahun`, bulan % 12 && `${bulan % 12} bulan`].filter(Boolean).join(' ');
}

function unduhCsv(nama, kepala, baris) {
  const sel = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const isi = [kepala, ...baris].map((r) => r.map(sel).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob(['﻿' + isi], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nama });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Karyawan({ api, tab }) {
  const aktif = TABS.some((t) => t.id === tab) ? tab : 'daftar';
  const { data: r, error: errRingkasan, muat: muatRingkasan } = useData(api, '/karyawan/ringkasan');
  const { data: calon, muat: muatCalon } = useData(api, '/karyawan-calon');
  const [form, setForm] = useState(null); // { awal } | null
  const [dipilih, setDipilih] = useState(null);
  const [versi, setVersi] = useState(0);
  const [pesan, setPesan] = useState('');
  const segarkan = useCallback(() => {
    setVersi((v) => v + 1);
    muatRingkasan();
    muatCalon();
  }, [muatRingkasan, muatCalon]);

  const hadirMasuk = r ? (r.hadir.hadir || 0) + (r.hadir.wfh || 0) + (r.hadir.dinas_luar || 0) : 0;
  const tidakMasuk = r ? (r.hadir.izin || 0) + (r.hadir.sakit || 0) + (r.hadir.cuti || 0) : 0;

  return (
    <>
      <header className="adm-kepala">
        <div>
          <h1>Karyawan</h1>
          <p className="adm-sub">Data kepegawaian, kehadiran, cuti & izin, dan payroll tim Makalin. Kehadiran dicatat admin per hari.</p>
        </div>
        <div className="adm-tombol" style={{ marginTop: 0 }}>
          <button className="btn utama" onClick={() => setForm({ awal: {} })}>
            + Tambah karyawan
          </button>
        </div>
      </header>

      {errRingkasan ? (
        <Gagal apa="ringkasan" pesan={errRingkasan} onUlang={muatRingkasan} />
      ) : (
        <section className="adm-dashboard-atas" aria-label="Ringkasan karyawan">
          <div className="adm-kartu adm-stat fokus">
            <span className="adm-label">Karyawan aktif</span>
            <span className="nilai p-num">{r ? r.aktif : '…'}</span>
            <span className="adm-redup">
              {r && r.aktif
                ? Object.entries(r.perTipe)
                    .map(([t, n]) => `${n} ${TIPE[t]?.toLowerCase() || t}`)
                    .join(' · ')
                : r
                  ? 'Belum ada data karyawan'
                  : ''}
            </span>
          </div>
          <div className="adm-kartu adm-stat">
            <span className="adm-label">Masuk hari ini</span>
            <span className="nilai p-num">{r ? `${hadirMasuk + (r.hadir.terlambat || 0)}/${r.aktif}` : '…'}</span>
            <span className="adm-redup">
              {r ? [r.hadir.terlambat && `${r.hadir.terlambat} terlambat`, r.hadir.alpa && `${r.hadir.alpa} alpa`, r.belumDicatat > 0 && `${r.belumDicatat} belum dicatat`].filter(Boolean).join(' · ') || 'Semua tercatat' : ''}
            </span>
          </div>
          <div className="adm-kartu adm-stat" style={r?.cutiMenunggu ? { background: 'var(--kuning)' } : undefined}>
            <span className="adm-label">Cuti & izin</span>
            <span className="nilai p-num">{r ? r.cutiMenunggu : '…'}</span>
            <span className="adm-redup" style={r?.cutiMenunggu ? { color: 'var(--tinta)' } : undefined}>
              {r ? `Nunggu persetujuan · ${tidakMasuk} nggak masuk hari ini` : ''}
            </span>
          </div>
          <div className="adm-kartu adm-stat">
            <span className="adm-label">Payroll {r ? bulanLabel(r.bulan) : ''}</span>
            <span className="nilai p-num" style={{ fontSize: 22 }}>
              {r ? rupiah(r.payroll.n ? r.payroll.total : r.estimasiGaji) : '…'}
            </span>
            <span className="adm-redup">
              {r ? (r.payroll.n ? `${r.payroll.dibayar}/${r.payroll.n} udah dibayar` : 'Estimasi dari gaji + tunjangan, draf belum dibuat') : ''}
            </span>
          </div>
        </section>
      )}

      {r?.kontrakHabis > 0 && (
        <p className="adm-gagal" style={{ background: 'var(--kuning)' }}>
          <b>{r.kontrakHabis} kontrak habis dalam 30 hari.</b> Cek di daftar karyawan (kolom habis kontrak).
        </p>
      )}
      {calon?.length > 0 && (
        <div className="adm-kartu" style={{ marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ marginRight: 'auto' }}>
            <b>{calon.length} Sales Partner dari Rekrutmen</b> udah Hired tapi belum masuk data karyawan: {calon.map((c) => c.nama).join(', ')}.
          </span>
          {calon.slice(0, 3).map((c) => (
            <button key={c.id} className="btn kecil" onClick={() => setForm({ awal: { orang_id: c.id, nama: c.nama, no_hp: tampilHp(c.no_hp), tipe: 'kemitraan', jabatan: 'Sales Partner', departemen: 'Sales' } })}>
              Masukkan {c.nama}
            </button>
          ))}
        </div>
      )}

      <Tabs daftar={TABS} aktif={aktif} href={(id) => `#/karyawan/${id}`} />
      {pesan && (
        <p className="adm-ok" role="status">
          {pesan}
        </p>
      )}

      {aktif === 'daftar' && <Daftar api={api} versi={versi} onBuka={setDipilih} onTambah={() => setForm({ awal: {} })} onBerubah={segarkan} setPesan={setPesan} />}
      {aktif === 'kehadiran' && <Kehadiran api={api} onBerubah={segarkan} />}
      {aktif === 'cuti' && <Cuti api={api} versi={versi} onBerubah={segarkan} />}
      {aktif === 'payroll' && <Payroll api={api} onBerubah={segarkan} />}
      {aktif === 'struktur' && <Struktur api={api} versi={versi} onBuka={setDipilih} />}

      {form && (
        <FormKaryawan
          api={api}
          awal={form.awal}
          onTutup={() => setForm(null)}
          onSelesai={(teks) => {
            setForm(null);
            setPesan(teks);
            segarkan();
          }}
        />
      )}
      {dipilih && (
        <Detail
          key={dipilih + versi}
          api={api}
          id={dipilih}
          onTutup={() => setDipilih(null)}
          onEdit={(k) => setForm({ awal: k })}
          onBerubah={segarkan}
        />
      )}
    </>
  );
}

// ---------------- Daftar ----------------
function Daftar({ api, versi, onBuka, onTambah, onBerubah, setPesan }) {
  const [f, setF] = useState({ q: '', departemen: '', tipe: '', status: 'aktif' });
  const [ketik, setKetik] = useState('');
  const [tampilan, setTampilan] = useState('tabel');
  const [centang, setCentang] = useState(new Set());
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const { data, error, muat } = useData(api, `/karyawan?${qs}&v=${versi}`);
  const ubah = (k, v) => {
    setF((x) => ({ ...x, [k]: v }));
    setCentang(new Set());
  };

  if (error) return <Gagal apa="karyawan" pesan={error} onUlang={muat} />;
  const daftar = data?.karyawan || [];
  const semuaDicentang = daftar.length > 0 && daftar.every((k) => centang.has(k.id));
  const toggle = (id) =>
    setCentang((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const dipilih = daftar.filter((k) => centang.has(k.id));

  const massal = async (body, teks) => {
    try {
      for (const k of dipilih) await api('PATCH', `/karyawan/${k.id}`, body);
      setPesan(teks(dipilih.length));
      setCentang(new Set());
      onBerubah();
    } catch (e) {
      setPesan('Gagal: ' + e.message);
    }
  };
  const ekspor = (rows) =>
    unduhCsv(
      `karyawan-${hariIniWib()}.csv`,
      ['NIK', 'Nama', 'Email', 'No HP', 'Jabatan', 'Departemen', 'Tipe', 'Lokasi', 'Tanggal masuk', 'Habis kontrak', 'Atasan', 'Gaji pokok', 'Tunjangan transport', 'Tunjangan makan', 'Status'],
      rows.map((k) => [k.nik, k.nama, k.email, tampilHp(k.no_hp), k.jabatan, k.departemen, TIPE[k.tipe], k.lokasi, k.tanggal_masuk, k.kontrak_selesai, k.atasan_nama, k.gaji_pokok, k.tunjangan_transport, k.tunjangan_makan, k.status])
    );

  const chip = [f.q && ['q', `Cari: ${f.q}`], f.departemen && ['departemen', f.departemen], f.tipe && ['tipe', TIPE[f.tipe]], f.status !== 'aktif' && ['status', f.status === 'semua' ? 'Semua status' : STATUS_KARYAWAN[f.status].nama]].filter(Boolean);

  return (
    <>
      <section className="adm-kartu" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="adm-toggle-tampil" role="group" aria-label="Tampilan">
            {['tabel', 'kartu'].map((v) => (
              <button key={v} className={tampilan === v ? 'on' : ''} onClick={() => setTampilan(v)} aria-pressed={tampilan === v}>
                {v}
              </button>
            ))}
          </div>
          <form
            style={{ flex: 1, minWidth: 200, display: 'flex' }}
            onSubmit={(e) => {
              e.preventDefault();
              ubah('q', ketik.trim());
            }}
          >
            <input value={ketik} onChange={(e) => setKetik(e.target.value)} placeholder="Cari nama, NIK, jabatan, email" aria-label="Cari karyawan" style={{ flex: 1, maxWidth: 'none' }} />
            <button className="btn" type="submit">
              Cari
            </button>
          </form>
          <select value={f.departemen} onChange={(e) => ubah('departemen', e.target.value)} aria-label="Filter departemen">
            <option value="">Semua departemen</option>
            {(data?.departemen || []).map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          <select value={f.tipe} onChange={(e) => ubah('tipe', e.target.value)} aria-label="Filter tipe kontrak">
            <option value="">Semua tipe</option>
            {Object.entries(TIPE).map(([id, n]) => (
              <option key={id} value={id}>
                {n}
              </option>
            ))}
          </select>
          <select value={f.status} onChange={(e) => ubah('status', e.target.value)} aria-label="Filter status">
            <option value="aktif">Aktif</option>
            <option value="nonaktif">Nonaktif</option>
            <option value="keluar">Keluar</option>
            <option value="semua">Semua status</option>
          </select>
          <button className="btn" onClick={() => ekspor(daftar)} disabled={!daftar.length}>
            Ekspor
          </button>
        </div>
      </section>
      {chip.length > 0 && (
        <div className="adm-chip-filter">
          {chip.map(([k, t]) => (
            <button
              key={k}
              className="adm-chip"
              onClick={() => {
                ubah(k, k === 'status' ? 'aktif' : '');
                if (k === 'q') setKetik('');
              }}
              aria-label={`Hapus filter ${t}`}
            >
              {t} ×
            </button>
          ))}
        </div>
      )}

      {!data ? (
        <Memuat apa="karyawan" />
      ) : daftar.length === 0 ? (
        chip.length ? (
          <Kosong judul="Nggak ada yang cocok">Coba hapus salah satu filter di atas.</Kosong>
        ) : (
          <Kosong
            judul="Belum ada karyawan"
            aksi={
              <button className="btn utama" onClick={onTambah}>
                + Tambah karyawan
              </button>
            }
          >
            Tambahkan karyawan pertama. Sales Partner yang Hired di Rekrutmen juga bisa dimasukkan dari sini.
          </Kosong>
        )
      ) : tampilan === 'kartu' ? (
        <div className="adm-angka" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
          {daftar.map((k) => (
            <button key={k.id} className="adm-kartu adm-angka-item adm-saring" onClick={() => onBuka(k.id)}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span className="adm-inisial" aria-hidden="true">
                  {k.nama[0]?.toUpperCase()}
                </span>
                <div style={{ minWidth: 0 }}>
                  <b style={{ fontSize: 17 }}>{k.nama}</b>
                  <div className="adm-redup">{k.jabatan || 'Jabatan belum diisi'}</div>
                </div>
              </div>
              <span className="adm-mono adm-redup">
                {k.nik} · {k.departemen || 'Tanpa departemen'}
              </span>
              <span>
                <span className="adm-chip">{TIPE[k.tipe]}</span> <ChipHadir k={k} />
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="adm-gulir">
          {dipilih.length > 0 && (
            <div className="adm-massal" role="region" aria-label="Aksi untuk karyawan yang dipilih">
              <b>{dipilih.length} karyawan dipilih</b>
              <button
                className="btn kecil"
                onClick={() => {
                  const d = window.prompt('Pindahkan ke departemen apa?');
                  if (d?.trim()) massal({ departemen: d.trim() }, (n) => `${n} karyawan dipindah ke departemen ${d.trim()}.`);
                }}
              >
                Ubah departemen
              </button>
              <button className="btn kecil" onClick={() => ekspor(dipilih)}>
                Ekspor
              </button>
              {f.status === 'aktif' && (
                <button className="btn kecil bahaya" onClick={() => window.confirm(`Nonaktifkan ${dipilih.length} karyawan?`) && massal({ status: 'nonaktif' }, (n) => `${n} karyawan dinonaktifkan.`)}>
                  Nonaktifkan
                </button>
              )}
            </div>
          )}
          <table className="adm-tabel">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox" className="adm-centang" checked={semuaDicentang} onChange={() => setCentang(semuaDicentang ? new Set() : new Set(daftar.map((k) => k.id)))} aria-label="Pilih semua karyawan" />
                </th>
                <th>NIK</th>
                <th>Karyawan</th>
                <th>Jabatan</th>
                <th>Departemen</th>
                <th>Tipe</th>
                <th>Masuk</th>
                <th>Hari ini</th>
                <th className="kanan">Gaji pokok</th>
              </tr>
            </thead>
            <tbody>
              {daftar.map((k) => (
                <tr key={k.id} className="adm-saring" tabIndex={0} onClick={() => onBuka(k.id)} onKeyDown={(e) => e.key === 'Enter' && onBuka(k.id)} style={{ cursor: 'pointer' }}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" className="adm-centang" checked={centang.has(k.id)} onChange={() => toggle(k.id)} aria-label={`Pilih ${k.nama}`} />
                  </td>
                  <td className="adm-mono" style={{ whiteSpace: 'nowrap' }}>
                    {k.nik}
                  </td>
                  <td>
                    <b>{k.nama}</b>
                    <div className="adm-redup">{k.email || tampilHp(k.no_hp)}</div>
                  </td>
                  <td>{k.jabatan || '-'}</td>
                  <td>{k.departemen || '-'}</td>
                  <td>
                    <span className="adm-chip">{TIPE[k.tipe]}</span>
                    {k.kontrak_selesai && <div className="adm-redup">s/d {tgl(k.kontrak_selesai)}</div>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{tgl(k.tanggal_masuk)}</td>
                  <td>
                    {k.status === 'aktif' ? <ChipHadir k={k} /> : <span className={`adm-chip ${STATUS_KARYAWAN[k.status].warna}`}>{STATUS_KARYAWAN[k.status].nama}</span>}
                  </td>
                  <td className="kanan p-num" style={{ whiteSpace: 'nowrap' }}>
                    {k.tipe === 'kemitraan' && !k.gaji_pokok ? <span className="adm-redup">Komisi</span> : rupiah(k.gaji_pokok)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ChipHadir({ k }) {
  if (!k.hadir_hari_ini) return <span className="adm-redup">Belum dicatat</span>;
  const h = HADIR[k.hadir_hari_ini];
  return (
    <span className={`adm-chip ${h.warna}`}>
      {h.nama}
      {k.jam_masuk_hari_ini ? ` ${jam(k.jam_masuk_hari_ini)}` : ''}
    </span>
  );
}

// ---------------- Form tambah / ubah ----------------
function FormKaryawan({ api, awal, onTutup, onSelesai }) {
  const edit = Boolean(awal.id);
  const [isi, setIsi] = useState(() => {
    const kosong = { nama: '', email: '', no_hp: '', jabatan: '', departemen: '', grade: '', tipe: 'tetap', lokasi: '', tanggal_masuk: hariIniWib(), kontrak_selesai: '', tanggal_lahir: '', atasan_id: '', gaji_pokok: '', tunjangan_transport: '', tunjangan_makan: '', jatah_cuti: 12, bank: '', rekening: '', atas_nama: '', npwp: '', bpjs_kesehatan: '', catatan: '' };
    const x = { ...kosong };
    for (const k of Object.keys(kosong)) if (awal[k] != null) x[k] = k === 'no_hp' ? tampilHp(awal[k]) : awal[k];
    return x;
  });
  const [error, setError] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const { data: semua } = useData(api, '/karyawan?status=aktif');
  const ubah = (k) => (e) => setIsi((x) => ({ ...x, [k]: e.target.value }));
  const field = (k, label, props = {}) => (
    <div className="field">
      <label htmlFor={`kr-${k}`}>{label}</label>
      <input id={`kr-${k}`} value={isi[k] ?? ''} onChange={ubah(k)} {...props} />
    </div>
  );
  const grid = { gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' };

  return (
    <Modal judul={edit ? `Ubah data ${awal.nama}` : awal.orang_id ? `Masukkan ${awal.nama} ke karyawan` : 'Tambah karyawan'} onTutup={onTutup} lebar={760}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          setSibuk(true);
          try {
            const body = { ...isi, atasan_id: isi.atasan_id || null };
            if (edit) {
              await api('PATCH', `/karyawan/${awal.id}`, body);
              onSelesai(`Data ${isi.nama} disimpan.`);
            } else {
              const h = await api('POST', '/karyawan', { ...body, orang_id: awal.orang_id });
              onSelesai(`${h.nama} masuk sebagai karyawan dengan NIK ${h.nik}.`);
            }
          } catch (err) {
            setError(err.message);
            setSibuk(false);
          }
        }}
      >
        <span className="adm-label">Data diri</span>
        <div className="adm-baris" style={grid}>
          {field('nama', 'Nama lengkap', { required: true })}
          {field('email', 'Email', { type: 'email' })}
          {field('no_hp', 'No. HP / WA', { inputMode: 'tel' })}
          {field('tanggal_lahir', 'Tanggal lahir', { type: 'date' })}
        </div>
        <span className="adm-label" style={{ display: 'block', marginTop: 16 }}>
          Kepegawaian
        </span>
        <div className="adm-baris" style={grid}>
          {field('jabatan', 'Jabatan', { placeholder: 'Sales Partner' })}
          {field('departemen', 'Departemen', { placeholder: 'Sales', list: 'kr-dept' })}
          <datalist id="kr-dept">
            {(semua?.departemen || []).map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
          <div className="field">
            <label htmlFor="kr-tipe">Tipe</label>
            <select id="kr-tipe" value={isi.tipe} onChange={ubah('tipe')} style={{ maxWidth: 'none', width: '100%', minHeight: 44 }}>
              {Object.entries(TIPE).map(([id, n]) => (
                <option key={id} value={id}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          {field('lokasi', 'Lokasi / area', { placeholder: 'Karawang' })}
          {field('tanggal_masuk', 'Tanggal masuk', { type: 'date', required: true })}
          {isi.tipe !== 'tetap' && field('kontrak_selesai', 'Kontrak selesai', { type: 'date' })}
          <div className="field">
            <label htmlFor="kr-atasan">Atasan langsung</label>
            <select id="kr-atasan" value={isi.atasan_id || ''} onChange={ubah('atasan_id')} style={{ maxWidth: 'none', width: '100%', minHeight: 44 }}>
              <option value="">Nggak ada</option>
              {(semua?.karyawan || [])
                .filter((k) => k.id !== awal.id)
                .map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nama} {k.jabatan ? `· ${k.jabatan}` : ''}
                  </option>
                ))}
            </select>
          </div>
          {field('grade', 'Grade (opsional)')}
        </div>
        <span className="adm-label" style={{ display: 'block', marginTop: 16 }}>
          Kompensasi & administrasi
        </span>
        <div className="adm-baris" style={grid}>
          {field('gaji_pokok', 'Gaji pokok / bulan (Rp)', { inputMode: 'numeric', type: 'number', min: 0 })}
          {field('tunjangan_transport', 'Tunjangan transport (Rp)', { inputMode: 'numeric', type: 'number', min: 0 })}
          {field('tunjangan_makan', 'Tunjangan makan (Rp)', { inputMode: 'numeric', type: 'number', min: 0 })}
          {field('jatah_cuti', 'Jatah cuti tahunan (hari)', { inputMode: 'numeric', type: 'number', min: 0, max: 60 })}
          {field('bank', 'Bank', { placeholder: 'BCA' })}
          {field('rekening', 'No. rekening', { inputMode: 'numeric' })}
          {field('atas_nama', 'Atas nama rekening')}
          {field('npwp', 'NPWP')}
          {field('bpjs_kesehatan', 'No. BPJS Kesehatan')}
        </div>
        {isi.tipe === 'kemitraan' && <p className="adm-redup">Sales Partner kemitraan dibayar komisi. Gaji pokok boleh 0 - komisinya belum dihitung otomatis di sini.</p>}
        <div className="field">
          <label htmlFor="kr-catatan">Catatan</label>
          <textarea id="kr-catatan" value={isi.catatan || ''} onChange={ubah('catatan')} rows={2} />
        </div>
        {error && <p className="adm-error">{error}</p>}
        <div className="adm-tombol" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="btn" onClick={onTutup}>
            Batal
          </button>
          <button type="submit" className="btn utama" disabled={sibuk || !isi.nama.trim()}>
            {sibuk ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------- Panel detail ----------------
function Detail({ api, id, onTutup, onEdit, onBerubah }) {
  const { data: d, error } = useData(api, `/karyawan/${id}`);
  const [aksi, setAksi] = useState(null); // 'keluar'
  const [err, setErr] = useState('');
  useEffect(() => {
    const tekan = (e) => e.key === 'Escape' && !document.querySelector('.adm-modal') && onTutup();
    document.addEventListener('keydown', tekan);
    return () => document.removeEventListener('keydown', tekan);
  }, [onTutup]);

  const ubahStatus = async (body) => {
    setErr('');
    try {
      await api('PATCH', `/karyawan/${id}`, body);
      setAksi(null);
      onBerubah();
    } catch (e) {
      setErr(e.message);
    }
  };

  const k = d?.karyawan;
  const baris = (label, isi) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: '1px solid #e4e4e7' }}>
      <span className="adm-redup">{label}</span>
      <b style={{ textAlign: 'right', overflowWrap: 'anywhere' }}>{isi || '-'}</b>
    </div>
  );
  // 7 hari terakhir (termasuk hari ini) - hari yang nggak dicatat ditampilkan kosong, bukan dianggap alpa.
  const tujuh = useMemo(() => {
    const peta = Object.fromEntries((d?.tujuhHari || []).map((h) => [h.tanggal, h]));
    const hasil = [];
    for (let i = 6; i >= 0; i--) {
      const t = new Date(Date.now() + 7 * 3600000 - i * 86400000).toISOString().slice(0, 10);
      hasil.push({ t, h: peta[t] });
    }
    return hasil;
  }, [d]);

  return (
    <>
      <div className="adm-latar" style={{ padding: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onTutup()} />
      <aside className="adm-laci" role="dialog" aria-modal="true" aria-label="Profil karyawan" style={{ width: 'min(540px, 100%)' }}>
        <div className="adm-modal-kepala">
          <h2 className="adm-mono">{k ? `Profil · ${k.nik}` : 'Profil karyawan'}</h2>
          <button className="adm-tutup" onClick={onTutup} aria-label="Tutup">
            ×
          </button>
        </div>
        {!d ? (
          error ? <p className="adm-error">{error}</p> : <Memuat apa="profil" />
        ) : (
          <>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span className="adm-inisial" style={{ width: 56, height: 56, fontSize: 24 }} aria-hidden="true">
                {k.nama[0]?.toUpperCase()}
              </span>
              <div>
                <h3 style={{ fontSize: 22, margin: 0 }}>{k.nama}</h3>
                <div className="adm-redup">{[k.jabatan, k.departemen].filter(Boolean).join(' · ') || 'Jabatan belum diisi'}</div>
                <span className={`adm-chip ${STATUS_KARYAWAN[k.status].warna}`}>{STATUS_KARYAWAN[k.status].nama}</span> <span className="adm-chip">{TIPE[k.tipe]}</span>
                {k.orang_id && <span className="adm-chip biru" style={{ marginLeft: 4 }}>Dari rekrutmen</span>}
              </div>
            </div>

            <div className="adm-angka" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', marginTop: 16, marginBottom: 16 }}>
              <div className="adm-kartu adm-angka-item">
                <span className="adm-label">Hari ini</span>
                <span>{k.status === 'aktif' ? <ChipHadir k={k} /> : '-'}</span>
              </div>
              <div className="adm-kartu adm-angka-item">
                <span className="adm-label">Masa kerja</span>
                <b style={{ fontSize: 18 }}>{masaKerja(k.tanggal_masuk)}</b>
              </div>
              <div className="adm-kartu adm-angka-item">
                <span className="adm-label">Sisa cuti tahunan</span>
                <b className="p-num" style={{ fontSize: 18 }}>
                  {d.sisaCuti} dari {k.jatah_cuti} hari
                </b>
              </div>
              <div className="adm-kartu adm-angka-item">
                <span className="adm-label">Kehadiran 30 hari</span>
                <b className="p-num" style={{ fontSize: 18 }}>
                  {d.tingkatKehadiran == null ? 'Belum ada catatan' : `${d.tingkatKehadiran}%`}
                </b>
                {d.tingkatKehadiran != null && <span className="adm-redup">dari hari yang dicatat</span>}
              </div>
            </div>

            <span className="adm-label">Kehadiran 7 hari terakhir</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4, margin: '8px 0 18px' }}>
              {tujuh.map(({ t, h }) => (
                <div key={t} title={h ? HADIR[h.status].nama : 'Belum dicatat'} style={{ textAlign: 'center' }}>
                  <div className="adm-redup" style={{ fontSize: 11 }}>
                    {new Date(t + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'short' })}
                  </div>
                  <div
                    className={`adm-chip ${h ? HADIR[h.status].warna : ''}`}
                    style={{ display: 'block', padding: '6px 0', fontSize: 10, borderStyle: h ? 'solid' : 'dashed', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  >
                    {h ? HADIR[h.status].nama : '–'}
                  </div>
                </div>
              ))}
            </div>

            <span className="adm-label">Data kepegawaian</span>
            <div style={{ margin: '6px 0 18px' }}>
              {baris('Tanggal masuk', tgl(k.tanggal_masuk))}
              {k.kontrak_selesai && baris('Kontrak selesai', tgl(k.kontrak_selesai))}
              {baris('Atasan', k.atasan_nama)}
              {baris('Lokasi', k.lokasi)}
              {baris('Telepon', tampilHp(k.no_hp))}
              {baris('Email', k.email)}
              {baris('NPWP', k.npwp)}
              {baris('BPJS Kesehatan', k.bpjs_kesehatan)}
              {baris('Rekening', k.rekening ? `${k.bank || ''} ${k.rekening}`.trim() : '')}
              {k.status === 'keluar' && baris('Keluar', `${tgl(k.tanggal_keluar)} · ${k.alasan_keluar}`)}
            </div>

            <span className="adm-label">Kompensasi per bulan</span>
            <div style={{ margin: '6px 0 18px' }}>
              {baris('Gaji pokok', rupiah(k.gaji_pokok))}
              {baris('Tunjangan transport', rupiah(k.tunjangan_transport))}
              {baris('Tunjangan makan', rupiah(k.tunjangan_makan))}
              {baris('Total', rupiah(k.gaji_pokok + k.tunjangan_transport + k.tunjangan_makan))}
            </div>

            {d.payroll.length > 0 && (
              <>
                <span className="adm-label">Payroll terakhir</span>
                <div style={{ margin: '6px 0 18px' }}>{d.payroll.map((p) => baris(bulanLabel(p.periode, true), `${rupiah(p.total)} · ${p.status === 'dibayar' ? 'Dibayar' : 'Draf'}`))}</div>
              </>
            )}
            {d.cuti.length > 0 && (
              <>
                <span className="adm-label">Riwayat cuti & izin</span>
                <div style={{ margin: '6px 0 18px' }}>
                  {d.cuti.map((c) =>
                    baris(`${JENIS_CUTI[c.jenis]} · ${c.hari} hari`, <span className={`adm-chip ${STATUS_CUTI[c.status].warna}`}>{STATUS_CUTI[c.status].nama}</span>)
                  )}
                </div>
              </>
            )}
            {k.catatan && <p className="adm-redup">Catatan: {k.catatan}</p>}

            {err && <p className="adm-error">{err}</p>}
            {aksi === 'keluar' ? (
              <FormKeluar onBatal={() => setAksi(null)} onSimpan={(b) => ubahStatus({ status: 'keluar', ...b })} />
            ) : (
              <div className="adm-tombol">
                <button className="btn utama" onClick={() => onEdit(k)}>
                  Ubah data
                </button>
                {k.status === 'aktif' ? (
                  <button className="btn" onClick={() => ubahStatus({ status: 'nonaktif' })}>
                    Nonaktifkan
                  </button>
                ) : (
                  <button className="btn" onClick={() => ubahStatus({ status: 'aktif' })}>
                    Aktifkan lagi
                  </button>
                )}
                {k.status !== 'keluar' && (
                  <button className="btn bahaya" onClick={() => setAksi('keluar')}>
                    Tandai keluar
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </aside>
    </>
  );
}

function FormKeluar({ onBatal, onSimpan }) {
  const [alasan, setAlasan] = useState('');
  const [tanggal, setTanggal] = useState(hariIniWib());
  return (
    <div className="adm-kartu" style={{ marginTop: 12 }}>
      <div className="field">
        <label htmlFor="kr-keluar-tgl">Tanggal keluar</label>
        <input id="kr-keluar-tgl" type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="kr-keluar-alasan">Alasan (wajib)</label>
        <input id="kr-keluar-alasan" value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="Resign, kontrak selesai, …" autoFocus />
      </div>
      <div className="adm-tombol">
        <button className="btn" onClick={onBatal}>
          Batal
        </button>
        <button className="btn bahaya" disabled={!alasan.trim()} onClick={() => onSimpan({ alasan_keluar: alasan, tanggal_keluar: tanggal })}>
          Simpan status keluar
        </button>
      </div>
    </div>
  );
}

// ---------------- Kehadiran ----------------
function Kehadiran({ api, onBerubah }) {
  const [mode, setMode] = useState('harian');
  return (
    <>
      <div className="adm-toggle-tampil" role="group" aria-label="Tampilan kehadiran" style={{ display: 'inline-flex', marginBottom: 14 }}>
        {[
          ['harian', 'Catat harian'],
          ['rekap', 'Rekap bulanan'],
        ].map(([v, n]) => (
          <button key={v} className={mode === v ? 'on' : ''} onClick={() => setMode(v)} aria-pressed={mode === v}>
            {n}
          </button>
        ))}
      </div>
      {mode === 'harian' ? <KehadiranHarian api={api} onBerubah={onBerubah} /> : <Rekap api={api} />}
    </>
  );
}

function KehadiranHarian({ api, onBerubah }) {
  const [tanggal, setTanggal] = useState(hariIniWib());
  const { data, error, muat } = useData(api, `/karyawan-kehadiran?tanggal=${tanggal}`);
  const [isi, setIsi] = useState({});
  const [pesan, setPesan] = useState('');
  const [sibuk, setSibuk] = useState(false);
  useEffect(() => {
    if (!data) return;
    setIsi(Object.fromEntries(data.baris.map((b) => [b.id, { status: b.status || '', jam_masuk: jam(b.jam_masuk), catatan: b.catatan || '', dariCuti: Boolean(b.cuti_id) }])));
  }, [data]);
  const ubah = (id, k, v) => setIsi((x) => ({ ...x, [id]: { ...x[id], [k]: v } }));

  if (error) return <Gagal apa="kehadiran" pesan={error} onUlang={muat} />;
  const baris = data?.baris || [];
  const tercatat = baris.filter((b) => isi[b.id]?.status).length;

  return (
    <>
      <section className="adm-kartu" style={{ marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="kr-tgl">Tanggal</label>
          <input id="kr-tgl" type="date" value={tanggal} max={hariIniWib()} onChange={(e) => e.target.value && setTanggal(e.target.value)} />
        </div>
        <span className="adm-redup" style={{ marginRight: 'auto' }}>
          {data ? `${tercatat} dari ${baris.length} karyawan tercatat` : ''}
        </span>
        <button
          className="btn"
          disabled={!baris.length}
          onClick={() => setIsi((x) => Object.fromEntries(Object.entries(x).map(([id, v]) => [id, v.status ? v : { ...v, status: 'hadir' }])))}
        >
          Sisanya hadir
        </button>
        <button
          className="btn utama"
          disabled={sibuk || !baris.length}
          onClick={async () => {
            setSibuk(true);
            setPesan('');
            try {
              const h = await api('PUT', '/karyawan-kehadiran', { tanggal, baris: Object.entries(isi).filter(([, v]) => !v.dariCuti).map(([karyawan_id, v]) => ({ karyawan_id, ...v })) });
              setPesan(`Kehadiran ${tgl(tanggal)} disimpan (${h.n} karyawan).`);
              muat();
              onBerubah();
            } catch (e) {
              setPesan('Gagal: ' + e.message);
            }
            setSibuk(false);
          }}
        >
          {sibuk ? 'Menyimpan…' : 'Simpan kehadiran'}
        </button>
      </section>
      {pesan && (
        <p className={pesan.startsWith('Gagal') ? 'adm-error' : 'adm-ok'} role="status">
          {pesan}
        </p>
      )}
      {!data ? (
        <Memuat apa="kehadiran" />
      ) : baris.length === 0 ? (
        <Kosong judul="Belum ada karyawan aktif di tanggal ini">Karyawan muncul di sini mulai tanggal masuknya.</Kosong>
      ) : (
        <div className="adm-gulir">
          <table className="adm-tabel">
            <thead>
              <tr>
                <th>Karyawan</th>
                <th>Status</th>
                <th>Jam masuk</th>
                <th>Catatan</th>
              </tr>
            </thead>
            <tbody>
              {baris.map((b) => {
                const v = isi[b.id] || {};
                return (
                  <tr key={b.id}>
                    <td>
                      <b>{b.nama}</b>
                      <div className="adm-redup">
                        {b.nik} · {b.departemen || b.jabatan || '-'}
                      </div>
                    </td>
                    <td>
                      {v.dariCuti ? (
                        <span className={`adm-chip ${HADIR[v.status]?.warna}`} title="Dari pengajuan cuti/izin yang disetujui">
                          {HADIR[v.status]?.nama} · dari pengajuan
                        </span>
                      ) : (
                        <select value={v.status || ''} onChange={(e) => ubah(b.id, 'status', e.target.value)} aria-label={`Status kehadiran ${b.nama}`}>
                          <option value="">Belum dicatat</option>
                          {Object.entries(HADIR).map(([id, h]) => (
                            <option key={id} value={id}>
                              {h.nama}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>
                      {['hadir', 'terlambat'].includes(v.status) && !v.dariCuti ? (
                        <input type="time" value={v.jam_masuk || ''} onChange={(e) => ubah(b.id, 'jam_masuk', e.target.value)} aria-label={`Jam masuk ${b.nama}`} style={{ maxWidth: 130 }} />
                      ) : (
                        <span className="adm-redup">-</span>
                      )}
                    </td>
                    <td>
                      {v.dariCuti ? (
                        <span className="adm-redup">{v.catatan}</span>
                      ) : (
                        <input value={v.catatan || ''} onChange={(e) => ubah(b.id, 'catatan', e.target.value)} aria-label={`Catatan ${b.nama}`} placeholder="Opsional" maxLength={200} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Rekap({ api }) {
  const [bulan, setBulan] = useState(hariIniWib().slice(0, 7));
  const { data, error, muat } = useData(api, `/karyawan-kehadiran/rekap?bulan=${bulan}`);
  if (error) return <Gagal apa="rekap" pesan={error} onUlang={muat} />;
  const kolom = Object.keys(HADIR);
  return (
    <>
      <section className="adm-kartu" style={{ marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="kr-bulan">Bulan</label>
          <input id="kr-bulan" type="month" value={bulan} onChange={(e) => e.target.value && setBulan(e.target.value)} />
        </div>
        <span className="adm-redup" style={{ marginRight: 'auto' }}>
          Jumlah hari per status. Hari yang belum dicatat nggak dihitung.
        </span>
        <button
          className="btn"
          disabled={!data?.baris.length}
          onClick={() => unduhCsv(`kehadiran-${bulan}.csv`, ['NIK', 'Nama', ...kolom.map((s) => HADIR[s].nama)], data.baris.map((b) => [b.nik, b.nama, ...kolom.map((s) => b.status[s] || 0)]))}
        >
          Ekspor
        </button>
      </section>
      {!data ? (
        <Memuat apa="rekap" />
      ) : data.baris.length === 0 ? (
        <Kosong judul="Belum ada karyawan aktif">Tambah karyawan dulu di tab Daftar karyawan.</Kosong>
      ) : (
        <div className="adm-gulir">
          <table className="adm-tabel">
            <thead>
              <tr>
                <th>Karyawan</th>
                {kolom.map((s) => (
                  <th key={s} className="kanan">
                    {HADIR[s].nama}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.baris.map((b) => (
                <tr key={b.id}>
                  <td>
                    <b>{b.nama}</b>
                    <div className="adm-redup">{b.nik}</div>
                  </td>
                  {kolom.map((s) => (
                    <td key={s} className="kanan p-num" style={b.status[s] && s === 'alpa' ? { color: 'var(--merah)', fontWeight: 700 } : undefined}>
                      {b.status[s] || <span className="adm-redup">0</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ---------------- Cuti & izin ----------------
function Cuti({ api, versi, onBerubah }) {
  const [status, setStatus] = useState('semua');
  const [v, setV] = useState(0);
  const { data, error, muat } = useData(api, `/karyawan-cuti?status=${status}&v=${versi}-${v}`);
  const [ajukan, setAjukan] = useState(false);
  const [tolak, setTolak] = useState(null);
  const [pesan, setPesan] = useState('');

  const putus = async (c, keputusan, catatan) => {
    setPesan('');
    try {
      await api('POST', `/karyawan-cuti/${c.id}/putus`, { keputusan, catatan });
      setPesan(keputusan === 'disetujui' ? `Pengajuan ${c.nama} disetujui. Kehadiran ${c.hari} hari kerjanya otomatis keisi.` : `Pengajuan ${c.nama} ditolak.`);
      setTolak(null);
      setV((x) => x + 1);
      onBerubah();
    } catch (e) {
      setPesan('Gagal: ' + e.message);
    }
  };

  if (error) return <Gagal apa="pengajuan cuti" pesan={error} onUlang={muat} />;
  return (
    <>
      <section className="adm-kartu" style={{ marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter status pengajuan">
          <option value="semua">Semua pengajuan</option>
          <option value="menunggu">Menunggu persetujuan</option>
          <option value="disetujui">Disetujui</option>
          <option value="ditolak">Ditolak</option>
        </select>
        <span className="adm-redup" style={{ marginRight: 'auto' }}>
          Lama cuti dihitung hari kerja (Senin-Jumat).
        </span>
        <button className="btn utama" onClick={() => setAjukan(true)}>
          + Catat pengajuan
        </button>
      </section>
      {pesan && (
        <p className={pesan.startsWith('Gagal') ? 'adm-error' : 'adm-ok'} role="status">
          {pesan}
        </p>
      )}
      {!data ? (
        <Memuat apa="pengajuan" />
      ) : data.length === 0 ? (
        <Kosong judul={status === 'semua' ? 'Belum ada pengajuan cuti atau izin' : 'Nggak ada pengajuan dengan status ini'}>Catat pengajuan dari karyawan pakai tombol di atas.</Kosong>
      ) : (
        <div className="adm-gulir">
          <table className="adm-tabel">
            <thead>
              <tr>
                <th>Karyawan</th>
                <th>Jenis</th>
                <th>Tanggal</th>
                <th className="kanan">Hari</th>
                <th>Alasan</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id}>
                  <td>
                    <b>{c.nama}</b>
                    <div className="adm-redup">{c.nik}</div>
                  </td>
                  <td>{JENIS_CUTI[c.jenis]}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{c.mulai === c.selesai ? tgl(c.mulai) : `${tgl(c.mulai)} – ${tgl(c.selesai)}`}</td>
                  <td className="kanan p-num">{c.hari}</td>
                  <td>{c.alasan || <span className="adm-redup">-</span>}</td>
                  <td>
                    <span className={`adm-chip ${STATUS_CUTI[c.status].warna}`}>{STATUS_CUTI[c.status].nama}</span>
                    {c.diputus_oleh && <div className="adm-redup">oleh {c.diputus_oleh}</div>}
                    {c.catatan_keputusan && <div className="adm-redup">{c.catatan_keputusan}</div>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {c.status === 'menunggu' && (
                      <>
                        <button className="btn kecil utama" onClick={() => putus(c, 'disetujui')}>
                          Setujui
                        </button>{' '}
                        <button className="btn kecil bahaya" onClick={() => setTolak(c)}>
                          Tolak
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {ajukan && (
        <FormCuti
          api={api}
          onTutup={() => setAjukan(false)}
          onSelesai={() => {
            setAjukan(false);
            setPesan('Pengajuan dicatat, statusnya menunggu persetujuan.');
            setV((x) => x + 1);
            onBerubah();
          }}
        />
      )}
      {tolak && <TolakCuti c={tolak} onTutup={() => setTolak(null)} onTolak={(alasan) => putus(tolak, 'ditolak', alasan)} />}
    </>
  );
}

function TolakCuti({ c, onTutup, onTolak }) {
  const [alasan, setAlasan] = useState('');
  return (
    <Modal judul={`Tolak pengajuan ${c.nama}`} onTutup={onTutup}>
      <div className="field">
        <label htmlFor="kr-tolak">Alasan penolakan (wajib)</label>
        <input id="kr-tolak" value={alasan} onChange={(e) => setAlasan(e.target.value)} maxLength={300} />
      </div>
      <div className="adm-tombol" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onTutup}>
          Batal
        </button>
        <button className="btn bahaya" disabled={!alasan.trim()} onClick={() => onTolak(alasan)}>
          Tolak pengajuan
        </button>
      </div>
    </Modal>
  );
}

function FormCuti({ api, onTutup, onSelesai }) {
  const { data } = useData(api, '/karyawan?status=aktif');
  const [isi, setIsi] = useState({ karyawan_id: '', jenis: 'cuti_tahunan', mulai: hariIniWib(), selesai: hariIniWib(), alasan: '' });
  const [error, setError] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const ubah = (k) => (e) => setIsi((x) => ({ ...x, [k]: e.target.value }));
  const gaya = { maxWidth: 'none', width: '100%', minHeight: 44 };
  return (
    <Modal judul="Catat pengajuan cuti / izin" onTutup={onTutup}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          setSibuk(true);
          try {
            await api('POST', '/karyawan-cuti', isi);
            onSelesai();
          } catch (err) {
            setError(err.message);
            setSibuk(false);
          }
        }}
      >
        <div className="field">
          <label htmlFor="kc-karyawan">Karyawan</label>
          <select id="kc-karyawan" value={isi.karyawan_id} onChange={ubah('karyawan_id')} required style={gaya}>
            <option value="">{data ? 'Pilih karyawan' : 'Memuat…'}</option>
            {(data?.karyawan || []).map((k) => (
              <option key={k.id} value={k.id}>
                {k.nama} · {k.nik}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="kc-jenis">Jenis</label>
          <select id="kc-jenis" value={isi.jenis} onChange={ubah('jenis')} style={gaya}>
            {Object.entries(JENIS_CUTI).map(([id, n]) => (
              <option key={id} value={id}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="adm-baris" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <div className="field">
            <label htmlFor="kc-mulai">Mulai</label>
            <input id="kc-mulai" type="date" value={isi.mulai} onChange={ubah('mulai')} required />
          </div>
          <div className="field">
            <label htmlFor="kc-selesai">Sampai</label>
            <input id="kc-selesai" type="date" value={isi.selesai} min={isi.mulai} onChange={ubah('selesai')} required />
          </div>
        </div>
        <div className="field">
          <label htmlFor="kc-alasan">Alasan</label>
          <input id="kc-alasan" value={isi.alasan} onChange={ubah('alasan')} maxLength={300} />
        </div>
        {error && <p className="adm-error">{error}</p>}
        <div className="adm-tombol" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="btn" onClick={onTutup}>
            Batal
          </button>
          <button type="submit" className="btn utama" disabled={sibuk || !isi.karyawan_id}>
            {sibuk ? 'Menyimpan…' : 'Catat pengajuan'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------- Payroll ----------------
function Payroll({ api, onBerubah }) {
  const [periode, setPeriode] = useState(hariIniWib().slice(0, 7));
  const { data, error, muat } = useData(api, `/karyawan-payroll?periode=${periode}`);
  const [pesan, setPesan] = useState('');
  const [edit, setEdit] = useState(null); // { id, potongan, catatan }

  const jalan = async (fn, ok) => {
    setPesan('');
    try {
      const h = await fn();
      setPesan(typeof ok === 'function' ? ok(h) : ok);
      muat();
      onBerubah();
    } catch (e) {
      setPesan('Gagal: ' + e.message);
    }
  };

  if (error) return <Gagal apa="payroll" pesan={error} onUlang={muat} />;
  const baris = data?.baris || [];
  const total = baris.reduce((a, p) => a + p.total, 0);
  const dibayar = baris.filter((p) => p.status === 'dibayar');

  return (
    <>
      <section className="adm-kartu" style={{ marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="kr-periode">Periode</label>
          <input id="kr-periode" type="month" value={periode} onChange={(e) => e.target.value && setPeriode(e.target.value)} />
        </div>
        <span className="adm-redup" style={{ marginRight: 'auto' }}>
          {data && baris.length ? `Total ${rupiah(total)} · ${dibayar.length}/${baris.length} dibayar` : ''}
        </span>
        {data?.belumMasuk > 0 && (
          <button className="btn utama" onClick={() => jalan(() => api('POST', '/karyawan-payroll/draf', { periode }), (h) => `${h.n} baris draf dibuat dari gaji & tunjangan yang berlaku.`)}>
            {baris.length ? `Tambah ${data.belumMasuk} karyawan ke draf` : 'Buat draf payroll'}
          </button>
        )}
        <button
          className="btn"
          disabled={!baris.length}
          onClick={() =>
            unduhCsv(
              `payroll-${periode}.csv`,
              ['NIK', 'Nama', 'Jabatan', 'Bank', 'Rekening', 'Gaji pokok', 'Tunjangan', 'Potongan', 'Total', 'Status', 'Catatan'],
              baris.map((p) => [p.nik, p.nama, p.jabatan, p.bank, p.rekening, p.gaji_pokok, p.tunjangan, p.potongan, p.total, p.status, p.catatan])
            )
          }
        >
          Ekspor
        </button>
      </section>
      {pesan && (
        <p className={pesan.startsWith('Gagal') ? 'adm-error' : 'adm-ok'} role="status">
          {pesan}
        </p>
      )}
      {!data ? (
        <Memuat apa="payroll" />
      ) : baris.length === 0 ? (
        <Kosong judul={`Belum ada payroll ${bulanLabel(periode, true)}`}>
          {data.belumMasuk ? 'Buat draf: gaji pokok & tunjangan diambil dari data karyawan, potongan diisi manual per orang.' : 'Belum ada karyawan aktif.'}
        </Kosong>
      ) : (
        <div className="adm-gulir">
          <table className="adm-tabel">
            <thead>
              <tr>
                <th>Karyawan</th>
                <th className="kanan">Gaji pokok</th>
                <th className="kanan">Tunjangan</th>
                <th className="kanan">Potongan</th>
                <th className="kanan">Total</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {baris.map((p) => (
                <tr key={p.id}>
                  <td>
                    <b>{p.nama}</b>
                    <div className="adm-redup">
                      {p.nik} · {p.rekening ? `${p.bank || ''} ${p.rekening}` : 'Rekening belum diisi'}
                    </div>
                    {p.alpa > 0 && <div style={{ color: 'var(--merah)', fontSize: 13, fontWeight: 700 }}>{p.alpa} hari alpa bulan ini</div>}
                  </td>
                  <td className="kanan p-num">{rupiah(p.gaji_pokok)}</td>
                  <td className="kanan p-num">{rupiah(p.tunjangan)}</td>
                  <td className="kanan p-num">
                    {edit?.id === p.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                        <input type="number" min={0} value={edit.potongan} onChange={(e) => setEdit({ ...edit, potongan: e.target.value })} aria-label="Potongan" style={{ maxWidth: 130 }} autoFocus />
                        <input value={edit.catatan} onChange={(e) => setEdit({ ...edit, catatan: e.target.value })} aria-label="Catatan potongan" placeholder="Keterangan" style={{ maxWidth: 160 }} />
                      </div>
                    ) : (
                      <>
                        {p.potongan ? `-${rupiah(p.potongan)}` : <span className="adm-redup">Rp 0</span>}
                        {p.catatan && <div className="adm-redup">{p.catatan}</div>}
                      </>
                    )}
                  </td>
                  <td className="kanan p-num">
                    <b>{rupiah(p.total)}</b>
                  </td>
                  <td>
                    <span className={`adm-chip ${p.status === 'dibayar' ? 'hijau' : 'kuning'}`}>{p.status === 'dibayar' ? 'Dibayar' : 'Draf'}</span>
                    {p.dibayar_oleh && <div className="adm-redup">oleh {p.dibayar_oleh}</div>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {p.status === 'draf' &&
                      (edit?.id === p.id ? (
                        <>
                          <button className="btn kecil utama" onClick={() => jalan(() => api('PATCH', `/karyawan-payroll/${p.id}`, edit), `Potongan ${p.nama} disimpan.`).then(() => setEdit(null))}>
                            Simpan
                          </button>{' '}
                          <button className="btn kecil" onClick={() => setEdit(null)}>
                            Batal
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="btn kecil" onClick={() => setEdit({ id: p.id, potongan: p.potongan, catatan: p.catatan || '' })}>
                            Potongan
                          </button>{' '}
                          <button
                            className="btn kecil utama"
                            onClick={() => window.confirm(`Tandai gaji ${p.nama} ${rupiah(p.total)} udah dibayar? Setelah ini nilainya nggak bisa diubah.`) && jalan(() => api('PATCH', `/karyawan-payroll/${p.id}`, { status: 'dibayar' }), `Gaji ${p.nama} ditandai dibayar.`)}
                          >
                            Tandai dibayar
                          </button>
                        </>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="adm-redup">Gaji pokok & tunjangan dikunci saat draf dibuat. Kalau gaji diubah setelah itu, baris draf bulan ini nggak ikut berubah. Komisi Sales Partner belum masuk sini.</p>
    </>
  );
}

// ---------------- Struktur organisasi ----------------
function Struktur({ api, versi, onBuka }) {
  const { data, error, muat } = useData(api, `/karyawan?status=aktif&v=${versi}`);
  if (error) return <Gagal apa="struktur" pesan={error} onUlang={muat} />;
  if (!data) return <Memuat apa="struktur" />;
  const semua = data.karyawan;
  if (!semua.length) return <Kosong judul="Belum ada karyawan aktif">Struktur disusun dari kolom "atasan langsung" tiap karyawan.</Kosong>;
  const ids = new Set(semua.map((k) => k.id));
  const anak = {};
  for (const k of semua) {
    const a = k.atasan_id && ids.has(k.atasan_id) ? k.atasan_id : 'akar';
    (anak[a] = anak[a] || []).push(k);
  }
  const sudah = new Set();
  const cabang = (k, dalam) => {
    if (sudah.has(k.id) || dalam > 12) return null; // jaga-jaga kalau ada atasan melingkar
    sudah.add(k.id);
    return (
      <li key={k.id}>
        <button className="adm-kartu adm-saring" onClick={() => onBuka(k.id)} style={{ display: 'inline-flex', gap: 10, alignItems: 'center', padding: '8px 12px', textAlign: 'left', margin: '4px 0' }}>
          <span className="adm-inisial" aria-hidden="true">
            {k.nama[0]?.toUpperCase()}
          </span>
          <span>
            <b>{k.nama}</b>
            <span className="adm-redup" style={{ display: 'block' }}>
              {[k.jabatan, k.departemen].filter(Boolean).join(' · ') || 'Jabatan belum diisi'}
              {anak[k.id] ? ` · ${anak[k.id].length} bawahan` : ''}
            </span>
          </span>
        </button>
        {anak[k.id] && <ul style={{ listStyle: 'none', margin: 0, paddingLeft: 28, borderLeft: '2px solid var(--hitam)', marginLeft: 18 }}>{anak[k.id].map((x) => cabang(x, dalam + 1))}</ul>}
      </li>
    );
  };
  const akar = anak.akar || [];
  const tanpaAtasan = akar.filter((k) => !anak[k.id]);
  const pimpinan = akar.filter((k) => anak[k.id]);
  return (
    <>
      {pimpinan.length > 0 && <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{pimpinan.map((k) => cabang(k, 0))}</ul>}
      {tanpaAtasan.length > 0 && (
        <>
          <p className="adm-label" style={{ marginTop: 20 }}>
            {pimpinan.length ? 'Belum punya atasan & bawahan' : 'Belum ada yang diatur atasannya'}
          </p>
          <p className="adm-redup" style={{ marginTop: 0 }}>
            Atur "atasan langsung" di data karyawan biar struktur kebentuk.
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 8 }}>{tanpaAtasan.map((k) => cabang(k, 0))}</ul>
        </>
      )}
    </>
  );
}
