import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { tampilHp, tgl, waktu } from '../lib/format.js';
import { Gagal, Kosong, Memuat, Modal, useData } from '../komponen/Ui.jsx';
import { Catatan, DataLamaran, FollowUp, TAHAP } from './Rekrutmen.jsx';

// Board rekrutmen (revisi Sep 2026): 5 kolom, syarat wajib + skor pendukung otomatis, siapa yang harus gerak + batas
// waktu (cuma ditandai, nggak otomatis ngeluarin), pilih banyak di kolom Masuk + antrian WA materi, panel kandidat
// dengan langkah per tahap. Aturan & hitungannya di server/rekrutmenAlur.js.
const ALASAN_KELUAR = [
  ['rejected', 'Tidak punya motor'],
  ['rejected', 'HP bukan Android'],
  ['rejected', 'Tidak cocok skema kerja'],
  ['rejected', 'Gagal kuis product'],
  ['rejected', 'Tidak lolos interview'],
  ['rejected', 'Gagal trial lapangan'],
  ['no_response', 'No response'],
  ['withdrawn', 'Mundur sendiri'],
  ['rejected', 'Data tidak valid'],
  ['rejected', 'Lainnya'],
];
const KELUAR_NAMA = { rejected: 'Ditolak', withdrawn: 'Mundur', no_response: 'No response', on_hold: 'On hold', talent_pool: 'Talent pool' };
const nomorWa = (hp) => {
  const d = String(hp || '').replace(/\D/g, '');
  return d.startsWith('0') ? '62' + d.slice(1) : d;
};
export const bukaWa = (hp, teks) => window.open(`https://wa.me/${nomorWa(hp)}?text=${encodeURIComponent(teks)}`, '_blank', 'noopener');
const depan = (n) => {
  const d = (n || '').trim().split(/\s+/)[0] || '';
  return d.charAt(0).toUpperCase() + d.slice(1).toLowerCase();
};
const durasi = (jam) => {
  const j = Math.max(0, jam);
  return j >= 24 ? `${Math.floor(j / 24)}h ${Math.floor(j % 24)}j` : `${Math.max(1, Math.floor(j))} jam`;
};
const sisaJam = (iso) => (new Date(iso).getTime() - Date.now()) / 3600000;
const kelasBar = (p, m) => (p / m >= 0.75 ? 'hi' : p / m >= 0.4 ? 'mid' : 'low');
const SIAPA = { kamu: 'kamu', kandidat: 'kandidat', jadwal: 'jadwal', selesai: 'selesai' };

