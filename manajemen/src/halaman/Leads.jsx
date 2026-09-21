import { useCallback, useEffect, useMemo, useState } from 'react';
import { rupiah, tampilHp, tgl, waktu, waktuRelatif } from '../lib/format.js';
import { Gagal, Konfirmasi, Kosong, Memuat, Modal, Tabs, useData } from '../komponen/Ui.jsx';
import Sales from '../produk/warung-pintar/Sales.jsx';

// Leads: tab WARUNG (otomatis dari pendaftaran Warung Pintar), CRM (prospek bisnis yang diisi manual), SALES.
const TABS = [
  { id: 'warung', nama: 'Warung' },
  { id: 'crm', nama: 'CRM' },
  { id: 'sales', nama: 'Sales' },
];

export default function Leads({ api, apiProduk, produkWp, tab }) {
  const aktif = TABS.some((t) => t.id === tab) ? tab : 'warung';
  return (
    <>
      <header className="adm-kepala">
        <div>
          <h1>Leads</h1>
          <p className="adm-sub">Warung yang daftar lewat sales, prospek bisnis yang lagi dikejar, dan sales yang bawa mereka.</p>
        </div>
      </header>
      <Tabs daftar={TABS} aktif={aktif} href={(id) => `#/leads/${id}`} />
      {aktif === 'warung' && (apiProduk ? <LeadsWarung api={apiProduk} /> : <ProdukMati />)}
      {aktif === 'crm' && <LeadsCrm api={api} />}
      {aktif === 'sales' && (apiProduk ? <Sales api={apiProduk} produk={produkWp} /> : <ProdukMati />)}
    </>
  );
}

function ProdukMati() {
  return (
    <Kosong judul="Warung Pintar belum disambungin">
      Isi WARUNG_PINTAR_DATABASE_URL di .env server manajemen, lalu restart servernya.
    </Kosong>
  );
}

// ---------------- WARUNG ----------------
const TAHAP_WARUNG = {
  trial: { nama: 'Trial aktif', warna: 'kuning', ket: 'Lagi nyoba gratis' },
  trial_habis: { nama: 'Trial habis', warna: 'merah', ket: 'Belum pernah bayar, perlu di-follow up' },
  langganan: { nama: 'Berlangganan', warna: 'hijau', ket: 'Langganan masih aktif' },
  berhenti: { nama: 'Langganan habis', warna: 'oranye', ket: 'Pernah bayar, sekarang lewat masa aktif' },
};
const NAMA_JENIS = { kelontong: 'Kelontong', bangunan: 'Toko bangunan', konter: 'Konter HP', pertanian: 'Pertanian', kosmetik: 'Kosmetik', makanan: 'Warung makan', lainnya: 'Lainnya' };

