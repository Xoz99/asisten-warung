import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { tgl, waktu } from '../lib/format.js';
import { Gagal, Konfirmasi, Kosong, Memuat, Modal, useData } from '../komponen/Ui.jsx';
import { unggahBerkas } from '../lib/api.js';
import TeksMarkdown from '../komponen/TeksMarkdown.jsx';

// Artifact: gudang dokumen internal - SOP, dokumen, aset, video, dan catatan, disusun per folder, dengan riwayat versi.
// Alamat: #/artifact (semua), #/artifact/bintang, #/artifact/sampah, #/artifact/<id folder>.
const TIPE = {
  sop: { nama: 'SOP', warna: 'ungu' },
  dokumen: { nama: 'Dokumen', warna: 'biru' },
  catatan: { nama: 'Catatan', warna: 'kuning' },
  aset: { nama: 'Aset', warna: 'hijau' },
  video: { nama: 'Video', warna: 'merah' },
};
const TERIMA = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.md,.jpg,.jpeg,.png,.webp,.gif,.mp4,.webm,.mov,.zip';
const POLA_UUID = /^[0-9a-f-]{36}$/i;

export const ukuranFile = (b) => {
  if (!b) return '0 B';
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${Math.round(b / 1024)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1).replace('.', ',')} MB`;
  return `${(b / 1024 ** 3).toFixed(2).replace('.', ',')} GB`;
};
const ekstensi = (n) => (n && n.includes('.') ? n.split('.').pop().toUpperCase() : '');
const inisial = (n) =>
  (n || '?')
    .split(/\s+/)
    .map((x) => x[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export default function Artifact({ api, tab }) {
  const lokasi = tab === 'bintang' || tab === 'sampah' ? tab : POLA_UUID.test(tab || '') ? tab : 'semua';
  const { data: r, muat: muatRingkasan } = useData(api, '/artifact/ringkasan');
  const { data: pohon, error: errPohon, muat: muatPohon } = useData(api, '/artifact/folder');
  const [versi, setVersi] = useState(0);
  const [dipilih, setDipilih] = useState(null);
  const [modal, setModal] = useState(null); // {jenis:'unggah', files} | {jenis:'catatan', awal} | {jenis:'folder', induk, awal}
  const [pesan, setPesan] = useState('');
  const [seret, setSeret] = useState(false);
  const hitungSeret = useRef(0);

  const segarkan = useCallback(() => {
    setVersi((v) => v + 1);
    muatRingkasan();
    muatPohon();
  }, [muatRingkasan, muatPohon]);

  const folderSekarang = pohon?.folder.find((f) => f.id === lokasi) || null;
  const folderAktif = folderSekarang?.id || null;
  const bolehUnggah = lokasi !== 'sampah';

  // Seret file ke mana aja di halaman = unggah ke folder yang lagi dibuka.
  const adaFile = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  const onDragEnter = (e) => {
    if (!bolehUnggah || !adaFile(e)) return;
    hitungSeret.current++;
    setSeret(true);
  };
  const onDragLeave = (e) => {
    if (!adaFile(e)) return;
    hitungSeret.current = Math.max(0, hitungSeret.current - 1);
    if (!hitungSeret.current) setSeret(false);
  };
  const onDrop = (e) => {
    if (!adaFile(e)) return;
    e.preventDefault();
    hitungSeret.current = 0;
    setSeret(false);
    if (bolehUnggah && e.dataTransfer.files.length) setModal({ jenis: 'unggah', files: [...e.dataTransfer.files] });
  };

  const judulLokasi = lokasi === 'semua' ? 'Semua artifact' : lokasi === 'bintang' ? 'Bintang' : lokasi === 'sampah' ? 'Sampah' : folderSekarang?.nama || 'Folder';

  return (
    <div className="art" onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={(e) => adaFile(e) && e.preventDefault()} onDrop={onDrop}>
      <h1 className="sr-only">Artifact</h1>
      <aside className="art-samping" aria-label="Folder & aksi">
        <div className="art-aksi">
          <button className="btn utama" onClick={() => setModal({ jenis: 'unggah', files: [] })}>
            + Unggah file
          </button>
          <div>
            <button className="btn kecil" onClick={() => setModal({ jenis: 'catatan', awal: { folder_id: folderAktif } })}>
              Catatan baru
            </button>
            <button className="btn kecil" onClick={() => setModal({ jenis: 'folder', induk: folderAktif })}>
              + Folder
            </button>
          </div>
        </div>
        {errPohon ? (
          <Gagal apa="folder" pesan={errPohon} onUlang={muatPohon} />
        ) : !pohon ? (
          <Memuat apa="folder" />
        ) : (
          <Pohon pohon={pohon} lokasi={lokasi} />
        )}
        <Kapasitas r={r} />
      </aside>

      <section className="art-utama">
        {pesan && (
          <p className={pesan.startsWith('Gagal') ? 'adm-error' : 'adm-ok'} role="status" style={{ margin: '0 0 10px' }}>
            {pesan}
          </p>
        )}
        <Isi
          key={lokasi}
          api={api}
          lokasi={lokasi}
          judul={judulLokasi}
          folder={folderSekarang}
          pohon={pohon}
          pemilik={r?.pemilik || []}
          versi={versi}
          onBuka={setDipilih}
          onBerubah={segarkan}
          setPesan={setPesan}
          onUnggah={() => setModal({ jenis: 'unggah', files: [] })}
          onCatatan={() => setModal({ jenis: 'catatan', awal: { folder_id: folderAktif } })}
          onFolder={(x) => setModal({ jenis: 'folder', ...x })}
        />
      </section>

      {seret && (
        <div className="adm-art-seret" aria-hidden="true">
          <div>
            <b>Lepasin file buat diunggah</b>
            <span>Masuk ke: {folderSekarang?.nama || 'tanpa folder'}</span>
          </div>
        </div>
      )}

      {modal?.jenis === 'unggah' && (
        <Unggah
          filesAwal={modal.files}
          folderAwal={folderAktif}
          pohon={pohon}
          maksMb={r?.maksMb}
          onTutup={() => setModal(null)}
          onSelesai={(n) => {
            setModal(null);
            setPesan(`${n} file berhasil diunggah.`);
            segarkan();
          }}
          onSebagian={segarkan}
        />
      )}
      {modal?.jenis === 'catatan' && (
        <Catatan
          api={api}
          awal={modal.awal}
          pohon={pohon}
          onTutup={() => setModal(null)}
          onSelesai={(teks) => {
            setModal(null);
            setPesan(teks);
            segarkan();
          }}
        />
      )}
      {modal?.jenis === 'folder' && (
        <FormFolder
          api={api}
          induk={modal.induk}
          awal={modal.awal}
          pohon={pohon}
          onTutup={() => setModal(null)}
          onSelesai={(teks, id) => {
            setModal(null);
            setPesan(teks);
            segarkan();
            if (id) window.location.hash = `#/artifact/${id}`;
          }}
        />
      )}
      {dipilih && (
        <Detail
          key={dipilih + ':' + versi}
          api={api}
          id={dipilih}
          pohon={pohon}
          onTutup={() => setDipilih(null)}
          onBerubah={segarkan}
          onEditCatatan={(a) => setModal({ jenis: 'catatan', awal: a })}
          setPesan={setPesan}
        />
      )}
    </div>
  );
}

