import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { rupiah, tgl, waktu } from '../lib/format.js';
import { Gagal, Konfirmasi, Kosong, Memuat, Modal } from '../komponen/Ui.jsx';

// CRM leads (sesuai referensi Leads Management): kartu tahap + total pipeline, toolbar tabel/kanban + filter, tabel
// dengan pilih-banyak & aksi massal, kanban drag & drop, panel inspector di samping, impor CSV & ekspor.
export const TAHAP_CRM = [
  { id: 'awareness', nama: 'Awareness', warna: '', ket: 'Udah kenal, belum nyoba' },
  { id: 'trial', nama: 'Trial 7 hari', warna: 'kuning', ket: 'Lagi nyoba gratis' },
  { id: 'konversi', nama: 'Konversi', warna: 'hijau', ket: 'Udah bayar pertama' },
  { id: 'repeat_order', nama: 'Repeat order', warna: 'biru', ket: 'Perpanjang / beli lagi' },
  { id: 'stuck', nama: 'Stuck', warna: 'merah', ket: 'Macet, perlu didorong' },
];
const namaTahap = (id) => TAHAP_CRM.find((t) => t.id === id) || TAHAP_CRM[0];
const SUMBER = ['Referral', 'Website', 'Instagram', 'WhatsApp', 'Pameran', 'Telepon', 'Cold call', 'Lainnya'];
const FILTER_AWAL = { q: '', status: 'jalan', sumber: '', pemilik: '', nilai: '', periode: '', urut: 'terbaru' };
const NAMA_NILAI = { kecil: '< Rp 10 jt', sedang: 'Rp 10-100 jt', besar: '> Rp 100 jt' };
const NAMA_STATUS = { jalan: 'Masih jalan', menang: 'Menang', gagal: 'Gagal', semua: 'Semua status' };
const hariSejak = (t) => Math.max(0, Math.floor((Date.now() - new Date(t).getTime()) / 86400000));