function LeadsWarung({ api }) {
  const [tahap, setTahap] = useState('');
  const [q, setQ] = useState('');
  const [cari, setCari] = useState('');
  const path = `/leads-warung?${new URLSearchParams({ ...(tahap && { tahap }), ...(cari && { q: cari }) })}`;
  const { data, error, muat } = useData(api, path);

  return (
    <>
      <div className="adm-angka">
        {Object.entries(TAHAP_WARUNG).map(([id, t]) => {
          const n = data?.ringkas.find((r) => r.tahap === id)?.n ?? '…';
          return (
            <button
              key={id}
              className={'adm-kartu adm-angka-item adm-saring' + (tahap === id ? ' on' : '')}
              onClick={() => setTahap((x) => (x === id ? '' : id))}
              aria-pressed={tahap === id}
            >
              <span className={`adm-chip ${t.warna}`} style={{ alignSelf: 'flex-start' }}>
                {t.nama}
              </span>
              <b className="p-num">{n}</b>
              <span className="adm-redup">{t.ket}</span>
            </button>
          );
        })}
      </div>

      <form
        className="adm-cari"
        style={{ marginBottom: 16 }}
        onSubmit={(e) => {
          e.preventDefault();
          setCari(q.trim());
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama warung, username, no. HP, kode sales" aria-label="Cari warung" />
        <button className="btn" type="submit">
          Cari
        </button>
        {(cari || tahap) && (
          <button
            className="btn"
            type="button"
            onClick={() => {
              setQ('');
              setCari('');
              setTahap('');
            }}
          >
            Reset filter
          </button>
        )}
      </form>

      {error ? (
        <Gagal apa="daftar warung" pesan={error} onUlang={muat} />
      ) : !data ? (
        <Memuat apa="daftar warung" />
      ) : data.warung.length === 0 ? (
        tahap || cari ? (
          <Kosong judul="Nggak ada warung yang cocok">Ganti kata kunci atau lepas filter tahapnya.</Kosong>
        ) : (
          <Kosong judul="Belum ada warung yang daftar" aksi={<a className="btn kecil utama" href="#/leads/sales">Bagiin link sales</a>}>
            Warung yang daftar lewat aplikasi Warung Pintar muncul di sini otomatis.
          </Kosong>
        )
      ) : (
        <div className="adm-gulir">
          <table className="adm-tabel">
            <thead>
              <tr>
                <th>Warung</th>
                <th>Tahap</th>
                <th>Sales</th>
                <th>Daftar</th>
                <th>Aktif sampai</th>
                <th className="kanan">Total bayar</th>
                <th>Terakhir jualan</th>
                <th>Kontak</th>
              </tr>
            </thead>
            <tbody>
              {data.warung.map((w) => {
                const t = TAHAP_WARUNG[w.tahap];
                return (
                  <tr key={w.id}>
                    <td>
                      <b>{w.nama}</b>
                      <div className="adm-redup">
                        @{w.username}
                        {w.jenis_usaha ? ` · ${NAMA_JENIS[w.jenis_usaha] || w.jenis_usaha}` : ''}
                      </div>
                    </td>
                    <td>
                      <span className={`adm-chip ${t.warna}`}>{t.nama}</span>
                    </td>
                    <td>{w.sales_nama ? `${w.sales_nama} (${w.sales_kode})` : <span className="adm-redup">Daftar sendiri</span>}</td>
                    <td>{tgl(w.created_at)}</td>
                    <td>{w.plan === 'permanen' ? 'Selamanya' : tgl(w.lisensi_berlaku_sampai)}</td>
                    <td className="kanan">{w.total_bayar ? rupiah(w.total_bayar) : <span className="adm-redup">-</span>}</td>
                    <td>{w.terakhir_aktif ? waktuRelatif(w.terakhir_aktif) : <span className="adm-redup">Belum pernah</span>}</td>
                    <td>
                      {w.no_hp ? (
                        <a className="btn kecil" href={`https://wa.me/${w.no_hp}`} target="_blank" rel="noopener noreferrer">
                          WA {tampilHp(w.no_hp)}
                        </a>
                      ) : (
                        <span className="adm-redup">-</span>
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

// ---------------- CRM ----------------
export const TAHAP_CRM = [
  { id: 'baru', nama: 'Baru', warna: '' },
  { id: 'kualifikasi', nama: 'Kualifikasi', warna: 'kuning' },
  { id: 'proposal', nama: 'Proposal', warna: 'ungu' },
  { id: 'negosiasi', nama: 'Negosiasi', warna: 'oranye' },
  { id: 'closing', nama: 'Closing', warna: 'biru' },
];
const namaTahap = (id) => TAHAP_CRM.find((t) => t.id === id) || TAHAP_CRM[0];
const SUMBER = ['Referral', 'Website', 'Instagram', 'WhatsApp', 'Pameran', 'Telepon', 'Lainnya'];

function LeadsCrm({ api }) {
  const [tahap, setTahap] = useState('');
  const [status, setStatus] = useState('jalan');
  const [q, setQ] = useState('');
  const [cari, setCari] = useState('');
  const [tambah, setTambah] = useState(false);
  const [dipilih, setDipilih] = useState(null); // id lead yang dibuka di laci
  const path = `/leads?${new URLSearchParams({ status, ...(tahap && { tahap }), ...(cari && { q: cari }) })}`;
  const { data, error, muat } = useData(api, path);
  const { data: admins } = useData(api, '/admin');
  const lead = data?.leads.find((l) => l.id === dipilih);

  return (
    <>
      <div className="adm-angka" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {TAHAP_CRM.map((t) => {
          const r = data?.ringkas.find((x) => x.tahap === t.id);
          return (
            <button
              key={t.id}
              className={'adm-kartu adm-angka-item adm-saring' + (tahap === t.id ? ' on' : '')}
              onClick={() => setTahap((x) => (x === t.id ? '' : t.id))}
              aria-pressed={tahap === t.id}
            >
              <span className={`adm-chip ${t.warna}`} style={{ alignSelf: 'flex-start' }}>
                {t.nama}
              </span>
              <b className="p-num">{r ? r.n : '…'}</b>
              <span className="adm-redup p-num">{r ? rupiah(r.nilai) : ''}</span>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <form
          className="adm-cari"
          style={{ margin: 0, flex: 1 }}
          onSubmit={(e) => {
            e.preventDefault();
            setCari(q.trim());
          }}
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari perusahaan, PIC, email" aria-label="Cari lead" />
          <button className="btn" type="submit">
            Cari
          </button>
        </form>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status lead">
          <option value="jalan">Masih jalan</option>
          <option value="menang">Menang</option>
          <option value="gagal">Gagal</option>
        </select>
        <button className="btn utama" onClick={() => setTambah(true)}>
          + Tambah lead
        </button>
      </div>

      {error ? (
        <Gagal apa="lead CRM" pesan={error} onUlang={muat} />
      ) : !data ? (
        <Memuat apa="lead CRM" />
      ) : data.leads.length === 0 ? (
        tahap || cari || status !== 'jalan' ? (
          <Kosong judul="Nggak ada lead yang cocok">Ganti filter tahap, status, atau kata kuncinya.</Kosong>
        ) : (
          // "Masih jalan" kosong belum tentu CRM-nya kosong - bisa aja semua lead udah menang/gagal.
          <Kosong judul="Nggak ada lead yang lagi jalan" aksi={<button className="btn kecil utama" onClick={() => setTambah(true)}>+ Tambah lead</button>}>
            Catat prospek bisnis baru di sini (perusahaan, PIC, perkiraan nilai deal), atau lihat lead yang udah menang/gagal lewat pilihan status.
          </Kosong>
        )
      ) : (
        <div className="adm-gulir">
          <table className="adm-tabel">
            <thead>
              <tr>
                <th>Perusahaan / PIC</th>
                <th>Kontak</th>
                <th>Sumber</th>
                <th className="kanan">Nilai</th>
                <th>Tahap</th>
                <th>Pemilik</th>
                <th>Diubah</th>
              </tr>
            </thead>
            <tbody>
              {data.leads.map((l) => {
                const t = namaTahap(l.tahap);
                return (
                  <tr
                    key={l.id}
                    className={'klik' + (dipilih === l.id ? ' pilih' : '')}
                    onClick={() => setDipilih(l.id)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setDipilih(l.id))}
                    tabIndex={0}
                    aria-label={`Buka detail ${l.perusahaan}`}
                  >
                    <td>
                      <b>{l.perusahaan}</b>
                      <div className="adm-redup">
                        {[l.pic_nama, l.pic_jabatan].filter(Boolean).join(' · ') || '-'}
                      </div>
                    </td>
                    <td>
                      <div>{l.email || '-'}</div>
                      <div className="adm-redup">{l.telepon || ''}</div>
                    </td>
                    <td>{l.sumber ? <span className="adm-chip">{l.sumber}</span> : '-'}</td>
                    <td className="kanan">
                      <b>{rupiah(l.nilai)}</b>
                    </td>
                    <td>
                      {l.hasil ? (
                        <span className={`adm-chip ${l.hasil === 'menang' ? 'hijau' : 'merah'}`}>{l.hasil}</span>
                      ) : (
                        <span className={`adm-chip ${t.warna}`}>{t.nama}</span>
                      )}
                    </td>
                    <td>{l.pemilik_nama || '-'}</td>
                    <td>{waktuRelatif(l.updated_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tambah && (
        <FormLead
          judul="Tambah lead"
          admins={admins || []}
          onTutup={() => setTambah(false)}
          onSimpan={async (isi) => {
            await api('POST', '/leads', isi);
            setTambah(false);
            muat();
          }}
        />
      )}
      {lead && <LaciLead key={lead.id} api={api} lead={lead} admins={admins || []} onTutup={() => setDipilih(null)} onBerubah={muat} />}
    </>
  );
}

function FormLead({ judul, awal = {}, admins, onTutup, onSimpan }) {
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
  return (
    <Modal judul={judul} onTutup={onTutup}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          setSibuk(true);
          try {
            await onSimpan({ ...isi, nilai: Number(isi.nilai.replace(/\D/g, '')) || 0, pemilik_id: isi.pemilik_id || undefined });
          } catch (err) {
            setError(err.message);
            setSibuk(false);
          }
        }}
      >
        {field('perusahaan', 'Perusahaan / nama prospek', { required: true, placeholder: 'Nama perusahaan' })}
        <div className="adm-baris" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {field('pic_nama', 'Nama PIC', { placeholder: 'Nama orang yang dihubungi' })}
          {field('pic_jabatan', 'Jabatan PIC')}
          {field('email', 'Email', { type: 'email', placeholder: 'email@perusahaan.com' })}
          {field('telepon', 'Telepon / WA', { inputMode: 'tel' })}
          {field('nilai', 'Perkiraan nilai deal (Rp)', { inputMode: 'numeric', placeholder: '0' })}
          <div className="field">
            <label htmlFor="lead-sumber">Sumber</label>
            <select id="lead-sumber" value={isi.sumber} onChange={ubah('sumber')} style={{ maxWidth: 'none', width: '100%', minHeight: 44 }}>
              <option value="">Pilih sumber</option>
              {SUMBER.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
        {admins.length > 0 && (
          <div className="field">
            <label htmlFor="lead-pemilik">Pemilik lead</label>
            <select id="lead-pemilik" value={isi.pemilik_id} onChange={ubah('pemilik_id')} style={{ maxWidth: 'none', width: '100%', minHeight: 44 }}>
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

const JENIS_AKTIVITAS = { catatan: 'Catatan', telepon: 'Telepon', meeting: 'Meeting', email: 'Email', tahap: 'Perubahan' };

function LaciLead({ api, lead, admins, onTutup, onBerubah }) {
  const [edit, setEdit] = useState(false);
  const [hapus, setHapus] = useState(false);
  const [error, setError] = useState('');
  const [catatan, setCatatan] = useState('');
  const [jenis, setJenis] = useState('catatan');
  const [aktivitas, setAktivitas] = useState(null);

  const muatAktivitas = useCallback(async () => {
    try {
      setAktivitas(await api('GET', `/leads/${lead.id}/aktivitas`));
    } catch (e) {
      setError(e.message);
    }
  }, [api, lead.id]);

  useEffect(() => {
    let batal = false;
    api('GET', `/leads/${lead.id}/aktivitas`)
      .then((a) => !batal && setAktivitas(a))
      .catch((e) => !batal && setError(e.message));
    // Escape nutup laci, KECUALI lagi ada modal (ubah/hapus) di atasnya - yang itu ditutup duluan.
    const tekan = (e) => e.key === 'Escape' && !document.querySelector('.adm-modal') && onTutup();
    document.addEventListener('keydown', tekan);
    return () => {
      batal = true;
      document.removeEventListener('keydown', tekan);
    };
  }, [api, lead.id, onTutup]);

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
  const idxTahap = useMemo(() => TAHAP_CRM.findIndex((t) => t.id === lead.tahap), [lead.tahap]);

  return (
    <>
      <div className="adm-latar" style={{ padding: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onTutup()} />
      <aside className="adm-laci" role="dialog" aria-modal="true" aria-label={`Detail ${lead.perusahaan}`}>
        <div className="adm-modal-kepala">
          <h2>Detail lead</h2>
          <button className="adm-tutup" onClick={onTutup} aria-label="Tutup">
            ×
          </button>
        </div>
        <p className="adm-label" style={{ fontSize: 11, margin: 0 }}>
          {lead.hasil ? `Ditutup: ${lead.hasil}` : `Tahap: ${namaTahap(lead.tahap).nama}`}
        </p>
        <h3 style={{ fontSize: 24, margin: '4px 0 2px', letterSpacing: '-.01em' }}>{lead.perusahaan}</h3>
        <p className="p-num" style={{ fontSize: 28, fontWeight: 700, margin: '6px 0 14px' }}>
          {rupiah(lead.nilai)}
        </p>

        {!lead.hasil && (
          <>
            <p className="adm-label" style={{ fontSize: 11, margin: '0 0 6px' }}>
              Geser tahap
            </p>
            <div className="adm-tahap" role="group" aria-label="Tahap lead">
              {TAHAP_CRM.map((t, i) => (
                <button key={t.id} className={i === idxTahap ? 'on' : i < idxTahap ? 'lewat' : ''} onClick={() => i !== idxTahap && ubah({ tahap: t.id })} aria-pressed={i === idxTahap}>
                  {t.nama}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="adm-kartu" style={{ marginTop: 16, boxShadow: 'none' }}>
          <p className="adm-label" style={{ fontSize: 11, margin: '0 0 6px' }}>
            PIC
          </p>
          <b>{lead.pic_nama || '-'}</b>
          {lead.pic_jabatan && <div className="adm-redup">{lead.pic_jabatan}</div>}
          <div style={{ marginTop: 8 }}>
            {lead.email ? <a href={`mailto:${lead.email}`}>{lead.email}</a> : <span className="adm-redup">Email belum diisi</span>}
          </div>
          <div>{lead.telepon || <span className="adm-redup">Telepon belum diisi</span>}</div>
          <div className="adm-redup" style={{ marginTop: 8 }}>
            Sumber {lead.sumber || '-'} · pemilik {lead.pemilik_nama || '-'} · dibuat {tgl(lead.created_at)}
          </div>
          <div className="adm-tombol">
            <button className="btn kecil" onClick={() => setEdit(true)}>
              Ubah data
            </button>
            <button className="btn kecil" onClick={() => setHapus(true)}>
              Hapus
            </button>
          </div>
        </div>

        {error && <p className="adm-error">{error}</p>}

        <div className="adm-tombol" style={{ marginTop: 16 }}>
          {lead.hasil ? (
            <button className="btn" onClick={() => ubah({ hasil: null })}>
              Buka lagi
            </button>
          ) : (
            <>
              <button className="btn" style={{ background: 'var(--hijau)', flex: 1 }} onClick={() => ubah({ hasil: 'menang' })}>
                Tandai menang
              </button>
              <button className="btn bahaya" style={{ flex: 1 }} onClick={() => ubah({ hasil: 'gagal' })}>
                Tandai gagal
              </button>
            </>
          )}
        </div>

        <h3 className="adm-label" style={{ fontSize: 12, margin: '22px 0 8px' }}>
          Riwayat & catatan
        </h3>
        <form
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
          <div className="field" style={{ marginTop: 0 }}>
            <label htmlFor="catatan-lead">Tambah catatan interaksi</label>
            <textarea id="catatan-lead" value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Hasil telepon, follow up, atau update negosiasi" />
          </div>
          <div className="adm-tombol">
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
        {!aktivitas ? (
          <Memuat apa="riwayat" />
        ) : aktivitas.length === 0 ? (
          <p className="adm-redup">Belum ada catatan.</p>
        ) : (
          <ul className="adm-daftar" style={{ marginTop: 10 }}>
            {aktivitas.map((a) => (
              <li key={a.id} style={{ flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span className={`adm-chip ${a.jenis === 'tahap' ? 'ungu' : a.jenis === 'telepon' ? 'hijau' : a.jenis === 'meeting' ? 'kuning' : ''}`}>{JENIS_AKTIVITAS[a.jenis] || a.jenis}</span>
                  <span className="adm-redup">{waktu(a.created_at)}</span>
                </div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{a.isi}</div>
                <div className="adm-redup">oleh {a.admin_nama || '-'}</div>
              </li>
            ))}
          </ul>
        )}
      </aside>

      {edit && (
        <FormLead
          judul="Ubah lead"
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
          pesan={`Hapus ${lead.perusahaan} beserta semua catatannya? Ini nggak bisa dibalikin.`}
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
    </>
  );
}
