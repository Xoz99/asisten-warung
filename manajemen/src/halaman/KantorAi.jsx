import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import KantorJadwal from './KantorJadwal.jsx';
import TeksMarkdown from '../komponen/TeksMarkdown.jsx';
import { Konfirmasi, Modal } from '../komponen/Ui.jsx';
import { unggahBerkas } from '../lib/api.js';
import { kirimKeAiChat } from '../lib/drafAi.js';
import { AGEN } from '../lib/kantor.js';
import { TEMPLATE_ANALISA } from '../lib/kantorTemplate.js';
import { ambilRekomendasi, buatPdf, namaFile, pesanEksekusi, tabelKeCsv, unduhBlob } from '../lib/laporan.js';

const agenDari = (id) => AGEN.find((a) => a.id === id);
const TAHAPAN = ['Rencana', 'Riset data', 'Implementasi', 'Review', 'Hasil akhir'];
const FOLDER_LAPORAN = 'Laporan Kantor Konsulin';
const lamaTeks = (dtk) => (dtk < 60 ? `${dtk} dtk` : `${Math.floor(dtk / 60)} mnt ${dtk % 60} dtk`);
const tanggalTeks = (t) => new Date(t).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const KEADAAN_KOSONG = { status: null, jalan: false, agen: {}, obrolan: [], langkah: [], tahap: 'Santai', hasil: '', error: '', tugas: '', versiRiwayat: 0 };
const tanpaLangganan = () => () => {};
const metaTeks = (m) => [m?.terjadwal && 'laporan otomatis', m?.durasi && lamaTeks(m.durasi), m?.dibaca != null && `${m.dibaca} data asli dibaca`, m?.revisi ? `${m.revisi} revisi` : null, m?.demo && 'mode demo'].filter(Boolean);

function Avatar({ id, nama }) {
  const a = agenDari(id);
  return (
    <span className="kantor-avatar" style={{ background: a?.warna, color: a?.teks }} aria-hidden="true">
      {(nama || a?.nama || '?')[0]}
    </span>
  );
}

// Pilih rekomendasi laporan yang mau dikerjain, lalu AI Chat kebuka dengan pesan yang udah keisi (belum dikirim).
// AI Chat yang ngecek data aktual & ngusulin perubahan lewat tombol setuju; Kantor sendiri tetap cuma baca.
function EksekusiModal({ lap, onTutup }) {
  const rekom = ambilRekomendasi(lap.hasil_md);
  const [pilih, setPilih] = useState(() => rekom.map(() => true));
  const [catatan, setCatatan] = useState('');
  const terpilih = rekom.filter((_, i) => pilih[i]);
  const pesan = pesanEksekusi({ judul: lap.judul, dibuat: lap.dibuat, md: lap.hasil_md, rekomendasi: terpilih, catatan });
  return (
    <Modal judul="Eksekusi di AI Chat" onTutup={onTutup} lebar={620}>
      {rekom.length ? (
        <>
          <p className="adm-sub" style={{ marginTop: 0 }}>
            Pilih rekomendasi yang mau dikerjain. AI Chat bakal ngecek data aktual dulu, terus ngusulin perubahan satu per satu, dan baru jalan setelah kamu setujui.
          </p>
          <div className="kantor-rekom">
            {rekom.map((r, i) => (
              <label key={i} className={pilih[i] ? 'on' : ''}>
                <input type="checkbox" checked={pilih[i]} onChange={(e) => setPilih((p) => p.map((x, j) => (j === i ? e.target.checked : x)))} />
                <span>
                  <b>{i + 1}.</b> {r}
                </span>
              </label>
            ))}
          </div>
        </>
      ) : (
        <p className="kantor-catatan">Laporan ini nggak punya bagian Rekomendasi, jadi yang dikirim ringkasan laporannya buat ditindaklanjuti.</p>
      )}
      <div className="field">
        <label htmlFor="eksekusi-catatan">Catatan tambahan (opsional)</label>
        <textarea id="eksekusi-catatan" value={catatan} onChange={(e) => setCatatan(e.target.value)} maxLength={1000} placeholder="Misal: fokus ke warung di Cimahi dulu" />
      </div>
      <p className="adm-redup" style={{ marginTop: 10 }}>
        Pesannya {pesan.length.toLocaleString('id-ID')} / 6.000 huruf, belum dikirim. Kamu masih bisa ngedit di AI Chat.
      </p>
      <div className="adm-tombol">
        <button className="btn utama" type="button" onClick={() => kirimKeAiChat(pesan)} disabled={rekom.length > 0 && terpilih.length === 0}>
          Buka di AI Chat
        </button>
        <button className="btn" type="button" onClick={onTutup}>
          Batal
        </button>
      </div>
    </Modal>
  );
}

