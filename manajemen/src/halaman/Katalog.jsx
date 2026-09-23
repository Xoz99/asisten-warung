import { useEffect, useState } from 'react';
import { waktu } from '../lib/format.js';
import { Gagal, Kosong, Memuat, Modal, Tabs } from '../komponen/Ui.jsx';
import { keWebp } from '../lib/gambar.js';

// Katalog Barang Bersama Warung Pintar: isi katalog yang dipakai warung buat "Ambil dari katalog". Di sini tim
// nambah barang yang nggak ada di database terbuka (rokok, barang lokal/curah), nyetujuin draf, ngerapiin nama/
// kategori/barcode, nonaktifin barang aneh, impor CSV, dan lihat usulan dari barang yang udah dipakai warung.
const TABS = [
  { id: 'draf', nama: 'Draf (perlu dicek)' },
  { id: 'aktif', nama: 'Aktif' },
  { id: 'nonaktif', nama: 'Nonaktif' },
  { id: 'usulan', nama: 'Usulan dari warung' },
];
const SUMBER = { lotte: 'Lotte Grosir', tokopedia: 'Tokopedia', shopee: 'Shopee', alfagift: 'Alfagift', klikindogrosir: 'Klik Indogrosir', off: 'Open Food Facts', obf: 'Open Beauty Facts', opf: 'Open Products Facts', warung: 'Dari warung', tim: 'Tim' };
const namaKat = (k) => (k ? k.charAt(0).toUpperCase() + k.slice(1) : '-');
// Foto yang udah ada di server sendiri (unduhan otomatis / upload tim) didahulukan ketimbang link server luar.
const fotoBarang = (b) => (b.foto_lokal ? `/katalog-foto/${b.foto_lokal}` : b.foto_url || null);

export default function Katalog({ apiProduk, tab }) {
  if (!apiProduk) {
    return (
      <Kosong judul="Warung Pintar belum tersambung">Isi WP_DATABASE_URL di konfigurasi server Makalin biar katalog barangnya bisa dikelola dari sini.</Kosong>
    );
  }
  return <IsiKatalog api={apiProduk} tab={tab} />;
}

