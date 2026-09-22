import { bulanLabel, rupiah, tampilHp, tgl, waktuRelatif } from '../lib/format.js';
import GrafikKas from '../komponen/GrafikKas.jsx';
import { Gagal, Kosong, Memuat, useData } from '../komponen/Ui.jsx';
import { NAMA_AKSI, ringkasDetail } from './Admin.jsx';

// Dashboard: satu layar buat mutusin "apa yang perlu diurus hari ini". Titik fokusnya pemasukan bulan ini; di
// bawahnya yang butuh tindakan (trial habis, tagihan belum dibayar), baru konteks (arus kas, pipeline, aktivitas).
const NAMA_TAHAP_CRM = { awareness: 'Awareness', trial: 'Trial 7 hari', konversi: 'Konversi', repeat_order: 'Repeat order', stuck: 'Stuck' };

export default function Dashboard({ api }) {
  const { data: d, error, muat } = useData(api, '/dashboard');
  const bulanIni = new Date().toISOString().slice(0, 7);

  if (error) return <Gagal apa="dashboard" pesan={error} onUlang={muat} />;
  if (!d) return <Memuat apa="dashboard" />;

  const kasIni = d.kas.find((k) => k.bulan === bulanIni) || { masuk: 0, keluar: 0 };
  const t = d.warung.tahap;
  const pipelineTerbuka = d.crm.reduce((a, c) => a + c.nilai, 0);
  const leadTerbuka = d.crm.reduce((a, c) => a + c.n, 0);
  const maksCrm = Math.max(1, ...d.crm.map((c) => c.n));

  return (
    <>
      <header className="adm-kepala">
        <h1 className="sr-only">Dashboard</h1>
        <button className="btn" onClick={muat}>
          Muat ulang
        </button>
      </header>

      <section className="adm-dashboard-atas" aria-label="Ringkasan">
        <a href="#/keuangan" className="adm-kartu adm-stat fokus">
          <span className="adm-label">Pemasukan {bulanLabel(bulanIni)}</span>
          <span className="nilai p-num">{rupiah(kasIni.masuk)}</span>
          <span className="adm-redup">
            Keluar {rupiah(kasIni.keluar)} · saldo kas {rupiah(d.saldo)}
          </span>
        </a>
        <a href="#/leads/warung" className="adm-kartu adm-stat">
          <span className="adm-label">Warung berlangganan</span>
          <span className="nilai p-num">{t.langganan || 0}</span>
          <span className="adm-redup">
            {t.trial || 0} lagi trial · {d.warung.baru30} daftar 30 hari terakhir
          </span>
        </a>
        <a href="#/keuangan/pembayaran" className="adm-kartu adm-stat">
          <span className="adm-label">Tagihan menunggu</span>
          <span className="nilai p-num">{d.tagihan.n}</span>
          <span className="adm-redup">{rupiah(d.tagihan.total)} belum dibayar</span>
        </a>
        <a href="#/leads/crm" className="adm-kartu adm-stat">
          <span className="adm-label">Pipeline CRM</span>
          <span className="nilai p-num">{rupiah(pipelineTerbuka)}</span>
          <span className="adm-redup">{leadTerbuka} lead masih jalan</span>
        </a>
      </section>

      {!d.produkAktif && (
        <Gagal apa="data Warung Pintar" pesan="Database produk belum disambungin (WARUNG_PINTAR_DATABASE_URL di .env manajemen)." />
      )}

      <div className="adm-kolom">
        <section className="adm-kartu">
          <div className="adm-kartu-kepala kuning">
            <h2>Perlu ditindaklanjuti</h2>
          </div>
          <h3 className="adm-label" style={{ fontSize: 12, margin: '0 0 6px' }}>
            Trial habis, belum bayar ({t.trial_habis || 0})
          </h3>
          {d.trialHabis.length === 0 ? (
            <p className="adm-redup" style={{ marginTop: 0 }}>
              Nggak ada warung yang trial-nya habis tanpa bayar.
            </p>
          ) : (
            <ul className="adm-daftar">
              {d.trialHabis.map((w) => (
                <li key={w.id}>
                  <div>
                    <b>{w.nama}</b> <span className="adm-redup">@{w.username}</span>
                    <div className="adm-redup">
                      Trial habis {tgl(w.lisensi_berlaku_sampai)}
                      {w.sales_kode ? ` · sales ${w.sales_kode}` : ''}
                    </div>
                  </div>
                  <div className="adm-kanan">
                    {w.no_hp ? (
                      <a className="btn kecil" href={`https://wa.me/${w.no_hp}`} target="_blank" rel="noopener noreferrer">
                        WA {tampilHp(w.no_hp)}
                      </a>
                    ) : (
                      <span className="adm-redup">Nomor belum diisi</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <h3 className="adm-label" style={{ fontSize: 12, margin: '16px 0 6px' }}>
            Tagihan belum dibayar ({d.tagihan.n})
          </h3>
          {d.menunggu.length === 0 ? (
            <p className="adm-redup" style={{ margin: 0 }}>
              Semua tagihan udah beres.
            </p>
          ) : (
            <ul className="adm-daftar">
              {d.menunggu.map((p) => (
                <li key={p.order_id}>
                  <div>
                    <b>{p.nama}</b> <span className="adm-redup">@{p.username}</span>
                    <div className="adm-redup">
                      Paket {p.plan} · dibuat {waktuRelatif(p.created_at)}
                    </div>
                  </div>
                  <div className="adm-kanan">
                    <b className="p-num">{rupiah(p.jumlah)}</b>
                    <span className="adm-chip kuning">Menunggu</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="adm-kartu">
          <div className="adm-kartu-kepala">
            <h2>Pipeline CRM per tahap</h2>
            <a className="adm-link" href="#/leads/crm">
              Buka CRM
            </a>
          </div>
          {leadTerbuka === 0 ? (
            <Kosong judul="Belum ada lead CRM" aksi={<a className="btn kecil utama" href="#/leads/crm">Tambah lead</a>}>
              Lead CRM diisi manual sama tim (prospek perusahaan, nilai deal, tahapnya).
            </Kosong>
          ) : (
            <div className="adm-batang">
              {d.crm.map((c) => (
                <div key={c.tahap} className="adm-batang-baris">
                  <span className="adm-label" style={{ fontSize: 12 }}>
                    {NAMA_TAHAP_CRM[c.tahap]} · {c.n}
                  </span>
                  <span className="p-num" style={{ fontWeight: 700 }}>
                    {rupiah(c.nilai)}
                  </span>
                  <div className="adm-batang-isi" aria-hidden="true">
                    <span style={{ width: `${(c.n / maksCrm) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="adm-kartu" style={{ marginTop: 22 }}>
        <div className="adm-kartu-kepala">
          <h2>Uang masuk vs keluar, 6 bulan terakhir</h2>
          <a className="adm-link" href="#/keuangan">
            Detail keuangan
          </a>
        </div>
        <GrafikKas kas={d.kas} />
      </section>

      <div className="adm-kolom-3">
        <section className="adm-kartu">
          <div className="adm-kartu-kepala hitam">
            <h2>Sales bulan ini</h2>
          </div>
          {d.sales.length === 0 ? (
            <Kosong judul="Belum ada sales aktif" aksi={<a className="btn kecil" href="#/leads/sales">Tambah sales</a>}>
              Sales yang ditambah bakal punya link daftar sendiri.
            </Kosong>
          ) : (
            <ul className="adm-daftar">
              {d.sales.map((s, i) => (
                <li key={s.kode}>
                  <div>
                    <b>
                      {i + 1}. {s.nama}
                    </b>{' '}
                    <span className="adm-redup">{s.kode}</span>
                    <div className="adm-redup">
                      {s.warung} warung · {s.bayar} pernah bayar
                    </div>
                  </div>
                  <b className="p-num">{rupiah(s.omzet_bulan_ini)}</b>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="adm-kartu span-2">
          <div className="adm-kartu-kepala">
            <h2>Aktivitas tim terbaru</h2>
            <a className="adm-link" href="#/pengaturan/tim">
              Semua aktivitas
            </a>
          </div>
          {d.log.length === 0 ? (
            <p className="adm-redup" style={{ margin: 0 }}>
              Belum ada aktivitas admin yang kecatat.
            </p>
          ) : (
            <ul className="adm-daftar">
              {d.log.map((l) => (
                <li key={l.id}>
                  <div>
                    <b>{l.admin_nama || '(terminal)'}</b> {NAMA_AKSI[l.aksi] || l.aksi}
                    <div className="adm-redup">{ringkasDetail(l.detail)}</div>
                  </div>
                  <span className="adm-redup" style={{ whiteSpace: 'nowrap' }}>
                    {waktuRelatif(l.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