export default function LeadsCrm({ api, tabs }) {
  const [tampilan, setTampilan] = useState('tabel'); // tabel | kanban
  const [f, setF] = useState(FILTER_AWAL);
  const [cariKetik, setCariKetik] = useState('');
  const [tahap, setTahap] = useState('');
  const [halaman, setHalaman] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [versi, setVersi] = useState(0);
  const [admins, setAdmins] = useState([]);
  const [dipilih, setDipilih] = useState(null); // lead yang dibuka di inspector
  const [centang, setCentang] = useState(() => new Set());
  const [tambah, setTambah] = useState(false);
  const [impor, setImpor] = useState(false);
  const [pesan, setPesan] = useState('');

  const muat = useCallback(() => setVersi((v) => v + 1), []);
  const parameter = useMemo(() => {
    const p = { ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), ...(tahap && { tahap }) };
    return p;
  }, [f, tahap]);

  useEffect(() => {
    let batal = false;
    const p = new URLSearchParams({ ...parameter, ...(tampilan === 'kanban' ? { semua: '1', status: 'jalan' } : { halaman: String(halaman) }) });
    api('GET', `/leads?${p}`)
      .then((d) => {
        if (batal) return;
        setData(d);
        setError('');
      })
      .catch((e) => !batal && setError(e.message));
    return () => {
      batal = true;
    };
  }, [api, parameter, halaman, tampilan, versi]);

  useEffect(() => {
    api('GET', '/admin')
      .then(setAdmins)
      .catch(() => {});
  }, [api]);

  // Filter berubah -> balik ke halaman 1 & kosongin centang.
  const ubahFilter = (k, v) => {
    setF((x) => ({ ...x, [k]: v }));
    setHalaman(1);
    setCentang(new Set());
  };
  const lead = data?.leads.find((l) => l.id === dipilih) || null;
  const totalPipeline = (data?.ringkas || []).reduce((a, r) => a + r.nilai, 0);
  const totalLead = (data?.ringkas || []).reduce((a, r) => a + r.n, 0);

  const chipAktif = [
    f.q && { k: 'q', label: `Cari: ${f.q}` },
    f.status !== 'jalan' && { k: 'status', label: `Status: ${NAMA_STATUS[f.status]}` },
    f.sumber && { k: 'sumber', label: `Sumber: ${f.sumber}` },
    f.pemilik && { k: 'pemilik', label: `Pemilik: ${admins.find((a) => a.id === f.pemilik)?.nama || '-'}` },
    f.nilai && { k: 'nilai', label: `Nilai: ${NAMA_NILAI[f.nilai]}` },
    f.periode && { k: 'periode', label: `Dibuat ${f.periode} hari terakhir` },
    tahap && { k: 'tahap', label: `Tahap: ${namaTahap(tahap).nama}` },
  ].filter(Boolean);
  const hapusChip = (k) => {
    if (k === 'tahap') setTahap('');
    else if (k === 'q') {
      setCariKetik('');
      ubahFilter('q', '');
    } else ubahFilter(k, FILTER_AWAL[k]);
  };

  const ekspor = async (hanyaId) => {
    const p = new URLSearchParams({ ...parameter, semua: '1' });
    const d = await api('GET', `/leads?${p}`);
    const baris = hanyaId ? d.leads.filter((l) => hanyaId.has(l.id)) : d.leads;
    unduhCsv(`leads-${new Date().toISOString().slice(0, 10)}.csv`, baris);
    setPesan(`${baris.length} lead diekspor ke CSV.`);
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        {tabs}
        <div className="adm-tombol" style={{ marginTop: 0, marginBottom: 22 }}>
          <button className="btn" onClick={() => setImpor(true)}>
            Impor CSV
          </button>
          <button className="btn" onClick={() => ekspor(null).catch((e) => setPesan(e.message))} disabled={!data?.total}>
            Ekspor
          </button>
          <button className="btn utama" onClick={() => setTambah(true)}>
            + Tambah lead
          </button>
        </div>
      </div>

      {/* Kartu per tahap (klik = saring) + total pipeline. */}
      <section className="adm-crm-tahap" aria-label="Pipeline per tahap">
        {TAHAP_CRM.map((t, i) => {
          const r = data?.ringkas.find((x) => x.tahap === t.id);
          return (
            <button key={t.id} className={`adm-crm-kartu tahap-${t.id}` + (tahap === t.id ? ' on' : '')} onClick={() => setTahap((x) => (x === t.id ? '' : t.id))} aria-pressed={tahap === t.id}>
              <span className="adm-chip" style={{ alignSelf: 'flex-start', background: '#000', color: '#fff' }}>
                0{i + 1}. {t.nama}
              </span>
              <b className="p-num">{r ? r.n : '…'}</b>
              <span className="adm-label" style={{ fontSize: 10 }}>
                {t.ket}
              </span>
              <span className="p-num" style={{ fontWeight: 700 }}>
                {r ? rupiah(r.nilai) : ''}
              </span>
            </button>
          );
        })}
        <div className="adm-crm-kartu total">
          <span className="adm-label" style={{ fontSize: 11 }}>
            Total pipeline
          </span>
          <b className="p-num">{rupiah(totalPipeline)}</b>
          <span className="adm-redup" style={{ color: '#D4D4D8' }}>
            {totalLead} lead masih jalan
          </span>
        </div>
      </section>

      {/* Toolbar: tampilan, cari, filter, urutan. */}
      <section className="adm-kartu" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="adm-toggle-tampil" role="group" aria-label="Tampilan">
            {['tabel', 'kanban'].map((v) => (
              <button key={v} className={tampilan === v ? 'on' : ''} onClick={() => setTampilan(v)} aria-pressed={tampilan === v}>
                {v}
              </button>
            ))}
          </div>
          <form
            style={{ flex: 1, minWidth: 200, display: 'flex' }}
            onSubmit={(e) => {
              e.preventDefault();
              ubahFilter('q', cariKetik.trim());
            }}
          >
            <input className="adm-input" value={cariKetik} onChange={(e) => setCariKetik(e.target.value)} placeholder="Cari perusahaan, PIC, email, telepon" aria-label="Cari lead" />
          </form>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
          {tampilan === 'tabel' && (
            <select value={f.status} onChange={(e) => ubahFilter('status', e.target.value)} aria-label="Status">
              {Object.entries(NAMA_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  Status: {v}
                </option>
              ))}
            </select>
          )}
          <select value={f.sumber} onChange={(e) => ubahFilter('sumber', e.target.value)} aria-label="Sumber">
            <option value="">Sumber: semua</option>
            {[...new Set([...SUMBER, ...(data?.sumber || [])])].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select value={f.pemilik} onChange={(e) => ubahFilter('pemilik', e.target.value)} aria-label="Pemilik">
            <option value="">Pemilik: semua</option>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nama}
              </option>
            ))}
          </select>
          <select value={f.nilai} onChange={(e) => ubahFilter('nilai', e.target.value)} aria-label="Nilai">
            <option value="">Nilai: semua</option>
            {Object.entries(NAMA_NILAI).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select value={f.periode} onChange={(e) => ubahFilter('periode', e.target.value)} aria-label="Periode dibuat">
            <option value="">Periode: semua</option>
            <option value="7">7 hari</option>
            <option value="30">30 hari</option>
            <option value="90">90 hari</option>
          </select>
          <span className="adm-label" style={{ fontSize: 11, marginLeft: 'auto', border: '2px solid #000', padding: '6px 8px' }}>
            {data ? `${data.total} hasil` : '…'}
          </span>
          {tampilan === 'tabel' && (
            <select value={f.urut} onChange={(e) => ubahFilter('urut', e.target.value)} aria-label="Urutkan">
              <option value="terbaru">Urut: terbaru</option>
              <option value="terlama">Urut: terlama</option>
              <option value="nilai_tinggi">Urut: nilai tertinggi</option>
              <option value="nilai_rendah">Urut: nilai terendah</option>
              <option value="nama">Urut: nama A-Z</option>
            </select>
          )}
        </div>
      </section>

      {chipAktif.length > 0 && (
        <div className="adm-chip-filter">
          <span className="adm-label" style={{ fontSize: 10 }}>
            Filter aktif:
          </span>
          {chipAktif.map((c) => (
            <button key={c.k} className="adm-chip" onClick={() => hapusChip(c.k)} aria-label={`Hapus filter ${c.label}`}>
              {c.label} ×
            </button>
          ))}
          <button
            className="adm-link"
            style={{ fontSize: 12 }}
            onClick={() => {
              setF(FILTER_AWAL);
              setCariKetik('');
              setTahap('');
              setHalaman(1);
            }}
          >
            Hapus semua filter
          </button>
        </div>
      )}

      {pesan && (
        <p className="adm-ok" role="status" style={{ marginBottom: 12 }}>
          {pesan}
        </p>
      )}

      {error ? (
        <Gagal apa="lead CRM" pesan={error} onUlang={muat} />
      ) : !data ? (
        <Memuat apa="lead CRM" />
      ) : tampilan === 'kanban' ? (
        <Kanban
          leads={data.leads}
          onBuka={setDipilih}
          onPindah={async (id, tujuan) => {
            try {
              await api('PATCH', `/leads/${id}`, { tahap: tujuan });
              muat();
            } catch (e) {
              setPesan(e.message);
            }
          }}
        />
      ) : data.leads.length === 0 ? (
        chipAktif.length ? (
          <Kosong
            judul="Belum ada lead yang cocok"
            aksi={
              <div className="adm-tombol" style={{ justifyContent: 'center' }}>
                <button
                  className="btn kecil"
                  onClick={() => {
                    setF(FILTER_AWAL);
                    setCariKetik('');
                    setTahap('');
                  }}
                >
                  Reset filter
                </button>
                <button className="btn kecil utama" onClick={() => setTambah(true)}>
                  + Tambah lead
                </button>
              </div>
            }
          >
            Nggak ada prospek yang cocok sama filter yang dipilih. Ubah kata kunci atau tambah prospek baru.
          </Kosong>
        ) : (
          <Kosong judul="Belum ada lead CRM" aksi={<button className="btn kecil utama" onClick={() => setTambah(true)}>+ Tambah lead pertama</button>}>
            Catat prospek bisnis di sini (perusahaan, PIC, perkiraan nilai deal), atau impor sekaligus dari CSV.
          </Kosong>
        )
      ) : (
        <div className={'adm-crm-isi' + (lead ? ' ada-inspector' : '')}>
          <Tabel
            data={data}
            admins={admins}
            dipilih={dipilih}
            centang={centang}
            setCentang={setCentang}
            onBuka={setDipilih}
            halaman={halaman}
            setHalaman={setHalaman}
            onMassal={async (aksi, nilai) => {
              try {
                const r = await api('POST', '/leads/massal', { ids: [...centang], aksi, nilai });
                setPesan(`${r.n} lead ${aksi === 'hapus' ? 'dihapus' : aksi === 'tahap' ? `dipindah ke ${namaTahap(nilai).nama}` : 'ditugaskan'}.`);
                setCentang(new Set());
                if (aksi === 'hapus' && centang.has(dipilih)) setDipilih(null);
                muat();
              } catch (e) {
                setPesan(e.message);
              }
            }}
            onEkspor={() => ekspor(centang).catch((e) => setPesan(e.message))}
          />
          {lead && <Inspector key={lead.id} api={api} lead={lead} admins={admins} onTutup={() => setDipilih(null)} onBerubah={muat} />}
        </div>
      )}

      {tampilan === 'kanban' && lead && (
        <div className="adm-inspector-laci">
          <Inspector key={lead.id} api={api} lead={lead} admins={admins} onTutup={() => setDipilih(null)} onBerubah={muat} />
        </div>
      )}

      {tambah && (
        <FormLead
          judul="Tambah lead"
          admins={admins}
          onTutup={() => setTambah(false)}
          onSimpan={async (isi) => {
            await api('POST', '/leads', isi);
            setTambah(false);
            setPesan(`Lead ${isi.perusahaan} ditambah.`);
            muat();
          }}
        />
      )}
      {impor && (
        <ModalImpor
          onTutup={() => setImpor(false)}
          onImpor={async (baris) => {
            const r = await api('POST', '/leads/impor', { baris });
            setImpor(false);
            setPesan(`${r.masuk} lead diimpor${r.dilewati ? `, ${r.dilewati} baris dilewati (nama perusahaan kosong)` : ''}.`);
            muat();
          }}
        />
      )}
    </>
  );
}