// Kapasitas penyimpanan, versi ramping buat sidebar: satu batang (artifact / kepakai lainnya / sisa) + angka ringkas.
function Kapasitas({ r }) {
  if (!r) return null;
  const d = r.disk;
  const persen = d ? Math.round((d.terpakai / d.total) * 100) : null;
  const pArt = d ? Math.max(1, Math.round((r.terpakai / d.total) * 100)) : 0;
  const pLain = d ? Math.max(0, persen - pArt) : 0;
  const jumlah = Object.entries(TIPE).map(([id, t]) => `${r.perTipe[id] || 0} ${t.nama.toLowerCase()}`);
  return (
    <section className="art-disk" aria-label="Kapasitas penyimpanan">
      <div className="art-disk-atas">
        <span className="adm-label">Disk server</span>
        <b className="p-num" style={persen > 90 ? { color: 'var(--merah)' } : undefined}>
          {d ? `${persen}% kepakai` : '?'}
        </b>
      </div>
      <div className="art-disk-bar" role="img" aria-label={d ? `Disk ${persen} persen kepakai. Artifact ${ukuranFile(r.terpakai)}, sisa ${ukuranFile(d.sisa)}.` : 'Kapasitas disk nggak kebaca'}>
        <i style={{ width: `${pArt}%`, background: 'var(--biru)' }} />
        <i style={{ width: `${pLain}%`, background: '#3F3F46' }} />
      </div>
      <ul className="art-disk-baris">
        <li>
          <i style={{ background: 'var(--biru)' }} /> Artifact <b className="p-num">{ukuranFile(r.terpakai)}</b>
        </li>
        {d && (
          <li>
            <i style={{ background: '#E4E4E7' }} /> Sisa <b className="p-num" style={persen > 90 ? { color: 'var(--merah)' } : undefined}>{ukuranFile(d.sisa)}</b>
          </li>
        )}
      </ul>
      <p className="art-disk-jumlah">
        {r.folder} folder · {jumlah.join(' · ')}
      </p>
    </section>
  );
}

// ---------------- Pohon folder ----------------
function Pohon({ pohon, lokasi }) {
  const anak = useMemo(() => {
    const m = {};
    for (const f of pohon.folder) (m[f.induk_id || 'akar'] = m[f.induk_id || 'akar'] || []).push(f);
    return m;
  }, [pohon]);
  const item = (href, nama, jumlah, aktif, dalam = 0) => (
    <a key={href} href={href} className={'art-simpul' + (aktif ? ' on' : '')} style={dalam ? { paddingLeft: 10 + dalam * 14 } : undefined} aria-current={aktif ? 'page' : undefined}>
      <span>{dalam > 0 ? '↳ ' : ''}{nama}</span>
      <span className="art-jumlah p-num">{jumlah}</span>
    </a>
  );
  const cabang = (f, dalam) => [item(`#/artifact/${f.id}`, f.nama, f.jumlah, lokasi === f.id, dalam), ...(anak[f.id] || []).map((x) => cabang(x, dalam + 1))];
  return (
    <nav className="art-nav">
      {item('#/artifact', 'Semua artifact', pohon.semua, lokasi === 'semua')}
      {item('#/artifact/bintang', 'Bintang', pohon.bintang, lokasi === 'bintang')}
      {item('#/artifact/sampah', 'Sampah', pohon.sampah, lokasi === 'sampah')}
      <p className="adm-label art-nav-label">Folder</p>
      {(anak.akar || []).map((f) => cabang(f, 0))}
      {!pohon.folder.length && <p className="adm-redup art-nav-kosong">Belum ada folder. Bikin folder biar gampang nyarinya.</p>}
    </nav>
  );
}