// Kantor Konsulin: tim agent AI yang fokus ANALISA data Makalin (baca saja), hasilnya laporan yang bisa diunduh (PDF/MD/CSV),
// disimpan ke Artifact, dan masuk riwayat tim. Mesinnya hidup di level aplikasi (App.jsx); halaman ini nempelin lantainya.
export default function KantorAi({ api, admin, kantor }) {
  const k = useSyncExternalStore(kantor ? kantor.dengar : tanpaLangganan, kantor ? kantor.baca : () => KEADAAN_KOSONG);
  const wadah = useRef(null);
  const feed = useRef(null);
  const diBawah = useRef(true);
  const [tugas, setTugas] = useState('');
  const [template, setTemplate] = useState(null);
  const [revisi, setRevisi] = useState(true);
  // Default mati: gosip AI makan kuota model yang sama kayak analisa (model gratis OpenRouter dijatah per hari).
  const [gosipAi, setGosipAi] = useState(false);
  const [, setDetak] = useState(0);
  const [riwayat, setRiwayat] = useState(null);
  const [lihat, setLihat] = useState(null);
  const [sibuk, setSibuk] = useState('');
  const [pesan, setPesan] = useState('');
  const [hapus, setHapus] = useState(null);
  const [segar, setSegar] = useState(0);
  const [eksekusi, setEksekusi] = useState(null);
  const tutupEksekusi = useCallback(() => setEksekusi(null), []);
  const segarkanRiwayat = useCallback(() => setSegar((x) => x + 1), []);

  useEffect(() => {
    if (!kantor) return;
    wadah.current.appendChild(kantor.elemen);
    wadah.current.scrollLeft = (wadah.current.scrollWidth - wadah.current.clientWidth) / 2;
    kantor.atur({ terlihat: true });
    return () => {
      kantor.atur({ terlihat: false });
      kantor.elemen.remove();
    };
  }, [kantor]);
  useEffect(() => {
    kantor?.atur({ gosipAi });
  }, [kantor, gosipAi]);
  useEffect(() => {
    if (!k.jalan) return;
    const t = setInterval(() => setDetak((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [k.jalan]);
  useLayoutEffect(() => {
    const el = feed.current;
    if (el && diBawah.current) el.scrollTop = el.scrollHeight;
  }, [k.obrolan]);
  useEffect(() => {
    let batal = false;
    api('GET', '/ai/kantor/laporan')
      .then((r) => !batal && setRiwayat(r))
      .catch(() => !batal && setRiwayat([]));
    return () => {
      batal = true;
    };
  }, [api, k.versiRiwayat, segar]);

  if (!kantor) return <p className="adm-redup">Nyiapin kantor…</p>;

  const aktif = Boolean(k.status?.aktif);
  const namaBos = (admin.nama || 'Bos').split(' ')[0];
  const durasi = k.mulai ? Math.round(((k.selesai || Date.now()) - k.mulai) / 1000) : 0;
  const sekarang = {
    id: k.laporanId,
    judul: k.judul || (k.jalan ? 'Lagi dianalisa…' : 'Hasil analisa'),
    tugas: k.tugas,
    hasil_md: k.hasil,
    langkah: k.langkah,
    admin_nama: admin.nama,
    dibuat: k.selesai || k.mulai,
    meta: { durasi, dibaca: k.langkah.reduce((s, l) => s + (l.dibaca?.length || 0), 0), revisi: k.langkah.filter((l) => l.putusan === 'REVISE').length, demo: !aktif },
    artifact_id: riwayat?.find((r) => r.id === k.laporanId)?.artifact_id || null,
  };
  const tampil = lihat || (k.langkah.length || k.error ? sekarang : null);
  const dariRiwayat = Boolean(lihat);
  const tahapanSelesai = new Set((tampil?.langkah || []).map((l) => (l.judul === 'Revisi implementasi' ? 'Implementasi' : l.judul)));
  const tahapanSekarang = !dariRiwayat && k.jalan ? TAHAPAN.find((t) => !tahapanSelesai.has(t)) : null;
  const csv = tampil?.hasil_md ? tabelKeCsv(tampil.hasil_md) : null;

  const kabar = (t) => {
    setPesan(t);
    setTimeout(() => setPesan(''), 4000);
  };
  const pilihTemplate = (t) => {
    setTemplate(t);
    setTugas(t.tugas());
  };
  const kirim = (e) => {
    e.preventDefault();
    if (!tugas.trim() || k.jalan) return;
    setLihat(null);
    kantor.kasihTugas(tugas.trim(), { revisi, template: template?.id, judul: template?.label });
    setTugas('');
    setTemplate(null);
  };
  const pdfDari = (lap) => buatPdf({ judul: lap.judul, tugas: lap.tugas, md: lap.hasil_md, meta: metaTeks(lap.meta), dibuat: lap.dibuat });
  const jalankan = async (kunci, fn) => {
    setSibuk(kunci);
    try {
      await fn();
    } catch (e) {
      kabar(e.message || 'Gagal');
    } finally {
      setSibuk('');
    }
  };
  const unduhPdf = (lap) => jalankan('pdf' + lap.id, async () => unduhBlob(await pdfDari(lap), namaFile(lap.judul, 'pdf')));
  const unduhMd = (lap) => unduhBlob(new Blob([`${lap.hasil_md}\n`], { type: 'text/markdown' }), namaFile(lap.judul, 'md'));
  const unduhCsv = (lap) => unduhBlob(new Blob([tabelKeCsv(lap.hasil_md)], { type: 'text/csv' }), namaFile(lap.judul, 'csv'));
  const keArtifact = (lap) =>
    jalankan('artifact' + lap.id, async () => {
      const { folder } = await api('GET', '/artifact/folder');
      const f = folder.find((x) => x.nama === FOLDER_LAPORAN && !x.induk_id) || (await api('POST', '/artifact/folder', { nama: FOLDER_LAPORAN }));
      const blob = await pdfDari(lap);
      const nama = namaFile(lap.judul, 'pdf');
      const hasil = await unggahBerkas(`/artifact/unggah?${new URLSearchParams({ nama, folder: f.id, tipe: 'dokumen' })}`, new File([blob], nama, { type: 'application/pdf' })).promise;
      if (lap.id) await api('PATCH', `/ai/kantor/laporan/${lap.id}`, { artifact_id: hasil.id });
      setRiwayat((r) => r?.map((x) => (x.id === lap.id ? { ...x, artifact_id: hasil.id } : x)));
      if (lihat?.id === lap.id) setLihat((l) => ({ ...l, artifact_id: hasil.id }));
      kabar(`Tersimpan di Artifact, folder "${FOLDER_LAPORAN}"`);
    });
  const bukaRiwayat = (r) =>
    jalankan('buka' + r.id, async () => {
      setLihat(await api('GET', `/ai/kantor/laporan/${r.id}`));
      document.querySelector('.kantor-hasil')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  const hapusRiwayat = async () => {
    const r = hapus;
    setHapus(null);
    await jalankan('hapus' + r.id, async () => {
      await api('DELETE', `/ai/kantor/laporan/${r.id}`);
      setRiwayat((x) => x?.filter((y) => y.id !== r.id));
      if (lihat?.id === r.id) setLihat(null);
    });
  };

  return (
    <div className="kantor">
      <header className="kantor-kepala">
        <div>
          <h1>Kantor Konsulin</h1>
          <p className="adm-sub">Tim analis AI: bedah data asli Makalin jadi laporan yang bisa diunduh & disimpan. Buat tanya cepat atau ngubah data, pakai AI Chat.</p>
        </div>
        <div className="kantor-status">
          {k.status && (
            <span className={'adm-chip ' + (aktif ? 'hijau' : 'kuning')} title={aktif ? k.status.model : undefined}>
              {aktif ? 'AI aktif' : 'Mode demo'}
            </span>
          )}
          <span className={'adm-chip ' + (k.jalan ? 'kuning' : '')}>{k.jalan ? 'Lagi menganalisa' : k.tahap}</span>
          {k.mulai && <span className="adm-chip p-num">{lamaTeks(durasi)}</span>}
        </div>
      </header>

      {k.status && !aktif && (
        <p className="kantor-catatan">
          <b>Mode demo:</b> <code>OPENROUTER_API_KEY</code> belum diisi di server, jadi laporannya contoh dari ringkasan dashboard.
        </p>
      )}
      {pesan && (
        <p className="kantor-catatan" role="status">
          {pesan}
        </p>
      )}

      <div className="kantor-isi">
        <div className="kantor-kiri">
        <section className="adm-kartu kantor-lantai">
          <div className="adm-kartu-kepala hitam">
            <h2>Lantai kerja</h2>
            <span className="kantor-live">
              <i aria-hidden="true" /> Live
            </span>
          </div>
          <div ref={wadah} className="kantor-wadah" />
          <p className="kantor-geser">Geser ke samping buat lihat seluruh kantor</p>
          <ul className="kantor-agen">
            {AGEN.filter((a) => a.id !== 'bos').map((a) => {
              const s = k.agen[a.id] || {};
              return (
                <li key={a.id} className={s.st === 'kerja' ? 'kerja' : ''}>
                  <Avatar id={a.id} />
                  <span className="kantor-agen-isi">
                    <b>{a.nama}</b>
                    <small>{s.kegiatan || a.peran}</small>
                  </span>
                  {s.st === 'kerja' && <span className="adm-chip kuning">Kerja</span>}
                  {s.st === 'selesai' && <span className="adm-chip hijau">{s.selesai}x</span>}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="adm-kartu kantor-hasil">
          <div className="adm-kartu-kepala kuning">
            <h2>{tampil ? tampil.judul : 'Laporan'}</h2>
            {dariRiwayat && (
              <button type="button" className="btn kecil" onClick={() => setLihat(null)}>
                {k.langkah.length ? 'Balik ke analisa terbaru' : 'Tutup'}
              </button>
            )}
          </div>
          {!tampil ? (
            <p className="kantor-tunggu">Pilih analisa siap pakai atau tulis pertanyaanmu. Laporannya muncul di sini, bisa diunduh PDF, dan otomatis masuk riwayat.</p>
          ) : (
            <>
              <blockquote className="kantor-tugas-kutip">
                <span className="adm-label">
                  {dariRiwayat ? `Dari riwayat · ${tanggalTeks(tampil.dibuat)}${tampil.admin_nama ? ` · ${tampil.admin_nama}` : ''}` : `Tugas dari ${namaBos}`}
                </span>
                {tampil.tugas}
              </blockquote>
              {!dariRiwayat && (
                <ol className="kantor-tahapan" aria-label="Kemajuan">
                  {TAHAPAN.map((t) => (
                    <li key={t} className={tahapanSelesai.has(t) ? 'beres' : t === tahapanSekarang ? 'sekarang' : ''}>
                      {t}
                    </li>
                  ))}
                </ol>
              )}
              <div className="kantor-meta">
                {metaTeks(tampil.meta).map((m) => (
                  <span key={m}>{m}</span>
                ))}
              </div>
              {!dariRiwayat && k.error && (
                <p className="adm-error" role="alert">
                  {k.error}
                </p>
              )}
              {!dariRiwayat && k.errorSimpan && <p className="adm-error">{k.errorSimpan}</p>}
              {tampil.hasil_md ? (
                <>
                  <div className="kantor-unduh">
                    <button type="button" className="btn kecil hitam" onClick={() => setEksekusi(tampil)}>
                      Eksekusi di AI Chat
                    </button>
                    <button type="button" className="btn kecil utama" onClick={() => unduhPdf(tampil)} disabled={sibuk === 'pdf' + tampil.id}>
                      {sibuk === 'pdf' + tampil.id ? 'Bikin PDF…' : 'Unduh PDF'}
                    </button>
                    <button type="button" className="btn kecil" onClick={() => unduhMd(tampil)}>
                      Unduh .md
                    </button>
                    {csv && (
                      <button type="button" className="btn kecil" onClick={() => unduhCsv(tampil)}>
                        Unduh tabel (CSV)
                      </button>
                    )}
                    {tampil.artifact_id ? (
                      <a className="btn kecil aksen" href="#/artifact">
                        Ada di Artifact
                      </a>
                    ) : (
                      <button type="button" className="btn kecil aksen" onClick={() => keArtifact(tampil)} disabled={sibuk === 'artifact' + tampil.id || (!dariRiwayat && !tampil.id)}>
                        {sibuk === 'artifact' + tampil.id ? 'Nyimpen…' : 'Simpan ke Artifact'}
                      </button>
                    )}
                  </div>
                  <div className="ai-teks kantor-hasil-isi">
                    <TeksMarkdown teks={tampil.hasil_md} />
                  </div>
                </>
              ) : (
                !k.error && <p className="kantor-tunggu">Tim lagi menganalisa. Laporannya muncul di sini setelah Writer selesai.</p>
              )}
            </>
          )}
        </section>

          {tampil && tampil.langkah?.length > 0 && (
            <section className="adm-kartu kantor-alur">
              <div className="adm-kartu-kepala">
                <h2>Alur kerja</h2>
                <span className="adm-redup">{tampil.langkah.length} langkah</span>
              </div>
              <ol>
                {tampil.langkah.map((l, i) => {
                  const nama = l.peran === 'bos' ? (dariRiwayat ? 'Bos' : namaBos) : agenDari(l.peran)?.nama;
                  return (
                    <li key={i}>
                      <Avatar id={l.peran} nama={nama} />
                      <details>
                        <summary>
                          <span className="kantor-alur-judul">
                            <b>{l.judul}</b>
                            {l.putusan && <span className={'adm-chip ' + (l.putusan === 'APPROVED' ? 'hijau' : 'merah')}>{l.putusan === 'APPROVED' ? 'Lolos' : 'Revisi'}</span>}
                          </span>
                          <small>
                            {nama}
                            {l.jam && ` · ${l.jam}`}
                            {l.durasi != null && ` · ${lamaTeks(l.durasi)}`}
                            {l.dibaca?.length > 0 && ` · ${l.dibaca.length} data`}
                          </small>
                        </summary>
                        {l.dibaca?.length > 0 && (
                          <div className="kantor-dibaca">
                            {l.dibaca.map((p, j) => (
                              <code key={j}>{p}</code>
                            ))}
                          </div>
                        )}
                        <div className="ai-teks">
                          <TeksMarkdown teks={l.teks} />
                        </div>
                      </details>
                    </li>
                  );
                })}
                {!dariRiwayat && k.jalan && (
                  <li className="kantor-alur-tunggu">
                    <span className="kantor-avatar" aria-hidden="true">…</span>
                    <small>{k.tahap}</small>
                  </li>
                )}
              </ol>
            </section>
          )}

          <KantorJadwal api={api} aktif={aktif} onBuka={(id) => bukaRiwayat({ id })} onSelesai={segarkanRiwayat} />

          <section className="adm-kartu kantor-riwayat">
            <div className="adm-kartu-kepala">
              <h2>Riwayat laporan</h2>
              <span className="adm-redup">{riwayat ? `${riwayat.length} laporan` : ''}</span>
            </div>
            {riwayat === null ? (
              <p className="adm-redup">Memuat…</p>
            ) : riwayat.length === 0 ? (
              <p className="adm-redup">Belum ada laporan. Laporan yang selesai otomatis masuk sini, kelihatan sama semua admin.</p>
            ) : (
              <ul>
                {riwayat.map((r) => {
                  const t = TEMPLATE_ANALISA.find((x) => x.id === r.template);
                  return (
                    <li key={r.id} className={lihat?.id === r.id ? 'on' : ''}>
                      <button type="button" className="kantor-riwayat-buka" onClick={() => bukaRiwayat(r)} disabled={sibuk === 'buka' + r.id}>
                        <b>{r.judul}</b>
                        <small>
                          {tanggalTeks(r.dibuat)}
                          {r.admin_nama && ` · ${r.admin_nama}`}
                        </small>
                        <span className="kantor-riwayat-chip">
                          {t && <span className="adm-chip ungu">{t.label}</span>}
                          {r.meta?.terjadwal && <span className="adm-chip oranye">Terjadwal</span>}
                          {r.artifact_id && <span className="adm-chip hijau">Artifact</span>}
                          {r.meta?.demo && <span className="adm-chip kuning">Demo</span>}
                        </span>
                      </button>
                      <span className="kantor-riwayat-aksi">
                        <button type="button" className="btn kecil" onClick={() => bukaRiwayat(r)} disabled={sibuk === 'buka' + r.id}>
                          Buka
                        </button>
                        <button type="button" className="btn kecil bahaya" onClick={() => setHapus(r)} disabled={sibuk === 'hapus' + r.id}>
                          Hapus
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="kantor-kanan">
          <form className="adm-kartu kantor-tugas" onSubmit={kirim}>
            <div className="adm-kartu-kepala kuning">
              <h2>Minta analisa</h2>
            </div>
            <span className="adm-label kantor-label">Analisa siap pakai</span>
            <div className="kantor-template">
              {TEMPLATE_ANALISA.map((t) => (
                <button key={t.id} type="button" className={template?.id === t.id ? 'on' : ''} onClick={() => pilihTemplate(t)} disabled={k.jalan} title={t.ket}>
                  <b>{t.label}</b>
                  <small>{t.ket}</small>
                </button>
              ))}
            </div>
            <label className="adm-label kantor-label" htmlFor="kantor-tugas">
              Atau tulis sendiri
            </label>
            <textarea
              id="kantor-tugas"
              className="adm-input"
              value={tugas}
              onChange={(e) => {
                setTugas(e.target.value);
                if (!e.target.value) setTemplate(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && kirim(e)}
              placeholder={k.jalan ? 'Tim lagi ngerjain analisa sebelumnya…' : 'Misal: kenapa warung di Cimahi banyak yang nggak lanjut langganan?'}
              maxLength={4000}
              disabled={k.jalan}
            />
            <div className="kantor-opsi">
              <label>
                <input type="checkbox" checked={revisi} onChange={(e) => setRevisi(e.target.checked)} disabled={k.jalan} /> Reviewer boleh minta revisi
              </label>
              {aktif && (
                <label>
                  <input type="checkbox" checked={gosipAi} onChange={(e) => setGosipAi(e.target.checked)} /> Obrolan karyawan dibikin AI (makan kuota AI)
                </label>
              )}
            </div>
            <button className="btn utama" type="submit" disabled={k.jalan || !tugas.trim()}>
              {k.jalan ? 'Lagi dianalisa…' : 'Analisa sekarang'}
            </button>
          </form>

          <section className="adm-kartu kantor-obrolan">
            <div className="adm-kartu-kepala">
              <h2>Obrolan kantor</h2>
              <span className="adm-redup">{k.obrolan.length} pesan</span>
            </div>
            <div
              className="kantor-feed"
              ref={feed}
              aria-live="polite"
              onScroll={(e) => (diBawah.current = e.currentTarget.scrollHeight - e.currentTarget.scrollTop - e.currentTarget.clientHeight < 40)}
            >
              {k.obrolan.length === 0 && <p className="adm-redup">Masih sepi…</p>}
              {k.obrolan.map((b, i) => (
                <div key={i} className="kantor-pesan">
                  <Avatar id={b.id} nama={b.nama} />
                  <div>
                    <span className="kantor-pesan-kepala">
                      <b>{b.nama}</b> <time>{b.jam}</time>
                    </span>
                    <p>{b.teks}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {eksekusi && <EksekusiModal lap={eksekusi} onTutup={tutupEksekusi} />}
      {hapus && (
        <Konfirmasi
          judul="Hapus laporan?"
          pesan={`"${hapus.judul}" dihapus dari riwayat buat semua admin.${hapus.artifact_id ? ' File PDF-nya di Artifact tetap ada.' : ''}`}
          onYa={hapusRiwayat}
          onBatal={() => setHapus(null)}
        />
      )}
    </div>
  );
}