function IsiKatalog({ api, tab }) {
  const aktif = TABS.some((t) => t.id === tab) ? tab : 'draf';
  const [f, setF] = useState({ q: '', kategori: '', sumber: '', foto: '' });
  const [ketik, setKetik] = useState('');
  const [halaman, setHalaman] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [versi, setVersi] = useState(0);
  const [pilih, setPilih] = useState(new Set());
  const [pesan, setPesan] = useState('');
  const [modal, setModal] = useState(null); // { jenis:'form', awal } | { jenis:'impor' }

  useEffect(() => {
    const t = setTimeout(() => (setF((x) => ({ ...x, q: ketik.trim() })), setHalaman(1)), 350);
    return () => clearTimeout(t);
  }, [ketik]);
  useEffect(() => {
    if (aktif === 'usulan') return;
    let batal = false;
    const qs = new URLSearchParams({ status: aktif, halaman, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) });
    api('GET', `/katalog?${qs}`)
      .then((d) => !batal && (setData(d), setError('')))
      .catch((e) => !batal && setError(e.message));
    return () => {
      batal = true;
    };
  }, [api, aktif, f, halaman, versi]);
  useEffect(() => setPilih(new Set()), [aktif, f, halaman]);
  useEffect(() => {
    if (!pesan) return;
    const t = setTimeout(() => setPesan(''), 5000);
    return () => clearTimeout(t);
  }, [pesan]);

  const segarkan = () => setVersi((v) => v + 1);
  const jalan = async (fn, ok) => {
    try {
      const r = await fn();
      setPesan(typeof ok === 'function' ? ok(r) : ok);
      segarkan();
      setPilih(new Set());
    } catch (e) {
      setPesan('Gagal: ' + e.message);
    }
  };
  const status = (ids, aksi) =>
    jalan(() => api('POST', '/katalog/status', { ids, aksi }), (r) => `${r.jumlah} barang ${aksi === 'setujui' ? 'disetujui & tampil ke warung' : aksi === 'aktifkan' ? 'diaktifkan' : 'dinonaktifkan'}.`);

  const r = data?.ringkasan;
  const items = data?.items || [];
  const jumlahHalaman = data ? Math.max(1, Math.ceil(data.total / data.perHalaman)) : 1;
  const semuaDipilih = items.length > 0 && items.every((x) => pilih.has(x.id));

  return (
    <>
      <h1 className="sr-only">Katalog barang</h1>
      <div className="kt-atas">
        <div className="kt-angka">
          <span>
            <b className="p-num">{r ? r.aktif.toLocaleString('id-ID') : '…'}</b> aktif
          </span>
          <span className={r?.draf ? 'kt-perlu' : ''}>
            <b className="p-num">{r ? r.draf : '…'}</b> draf perlu dicek
          </span>
          <span>
            <b className="p-num">{r ? r.rokok : '…'}</b> rokok aktif
          </span>
          <button
            type="button"
            className={'kt-angka-tombol' + (f.foto === 'belum' ? ' on' : '')}
            onClick={() => {
              setF((x) => ({ ...x, foto: x.foto === 'belum' ? '' : 'belum' }));
              setHalaman(1);
              if (aktif !== 'aktif') window.location.hash = '#/katalog/aktif';
            }}
            title="Tampilkan barang aktif yang belum ada fotonya"
          >
            <b className="p-num">{r ? (r.tanpa_foto ?? 0).toLocaleString('id-ID') : '…'}</b> belum ada foto
          </button>
        </div>
        <div className="adm-tombol" style={{ marginTop: 0 }}>
          <button className="btn" onClick={() => setModal({ jenis: 'impor' })}>
            Impor CSV
          </button>
          <button className="btn utama" onClick={() => setModal({ jenis: 'form', awal: null })}>
            + Tambah barang
          </button>
        </div>
      </div>
      <p className="adm-redup" style={{ margin: '0 0 12px' }}>
        Barang di sini muncul di app Asisten Warung (Stok &gt; Ambil dari katalog) buat warung yang baru mulai. Draf belum tampil sampai disetujui. Barang yang diubah tim nggak ketimpa waktu impor ulang dari Open Food Facts.
      </p>
      <Tabs daftar={TABS.map((t) => (t.id === 'draf' && r?.draf ? { ...t, nama: `${t.nama} · ${r.draf}` } : t))} aktif={aktif} href={(id) => `#/katalog/${id}`} />
      {pesan && (
        <p className={pesan.startsWith('Gagal') ? 'adm-error' : 'adm-ok'} role="status">
          {pesan}
        </p>
      )}

      {aktif === 'usulan' ? (
        <Usulan api={api} onTambah={(awal) => setModal({ jenis: 'form', awal })} versi={versi} />
      ) : (
        <>
          <div className="kt-alat">
            <input value={ketik} onChange={(e) => setKetik(e.target.value)} placeholder="Cari nama, merek, barcode" aria-label="Cari barang" />
            <select value={f.kategori} onChange={(e) => (setF((x) => ({ ...x, kategori: e.target.value })), setHalaman(1))} aria-label="Kategori">
              <option value="">Semua kategori</option>
              {(data?.kategori || []).map((k) => (
                <option key={k} value={k}>
                  {namaKat(k)}
                </option>
              ))}
            </select>
            <select value={f.foto} onChange={(e) => (setF((x) => ({ ...x, foto: e.target.value })), setHalaman(1))} aria-label="Foto">
              <option value="">Semua (foto)</option>
              <option value="belum">Belum ada foto</option>
              <option value="ada">Ada foto</option>
            </select>
            <select value={f.sumber} onChange={(e) => (setF((x) => ({ ...x, sumber: e.target.value })), setHalaman(1))} aria-label="Sumber">
              <option value="">Semua sumber</option>
              {Object.entries(SUMBER).map(([v, n]) => (
                <option key={v} value={v}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          {pilih.size > 0 && (
            <div className="kt-massal" role="region" aria-label="Aksi barang terpilih">
              <b>{pilih.size} dipilih</b>
              {aktif === 'draf' && (
                <button className="btn kecil utama" onClick={() => status([...pilih], 'setujui')}>
                  Setujui
                </button>
              )}
              {aktif === 'nonaktif' ? (
                <button className="btn kecil" onClick={() => status([...pilih], 'aktifkan')}>
                  Aktifkan
                </button>
              ) : (
                <button className="btn kecil" onClick={() => status([...pilih], 'nonaktifkan')}>
                  Nonaktifkan
                </button>
              )}
              <button className="btn kecil" onClick={() => setPilih(new Set())}>
                Batal pilih
              </button>
            </div>
          )}
          {error ? (
            <Gagal apa="katalog" pesan={error} onUlang={segarkan} />
          ) : !data ? (
            <Memuat apa="katalog" />
          ) : items.length === 0 ? (
            <Kosong judul={aktif === 'draf' ? 'Nggak ada draf' : 'Nggak ada barang'}>
              {aktif === 'draf' ? 'Semua draf udah dicek. Draf baru muncul dari impor CSV atau daftar bawaan (npm run draf:katalog).' : 'Coba ubah pencarian atau filternya.'}
            </Kosong>
          ) : (
            <div className="adm-gulir">
              <table className="adm-tabel kt-tabel">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        className="adm-centang"
                        checked={semuaDipilih}
                        onChange={() => setPilih(semuaDipilih ? new Set() : new Set(items.map((x) => x.id)))}
                        aria-label="Pilih semua di halaman ini"
                      />
                    </th>
                    <th>Barang</th>
                    <th>Kategori</th>
                    <th>Satuan</th>
                    <th>Barcode</th>
                    <th>Sumber</th>
                    <th className="kanan">Dipakai</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <input
                          type="checkbox"
                          className="adm-centang"
                          checked={pilih.has(b.id)}
                          onChange={() =>
                            setPilih((p) => {
                              const x = new Set(p);
                              if (x.has(b.id)) x.delete(b.id);
                              else x.add(b.id);
                              return x;
                            })
                          }
                          aria-label={`Pilih ${b.nama}`}
                        />
                      </td>
                      <td>
                        <div className="kt-barang">
                          <span className="kt-foto" aria-hidden="true">
                            <i>{b.nama.charAt(0)}</i>
                            {fotoBarang(b) && <img key={fotoBarang(b)} src={fotoBarang(b)} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.display = 'none')} />}
                          </span>
                          <span>
                            <b>{b.nama}</b>
                            <span className="adm-redup">{[b.merek, b.ukuran].filter(Boolean).join(' · ') || ' '}</span>
                          </span>
                        </div>
                      </td>
                      <td>{namaKat(b.kategori)}</td>
                      <td>
                        {b.satuan}
                        {b.isi_kemasan > 1 && <div className="adm-redup">{`1 ${b.nama_kemasan || 'kemasan'} = ${b.isi_kemasan}`}</div>}
                      </td>
                      <td className="adm-mono">{b.barcode || <span className="adm-redup">-</span>}</td>
                      <td>
                        <span className={'adm-chip' + (b.sumber === 'tim' ? ' kuning' : b.sumber === 'warung' ? ' hijau' : '')}>{SUMBER[b.sumber] || b.sumber}</span>
                        {b.diubah_oleh && <div className="adm-redup" style={{ fontSize: 11 }}>{b.diubah_oleh}, {waktu(b.updated_at)}</div>}
                      </td>
                      <td className="kanan p-num">{b.dipakai_warung ? `${b.dipakai_warung} warung` : '-'}</td>
                      <td>
                        <span className="kt-aksi">
                          <UploadFoto api={api} b={b} ada={Boolean(fotoBarang(b))} onSelesai={(t) => (setPesan(t), segarkan())} />
                          <button className="btn kecil" onClick={() => setModal({ jenis: 'form', awal: b })}>
                            Ubah
                          </button>
                          {b.draf ? (
                            <>
                              <button className="btn kecil utama" onClick={() => status([b.id], 'setujui')}>
                                Setujui
                              </button>
                              <button
                                className="btn kecil bahaya"
                                onClick={() => window.confirm(`Hapus draf "${b.nama}"?`) && jalan(() => api('DELETE', `/katalog/${b.id}`), `Draf ${b.nama} dihapus.`)}
                              >
                                Hapus
                              </button>
                            </>
                          ) : b.aktif ? (
                            <button className="btn kecil" onClick={() => status([b.id], 'nonaktifkan')}>
                              Nonaktifkan
                            </button>
                          ) : (
                            <button className="btn kecil" onClick={() => status([b.id], 'aktifkan')}>
                              Aktifkan
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
          {data && data.total > data.perHalaman && (
            <div className="adm-halaman">
              <span className="adm-label" style={{ fontSize: 11 }}>
                {((halaman - 1) * data.perHalaman + 1).toLocaleString('id-ID')}-{Math.min(data.total, halaman * data.perHalaman).toLocaleString('id-ID')} dari {data.total.toLocaleString('id-ID')} barang
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn kecil" disabled={halaman <= 1} onClick={() => setHalaman((h) => h - 1)}>
                  ‹ Sebelumnya
                </button>
                <button className="btn kecil" disabled={halaman >= jumlahHalaman} onClick={() => setHalaman((h) => h + 1)}>
                  Berikutnya ›
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {modal?.jenis === 'form' && (
        <FormBarang
          awal={modal.awal}
          kategori={data?.kategori || ['sembako', 'minuman', 'susu', 'snack', 'mie instan', 'bumbu', 'rokok', 'kebersihan', 'lainnya']}
          onTutup={() => setModal(null)}
          onSimpan={async (isi) => {
            if (modal.awal?.id) await api('PATCH', `/katalog/${modal.awal.id}`, isi);
            else await api('POST', '/katalog', isi);
            setModal(null);
            setPesan(modal.awal?.id ? `${isi.nama} disimpan.` : `${isi.nama} ditambah ke katalog${isi.aktif === false ? ' sebagai draf' : ''}.`);
            segarkan();
          }}
        />
      )}
      {modal?.jenis === 'impor' && (
        <ImporCsv
          api={api}
          onTutup={() => setModal(null)}
          onSelesai={(t) => {
            setModal(null);
            setPesan(t);
            segarkan();
          }}
        />
      )}
    </>
  );
}

// Upload foto satu barang katalog: dikecilin di browser dulu (maks 800px WEBP/JPEG), lalu disimpan ke server.
function UploadFoto({ api, b, ada, onSelesai }) {
  const [sibuk, setSibuk] = useState(false);
  return (
    <label className={'btn kecil' + (ada ? '' : ' utama') + (sibuk ? ' kt-sibuk' : '')} title={ada ? 'Ganti foto barang ini' : 'Upload foto barang ini'}>
      {sibuk ? 'Upload…' : ada ? 'Ganti foto' : '+ Foto'}
      <input
        type="file"
        accept="image/*"
        hidden
        disabled={sibuk}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setSibuk(true);
          try {
            await api('PUT', `/katalog/${b.id}/foto`, { foto: await keWebp(file, 800, 0.85) });
            onSelesai(`Foto ${b.nama} disimpan - langsung kepakai di app warung.`);
          } catch (err) {
            onSelesai('Gagal upload foto: ' + err.message);
          } finally {
            setSibuk(false);
          }
        }}
      />
    </label>
  );
}

function FormBarang({ awal, kategori, onTutup, onSimpan }) {
  const [isi, setIsi] = useState({
    nama: awal?.nama || '',
    merek: awal?.merek || '',
    kategori: awal?.kategori || 'lainnya',
    satuan: awal?.satuan || 'pcs',
    isi_kemasan: String(awal?.isi_kemasan || 1),
    nama_kemasan: awal?.nama_kemasan || '',
    ukuran: awal?.ukuran || '',
    barcode: awal?.barcode || '',
    foto_url: awal?.foto_url || '',
  });
  const [aktif, setAktif] = useState(true);
  const [error, setError] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const ubah = (k) => (e) => setIsi((x) => ({ ...x, [k]: e.target.value }));
  const edit = Boolean(awal?.id);
  return (
    <Modal judul={edit ? 'Ubah barang katalog' : 'Tambah barang ke katalog'} onTutup={onTutup}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          setSibuk(true);
          try {
            await onSimpan({ ...isi, isi_kemasan: Number(isi.isi_kemasan) || 1, ...(edit ? {} : { aktif }) });
          } catch (err) {
            setError(err.message);
            setSibuk(false);
          }
        }}
      >
        {edit && awal.sumber !== 'tim' && (
          <p className="adm-redup" style={{ marginTop: 0 }}>
            Barang ini dari {SUMBER[awal.sumber] || awal.sumber}. Setelah diubah, sumbernya jadi "Tim" dan nggak ketimpa impor ulang.
          </p>
        )}
        <div className="field" style={{ marginTop: 0 }}>
          <label htmlFor="kt-nama">Nama barang (yang dilihat warung)</label>
          <input id="kt-nama" value={isi.nama} onChange={ubah('nama')} maxLength={120} placeholder="Misal: Gudang Garam Surya 12" autoFocus />
        </div>
        <div className="adm-baris" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <div className="field">
            <label htmlFor="kt-merek">Merek</label>
            <input id="kt-merek" value={isi.merek} onChange={ubah('merek')} maxLength={60} />
          </div>
          <div className="field">
            <label htmlFor="kt-kat">Kategori</label>
            <select id="kt-kat" value={isi.kategori} onChange={ubah('kategori')} style={{ maxWidth: 'none', width: '100%', minHeight: 44 }}>
              {kategori.map((k) => (
                <option key={k} value={k}>
                  {namaKat(k)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="kt-satuan">Satuan jual</label>
            <input id="kt-satuan" value={isi.satuan} onChange={ubah('satuan')} maxLength={20} placeholder="pcs / bungkus / kg" />
          </div>
          <div className="field">
            <label htmlFor="kt-ukuran">Ukuran (info)</label>
            <input id="kt-ukuran" value={isi.ukuran} onChange={ubah('ukuran')} maxLength={30} placeholder="85 g / 600 ml" />
          </div>
          <div className="field">
            <label htmlFor="kt-kemasan">Kemasan besar</label>
            <input id="kt-kemasan" value={isi.nama_kemasan} onChange={ubah('nama_kemasan')} maxLength={20} placeholder="dus / slop (opsional)" />
          </div>
          <div className="field">
            <label htmlFor="kt-isi">Isi per kemasan besar</label>
            <input id="kt-isi" value={isi.isi_kemasan} onChange={(e) => setIsi((x) => ({ ...x, isi_kemasan: e.target.value.replace(/\D/g, '') }))} inputMode="numeric" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="kt-barcode">Barcode (opsional, dari kemasan asli)</label>
          <input id="kt-barcode" className="adm-mono" value={isi.barcode} onChange={(e) => setIsi((x) => ({ ...x, barcode: e.target.value.replace(/\D/g, '') }))} inputMode="numeric" maxLength={14} />
        </div>
        <div className="field">
          <label htmlFor="kt-foto">Link foto (opsional, https://)</label>
          <input id="kt-foto" value={isi.foto_url} onChange={ubah('foto_url')} maxLength={500} />
        </div>
        {!edit && (
          <label className="kt-cek">
            <input type="checkbox" checked={!aktif} onChange={(e) => setAktif(!e.target.checked)} /> Simpan sebagai draf dulu (belum tampil ke warung)
          </label>
        )}
        {error && <p className="adm-error">{error}</p>}
        <div className="adm-tombol" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="btn" onClick={onTutup}>
            Batal
          </button>
          <button type="submit" className="btn utama" disabled={sibuk || !isi.nama.trim()}>
            {sibuk ? 'Menyimpan…' : edit ? 'Simpan' : 'Tambah'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// CSV sederhana: pemisah koma atau titik koma, tanda kutip ganda buat isi yang ada komanya. Baris pertama = judul kolom.
function bacaCsv(teks) {
  const barisMentah = teks.replace(/^﻿/, '').split(/\r?\n/).filter((b) => b.trim());
  if (!barisMentah.length) return [];
  const pemisah = (barisMentah[0].match(/;/g) || []).length > (barisMentah[0].match(/,/g) || []).length ? ';' : ',';
  const pecah = (b) => {
    const hasil = [];
    let isi = '';
    let kutip = false;
    for (let i = 0; i < b.length; i++) {
      const c = b[i];
      if (kutip) {
        if (c === '"' && b[i + 1] === '"') {
          isi += '"';
          i++;
        } else if (c === '"') kutip = false;
        else isi += c;
      } else if (c === '"') kutip = true;
      else if (c === pemisah) {
        hasil.push(isi);
        isi = '';
      } else isi += c;
    }
    hasil.push(isi);
    return hasil.map((x) => x.trim());
  };
  const judul = pecah(barisMentah[0]).map((j) => j.toLowerCase().replace(/\s+/g, '_'));
  return barisMentah.slice(1).map((b) => Object.fromEntries(pecah(b).map((v, i) => [judul[i], v])));
}
const CONTOH_CSV = 'nama,merek,kategori,satuan,barcode,ukuran,nama_kemasan,isi_kemasan\nGudang Garam Surya 12,Gudang Garam,rokok,bungkus,,,slop,10\nKopi Kapal Api Special Mix,Kapal Api,minuman,sachet,,25 g,renceng,10\n';

function ImporCsv({ api, onTutup, onSelesai }) {
  const [baris, setBaris] = useState(null);
  const [namaFile, setNamaFile] = useState('');
  const [langsungAktif, setLangsungAktif] = useState(false);
  const [hasil, setHasil] = useState(null);
  const [error, setError] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const unduhContoh = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([CONTOH_CSV], { type: 'text/csv' }));
    a.download = 'contoh-katalog.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  return (
    <Modal judul="Impor barang dari CSV" onTutup={onTutup}>
      <p className="adm-redup" style={{ marginTop: 0 }}>
        Kolom: <span className="adm-mono">nama</span> (wajib), <span className="adm-mono">merek, kategori, satuan, barcode, ukuran, nama_kemasan, isi_kemasan</span>. Bisa dari Google Sheets /
        Excel (Simpan sebagai CSV). Barcode & nama yang udah ada dilewati.{' '}
        <button type="button" className="adm-link" onClick={unduhContoh}>
          Unduh contoh
        </button>
      </p>
      {!hasil ? (
        <>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setError('');
              try {
                const b = bacaCsv(await f.text());
                if (!b.length) throw new Error('Nggak ada baris data di file ini');
                if (!('nama' in b[0])) throw new Error('Kolom "nama" nggak ketemu di baris judul');
                if (b.length > 2000) throw new Error('Maksimal 2.000 baris sekali impor');
                setBaris(b);
                setNamaFile(f.name);
              } catch (err) {
                setError(err.message);
                setBaris(null);
              }
            }}
          />
          {baris && (
            <>
              <p style={{ marginBottom: 6 }}>
                <b>{namaFile}</b>: {baris.length} baris. Contoh 3 baris pertama:
              </p>
              <ul className="adm-daftar" style={{ fontSize: 13 }}>
                {baris.slice(0, 3).map((b, i) => (
                  <li key={i}>
                    <span>
                      <b>{b.nama || '(nama kosong)'}</b> <span className="adm-redup">{[b.kategori, b.satuan, b.barcode].filter(Boolean).join(' · ')}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <label className="kt-cek">
                <input type="checkbox" checked={langsungAktif} onChange={(e) => setLangsungAktif(e.target.checked)} /> Langsung aktif (tanpa draf) - centang cuma kalau datanya udah dicek
              </label>
            </>
          )}
          {error && <p className="adm-error">{error}</p>}
          <div className="adm-tombol" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" className="btn" onClick={onTutup}>
              Batal
            </button>
            <button
              type="button"
              className="btn utama"
              disabled={!baris || sibuk}
              onClick={async () => {
                setSibuk(true);
                setError('');
                try {
                  setHasil(await api('POST', '/katalog/impor', { baris, langsungAktif }));
                } catch (err) {
                  setError(err.message);
                } finally {
                  setSibuk(false);
                }
              }}
            >
              {sibuk ? 'Mengimpor…' : `Impor ${baris?.length || ''} baris`}
            </button>
          </div>
        </>
      ) : (
        <>
          <p>
            <b>{hasil.masuk}</b> barang masuk {langsungAktif ? '(aktif)' : 'sebagai draf'} · {hasil.dobel} udah ada, dilewati · {hasil.ditolak.length} ditolak
          </p>
          {hasil.ditolak.length > 0 && (
            <ul className="adm-daftar" style={{ fontSize: 13, maxHeight: 220, overflowY: 'auto' }}>
              {hasil.ditolak.map((d) => (
                <li key={d.baris}>
                  <span>
                    Baris {d.baris}: {d.alasan}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="adm-tombol" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn utama" onClick={() => onSelesai(`Impor selesai: ${hasil.masuk} masuk, ${hasil.dobel} dilewati, ${hasil.ditolak.length} ditolak.`)}>
              Selesai
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

function Usulan({ api, onTambah, versi }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let batal = false;
    api('GET', '/katalog/usulan')
      .then((d) => !batal && setData(d))
      .catch((e) => !batal && setError(e.message));
    return () => {
      batal = true;
    };
  }, [api, versi]);
  if (error) return <Gagal apa="usulan" pesan={error} />;
  if (!data) return <Memuat apa="usulan" />;
  if (!data.length) return <Kosong judul="Belum ada usulan">Barang yang ditambah warung sendiri (dan belum ada di katalog) muncul di sini. Masuk otomatis ke katalog kalau udah dipakai 3 warung.</Kosong>;
  return (
    <>
      <p className="adm-redup" style={{ marginTop: 0 }}>
        Barang yang ditambah warung sendiri tapi belum ada di katalog. Otomatis masuk kalau udah dipakai 3 warung - atau masukin sekarang kalau namanya udah bener. Harga per warung nggak ditampilin.
      </p>
      <div className="adm-gulir">
        <table className="adm-tabel">
          <thead>
            <tr>
              <th>Nama (paling sering dipakai)</th>
              <th>Kategori</th>
              <th>Satuan</th>
              <th>Barcode</th>
              <th className="kanan">Dipakai</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.map((u) => (
              <tr key={u.kunci}>
                <td>
                  <b>{u.nama}</b>
                </td>
                <td>{namaKat(u.kategori)}</td>
                <td>{u.satuan}</td>
                <td className="adm-mono">{u.barcode || '-'}</td>
                <td className="kanan p-num">{u.warung} warung</td>
                <td>
                  <button className="btn kecil" onClick={() => onTambah({ nama: u.nama, kategori: u.kategori, satuan: u.satuan, barcode: u.barcode })}>
                    Masukin ke katalog
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
