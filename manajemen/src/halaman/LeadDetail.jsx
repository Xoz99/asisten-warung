import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { rupiah, tgl, waktu, waktuRelatif } from '../lib/format.js';
import { Konfirmasi, Memuat, Modal } from '../komponen/Ui.jsx';
import FotoProfil from '../komponen/FotoProfil.jsx';
import { bacaSesi } from '../lib/api.js';
import { keWebp } from '../lib/gambar.js';
import { Detail, Foto, FormLog, HASIL } from './Lapangan.jsx';
import { FormLead, TAHAP_CRM } from './LeadsCrm.jsx';

// Detail lead v2 (panel samping CRM): sampul foto warung, langkah berikutnya, tim yang pegang (sales PIC + atasannya di
// HR Karyawan), alur tahap, tab Ringkasan / Kunjungan / Riwayat, dan tombol cepat Telepon · WhatsApp · Kunjungan ·
// Catatan. Kunjungan diambil dari log Sales Lapangan yang nempel ke kartu ini; template WA dari kamus contekan.
const namaTahap = (id) => TAHAP_CRM.find((t) => t.id === id) || TAHAP_CRM[0];
const hariSejak = (t) => Math.max(0, Math.floor((Date.now() - new Date(t).getTime()) / 86400000));
const JENIS = {
  catatan: 'Catatan',
  follow_up: 'Follow up',
  kendala: 'Kendala',
  telepon: 'Telepon',
  meeting: 'Meeting',
  email: 'Email',
  wa: 'WhatsApp',
  eskalasi: 'Eskalasi',
  tahap: 'Perubahan',
  kunjungan: 'Kunjungan',
  data: 'Data',
  checklist: 'Checklist',
};
const WARNA = { tahap: 'ungu', kunjungan: 'hijau', catatan: 'kuning', follow_up: 'biru', kendala: 'oranye', wa: 'hijau', eskalasi: 'merah', data: '', checklist: '', telepon: 'biru', meeting: 'kuning', email: 'biru' };
const CATATAN = ['catatan', 'follow_up', 'kendala', 'telepon', 'meeting', 'email', 'wa', 'eskalasi'];
const FILTER = [
  ['semua', 'Semua'],
  ['tahap', 'Tahap'],
  ['kunjungan', 'Kunjungan'],
  ['catatan', 'Catatan'],
  ['lainnya', 'Lainnya'],
];
const PRIORITAS = { rendah: 'Rendah', sedang: 'Sedang', tinggi: 'Tinggi' };
const ALASAN_LAIN = ['Tidak bisa dihubungi', 'Pakai aplikasi lain', 'Tutup / pindah', 'Lainnya'];
const nomorWa = (hp) => {
  const d = String(hp || '').replace(/\D/g, '');
  return d.startsWith('0') ? '62' + d.slice(1) : d;
};
const waLink = (hp, teks) => `https://wa.me/${nomorWa(hp)}?text=${encodeURIComponent(teks)}`;
const depan = (n) => (n || '').trim().split(/\s+/)[0] || '';

