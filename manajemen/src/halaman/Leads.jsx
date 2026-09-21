import { useState } from 'react';
import { rupiah, tampilHp, tgl, waktuRelatif } from '../lib/format.js';
import { Gagal, Kosong, Memuat, Tabs, useData } from '../komponen/Ui.jsx';
import Sales from '../produk/warung-pintar/Sales.jsx';
import LeadsCrm from './LeadsCrm.jsx';

// Leads Management: CRM (prospek bisnis, sesuai referensi), WARUNG (otomatis dari pendaftaran Warung Pintar), SALES.
const TABS = [
  { id: 'crm', nama: 'Pipeline CRM' },
  { id: 'warung', nama: 'Warung Pintar' },
  { id: 'sales', nama: 'Sales' },
];

export default function Leads({ api, apiProduk, produkWp, tab }) {
  const aktif = TABS.some((t) => t.id === tab) ? tab : 'crm';
  const tabs = <Tabs daftar={TABS} aktif={aktif} href={(id) => `#/leads/${id}`} />;
  return (
    <>
      <header className="adm-kepala">
        <div>
          <h1>Leads Management</h1>
          <p className="adm-sub">Kelola semua prospek dan pipeline penjualan dalam satu tempat, plus warung yang daftar lewat sales.</p>
        </div>
      </header>
      {aktif === 'crm' ? <LeadsCrm api={api} tabs={tabs} /> : tabs}
      {aktif === 'warung' && (apiProduk ? <LeadsWarung api={apiProduk} /> : <ProdukMati />)}
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