// ---------------- Tabel ----------------
function Tabel({ data, admins, dipilih, centang, setCentang, onBuka, halaman, setHalaman, onMassal, onEkspor }) {
  const [yakinHapus, setYakinHapus] = useState(false);
  const semuaId = data.leads.map((l) => l.id);
  const semuaDicentang = semuaId.length > 0 && semuaId.every((id) => centang.has(id));
  const toggle = (id) =>
    setCentang((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const jumlahHalaman = Math.max(1, Math.ceil(data.total / data.perHalaman));
  const dari = (halaman - 1) * data.perHalaman + 1;
  const sampai = Math.min(data.total, halaman * data.perHalaman);

  return (
    <div className="adm-gulir" style={{ alignSelf: 'start' }}>
      {centang.size > 0 && (
        <div className="adm-massal" role="region" aria-label="Aksi untuk lead yang dipilih">
          <b>{centang.size} lead dipilih</b>
          <select defaultValue="" onChange={(e) => e.target.value && (onMassal('tahap', e.target.value), (e.target.value = ''))} aria-label="Ubah tahap lead terpilih">
            <option value="">Ubah tahap</option>
            {TAHAP_CRM.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nama}
              </option>
            ))}
          </select>
          <select defaultValue="" onChange={(e) => e.target.value && (onMassal('pemilik', e.target.value), (e.target.value = ''))} aria-label="Tugaskan lead terpilih ke">
            <option value="">Tugaskan ke</option>
            {admins
              .filter((a) => a.aktif)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nama}
                </option>
              ))}
          </select>
          <button className="btn kecil" onClick={onEkspor}>
            Ekspor
          </button>
          <button className="btn kecil bahaya" onClick={() => setYakinHapus(true)}>
            Hapus
          </button>
        </div>
      )}
      <table className="adm-tabel">
        <thead>
          <tr>
            <th style={{ width: 44 }}>
              <input
                type="checkbox"
                className="adm-centang"
                checked={semuaDicentang}
                onChange={() => setCentang(semuaDicentang ? new Set() : new Set(semuaId))}
                aria-label="Pilih semua lead di halaman ini"
              />
            </th>
            <th>ID lead</th>
            <th>Perusahaan / PIC</th>
            <th>Kontak</th>
            <th>Sumber</th>
            <th>Tahap</th>
            <th className="kanan">Nilai est.</th>
          </tr>
        </thead>
        <tbody>
          {data.leads.map((l) => {
            const t = namaTahap(l.tahap);
            return (
              <tr
                key={l.id}
                className={'klik' + (dipilih === l.id ? ' pilih' : '') + (centang.has(l.id) ? ' dicentang' : '')}
                onClick={() => onBuka(l.id)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onBuka(l.id);
                  }
                }}
                tabIndex={0}
                aria-label={`Buka detail ${l.perusahaan}`}
              >
                <td onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" className="adm-centang" checked={centang.has(l.id)} onChange={() => toggle(l.id)} aria-label={`Pilih ${l.perusahaan}`} />
                </td>
                <td className="adm-mono" style={{ whiteSpace: 'nowrap' }}>
                  {l.kode}
                </td>
                <td>
                  <b>{l.perusahaan}</b>
                  <div className="adm-redup">{[l.pic_nama, l.pic_jabatan].filter(Boolean).join(' · ') || '-'}</div>
                </td>
                <td className="adm-mono">
                  <div>{l.email || '-'}</div>
                  <div className="adm-redup">{l.telepon || ''}</div>
                </td>
                <td>{l.sumber ? <span className="adm-chip">{l.sumber}</span> : '-'}</td>
                <td>{l.hasil ? <span className={`adm-chip ${l.hasil === 'menang' ? 'hijau' : 'merah'}`}>{l.hasil}</span> : <span className={`adm-chip ${t.warna}`}>{t.nama}</span>}</td>
                <td className="kanan">
                  <b className="p-num">{rupiah(l.nilai)}</b>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="adm-halaman">
        <span className="adm-label" style={{ fontSize: 11 }}>
          Menampilkan {dari}-{sampai} dari {data.total} lead
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn kecil" onClick={() => setHalaman(halaman - 1)} disabled={halaman <= 1} aria-label="Halaman sebelumnya">
            ‹
          </button>
          {Array.from({ length: jumlahHalaman }, (_, i) => i + 1)
            .filter((n) => n === 1 || n === jumlahHalaman || Math.abs(n - halaman) <= 1)
            .map((n) => (
              <button key={n} className={'btn kecil' + (n === halaman ? ' utama' : '')} onClick={() => setHalaman(n)} aria-current={n === halaman ? 'page' : undefined}>
                {n}
              </button>
            ))}
          <button className="btn kecil" onClick={() => setHalaman(halaman + 1)} disabled={halaman >= jumlahHalaman} aria-label="Halaman berikutnya">
            ›
          </button>
        </div>
      </div>
      {yakinHapus && (
        <Konfirmasi
          judul="Hapus lead terpilih"
          pesan={`Hapus ${centang.size} lead beserta semua catatannya? Ini nggak bisa dibalikin.`}
          onBatal={() => setYakinHapus(false)}
          onYa={async () => {
            await onMassal('hapus');
            setYakinHapus(false);
          }}
        />
      )}
    </div>
  );
}