// ---------------- Daftar isi ----------------
function Isi({ api, lokasi, judul, folder, pohon, pemilik, versi, onBuka, onBerubah, setPesan, onUnggah, onCatatan, onFolder }) {
  const [f, setF] = useState({ q: '', tipe: '', pemilik: '', urut: 'terbaru' });
  const [ketik, setKetik] = useState('');
  const [tampilan, setTampilan] = useState(() => {
    try {
      return localStorage.getItem('makalin_artifact_tampilan') || 'grid';
    } catch {
      return 'grid';
    }
  });
  const [hapusFolder, setHapusFolder] = useState(false);
  const [kosongkan, setKosongkan] = useState(false);
  const mode = lokasi === 'semua' || lokasi === 'bintang' || lokasi === 'sampah' ? lokasi : 'folder';
  const qs = new URLSearchParams({ mode, ...(mode === 'folder' ? { folder: lokasi } : {}), ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), v: versi });
  const { data, error, muat } = useData(api, `/artifact?${qs}`);
  const gantiTampilan = (v) => {
    setTampilan(v);
    try {
      localStorage.setItem('makalin_artifact_tampilan', v);
    } catch {
      /* diblok - cukup di memori */
    }
  };
  const ubah = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const adaFilter = f.q || f.tipe || f.pemilik;
  const bintang = async (a) => {
    try {
      await api('POST', `/artifact/${a.id}/bintang`, { bintang: !a.bintang });
      onBerubah();
    } catch (e) {
      setPesan('Gagal: ' + e.message);
    }
  };
  const induk = folder?.induk_id ? pohon?.folder.find((x) => x.id === folder.induk_id) : null;

  return (
    <>
      <header className="art-kepala">
        <div className="art-judul">
          <nav className="art-jejak" aria-label="Lokasi">
            <a href="#/artifact">Artifact</a>
            {induk && (
              <>
                <span aria-hidden="true">/</span>
                <a href={`#/artifact/${induk.id}`}>{induk.nama}</a>
              </>
            )}
          </nav>
          <h2>{judul}</h2>
          <p className="adm-redup">{data ? `${data.length}${data.length === 500 ? '+' : ''} item` : 'Memuat…'}{folder?.jumlah ? ` · ${folder.jumlah} di folder ini` : ''}</p>
        </div>
        <div className="adm-tombol" style={{ marginTop: 0 }}>
          {folder && (
            <>
              <button className="btn kecil" onClick={() => onFolder({ induk: folder.id })}>
                + Subfolder
              </button>
              <button className="btn kecil" onClick={() => onFolder({ awal: folder })}>
                Ganti nama
              </button>
              <button className="btn kecil bahaya" onClick={() => setHapusFolder(true)}>
                Hapus folder
              </button>
            </>
          )}
          {lokasi === 'sampah' && data?.length > 0 && (
            <button className="btn kecil bahaya" onClick={() => setKosongkan(true)}>
              Kosongkan sampah
            </button>
          )}
        </div>
      </header>

      <div className="art-alat">
        <form
          className="art-cari"
          onSubmit={(e) => {
            e.preventDefault();
            ubah('q', ketik.trim());
          }}
        >
          <input value={ketik} onChange={(e) => setKetik(e.target.value)} placeholder="Cari judul, nama file, tag, isi catatan" aria-label="Cari artifact" />
          <button className="btn kecil" type="submit">
            Cari
          </button>
        </form>
        <select value={f.tipe} onChange={(e) => ubah('tipe', e.target.value)} aria-label="Filter tipe">
          <option value="">Semua tipe</option>
          {Object.entries(TIPE).map(([id, t]) => (
            <option key={id} value={id}>
              {t.nama}
            </option>
          ))}
        </select>
        <select value={f.pemilik} onChange={(e) => ubah('pemilik', e.target.value)} aria-label="Filter pemilik">
          <option value="">Semua pemilik</option>
          {pemilik.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nama}
            </option>
          ))}
        </select>
        <select value={f.urut} onChange={(e) => ubah('urut', e.target.value)} aria-label="Urutan">
          <option value="terbaru">Terakhir diubah</option>
          <option value="nama">Nama A-Z</option>
          <option value="ukuran">Ukuran terbesar</option>
        </select>
        <div className="art-tampil" role="group" aria-label="Tampilan">
          {[['grid', 'Grid'], ['daftar', 'Daftar']].map(([v, n]) => (
            <button key={v} className={tampilan === v ? 'on' : ''} onClick={() => gantiTampilan(v)} aria-pressed={tampilan === v}>
              {n}
            </button>
          ))}
        </div>
      </div>
      {adaFilter && (
        <div className="adm-chip-filter">
          {f.q && (
            <button className="adm-chip" onClick={() => (ubah('q', ''), setKetik(''))} aria-label={`Hapus pencarian ${f.q}`}>
              Cari: {f.q} ×
            </button>
          )}
          {f.tipe && (
            <button className="adm-chip" onClick={() => ubah('tipe', '')} aria-label="Hapus filter tipe">
              {TIPE[f.tipe].nama} ×
            </button>
          )}
          {f.pemilik && (
            <button className="adm-chip" onClick={() => ubah('pemilik', '')} aria-label="Hapus filter pemilik">
              {pemilik.find((p) => p.id === f.pemilik)?.nama || 'Pemilik'} ×
            </button>
          )}
        </div>
      )}

      {error ? (
        <Gagal apa="artifact" pesan={error} onUlang={muat} />
      ) : !data ? (
        <Memuat apa="artifact" />
      ) : data.length === 0 ? (
        adaFilter ? (
          <Kosong judul="Nggak ada yang cocok">Coba hapus salah satu filter di atas.</Kosong>
        ) : lokasi === 'sampah' ? (
          <Kosong judul="Sampah kosong">Item yang dihapus nunggu di sini dulu sebelum dihapus permanen.</Kosong>
        ) : lokasi === 'bintang' ? (
          <Kosong judul="Belum ada yang dibintangi">Klik ☆ di kartu artifact buat naruh yang sering dibuka di sini.</Kosong>
        ) : (
          <Kosong
            judul={folder ? 'Folder ini masih kosong' : 'Belum ada artifact'}
            aksi={
              <div className="adm-tombol" style={{ justifyContent: 'center' }}>
                <button className="btn utama" onClick={onUnggah}>
                  + Unggah file
                </button>
                <button className="btn" onClick={onCatatan}>
                  Catatan baru
                </button>
              </div>
            }
          >
            Unggah file atau tulis catatan. Bisa juga seret file langsung ke halaman ini.
          </Kosong>
        )
      ) : tampilan === 'grid' ? (
        <div className="art-grid">
          {data.map((a) => (
            <article key={a.id} className="art-kartu">
              <button className="art-kartu-isi" onClick={() => onBuka(a.id)}>
                <span className={`art-format ${TIPE[a.tipe].warna}`} aria-hidden="true">
                  {a.tipe === 'catatan' || (a.tipe === 'sop' && !a.nama_file) ? 'MD' : ekstensi(a.nama_file) || '?'}
                </span>
                <span className="art-kartu-teks">
                  <b>{a.judul}</b>
                  <span className="art-kartu-meta">
                    {TIPE[a.tipe].nama} · {a.nama_file ? ukuranFile(a.ukuran) : `${Math.max(1, Math.ceil((a.panjang_isi || 0) / 1200))} menit baca`} · v{a.versi || 1}
                  </span>
                  {mode !== 'folder' && a.folder_nama && <span className="art-kartu-folder">{a.folder_nama}</span>}
                </span>
              </button>
              {lokasi !== 'sampah' && (
                <button className="art-bintang" onClick={() => bintang(a)} aria-pressed={a.bintang} aria-label={a.bintang ? `Hapus bintang ${a.judul}` : `Bintangi ${a.judul}`}>
                  {a.bintang ? '★' : '☆'}
                </button>
              )}
              <div className="art-kartu-bawah">
                <span className="adm-inisial kecil" aria-hidden="true">
                  {inisial(a.pemilik_nama)}
                </span>
                <span className="adm-redup">{a.pemilik_nama || 'Admin dihapus'}</span>
                <span className="adm-redup art-kartu-tgl">{tgl(a.diubah_at)}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="adm-gulir">
          <table className="adm-tabel">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Tipe</th>
                <th className="kanan">Ukuran</th>
                <th>Pemilik</th>
                <th>Tag</th>
                <th>Diubah</th>
              </tr>
            </thead>
            <tbody>
              {data.map((a) => (
                <tr key={a.id} className="adm-saring" tabIndex={0} onClick={() => onBuka(a.id)} onKeyDown={(e) => e.key === 'Enter' && onBuka(a.id)} style={{ cursor: 'pointer' }}>
                  <td>
                    <b>
                      {a.bintang ? '★ ' : ''}
                      {a.judul}
                    </b>
                    <div className="adm-redup">{a.nama_file || 'Catatan'}</div>
                  </td>
                  <td>
                    <span className={`adm-chip ${TIPE[a.tipe].warna}`}>{TIPE[a.tipe].nama}</span>
                  </td>
                  <td className="kanan p-num" style={{ whiteSpace: 'nowrap' }}>
                    {a.nama_file ? ukuranFile(a.ukuran) : '-'}
                  </td>
                  <td>{a.pemilik_nama || '-'}</td>
                  <td>
                    {a.tag.length ? a.tag.map((t) => (
                      <span key={t} className="adm-chip" style={{ marginRight: 4 }}>
                        {t}
                      </span>
                    )) : <span className="adm-redup">-</span>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{waktu(a.diubah_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data?.length === 500 && <p className="adm-redup">Nampilin 500 item pertama. Pakai pencarian atau filter buat yang lebih spesifik.</p>}

      {hapusFolder && (
        <Konfirmasi
          judul={`Hapus folder ${folder.nama}?`}
          pesan="Folder cuma bisa dihapus kalau udah kosong, termasuk isi sampah dan subfoldernya."
          label="Hapus folder"
          onBatal={() => setHapusFolder(false)}
          onYa={async () => {
            try {
              await api('DELETE', `/artifact/folder/${folder.id}`);
              setPesan(`Folder ${folder.nama} dihapus.`);
              setHapusFolder(false);
              window.location.hash = folder.induk_id ? `#/artifact/${folder.induk_id}` : '#/artifact';
              onBerubah();
            } catch (e) {
              setPesan('Gagal: ' + e.message);
              setHapusFolder(false);
            }
          }}
        />
      )}
      {kosongkan && (
        <Konfirmasi
          judul="Kosongkan sampah?"
          pesan={`${data.length} item dan semua versinya dihapus permanen dari server. Nggak bisa dibalikin.`}
          label="Hapus permanen semua"
          onBatal={() => setKosongkan(false)}
          onYa={async () => {
            try {
              const h = await api('POST', '/artifact-sampah/kosongkan');
              setPesan(`${h.n} item dihapus permanen.`);
              onBerubah();
            } catch (e) {
              setPesan('Gagal: ' + e.message);
            }
            setKosongkan(false);
          }}
        />
      )}
    </>
  );
}

// Pilihan folder bertingkat buat <select>.
function OpsiFolder({ pohon, kecuali }) {
  const anak = {};
  for (const f of pohon?.folder || []) (anak[f.induk_id || 'akar'] = anak[f.induk_id || 'akar'] || []).push(f);
  const hasil = [];
  const jalan = (f, dalam) => {
    if (f.id === kecuali) return;
    hasil.push(
      <option key={f.id} value={f.id}>
        {'  '.repeat(dalam) + (dalam ? '↳ ' : '') + f.nama}
      </option>
    );
    (anak[f.id] || []).forEach((x) => jalan(x, dalam + 1));
  };
  (anak.akar || []).forEach((f) => jalan(f, 0));
  return hasil;
}

// ---------------- Unggah ----------------
function Unggah({ filesAwal, folderAwal, pohon, maksMb, onTutup, onSelesai, onSebagian }) {
  const [antre, setAntre] = useState(() => filesAwal.map((f) => ({ f, status: 'siap', progres: 0 })));
  const [folder, setFolder] = useState(folderAwal || '');
  const [tipe, setTipe] = useState('');
  const [tag, setTag] = useState('');
  const [jalan, setJalan] = useState(false);
  const batalRef = useRef(null);
  const inputRef = useRef(null);
  const maks = (maksMb || 300) * 1024 * 1024;

  const tambah = (list) => setAntre((a) => [...a, ...[...list].map((f) => ({ f, status: f.size > maks ? 'gagal' : 'siap', progres: 0, error: f.size > maks ? `Lebih dari ${maksMb} MB` : '' }))]);
  const setItem = (i, x) => setAntre((a) => a.map((it, j) => (j === i ? { ...it, ...x } : it)));

  const mulai = async () => {
    setJalan(true);
    let ok = 0;
    for (let i = 0; i < antre.length; i++) {
      if (antre[i].status !== 'siap') continue;
      setItem(i, { status: 'jalan' });
      const qs = new URLSearchParams({ nama: antre[i].f.name, ...(folder ? { folder } : {}), ...(tipe ? { tipe } : {}), ...(tag.trim() ? { tag } : {}) });
      const u = unggahBerkas(`/artifact/unggah?${qs}`, antre[i].f, (p) => setItem(i, { progres: p }));
      batalRef.current = u.batal;
      try {
        await u.promise;
        setItem(i, { status: 'selesai', progres: 1 });
        ok++;
      } catch (e) {
        setItem(i, { status: 'gagal', error: e.message });
        if (e.dibatalkan) break;
      }
    }
    batalRef.current = null;
    setJalan(false);
    setAntre((a) => {
      if (a.every((x) => x.status === 'selesai')) setTimeout(() => onSelesai(ok), 0);
      else if (ok) onSebagian();
      return a;
    });
  };
  const siap = antre.filter((x) => x.status === 'siap').length;

  return (
    <Modal judul="Unggah file" onTutup={() => !jalan && onTutup()} lebar={620}>
      <label
        className="adm-unggah"
        style={{ marginTop: 0 }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!jalan) tambah(e.dataTransfer.files);
        }}
      >
        <input ref={inputRef} type="file" multiple accept={TERIMA} disabled={jalan} onChange={(e) => (tambah(e.target.files), (e.target.value = ''))} />
        <b>Seret file ke sini atau klik buat milih</b>
        <span className="adm-redup">PDF, Word, Excel, PowerPoint, gambar, video, ZIP · maksimal {maksMb || 300} MB per file</span>
      </label>

      {antre.length > 0 && (
        <ul className="adm-art-antre" aria-label="Antrean unggah">
          {antre.map((x, i) => (
            <li key={i}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ overflowWrap: 'anywhere' }}>
                  <b>{x.f.name}</b> <span className="adm-redup">{ukuranFile(x.f.size)}</span>
                </span>
                {x.status === 'siap' && !jalan ? (
                  <button className="btn kecil" onClick={() => setAntre((a) => a.filter((_, j) => j !== i))} aria-label={`Buang ${x.f.name} dari antrean`}>
                    Buang
                  </button>
                ) : (
                  <span className={`adm-chip ${x.status === 'selesai' ? 'hijau' : x.status === 'gagal' ? 'merah' : x.status === 'jalan' ? 'kuning' : ''}`}>
                    {x.status === 'jalan' ? `${Math.round(x.progres * 100)}%` : { siap: 'Antre', selesai: 'Selesai', gagal: 'Gagal' }[x.status]}
                  </span>
                )}
              </div>
              {(x.status === 'jalan' || x.status === 'selesai') && (
                <div className="adm-art-progres" role="progressbar" aria-valuenow={Math.round(x.progres * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Progres ${x.f.name}`}>
                  <div style={{ width: `${x.progres * 100}%` }} />
                </div>
              )}
              {x.error && <p className="adm-error" style={{ margin: '4px 0 0' }}>{x.error}</p>}
            </li>
          ))}
        </ul>
      )}

      <div className="adm-baris" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <div className="field">
          <label htmlFor="u-folder">Simpan ke folder</label>
          <select id="u-folder" value={folder} onChange={(e) => setFolder(e.target.value)} disabled={jalan} style={{ maxWidth: 'none', width: '100%', minHeight: 44 }}>
            <option value="">Tanpa folder</option>
            <OpsiFolder pohon={pohon} />
          </select>
        </div>
        <div className="field">
          <label htmlFor="u-tipe">Tipe</label>
          <select id="u-tipe" value={tipe} onChange={(e) => setTipe(e.target.value)} disabled={jalan} style={{ maxWidth: 'none', width: '100%', minHeight: 44 }}>
            <option value="">Otomatis dari jenis file</option>
            <option value="sop">SOP</option>
            <option value="dokumen">Dokumen</option>
            <option value="aset">Aset</option>
            <option value="video">Video</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="u-tag">Tag (pisah koma)</label>
          <input id="u-tag" value={tag} onChange={(e) => setTag(e.target.value)} disabled={jalan} placeholder="SOP, INTERNAL" />
        </div>
      </div>

      <div className="adm-tombol" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
        {jalan ? (
          <button className="btn bahaya" onClick={() => batalRef.current?.()}>
            Batalkan upload
          </button>
        ) : (
          <button className="btn" onClick={onTutup}>
            {antre.some((x) => x.status === 'selesai') ? 'Tutup' : 'Batal'}
          </button>
        )}
        <button className="btn utama" disabled={jalan || !siap} onClick={mulai}>
          {jalan ? 'Mengunggah…' : siap ? `Unggah ${siap} file` : 'Pilih file dulu'}
        </button>
      </div>
    </Modal>
  );
}

// ---------------- Catatan (baru / ubah) ----------------
function Catatan({ api, awal, pohon, onTutup, onSelesai }) {
  const edit = Boolean(awal.id);
  const [isi, setIsi] = useState({ judul: awal.judul || '', isi: awal.isi_md || '', folder_id: awal.folder_id || '', tipe: awal.tipe === 'sop' ? 'sop' : 'catatan', tag: (awal.tag || []).join(', '), keterangan: '' });
  const [error, setError] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const ubah = (k) => (e) => setIsi((x) => ({ ...x, [k]: e.target.value }));
  const gaya = { maxWidth: 'none', width: '100%', minHeight: 44 };
  return (
    <Modal judul={edit ? `Ubah ${awal.judul}` : 'Catatan baru'} onTutup={onTutup} lebar={760}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          setSibuk(true);
          try {
            const body = { ...isi, folder_id: isi.folder_id || null };
            if (edit) {
              await api('PATCH', `/artifact/${awal.id}`, body);
              onSelesai(`${isi.judul} disimpan.`);
            } else {
              await api('POST', '/artifact/catatan', body);
              onSelesai(`Catatan ${isi.judul} dibuat.`);
            }
          } catch (err) {
            setError(err.message);
            setSibuk(false);
          }
        }}
      >
        <div className="field">
          <label htmlFor="c-judul">Judul</label>
          <input id="c-judul" value={isi.judul} onChange={ubah('judul')} maxLength={150} required />
        </div>
        <div className="adm-baris" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
          <div className="field">
            <label htmlFor="c-folder">Folder</label>
            <select id="c-folder" value={isi.folder_id} onChange={ubah('folder_id')} style={gaya}>
              <option value="">Tanpa folder</option>
              <OpsiFolder pohon={pohon} />
            </select>
          </div>
          <div className="field">
            <label htmlFor="c-tipe">Tipe</label>
            <select id="c-tipe" value={isi.tipe} onChange={ubah('tipe')} style={gaya}>
              <option value="catatan">Catatan</option>
              <option value="sop">SOP</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="c-tag">Tag (pisah koma)</label>
            <input id="c-tag" value={isi.tag} onChange={ubah('tag')} placeholder="RAPAT, Q4" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="c-isi">Isi (Markdown boleh)</label>
          <textarea id="c-isi" value={isi.isi} onChange={ubah('isi')} rows={14} style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 14 }} placeholder={'# Judul bagian\n\n- poin pertama\n- poin kedua'} />
        </div>
        {edit && (
          <div className="field">
            <label htmlFor="c-ket">Catatan perubahan (opsional, masuk riwayat versi)</label>
            <input id="c-ket" value={isi.keterangan} onChange={ubah('keterangan')} maxLength={200} placeholder="Revisi SLA respons" />
          </div>
        )}
        {error && <p className="adm-error">{error}</p>}
        <div className="adm-tombol" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="btn" onClick={onTutup}>
            Batal
          </button>
          <button type="submit" className="btn utama" disabled={sibuk || !isi.judul.trim()}>
            {sibuk ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------- Folder (baru / ganti nama) ----------------
function FormFolder({ api, induk, awal, pohon, onTutup, onSelesai }) {
  const [nama, setNama] = useState(awal?.nama || '');
  const [indukId, setIndukId] = useState(induk || '');
  const [error, setError] = useState('');
  const [sibuk, setSibuk] = useState(false);
  return (
    <Modal judul={awal ? `Ganti nama ${awal.nama}` : 'Buat folder'} onTutup={onTutup}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          setSibuk(true);
          try {
            if (awal) {
              await api('PATCH', `/artifact/folder/${awal.id}`, { nama });
              onSelesai(`Folder diganti jadi ${nama.trim()}.`);
            } else {
              const h = await api('POST', '/artifact/folder', { nama, induk_id: indukId || null });
              onSelesai(`Folder ${h.nama} dibuat.`, h.id);
            }
          } catch (err) {
            setError(err.message);
            setSibuk(false);
          }
        }}
      >
        <div className="field">
          <label htmlFor="f-nama">Nama folder</label>
          <input id="f-nama" value={nama} onChange={(e) => setNama(e.target.value)} maxLength={80} placeholder="SOP Perusahaan" required />
        </div>
        {!awal && (
          <div className="field">
            <label htmlFor="f-induk">Di dalam folder</label>
            <select id="f-induk" value={indukId} onChange={(e) => setIndukId(e.target.value)} style={{ maxWidth: 'none', width: '100%', minHeight: 44 }}>
              <option value="">Paling atas</option>
              <OpsiFolder pohon={pohon} />
            </select>
          </div>
        )}
        {error && <p className="adm-error">{error}</p>}
        <div className="adm-tombol" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="btn" onClick={onTutup}>
            Batal
          </button>
          <button type="submit" className="btn utama" disabled={sibuk || !nama.trim()}>
            {sibuk ? 'Menyimpan…' : awal ? 'Simpan' : 'Buat folder'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------- Panel detail ----------------
function Detail({ api, id, pohon, onTutup, onBerubah, onEditCatatan, setPesan }) {
  const { data: d, error } = useData(api, `/artifact/${id}`);
  const [tautan, setTautan] = useState(null);
  const [teksPratinjau, setTeksPratinjau] = useState(null);
  const [err, setErr] = useState('');
  const [ubah, setUbah] = useState(false);
  const [hapus, setHapus] = useState(false);
  const [unggahVersi, setUnggahVersi] = useState(null); // progres 0..1
  const a = d?.artifact;
  const diSampah = Boolean(a?.dihapus_at);

  useEffect(() => {
    const tekan = (e) => e.key === 'Escape' && !document.querySelector('.adm-modal') && onTutup();
    document.addEventListener('keydown', tekan);
    return () => document.removeEventListener('keydown', tekan);
  }, [onTutup]);

  // Link pratinjau bertoken (10 menit) buat file yang bisa ditampilin langsung.
  const bisaPratinjau = a?.mime && /^(application\/pdf|image\/|video\/|text\/)/.test(a.mime);
  useEffect(() => {
    if (!a?.nama_file || !bisaPratinjau) return;
    let batal = false;
    api('POST', `/artifact/${a.id}/tautan`, {})
      .then(async (h) => {
        if (batal) return;
        setTautan(h.url);
        if (a.mime.startsWith('text/')) {
          const t = await fetch(h.url).then((x) => x.text());
          if (!batal) setTeksPratinjau(t.slice(0, 20000));
        }
      })
      .catch((e) => !batal && setErr(e.message));
    return () => {
      batal = true;
    };
  }, [api, a?.id, a?.nama_file, a?.mime, bisaPratinjau]);

  const jalan = async (fn, ok, tutup) => {
    setErr('');
    try {
      const h = await fn();
      setPesan(typeof ok === 'function' ? ok(h) : ok);
      onBerubah();
      if (tutup) onTutup();
    } catch (e) {
      setErr(e.message);
    }
  };
  const unduh = () =>
    jalan(async () => {
      const h = await api('POST', `/artifact/${a.id}/tautan`, { unduh: true });
      window.location.href = h.url;
    }, `Mengunduh ${a.nama_file}…`);
  const pilihVersi = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setErr('');
    setUnggahVersi(0);
    const u = unggahBerkas(`/artifact/unggah?${new URLSearchParams({ nama: f.name, artifact: a.id })}`, f, setUnggahVersi);
    u.promise
      .then((h) => {
        setPesan(`Versi ${h.versi} ${a.judul} diunggah.`);
        onBerubah();
      })
      .catch((e2) => setErr(e2.message))
      .finally(() => setUnggahVersi(null));
  };

  const baris = (label, isi) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: '1px solid #e4e4e7' }}>
      <span className="adm-redup">{label}</span>
      <b style={{ textAlign: 'right', overflowWrap: 'anywhere' }}>{isi || '-'}</b>
    </div>
  );

  return (
    <>
      <div className="adm-latar" style={{ padding: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onTutup()} />
      <aside className="adm-laci" role="dialog" aria-modal="true" aria-label="Detail artifact" style={{ width: 'min(560px, 100%)' }}>
        <div className="adm-modal-kepala">
          <h2>Pratinjau</h2>
          <button className="adm-tutup" onClick={onTutup} aria-label="Tutup">
            ×
          </button>
        </div>
        {!d ? (
          error ? <p className="adm-error">{error}</p> : <Memuat apa="artifact" />
        ) : (
          <>
            <div className="adm-art-pratinjau">
              {a.isi_md !== null && a.isi_md !== undefined && !a.nama_file ? (
                a.isi_md.trim() ? (
                  <div className="ai-teks adm-art-md">
                    <TeksMarkdown teks={a.isi_md} />
                  </div>
                ) : <p className="adm-redup">Catatan ini masih kosong.</p>
              ) : !bisaPratinjau ? (
                <div className="adm-art-tanpa">
                  <b>{ekstensi(a.nama_file)}</b>
                  <span className="adm-redup">Pratinjau belum tersedia buat jenis file ini. Unduh buat membukanya.</span>
                </div>
              ) : !tautan ? (
                <Memuat apa="pratinjau" />
              ) : a.mime.startsWith('image/') ? (
                <img src={tautan} alt={a.judul} />
              ) : a.mime.startsWith('video/') ? (
                <video src={tautan} controls preload="metadata" />
              ) : a.mime === 'application/pdf' ? (
                <iframe src={tautan} title={`Pratinjau ${a.judul}`} />
              ) : (
                teksPratinjau != null && /\.(md|markdown)$/i.test(a.nama_file || '') ? (
                  <div className="ai-teks adm-art-md">
                    <TeksMarkdown teks={teksPratinjau} />
                  </div>
                ) : (
                  <pre>{teksPratinjau ?? 'Memuat…'}</pre>
                )
              )}
            </div>
            {tautan && (
              <p style={{ margin: '6px 0 0' }}>
                <a href={tautan} target="_blank" rel="noopener noreferrer" className="adm-link">
                  Buka layar penuh
                </a>
              </p>
            )}

            <h3 style={{ fontSize: 20, margin: '16px 0 6px', overflowWrap: 'anywhere' }}>{a.judul}</h3>
            <span className={`adm-chip ${TIPE[a.tipe].warna}`}>{TIPE[a.tipe].nama}</span> {a.bintang && <span className="adm-chip">★ Bintang</span>} {diSampah && <span className="adm-chip merah">Di sampah</span>}

            {ubah ? (
              <UbahInfo api={api} a={a} pohon={pohon} onBatal={() => setUbah(false)} onSimpan={() => (setUbah(false), setPesan(`${a.judul} disimpan.`), onBerubah())} />
            ) : (
              <div style={{ margin: '12px 0 16px' }}>
                {a.nama_file && baris('File', `${a.nama_file} · ${ukuranFile(a.ukuran)}`)}
                {baris('Folder', a.folder_nama || 'Tanpa folder')}
                {baris('Versi aktif', `v${a.versi || 1}`)}
                {baris('Dibuat oleh', a.pemilik_nama)}
                {baris('Dibuat', tgl(a.created_at))}
                {baris('Terakhir diubah', `${waktu(a.diubah_at)}${a.diubah_nama ? ` · ${a.diubah_nama}` : ''}`)}
                <div style={{ padding: '8px 0' }}>
                  <span className="adm-redup">Tag </span>
                  {a.tag.length ? a.tag.map((t) => (
                    <span key={t} className="adm-chip" style={{ marginRight: 4 }}>
                      {t}
                    </span>
                  )) : <span className="adm-redup">belum ada</span>}
                </div>
              </div>
            )}

            {err && <p className="adm-error">{err}</p>}
            {!ubah && (
              <div className="adm-tombol">
                {diSampah ? (
                  <>
                    <button className="btn utama" onClick={() => jalan(() => api('POST', `/artifact/${a.id}/sampah`, { buang: false }), `${a.judul} dipulihin.`, true)}>
                      Pulihin
                    </button>
                    <button className="btn bahaya" onClick={() => setHapus(true)}>
                      Hapus permanen
                    </button>
                  </>
                ) : (
                  <>
                    {a.nama_file && (
                      <button className="btn utama" onClick={unduh}>
                        Unduh
                      </button>
                    )}
                    {a.isi_md !== null && a.isi_md !== undefined && !a.nama_file && (
                      <button className="btn utama" onClick={() => (onTutup(), onEditCatatan(a))}>
                        Ubah isi
                      </button>
                    )}
                    <button className="btn" onClick={() => setUbah(true)}>
                      Ubah info
                    </button>
                    <button className="btn" onClick={() => jalan(() => api('POST', `/artifact/${a.id}/bintang`, { bintang: !a.bintang }), a.bintang ? 'Bintang dihapus.' : 'Dibintangi.', true)}>
                      {a.bintang ? 'Hapus bintang' : 'Bintangi'}
                    </button>
                    <button className="btn bahaya" onClick={() => jalan(() => api('POST', `/artifact/${a.id}/sampah`, {}), `${a.judul} dipindah ke sampah.`, true)}>
                      Buang ke sampah
                    </button>
                  </>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '22px 0 6px', gap: 10 }}>
              <span className="adm-label">Riwayat versi ({d.versi.length})</span>
              {a.nama_file && !diSampah && (
                <label className="btn kecil" style={{ cursor: unggahVersi !== null ? 'wait' : 'pointer' }}>
                  <input type="file" accept={TERIMA} onChange={pilihVersi} disabled={unggahVersi !== null} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} />
                  {unggahVersi !== null ? `Mengunggah ${Math.round(unggahVersi * 100)}%` : 'Unggah versi baru'}
                </label>
              )}
            </div>
            <ul className="adm-riwayat">
              {d.versi.map((v, i) => (
                <li key={v.id} className="adm-riwayat-item" style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <b>v{v.nomor}</b> · {waktu(v.created_at)}
                    <div className="adm-redup" style={{ overflowWrap: 'anywhere' }}>
                      {v.oleh || 'Admin dihapus'} · {v.keterangan || '-'}
                      {v.nama_file ? ` · ${v.nama_file} (${ukuranFile(v.ukuran)})` : ''}
                    </div>
                  </div>
                  {i === 0 ? (
                    <span className="adm-chip hijau">Aktif</span>
                  ) : (
                    !diSampah && (
                      <button className="btn kecil" onClick={() => jalan(() => api('POST', `/artifact/${a.id}/versi/${v.id}/pulihkan`), (h) => `v${h.dari} dipulihin jadi v${h.jadi}.`)}>
                        Pulihkan
                      </button>
                    )
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        {hapus && (
          <Konfirmasi
            judul={`Hapus permanen ${a.judul}?`}
            pesan="Semua versinya ikut dihapus dari server. Nggak bisa dibalikin."
            label="Hapus permanen"
            onBatal={() => setHapus(false)}
            onYa={() => jalan(() => api('DELETE', `/artifact/${a.id}`), `${a.judul} dihapus permanen.`, true)}
          />
        )}
      </aside>
    </>
  );
}

function UbahInfo({ api, a, pohon, onBatal, onSimpan }) {
  const [isi, setIsi] = useState({ judul: a.judul, folder_id: a.folder_id || '', tipe: a.tipe, tag: a.tag.join(', ') });
  const [error, setError] = useState('');
  const catatan = !a.nama_file;
  const ubah = (k) => (e) => setIsi((x) => ({ ...x, [k]: e.target.value }));
  const gaya = { maxWidth: 'none', width: '100%', minHeight: 44 };
  return (
    <form
      className="adm-kartu"
      style={{ margin: '12px 0 16px', boxShadow: 'none' }}
      onSubmit={async (e) => {
        e.preventDefault();
        setError('');
        try {
          await api('PATCH', `/artifact/${a.id}`, { ...isi, folder_id: isi.folder_id || null });
          onSimpan();
        } catch (err) {
          setError(err.message);
        }
      }}
    >
      <div className="field" style={{ marginTop: 0 }}>
        <label htmlFor="ui-judul">Judul</label>
        <input id="ui-judul" value={isi.judul} onChange={ubah('judul')} maxLength={150} />
      </div>
      <div className="field">
        <label htmlFor="ui-folder">Folder</label>
        <select id="ui-folder" value={isi.folder_id} onChange={ubah('folder_id')} style={gaya}>
          <option value="">Tanpa folder</option>
          <OpsiFolder pohon={pohon} />
        </select>
      </div>
      <div className="field">
        <label htmlFor="ui-tipe">Tipe</label>
        <select id="ui-tipe" value={isi.tipe} onChange={ubah('tipe')} style={gaya}>
          {Object.entries(TIPE)
            .filter(([id]) => (catatan ? ['catatan', 'sop'].includes(id) : id !== 'catatan'))
            .map(([id, t]) => (
              <option key={id} value={id}>
                {t.nama}
              </option>
            ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="ui-tag">Tag (pisah koma)</label>
        <input id="ui-tag" value={isi.tag} onChange={ubah('tag')} />
      </div>
      {error && <p className="adm-error">{error}</p>}
      <div className="adm-tombol">
        <button type="button" className="btn" onClick={onBatal}>
          Batal
        </button>
        <button type="submit" className="btn utama" disabled={!isi.judul.trim()}>
          Simpan
        </button>
      </div>
    </form>
  );
}