// ---------------- Board ----------------
export default function Board({ api, versi, onBuka, setPesan, onUrutan }) {
  const [v, setV] = useState(0);
  const { data, error, muat } = useData(api, `/rekrutmen/board?v=${versi}-${v}`);
  const [mine, setMine] = useState(false);
  const [cari, setCari] = useState('');
  const [pilih, setPilih] = useState(() => new Set());
  const [antrian, setAntrian] = useState([]);
  const [sibuk, setSibuk] = useState(false);
  const segarkan = () => setV((x) => x + 1);

  const q = cari.trim().toLowerCase();
  const kandidat = useMemo(() => (data?.kandidat || []).filter((k) => !q || [k.nama, k.no_hp, k.kode, k.sumber_kode].some((x) => (x || '').toLowerCase().includes(q))), [data, q]);
  const tampil = mine ? kandidat.filter((k) => k.keadaan.siapa === 'kamu') : kandidat;
  // Urutan buat J/K di panel kandidat: ikut urutan board.
  useEffect(() => {
    onUrutan?.(tampil.map((k) => k.id));
  }, [tampil, onUrutan]);

  if (error) return <Gagal apa="board rekrutmen" pesan={error} onUlang={muat} />;
  if (!data) return <Memuat apa="board rekrutmen" />;
  const perluKamu = data.kandidat.filter((k) => k.keadaan.siapa === 'kamu').length;
  const massal = async (aksi, ids) => {
    setSibuk(true);
    try {
      const r = await api('POST', '/rekrutmen/massal', { ids, aksi });
      if (aksi === 'loloskan') setAntrian((a) => [...a, ...r.antrian]);
      setPesan(`${r.antrian.length} kandidat ${aksi === 'loloskan' ? 'diloloskan, antrian WA materi siap' : 'ditolak'}${r.gagal.length ? `, ${r.gagal.length} gagal: ${r.gagal[0].error}` : ''}.`);
      setPilih(new Set());
      segarkan();
    } catch (e) {
      setPesan('Gagal: ' + e.message);
    } finally {
      setSibuk(false);
    }
  };
  const berikut = antrian[0];

  return (
    <>
      <div className="rk-alat">
        <button className="rk-toggle" aria-pressed={mine} onClick={() => setMine((x) => !x)}>
          <span className="rk-sw" aria-hidden="true" />
          Perlu aksi kamu <b className="adm-mono">{perluKamu}</b>
        </button>
        <input className="adm-input rk-cari" type="search" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari nama, no. HP, kode" aria-label="Cari kandidat" />
        {data.slotKosong === 0 && (
          <a className="adm-chip kuning" href="#/rekrutmen/jadwal">
            Slot interview kosong 0, isi ketersediaan
          </a>
        )}
      </div>

      <div className="rk-funnel" aria-label="Funnel rekrutmen">
        {data.kolom.map((k, i) => (
          <div key={k.id}>
            <span className="adm-redup">{k.nama}</span>
            <b className="p-num">{data.funnel[i]}</b>
            <span className="rk-funnel-p">{i === 0 ? 'total pelamar' : `${data.funnel[i - 1] ? Math.round((data.funnel[i] / data.funnel[i - 1]) * 100) : 0}% dari tahap sebelumnya`}</span>
            <i style={{ width: `${data.funnel[0] ? (data.funnel[i] / data.funnel[0]) * 100 : 0}%` }} />
          </div>
        ))}
      </div>

      {berikut && (
        <div className="rk-antrian" role="status">
          <b>Antrian WA materi: {antrian.length} lagi</b>
          <span>Berikutnya: {berikut.nama}</span>
          <button
            className="btn kecil utama"
            onClick={() => {
              bukaWa(berikut.hp, berikut.teks);
              setAntrian((a) => a.slice(1));
            }}
          >
            Buka WA {depan(berikut.nama)}
          </button>
          <button className="btn kecil" onClick={() => setAntrian((a) => a.slice(1))}>
            Lewati
          </button>
        </div>
      )}

      <div className="rk-board">
        {data.kolom.map((kol, i) => {
          const isi = tampil.filter((k) => k.kolom === i);
          const semua = kandidat.filter((k) => k.kolom === i);
          return (
            <section key={kol.id} className="rk-kolom" aria-label={`Kolom ${kol.nama}`}>
              <header className="rk-kolom-kepala">
                <h2>{kol.nama}</h2>
                <span className="rk-jumlah adm-mono">{semua.length}</span>
              </header>
              <p className="rk-kolom-sub">{kol.ket}</p>
              <div className="rk-kolom-isi">
                {i === 0 ? (
                  ['lolos', 'gagal'].map((lajur) => {
                    const daftar = isi.filter((k) => (lajur === 'lolos' ? k.analisis.lolos : !k.analisis.lolos));
                    const dipilih = daftar.filter((k) => pilih.has(k.id));
                    return (
                      <div key={lajur} className={`rk-lajur ${lajur}`}>
                        <div className="rk-lajur-kepala">
                          <input
                            type="checkbox"
                            aria-label={`Pilih semua ${lajur === 'lolos' ? 'lolos wajib' : 'gagal wajib'}`}
                            checked={daftar.length > 0 && dipilih.length === daftar.length}
                            onChange={(e) =>
                              setPilih((s) => {
                                const n = new Set(s);
                                daftar.forEach((k) => (e.target.checked ? n.add(k.id) : n.delete(k.id)));
                                return n;
                              })
                            }
                          />
                          {lajur === 'lolos' ? 'Lolos wajib' : 'Gagal wajib'} ({daftar.length})
                          <button
                            className={`btn kecil ${lajur === 'lolos' ? 'utama' : 'bahaya'}`}
                            style={{ marginLeft: 'auto' }}
                            disabled={!dipilih.length || sibuk}
                            onClick={() => massal(lajur === 'lolos' ? 'loloskan' : 'tolak', dipilih.map((k) => k.id))}
                          >
                            {lajur === 'lolos' ? 'Loloskan' : 'Tolak'} {dipilih.length || ''}
                          </button>
                        </div>
                        <div className="rk-lajur-isi">
                          {daftar.length ? daftar.map((k) => <Kartu key={k.id} k={k} onBuka={onBuka} pilih={pilih} setPilih={setPilih} />) : <p className="rk-kosong">Kosong</p>}
                        </div>
                      </div>
                    );
                  })
                ) : isi.length ? (
                  isi.map((k) => <Kartu key={k.id} k={k} onBuka={onBuka} />)
                ) : (
                  <p className="rk-kosong">{mine ? 'Nggak ada yang nunggu kamu di sini' : 'Belum ada kandidat'}</p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <details className="rk-keluar">
        <summary>Dikeluarkan dari proses ({data.keluar.length})</summary>
        <div className="rk-keluar-isi">
          {data.keluar.length === 0 ? (
            <p className="adm-redup">Belum ada.</p>
          ) : (
            data.keluar.map((k) => (
              <div key={k.id} className="rk-keluar-baris">
                <button className="adm-link" onClick={() => onBuka(k.id)}>
                  {k.nama}
                </button>
                <span className="adm-redup">
                  dari {data.kolom[Math.max(0, k.kolom_asal)]?.nama} · {KELUAR_NAMA[k.status] || k.status}: {k.alasan_keluar || '-'}
                </span>
                <button
                  className="btn kecil"
                  onClick={async () => {
                    try {
                      await api('POST', `/rekrutmen/lamaran/${k.id}/kembalikan`);
                      setPesan(`${k.nama} dikembalikan ke proses.`);
                      segarkan();
                    } catch (e) {
                      setPesan('Gagal: ' + e.message);
                    }
                  }}
                >
                  Kembalikan
                </button>
              </div>
            ))
          )}
        </div>
      </details>
    </>
  );
}

function Kartu({ k, onBuka, pilih, setPilih }) {
  const s = k.keadaan;
  const sisa = s.batas ? sisaJam(s.batas) : null;
  const merah = s.lewat || (sisa != null && sisa < 6);
  const a = k.analisis;
  return (
    <div
      className={'rk-kartu' + (merah ? ' merah' : '')}
      role="button"
      tabIndex={0}
      onClick={(e) => !e.target.matches('input') && onBuka(k.id)}
      onKeyDown={(e) => e.key === 'Enter' && !e.target.matches('input') && onBuka(k.id)}
      aria-label={`Buka ${k.nama}`}
    >
      {pilih && (
        <input
          type="checkbox"
          className="rk-pilih"
          checked={pilih.has(k.id)}
          aria-label={`Pilih ${k.nama}`}
          onChange={(e) =>
            setPilih((x) => {
              const n = new Set(x);
              e.target.checked ? n.add(k.id) : n.delete(k.id);
              return n;
            })
          }
        />
      )}
      <span className="rk-kartu-isi">
        <span className="rk-baris1">
          <span className={`rk-titik ${a.lolos ? 'lolos' : 'gagal'}`} title={a.lolos ? 'Lolos syarat wajib' : 'Gagal syarat wajib'} />
          <b>{k.nama}</b>
          <span className="adm-mono rk-skor" title="Skor pendukung">
            {a.skor ?? '–'}
          </span>
        </span>
        <span className="rk-baris2 adm-mono">
          {k.kode}
          {a.flags.length > 0 && <span className="rk-tanda"> · ⚠ {a.flags.length}</span>}
          {!a.lolos && <span className="rk-tanda"> · {a.gagal.map((g) => g.k).join(', ')} ✕</span>}
        </span>
        {k.kolom === 1 && (
          <span className="rk-pil">
            <span className={k.apk_at ? 'ok' : ''}>APK {k.apk_at ? '✓' : '–'}</span>
            <span className={k.kuis?.lulus ? 'ok' : k.kuis ? 'no' : ''}>Kuis {k.kuis ? `${k.kuis.benar}/${k.kuis.dari}` : '–/5'}</span>
          </span>
        )}
        {k.kolom === 3 && (
          <span className="rk-pil">
            <span className={k.trial?.warungH1 >= 3 ? 'ok' : ''}>Warung {k.trial?.warungH1 ?? 0}/3</span>
            <span className={k.trial?.closing >= 3 ? 'ok' : ''}>Closing {k.trial?.closing ?? 0}/3</span>
          </span>
        )}
        {s.siapa !== 'selesai' && (
          <span className="rk-baris3">
            <span className={`rk-siapa ${SIAPA[s.siapa]}${s.lewat ? ' lewat' : ''}`}>{s.label}</span>
            <span className={'rk-sla' + (merah ? ' merah' : '')}>
              {s.siapa === 'jadwal' ? waktu(s.info) : sisa != null ? (s.lewat ? s.info : `${s.info} · sisa ${durasi(sisa)}`) : s.info}
            </span>
          </span>
        )}
      </span>
    </div>
  );
}

// ---------------- Panel kandidat ----------------
export function DetailKandidat({ api, id, urutan = [], onTutup, onBerubah, onBuka }) {
  const [d, setD] = useState(null);
  const [alur, setAlur] = useState(null);
  const [error, setError] = useState('');
  const [pesan, setPesan] = useState('');
  const [v, setV] = useState(0);
  const [modal, setModal] = useState(null);
  const ref = useRef(null);
  const keluarRef = useRef(null);

  useEffect(() => {
    let batal = false;
    Promise.all([api('GET', `/rekrutmen/lamaran/${id}`), api('GET', `/rekrutmen/lamaran/${id}/alur`)])
      .then(([x, y]) => !batal && (setD(x), setAlur(y), setError('')))
      .catch((e) => !batal && setError(e.message));
    return () => {
      batal = true;
    };
  }, [api, id, v]);
  const idx = urutan.indexOf(id);
  const geser = useCallback((arah) => urutan.length && onBuka(urutan[(Math.max(0, idx) + arah + urutan.length) % urutan.length]), [urutan, idx, onBuka]);
  useEffect(() => {
    ref.current?.focus();
    const tekan = (e) => {
      if (document.querySelector('.adm-modal')) return;
      if (e.key === 'Escape') return onTutup();
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'j') geser(1);
      else if (e.key === 'k') geser(-1);
      else if (e.key === 'a') ref.current?.querySelector('[data-utama]:not(:disabled)')?.click();
      else if (e.key === 'r' && keluarRef.current) {
        keluarRef.current.open = true;
        keluarRef.current.querySelector('select')?.focus();
        keluarRef.current.scrollIntoView({ block: 'center' });
      }
    };
    document.addEventListener('keydown', tekan);
    return () => document.removeEventListener('keydown', tekan);
  }, [onTutup, geser]);

  const kirim = async (path, body, ok) => {
    setError('');
    setPesan('');
    try {
      const hasil = await api('POST', `/rekrutmen/lamaran/${id}${path}`, body);
      if (ok) setPesan(typeof ok === 'function' ? ok(hasil) : ok);
      setV((x) => x + 1);
      onBerubah();
      return hasil || true;
    } catch (e) {
      setError(e.message);
      return null;
    }
  };

  const l = d?.lamaran;
  const idxTahap = l ? TAHAP.findIndex((t) => t.id === l.status) : -1;
  const keluar = l && KELUAR_NAMA[l.status];
  const a = alur?.analisis;
  const j = l?.jawaban || {};
  const umur = j.tanggalLahir ? Math.floor((Date.now() - new Date(j.tanggalLahir).getTime()) / (365.25 * 86400000)) : null;

  return (
    <div className="rk-laci">
      <aside className="rk-panel" aria-label="Detail kandidat" tabIndex={-1} ref={ref}>
        <div className="rk-panel-atas">
          <span className="adm-mono">DETAIL KANDIDAT{l ? ` - ${l.kode}` : ''}</span>
          <span className="rk-nav">
            {urutan.length > 1 && (
              <>
                <button onClick={() => geser(-1)} aria-label="Kandidat sebelumnya (K)">
                  ‹
                </button>
                <button onClick={() => geser(1)} aria-label="Kandidat berikutnya (J)">
                  ›
                </button>
              </>
            )}
            <button onClick={onTutup} aria-label="Tutup">
              ×
            </button>
          </span>
        </div>
        {!d || !alur ? (
          error ? <p className="adm-error" style={{ padding: 16 }}>{error}</p> : <Memuat apa="kandidat" />
        ) : (
          <div className="rk-panel-isi">
            <div className="rk-hdr">
              <span className="rk-avatar" aria-hidden="true">
                {(l.nama || '?')[0].toUpperCase()}
              </span>
              <div style={{ minWidth: 0 }}>
                <h3>{l.nama}</h3>
                <div className="adm-redup">
                  {l.status === 'new' && <span className="adm-chip biru">Baru</span>} masuk {tgl(l.created_at)}
                  {l.domisili ? ` · ${l.domisili}` : ''}
                  {umur ? ` · ${umur} th` : ''}
                </div>
              </div>
            </div>
            <div className="rk-kontak">
              <span className="adm-mono">{tampilHp(l.no_hp)}</span>
              {l.email && <span className="adm-mono">{l.email}</span>}
              <button className="btn kecil" onClick={() => bukaWa(l.no_hp, alur.wa.sapa)}>
                WhatsApp
              </button>
              <a className="btn kecil" href={`tel:+${nomorWa(l.no_hp)}`}>
                Telepon
              </a>
              <span className="adm-redup">
                Sumber: <b>{l.sumber_kode || (l.referrer_nama ? `referral ${l.referrer_nama}` : l.sumber_dropdown || 'tidak diketahui')}</b>
                {l.keyakinan === 'rendah' && <span className="adm-chip kuning" style={{ marginLeft: 6 }}>Keyakinan rendah</span>} · {l.kode_ref}
              </span>
            </div>

            <div className="rk-stepper" aria-hidden="true">
              {TAHAP.map((t, i) => (
                <span key={t.id} className={(i < idxTahap ? 'lewat' : i === idxTahap ? 'kini' : '') + (t.id === 'pelajari_produk' ? ' baru' : '')} title={t.nama} />
              ))}
            </div>
            <div className="rk-stepcap">
              <span>
                {keluar ? (
                  <b>{KELUAR_NAMA[l.status]}</b>
                ) : (
                  <>
                    Tahap {idxTahap + 1}/{TAHAP.length}: <b>{TAHAP[idxTahap]?.nama}</b>
                  </>
                )}
              </span>
              <span>{TAHAP[idxTahap]?.ket}</span>
            </div>

            {keluar && (
              <div className="rk-banner-keluar">
                <span>
                  {KELUAR_NAMA[l.status]}: {l.alasan_keluar || '-'}
                </span>
                <button className="btn kecil" onClick={() => kirim('/kembalikan', {}, 'Kandidat dikembalikan ke proses.')}>
                  Kembalikan ke proses
                </button>
              </div>
            )}
            {pesan && <p className="adm-ok" role="status">{pesan}</p>}
            {error && <p className="adm-error">{error}</p>}

            <Putusan a={a} />

            {!keluar && <Langkah api={api} l={l} alur={alur} kirim={kirim} setModal={setModal} setError={setError} />}

            {!keluar && l.status !== 'hired' && (
              <details className="rk-seksi" ref={keluarRef} open={!a.lolos && alur.kolom === 0}>
                <summary>Keluarkan dari proses</summary>
                <Keluarkan saran={a.alasanTolak} kirim={kirim} />
              </details>
            )}

            <details className="rk-seksi">
              <summary>Data lamaran lengkap</summary>
              <div style={{ padding: '0 12px 12px' }}>
                <DataLamaran jawaban={l.jawaban} label={d.label} dokumen={d.dokumen} onError={setError} />
              </div>
            </details>

            {!keluar && l.status !== 'hired' && (
              <details className="rk-seksi">
                <summary>Follow-up &amp; catatan</summary>
                <div style={{ padding: '0 12px 12px' }}>
                  <FollowUp l={l} hari={d.hariNoResponse} kirim={kirim} />
                  <Catatan kirim={kirim} />
                </div>
              </details>
            )}

            <p className="adm-label rk-judul">Riwayat kejadian</p>
            <div className="rk-log">
              {d.event.map((e) => (
                <div key={e.id}>
                  <span className="adm-redup">{waktu(e.created_at)}</span>
                  <span className="rk-log-jenis">{e.jenis}</span>
                  {e.jenis === 'status' ? `${TAHAP.find((t) => t.id === e.ke)?.nama || KELUAR_NAMA[e.ke] || e.ke}${e.isi ? ` · ${e.isi}` : ''}` : e.isi || `${e.dari || ''} → ${e.ke || ''}`}
                  <span className="adm-redup"> · oleh {e.aktor}</span>
                </div>
              ))}
            </div>
            <p className="adm-redup rk-kbd">
              <kbd>J</kbd>/<kbd>K</kbd> pindah kandidat · <kbd>A</kbd> langkah utama · <kbd>R</kbd> keluarkan · <kbd>Esc</kbd> tutup
            </p>
          </div>
        )}
      </aside>
      {modal?.jenis === 'materi' && (
        <ModalMateri
          api={api}
          l={l}
          paksa={modal.paksa}
          onTutup={() => setModal(null)}
          onSelesai={(t) => {
            setModal(null);
            setPesan(t);
            setV((x) => x + 1);
            onBerubah();
          }}
        />
      )}
    </div>
  );
}

function Putusan({ a }) {
  if (!a.lengkap)
    return (
      <section className="rk-putusan">
        <div className="rk-putusan-atas netral">
          <b>Belum ada data form</b>
          <span className="adm-redup">{a.flags[0]}</span>
        </div>
      </section>
    );
  return (
    <section className={`rk-putusan ${a.lolos ? 'lolos' : 'gagal'}`} aria-label="Hasil screening otomatis">
      <div className="rk-putusan-atas">
        <span className="rk-tanda-besar" aria-hidden="true">
          {a.lolos ? '✓' : '✕'}
        </span>
        <span style={{ minWidth: 0 }}>
          <b className="rk-putusan-judul">{a.lolos ? 'Lolos syarat wajib' : 'Gagal syarat wajib'}</b>
          <span className="adm-redup" style={{ display: 'block' }}>
            {a.lolos ? 'Ketiga syarat terpenuhi' : `${a.gagal.map((g) => g.k.toLowerCase()).join(', ')} nggak terpenuhi`}
          </span>
        </span>
        <span className="rk-skor-besar">
          <b className="adm-mono">{a.skor}</b>
          <span>Pendukung: {a.tier}</span>
        </span>
      </div>
      <div className="rk-wajib">
        {a.wajib.map((w) => (
          <div key={w.k}>
            <span className="adm-redup rk-wajib-k">
              {w.k}
              <b className={w.lolos ? 'ok' : 'no'}>{w.lolos ? '✓ Oke' : '✕ Tidak'}</b>
            </span>
            <b>{w.v}</b>
            {w.catatan && <span className="adm-redup" style={{ fontSize: 12 }}>{w.catatan}</span>}
          </div>
        ))}
      </div>
      <div className="rk-pendukung">
        <div className="rk-pendukung-kepala">
          <b>Skor pendukung</b>
          <span className="adm-redup">{a.skor}/100</span>
        </div>
        {a.items.map((i) => (
          <div key={i.k} className="rk-bar">
            <span className="adm-redup">{i.k}</span>
            <span style={{ minWidth: 0 }}>
              <span className="rk-bar-v">{i.v}</span>
              <span className="rk-bar-trek">
                <i className={kelasBar(i.p, i.max)} style={{ width: `${(i.p / i.max) * 100}%` }} />
              </span>
            </span>
            <span className="adm-mono rk-bar-p">
              {i.p}/{i.max}
            </span>
          </div>
        ))}
      </div>
      {a.flags.length > 0 && (
        <div className="rk-flags">
          {a.flags.map((f) => (
            <div key={f}>
              <b aria-hidden="true">⚠</b>
              <span>{f}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// Langkah sekarang, per kolom.
function Langkah({ api, l, alur, kirim, setModal, setError }) {
  const k = alur.kolom;
  const a = alur.analisis;
  const s = alur.keadaan;
  let judul = 'Langkah berikutnya';
  let isi = null;
  if (k === 0) {
    isi = a.lolos ? (
      <>
        <p>
          Syarat wajib lengkap{a.tier === 'Lemah' ? ', tapi skor pendukung lemah. Tetap bisa lanjut, poin lemahnya otomatis masuk lembar interview.' : '.'}
        </p>
        <div className="adm-tombol">
          <button className="btn utama" data-utama onClick={() => setModal({ jenis: 'materi' })}>
            Loloskan &amp; kirim materi via WA
          </button>
          {l.status === 'new' && (
            <button className="btn kecil" onClick={() => kirim('/maju', {}, 'Ditandai lagi dicek.')}>
              Tandai lagi dicek
            </button>
          )}
        </div>
      </>
    ) : (
      <>
        <div className="rk-saran">
          <b>Saran: tolak.</b> {a.gagal.map((g) => `${g.k.toLowerCase()}: ${g.v}`).join('; ')}.
        </div>
        <div className="adm-tombol">
          <button className="btn bahaya" data-utama onClick={() => kirim('/keluar', { status: 'rejected', alasan: a.alasanTolak }, 'Kandidat ditolak.')}>
            Tolak: {a.alasanTolak}
          </button>
          <button className="btn kecil" onClick={() => setModal({ jenis: 'materi', paksa: true })}>
            Tetap loloskan
          </button>
        </div>
      </>
    );
  } else if (k === 1) {
    if (l.status === 'screening_passed' || !l.materi_dikirim_at) {
      judul = 'Langkah berikutnya: kirim paket materi';
      isi = (
        <button className="btn utama" data-utama onClick={() => setModal({ jenis: 'materi' })}>
          Kirim paket materi via WA
        </button>
      );
    } else {
      const sisa = s.batas ? sisaJam(s.batas) : null;
      isi = (
        <>
          <div className="rk-stat">
            <div className="ok">
              <span className="adm-redup">Paket materi</span>
              <b>Terkirim {waktu(l.materi_dikirim_at)}</b>
            </div>
            <div className={l.apk_at ? 'ok' : ''}>
              <span className="adm-redup">Akun APK</span>
              <b>{l.apk_at ? `Terdeteksi ${waktu(l.apk_at)}` : 'Belum daftar'}</b>
            </div>
            <div className={alur.kuis?.lulus ? 'ok' : alur.kuis ? 'bad' : ''}>
              <span className="adm-redup">Kuis product</span>
              <b>{alur.kuis ? `${alur.kuis.benar}/${alur.kuis.dari}` : 'Belum dikerjain'}</b>
            </div>
            <div className={s.lewat ? 'bad' : ''}>
              <span className="adm-redup">Batas waktu</span>
              <b>{sisa == null ? '-' : s.lewat ? 'Lewat 3 hari' : `Sisa ${durasi(sisa)}`}</b>
            </div>
          </div>
          <p className="adm-redup" style={{ fontSize: 13 }}>
            Akun APK kebaca otomatis kalau nomor {tampilHp(l.no_hp)} daftar di Asisten Warung. APK ✓ + kuis 5/5 = otomatis pindah ke Interview.
          </p>
          {s.lewat && <div className="rk-saran">Udah lewat 3 hari. Keluarkan sebagai No response, atau follow-up dulu kalau masih mau nunggu.</div>}
          {alur.kuis && !alur.kuis.lulus && (
            <>
              <div className="rk-saran">
                <b>Kuis {alur.kuis.benar}/{alur.kuis.dari}.</b> Syaratnya benar semua. Kasih kesempatan ulang sekali, atau tolak.
              </div>
              <div className="adm-tombol">
                <button className="btn utama kecil" data-utama onClick={async () => { const r = await kirim('/kuis-ulang', {}, 'Link kuis baru dibikin.'); if (r?.teks) bukaWa(r.hp, r.teks); }}>
                  Kirim ulang kuis via WA
                </button>
                <button className="btn bahaya kecil" onClick={() => kirim('/keluar', { status: 'rejected', alasan: `Gagal kuis product (${alur.kuis.benar}/${alur.kuis.dari})` }, 'Kandidat ditolak.')}>
                  Tolak: gagal kuis
                </button>
              </div>
            </>
          )}
          <div className="adm-tombol">
            {!l.apk_at && (
              <button className="btn kecil" onClick={() => bukaWa(l.no_hp, alur.wa.ingatkanApk)}>
                Ingatkan daftar APK via WA
              </button>
            )}
            {!alur.kuis && alur.wa.kuisUlang && (
              <button className="btn kecil" onClick={() => bukaWa(l.no_hp, alur.wa.kuisUlang)}>
                Kirim ulang link kuis
              </button>
            )}
            {alur.kuis?.lulus && !l.apk_at && (
              <button className="btn kecil" data-utama onClick={() => kirim('/maju-interview', {}, 'Maju ke Interview.')}>
                Maju ke Interview tanpa APK
              </button>
            )}
          </div>
        </>
      );
    }
  } else if (k === 2) {
    isi = <LangkahInterview api={api} l={l} alur={alur} kirim={kirim} setError={setError} />;
  } else if (k === 3) {
    const t = alur.trial || { warungH1: 0, closing: 0 };
    const mulai = l.trial_mulai || l.status_sejak;
    const sisaH1 = sisaJam(new Date(new Date(mulai).getTime() + 24 * 3600000).toISOString());
    const sisaH6 = sisaJam(new Date(new Date(mulai).getTime() + 144 * 3600000).toISOString());
    isi = (
      <>
        <p className="adm-redup" style={{ fontSize: 13 }}>
          Dihitung otomatis dari Asisten Warung: warung yang daftar dan yang bayar pakai kode <b className="adm-mono">{l.trial_kode || '-'}</b>.
        </p>
        <div className="adm-tombol" style={{ marginTop: 0 }}>
          {alur.wa.trial && (
            <button className="btn kecil" onClick={() => bukaWa(l.no_hp, alur.wa.trial)}>
              Kirim info trial via WA
            </button>
          )}
          {alur.link.referral && (
            <button className="btn kecil" onClick={() => navigator.clipboard?.writeText(alur.link.referral)}>
              Salin link referral
            </button>
          )}
        </div>
        <Meter judul="Checkpoint H+1: warung daftar" n={t.warungH1} catatan={t.warungH1 >= 3 ? '✓' : sisaH1 > 0 ? `sisa ${durasi(sisaH1)}` : 'lewat'} lewat={t.warungH1 < 3 && sisaH1 <= 0} />
        <Meter judul="Checkpoint H+6: warung bayar (closing)" n={t.closing} catatan={t.closing >= 3 ? '✓' : sisaH6 > 0 ? `sisa ${durasi(sisaH6)}` : 'lewat'} lewat={t.closing < 3 && sisaH6 <= 0} />
        {s.lewat && <div className="rk-saran">{s.info}. Putuskan: keluarkan (Gagal trial lapangan) atau kasih kelonggaran.</div>}
        <div className="adm-tombol">
          <button className="btn utama" data-utama disabled={t.closing < 3} onClick={() => kirim('/rekrut', {}, (r) => `Resmi jadi Sales Partner. Kode sales-nya ${r.kode}. Bikin akun login-nya di Sales Lapangan → Tim sales.`)}>
            Rekrut jadi Sales Partner
          </button>
        </div>
      </>
    );
  } else {
    judul = 'Selesai';
    isi = (
      <>
        <p>
          <b>{l.nama}</b> udah jadi Sales Partner{l.trial_kode ? ` dengan kode ${l.trial_kode}` : ''}. Datanya udah masuk HR Karyawan.
        </p>
        <a className="btn kecil" href="#/lapangan/tim">
          Bikin akun di Tim sales
        </a>
      </>
    );
  }
  return (
    <section className="rk-langkah">
      <div className="rk-langkah-kepala">
        <span>{judul}</span>
        <span className="adm-redup">
          {s.label}
          {isi && k < 4 ? ' · tekan A' : ''}
        </span>
      </div>
      <div className="rk-langkah-isi">{isi}</div>
    </section>
  );
}

function Meter({ judul, n, catatan, lewat }) {
  return (
    <div className="rk-meter-blok">
      <span>
        <b>{judul}</b>: {Math.min(n, 99)}/3 <span className={lewat ? 'adm-error' : 'adm-redup'} style={{ margin: 0, display: 'inline' }}>{catatan}</span>
      </span>
      <span className="rk-meter">
        {[0, 1, 2].map((i) => (
          <i key={i} className={i < n ? 'on' : ''} />
        ))}
      </span>
    </div>
  );
}

// Lembar interview: disusun otomatis (pertanyaan product + pertanyaan gali dari analisis), lalu bisa diubah admin mana aja.
// Tiap perubahan (nilai, teks, tambah/hapus) kesimpen otomatis ke server, jadi admin/dirut lain lihat lembar yang sama.
function lembarAwal(alur) {
  if (alur.lembar?.soal?.length) return alur.lembar.soal;
  const a = alur.analisis;
  const gali = [...a.items.filter((i) => i.gali).map((i) => i.gali), ...(a.wajib.find((w) => w.catatan) ? ['Kamu pilih skema lain. Skema seperti apa yang kamu mau?'] : [])];
  return [...(alur.pertanyaanProduk || []).map((q) => ({ jenis: 'produk', q, nilai: null })), ...gali.map((q) => ({ jenis: 'gali', q, nilai: null }))];
}
const NAMA_JENIS = { produk: 'Product', gali: 'Gali', tambahan: 'Tambahan' };
function LangkahInterview({ api, l, alur, kirim }) {
  const [soal, setSoal] = useState(() => lembarAwal(alur));
  const [simpan, setSimpan] = useState(alur.lembar ? { oleh: alur.lembar.diubah_oleh, at: alur.lembar.diubah_at } : null);
  const [status, setStatus] = useState(''); // '' | 'nyimpen' | 'gagal'
  const [edit, setEdit] = useState(null); // index yang lagi diedit
  const [teksEdit, setTeksEdit] = useState('');
  const [baru, setBaru] = useState('');
  const [alasan, setAlasan] = useState('');
  const kotor = useRef(false);
  useEffect(() => {
    if (!kotor.current) return;
    setStatus('nyimpen');
    const t = setTimeout(async () => {
      try {
        const r = await api('PUT', `/rekrutmen/lamaran/${l.id}/lembar-interview`, { soal });
        setSimpan({ oleh: r.diubah_oleh, at: r.diubah_at });
        setStatus('');
      } catch {
        setStatus('gagal');
      }
    }, 700);
    return () => clearTimeout(t);
  }, [api, l.id, soal]);
  const ubah = (fn) => {
    kotor.current = true;
    setSoal(fn);
  };
  const beriNilai = (i, n) => ubah((x) => x.map((s, k) => (k === i ? { ...s, nilai: s.nilai === n ? null : n } : s)));
  const dinilai = soal.filter((s) => s.nilai);
  const rata = dinilai.length ? (dinilai.reduce((x, s) => x + s.nilai, 0) / dinilai.length).toFixed(1) : '–';
  const nilai = Object.fromEntries(dinilai.map((s) => [s.q, s.nilai]));
  return (
    <>
      {!alur.jadwal ? (
        <>
          <p>{l.jadwal_link_at ? `Link pilih jadwal dikirim ${waktu(l.jadwal_link_at)}. Kandidat belum milih.` : 'Kirim link pilih jadwal ke kandidat. Dia milih sendiri dari slot ketersediaan yang kamu isi.'}</p>
          <div className="adm-tombol" style={{ marginTop: 0 }}>
            <button className="btn utama kecil" data-utama onClick={async () => { const r = await kirim('/link-jadwal', {}, 'Link jadwal dicatat terkirim.'); if (r?.teks) bukaWa(r.hp, r.teks); }}>
              {l.jadwal_link_at ? 'Kirim ulang link jadwal' : 'Kirim link pilih jadwal via WA'}
            </button>
            <a className="btn kecil" href="#/rekrutmen/jadwal">
              Atur ketersediaan
            </a>
          </div>
        </>
      ) : (
        <div className="rk-stat" style={{ gridTemplateColumns: '1fr' }}>
          <div className="ok">
            <span className="adm-redup">Jadwal interview</span>
            <b>
              {new Date(alur.jadwal.mulai).toLocaleString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {alur.jadwal.pewawancara}
            </b>
            {alur.jadwal.lokasi && <span className="adm-redup">{alur.jadwal.lokasi}</span>}
          </div>
        </div>
      )}
      <div className="rk-lembar-kepala">
        <span className="adm-label" style={{ fontSize: 10 }}>
          Lembar interview · nilai 1-5
        </span>
        <span className={'rk-simpan' + (status === 'gagal' ? ' gagal' : '')} role="status">
          {status === 'nyimpen' ? 'Nyimpen…' : status === 'gagal' ? 'Gagal nyimpen - coba ubah lagi' : simpan ? `Tersimpan · ${simpan.oleh}, ${waktu(simpan.at)}` : 'Otomatis dari analisis'}
        </span>
      </div>
      <div className="rk-soal">
        {soal.map((s, i) => (
          <div key={i}>
            <div className="rk-soal-atas">
              <span className={`rk-tag ${s.jenis}`}>{NAMA_JENIS[s.jenis] || 'Tambahan'}</span>
              {edit === i ? (
                <form
                  className="rk-soal-edit"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const q = teksEdit.trim();
                    if (q) ubah((x) => x.map((y, k) => (k === i ? { ...y, q } : y)));
                    setEdit(null);
                  }}
                >
                  <textarea value={teksEdit} onChange={(e) => setTeksEdit(e.target.value)} rows={2} maxLength={300} autoFocus aria-label="Teks pertanyaan" />
                  <span>
                    <button className="btn kecil utama" type="submit">Simpan</button>
                    <button className="btn kecil" type="button" onClick={() => setEdit(null)}>Batal</button>
                  </span>
                </form>
              ) : (
                <span className="rk-soal-teks">{s.q}</span>
              )}
              {edit !== i && (
                <span className="rk-soal-aksi">
                  <button type="button" onClick={() => (setEdit(i), setTeksEdit(s.q))} aria-label="Ubah pertanyaan" title="Ubah pertanyaan">Ubah</button>
                  <button type="button" onClick={() => window.confirm('Hapus pertanyaan ini dari lembar?') && ubah((x) => x.filter((_, k) => k !== i))} aria-label="Hapus pertanyaan" title="Hapus pertanyaan">×</button>
                </span>
              )}
            </div>
            <span className="rk-nilai" role="group" aria-label="Nilai">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" aria-pressed={s.nilai === n} onClick={() => beriNilai(i, n)}>
                  {n}
                </button>
              ))}
            </span>
          </div>
        ))}
      </div>
      <form
        className="rk-soal-tambah"
        onSubmit={(e) => {
          e.preventDefault();
          const q = baru.trim();
          if (!q || soal.length >= 20) return;
          ubah((x) => [...x, { jenis: 'tambahan', q, nilai: null }]);
          setBaru('');
        }}
      >
        <input className="adm-input" value={baru} onChange={(e) => setBaru(e.target.value)} maxLength={300} placeholder="Tambah pertanyaan sendiri…" aria-label="Pertanyaan tambahan" />
        <button className="btn kecil" type="submit" disabled={!baru.trim() || soal.length >= 20}>
          + Tambah
        </button>
      </form>
      <p className="adm-redup" style={{ fontSize: 13 }}>
        Rata-rata <b>{rata}</b> dari {dinilai.length}/{soal.length} pertanyaan dinilai · klik nilai yang sama buat ngosongin
      </p>
      <input className="adm-input" value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="Alasan keputusan (wajib)" aria-label="Alasan keputusan interview" />
      <div className="adm-tombol">
        <button
          className="btn utama"
          disabled={!alasan.trim()}
          onClick={async () => {
            const r = await kirim('/interview-hasil', { hasil: 'lulus', alasan, nilai }, (x) => `Lulus interview. Kode trial ${x.trial?.kode}.`);
            if (r?.trial) bukaWa(r.trial.hp, r.trial.teks);
          }}
        >
          Lulus, mulai trial lapangan
        </button>
        <button className="btn bahaya kecil" disabled={!alasan.trim()} onClick={() => kirim('/interview-hasil', { hasil: 'gagal', alasan, nilai }, 'Kandidat nggak lolos interview.')}>
          Tidak lolos
        </button>
      </div>
    </>
  );
}

function Keluarkan({ saran, kirim }) {
  const awal = Math.max(0, ALASAN_KELUAR.findIndex(([, n]) => n === saran));
  const [i, setI] = useState(saran ? awal : 0);
  const [catatan, setCatatan] = useState('');
  const [status, nama] = ALASAN_KELUAR[i];
  return (
    <div style={{ padding: '0 12px 12px', display: 'grid', gap: 8 }}>
      <select value={i} onChange={(e) => setI(Number(e.target.value))} aria-label="Alasan keluar" style={{ maxWidth: 'none', minHeight: 44 }}>
        {ALASAN_KELUAR.map(([, n], x) => (
          <option key={n} value={x}>
            {n}
          </option>
        ))}
      </select>
      <input className="adm-input" value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder={nama === 'Lainnya' ? 'Tulis alasannya (wajib)' : 'Catatan tambahan (opsional)'} aria-label="Catatan keluar" />
      <div>
        <button
          className="btn bahaya kecil"
          disabled={nama === 'Lainnya' && !catatan.trim()}
          onClick={() => kirim('/keluar', { status, alasan: nama === 'Lainnya' ? catatan.trim() : catatan.trim() ? `${nama} (${catatan.trim()})` : nama }, `Kandidat dikeluarkan: ${nama}.`)}
        >
          Keluarkan kandidat
        </button>
      </div>
    </div>
  );
}

// Isi template materi (dari Pengaturan). {link_kuis} dibiarin jadi {LINK_KUIS}: linknya ditempel server waktu dikirim.
function teksMateri(template, nama, materi) {
  const baris = materi.map((m) => `• ${m.nama}${m.url ? `: ${m.url}` : ''}${m.keterangan ? ` (${m.keterangan})` : ''}`).join('\n');
  return template.replaceAll('{nama}', depan(nama)).replaceAll('{materi}', baris).replaceAll('{link_kuis}', '{LINK_KUIS}');
}

function ModalMateri({ api, l, paksa, onTutup, onSelesai }) {
  const { data } = useData(api, '/rekrutmen/materi');
  const [pilih, setPilih] = useState(null);
  const [teks, setTeks] = useState('');
  const [ubahManual, setUbahManual] = useState(false);
  const [error, setError] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const aktif = useMemo(() => (data?.materi || []).filter((m) => m.aktif), [data]);
  useEffect(() => {
    if (data && pilih === null) setPilih(new Set(aktif.map((m) => Number(m.id))));
  }, [data, aktif, pilih]);
  useEffect(() => {
    if (pilih && !ubahManual && data) setTeks(teksMateri(data.templateMateri, l.nama, aktif.filter((m) => pilih.has(Number(m.id)))));
  }, [pilih, aktif, l.nama, ubahManual, data]);
  const soalAktif = (data?.soal || []).filter((s) => s.aktif).length;
  return (
    <Modal judul={`Kirim paket materi ke ${l.nama}`} onTutup={onTutup} lebar={620}>
      {!data ? (
        <Memuat apa="materi" />
      ) : (
        <>
          {paksa && <p className="adm-error" style={{ marginTop: 0 }}>Syarat wajib belum lengkap. Kamu meloloskan manual, dan ini kecatat di riwayat.</p>}
          {soalAktif < data.jumlahSoal && <p className="adm-error">Soal kuis aktif baru {soalAktif}. Tambahin dulu di tab Pengaturan.</p>}
          <p className="adm-redup" style={{ marginTop: 0 }}>Pilih materi yang dikirim. Link kuis unik buat kandidat ini ditempel otomatis pas kamu kirim.</p>
          <div className="rk-materi-pilih">
            {aktif.map((m) => (
              <label key={m.id}>
                <input
                  type="checkbox"
                  checked={pilih?.has(Number(m.id)) || false}
                  onChange={(e) =>
                    setPilih((s) => {
                      const n = new Set(s);
                      e.target.checked ? n.add(Number(m.id)) : n.delete(Number(m.id));
                      return n;
                    })
                  }
                />
                <span>
                  <b>{m.nama}</b>
                  <span className="adm-redup" style={{ display: 'block', fontSize: 12 }}>
                    {m.url || 'tanpa link'}
                    {m.keterangan ? ` · ${m.keterangan}` : ''}
                  </span>
                </span>
              </label>
            ))}
            {aktif.length === 0 && <p className="adm-redup">Belum ada materi aktif. Tambah di tab Pengaturan.</p>}
          </div>
          <div className="field">
            <label htmlFor="rk-wa">Pesan WhatsApp</label>
            <textarea
              id="rk-wa"
              className="adm-input"
              style={{ minHeight: 190, fontSize: 13 }}
              value={teks}
              onChange={(e) => {
                setUbahManual(true);
                setTeks(e.target.value);
              }}
            />
            <p className="adm-redup" style={{ fontSize: 12, margin: '4px 0 0' }}>
              <span className="adm-mono">{'{LINK_KUIS}'}</span> diganti link kuis beneran. Jangan dihapus.
            </p>
          </div>
          {error && <p className="adm-error">{error}</p>}
          <div className="adm-tombol" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={onTutup}>
              Batal
            </button>
            <button
              className="btn utama"
              disabled={sibuk || !teks.includes('{LINK_KUIS}') || soalAktif < data.jumlahSoal}
              onClick={async () => {
                setSibuk(true);
                setError('');
                try {
                  const r = await api('POST', `/rekrutmen/lamaran/${l.id}/loloskan`, { materi: [...pilih], teks, paksa: !!paksa });
                  bukaWa(r.hp, r.teks);
                  onSelesai('Lolos screening. Materi dibuka di WhatsApp, tahap Pelajari produk dimulai.');
                } catch (e) {
                  setError(e.message);
                  setSibuk(false);
                }
              }}
            >
              Kirim via WA &amp; mulai Pelajari produk
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

// ---------------- Tab Kuis & materi ----------------
export function KuisMateri({ api }) {
  const { data, error, muat } = useData(api, '/rekrutmen/materi');
  const [edit, setEdit] = useState(null); // { jenis: 'materi'|'soal', awal }
  const [pesan, setPesan] = useState('');
  if (error) return <Gagal apa="kuis & materi" pesan={error} onUlang={muat} />;
  if (!data) return <Memuat apa="kuis & materi" />;
  const soalAktif = data.soal.filter((s) => s.aktif).length;
  const hapus = async (jenis, id) => {
    try {
      await api('DELETE', `/rekrutmen/${jenis}/${id}`);
      muat();
    } catch (e) {
      setPesan('Gagal: ' + e.message);
    }
  };
  return (
    <>
      {pesan && <p className={pesan.startsWith('Gagal') ? 'adm-error' : 'adm-ok'}>{pesan}</p>}
      <div className="adm-kolom">
        <section className="adm-kartu">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
            <h2 style={{ margin: 0 }}>Paket materi</h2>
            <button className="btn kecil utama" onClick={() => setEdit({ jenis: 'materi', awal: {} })}>
              + Materi
            </button>
          </div>
          <p className="adm-redup">Dikirim ke kandidat yang lolos screening. Taruh link APK, PDF skema bagi hasil, product knowledge, dll (link Google Drive juga bisa).</p>
          <ul className="adm-daftar">
            {data.materi.map((m) => (
              <li key={m.id} style={m.aktif ? undefined : { opacity: 0.55 }}>
                <div style={{ minWidth: 0 }}>
                  <b>{m.nama}</b> {!m.aktif && <span className="adm-chip">Nonaktif</span>}
                  <div className="adm-redup" style={{ overflowWrap: 'anywhere' }}>
                    {m.url || 'tanpa link'}
                    {m.keterangan ? ` · ${m.keterangan}` : ''}
                  </div>
                </div>
                <span className="adm-tombol" style={{ marginTop: 0 }}>
                  <button className="btn kecil" onClick={() => setEdit({ jenis: 'materi', awal: m })}>
                    Ubah
                  </button>
                  <button className="btn kecil bahaya" onClick={() => hapus('materi', m.id)}>
                    Hapus
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <p className="adm-label" style={{ fontSize: 10, margin: '14px 0 6px' }}>
            Contoh pesan WA (template "Paket materi + kuis" di bawah)
          </p>
          <pre className="rk-pratinjau">{data.contohTeks}</pre>
        </section>
        <section className="adm-kartu">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
            <h2 style={{ margin: 0 }}>Soal kuis product</h2>
            <button className="btn kecil utama" onClick={() => setEdit({ jenis: 'soal', awal: {} })}>
              + Soal
            </button>
          </div>
          <p className={soalAktif < data.jumlahSoal ? 'adm-error' : 'adm-redup'}>
            Kuis pakai {data.jumlahSoal} soal aktif teratas, lulus kalau benar semua. Aktif sekarang: {soalAktif}.
          </p>
          <ol className="rk-daftar-soal">
            {data.soal.map((s) => (
              <li key={s.id} style={s.aktif ? undefined : { opacity: 0.55 }}>
                <b>{s.pertanyaan}</b> {!s.aktif && <span className="adm-chip">Nonaktif</span>}
                <ul>
                  {s.pilihan.map((p, i) => (
                    <li key={i} className={i === s.jawaban ? 'benar' : ''}>
                      {p}
                      {i === s.jawaban ? ' ✓' : ''}
                    </li>
                  ))}
                </ul>
                <span className="adm-tombol" style={{ marginTop: 4 }}>
                  <button className="btn kecil" onClick={() => setEdit({ jenis: 'soal', awal: s })}>
                    Ubah
                  </button>
                  <button className="btn kecil bahaya" onClick={() => hapus('soal', s.id)}>
                    Hapus
                  </button>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <PertanyaanInterview api={api} />
      <TemplateWa api={api} onBerubah={muat} />
      {edit?.jenis === 'materi' && <FormMateri api={api} awal={edit.awal} onTutup={() => setEdit(null)} onSelesai={() => (setEdit(null), muat())} />}
      {edit?.jenis === 'soal' && <FormSoal api={api} awal={edit.awal} onTutup={() => setEdit(null)} onSelesai={() => (setEdit(null), muat())} />}
    </>
  );
}

// ---- Template pesan WA (bisa diedit semua admin) ----
// Pertanyaan product bawaan di lembar interview (pertanyaan gali tetap otomatis dari analisis lamaran).
function PertanyaanInterview({ api }) {
  const [data, setData] = useState(null);
  const [isi, setIsi] = useState('');
  const [pesan, setPesan] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const muat = useCallback(() => api('GET', '/rekrutmen/pertanyaan-interview').then((d) => (setData(d), setIsi(d.pertanyaan.join('\n')))), [api]);
  useEffect(() => {
    muat().catch((e) => setPesan('Gagal: ' + e.message));
  }, [muat]);
  const jalan = async (fn, ok) => {
    setSibuk(true);
    setPesan('');
    try {
      await fn();
      await muat();
      setPesan(ok);
    } catch (e) {
      setPesan('Gagal: ' + e.message);
    } finally {
      setSibuk(false);
    }
  };
  const daftar = isi.split('\n').map((x) => x.trim()).filter(Boolean);
  const berubah = data && daftar.join('\n') !== data.pertanyaan.join('\n');
  return (
    <section className="adm-kartu" style={{ marginTop: 20 }}>
      <div className="adm-kartu-kepala" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Pertanyaan interview (product)</h2>
        {data?.diubah && <span className="adm-redup">Diubah {data.diubah_oleh}, {waktu(data.diubah_at)}</span>}
      </div>
      <p className="adm-redup" style={{ marginTop: 0 }}>
        Satu pertanyaan per baris (maks 10). Masuk otomatis ke lembar interview kandidat baru, ditambah pertanyaan gali dari analisis lamarannya. Lembar yang udah pernah diisi nggak ikut berubah.
      </p>
      <textarea className="adm-input" rows={Math.max(4, daftar.length + 1)} value={isi} onChange={(e) => setIsi(e.target.value)} aria-label="Pertanyaan interview product" style={{ width: '100%', resize: 'vertical' }} />
      {pesan && <p className={pesan.startsWith('Gagal') ? 'adm-error' : 'adm-ok'}>{pesan}</p>}
      <div className="adm-tombol">
        <button className="btn utama kecil" disabled={sibuk || !berubah || !daftar.length} onClick={() => jalan(() => api('PUT', '/rekrutmen/pertanyaan-interview', { pertanyaan: daftar }), 'Pertanyaan interview disimpan.')}>
          Simpan
        </button>
        {data?.diubah && (
          <button className="btn kecil" disabled={sibuk} onClick={() => window.confirm('Balikin ke pertanyaan bawaan?') && jalan(() => api('DELETE', '/rekrutmen/pertanyaan-interview'), 'Balik ke pertanyaan bawaan.')}>
            Pakai bawaan
          </button>
        )}
      </div>
    </section>
  );
}

function TemplateWa({ api, onBerubah }) {
  const { data, error, muat } = useData(api, '/rekrutmen/template');
  if (error) return <Gagal apa="template WA" pesan={error} onUlang={muat} />;
  if (!data) return <Memuat apa="template WA" />;
  return (
    <section className="adm-kartu" style={{ marginTop: 16 }}>
      <h2 style={{ marginTop: 0 }}>Template pesan WA</h2>
      <p className="adm-redup" style={{ marginTop: 0 }}>
        Pesan yang disiapin buat kandidat di tiap tahap. Tulisan dalam kurung kurawal kayak <span className="adm-mono">{'{nama}'}</span> otomatis diganti waktu pesan dibikin. Klik penandanya buat nyisipin.
      </p>
      <div className="rk-template-grid">
        {data.template.map((t) => (
          <KartuTemplate
            key={t.kunci + (t.diubah_at || '')}
            api={api}
            t={t}
            contoh={data.contoh}
            onSimpan={() => {
              muat();
              onBerubah?.();
            }}
          />
        ))}
      </div>
    </section>
  );
}

function KartuTemplate({ api, t, contoh, onSimpan }) {
  const [isi, setIsi] = useState(t.isi);
  const [pesan, setPesan] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const ref = useRef(null);
  const berubah = isi !== t.isi;
  const kurang = t.wajib.filter((k) => !isi.includes(`{${k}}`));
  const pratinjau = isi.replace(/\{(\w+)\}/g, (m, k) => (t.penanda.includes(k) && contoh[k] !== undefined ? contoh[k] : m));
  const sisip = (k) => {
    const el = ref.current;
    const tanda = `{${k}}`;
    if (!el) return setIsi((x) => x + tanda);
    const a = el.selectionStart ?? isi.length;
    const b = el.selectionEnd ?? isi.length;
    setIsi(isi.slice(0, a) + tanda + isi.slice(b));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + tanda.length, a + tanda.length);
    });
  };
  const kirim = async (metode) => {
    setSibuk(true);
    setPesan('');
    try {
      await api(metode, `/rekrutmen/template/${t.kunci}`, metode === 'PUT' ? { isi } : undefined);
      setPesan(metode === 'PUT' ? 'Disimpan.' : 'Dibalikin ke bawaan.');
      onSimpan();
    } catch (e) {
      setPesan('Gagal: ' + e.message);
    } finally {
      setSibuk(false);
    }
  };
  return (
    <div className="rk-template">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <b>{t.judul}</b>
        <span className="adm-redup" style={{ fontSize: 12 }}>
          {t.diubah ? `Diubah ${t.diubah_oleh || '-'} · ${waktu(t.diubah_at)}` : 'Bawaan'}
        </span>
      </div>
      <p className="adm-redup" style={{ margin: '2px 0 8px', fontSize: 13 }}>
        {t.ket}
      </p>
      <textarea ref={ref} className="adm-input" style={{ minHeight: t.kunci === 'materi' || t.kunci === 'trial' ? 170 : 90, fontSize: 13 }} value={isi} onChange={(e) => setIsi(e.target.value)} aria-label={`Isi template ${t.judul}`} />
      <div className="rk-penanda">
        {t.penanda.map((k) => (
          <button key={k} type="button" className={`adm-chip ${t.wajib.includes(k) ? 'kuning' : ''}`} onClick={() => sisip(k)} title={t.wajib.includes(k) ? 'Wajib ada' : 'Sisipkan'}>
            {`{${k}}`}
          </button>
        ))}
      </div>
      {kurang.length > 0 && <p className="adm-error" style={{ fontSize: 12 }}>Wajib ada {kurang.map((k) => `{${k}}`).join(', ')}.</p>}
      <details className="rk-pratinjau-lipat">
        <summary>Pratinjau</summary>
        <pre className="rk-pratinjau">{pratinjau}</pre>
      </details>
      {pesan && <p className={pesan.startsWith('Gagal') ? 'adm-error' : 'adm-ok'} style={{ fontSize: 13 }}>{pesan}</p>}
      <div className="adm-tombol" style={{ marginTop: 8 }}>
        <button className="btn kecil utama" disabled={sibuk || !berubah || kurang.length > 0 || !isi.trim()} onClick={() => kirim('PUT')}>
          Simpan
        </button>
        {berubah && (
          <button className="btn kecil" onClick={() => setIsi(t.isi)}>
            Batal ubah
          </button>
        )}
        {t.diubah && (
          <button className="btn kecil" disabled={sibuk} onClick={() => window.confirm(`Balikin "${t.judul}" ke pesan bawaan?`) && kirim('DELETE')}>
            Balikin ke bawaan
          </button>
        )}
      </div>
    </div>
  );
}

function FormMateri({ api, awal, onTutup, onSelesai }) {
  const [isi, setIsi] = useState({ nama: awal.nama || '', url: awal.url || '', keterangan: awal.keterangan || '', aktif: awal.aktif ?? true, urutan: awal.urutan ?? 0 });
  const [error, setError] = useState('');
  const ubah = (k) => (e) => setIsi((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  return (
    <Modal judul={awal.id ? 'Ubah materi' : 'Tambah materi'} onTutup={onTutup}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api(awal.id ? 'PATCH' : 'POST', `/rekrutmen/materi${awal.id ? '/' + awal.id : ''}`, isi);
            onSelesai();
          } catch (err) {
            setError(err.message);
          }
        }}
      >
        <div className="field">
          <label htmlFor="m-nama">Nama materi</label>
          <input id="m-nama" value={isi.nama} onChange={ubah('nama')} placeholder="Skema bagi hasil Sales Partner (PDF)" required />
        </div>
        <div className="field">
          <label htmlFor="m-url">Link</label>
          <input id="m-url" value={isi.url} onChange={ubah('url')} placeholder="https://..." inputMode="url" />
        </div>
        <div className="field">
          <label htmlFor="m-ket">Keterangan singkat</label>
          <input id="m-ket" value={isi.keterangan} onChange={ubah('keterangan')} placeholder="hitungan komisi & jadwal cair" />
        </div>
        <div className="adm-baris" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="field">
            <label htmlFor="m-urut">Urutan</label>
            <input id="m-urut" type="number" value={isi.urutan} onChange={ubah('urutan')} />
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 24 }}>
            <input type="checkbox" checked={isi.aktif} onChange={ubah('aktif')} /> Aktif (ikut dikirim)
          </label>
        </div>
        {error && <p className="adm-error">{error}</p>}
        <div className="adm-tombol" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onTutup}>
            Batal
          </button>
          <button className="btn utama" type="submit">
            Simpan
          </button>
        </div>
      </form>
    </Modal>
  );
}

function FormSoal({ api, awal, onTutup, onSelesai }) {
  const [isi, setIsi] = useState({ pertanyaan: awal.pertanyaan || '', pilihan: awal.pilihan || ['', '', '', ''], jawaban: awal.jawaban ?? 0, aktif: awal.aktif ?? true, urutan: awal.urutan ?? 0 });
  const [error, setError] = useState('');
  return (
    <Modal judul={awal.id ? 'Ubah soal' : 'Tambah soal'} onTutup={onTutup} lebar={600}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api(awal.id ? 'PATCH' : 'POST', `/rekrutmen/soal${awal.id ? '/' + awal.id : ''}`, { ...isi, pilihan: isi.pilihan.filter((p) => p.trim()) });
            onSelesai();
          } catch (err) {
            setError(err.message);
          }
        }}
      >
        <div className="field">
          <label htmlFor="s-tanya">Pertanyaan</label>
          <textarea id="s-tanya" className="adm-input" value={isi.pertanyaan} onChange={(e) => setIsi((x) => ({ ...x, pertanyaan: e.target.value }))} required />
        </div>
        <p className="adm-label" style={{ fontSize: 10, margin: '8px 0 6px' }}>
          Pilihan jawaban · pilih yang benar
        </p>
        {isi.pilihan.map((p, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <input type="radio" name="benar" checked={isi.jawaban === i} onChange={() => setIsi((x) => ({ ...x, jawaban: i }))} aria-label={`Jawaban benar: pilihan ${i + 1}`} />
            <input className="adm-input" value={p} onChange={(e) => setIsi((x) => ({ ...x, pilihan: x.pilihan.map((y, z) => (z === i ? e.target.value : y)) }))} placeholder={`Pilihan ${i + 1}`} aria-label={`Pilihan ${i + 1}`} />
          </div>
        ))}
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={isi.aktif} onChange={(e) => setIsi((x) => ({ ...x, aktif: e.target.checked }))} /> Aktif
        </label>
        {error && <p className="adm-error">{error}</p>}
        <div className="adm-tombol" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onTutup}>
            Batal
          </button>
          <button className="btn utama" type="submit">
            Simpan
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------- Tab Ketersediaan interview ----------------
export function Ketersediaan({ api, versi, onBuka }) {
  const [v, setV] = useState(0);
  const { data, error, muat } = useData(api, `/rekrutmen/slot?v=${versi}-${v}`);
  const besok = new Date(Date.now() + 7 * 3600000 + 86400000).toISOString().slice(0, 10);
  const [isi, setIsi] = useState({ tanggal: besok, mulai: '10:00', selesai: '12:00', durasi: 30, lokasi: '' });
  const [pesan, setPesan] = useState('');
  const ubah = (k) => (e) => setIsi((x) => ({ ...x, [k]: e.target.value }));
  const perHari = useMemo(() => {
    const g = [];
    for (const s of data || []) {
      const h = new Date(s.mulai).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
      const x = g[g.length - 1];
      if (x?.h === h) x.slot.push(s);
      else g.push({ h, slot: [s] });
    }
    return g;
  }, [data]);
  if (error) return <Gagal apa="ketersediaan" pesan={error} onUlang={muat} />;
  return (
    <>
      <form
        className="adm-kartu"
        onSubmit={async (e) => {
          e.preventDefault();
          setPesan('');
          try {
            const r = await api('POST', '/rekrutmen/slot', isi);
            setPesan(`${r.dibuat} slot ditambah.`);
            setV((x) => x + 1);
          } catch (err) {
            setPesan('Gagal: ' + err.message);
          }
        }}
      >
        <h2 style={{ marginTop: 0 }}>Kapan kamu bersedia interview?</h2>
        <p className="adm-redup" style={{ marginTop: 0 }}>
          Isi rentang jamnya, nanti dipecah jadi slot. Kandidat yang udah sampai Interview milih salah satu slot kosong lewat link yang kamu kirim.
        </p>
        <div className="adm-baris" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <div className="field">
            <label htmlFor="k-tgl">Tanggal</label>
            <input id="k-tgl" type="date" value={isi.tanggal} onChange={ubah('tanggal')} required />
          </div>
          <div className="field">
            <label htmlFor="k-mulai">Dari jam</label>
            <input id="k-mulai" type="time" value={isi.mulai} onChange={ubah('mulai')} required />
          </div>
          <div className="field">
            <label htmlFor="k-selesai">Sampai jam</label>
            <input id="k-selesai" type="time" value={isi.selesai} onChange={ubah('selesai')} required />
          </div>
          <div className="field">
            <label htmlFor="k-durasi">Per slot</label>
            <select id="k-durasi" value={isi.durasi} onChange={ubah('durasi')} style={{ maxWidth: 'none', minHeight: 44 }}>
              {[15, 20, 30, 45, 60].map((n) => (
                <option key={n} value={n}>
                  {n} menit
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="k-lok">Tempat / link meeting</label>
          <input id="k-lok" value={isi.lokasi} onChange={ubah('lokasi')} placeholder="Link Google Meet atau alamat kantor" />
        </div>
        {pesan && <p className={pesan.startsWith('Gagal') ? 'adm-error' : 'adm-ok'}>{pesan}</p>}
        <button className="btn utama" type="submit" style={{ marginTop: 10 }}>
          Tambah slot
        </button>
      </form>

      {!data ? (
        <Memuat apa="slot" />
      ) : perHari.length === 0 ? (
        <Kosong judul="Belum ada slot">Tambah ketersediaanmu di atas biar kandidat bisa milih jadwal sendiri.</Kosong>
      ) : (
        perHari.map((g) => (
          <section key={g.h} className="adm-kartu" style={{ marginTop: 16 }}>
            <h3 style={{ marginTop: 0 }}>{g.h}</h3>
            <div className="rk-slot-grid">
              {g.slot.map((s) => {
                const lewat = new Date(s.mulai) < new Date();
                return (
                  <div key={s.id} className={'rk-slot' + (s.lamaran_id ? ' dipilih' : '') + (lewat ? ' lewat' : '')}>
                    <b className="adm-mono">{new Date(s.mulai).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</b>
                    <span className="adm-redup">
                      {s.durasi} mnt · {s.pewawancara}
                    </span>
                    {s.lamaran_id ? (
                      <button className="adm-link" onClick={() => onBuka(s.lamaran_id)}>
                        {s.kandidat_nama}
                      </button>
                    ) : lewat ? (
                      <span className="adm-redup">Lewat, nggak dipilih</span>
                    ) : (
                      <button
                        className="adm-link"
                        style={{ color: 'var(--merah)' }}
                        onClick={async () => {
                          try {
                            await api('DELETE', `/rekrutmen/slot/${s.id}`);
                            setV((x) => x + 1);
                          } catch (err) {
                            setPesan('Gagal: ' + err.message);
                          }
                        }}
                      >
                        Hapus slot
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}
    </>
  );
}