// `base`: /leads (admin) atau /lapangan/crm (sales, cuma kartu miliknya). `modeSales` nyembunyiin ganti PIC & hapus.
export default function LeadDetail({ api, lead: leadDaftar, admins = [], onTutup, onBerubah, base = '/leads', modeSales = false }) {
  const saya = bacaSesi()?.admin || {};
  const [detail, setDetail] = useState(null);
  // Data kartu dari server lebih baru daripada salinan di daftar (daftar bisa nggak ikut ke-refresh, misal di Kanban).
  const lead = detail?.lead ? { ...leadDaftar, ...detail.lead } : leadDaftar;
  const [aktivitas, setAktivitas] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('ringkas');
  const [modal, setModal] = useState(null); // { jenis, ... }
  const [toast, setToast] = useState(null); // { teks, undo }
  const [versiFoto, setVersiFoto] = useState(0);
  const ref = useRef(null);
  const inputFoto = useRef(null);

  const muat = useCallback(() => {
    api('GET', `${base}/${leadDaftar.id}/detail`).then(setDetail, (e) => setError(e.message));
    api('GET', `${base}/${leadDaftar.id}/aktivitas`).then(setAktivitas, (e) => setError(e.message));
  }, [api, leadDaftar.id]);
  useEffect(() => {
    muat();
    ref.current?.focus();
    const tekan = (e) => e.key === 'Escape' && !document.querySelector('.adm-modal') && onTutup();
    document.addEventListener('keydown', tekan);
    return () => document.removeEventListener('keydown', tekan);
  }, [muat, onTutup]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.undo ? 5000 : 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const segarkan = () => {
    onBerubah();
    muat();
  };
  const ubah = async (perubahan, pesan, undo) => {
    setError('');
    try {
      await api('PATCH', `${base}/${lead.id}`, perubahan);
      segarkan();
      if (pesan) setToast({ teks: pesan, undo });
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    }
  };
  const catat = async (jenis, isi) => {
    await api('POST', `${base}/${lead.id}/aktivitas`, { jenis, isi });
    segarkan();
  };

  const kunjungan = detail?.kunjungan || [];
  const terakhir = kunjungan[0] || null;
  const kategoriTop = useMemo(() => {
    const n = {};
    for (const k of kunjungan) if (k.hasil !== 'berhasil' && k.kategori !== 'Tanpa keberatan') n[k.kategori] = (n[k.kategori] || 0) + 1;
    return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  }, [kunjungan]);
  const hari = hariSejak(lead.tahap_sejak);
  const sisaTrial = lead.tahap === 'trial' ? Math.max(0, 7 - hari) : null;
  const telp = lead.telepon ? nomorWa(lead.telepon) : '';
  const lengkap = useMemo(() => {
    const f = [lead.pic_nama, lead.telepon, lead.email, lead.alamat, Number(lead.nilai) > 0, kunjungan.length > 0, lead.foto || kunjungan.some((k) => k.foto?.length), lead.lat != null || kunjungan.some((k) => k.lat != null)];
    return Math.round((f.filter(Boolean).length / f.length) * 100);
  }, [lead, kunjungan]);
  const terakhirAktif = aktivitas?.length ? aktivitas[0].created_at : lead.updated_at;

  // Langkah berikutnya, diturunin dari data kartu ini.
  const langkah = (() => {
    if (!detail) return null;
    if (lead.hasil === 'menang') return { kelas: 'selesai', judul: 'Deal menang. Cek pemakaiannya minggu depan.', alasan: 'Pastikan tokonya aktif pakai biar lanjut perpanjang.', aksi: [['Catat kunjungan', () => setModal({ jenis: 'kunjungan' }), 'gelap']] };
    if (lead.hasil === 'gagal') return null;
    if (lead.tahap === 'stuck')
      return detail.supervisor
        ? { kelas: 'macet', judul: `Lead macet${hari ? ` ${hari} hari` : ''}. Minta bantuan ${depan(detail.supervisor.nama)}.`, alasan: kategoriTop ? `Keberatan terbanyak: ${kategoriTop}.` : 'Atasan sales bisa bantu cara ngejawabnya.', aksi: [['Minta bantuan', () => setModal({ jenis: 'eskalasi' }), 'gelap'], ['Catat kunjungan', () => setModal({ jenis: 'kunjungan' }), '']] }
        : { kelas: 'macet', judul: `Lead macet${hari ? ` ${hari} hari` : ''}.`, alasan: 'Sales PIC ini belum punya atasan. Atur di HR Karyawan biar bisa minta bantuan dari sini.', aksi: [['Catat kunjungan', () => setModal({ jenis: 'kunjungan' }), 'gelap']] };
    if (sisaTrial != null && sisaTrial <= 2)
      return { kelas: '', judul: `Trial habis ${sisaTrial} hari lagi. Tawarkan paket sekarang.`, alasan: 'Paket: Rp78rb/bulan, Rp210rb/3 bulan, atau Rp684rb/tahun.', aksi: [['Kirim WA penawaran', () => setModal({ jenis: 'wa', template: 'paket' }), 'gelap'], ['Tandai menang', () => ubah({ hasil: 'menang' }, 'Lead ditandai menang'), '']] };
    if (terakhir && ['ditolak', 'pikir', 'tertarik'].includes(terakhir.hasil) && terakhir.kategori !== 'Tanpa keberatan')
      return { kelas: '', judul: `Jawab keberatan "${terakhir.kategori}" dari kunjungan #${terakhir.nomor}.`, alasan: terakhir.catatan || terakhir.fakta || '', aksi: [['Kirim WA follow-up', () => setModal({ jenis: 'wa', template: terakhir.kategori }), 'gelap'], ['Catat kunjungan', () => setModal({ jenis: 'kunjungan' }), '']] };
    const buka = detail.checklist.find((c) => !c.selesai);
    if (buka) return { kelas: '', judul: buka.teks, alasan: 'Langkah berikutnya dari checklist follow-up.', aksi: [['Tandai selesai', () => centang(buka), 'gelap']] };
    if (!kunjungan.length) return { kelas: '', judul: 'Belum pernah dikunjungi. Jadwalkan kunjungan pertama.', alasan: '', aksi: [['Catat kunjungan', () => setModal({ jenis: 'kunjungan' }), 'gelap']] };
    return { kelas: '', judul: 'Jadwalkan kunjungan berikutnya.', alasan: 'Nggak ada langkah yang ketunda.', aksi: [['Catat kunjungan', () => setModal({ jenis: 'kunjungan' }), 'gelap']] };
  })();

  const centang = async (c) => {
    try {
      await api('PATCH', `${base}/${lead.id}/checklist/${c.id}`, { selesai: !c.selesai });
      muat();
      if (!c.selesai) setToast({ teks: 'Checklist selesai' });
    } catch (e) {
      setError(e.message);
    }
  };
  const pindahTahap = (t) => {
    if (t === lead.tahap) return;
    const lama = lead.tahap;
    ubah({ tahap: t }, `Pindah ke ${namaTahap(t).nama}`, () => ubah({ tahap: lama }, `Balik ke ${namaTahap(lama).nama}`));
  };
  const gantiFoto = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      await api('PUT', `${base}/${lead.id}/foto`, { foto: await keWebp(f, 1200, 0.8) });
      setVersiFoto((v) => v + 1);
      segarkan();
      setToast({ teks: 'Foto warung diganti' });
    } catch (err) {
      setError(err.message);
    }
  };

  const tahapIdx = TAHAP_CRM.findIndex((t) => t.id === lead.tahap);
  const macet = lead.tahap === 'stuck';

  return (
    <aside className="adm-inspector ld" aria-label={`Detail ${lead.perusahaan}`} tabIndex={-1} ref={ref}>
      <div className="ld-atas">
        <span className="adm-mono">{lead.kode}</span>
        <button className="ld-tutup" onClick={onTutup} aria-label="Tutup detail">
          ×
        </button>
      </div>

      <div className="ld-sampul">
        <SampulWarung lead={lead} versi={versiFoto} base={base} />
        <span className={`adm-chip ld-tahap-chip ${lead.hasil === 'menang' ? 'hijau' : lead.hasil === 'gagal' || macet ? 'merah' : 'kuning'}`}>
          {lead.hasil ? `Ditutup: ${lead.hasil}` : `Tahap: ${namaTahap(lead.tahap).nama}`}
        </span>
        <button className="btn kecil ld-ganti-foto" onClick={() => inputFoto.current?.click()}>
          {lead.foto ? 'Ganti foto' : 'Foto warung'}
        </button>
        <input ref={inputFoto} type="file" accept="image/*" hidden onChange={gantiFoto} />
      </div>

      <div className="ld-pad">
        <div className="ld-identitas">
          <span className="ld-inisial" aria-hidden="true">
            {(lead.pic_nama || lead.perusahaan || '?').trim()[0].toUpperCase()}
          </span>
          <div style={{ minWidth: 0 }}>
            <h3 className="ld-nama">{lead.perusahaan}</h3>
            <div className="adm-redup">
              {lead.pic_nama || 'PIC belum diisi'}
              {lead.jenis_usaha ? ` · ${lead.jenis_usaha}` : ''}
            </div>
          </div>
        </div>
        <div className="ld-meter">
          <span className="adm-label">Data lengkap</span>
          <span className="ld-bar" role="progressbar" aria-valuenow={lengkap} aria-valuemin={0} aria-valuemax={100} aria-label="Kelengkapan data">
            <i style={{ width: `${lengkap}%` }} />
          </span>
          <b>{lengkap}%</b>
        </div>

        {lead.hasil && (
          <div className={`ld-banner ${lead.hasil === 'menang' ? 'menang' : 'gagal'}`}>
            <span>{lead.hasil === 'menang' ? 'Lead ini MENANG' : `GAGAL${lead.alasan_gagal ? `: ${lead.alasan_gagal}` : ''}`}</span>
            <button className="btn kecil" onClick={() => ubah({ hasil: null }, 'Lead dibuka lagi')}>
              Buka lagi
            </button>
          </div>
        )}

        {langkah && (
          <div className={`ld-langkah ${langkah.kelas}`}>
            <span className="adm-label">Langkah berikutnya</span>
            <div className="ld-langkah-judul">{langkah.judul}</div>
            {langkah.alasan && <div className="ld-langkah-alasan">{langkah.alasan}</div>}
            <div className="adm-tombol" style={{ marginTop: 10 }}>
              {langkah.aksi.map(([t, fn, k]) => (
                <button key={t} className={`btn kecil ${k === 'gelap' ? 'ld-gelap' : ''}`} onClick={fn}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="ld-dua">
          <div className="adm-kartu ld-kecil">
            <span className="adm-label">Estimasi deal</span>
            <div className="ld-angka p-num">{rupiah(lead.nilai)}</div>
            <select className={`ld-prio ${lead.prioritas || 'sedang'}`} value={lead.prioritas || 'sedang'} onChange={(e) => ubah({ prioritas: e.target.value }, 'Prioritas diubah')} aria-label="Prioritas">
              {Object.entries(PRIORITAS).map(([k, n]) => (
                <option key={k} value={k}>
                  Prioritas {n}
                </option>
              ))}
            </select>
          </div>
          <div className="adm-kartu ld-kecil">
            <span className="adm-label">Aktivitas terakhir</span>
            <div className="ld-angka" style={{ fontSize: 15 }}>
              {terakhirAktif ? waktuRelatif(terakhirAktif) : '-'}
            </div>
            <div className="adm-redup" style={{ fontSize: 12, marginTop: 4 }}>
              {kunjungan.length} kunjungan · {(aktivitas || []).filter((a) => CATATAN.includes(a.jenis)).length} catatan
            </div>
          </div>
        </div>

        <p className="adm-label ld-judul">Tim yang pegang</p>
        <div className="adm-kartu ld-tim">
          <div className="ld-orang">
            {detail?.pic ? (
              <FotoProfil src={modeSales ? '/api/saya/foto' : `/api/tim-sales/${detail.pic.id}/foto`} ada={detail.pic.ada_foto && detail.pic.peran === 'sales'} nama={detail.pic.nama} ukuran={44} />
            ) : (
              <span className="ld-inisial kecil">?</span>
            )}
            <div style={{ minWidth: 0 }}>
              <b>{detail?.pic?.nama || lead.pemilik_nama || 'Belum ada'}</b>
              <div className="adm-redup" style={{ fontSize: 12 }}>
                <span className="ld-peran biru">Sales PIC</span>
                {detail?.pic?.jabatan || (detail?.pic?.peran === 'sales' ? 'Sales' : 'Admin')}
              </div>
            </div>
            {!modeSales && (
              <button className="btn kecil" style={{ marginLeft: 'auto' }} onClick={() => setModal({ jenis: 'pic' })}>
                Ganti
              </button>
            )}
          </div>
          <div className="ld-orang">
            <span className="ld-inisial kecil ungu">{detail?.supervisor ? depan(detail.supervisor.nama)[0]?.toUpperCase() : '–'}</span>
            <div style={{ minWidth: 0 }}>
              <b>{detail?.supervisor?.nama || 'Belum ada supervisor'}</b>
              <div className="adm-redup" style={{ fontSize: 12 }}>
                <span className="ld-peran ungu">Supervisor</span>
                {detail?.supervisor ? detail.supervisor.jabatan || 'Atasan sales' : 'Atur atasan di HR Karyawan'}
              </div>
            </div>
            {detail?.supervisor && (
              <button className={`btn kecil ${macet ? 'bahaya' : ''}`} style={{ marginLeft: 'auto' }} onClick={() => setModal({ jenis: 'eskalasi' })}>
                Minta bantuan
              </button>
            )}
          </div>
        </div>

        {!lead.hasil && (
          <>
            <p className="adm-label ld-judul" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Alur pipeline</span>
              <span className="adm-redup" style={{ textTransform: 'none', letterSpacing: 0 }}>
                klik buat pindah
              </span>
            </p>
            <div className="adm-tahap" role="group" aria-label="Pindah tahap">
              {TAHAP_CRM.map((t, i) => {
                const lewat = !macet && t.id !== 'stuck' && i < tahapIdx;
                return (
                  <button key={t.id} className={(i === tahapIdx ? 'on' : lewat ? 'lewat' : '') + (t.id === 'stuck' ? ' stuck' : '')} onClick={() => pindahTahap(t.id)} aria-pressed={i === tahapIdx}>
                    {lewat ? '✓ ' : ''}
                    {t.nama}
                  </button>
                );
              })}
            </div>
            <div className="ld-hari">
              <span>
                Di tahap ini <b>{hari} hari</b>
              </span>
              {sisaTrial != null && (
                <span>
                  Sisa trial <b style={sisaTrial <= 2 ? { color: 'var(--merah)' } : undefined}>{sisaTrial} hari</b>
                </span>
              )}
            </div>
          </>
        )}
        {error && <p className="adm-error">{error}</p>}
      </div>

      <div className="ld-tabs" role="tablist">
        {[
          ['ringkas', 'Ringkasan', null],
          ['kunjungan', 'Kunjungan', kunjungan.length],
          ['riwayat', 'Riwayat', aktivitas?.length ?? null],
        ].map(([k, n, j]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {n}
            {j != null && <span className="adm-mono"> ({j})</span>}
          </button>
        ))}
      </div>

      <div className="ld-pad" style={{ paddingBottom: 18 }}>
        {!detail || !aktivitas ? (
          <Memuat apa="detail lead" />
        ) : tab === 'ringkas' ? (
          <TabRingkas api={api} base={base} modeSales={modeSales} lead={lead} detail={detail} aktivitas={aktivitas} muat={muat} setError={setError} centang={centang} onUbahData={() => setModal({ jenis: 'data' })} onMenang={() => ubah({ hasil: 'menang' }, 'Lead ditandai menang', () => ubah({ hasil: null }))} onGagal={() => setModal({ jenis: 'gagal' })} onHapus={() => setModal({ jenis: 'hapus' })} />
        ) : tab === 'kunjungan' ? (
          <TabKunjungan kunjungan={kunjungan} kategoriTop={kategoriTop} onWa={(kat) => setModal({ jenis: 'wa', template: kat })} onBuka={(k) => setModal({ jenis: 'lihat-kunjungan', k })} onLihatFoto={(url) => setModal({ jenis: 'foto', url })} onBaru={() => setModal({ jenis: 'kunjungan' })} />
        ) : (
          <TabRiwayat aktivitas={aktivitas} />
        )}
      </div>

      <nav className="ld-cepat" aria-label="Aksi cepat">
        {telp ? (
          <a href={`tel:+${telp}`} onClick={() => catat('telepon', 'Menelepon pelanggan').catch(() => {})}>
            <span className="ic biru">☎</span>Telepon
          </a>
        ) : (
          <button disabled title="Nomor telepon belum diisi">
            <span className="ic biru">☎</span>Telepon
          </button>
        )}
        <button onClick={() => setModal({ jenis: 'wa', template: terakhir && terakhir.kategori !== 'Tanpa keberatan' ? terakhir.kategori : 'umum' })}>
          <span className="ic hijau">✉</span>WhatsApp
        </button>
        <button onClick={() => setModal({ jenis: 'kunjungan' })}>
          <span className="ic kuning">+</span>Kunjungan
        </button>
        <button onClick={() => setModal({ jenis: 'catatan' })}>
          <span className="ic ungu">✎</span>Catatan
        </button>
      </nav>

      {toast && (
        <div className="ld-toast" role="status">
          <span>{toast.teks}</span>
          {toast.undo && (
            <button
              onClick={() => {
                const u = toast.undo;
                setToast(null);
                u();
              }}
            >
              Batalkan
            </button>
          )}
        </div>
      )}

      {modal?.jenis === 'wa' && (
        <ModalWa api={api} lead={lead} kunjungan={kunjungan} saya={saya} awal={modal.template} onTutup={() => setModal(null)} onTerkirim={(kat) => (setModal(null), catat('wa', `WA follow-up dikirim (${kat})`).catch(() => {}), setToast({ teks: 'WhatsApp dibuka' }))} />
      )}
      {modal?.jenis === 'eskalasi' && detail?.supervisor && (
        <ModalEskalasi lead={lead} sup={detail.supervisor} terakhir={terakhir} hari={hari} onTutup={() => setModal(null)} onTerkirim={() => (setModal(null), catat('eskalasi', `Minta bantuan ke ${detail.supervisor.nama}`).catch(() => {}), setToast({ teks: 'Permintaan bantuan dikirim' }))} />
      )}
      {modal?.jenis === 'catatan' && <ModalCatatan onTutup={() => setModal(null)} onSimpan={async (jenis, isi) => (await catat(jenis, isi), setModal(null), setTab('ringkas'), setToast({ teks: 'Catatan disimpan' }))} />}
      {modal?.jenis === 'gagal' && (
        <ModalGagal kunjungan={kunjungan} kategoriTop={kategoriTop} onTutup={() => setModal(null)} onSimpan={async (alasan) => (await ubah({ hasil: 'gagal', alasan_gagal: alasan }, 'Lead ditandai gagal')) && setModal(null)} />
      )}
      {modal?.jenis === 'pic' && <ModalPic admins={admins} sekarang={lead.pemilik_id} onTutup={() => setModal(null)} onPilih={async (id) => (await ubah({ pemilik_id: id }, 'Sales PIC diganti')) && setModal(null)} />}
      {modal?.jenis === 'data' && (
        <FormLead
          judul={`Ubah ${lead.kode}`}
          awal={lead}
          admins={admins}
          onTutup={() => setModal(null)}
          onSimpan={async (isi) => {
            await api('PATCH', `${base}/${lead.id}`, { ...isi, _catatUbah: true });
            setModal(null);
            segarkan();
            setToast({ teks: 'Perubahan disimpan' });
          }}
        />
      )}
      {modal?.jenis === 'hapus' && (
        <Konfirmasi
          judul="Hapus lead"
          pesan={`Hapus ${lead.perusahaan} (${lead.kode}) beserta ${kunjungan.length ? 'tautan ke ' + kunjungan.length + ' kunjungan dan ' : ''}semua catatannya? Ini nggak bisa dibalikin.`}
          onBatal={() => setModal(null)}
          onYa={async () => {
            try {
              await api('DELETE', `${base}/${lead.id}`);
              setModal(null);
              onTutup();
              onBerubah();
            } catch (e) {
              setError(e.message);
              setModal(null);
            }
          }}
        />
      )}
      {modal?.jenis === 'kunjungan' && (
        <FormLog
          api={api}
          awal={modal.l || { id_kunjungan: lead.perusahaan, lead_id: lead.id }}
          wajibGps={modeSales}
          onTutup={() => setModal(null)}
          onSelesai={(t) => {
            setModal(null);
            setTab('kunjungan');
            segarkan();
            setToast({ teks: t });
          }}
        />
      )}
      {modal?.jenis === 'lihat-kunjungan' && (
        <Detail
          api={api}
          l={modal.k}
          admin={saya}
          onTutup={() => setModal(null)}
          onUbah={(l) => setModal({ jenis: 'kunjungan', l })}
          onHapus={(t) => (setModal(null), segarkan(), setToast({ teks: t }))}
        />
      )}
      {modal?.jenis === 'foto' && (
        <Modal judul="Foto kunjungan" onTutup={() => setModal(null)}>
          <img src={modal.url} alt="Foto bukti kunjungan" style={{ maxWidth: '100%', border: 'var(--garis-tipis)', display: 'block' }} />
        </Modal>
      )}
    </aside>
  );
}

// Sampul: foto warung yang diupload, atau gambar warung (ilustrasi) kalau belum ada.
function SampulWarung({ lead, versi, base }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!lead.foto) return setUrl(null);
    let u = null;
    let batal = false;
    fetch(`/api${base}/${lead.id}/foto`, { headers: { Authorization: 'Bearer ' + (bacaSesi()?.token || '') } })
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((b) => !batal && setUrl((u = URL.createObjectURL(b))))
      .catch(() => !batal && setUrl(null));
    return () => {
      batal = true;
      if (u) URL.revokeObjectURL(u);
    };
  }, [lead.id, lead.foto, versi, base]);
  if (url) return <img src={url} alt={`Foto ${lead.perusahaan}`} />;
  return <IlustrasiWarung nama={lead.perusahaan} />;
}

function IlustrasiWarung({ nama }) {
  const warna = ['#DC2626', '#1D4ED8', '#FACC15', '#4ADE80', '#FB923C', '#fff', '#C4B5FD'];
  const papan = (nama || 'WARUNG').toUpperCase().slice(0, 22);
  return (
    <svg viewBox="0 0 400 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="400" height="150" fill="#9FD8FF" />
      <circle cx="352" cy="26" r="14" fill="#FACC15" stroke="#000" strokeWidth="2" />
      <rect x="0" y="132" width="400" height="18" fill="#bfb8a8" stroke="#000" strokeWidth="2" />
      <rect x="20" y="30" width="364" height="104" fill="#F1EFE9" stroke="#000" strokeWidth="2.5" />
      {Array.from({ length: 14 }, (_, i) => (
        <path key={i} d={`M${20 + i * 26} 36h26v10a13 13 0 0 1-26 0z`} fill={i % 2 ? '#fff' : '#DC2626'} stroke="#000" strokeWidth="2" />
      ))}
      <rect x="140" y="62" width="140" height="66" fill="#fff" stroke="#000" strokeWidth="2" />
      {Array.from({ length: 27 }, (_, n) => {
        const r = Math.floor(n / 9);
        const c = n % 9;
        return <rect key={n} x={150 + c * 14} y={70 + r * 20 + (6 - ((c + r) % 3) * 2)} width="11" height={12 + ((c + r) % 3) * 2} fill={warna[(c * 3 + r) % 7]} stroke="#000" strokeWidth="1.2" />;
      })}
      {Array.from({ length: 7 }, (_, i) => (
        <g key={i} stroke="#000" strokeWidth="1.2">
          <line x1={44 + i * 12} y1="52" x2={44 + i * 12} y2="58" />
          {[0, 1, 2, 3].map((j) => (
            <rect key={j} x={40 + i * 12} y={58 + j * 9} width="9" height="8" fill={warna[(i + j) % 7]} />
          ))}
        </g>
      ))}
      <rect x="300" y="64" width="62" height="70" fill="#1D4ED8" stroke="#000" strokeWidth="2" />
      <rect x="308" y="72" width="46" height="26" fill="#9FD8FF" stroke="#000" strokeWidth="1.5" />
      <rect x="120" y="116" width="180" height="16" fill="#8B5A2B" stroke="#000" strokeWidth="2" />
      <rect x="110" y="4" width="180" height="26" fill="#FACC15" stroke="#000" strokeWidth="2.5" />
      <text x="200" y="22" textAnchor="middle" fontFamily="inherit" fontWeight="800" fontSize="12" fill="#000">
        {papan}
      </text>
    </svg>
  );
}

// ---------------- Tab Ringkasan ----------------
function TabRingkas({ api, base, modeSales, lead, detail, aktivitas, muat, setError, centang, onUbahData, onMenang, onGagal, onHapus }) {
  const [baru, setBaru] = useState('');
  const selesai = detail.checklist.filter((c) => c.selesai).length;
  const catatan = aktivitas.filter((a) => CATATAN.includes(a.jenis));
  const tambah = async () => {
    const t = baru.trim();
    if (!t) return;
    try {
      await api('POST', `${base}/${lead.id}/checklist`, { teks: t });
      setBaru('');
      muat();
    } catch (e) {
      setError(e.message);
    }
  };
  const baris = (k, v, href) => (
    <div className="ld-baris">
      <span className="adm-redup">{k}</span>
      <span className={v ? '' : 'kosong'}>
        {v ? (
          href ? (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {v}
            </a>
          ) : (
            v
          )
        ) : (
          'Belum diisi'
        )}
      </span>
    </div>
  );
  return (
    <>
      <p className="adm-label ld-judul" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Info kontak</span>
        <button className="adm-link" onClick={onUbahData}>
          Ubah data
        </button>
      </p>
      <div className="adm-kartu ld-info">
        {baris('Nama PIC', lead.pic_nama)}
        {baris('Telepon', lead.telepon)}
        {baris('Email', lead.email)}
        {baris('Alamat', lead.alamat, lead.alamat ? `https://www.google.com/maps?q=${encodeURIComponent(lead.alamat)}` : null)}
        {lead.lat != null && baris('Titik toko', `${Number(lead.lat).toFixed(6)}, ${Number(lead.lng).toFixed(6)}`, `https://www.google.com/maps?q=${lead.lat},${lead.lng}`)}
        {baris('Sumber', lead.sumber)}
        {baris('Dibuat', tgl(lead.created_at))}
      </div>

      <p className="adm-label ld-judul" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Checklist follow-up</span>
        <span>
          {selesai}/{detail.checklist.length}
        </span>
      </p>
      <div className="adm-kartu ld-cek">
        {detail.checklist.map((c) => (
          <label key={c.id} className={c.selesai ? 'selesai' : ''}>
            <input type="checkbox" checked={c.selesai} onChange={() => centang(c)} />
            <span>{c.teks}</span>
            <button
              className="ld-hapus"
              aria-label={`Hapus ${c.teks}`}
              onClick={async (e) => {
                e.preventDefault();
                try {
                  await api('DELETE', `${base}/${lead.id}/checklist/${c.id}`);
                  muat();
                } catch (err) {
                  setError(err.message);
                }
              }}
            >
              ×
            </button>
          </label>
        ))}
        <div className="ld-cek-baru">
          <span aria-hidden="true">+</span>
          <input value={baru} onChange={(e) => setBaru(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), tambah())} placeholder="Tambah langkah follow-up, tekan Enter" aria-label="Tambah langkah follow-up" maxLength={200} />
        </div>
      </div>

      <p className="adm-label ld-judul" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Catatan internal</span>
        <span>{catatan.length}</span>
      </p>
      {catatan.length === 0 ? (
        <p className="adm-redup" style={{ margin: 0 }}>
          Belum ada catatan. Pakai tombol Catatan di bawah.
        </p>
      ) : (
        <div className="adm-riwayat">
          {catatan.slice(0, 20).map((a) => (
            <div key={a.id} className="adm-riwayat-item">
              <div style={{ whiteSpace: 'pre-wrap' }}>{a.isi}</div>
              <div className="adm-redup" style={{ fontSize: 12, marginTop: 4, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className={`adm-chip ${WARNA[a.jenis] || ''}`}>{JENIS[a.jenis] || a.jenis}</span>
                {a.admin_nama || '-'} · {waktuRelatif(a.created_at)}
              </div>
            </div>
          ))}
        </div>
      )}

      {!lead.hasil && (
        <div className="ld-dua" style={{ marginTop: 18 }}>
          <button className="btn" style={{ background: 'var(--hijau)' }} onClick={onMenang}>
            Tandai menang
          </button>
          <button className="btn bahaya" onClick={onGagal}>
            Tandai gagal
          </button>
        </div>
      )}
      {!modeSales && (
        <button className="adm-link" style={{ marginTop: 14, color: 'var(--merah)' }} onClick={onHapus}>
          Hapus lead ini
        </button>
      )}
    </>
  );
}

// ---------------- Tab Kunjungan ----------------
function TabKunjungan({ kunjungan, kategoriTop, onWa, onBuka, onLihatFoto, onBaru }) {
  const [buka, setBuka] = useState(() => new Set(kunjungan[0] ? [kunjungan[0].id] : []));
  const ditolak = kunjungan.filter((k) => k.hasil === 'ditolak').length;
  const andalan = kategoriTop ? kunjungan.find((k) => k.kategori === kategoriTop && k.fakta)?.fakta : null;
  if (!kunjungan.length)
    return (
      <div className="adm-kartu" style={{ marginTop: 14, textAlign: 'center' }}>
        <p className="adm-redup" style={{ marginTop: 0 }}>
          Belum ada kunjungan yang nempel ke kartu ini.
        </p>
        <button className="btn kecil utama" onClick={onBaru}>
          + Catat kunjungan
        </button>
      </div>
    );
  return (
    <>
      <div className="ld-stat">
        <div className="adm-kartu">
          <span className="adm-label">Kunjungan</span>
          <b className="p-num">{kunjungan.length}</b>
        </div>
        <div className="adm-kartu">
          <span className="adm-label">Ditolak</span>
          <b className="p-num" style={{ color: 'var(--merah)' }}>
            {ditolak}
          </b>
        </div>
        <div className="adm-kartu">
          <span className="adm-label">Keberatan top</span>
          <b style={{ fontSize: 13 }}>{kategoriTop || '-'}</b>
        </div>
      </div>
      {andalan && (
        <div className="ld-tip">
          <b>Jawaban andalan buat "{kategoriTop}":</b> {andalan}
        </div>
      )}
      {kunjungan.map((k) => {
        const terbuka = buka.has(k.id);
        const h = HASIL[k.hasil];
        return (
          <div key={k.id} className={'adm-kartu ld-kunjungan' + (terbuka ? '' : ' tutup')}>
            <button className="ld-kunjungan-kepala" aria-expanded={terbuka} onClick={() => setBuka((s) => (s.has(k.id) ? new Set([...s].filter((x) => x !== k.id)) : new Set([...s, k.id])))}>
              <span style={{ minWidth: 0, textAlign: 'left' }}>
                <b>
                  #{k.nomor} · {k.kategori}
                </b>
                <span className="adm-redup adm-mono" style={{ display: 'block', fontSize: 11 }}>
                  {tgl(k.tanggal)} · {k.sales_nama || '-'}
                  {k.foto?.length ? ` · ${k.foto.length} foto` : ''}
                  {k.lat != null ? ' · lokasi' : ''}
                </span>
              </span>
              <span className={`adm-chip ${h?.warna || ''}`}>{h?.pendek || k.hasil}</span>
            </button>
            {terbuka && (
              <div className="ld-kunjungan-isi">
                {k.kategori !== 'Tanpa keberatan' && <div className="ld-kutip">“{k.ucapan}”</div>}
                <div className="ld-obrolan">
                  <div className="saya">
                    <span>Sales</span>
                    {k.respon_sales || <i>belum diisi</i>}
                  </div>
                  {k.respon_customer && (
                    <div>
                      <span>Pelanggan</span>
                      {k.respon_customer}
                    </div>
                  )}
                </div>
                {k.catatan && (
                  <div className="ld-insight">
                    <b>Insight:</b> {k.catatan}
                  </div>
                )}
                {(k.foto?.length > 0 || k.lat != null) && (
                  <div className="ld-bukti">
                    {k.foto.map((f) => (
                      <Foto key={f.id} id={f.id} onBuka={onLihatFoto} />
                    ))}
                    {k.lat != null && (
                      <a className="adm-link" href={`https://www.google.com/maps?q=${k.lat},${k.lng}`} target="_blank" rel="noopener noreferrer">
                        Buka lokasi di Maps
                      </a>
                    )}
                  </div>
                )}
                <div className="adm-tombol" style={{ justifyContent: 'flex-end', marginTop: 0 }}>
                  {k.kategori !== 'Tanpa keberatan' && (
                    <button className="btn kecil" style={{ background: 'var(--hijau)' }} onClick={() => onWa(k.kategori)}>
                      WA follow-up
                    </button>
                  )}
                  <button className="btn kecil" onClick={() => onBuka(k)}>
                    Buka detail
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

// ---------------- Tab Riwayat ----------------
function TabRiwayat({ aktivitas }) {
  const [filter, setFilter] = useState('semua');
  const [bukaGrup, setBukaGrup] = useState(new Set());
  const cocok = (a) =>
    filter === 'semua' ||
    (filter === 'tahap' && a.jenis === 'tahap') ||
    (filter === 'kunjungan' && a.jenis === 'kunjungan') ||
    (filter === 'catatan' && CATATAN.includes(a.jenis)) ||
    (filter === 'lainnya' && ['data', 'checklist'].includes(a.jenis));
  // Perubahan tahap beruntun (orang yang sama, jarak < 10 menit) digabung jadi satu kartu.
  const item = [];
  for (const a of aktivitas.filter(cocok)) {
    const g = item[item.length - 1];
    const tahapPindah = a.jenis === 'tahap' && a.isi.startsWith('Tahap:');
    const dekat = (x) => x && x.admin_nama === a.admin_nama && new Date(x.akhir || x.created_at) - new Date(a.created_at) < 10 * 60000;
    if (tahapPindah && g?.grup && dekat(g)) {
      g.isi.push(a);
      g.akhir = a.created_at;
      continue;
    }
    if (tahapPindah && g && !g.grup && g.jenis === 'tahap' && g.isi.startsWith('Tahap:') && dekat(g)) {
      item[item.length - 1] = { grup: true, id: 'g' + g.id, admin_nama: a.admin_nama, created_at: g.created_at, akhir: a.created_at, isi: [g, a] };
      continue;
    }
    item.push(a);
  }
  return (
    <>
      <div className="adm-chip-filter" style={{ marginTop: 14 }}>
        {FILTER.map(([k, n]) => (
          <button key={k} className={`adm-chip ${filter === k ? 'biru' : ''}`} onClick={() => setFilter(k)} aria-pressed={filter === k}>
            {n}
          </button>
        ))}
      </div>
      {item.length === 0 ? (
        <p className="adm-redup">Nggak ada riwayat buat filter ini.</p>
      ) : (
        <div className="adm-riwayat">
          {item.map((a) =>
            a.grup ? (
              <div key={a.id} className="adm-riwayat-item ld-grup">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span className="adm-chip ungu">Perubahan</span>
                  <span className="adm-redup">{waktu(a.created_at)}</span>
                </div>
                <div style={{ margin: '6px 0 2px' }}>
                  {a.isi.length} perubahan tahap beruntun, akhirnya di <b>{a.isi[0].isi.split('→').pop().trim()}</b>
                </div>
                <div className="adm-redup">oleh {a.admin_nama || '-'}</div>
                {a.isi.length >= 3 && <div className="adm-error" style={{ fontSize: 12, margin: '4px 0 0' }}>Tahap bolak-balik dalam waktu singkat, kemungkinan salah klik.</div>}
                <button className="btn kecil" style={{ marginTop: 8 }} onClick={() => setBukaGrup((s) => new Set(s.has(a.id) ? [...s].filter((x) => x !== a.id) : [...s, a.id]))}>
                  {bukaGrup.has(a.id) ? 'Tutup detail' : 'Lihat detail'}
                </button>
                {bukaGrup.has(a.id) && (
                  <div className="adm-mono" style={{ fontSize: 12, marginTop: 8, display: 'grid', gap: 3 }}>
                    {a.isi.map((x) => (
                      <div key={x.id}>
                        {waktu(x.created_at)} · {x.isi.replace('Tahap: ', '')}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div key={a.id} className="adm-riwayat-item">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span className={`adm-chip ${WARNA[a.jenis] || ''}`}>{JENIS[a.jenis] || a.jenis}</span>
                  <span className="adm-redup">{waktu(a.created_at)}</span>
                </div>
                <div style={{ whiteSpace: 'pre-wrap', margin: '6px 0 2px' }}>{a.isi}</div>
                <div className="adm-redup">oleh {a.admin_nama || '-'}</div>
              </div>
            )
          )}
        </div>
      )}
    </>
  );
}

// ---------------- Modal-modal ----------------
function Pilihan({ daftar, nilai, onPilih, label }) {
  return (
    <div className="adm-chip-filter" role="group" aria-label={label} style={{ margin: '0 0 12px' }}>
      {daftar.map(([k, n]) => (
        <button key={k} type="button" className={`adm-chip ${nilai === k ? 'biru' : ''}`} aria-pressed={nilai === k} onClick={() => onPilih(k)}>
          {n}
        </button>
      ))}
    </div>
  );
}

function ModalWa({ api, lead, kunjungan, saya, awal, onTutup, onTerkirim }) {
  const [kamus, setKamus] = useState(null);
  useEffect(() => {
    api('GET', '/lapangan/keberatan').then(setKamus, () => setKamus([]));
  }, [api]);
  const kategori = [...new Set(kunjungan.map((k) => k.kategori).filter((k) => k && k !== 'Tanpa keberatan'))];
  const daftar = [['umum', 'Umum'], ...(lead.tahap === 'trial' || awal === 'paket' ? [['paket', 'Tawaran paket']] : []), ...kategori.map((k) => [k, k])];
  const [pilih, setPilih] = useState(daftar.some(([k]) => k === awal) ? awal : 'umum');
  const sapa = `Assalamualaikum${lead.pic_nama ? ' ' + depan(lead.pic_nama) : ''}, ini ${depan(saya.nama) || 'saya'} dari Asisten Warung.`;
  const isiDari = (k) => {
    if (k === 'umum') return 'Gimana, ada yang bisa saya bantu soal aplikasinya?';
    if (k === 'paket') return 'Masa coba gratisnya sebentar lagi habis. Kalau cocok, paketnya Rp78rb/bulan, Rp210rb/3 bulan, atau Rp684rb/tahun. Mau saya bantu aktifin?';
    const kb = (kamus || []).find((x) => x.kategori === k);
    const dariKunjungan = kunjungan.find((x) => x.kategori === k);
    return kb?.contoh_jawaban || dariKunjungan?.contoh_jawaban || kb?.fakta || dariKunjungan?.fakta || 'Gimana, ada yang bisa saya bantu soal aplikasinya?';
  };
  const [teks, setTeks] = useState('');
  useEffect(() => {
    if (kamus) setTeks(`${sapa} ${isiDari(pilih)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kamus, pilih]);
  return (
    <Modal judul="Kirim WhatsApp" onTutup={onTutup}>
      <p style={{ marginTop: 0 }}>
        Ke <b>{lead.pic_nama || lead.perusahaan}</b> <span className="adm-mono">{lead.telepon || '(nomor belum diisi)'}</span>
      </p>
      <span className="adm-label">Template</span>
      <Pilihan daftar={daftar} nilai={pilih} onPilih={setPilih} label="Template pesan" />
      <div className="field">
        <label htmlFor="ld-wa">Pesan</label>
        {!kamus ? <Memuat apa="template" /> : <textarea id="ld-wa" className="adm-input" style={{ minHeight: 130 }} value={teks} onChange={(e) => setTeks(e.target.value)} />}
        <p className="adm-redup" style={{ fontSize: 12, margin: '4px 0 0' }}>
          Isinya dari kamus contekan buat keberatan itu. Edit dulu biar kedengeran kayak kamu sendiri.
        </p>
      </div>
      {!lead.telepon && <p className="adm-error">Nomor telepon lead ini belum diisi. Isi dulu lewat Ubah data.</p>}
      <div className="adm-tombol" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onTutup}>
          Batal
        </button>
        <button
          className="btn"
          style={{ background: 'var(--hijau)' }}
          disabled={!lead.telepon || !teks.trim()}
          onClick={() => {
            window.open(waLink(lead.telepon, teks), '_blank', 'noopener');
            onTerkirim(daftar.find(([k]) => k === pilih)?.[1] || pilih);
          }}
        >
          Buka WhatsApp
        </button>
      </div>
    </Modal>
  );
}

function ModalEskalasi({ lead, sup, terakhir, hari, onTutup, onTerkirim }) {
  const [teks, setTeks] = useState(
    `Kak ${depan(sup.nama)}, minta bantuan buat lead ${lead.perusahaan} (${lead.kode}). Tahap ${namaTahap(lead.tahap).nama} udah ${hari} hari. Keberatan terakhir: ${
      terakhir ? `${terakhir.kategori}${terakhir.respon_customer ? ` · "${terakhir.respon_customer}"` : ''}` : '-'
    }. Enaknya dijawab gimana ya?`
  );
  return (
    <Modal judul="Minta bantuan supervisor" onTutup={onTutup}>
      <p style={{ marginTop: 0 }}>
        Ke <b>{sup.nama}</b> {sup.jabatan ? <span className="adm-redup">· {sup.jabatan}</span> : null}
      </p>
      <div className="field">
        <label htmlFor="ld-esk">Pesan</label>
        <textarea id="ld-esk" className="adm-input" style={{ minHeight: 120 }} value={teks} onChange={(e) => setTeks(e.target.value)} />
      </div>
      {!sup.no_hp && <p className="adm-error">Nomor HP supervisor belum diisi di HR Karyawan.</p>}
      <div className="adm-tombol" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onTutup}>
          Batal
        </button>
        <button
          className="btn utama"
          disabled={!sup.no_hp || !teks.trim()}
          onClick={() => {
            window.open(waLink(sup.no_hp, teks), '_blank', 'noopener');
            onTerkirim();
          }}
        >
          Kirim lewat WA
        </button>
      </div>
    </Modal>
  );
}

function ModalCatatan({ onTutup, onSimpan }) {
  const [jenis, setJenis] = useState('catatan');
  const [isi, setIsi] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal judul="Tambah catatan" onTutup={onTutup}>
      <span className="adm-label">Jenis</span>
      <Pilihan
        daftar={[
          ['catatan', 'Catatan'],
          ['follow_up', 'Follow up'],
          ['kendala', 'Kendala'],
        ]}
        nilai={jenis}
        onPilih={setJenis}
        label="Jenis catatan"
      />
      <textarea className="adm-input" style={{ minHeight: 90 }} value={isi} onChange={(e) => setIsi(e.target.value)} placeholder="Tulis aktivitas, follow up, atau kenapa macet" aria-label="Isi catatan" maxLength={1000} />
      {error && <p className="adm-error">{error}</p>}
      <div className="adm-tombol" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onTutup}>
          Batal
        </button>
        <button
          className="btn utama"
          disabled={sibuk || !isi.trim()}
          onClick={async () => {
            setSibuk(true);
            try {
              await onSimpan(jenis, isi.trim());
            } catch (e) {
              setError(e.message);
              setSibuk(false);
            }
          }}
        >
          Simpan catatan
        </button>
      </div>
    </Modal>
  );
}

function ModalGagal({ kunjungan, kategoriTop, onTutup, onSimpan }) {
  const kategori = [...new Set(kunjungan.map((k) => k.kategori).filter((k) => k && k !== 'Tanpa keberatan'))];
  const daftar = [...kategori, ...ALASAN_LAIN].map((k) => [k, k]);
  const [alasan, setAlasan] = useState(kategoriTop || daftar[0][0]);
  const [lain, setLain] = useState('');
  const [sibuk, setSibuk] = useState(false);
  return (
    <Modal judul="Tandai gagal" onTutup={onTutup}>
      <span className="adm-label">Alasan utama</span>
      <Pilihan daftar={daftar} nilai={alasan} onPilih={setAlasan} label="Alasan gagal" />
      {kategoriTop && (
        <p className="adm-redup" style={{ fontSize: 12, marginTop: -6 }}>
          Udah dipilihin dari keberatan yang paling sering muncul.
        </p>
      )}
      {alasan === 'Lainnya' && <input className="adm-input" value={lain} onChange={(e) => setLain(e.target.value)} placeholder="Tulis alasannya" aria-label="Alasan lainnya" maxLength={80} />}
      <div className="adm-tombol" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onTutup}>
          Batal
        </button>
        <button
          className="btn bahaya"
          disabled={sibuk || (alasan === 'Lainnya' && !lain.trim())}
          onClick={async () => {
            setSibuk(true);
            await onSimpan(alasan === 'Lainnya' ? lain.trim() : alasan);
            setSibuk(false);
          }}
        >
          Tandai gagal
        </button>
      </div>
    </Modal>
  );
}

function ModalPic({ admins, sekarang, onTutup, onPilih }) {
  const aktif = admins.filter((a) => a.aktif);
  return (
    <Modal judul="Ganti sales PIC" onTutup={onTutup}>
      <div className="adm-riwayat">
        {aktif.map((a) => (
          <button key={a.id} className="adm-riwayat-item ld-pilih-orang" onClick={() => a.id !== sekarang && onPilih(a.id)} aria-pressed={a.id === sekarang}>
            <span className="ld-inisial kecil">{a.nama[0].toUpperCase()}</span>
            <span style={{ textAlign: 'left', minWidth: 0 }}>
              <b>{a.nama}</b>
              <span className="adm-redup" style={{ display: 'block', fontSize: 12 }}>
                @{a.username} · {a.peran === 'sales' ? 'Sales' : 'Admin'}
              </span>
            </span>
            {a.id === sekarang && (
              <span className="adm-chip hijau" style={{ marginLeft: 'auto' }}>
                Sekarang
              </span>
            )}
          </button>
        ))}
      </div>
    </Modal>
  );
}