// ---------------- Kanban ----------------
// Geser kartu antar kolom (drag & drop). Tanpa mouse: buka kartunya (Enter), pindah tahap di inspector.
function Kanban({ leads, onBuka, onPindah }) {
  const [diseret, setDiseret] = useState(null);
  const [atas, setAtas] = useState(null);
  return (
    <div className="adm-kanban">
      {TAHAP_CRM.map((t) => {
        const isi = leads.filter((l) => l.tahap === t.id);
        return (
          <section
            key={t.id}
            className={'adm-kanban-kolom' + (atas === t.id ? ' atas' : '')}
            aria-label={`Kolom ${t.nama}`}
            onDragOver={(e) => {
              e.preventDefault();
              setAtas(t.id);
            }}
            onDragLeave={() => setAtas((x) => (x === t.id ? null : x))}
            onDrop={(e) => {
              e.preventDefault();
              setAtas(null);
              const id = e.dataTransfer.getData('text/plain');
              const l = leads.find((x) => x.id === id);
              if (l && l.tahap !== t.id) onPindah(id, t.id);
              setDiseret(null);
            }}
          >
            <header className={`adm-kanban-kepala tahap-${t.id}`}>
              <span>{t.nama}</span>
              <span className="adm-chip" style={{ background: '#000', color: '#fff' }}>
                {isi.length}
              </span>
            </header>
            <div className="adm-kanban-daftar">
              {atas === t.id && diseret && leads.find((x) => x.id === diseret)?.tahap !== t.id && <div className="adm-kanban-lepas">Lepas lead di sini</div>}
              {isi.length === 0 && atas !== t.id && <p className="adm-redup" style={{ margin: 0, textAlign: 'center' }}>Kosong</p>}
              {isi.map((l) => (
                <article
                  key={l.id}
                  className={'adm-kanban-kartu' + (diseret === l.id ? ' diseret' : '')}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', l.id);
                    e.dataTransfer.effectAllowed = 'move';
                    setDiseret(l.id);
                  }}
                  onDragEnd={() => {
                    setDiseret(null);
                    setAtas(null);
                  }}
                  onClick={() => onBuka(l.id)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onBuka(l.id))}
                  tabIndex={0}
                  aria-label={`${l.perusahaan}, ${rupiah(l.nilai)}. Enter buat buka detail.`}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                    <b>{l.perusahaan}</b>
                    <span className="adm-chip" title="Berapa hari di tahap ini">
                      {hariSejak(l.tahap_sejak)} hari
                    </span>
                  </div>
                  <div className="adm-redup">{l.pic_nama || '-'}</div>
                  <div className="p-num" style={{ fontWeight: 700, margin: '6px 0' }}>
                    {rupiah(l.nilai)}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center' }}>
                    {l.sumber ? <span className="adm-chip">{l.sumber}</span> : <span />}
                    {l.pemilik_nama && (
                      <span className="adm-inisial" style={{ width: 26, height: 26, fontSize: 12 }} title={`Pemilik: ${l.pemilik_nama}`}>
                        {l.pemilik_nama[0].toUpperCase()}
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ---------------- Inspector ----------------
const JENIS_AKTIVITAS = { catatan: 'Catatan', telepon: 'Telepon', meeting: 'Meeting', email: 'Email', tahap: 'Perubahan', kunjungan: 'Kunjungan' };
const WARNA_AKTIVITAS = { tahap: 'ungu', telepon: 'hijau', meeting: 'kuning', email: 'biru', catatan: '', kunjungan: 'oranye' };

function Inspector({ api, lead, admins, onTutup, onBerubah }) {
  const [edit, setEdit] = useState(false);
  const [hapus, setHapus] = useState(false);
  const [error, setError] = useState('');
  const [catatan, setCatatan] = useState('');
  const [jenis, setJenis] = useState('catatan');
  const [aktivitas, setAktivitas] = useState(null);
  const ref = useRef(null);

  const muatAktivitas = useCallback(() => {
    api('GET', `/leads/${lead.id}/aktivitas`)
      .then(setAktivitas)
      .catch((e) => setError(e.message));
  }, [api, lead.id]);

  useEffect(() => {
    muatAktivitas();
    ref.current?.focus();
    // Escape nutup inspector, kecuali lagi ada modal (ubah/hapus) di atasnya.
    const tekan = (e) => e.key === 'Escape' && !document.querySelector('.adm-modal') && onTutup();
    document.addEventListener('keydown', tekan);
    return () => document.removeEventListener('keydown', tekan);
  }, [muatAktivitas, onTutup]);

  const ubah = async (perubahan) => {
    setError('');
    try {
      await api('PATCH', `/leads/${lead.id}`, perubahan);
      onBerubah();
      muatAktivitas();
    } catch (e) {
      setError(e.message);
    }
  };
  const idxTahap = TAHAP_CRM.findIndex((t) => t.id === lead.tahap);
  const telp = (lead.telepon || '').replace(/[^\d+]/g, '');

  return (
    <aside className="adm-inspector" aria-label={`Detail ${lead.perusahaan}`} tabIndex={-1} ref={ref}>
      <div className="adm-modal-kepala" style={{ margin: 0 }}>
        <h2 className="adm-mono" style={{ fontSize: 14 }}>
          {lead.kode}
        </h2>
        <button className="adm-tutup" onClick={onTutup} aria-label="Tutup detail">
          ×
        </button>
      </div>
      <div style={{ padding: 16 }}>
        <span className={`adm-chip ${lead.hasil ? (lead.hasil === 'menang' ? 'hijau' : 'merah') : namaTahap(lead.tahap).warna}`}>
          {lead.hasil ? `Ditutup: ${lead.hasil}` : `Tahap: ${namaTahap(lead.tahap).nama}`}
        </span>
        <h3 style={{ fontSize: 22, margin: '8px 0 12px', textTransform: 'uppercase', letterSpacing: '-.01em' }}>{lead.perusahaan}</h3>
        <div className="adm-kartu" style={{ boxShadow: 'none', padding: 12, display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-end' }}>
          <div>
            <span className="adm-label" style={{ fontSize: 10 }}>
              Estimasi deal
            </span>
            <div className="p-num" style={{ fontSize: 26, fontWeight: 700 }}>
              {rupiah(lead.nilai)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span className="adm-label" style={{ fontSize: 10 }}>
              Pemilik
            </span>
            <div style={{ fontWeight: 700 }}>{lead.pemilik_nama || '-'}</div>
          </div>
        </div>

        {!lead.hasil && (
          <>
            <p className="adm-label" style={{ fontSize: 10, margin: '14px 0 6px' }}>
              Alur pipeline
            </p>
            <div className="adm-tahap" role="group" aria-label="Pindah tahap">
              {TAHAP_CRM.map((t, i) => {
                // Stuck bukan kelanjutan repeat order - kalau lagi stuck, tahap lain nggak dicentang "udah lewat".
                const lewat = lead.tahap !== 'stuck' && t.id !== 'stuck' && i < idxTahap;
                return (
                  <button key={t.id} className={(i === idxTahap ? 'on' : lewat ? 'lewat' : '') + (t.id === 'stuck' ? ' stuck' : '')} onClick={() => i !== idxTahap && ubah({ tahap: t.id })} aria-pressed={i === idxTahap}>
                    {lewat ? '✓ ' : ''}
                    {t.nama}
                  </button>
                );
              })}
            </div>
            <p className="adm-redup" style={{ margin: '6px 0 0' }}>
              Di tahap ini {hariSejak(lead.tahap_sejak)} hari
            </p>
          </>
        )}

        <div className="adm-kartu" style={{ boxShadow: 'none', padding: 12, marginTop: 14 }}>
          <span className="adm-label" style={{ fontSize: 10 }}>
            Informasi PIC
          </span>
          <div style={{ fontWeight: 700, marginTop: 4 }}>{lead.pic_nama || 'PIC belum diisi'}</div>
          {lead.pic_jabatan && <div className="adm-redup">{lead.pic_jabatan}</div>}
          <div className="adm-mono" style={{ marginTop: 8 }}>
            {lead.email || 'Email belum diisi'}
          </div>
          <div className="adm-mono">{lead.telepon || 'Telepon belum diisi'}</div>
          <div className="adm-tombol">
            {telp && (
              <a className="btn kecil" href={`tel:${telp}`}>
                Telepon
              </a>
            )}
            {lead.email && (
              <a className="btn kecil" href={`mailto:${lead.email}`}>
                Kirim email
              </a>
            )}
            <button className="btn kecil" onClick={() => setEdit(true)}>
              Ubah data
            </button>
          </div>
          <p className="adm-redup" style={{ margin: '8px 0 0' }}>
            Sumber {lead.sumber || '-'} · dibuat {tgl(lead.created_at)}
          </p>
        </div>

        {error && <p className="adm-error">{error}</p>}

        <p className="adm-label" style={{ fontSize: 10, margin: '16px 0 6px' }}>
          Riwayat aktivitas & interaksi {aktivitas ? `(${aktivitas.length})` : ''}
        </p>
        {!aktivitas ? (
          <Memuat apa="riwayat" />
        ) : aktivitas.length === 0 ? (
          <p className="adm-redup">Belum ada catatan.</p>
        ) : (
          <div className="adm-riwayat">
            {aktivitas.map((a) => (
              <div key={a.id} className="adm-riwayat-item">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span className={`adm-chip ${WARNA_AKTIVITAS[a.jenis] || ''}`}>{JENIS_AKTIVITAS[a.jenis] || a.jenis}</span>
                  <span className="adm-redup">{waktu(a.created_at)}</span>
                </div>
                <div style={{ whiteSpace: 'pre-wrap', margin: '6px 0 2px' }}>{a.isi}</div>
                <div className="adm-redup">oleh {a.admin_nama || '-'}</div>
              </div>
            ))}
          </div>
        )}

        <form
          className="adm-kartu"
          style={{ boxShadow: 'none', padding: 12, marginTop: 12 }}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!catatan.trim()) return;
            try {
              await api('POST', `/leads/${lead.id}/aktivitas`, { isi: catatan, jenis });
              setCatatan('');
              muatAktivitas();
              onBerubah();
            } catch (err) {
              setError(err.message);
            }
          }}
        >
          <label className="adm-label" htmlFor={`catatan-${lead.id}`} style={{ fontSize: 10 }}>
            Tambah catatan interaksi
          </label>
          <textarea
            id={`catatan-${lead.id}`}
            className="adm-input"
            style={{ marginTop: 6, minHeight: 70, resize: 'vertical' }}
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            placeholder="Tulis catatan aktivitas, follow up, atau kenapa macet"
          />
          <div className="adm-tombol" style={{ justifyContent: 'space-between' }}>
            <select value={jenis} onChange={(e) => setJenis(e.target.value)} aria-label="Jenis catatan">
              {['catatan', 'telepon', 'meeting', 'email'].map((j) => (
                <option key={j} value={j}>
                  {JENIS_AKTIVITAS[j]}
                </option>
              ))}
            </select>
            <button className="btn kecil utama" type="submit" disabled={!catatan.trim()}>
              Simpan catatan
            </button>
          </div>
        </form>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
          {lead.hasil ? (
            <button className="btn" style={{ gridColumn: '1 / -1' }} onClick={() => ubah({ hasil: null })}>
              Buka lagi
            </button>
          ) : (
            <>
              <button className="btn" style={{ background: 'var(--hijau)' }} onClick={() => ubah({ hasil: 'menang' })}>
                Tandai menang
              </button>
              <button className="btn bahaya" onClick={() => ubah({ hasil: 'gagal' })}>
                Tandai gagal
              </button>
            </>
          )}
        </div>
        <button className="adm-link" style={{ marginTop: 14, color: 'var(--merah)' }} onClick={() => setHapus(true)}>
          Hapus lead ini
        </button>
      </div>

      {edit && (
        <FormLead
          judul={`Ubah ${lead.kode}`}
          awal={lead}
          admins={admins}
          onTutup={() => setEdit(false)}
          onSimpan={async (isi) => {
            await api('PATCH', `/leads/${lead.id}`, isi);
            setEdit(false);
            onBerubah();
          }}
        />
      )}
      {hapus && (
        <Konfirmasi
          judul="Hapus lead"
          pesan={`Hapus ${lead.perusahaan} (${lead.kode}) beserta semua catatannya? Ini nggak bisa dibalikin.`}
          onBatal={() => setHapus(false)}
          onYa={async () => {
            try {
              await api('DELETE', `/leads/${lead.id}`);
              setHapus(false);
              onTutup();
              onBerubah();
            } catch (e) {
              setError(e.message);
              setHapus(false);
            }
          }}
        />
      )}
    </aside>
  );
}

// ---------------- Form tambah/ubah ----------------
export function FormLead({ judul, awal = {}, admins, onTutup, onSimpan }) {
  const [isi, setIsi] = useState({
    perusahaan: awal.perusahaan || '',
    pic_nama: awal.pic_nama || '',
    pic_jabatan: awal.pic_jabatan || '',
    email: awal.email || '',
    telepon: awal.telepon || '',
    sumber: awal.sumber || '',
    nilai: awal.nilai ? String(awal.nilai) : '',
    pemilik_id: awal.pemilik_id || '',
  });
  const [error, setError] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const ubah = (k) => (e) => setIsi((x) => ({ ...x, [k]: e.target.value }));
  const field = (k, label, props = {}) => (
    <div className="field">
      <label htmlFor={`lead-${k}`}>{label}</label>
      <input id={`lead-${k}`} value={isi[k]} onChange={ubah(k)} {...props} />
    </div>
  );
  const pilih = { maxWidth: 'none', width: '100%', minHeight: 44 };
  return (
    <Modal judul={judul} onTutup={onTutup}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          setSibuk(true);
          try {
            await onSimpan({ ...isi, nilai: Number(String(isi.nilai).replace(/\D/g, '')) || 0, pemilik_id: isi.pemilik_id || undefined });
          } catch (err) {
            setError(err.message);
            setSibuk(false);
          }
        }}
      >
        {field('perusahaan', 'Perusahaan / nama prospek', { required: true, placeholder: 'Nama perusahaan' })}
        <div className="adm-baris" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          {field('pic_nama', 'Nama PIC', { placeholder: 'Nama orang yang dihubungi' })}
          {field('pic_jabatan', 'Jabatan PIC')}
          {field('email', 'Email', { type: 'email', placeholder: 'email@perusahaan.com' })}
          {field('telepon', 'Telepon / WA', { inputMode: 'tel' })}
          {field('nilai', 'Perkiraan nilai deal (Rp)', { inputMode: 'numeric', placeholder: '0' })}
          <div className="field">
            <label htmlFor="lead-sumber">Sumber</label>
            <select id="lead-sumber" value={isi.sumber} onChange={ubah('sumber')} style={pilih}>
              <option value="">Pilih sumber</option>
              {[...new Set([...SUMBER, ...(isi.sumber ? [isi.sumber] : [])])].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
        {admins.length > 0 && (
          <div className="field">
            <label htmlFor="lead-pemilik">Pemilik lead</label>
            <select id="lead-pemilik" value={isi.pemilik_id} onChange={ubah('pemilik_id')} style={pilih}>
              <option value="">Aku sendiri</option>
              {admins
                .filter((a) => a.aktif)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nama}
                  </option>
                ))}
            </select>
          </div>
        )}
        {error && <p className="adm-error">{error}</p>}
        <div className="adm-tombol" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
          <button type="button" className="btn" onClick={onTutup}>
            Batal
          </button>
          <button type="submit" className="btn utama" disabled={sibuk || !isi.perusahaan.trim()}>
            {sibuk ? 'Menyimpan…' : 'Simpan lead'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------- CSV ----------------
const KOLOM_CSV = ['perusahaan', 'pic_nama', 'pic_jabatan', 'email', 'telepon', 'sumber', 'nilai', 'tahap'];
const ALIAS_KOLOM = { pic: 'pic_nama', nama_pic: 'pic_nama', jabatan: 'pic_jabatan', hp: 'telepon', wa: 'telepon', no_hp: 'telepon', nilai_deal: 'nilai', perusahaan_pic: 'perusahaan', company: 'perusahaan' };

function selCsv(v) {
  const s = v == null ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function unduhCsv(nama, leads) {
  const kepala = ['id_lead', ...KOLOM_CSV, 'hasil', 'pemilik', 'dibuat'];
  const baris = leads.map((l) => [l.kode, l.perusahaan, l.pic_nama, l.pic_jabatan, l.email, l.telepon, l.sumber, l.nilai, l.tahap, l.hasil, l.pemilik_nama, tgl(l.created_at)].map(selCsv).join(','));
  unduh(nama, [kepala.join(','), ...baris].join('\n'));
}

function unduh(nama, isi) {
  const url = URL.createObjectURL(new Blob(['﻿' + isi], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nama;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Parser CSV sederhana: dukung tanda kutip, koma/titik-koma, baris baru di dalam kutip.
function parseCsv(teks) {
  const pemisah = (teks.split('\n')[0].match(/;/g) || []).length > (teks.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const hasil = [];
  let baris = [];
  let sel = '';
  let kutip = false;
  for (let i = 0; i < teks.length; i++) {
    const c = teks[i];
    if (kutip) {
      if (c === '"' && teks[i + 1] === '"') {
        sel += '"';
        i++;
      } else if (c === '"') kutip = false;
      else sel += c;
    } else if (c === '"') kutip = true;
    else if (c === pemisah) {
      baris.push(sel);
      sel = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && teks[i + 1] === '\n') i++;
      baris.push(sel);
      if (baris.some((x) => x.trim())) hasil.push(baris);
      baris = [];
      sel = '';
    } else sel += c;
  }
  baris.push(sel);
  if (baris.some((x) => x.trim())) hasil.push(baris);
  return hasil;
}

function ModalImpor({ onTutup, onImpor }) {
  const [baris, setBaris] = useState(null);
  const [error, setError] = useState('');
  const [sibuk, setSibuk] = useState(false);

  const baca = (file) => {
    setError('');
    const r = new FileReader();
    r.onload = () => {
      const data = parseCsv(String(r.result).replace(/^﻿/, ''));
      if (data.length < 2) return setError('File-nya kosong atau cuma ada judul kolom.');
      const kepala = data[0].map((h) => {
        const k = h.trim().toLowerCase().replace(/[^a-z_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
        return ALIAS_KOLOM[k] || k;
      });
      if (!kepala.includes('perusahaan')) return setError('Kolom "perusahaan" nggak ketemu. Pakai templat di bawah.');
      setBaris(data.slice(1).map((b) => Object.fromEntries(kepala.map((k, i) => [k, (b[i] || '').trim()]))));
    };
    r.readAsText(file);
  };

  return (
    <Modal judul="Impor lead dari CSV" onTutup={onTutup}>
      <p style={{ marginTop: 0 }}>
        Kolom yang dibaca: <span className="adm-mono">{KOLOM_CSV.join(', ')}</span>. Cuma "perusahaan" yang wajib. Maksimal 500 baris sekali impor.
      </p>
      <button className="adm-link" onClick={() => unduh('templat-lead.csv', KOLOM_CSV.join(',') + '\nContoh PT,Nama PIC,Manager,email@contoh.com,0812xxxx,Referral,15000000,awareness')}>
        Unduh templat CSV
      </button>
      <label className="adm-unggah">
        <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files[0] && baca(e.target.files[0])} />
        <b>Pilih file CSV</b>
        <span className="adm-redup">Bisa dari Excel / Google Sheets (Simpan sebagai CSV)</span>
      </label>
      {baris && (
        <p className="adm-ok">
          {baris.length} baris kebaca, {baris.filter((b) => b.perusahaan).length} punya nama perusahaan.
        </p>
      )}
      {error && <p className="adm-error">{error}</p>}
      <div className="adm-tombol" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
        <button className="btn" onClick={onTutup}>
          Batal
        </button>
        <button
          className="btn utama"
          disabled={sibuk || !baris?.some((b) => b.perusahaan)}
          onClick={async () => {
            setSibuk(true);
            try {
              await onImpor(baris.slice(0, 500));
            } catch (e) {
              setError(e.message);
              setSibuk(false);
            }
          }}
        >
          {sibuk ? 'Mengimpor…' : `Impor ${baris?.filter((b) => b.perusahaan).length || ''} lead`}
        </button>
      </div>
    </Modal>
  );
}
