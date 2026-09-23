import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { ProductIcon, CameraIcon } from '../lib/icons.jsx';
import { kritisQ, hppRata } from '../lib/voice';
import { rupiah, escapeHtml, angkaRingkas } from '../lib/format';
import { MARGIN_REKOMENDASI, hargaDariMargin } from '../lib/harga';
import { api } from '../lib/api';
import { PIN_GAMPANG, hashPinLokal, errorJaringan } from '../lib/pin';
import { IKON_PRODUK, tebakIkon } from '../lib/ikonProduk';
import PilihIkon from '../components/PilihIkon.jsx';
import KonfirmasiHapus from '../components/KonfirmasiHapus.jsx';
import { bukaKamera, tutupKamera, jepretFrame, keWebp } from '../lib/kamera';
import { ambilEmbedding } from '../lib/visualScan';
import { useModelVisual } from '../lib/useModelVisual';
import { FORMAT_RETAIL, ambilCanvasROI, buatDekoderZxing, mulaiScanBarcode as mulaiScanBarcodeShared } from '../lib/barcodeScan';
import SheetKatalog from '../components/SheetKatalog.jsx';
import { tungguReferensiKatalog } from '../lib/referensiKatalog';

// Barang yang cuma beda ukuran/varian tapi merek sama (misal "Aqua 600ml" & "Aqua 1500ml") bisa
// dikasih "grup" yang sama (lihat form daftar barang / opname) biar ditampilin sekelompok di sini,
// bukan berantakan sebagai baris-baris terpisah tanpa hubungan.
function kelompokkan(list) {
  const map = new Map(); // key: grup (lowercase) -> {nama, items}
  const tunggal = [];
  for (const p of list) {
    const key = p.grup?.trim().toLowerCase();
    if (key) {
      if (!map.has(key)) map.set(key, { nama: p.grup.trim(), items: [] });
      map.get(key).items.push(p);
    } else {
      tunggal.push(p);
    }
  }
  return { grupList: [...map.values()], tunggal };
}

// Isi 1 baris barang (dipakai standalone maupun di dalam card grup) — nama, harga, laku, & progress stok.
function BarisProduk({ p, onTap }) {
  const maks = p.laku * 4 || 20;
  const pct = Math.min(100, Math.round((p.stok / maks) * 100));
  const kr = kritisQ(p);
  return (
    <div onClick={onTap} style={onTap ? { cursor: 'pointer' } : undefined}>
      <div className="between">
        <div className="row">
          <ProductIcon id={p.id} foto={p.foto} />
          <div>
            <div className="nama">{p.nama}</div>
            <div className="tgl">
              {rupiah(p.harga)} · laku {angkaRingkas(p.laku)}/hari ·{' '}
              <span className="ic-inline">
                <svg viewBox="0 0 24 24">
                  <rect x="5.5" y="11" width="13" height="9" rx="2.5" />
                  <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
                </svg>
              </span>{' '}
              detail
            </div>
          </div>
        </div>
        <span className={'tag' + (kr ? ' hot' : pct > 60 ? ' aman' : '')}>
          Sisa {p.stok} {p.satuan}
        </span>
      </div>
      <div className="bar">
        <i className={kr ? '' : 'kun'} style={{ width: Math.max(4, pct) + '%' }} />
      </div>
    </div>
  );
}

export default function Stok() {
  const { S, authWarung, lisensi } = useApp();
  const [filter, setFilter] = useState('all');
  const [cari, setCari] = useState('');
  const [barcodeMode, setBarcodeMode] = useState(null); // null | 'barcode' | 'foto'
  const [opnameProduk, setOpnameProduk] = useState(null);
  const [pinCallback, setPinCallback] = useState(null);
  const [tambahVarianGrup, setTambahVarianGrup] = useState(null); // {nama, contoh} - kartu grup mana yang lagi nambah varian baru
  // Katalog barang bersama. Dibuka otomatis kalau datang dari kartu "Langkah awal" di Beranda (flag sekali pakai).
  const [katalogBuka, setKatalogBuka] = useState(() => {
    try {
      const ada = sessionStorage.getItem('wp_buka_katalog') === '1';
      sessionStorage.removeItem('wp_buka_katalog');
      return ada;
    } catch {
      return false;
    }
  });

  // Akun demo (buat presentasi sales) nggak pakai PIN - PIN-nya emang nggak bisa dibikin/diganti di akun demo,
  // jadi kalau tetap diminta, sales mentok di "Bikin PIN pemilik". lisensi.demo ikut dicek buat sesi login lama.
  const mintaPin = (cb) => (authWarung?.demo || lisensi?.demo ? cb() : setPinCallback(() => cb));

  let list = S.produk.slice().sort((a, b) => a.stok / a.laku - b.stok / b.laku);
  if (filter === 'kritis') list = list.filter(kritisQ);
  else if (filter !== 'all') list = list.filter((p) => p.kat === filter);
  if (cari.trim()) {
    const q = cari.trim().toLowerCase();
    list = list.filter((p) => p.nama.toLowerCase().includes(q));
  }

  const jumlahKritis = S.produk.filter(kritisQ).length;

  return (
    <>
      <div style={{ paddingTop: 14 }}>
        <p className="p-h1">Stok barang</p>
        <p className="p-sub">
          {S.produk.length} jenis barang · {jumlahKritis} hampir habis · tap barang untuk opname
        </p>
      </div>

      <div className="scan katalog" onClick={() => setKatalogBuka(true)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setKatalogBuka(true)}>
        <div className="kotak">
          <svg viewBox="0 0 24 24">
            <path d="M4 5h16M4 12h16M4 19h10M18 17l2 2 3-4" />
          </svg>
        </div>
        <div>
          <b>Ambil dari katalog</b>
          <span>{S.produk.length ? 'Centang barang lain yang kamu jual' : 'Nggak perlu ngetik - centang aja barang yang kamu jual'}</span>
        </div>
      </div>

      <div className="scan-grid">
        <div className="scan" onClick={() => setBarcodeMode('barcode')}>
          <div className="kotak aksen">
            <svg viewBox="0 0 24 24">
              <path d="M4 6.5v11M7.3 6.5v11M10.6 6.5v8M13.9 6.5v11M17.2 6.5v8M20 6.5v11" />
            </svg>
          </div>
          <div>
            <b>Tambah/kelola barang</b>
            <span>Arahkan kamera ke barcode</span>
          </div>
        </div>
        <div className="scan alt" onClick={() => setBarcodeMode('foto')}>
          <div className="kotak">
            <svg viewBox="0 0 24 24">
              <path d="M4 8.5V6a2 2 0 0 1 2-2h2.5M15.5 4H18a2 2 0 0 1 2 2v2.5M20 15.5V18a2 2 0 0 1-2 2h-2.5M8.5 20H6a2 2 0 0 1-2-2v-2.5M4 12h16" />
            </svg>
          </div>
          <div>
            <b>Tambah/kelola barang</b>
            <span>Tidak ada barcode? foto saja bungkusnya</span>
          </div>
        </div>
      </div>

      <div className="cari">
        <svg viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="6.2" />
          <path d="m15.6 15.6 4.4 4.4" />
        </svg>
        <input type="text" placeholder="Cari barang…" value={cari} onChange={(e) => setCari(e.target.value)} />
        {cari && (
          <button className="cari-clear" onClick={() => setCari('')} aria-label="Hapus pencarian">
            <svg viewBox="0 0 24 24">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        )}
      </div>

      <div className="tabs">
        {[
          ['all', 'Semua'],
          ['kritis', 'Hampir habis'],
          ['sembako', 'Sembako'],
          ['minuman', 'Minuman'],
        ].map(([id, label]) => (
          <button key={id} className={'tab' + (filter === id ? ' act' : '')} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>

      <div>
        {list.length === 0 && (
          <div className="card">
            <div className="kosong">{cari.trim() ? `Tidak ada barang cocok "${cari.trim()}"` : 'Tidak ada barang di kategori ini'}</div>
          </div>
        )}
        {/* barang yang punya "grup" (misal beberapa ukuran Aqua) ditampilin sekelompok dalam 1 card,
            barang tanpa grup tetap 1 card sendiri kayak sebelumnya */}
        {kelompokkan(list).grupList.map(({ nama, items }) => (
          <div key={nama} className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <p className="p-sec" style={{ margin: 0 }}>
                {nama}
              </p>
              {/* Nambah varian baru (misal Basreng 100ml -> ada juga Basreng 500ml) LANGSUNG dari
                  sini - grup-nya udah kekunci ke grup kartu ini, kategori/satuan udah ke-isi dari
                  varian yang udah ada (items[0]) sebagai default, dan TANPA scan barcode/foto lagi
                  (beda dari alur "Tambah/kelola barang" yang di atas, itu buat produk beneran baru
                  yang belum ada sama sekali). */}
              <button
                type="button"
                className="hapus-mini"
                style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}
                onClick={() => setTambahVarianGrup({ nama, contoh: items[0] })}
                aria-label={`Tambah varian ${nama}`}
              >
                + Varian
              </button>
            </div>
            {items.map((p, i) => (
              <div key={p.id} style={i > 0 ? { marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--garis)' } : undefined}>
                <BarisProduk p={p} onTap={() => mintaPin(() => setOpnameProduk(p))} />
              </div>
            ))}
          </div>
        ))}
        {kelompokkan(list).tunggal.map((p) => (
          <div key={p.id} className="card tapx" onClick={() => mintaPin(() => setOpnameProduk(p))}>
            <BarisProduk p={p} />
          </div>
        ))}
      </div>

      {katalogBuka && <SheetKatalog onClose={() => setKatalogBuka(false)} />}
      {barcodeMode && <SheetBarcode mode={barcodeMode} onClose={() => setBarcodeMode(null)} onKelola={(p) => mintaPin(() => setOpnameProduk(p))} />}
      {opnameProduk && <SheetOpname produk={opnameProduk} onClose={() => setOpnameProduk(null)} />}
      {tambahVarianGrup && (
        <SheetTambahVarian grup={tambahVarianGrup.nama} contoh={tambahVarianGrup.contoh} onClose={() => setTambahVarianGrup(null)} />
      )}
      {pinCallback && (
        <SheetPin
          onClose={() => setPinCallback(null)}
          onSukses={() => {
            const cb = pinCallback;
            setPinCallback(null);
            cb();
          }}
        />
      )}
    </>
  );
}

// Nambah varian baru ke grup yang UDAH ada (misal udah ada "Basreng 100ml", mau nambahin "Basreng
// 500ml") - dipicu dari tombol "+ Varian" di kartu grup (lihat Stok() di atas). SENGAJA nggak lewat
// alur scan barcode/foto kayak SheetBarcode (form "Tambah/kelola barang" yang butuh scan itu buat
// produk yang BENERAN baru, belum ada sama sekali) - di sini user CUMA mau nambah 1 ukuran/varian
// dari barang yang mereknya udah dikenal, jadi cukup form ringkas: grup udah kekunci ke grup kartu
// ini, kategori & satuan udah ke-isi dari varian yang udah ada (`contoh`) sebagai default (bisa
// diubah kalau beda), tinggal isi nama lengkap + harga + modal + stok awal.
function SheetTambahVarian({ grup, contoh, onClose }) {
  const { toast, refreshData } = useApp();
  // Dulu di-prefill `${grup} ` (nama grup + spasi) - niatnya biar tinggal nambahin ukuran di
  // belakangnya, tapi kalau user nggak sadar perlu nambahin apa-apa lagi (apalagi kalau nama
  // grup-nya sendiri kebetulan udah kedengeran kayak nama lengkap, misal grup ke-isi salah jadi
  // "basreng 100ml"), submit-nya ke-tolak validasi di bawah tapi cuma toast sekilas - kerasanya
  // kayak "nggak kesimpen" tanpa jelas kenapa. Sekarang dikosongin + placeholder doang, biar user
  // SADAR harus ngetik nama lengkap dari awal, bukan ngandelin teks yang udah ke-isi duluan.
  const [nama, setNama] = useState('');
  const [kategori, setKategori] = useState(contoh?.kat || 'sembako');
  const [satuan, setSatuan] = useState(contoh?.satuan || 'pcs');
  const [harga, setHarga] = useState('');
  const [modal, setModal] = useState('');
  const [stok, setStok] = useState('');
  const [simpanLoading, setSimpanLoading] = useState(false);

  const namaTrim = nama.trim();
  const samaKayakGrup = namaTrim && namaTrim.toLowerCase() === grup.trim().toLowerCase();

  const simpan = async () => {
    if (!namaTrim) return toast('Nama varian belum diisi');
    if (samaKayakGrup) return; // tombolnya udah dimatiin buat kasus ini, harusnya nggak sempet ke sini
    setSimpanLoading(true);
    try {
      await api.produk.tambah({
        nama: namaTrim,
        kategori: kategori.trim() || 'sembako',
        harga: +harga || 0,
        modal: +modal || 0,
        stok: +stok || 0,
        satuan: satuan.trim() || 'pcs',
        grup: grup.trim(),
      });
      toast(`<b>${escapeHtml(namaTrim)}</b> ditambahin ke grup ${escapeHtml(grup)}`);
      await refreshData();
      onClose();
    } catch (e) {
      toast(e.message ? escapeHtml(e.message) : 'Gagal nambahin varian');
    } finally {
      setSimpanLoading(false);
    }
  };

  return (
    <div className="sheet show">
      <div className="panel">
        <h3>Tambah varian {grup}</h3>
        <p className="p-sub">
          Barang ini otomatis masuk grup "{grup}" - nggak perlu scan barcode/foto. Fotonya ikut foto grup, bisa diganti kapan aja
          lewat detail barangnya.
        </p>
        <div className="field" style={{ marginTop: 14 }}>
          <label>Nama lengkap</label>
          <input value={nama} onChange={(e) => setNama(e.target.value)} placeholder={`Contoh: ${grup} 500ml`} autoFocus />
          {samaKayakGrup && (
            <p className="opnhint" style={{ color: '#e5484d' }}>
              Nama ini sama persis kayak nama grup-nya - kasih ciri pembeda (ukuran/rasa/varian), misal "{grup} 500ml"
            </p>
          )}
        </div>
        <div className="field">
          <label>Kategori</label>
          <input value={kategori} onChange={(e) => setKategori(e.target.value)} placeholder="sembako / minuman / dst" />
        </div>
        <div className="field">
          <label>Satuan jual</label>
          <input value={satuan} onChange={(e) => setSatuan(e.target.value)} placeholder="pcs / botol / butir / bungkus" />
        </div>
        <div className="field">
          <label>Harga jual</label>
          <input type="number" inputMode="numeric" value={harga} onChange={(e) => setHarga(e.target.value)} />
        </div>
        <div className="field">
          <label>HPP (modal beli)</label>
          <input type="number" inputMode="numeric" value={modal} onChange={(e) => setModal(e.target.value)} />
        </div>
        <div className="field">
          <label>Stok awal</label>
          <input type="number" inputMode="numeric" value={stok} onChange={(e) => setStok(e.target.value)} />
        </div>
        <button className="btn utama" style={{ width: '100%', marginTop: 16 }} disabled={simpanLoading || !namaTrim || samaKayakGrup} onClick={simpan}>
          {simpanLoading ? 'Menyimpan…' : 'Simpan varian baru'}
        </button>
        <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={onClose}>
          Batal
        </button>
      </div>
    </div>
  );
}

// mode 'barcode' pakai ZXing (decode barcode asli dari live camera). mode 'foto' pakai MobileNet
// buat cari barang yang MIRIP (visual similarity, PRD 10.1) — dipakai buat restock barang yang
// sudah ada. Dua-duanya, kalau barangnya belum pernah terdaftar, berujung ke form "barang baru"
// (bukan cuma nge-random pick barang lama kayak versi demo sebelumnya).
// Foto referensi >1 sudut per barang (PRD 10.1: "foto barang 3 angle — depan, miring, dekat")
// bikin pencocokan jauh lebih tahan beda posisi/angle pas transaksi, dibanding cuma 1 foto.
const LABEL_SUDUT = ['depan', 'miring', 'dekat'];
const MAKS_SUDUT = LABEL_SUDUT.length;
// Foto referensi visual cuma kepake sebagai thumbnail 56×56 (lihat style di kartu "Foto referensi"
// di bawah) - beda dari foto tampilan produk (produk.foto) yang beneran dipajang gede. Pencocokan
// AI-nya sendiri juga nggak baca ulang foto yang tersimpen ini - embedding-nya udah dihitung
// LANGSUNG dari frame kamera (lihat ambilEmbedding di jepretFoto/jepretSudutBaru), foto cuma
// buat ditampilin ke user. Jadi aman dikecilin jauh dari 800px (ukuran foto tampilan produk) ke
// 240px (cukup tajam buat thumbnail 56px di layar retina 2x-3x) - hemat storage lumayan besar
// soalnya ini dikali MAKS_SUDUT (sampai 3 foto per produk), beda dari foto produk yang cuma 1.
const LEBAR_FOTO_REFERENSI = 240;

// Daftar nama grup yang UDAH pernah dipakai (dari produk yang ada) - dipakai buat <datalist>
// autocomplete di field Grup (biar milih dari yang udah ada, nggak ngetik ulang manual & gampang
// typo/beda kapital - "Aqua" vs "aqua" dianggap grup BEDA kalau sampe kececer beda ketikan).
const daftarGrupUnik = (produkList) => [...new Set(produkList.map((p) => p.grup).filter(Boolean))].sort();

// Nyaranin grup otomatis pas nambah barang baru: kalau nama yang lagi diketik SATU KATA PERTAMANYA
// sama kayak produk yang UDAH ada & udah punya grup (misal udah ada "Basreng 100gr" grup "Basreng",
// terus sekarang ngetik "Basreng 500gr") - langsung isiin field Grup-nya, nggak perlu diinget &
// diketik manual lagi. Cuma jalan kalau field Grup-nya masih kosong (nggak nimpa yang udah diisi
// sendiri sama user), dan kata pertamanya minimal 3 huruf (biar nggak asal ke-trigger dari kata
// pendek yang gampang collision, misal "es").
function grupOtomatis(namaBaru, produkList) {
  const kataPertama = namaBaru.trim().split(/\s+/)[0]?.toLowerCase();
  if (!kataPertama || kataPertama.length < 3) return null;
  const cocok = produkList.find((p) => p.grup && p.nama.toLowerCase().startsWith(kataPertama));
  return cocok?.grup || null;
}

function SheetBarcode({ mode, onClose, onKelola }) {
  const { S, dispatch, toast, refreshData, tanganiErrorAi } = useApp();
  const [step, setStep] = useState('memuat'); // memuat|scan|memindai|pilih|tidak-ketemu-visual|barcode-gagal|detected|tambah|baru|tambah-sudut|error
  const [errorMsg, setErrorMsg] = useState('');
  const [produk, setProduk] = useState(null);
  const [kandidat, setKandidat] = useState([]);
  const [qty, setQty] = useState(10);
  const [harga, setHarga] = useState(0);
  const [inputKemasan, setInputKemasan] = useState(false); // stok masuk: per satuan (false) atau per kemasan besar (true)
  const [jumlahKemasan, setJumlahKemasan] = useState(1);
  const [hargaKemasan, setHargaKemasan] = useState(0);

  const [barcodeBaru, setBarcodeBaru] = useState('');
  const [kodeManual, setKodeManual] = useState('');
  const [refFotos, setRefFotos] = useState([]); // [{sudut, embedding, foto}] - bisa lebih dari 1
  const [jepretSisi, setJepretSisi] = useState(false); // lagi ngitung embedding sisi yang barusan dijepret
  const [fotoJepretan, setFotoJepretan] = useState(null);
  const [namaBaru, setNamaBaru] = useState('');
  const [hargaBaru, setHargaBaru] = useState(0);
  const [modalBaru, setModalBaru] = useState(0);
  const [stokBaru, setStokBaru] = useState(0);
  const [grupBaru, setGrupBaru] = useState('');
  const [grupBaruFokus, setGrupBaruFokus] = useState(false); // dropdown saran grup lagi kebuka apa nggak
  const [satuanBaru, setSatuanBaru] = useState('pcs');
  const [isiKemasanBaru, setIsiKemasanBaru] = useState(1);
  const [fotoProdukBaru, setFotoProdukBaru] = useState(null); // foto tampilan barang (WEBP)
  const [namaKemasanBaru, setNamaKemasanBaru] = useState('');
  const [carianReferensi, setCarianReferensi] = useState('');
  const [hasilReferensi, setHasilReferensi] = useState(null); // null = belum dicari, [] = dicari tapi kosong
  const [cariReferensiLoading, setCariReferensiLoading] = useState(false);
  // Barang yang BARUSAN dipilih dari hasil "Cari referensi" tapi harganya belum dipilih - lihat
  // alur 3 pilihan harga di bawah. null = lagi nampilin daftar hasil biasa.
  const [refTerpilih, setRefTerpilih] = useState(null);
  const opsiHargaRef = useRef(null);
  const [dariKatalog, setDariKatalog] = useState(null); // barang katalog yang cocok sama barcode baru ini
  const [kategoriKatalog, setKategoriKatalog] = useState(null);
  const [fotoKatalog, setFotoKatalog] = useState(null);

  // Sheet "barang belum terdaftar" itu panjang (foto barang segede layar di atas), jadi 3 pilihan
  // harga yang baru muncul itu posisinya di BAWAH lipatan - kalau nggak digeser sendiri, dari
  // sudut pandang user tap-nya kayak nggak ngefek apa-apa: daftar hasilnya ilang, ganti sesuatu
  // yang nggak kelihatan.
  useEffect(() => {
    if (refTerpilih && opsiHargaRef.current) {
      opsiHargaRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [refTerpilih]);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const controlsRef = useRef(null);
  const matiRef = useRef(false); // true kalau sheet ini udah ditutup/unmount - dicek loop biar gak terus jalan setelah itu
  const fotoAsliRef = useRef(null); // foto res-penuh dari jepretan visual terakhir - dipakai lagi kalau nyoba cadangan AI
  const embeddingRef = useRef(null); // embedding MobileNet dari jepretan visual terakhir

  const handleBarcode = async (kode) => {
    controlsRef.current?.stop();
    setStep('memuat');
    try {
      const p = await api.produk.barcode(kode);
      setProduk(p);
      setHarga(p.modal);
      setStep('detected');
    } catch (e) {
      if (e.status === 404) {
        setBarcodeBaru(kode);
        setStep('baru');
        // Barang belum ada di stok warung ini - coba cari di katalog bersama (termasuk Open Food Facts) biar
        // nama/satuan/kisaran harganya langsung keisi. Gagal / nggak ketemu = form tetap kosong kayak biasa.
        api.katalog
          .barcode(kode)
          .then((b) => {
            if (matiRef.current) return;
            setNamaBaru((n) => n || b.nama);
            setSatuanBaru(b.satuan || 'pcs');
            setIsiKemasanBaru(b.isi_kemasan || 1);
            setKategoriKatalog(b.kategori || null);
            if (b.harga?.tengah) setHargaBaru((h) => h || b.harga.tengah);
            if (b.foto_url) setFotoKatalog(b.foto_url);
            setDariKatalog(b);
          })
          .catch(() => {});
      } else {
        // e.status cuma keisi kalau backend beneran ngebales (lihat req() di lib/api.js) — kalau
        // gagal manggil server sama sekali (jaringan kedip, server lokal belom nyala/lagi restart,
        // dll), e.status bakal undefined dan nyasar ke sini. Ini biasanya cuma gangguan SESAAT,
        // jadi jangan langsung nutup seluruh sheet scan (dulu begitu — bikin user ilang konteks
        // pas lagi asik nyecan) — cukup kasih tau & lanjut scan lagi.
        toast(e.message ? escapeHtml(e.message) : 'Gagal mencari barang, coba pindai lagi');
        if (!matiRef.current && mode === 'barcode') {
          setStep('scan');
          mulaiScanBarcode();
        } else if (!matiRef.current) {
          onClose();
        }
      }
    }
  };

  // Loop scan barcode-nya sendiri ada di lib/barcodeScan.js (dipakai bareng sama Catat Jualan
  // mode hybrid) — di sini cuma nyambungin ke handleBarcode & controlsRef. Dipisah jadi function
  // sendiri (bukan langsung dipanggil di effect) biar bisa DIPANGGIL ULANG kalau scan sebelumnya
  // gagal gara-gara error jaringan/server (lihat handleBarcode di atas), bukan cuma jalan sekali
  // doang pas sheet-nya baru dibuka.
  const mulaiScanBarcode = () => {
    controlsRef.current = mulaiScanBarcodeShared({ videoRef, matiRef, onDetect: handleBarcode });
  };

  // Model pengenal foto dimuat buat mode foto, DAN buat mode barcode begitu masuk form barang baru -
  // di situ pemilik bisa jepret 3 sisi barangnya (lihat "Foto dari 3 sisi" di form). Dimuat duluan di
  // belakang biar pas tombol "+" ditap modelnya udah siap, bukan baru mulai diunduh saat itu.
  const model = useModelVisual(mode === 'foto' || step === 'baru' || step === 'tambah-sudut');

  useEffect(() => {
    let batal = false;
    // Reset tiap efek jalan - alasannya sama persis kayak SheetVisual di Catat.jsx: tanpa ini,
    // cleanup StrictMode ninggalin matiRef = true & loop scan barcode mati sebelum sempat jalan.
    matiRef.current = false;
    (async () => {
      try {
        setStep('memuat');
        // Kamera NGGAK lagi nunggu model (lihat useModelVisual & SheetVisual di Catat.jsx): dulu
        // Promise.all bikin stream kamera bocor & nyala terus kalau modelnya gagal dimuat.
        const stream = await bukaKamera('environment');
        if (batal) {
          tutupKamera(stream);
          return;
        }
        streamRef.current = stream; // disimpen DULUAN, sebelum apa pun yang bisa gagal
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        if (batal) return;
        if (mode === 'barcode') mulaiScanBarcode();
        setStep('scan');
      } catch (e) {
        if (!batal) {
          setErrorMsg(e.message || 'Gagal membuka kamera');
          setStep('error');
        }
      }
    })();
    return () => {
      batal = true;
      matiRef.current = true;
      controlsRef.current?.stop();
      tutupKamera(streamRef.current);
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Balik ke live camera pas mau nambah sudut lain (video-nya sempat dilepas waktu di step 'baru')
  useEffect(() => {
    if (step === 'tambah-sudut' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [step]);

  const jepretFoto = async () => {
    const fotoAsli = jepretFrame(videoRef.current); // resolusi kamera penuh - dipakai duluan buat preview biar cepet
    fotoAsliRef.current = fotoAsli; // disimpen buat dipakai lagi kalau nanti nyoba cadangan AI (cariPakaiAiVisual)
    setFotoJepretan(fotoAsli);
    setStep('memindai');
    try {
      const embedding = await ambilEmbedding(videoRef.current);
      embeddingRef.current = embedding;
      await tungguReferensiKatalog(); // barang yang baru diambil dari katalog ikut kecocokan
      const cocok = await api.scan.visual(embedding);
      if (cocok.length) {
        setKandidat(cocok);
        setStep('pilih');
      } else {
        setStep('tidak-ketemu-visual');
      }
    } catch (e) {
      toast(e.message ? escapeHtml(e.message) : 'Gagal memindai');
      setStep('scan');
    }
  };

  // Dulu ini jalan OTOMATIS begitu cocok.length===0 (langsung dianggap barang baru). Sekarang jadi
  // pilihan eksplisit lewat tombol di step 'tidak-ketemu-visual' - dikasih kesempatan coba
  // cariPakaiAiVisual() dulu sebelum nyerah nganggep ini pasti barang baru.
  const daftarkanBarangBaru = async () => {
    const fotoAsli = fotoAsliRef.current;
    if (!fotoAsli) return;
    // dikecilin dulu SEBELUM disimpen ke state - foto ini bakal ikut dikirim ke backend, jangan
    // sampe kirim resolusi kamera mentah yang bisa gede banget dari HP modern. Foto yang sama ini
    // dipakai buat 2 keperluan beda ukuran: fotoProdukBaru dipajang gede (produk.foto, width:100%
    // di form) jadi tetap 800px, tapi refFotos cuma thumbnail 56px (lihat komentar
    // LEBAR_FOTO_REFERENSI) jadi dikecilin lagi terpisah - dua-duanya diturunin dari fotoAsli
    // yang sama, bukan salah satu di-downscale dari yang lain (kualitasnya tetap dari sumber asli).
    const [fotoBesar, fotoKecil] = await Promise.all([keWebp(fotoAsli, 800), keWebp(fotoAsli, LEBAR_FOTO_REFERENSI)]);
    setFotoJepretan(fotoBesar);
    setRefFotos([{ sudut: LABEL_SUDUT[0], embedding: embeddingRef.current, foto: fotoKecil }]);
    setFotoProdukBaru(fotoBesar); // udah ada foto dari proses scan-nya, nggak perlu minta foto lagi
    setStep('baru');
  };

  // Cadangan TERAKHIR (Gemini Vision) buat scan barang - dipanggil manual kalau user tap "Coba
  // cariin pakai AI" di step 'tidak-ketemu-visual'. Beda dari cosine similarity di atas (ngukur
  // kemiripan VEKTOR), ini beneran nanya Gemini "barang ini yang mana dari daftar produk warung
  // ini" - kepake pas foto barusan beda banget sudut/cahaya-nya dari foto referensi yang kesimpen,
  // jadi embeddingnya nggak cukup mirip walau sebenarnya barang yang sama. Ada biaya kecil tiap
  // panggilan (beda dari cosine similarity yang gratis) - makanya BUKAN otomatis, harus ditap.
  const cariPakaiAiVisual = async () => {
    if (!fotoAsliRef.current) return;
    setStep('memindai');
    try {
      const fotoKirim = await keWebp(fotoAsliRef.current, 1024);
      const cocok = await api.scan.visualAi(fotoKirim);
      if (cocok.length) {
        setKandidat(cocok);
        setStep('pilih');
      } else {
        toast('AI juga nggak nemu yang cocok - kayaknya emang barang baru');
        setStep('tidak-ketemu-visual');
      }
    } catch (e) {
      tanganiErrorAi(e);
      setStep('tidak-ketemu-visual');
    }
  };

  // Tombol "Jepret & pindai" — buat jaga-jaga kalau loop live-scan otomatis nggak nemu-nemu
  // (misal HP-nya BarcodeDetector-nya bermasalah, atau gambar live-nya kena blur/goyang). User
  // bisa tahan HP anteng dulu baru tap, jadi framenya diam & fokusnya lebih pasti dibanding
  // ngandelin frame yang ke-grab otomatis pas lagi gerak. Dicoba 2 tahap: BarcodeDetector native
  // dulu (kalau ada), lanjut ZXing kalau belum ketemu — dua-duanya dijalanin di frame diam yang
  // SAMA biar adil dibanding kondisi live.
  // Dulu cuma nyoba SEKALI dari 1 foto - kalau pas ke-tap jarinya kamera masih dikit goyang/belum
  // fokus pas persis, langsung nyerah & balik ke 'scan' (kerasa kayak "jepret, gak kebaca, balik
  // lagi" tanpa kesempatan kedua). Sekarang nyoba beberapa kali dalam ±1.5 detik, AMBIL FRAME BARU
  // tiap percobaan (bukan mendekode ulang foto statis yang sama) - dikasih jeda dikit tiap
  // percobaan biar kamera sempat settle/fokus ulang.
  const ambilFotoBarcode = async () => {
    if (!videoRef.current?.videoWidth) return;
    controlsRef.current?.stop(); // jeda loop live-scan background dulu, biar gak rebutan proses sama percobaan manual ini
    const canvasScan = document.createElement('canvas'); // 1 canvas dipakai ULANG tiap percobaan, lihat komentar ambilCanvasROI
    const fotoAwal = ambilCanvasROI(videoRef.current, 900, canvasScan).toDataURL('image/webp', 0.85);
    fotoAsliRef.current = fotoAwal; // disimpen buat dipakai lagi kalau nanti nyoba cadangan AI (cariBarcodeAi)
    setFotoJepretan(fotoAwal); // biar keliatan apa yang barusan difoto, bukan kotak kosong item
    setStep('memindai');
    // Kasih browser kesempatan gambar ulang UI ('Mencocokkan…' + foto) dulu SEBELUM komputasi
    // berat & blocking di bawah mulai jalan — kalau nggak, layarnya sempet freeze dulu baru
    // ke-render, jadinya kerasa kayak nge-hang dari awal.
    await new Promise((r) => requestAnimationFrame(r));
    try {
      let detector = null;
      if ('BarcodeDetector' in window) {
        try {
          detector = new window.BarcodeDetector({ formats: FORMAT_RETAIL });
        } catch {
          detector = new window.BarcodeDetector();
        }
      }
      // Dekoder yang sama kayak loop live (lib/barcodeScan.js) - versi lama di sini bikin canvas
      // sementara baru tiap percobaan (6x per tap) waktu nyoba barcode yang tegak.
      const zxing = await buatDekoderZxing();

      const MAKS_PERCOBAAN = 6;
      let kode = null;
      for (let i = 0; i < MAKS_PERCOBAAN && !kode; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, 220)); // kasih jeda kamera settle sebelum ambil frame baru
        const canvas = ambilCanvasROI(videoRef.current, 900, canvasScan);
        if (detector) {
          try {
            // Timeout per-percobaan dipendekin (dulu 3 detik buat 1x percobaan) - sekarang ini
            // salah satu dari beberapa percobaan, jangan sampai 1 percobaan yang nyangkut bikin
            // total nunggunya kelamaan.
            const timeoutDetect = new Promise((resolve) => setTimeout(() => resolve([]), 700));
            const hasil = await Promise.race([detector.detect(canvas), timeoutDetect]);
            if (hasil.length) {
              kode = hasil[0].rawValue;
              break;
            }
          } catch (e) {
            // eslint-disable-next-line no-console
            console.log(`[barcode][jepret] percobaan #${i + 1} BarcodeDetector gagal:`, e.name, e.message);
          }
        }
        // Posisi normal dulu, baru diputar 90 derajat buat barcode yang tegak. Beda dari loop live
        // (yang gantian per giliran): ini tap manual dengan frame yang lagi diam, jadi dua-duanya
        // dicoba sekaligus biar nggak ada percobaan yang kebuang.
        kode = zxing.dekode(canvas, false) || zxing.dekode(canvas, true);
        if (!kode) {
          // eslint-disable-next-line no-console
          console.log(`[barcode][jepret] percobaan #${i + 1} ZXing belum nemu`);
        }
      }
      if (kode) return handleBarcode(kode);
      // Dulu langsung toast + balik ke 'scan' di sini. Sekarang nawarin cadangan AI dulu (step
      // 'barcode-gagal') - loop live-scan background-nya SENGAJA belum dinyalain lagi di sini,
      // biar nggak rebutan proses sama panggilan AI kalau user milih coba itu (dinyalain lagi di
      // cariBarcodeAi kalau itu juga gagal, atau di tombol "coba manual lagi" di step ini).
      setStep('barcode-gagal');
    } catch (e) {
      toast(e.message ? escapeHtml(e.message) : 'Gagal memindai foto');
      mulaiScanBarcode();
      setStep('scan');
    }
  };

  // Cadangan TERAKHIR (Gemini Vision) buat scan barcode - dipanggil manual kalau user tap "Coba
  // baca pakai AI" di step 'barcode-gagal', abis BarcodeDetector native + ZXing (gratis, di client)
  // udah dicoba berkali-kali & tetap gagal. Baca ANGKA yang tercetak di bawah barcode-nya (OCR,
  // bukan "mendekode" barcode-nya - lihat komentar lengkap di bacaBarcodeGemini backend). Ada biaya
  // kecil tiap panggilan - makanya BUKAN otomatis, harus ditap.
  const cariBarcodeAi = async () => {
    if (!fotoAsliRef.current) return;
    setStep('memindai');
    try {
      const { kode } = await api.scan.barcodeAi(fotoAsliRef.current);
      if (kode) return handleBarcode(kode);
      toast('AI juga nggak nemu angka yang jelas - coba isi manual aja');
      setStep('barcode-gagal');
    } catch (e) {
      tanganiErrorAi(e);
      setStep('barcode-gagal');
    }
  };

  const kembaliScanManual = () => {
    mulaiScanBarcode(); // nyalain lagi loop live-scan background-nya
    setStep('scan');
  };

  // dipanggil dari step 'tambah-sudut' — nambah 1 foto referensi lagi buat barang yang lagi didaftarin
  const jepretSudutBaru = async () => {
    // Ngitung embedding makan waktu (apalagi di HP lambat) - tanpa penanda ini, tap dua kali bikin
    // sisi yang sama kesimpen dua kali & jatah 3 sisinya kebuang.
    if (jepretSisi) return;
    setJepretSisi(true);
    const fotoAsli = jepretFrame(videoRef.current);
    try {
      const embedding = await ambilEmbedding(videoRef.current);
      // sama kayak jepretFoto() - dikecilin dulu sebelum disimpen, soalnya ini juga ikut
      // dikirim ke backend sebagai foto referensi visual. Bukan foto tampilan produk (itu udah
      // ke-set dari sudut pertama), jadi langsung kecil aja (lihat LEBAR_FOTO_REFERENSI).
      const foto = await keWebp(fotoAsli, LEBAR_FOTO_REFERENSI);
      setFotoJepretan(foto);
      setRefFotos((rf) => [...rf, { sudut: LABEL_SUDUT[rf.length] || `sudut-${rf.length + 1}`, embedding, foto }]);
    } catch (e) {
      toast(e.message ? escapeHtml(e.message) : 'Gagal memproses foto');
    } finally {
      setJepretSisi(false);
      setStep('baru');
    }
  };

  const simpanStokMasuk = () => {
    const lama = produk.modal;
    if (inputKemasan) {
      const jk = +jumlahKemasan || 0;
      if (!jk) return toast(`Jumlah ${escapeHtml(produk.namaKemasan) || 'kemasan'} belum diisi`);
      const qSetara = jk * produk.isiKemasan;
      const hargaSatuan = +hargaKemasan / produk.isiKemasan || produk.modal;
      const baru = hppRata(produk, qSetara, hargaSatuan);
      dispatch({ type: 'MASUK_STOK', produkId: produk.id, data: { jumlahKemasan: jk, hargaKemasan: +hargaKemasan || undefined } });
      toast(`${jk} ${escapeHtml(produk.namaKemasan) || 'kemasan'} (${qSetara} ${escapeHtml(produk.satuan)}) masuk · HPP rata-rata ${rupiah(lama)} → <b>${rupiah(baru)}</b>`);
    } else {
      const q = +qty || 0;
      if (!q) return toast('Jumlah masuk belum diisi');
      const baru = hppRata(produk, q, +harga || produk.modal);
      dispatch({ type: 'MASUK_STOK', produkId: produk.id, data: { qty: q, harga: +harga || produk.modal } });
      toast(`${q} ${escapeHtml(produk.satuan)} ${escapeHtml(produk.nama)} masuk · HPP rata-rata ${rupiah(lama)} → <b>${rupiah(baru)}</b>`);
    }
    onClose();
  };

  const pilihFotoProduk = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = async () => {
      try {
        setFotoProdukBaru(await keWebp(r.result));
      } catch {
        toast('Gagal memproses foto');
      }
    };
    r.readAsDataURL(f);
  };

  // "Cari referensi" - manual (tombol, bukan otomatis tiap ketik, biar nggak boros panggilan AI)
  // buat nyaranin isi kemasan & kisaran harga dari pengetahuan umum Gemini (BUKAN database harga
  // live), biar nggak input satu-satu dari nol pas nambah barang yang mereknya udah umum dikenal
  // (misal rokok). Hasilnya SELALU cuma nge-ISI FORM yang bisa diedit, nggak pernah nyimpen
  // langsung - user tetap yang mutusin & bisa koreksi sebelum tap "Simpan barang baru" di bawah.
  const cariReferensi = async () => {
    const q = carianReferensi.trim();
    if (!q) return;
    setCariReferensiLoading(true);
    try {
      const hasil = await api.produk.cariReferensi(q);
      setHasilReferensi(hasil);
      setRefTerpilih(null);
      if (!hasil.length) toast('AI nggak kenal produk ini - isi manual aja di bawah');
    } catch (e) {
      tanganiErrorAi(e);
      setHasilReferensi([]);
      setRefTerpilih(null);
    } finally {
      setCariReferensiLoading(false);
    }
  };

  // `hargaPilihan` = angka yang dipilih user dari 3 opsi (murah/normal/untung tebal). Kalau nggak
  // dikasih, balik ke perilaku lama: pakai perkiraan harga pasaran dari AI.
  const pakaiReferensi = (r, hargaPilihan) => {
    setNamaBaru(r.nama);
    setSatuanBaru(r.satuan);
    setIsiKemasanBaru(r.isiKemasan);
    if (r.namaKemasan) setNamaKemasanBaru(r.namaKemasan);
    setHargaBaru(hargaPilihan ?? r.hargaPerkiraan);
    // modal (HPP/harga beli) SENGAJA nggak ikut diisiin - itu tergantung dapetnya dari agen/grosir
    // mana, AI nggak bisa nebak itu, user yang lebih tau harga belinya sendiri. Perkiraan modal
    // dari AI cuma DIPAKAI BUAT NGITUNG 3 opsi harga di atas & ditampilin sebagai ancer-ancer,
    // nggak pernah masuk ke kolom Modal - kalau masuk, angka tebakan itu bakal kebawa ke laporan
    // untung seolah-olah itu harga beli beneran.
    if (!grupBaru.trim()) {
      const saran = grupOtomatis(r.nama, S.produk);
      if (saran) setGrupBaru(saran);
    }
    setHasilReferensi(null);
    setRefTerpilih(null);
    toast('Form keisi dari saran AI - cek lagi & sesuaikan sebelum simpan ya, ini cuma perkiraan');
  };

  const simpanBaru = async () => {
    const nama = namaBaru.trim();
    if (!nama) return toast('Nama barang belum diisi');
    try {
      const baru = await api.produk.tambah({
        nama,
        harga: +hargaBaru || 0,
        modal: +modalBaru || 0,
        stok: +stokBaru || 0,
        barcode: mode === 'barcode' ? barcodeBaru : undefined,
        satuan: satuanBaru.trim() || 'pcs',
        isiKemasan: +isiKemasanBaru || 1,
        namaKemasan: +isiKemasanBaru > 1 ? namaKemasanBaru.trim() || null : null,
        grup: grupBaru.trim() || null,
        fotoUrl: fotoProdukBaru || fotoKatalog || undefined,
        kategori: kategoriKatalog || undefined,
      });
      // Dulu cuma mode foto - foto 3 sisi yang dijepret dari mode barcode kebuang diam-diam.
      if (refFotos.length) {
        await Promise.all(refFotos.map((r) => api.scan.daftarkanReferensi(baru.id, r.sudut, r.embedding, r.foto)));
      }
      toast(`<b>${escapeHtml(nama)}</b> terdaftar sebagai barang baru${refFotos.length ? ` (${refFotos.length} foto buat dikenali)` : ''}`);
      await refreshData();
      onClose();
    } catch (e) {
      toast(e.message ? escapeHtml(e.message) : 'Gagal menyimpan barang baru');
    }
  };

  return (
    <div className="sheet tengah show">
      <div className="panel mid">
        {/* video TETAP dimount pas mode barcode lagi 'memindai' (proses jepret manual) - kalau
            di-unmount lalu step balik ke 'scan', React bikin elemen <video> BARU yang srcObject-nya
            gak pernah di-reattach (efek buka-kamera cuma jalan sekali pas mount awal), hasilnya
            video jadi blank hitam permanen begitu balik ke scan. Video hidden aja kalau lagi
            mindai (bukan di-unmount), stream & loop live-scan-nya tetap utuh. */}
        {(step === 'memuat' || step === 'scan' || step === 'tambah-sudut' || (mode === 'barcode' && step === 'memindai')) && (
          <div className="viewfinder" style={step === 'memindai' ? { visibility: 'hidden', position: 'absolute' } : undefined}>
            <div className="frame" />
            <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}
        {step === 'memindai' && mode === 'barcode' && (
          <div className="viewfinder diam">
            <div className="frame" />
            <div className="isi">{fotoJepretan && <img src={fotoJepretan} alt="" />}</div>
          </div>
        )}
        {/* Mode barcode + barang baru: kotak ini DIHILANGKAN. Isinya cuma ikon kosong segede layar
            (foto barcode-nya nggak pernah disimpen jadi foto barang) - yang penting buat pemilik itu
            kodenya kebaca, dan itu dipajang jelas di form di bawah. */}
        {!(step === 'memuat' || step === 'scan' || step === 'tambah-sudut' || (mode === 'barcode' && step === 'memindai')) &&
          !(mode === 'barcode' && step === 'baru') && (
          <div className="viewfinder diam">
            <div className="frame" />
            <div className="isi">
              {(mode === 'foto' || step === 'barcode-gagal') && fotoJepretan ? (
                <img src={fotoJepretan} alt="" />
              ) : (
                <ProductIcon id={produk ? produk.id : null} foto={produk?.fotoUrl || produk?.foto_url} className="" />
              )}
            </div>
          </div>
        )}

        {step === 'memuat' && (
          <>
            <h3>Menyiapkan kamera…</h3>
            <p>Sebentar ya</p>
          </>
        )}
        {step === 'error' && (
          <>
            <h3>Kamera nggak bisa dibuka</h3>
            <p>{errorMsg}</p>
          </>
        )}
        {step === 'scan' && (
          <>
            <h3>{mode === 'foto' ? 'Arahkan ke barangnya' : 'Memindai barcode…'}</h3>
            <p>{mode === 'foto' ? 'Tahan sebentar biar jelas, terus tap tombol di bawah' : 'Arahkan kamera ke barcode - biasanya kebaca otomatis, tapi kalau lama, tahan anteng lalu tap "Jepret & pindai"'}</p>
            {mode === 'barcode' && (
              <div style={{ textAlign: 'left', marginTop: 16 }}>
                <div className="field">
                  <label>Susah kebaca? (barcode di permukaan melengkung/rusak) Ketik manual</label>
                  <input
                    value={kodeManual}
                    onChange={(e) => setKodeManual(e.target.value)}
                    inputMode="numeric"
                    placeholder="Nomor di bawah garis barcode"
                  />
                </div>
                <button
                  className="btn"
                  style={{ width: '100%' }}
                  disabled={!kodeManual.trim()}
                  onClick={() => handleBarcode(kodeManual.trim())}
                >
                  Cari kode ini
                </button>
              </div>
            )}
          </>
        )}
        {step === 'memindai' && (
          <>
            <h3>Mencocokkan…</h3>
            <p>Sebentar ya</p>
          </>
        )}
        {step === 'barcode-gagal' && (
          <>
            <h3>Belum kebaca</h3>
            <p>Udah dicoba beberapa kali tapi barcode-nya belum kebaca otomatis. Mau coba pakai AI, atau ketik manual aja?</p>
            <button className="btn utama brand" style={{ width: '100%', marginTop: 12 }} onClick={cariBarcodeAi}>
              Coba baca pakai AI
            </button>
            <div style={{ textAlign: 'left', marginTop: 16 }}>
              <div className="field">
                <label>Ketik manual (nomor di bawah garis barcode)</label>
                <input value={kodeManual} onChange={(e) => setKodeManual(e.target.value)} inputMode="numeric" placeholder="Nomor di bawah garis barcode" />
              </div>
              <button className="btn" style={{ width: '100%' }} disabled={!kodeManual.trim()} onClick={() => handleBarcode(kodeManual.trim())}>
                Cari kode ini
              </button>
            </div>
            <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={kembaliScanManual}>
              Foto ulang / scan lagi
            </button>
          </>
        )}
        {step === 'tambah-sudut' && (
          <>
            {/* Nyebut sisi yang dimaksud (depan/miring/dekat) - tiga foto dari sisi yang SAMA nggak nambah
                apa-apa buat pengenalannya, cuma buang jatah. */}
            <h3>
              Foto sisi {LABEL_SUDUT[refFotos.length] || 'lain'} ({refFotos.length + 1}/{MAKS_SUDUT})
            </h3>
            <p>
              {model.keadaan === 'siap'
                ? 'Arahkan kamera ke barangnya dari sisi ini, terus tap Jepret.'
                : model.keadaan === 'gagal'
                  ? 'Pengenal foto gagal dimuat.'
                  : 'Pengenal foto lagi disiapin, sebentar ya...'}
            </p>
            {model.keadaan === 'gagal' && (
              <button type="button" className="btn kecil" style={{ marginTop: 8 }} onClick={model.cobaLagi}>
                Coba muat lagi
              </button>
            )}
          </>
        )}

        {step === 'pilih' && (
          <>
            {/* skor null = kandidat dari cadangan AI (cariPakaiAiVisual), bukan cosine similarity -
                selalu cuma 1 item (Gemini disuruh milih 1 atau bilang nggak ketemu, bukan nge-rangking) */}
            <h3>{kandidat[0]?.skor == null ? 'Disaranin AI' : `${kandidat.length} barang paling mirip`}</h3>
            <p>Tap yang benar, atau daftarkan sebagai barang baru kalau nggak ada yang cocok</p>
            <div>
              {kandidat.map(({ produk: p, skor }) => (
                <button
                  key={p.id}
                  className="hasil"
                  onClick={() => {
                    setProduk(p);
                    setHarga(p.modal);
                    setStep('detected');
                  }}
                >
                  <ProductIcon id={p.id} foto={p.fotoUrl} />
                  <div>
                    <div className="nama">{p.nama}</div>
                    <div className="tgl">
                      {rupiah(p.harga)} · sisa {p.stok}
                    </div>
                  </div>
                  <span className="mirip">{skor == null ? 'AI' : `${Math.round(skor * 100)}%`}</span>
                </button>
              ))}
            </div>
            <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={daftarkanBarangBaru}>
              Bukan barang ini - daftarkan baru
            </button>
          </>
        )}
        {step === 'tidak-ketemu-visual' && (
          <>
            <h3>Nggak nemu yang cocok</h3>
            <p>Barang ini belum kekenal dari foto referensi yang ada. Mau dicoba dicariin pakai AI dulu, atau langsung daftarkan sebagai barang baru?</p>
            <button className="btn utama brand" style={{ width: '100%', marginTop: 12 }} onClick={cariPakaiAiVisual}>
              Coba cariin pakai AI
            </button>
            <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={daftarkanBarangBaru}>
              Ini barang baru, daftarkan
            </button>
          </>
        )}

        {step === 'detected' && produk && (
          <>
            <h3>{produk.nama}</h3>
            <p>Barang ditemukan. Sisa stok {produk.stok}.</p>
            <button className="btn utama brand" style={{ width: '100%', marginTop: 16 }} onClick={() => setStep('tambah')}>
              + Tambahkan barang (stok masuk)
            </button>
            <button
              className="btn"
              style={{ width: '100%', marginTop: 10 }}
              onClick={() => {
                onClose();
                onKelola(produk);
              }}
            >
              Kelola stok saat ini
            </button>
          </>
        )}

        {step === 'tambah' && produk && (
          <div style={{ textAlign: 'left' }}>
            {produk.isiKemasan > 1 && (
              <div className="segkecil" style={{ marginBottom: 4 }}>
                <button className={!inputKemasan ? 'on' : ''} onClick={() => setInputKemasan(false)}>
                  Per {produk.satuan}
                </button>
                <button className={inputKemasan ? 'on' : ''} onClick={() => setInputKemasan(true)}>
                  Per {produk.namaKemasan || 'kemasan'} (isi {produk.isiKemasan})
                </button>
              </div>
            )}
            {inputKemasan && produk.isiKemasan > 1 ? (
              <>
                <div className="field">
                  <label>Jumlah {produk.namaKemasan || 'kemasan'} masuk</label>
                  <input type="number" inputMode="numeric" value={jumlahKemasan} onChange={(e) => setJumlahKemasan(e.target.value)} />
                </div>
                <div className="field">
                  <label>Harga beli per {produk.namaKemasan || 'kemasan'}</label>
                  <input type="number" inputMode="numeric" value={hargaKemasan} onChange={(e) => setHargaKemasan(e.target.value)} />
                </div>
                <div className="ringkas">
                  <span>Setara stok satuan</span>
                  <b>
                    {(+jumlahKemasan || 0) * produk.isiKemasan} {produk.satuan}
                  </b>
                </div>
              </>
            ) : (
              <div className="field">
                <label>Jumlah masuk ({produk.satuan})</label>
                <input type="number" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
              </div>
            )}
            {!inputKemasan && (
              <div className="field">
                <label>Harga beli per {produk.satuan} (HPP baru)</label>
                <input type="number" inputMode="numeric" value={harga} onChange={(e) => setHarga(e.target.value)} />
              </div>
            )}
            <div className="ringkas">
              <span>HPP sekarang</span>
              <b>{rupiah(produk.modal)}</b>
            </div>
            <div className="ringkas">
              <span>HPP setelah masuk (rata-rata)</span>
              <b>
                {inputKemasan && produk.isiKemasan > 1
                  ? rupiah(hppRata(produk, (+jumlahKemasan || 0) * produk.isiKemasan, +hargaKemasan / produk.isiKemasan || produk.modal))
                  : rupiah(hppRata(produk, +qty || 0, +harga || produk.modal))}
              </b>
            </div>
            <button className="btn utama" style={{ width: '100%', marginTop: 16 }} onClick={simpanStokMasuk}>
              Simpan ke stok
            </button>
          </div>
        )}

        {step === 'baru' && (
          <div style={{ textAlign: 'left' }}>
            <h3 style={{ textAlign: 'center' }}>Barang belum terdaftar</h3>
            {mode === 'barcode' ? (
              <>
                <div className="kode-barcode">
                  <span>Kode barcode</span>
                  <b>{barcodeBaru}</b>
                </div>
                {dariKatalog && (
                  <p className="p-sub" style={{ textAlign: 'center', marginTop: 8 }}>
                    Ketemu di katalog: <b style={{ color: 'var(--ink)' }}>{dariKatalog.nama}</b>. Nama{dariKatalog.harga ? ' & harga' : ''} udah keisi, cek dulu ya.
                    {dariKatalog.harga && ` Warung lain jual ${rupiah(dariKatalog.harga.bawah)}–${rupiah(dariKatalog.harga.atas)}.`}
                  </p>
                )}
              </>
            ) : (
              <p style={{ textAlign: 'center' }}>Isi datanya buat didaftarkan</p>
            )}

            {/* Cari referensi (AI) - opsional, biar nggak isi form satu-satu dari nol buat merek
                yang udah umum dikenal (misal rokok - langsung tau isi kemasan & kisaran harga).
                SELALU cuma ngisi form di bawah, nggak pernah nyimpen langsung - tetap wajib dicek. */}
            <div className="field">
              <label>Cari referensi (opsional, dibantu AI)</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={carianReferensi}
                  onChange={(e) => setCarianReferensi(e.target.value)}
                  placeholder="Contoh: Gudang Garam, Indomie Goreng"
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), cariReferensi())}
                />
                <button
                  type="button"
                  className="btn kecil"
                  style={{ flex: 'none' }}
                  disabled={!carianReferensi.trim() || cariReferensiLoading}
                  onClick={cariReferensi}
                >
                  {cariReferensiLoading ? 'Nyari…' : 'Cari'}
                </button>
              </div>
              {/* Langkah 2: barangnya udah dipilih, tinggal MAU DIJUAL BERAPA. Dulu tap hasil
                  langsung ngisi form pakai satu angka tebakan AI - dan itu yang bikin harganya
                  sering kejauhan: satu angka nggak bisa bener buat semua warung sekaligus (di
                  perumahan beda sama di pasar, sebelahan sama Indomaret beda sama yang sendirian
                  di gang). Sekarang patokannya harga PASARAN, terus dikasih 3 pilihan di sekitar
                  situ - pemiliknya yang paling tau warungnya diapit siapa. Untungnya cuma
                  ancer-ancer (modal dari tebakan AI, bukan harga beli asli), makanya ditulis
                  "kira-kira". */}
              {refTerpilih ? (
                <div style={{ marginTop: 10 }} ref={opsiHargaRef}>
                  <p className="p-sub" style={{ marginBottom: 2 }}>
                    <b style={{ color: 'var(--ink)' }}>{refTerpilih.nama}</b> - mau dijual berapa?
                  </p>
                  {refTerpilih.hargaModal > 0 && (
                    <p className="p-sub" style={{ marginBottom: 0, fontSize: 13 }}>
                      Kira-kira kulakannya {rupiah(refTerpilih.hargaModal)}, warung lain jual sekitar{' '}
                      {rupiah(refTerpilih.hargaPasaran)}.
                    </p>
                  )}
                  <div className="opsi-harga">
                    {refTerpilih.opsiHarga.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className={'hasil' + (o.id === 'normal' ? ' utama' : '')}
                        onClick={() => pakaiReferensi(refTerpilih, o.harga)}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div className="nama">{o.label}</div>
                          <div className="tgl">{o.sub}</div>
                        </div>
                        <div className="nominal">
                          <b>{rupiah(o.harga)}</b>
                          {o.untung != null && (
                            <span>
                              untung ~{rupiah(o.untung)}
                              {o.persen != null ? ` (${o.persen}%)` : ''}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="btn kecil"
                    style={{ marginTop: 10 }}
                    onClick={() => setRefTerpilih(null)}
                  >
                    Balik ke daftar
                  </button>
                </div>
              ) : (
                hasilReferensi?.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <p className="p-sub" style={{ marginBottom: 8 }}>
                      Perkiraan AI, bukan harga pasti - tap buat isi form, tetap dicek dulu ya:
                    </p>
                    {hasilReferensi.map((r, i) => (
                      <button
                        key={i}
                        type="button"
                        className="hasil"
                        style={{ marginTop: 6 }}
                        // Kalau opsi harganya nggak kekirim (AI-nya nggak yakin harga pasarannya,
                        // atau marginnya kelewat tipis sampai cuma nyisa 1 pilihan), langsung isi
                        // form pakai perkiraan - jangan nampilin layar "pilih harga" yang isinya
                        // cuma satu tombol.
                        onClick={() => (r.opsiHarga?.length > 1 ? setRefTerpilih(r) : pakaiReferensi(r))}
                      >
                        <div>
                          <div className="nama">{r.nama}</div>
                          <div className="tgl">
                            {rupiah(r.hargaPerkiraan)}/{r.satuan}
                            {r.isiKemasan > 1 ? ` · isi ${r.isiKemasan} ${r.namaKemasan || ''}` : ''}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )
              )}
            </div>

            {/* Foto referensi dari beberapa sisi. Dulu CUMA ada di mode foto - barang yang didaftarin lewat
                barcode nggak punya foto sama sekali, jadi begitu barcode-nya susah kebaca (bungkus
                lecek, basah, kena lipatan) barangnya nggak bisa dikenali lewat scan foto & pemilik
                harus nyari manual. Embedding tiap sisi dihitung langsung dari kamera, sama persis
                kayak yang dipakai scan foto buat nyocokin barang nanti. */}
            {(mode === 'foto' || mode === 'barcode') && (
              <div className="field">
                <label>
                  {mode === 'barcode'
                    ? `Foto dari 3 sisi (opsional, ${refFotos.length}/${MAKS_SUDUT}) - buat jaga-jaga kalau barcode-nya nanti susah kebaca, barangnya tetap bisa dikenali lewat foto`
                    : `Foto referensi (${refFotos.length}/${MAKS_SUDUT}) - makin banyak sudut, makin gampang dikenali nanti`}
                </label>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  {refFotos.map((r, i) => (
                    <img key={i} src={r.foto} alt={r.sudut} title={r.sudut} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 14 }} />
                  ))}
                  {refFotos.length < MAKS_SUDUT && (
                    <button
                      type="button"
                      onClick={() => setStep('tambah-sudut')}
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 14,
                        border: '1.5px dashed var(--garis)',
                        background: 'none',
                        color: 'var(--abu)',
                        fontSize: 22,
                        cursor: 'pointer',
                        flex: 'none',
                      }}
                    >
                      +
                    </button>
                  )}
                </div>
              </div>
            )}
            {mode === 'barcode' && (
              <div className="field">
                <label>Foto barang (opsional)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                  {fotoProdukBaru && (
                    <img src={fotoProdukBaru} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 14 }} />
                  )}
                  <label className="btn kecil" style={{ display: 'inline-block', cursor: 'pointer' }}>
                    {fotoProdukBaru ? 'Ganti foto' : <><CameraIcon /> Ambil foto</>}
                    <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={pilihFotoProduk} />
                  </label>
                </div>
              </div>
            )}
            <div className="field">
              <label>Nama barang</label>
              <input
                value={namaBaru}
                onChange={(e) => {
                  const v = e.target.value;
                  setNamaBaru(v);
                  // Kata pertama nama-nya nyambung ke produk yang UDAH ada & udah punya grup
                  // (misal udah ada "Basreng 100gr") - grup-nya diisiin otomatis, biar nggak perlu
                  // diinget & diketik ulang manual. Cuma kalau field Grup masih kosong - kalau user
                  // udah ngetik sesuatu di situ sendiri, itu nggak ditimpa.
                  if (!grupBaru.trim()) {
                    const saran = grupOtomatis(v, S.produk);
                    if (saran) setGrupBaru(saran);
                  }
                }}
                placeholder="Contoh: Aqua 600ml"
              />
            </div>
            <div className="field" style={{ position: 'relative' }}>
              <label>Grup varian (opsional - CUMA nama merek, TANPA ukuran, misal "Aqua" bukan "Aqua 600ml")</label>
              <input
                value={grupBaru}
                onChange={(e) => setGrupBaru(e.target.value)}
                onFocus={() => setGrupBaruFokus(true)}
                onBlur={() => setTimeout(() => setGrupBaruFokus(false), 150)}
                placeholder='Kosongkan kalau nggak ada variannya - isinya cuma "Aqua", bukan "Aqua 600ml"'
              />
              {/* Dropdown saran custom (BUKAN <datalist> bawaan browser - itu perilakunya nggak
                  konsisten/kadang nggak nongol sama sekali di beberapa browser). setTimeout 150ms
                  di onBlur di atas jaga-jaga: blur keburu nutup dropdown SEBELUM klik di bawah
                  sempet kedaftar sebagai onClick kalau ditutup instan. */}
              {grupBaruFokus && daftarGrupUnik(S.produk).filter((g) => g.toLowerCase().includes(grupBaru.trim().toLowerCase())).length > 0 && (
                <div className="dropdown-saran">
                  {daftarGrupUnik(S.produk)
                    .filter((g) => g.toLowerCase().includes(grupBaru.trim().toLowerCase()))
                    .map((g) => (
                      <button key={g} type="button" onClick={() => setGrupBaru(g)}>
                        {g}
                      </button>
                    ))}
                </div>
              )}
            </div>
            <div className="field">
              <label>Harga jual</label>
              <input type="number" inputMode="numeric" value={hargaBaru} onChange={(e) => setHargaBaru(e.target.value)} />
            </div>
            <div className="field">
              <label>Harga beli (modal)</label>
              <input type="number" inputMode="numeric" value={modalBaru} onChange={(e) => setModalBaru(e.target.value)} />
            </div>
            <div className="field">
              <label>Stok awal (dalam satuan jual)</label>
              <input type="number" inputMode="numeric" value={stokBaru} onChange={(e) => setStokBaru(e.target.value)} />
            </div>
            <div className="field">
              <label>Satuan jual</label>
              <input value={satuanBaru} onChange={(e) => setSatuanBaru(e.target.value)} placeholder="pcs / botol / butir / bungkus" />
            </div>
            <div className="field">
              <label>Isi per kemasan besar (opsional - misal 1 dus isi berapa pcs)</label>
              <input type="number" inputMode="numeric" min="1" value={isiKemasanBaru} onChange={(e) => setIsiKemasanBaru(e.target.value)} />
            </div>
            {+isiKemasanBaru > 1 && (
              <div className="field">
                <label>Nama kemasan besarnya</label>
                <input value={namaKemasanBaru} onChange={(e) => setNamaKemasanBaru(e.target.value)} placeholder="dus / pack / karton" />
              </div>
            )}
            <button className="btn utama" style={{ width: '100%', marginTop: 16 }} onClick={simpanBaru}>
              Simpan barang baru
            </button>
          </div>
        )}

        {step === 'scan' && mode === 'foto' && (
          <>
            {model.keadaan !== 'siap' && (
              <p style={{ textAlign: 'center', fontSize: 13, marginTop: 12 }}>
                {model.keadaan === 'gagal' ? (
                  <>
                    Pengenal foto barang gagal dimuat.{' '}
                    <button type="button" className="btn kecil" style={{ marginTop: 8 }} onClick={model.cobaLagi}>
                      Coba muat lagi
                    </button>
                  </>
                ) : (
                  'Pengenal foto barang lagi disiapin, sebentar ya...'
                )}
              </p>
            )}
            <button
              className="btn utama brand"
              style={{ width: '100%', marginTop: 16 }}
              onClick={jepretFoto}
              disabled={model.keadaan !== 'siap'}
            >
              <CameraIcon /> Jepret &amp; cocokkan
            </button>
          </>
        )}
        {step === 'scan' && mode === 'barcode' && (
          <button className="btn utama brand" style={{ width: '100%', marginTop: 16 }} onClick={ambilFotoBarcode}>
            <CameraIcon /> Jepret &amp; pindai
          </button>
        )}
        {step === 'tambah-sudut' && (
          <>
            <button
              className="btn utama brand"
              style={{ width: '100%', marginTop: 16 }}
              onClick={jepretSudutBaru}
              disabled={model.keadaan !== 'siap' || jepretSisi}
            >
              <CameraIcon /> {jepretSisi ? 'Memproses...' : 'Jepret sudut ini'}
            </button>
            {/* Balik ke form TANPA nutup sheet - tombol Tutup di bawah ngebuang semua isian form. */}
            <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={() => setStep('baru')} disabled={jepretSisi}>
              Balik ke form
            </button>
          </>
        )}

        <button className="btn" style={{ width: '100%', marginTop: 12 }} onClick={onClose}>
          Tutup
        </button>
      </div>
    </div>
  );
}

// Revisi v5 — kasih rekomendasi harga jual sehat (berdasarkan target margin) dan feedback
// langsung (margin & selisih stok) begitu diketik, bukan cuma tabel statis kayak sebelumnya.
function SheetOpname({ produk, onClose }) {
  const { S, dispatch, toast } = useApp();
  const [fisik, setFisik] = useState(produk.stok);
  const [harga, setHarga] = useState(produk.harga);
  const [satuan, setSatuan] = useState(produk.satuan);
  const [isiKemasan, setIsiKemasan] = useState(produk.isiKemasan);
  const [namaKemasan, setNamaKemasan] = useState(produk.namaKemasan || '');
  const [grup, setGrup] = useState(produk.grup || '');
  const [grupFokus, setGrupFokus] = useState(false); // dropdown saran grup lagi kebuka apa nggak
  // fotoSendiri, bukan foto: `foto` bisa foto pinjaman dari varian lain segrup (lihat pakaiFotoGrup di AppContext).
  const [foto, setFoto] = useState(produk.fotoSendiri || null);
  // Dulu nama/kategori/barcode nggak bisa diubah dari mana pun di UI (padahal backend PUT
  // /api/produk/:id udah support) - jadi kalau salah ketik nama pas nambah, atau barcode kebaca
  // salah pas scan, beneran nggak ada jalan buat benerin. Ditambahin di sini (bukan layar
  // terpisah) - screen ini emang udah jadi tempat "edit barang" walau namanya "Opname stok".
  const [nama, setNama] = useState(produk.nama);
  const [kategori, setKategori] = useState(produk.kat || '');
  const [barcode, setBarcode] = useState(produk.barcode || '');
  const [confirmHapus, setConfirmHapus] = useState(false); // popup "hapus barang ini?"
  const [hapusLoading, setHapusLoading] = useState(false);
  const [refHapus, setRefHapus] = useState(null); // foto scan yang mau dihapus (nunggu konfirmasi popup)
  // Bagian yang jarang diubah dilipat biar layar utamanya cuma stok & harga (yang dikerjain tiap opname).
  const [bukaDetail, setBukaDetail] = useState(false);
  const [bukaFoto, setBukaFoto] = useState(false);
  const [ikon, setIkon] = useState(produk.ikon || ''); // '' = otomatis (ditebak dari nama)

  // Foto referensi visual (buat scan AI kenalin barang ini) - BEDA sama `foto` (foto tampilan) di
  // atas. Dulu foto referensi CUMA bisa didaftarin pas alur "tambah barang baru" - barang yang udah
  // ada (kayak diketik manual) nggak punya jalan buat ditambahin belakangan, jadi SELAMANYA nggak
  // akan ke-detect di scan visual non-AI walau namanya udah bener. Ditambahin di sini biar bisa
  // dilengkapin kapan aja.
  const [refList, setRefList] = useState([]);
  const [refLoading, setRefLoading] = useState(true);
  const [refUploading, setRefUploading] = useState(false);

  useEffect(() => {
    let batal = false;
    (async () => {
      try {
        const rows = await api.scan.listReferensi(produk.id);
        if (!batal) setRefList(rows);
      } catch {
        /* diemin - biarin kosong, jangan sampe ngeblokir layar edit gara-gara ini doang */
      } finally {
        if (!batal) setRefLoading(false);
      }
    })();
    return () => {
      batal = true;
    };
  }, [produk.id]);

  const tambahReferensi = async (e) => {
    const f = e.target.files[0];
    e.target.value = ''; // reset biar file yang sama bisa dipilih lagi kalau perlu
    if (!f) return;
    setRefUploading(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(new Error('Gagal baca file foto'));
        r.readAsDataURL(f);
      });
      const kecil = await keWebp(dataUrl, 800);
      // Model visual butuh <img>/<video>/<canvas>, bukan data URL mentah - dimuat dulu ke elemen
      // <img> di memori (nggak ditempel ke DOM) baru dihitung embedding-nya.
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('Gagal memuat foto'));
        img.src = kecil;
      });
      const embedding = await ambilEmbedding(img); // otomatis muat model AI dulu kalau belum
      const sudutBaru = `sudut-${refList.length + 1}`;
      const saved = await api.scan.daftarkanReferensi(produk.id, sudutBaru, embedding, kecil);
      setRefList((l) => [...l, saved]);
      toast('Foto referensi ditambahin - makin banyak sudut, makin gampang dikenali pas scan');
    } catch (err) {
      toast(err.message ? escapeHtml(err.message) : 'Gagal nambahin foto referensi');
    } finally {
      setRefUploading(false);
    }
  };

  const hapusReferensiSatu = async (refId) => {
    try {
      await api.scan.hapusReferensi(refId);
      setRefList((l) => l.filter((r) => r.id !== refId));
    } catch (err) {
      toast(err.message ? escapeHtml(err.message) : 'Gagal hapus foto referensi');
    }
  };

  // SOFT delete (backend cuma nyembunyiin - set aktif=false, lihat dispatch HAPUS_PRODUK & komentar
  // di schema.sql) - barang ilang dari Stok/Catat Penjualan/scan/Mang AI, tapi histori transaksi
  // lama yang udah kejadian TETAP kesimpen apa adanya (nggak ada tombol "kembaliin" - sengaja belum
  // ada, kalau ternyata kepake nanti bisa ditambahin).
  const hapusBarang = async () => {
    setHapusLoading(true);
    // dispatch() nggak pernah throw ke sini (error ditangani INTERNAL via toast sendiri, termasuk
    // guard "perlu online" kalau offline) - balikin undefined berarti GAGAL/diblokir, `true` berarti
    // berhasil (lihat case HAPUS_PRODUK). Jangan nampilin toast sukses & nutup sheet kalau gagal.
    const berhasil = await dispatch({ type: 'HAPUS_PRODUK', produkId: produk.id });
    setHapusLoading(false);
    if (!berhasil) return;
    toast(`<b>${escapeHtml(produk.nama)}</b> dihapus dari katalog`);
    onClose();
  };

  const pilihFoto = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = async () => {
      try {
        setFoto(await keWebp(r.result));
      } catch {
        /* biarin foto lama kalau gagal diproses */
      }
    };
    r.readAsDataURL(f);
  };

  const margin = produk.harga - produk.modal;
  const pct = produk.harga ? Math.round((margin / produk.harga) * 100) : 0;
  const habis = produk.laku ? Math.max(0, Math.round(produk.stok / produk.laku)) : null;
  const terjual = S.terjual[produk.id] || 0;

  const hargaNum = parseInt(harga, 10) || 0;
  const untungBaru = hargaNum - produk.modal;
  const pctBaru = hargaNum ? Math.round((untungBaru / hargaNum) * 100) : 0;
  let nada = 'Margin tipis, coba naikkan sedikit.';
  if (pctBaru >= 25 && pctBaru < 45) nada = 'Margin sehat untuk warung.';
  else if (pctBaru >= 45) nada = 'Margin tinggi - pastikan tidak kemahalan dari warung sebelah.';
  const margeHtml = hargaNum ? `Untung <b>${rupiah(untungBaru)}</b> per buah (<b>${pctBaru}%</b>). ${nada}` : 'Isi harga jualnya.';

  const fisikNum = parseInt(fisik, 10);
  const selisih = isNaN(fisikNum) ? null : fisikNum - produk.stok;
  const selisihHtml =
    selisih === null
      ? 'Isi jumlah nyata di rak kalau mau dicocokkan.'
      : selisih === 0
        ? 'Cocok dengan catatan ✓'
        : `Selisih <b>${selisih > 0 ? '+' : ''}${selisih} buah</b> dari catatan (${produk.stok} buah) - nilai ${rupiah(Math.abs(selisih) * produk.modal)}.`;

  const reko = MARGIN_REKOMENDASI.map((m) => ({ m, h: hargaDariMargin(produk.modal, m) }));

  const simpan = () => {
    const f = parseInt(fisik, 10);
    dispatch({ type: 'SIMPAN_OPNAME', produkId: produk.id, fisik: isNaN(f) ? null : f, harga: hargaNum || produk.harga });

    const isi = +isiKemasan || 1;
    const berubah =
      nama.trim() !== produk.nama ||
      kategori.trim() !== (produk.kat || '') ||
      barcode.trim() !== (produk.barcode || '') ||
      satuan.trim() !== produk.satuan ||
      isi !== produk.isiKemasan ||
      namaKemasan.trim() !== (produk.namaKemasan || '') ||
      grup.trim() !== (produk.grup || '') ||
      foto !== (produk.fotoSendiri || null) ||
      ikon !== (produk.ikon || '');
    if (berubah) {
      if (!nama.trim()) {
        return toast('Nama barang nggak boleh kosong');
      }
      dispatch({
        type: 'UBAH_PRODUK',
        produkId: produk.id,
        data: {
          nama: nama.trim(),
          kategori: kategori.trim() || 'sembako',
          // backend-nya pola COALESCE(param, kolom) - kirim null berarti "jangan diubah", BUKAN
          // "kosongkan". Kirim string kosong (bukan null) di sini kalau user beneran ngosongin
          // field-nya, biar beneran kehapus (sama pola kayak grup/namaKemasan di bawah).
          barcode: barcode.trim(),
          satuan: satuan.trim() || 'pcs',
          isiKemasan: isi,
          namaKemasan: isi > 1 ? namaKemasan.trim() : '',
          grup: grup.trim(),
          fotoUrl: foto || undefined,
          ikon,
        },
      });
    }
    onClose();
  };

  // Angka-angka ringkasan dijadiin DAFTAR (label kiri, angka kanan) di satu kartu - dulu 7 kotak terpisah
  // (termasuk harga jual & stok yang juga muncul lagi di kolom isian di bawahnya), jadi layarnya penuh kotak.
  const ringkasan = [
    ['Modal (HPP)', rupiah(produk.modal)],
    ['Untung per buah', `${rupiah(margin)} · ${pct}%`],
    ['Nilai stok (modal)', rupiah(produk.stok * produk.modal)],
    ['Potensi omzet', rupiah(produk.stok * produk.harga)],
    ['Perkiraan habis', habis === null ? 'belum ada data laku' : `± ${habis} hari`],
  ];
  const ringkasDetail = [
    kategori.trim() || 'sembako',
    satuan.trim() || 'pcs',
    +isiKemasan > 1 ? `1 ${namaKemasan.trim() || 'kemasan'} = ${isiKemasan}` : null,
    barcode.trim() ? 'ada barcode' : 'tanpa barcode',
    grup.trim() ? `grup ${grup.trim()}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const tebakan = tebakIkon(nama, kategori);
  const ringkasFoto = refLoading
    ? '…'
    : `${foto ? 'ada foto' : `ikon ${IKON_PRODUK[ikon || tebakan].label.toLowerCase()}`} · ${refList.length} foto scan`;
  const saranGrup = daftarGrupUnik(S.produk).filter((g) => g.toLowerCase().includes(grup.trim().toLowerCase()));

  return (
    <>
    <div className="sheet show">
      <div className="panel ed">
        <div className="ed-kepala">
          <ProductIcon id={produk.id} foto={foto || produk.foto} ikon={ikon} />
          <div style={{ minWidth: 0 }}>
            <h3>{produk.nama}</h3>
            <div className="ed-sub">
              {produk.kat} · terjual total {terjual}
              {produk.isiKemasan > 1 && ` · 1 ${produk.namaKemasan || 'kemasan'} = ${produk.isiKemasan} ${produk.satuan}`}
            </div>
          </div>
        </div>

        <div className="ed-kartu">
          {ringkasan.map(([k, v]) => (
            <div className="ed-baris" key={k}>
              <span>{k}</span>
              <b>{v}</b>
            </div>
          ))}
        </div>

        <div className="ed-kartu">
          <div className="field">
            <label>
              Stok di rak (opname) · tercatat {produk.stok} {produk.satuan}
            </label>
            <input type="number" inputMode="numeric" value={fisik} onChange={(e) => setFisik(e.target.value)} placeholder="jumlah nyata di rak" />
          </div>
          <div className="ed-hint" dangerouslySetInnerHTML={{ __html: selisihHtml }} />
        </div>

        <div className="ed-kartu">
          <div className="field">
            <label>Harga jual</label>
            <input type="number" inputMode="numeric" value={harga} onChange={(e) => setHarga(e.target.value)} />
          </div>
          <div className="ed-hint" dangerouslySetInnerHTML={{ __html: margeHtml }} />
          <div className="ed-label">Rekomendasi harga sehat</div>
          <div className="reko">
            {reko.map((r) => (
              <button key={r.m} type="button" className={hargaNum === r.h ? 'pas' : ''} onClick={() => setHarga(String(r.h))}>
                <div className="pct">Margin {r.m}%</div>
                <div className="hrg">{rupiah(r.h)}</div>
              </button>
            ))}
          </div>
        </div>

        <button type="button" className={'ed-lipat' + (bukaDetail ? ' buka' : '')} onClick={() => setBukaDetail((b) => !b)}>
          <span>
            <b>Detail barang</b>
            <small>{ringkasDetail}</small>
          </span>
          <i>›</i>
        </button>
        {bukaDetail && (
          <div className="ed-kartu">
            <div className="field">
              <label>Nama barang</label>
              <input value={nama} onChange={(e) => setNama(e.target.value)} />
            </div>
            <div className="ed-dua">
              <div className="field">
                <label>Kategori</label>
                <input value={kategori} onChange={(e) => setKategori(e.target.value)} placeholder="sembako / minuman" />
              </div>
              <div className="field">
                <label>Satuan jual</label>
                <input value={satuan} onChange={(e) => setSatuan(e.target.value)} placeholder="pcs / botol / bungkus" />
              </div>
            </div>
            <div className="field">
              <label>Barcode (opsional)</label>
              <input value={barcode} onChange={(e) => setBarcode(e.target.value)} inputMode="numeric" placeholder="Kosongkan kalau nggak ada" />
            </div>
            <div className="ed-dua">
              <div className="field">
                <label>Isi per kemasan besar</label>
                <input type="number" inputMode="numeric" min="1" value={isiKemasan} onChange={(e) => setIsiKemasan(e.target.value)} />
              </div>
              {+isiKemasan > 1 && (
                <div className="field">
                  <label>Nama kemasannya</label>
                  <input value={namaKemasan} onChange={(e) => setNamaKemasan(e.target.value)} placeholder="dus / pack / karton" />
                </div>
              )}
            </div>
            <div className="ed-hint">Misal 1 dus isi berapa {produk.satuan}. Biarin 1 kalau nggak dijual per kemasan.</div>
            <div className="field" style={{ position: 'relative' }}>
              <label>Grup varian (opsional)</label>
              <input
                value={grup}
                onChange={(e) => setGrup(e.target.value)}
                onFocus={() => setGrupFokus(true)}
                onBlur={() => setTimeout(() => setGrupFokus(false), 150)}
                placeholder="Kosongkan kalau nggak ada variannya"
              />
              {/* Dropdown saran custom - lihat komentar lengkap di field Grup form "tambah barang baru" */}
              {grupFokus && saranGrup.length > 0 && (
                <div className="dropdown-saran">
                  {saranGrup.map((g) => (
                    <button key={g} type="button" onClick={() => setGrup(g)}>
                      {g}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="ed-hint">Cuma nama merek, TANPA ukuran - misal "Aqua", bukan "Aqua 600ml".</div>
          </div>
        )}

        <button type="button" className={'ed-lipat' + (bukaFoto ? ' buka' : '')} onClick={() => setBukaFoto((b) => !b)}>
          <span>
            <b>Foto &amp; ikon</b>
            <small className={!refLoading && refList.length === 0 ? 'merah' : ''}>{ringkasFoto}</small>
          </span>
          <i>›</i>
        </button>
        {bukaFoto && (
          <div className="ed-kartu">
            <div className="ed-label" style={{ marginTop: 0 }}>
              Ikon barang
            </div>
            <div className="ed-hint" style={{ marginTop: 0 }}>
              Tampil kalau barang ini nggak punya foto{foto ? ' (sekarang fotonya yang tampil)' : ''}. "Otomatis" = ditebak dari namanya.
            </div>
            <PilihIkon nilai={ikon} tebakan={tebakan} onPilih={setIkon} />

            <div className="ed-label" style={{ marginTop: 18 }}>
              Foto tampilan (opsional)
            </div>
            <div className="ed-foto">
              {foto && <img src={foto} alt="" />}
              <label className="btn kecil">
                {foto ? 'Ganti foto' : <><CameraIcon /> Ambil foto</>}
                <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={pilihFoto} />
              </label>
            </div>

            <div className="ed-label">Foto buat scan barang ({refLoading ? '…' : refList.length})</div>
            <div className="ed-hint" style={{ marginTop: 0 }}>
              Beda dari foto tampilan - dipakai scan kamera buat ngenalin barang ini. Makin banyak sudut, makin gampang dikenali.
            </div>
            {!refLoading && refList.length === 0 && (
              <div className="ed-hint merah">
                Belum ada - barang ini nggak akan ke-detect di scan barang (non-AI) sampai ditambahin minimal 1 foto.
              </div>
            )}
            <div className="ed-foto">
              {refList.map((r) => (
                <div key={r.id} className="ed-foto-ref">
                  <img src={r.foto_url} alt={r.sudut || ''} title={r.sudut || ''} />
                  <button type="button" onClick={() => setRefHapus(r)} title="Hapus foto referensi ini">
                    ×
                  </button>
                </div>
              ))}
              <label className="btn kecil" style={{ cursor: refUploading ? 'default' : 'pointer' }}>
                {refUploading ? 'Memproses…' : (<><CameraIcon /> Tambah foto</>)}
                <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} disabled={refUploading} onChange={tambahReferensi} />
              </label>
            </div>
          </div>
        )}

        <button type="button" className="ed-hapus" onClick={() => setConfirmHapus(true)}>
          Hapus barang ini
        </button>

        {/* Nempel di bawah panel - form ini panjang, dulu tombol Simpan cuma ketemu kalau scroll sampai mentok. */}
        <div className="ed-aksi">
          <button className="btn" onClick={onClose}>
            Tutup
          </button>
          <button className="btn utama" onClick={simpan}>
            Simpan
          </button>
        </div>
      </div>
    </div>

    {confirmHapus && (
      <KonfirmasiHapus
        judul={`Hapus "${produk.nama}"?`}
        pesan="Ilang dari Stok, Catat Penjualan, scan, & Mang AI - tapi histori transaksi lama yang udah kejadian tetap kesimpen, nggak ikut kehapus."
        sibuk={hapusLoading}
        onYa={hapusBarang}
        onBatal={() => setConfirmHapus(false)}
      />
    )}
    {refHapus && (
      <KonfirmasiHapus
        judul="Hapus foto scan ini?"
        pesan="Barang ini jadi lebih susah dikenali pas scan kamera. Bisa ditambah lagi kapan aja."
        onYa={() => {
          const r = refHapus;
          setRefHapus(null);
          hapusReferensiSatu(r.id);
        }}
        onBatal={() => setRefHapus(null)}
      />
    )}
    </>
  );
}

// Kunci buat buka detail modal & untung. Satu PIN per AKUN warung, dicek ke server - dulu PIN disimpan lokal di
// tiap HP, jadi akun yang sama bisa punya PIN beda di tiap HP. Ini pagar dari orang yang kebetulan megang HP
// warung, bukan pengaman data.
//
// Mode: memuat (nanya server udah ada PIN belum) | masuk | buat | offline (nggak ada internet, dicek pakai hash
// PIN terakhir yang benar di HP ini) | gagal (nggak ada internet & HP ini belum pernah buka pakai PIN).
function SheetPin({ onClose, onSukses }) {
  const { S, dispatch, toast, goTo, authWarung } = useApp();
  const warungId = authWarung?.id;
  const [mode, setMode] = useState('memuat');
  const [buf, setBuf] = useState('');
  const [pertama, setPertama] = useState(null); // mode bikin: PIN ketikan pertama, nunggu diulang
  const [sibuk, setSibuk] = useState(false);

  const simpanCache = async (pin) => dispatch({ type: 'SET_PIN', pinHash: await hashPinLokal(warungId, pin) });

  useEffect(() => {
    let batal = false;
    (async () => {
      try {
        let { dibuat, demo } = await api.pin.status();
        // Jaga-jaga (HP yang belum tau akunnya demo): akun demo nggak pakai PIN, langsung kebuka.
        if (demo) {
          if (!batal) onSukses();
          return;
        }
        // Pindahan dari versi lama: HP ini punya PIN lokal & akunnya belum punya PIN di server -> PIN lokal itu
        // yang jadi PIN akun (pemilik nggak perlu bikin ulang). Kalau HP lain udah duluan (409), pakai punya server.
        if (!dibuat && S.pinDibuat && S.pin && !PIN_GAMPANG.has(S.pin)) {
          try {
            await api.pin.buat(S.pin);
            await simpanCache(S.pin);
            dibuat = true;
          } catch (e) {
            if (e.status === 409) dibuat = true;
          }
        }
        if (!batal) setMode(dibuat ? 'masuk' : 'buat');
      } catch {
        if (!batal) setMode(S.pinHash ? 'offline' : 'gagal');
      }
    })();
    return () => {
      batal = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cekOffline = async (pin) => {
    if (S.pinHash && (await hashPinLokal(warungId, pin)) === S.pinHash) return onSukses();
    toast(S.pinHash ? 'PIN salah, coba lagi' : 'Nggak bisa ngecek PIN - periksa internet');
    setBuf('');
  };

  const cek = async (pin) => {
    if (mode === 'offline') return cekOffline(pin);
    if (mode === 'masuk') {
      setSibuk(true);
      try {
        await api.pin.cek(pin);
        await simpanCache(pin);
        return onSukses();
      } catch (e) {
        if (errorJaringan(e)) return cekOffline(pin); // koneksi putus pas ngecek -> cadangan offline
        toast(escapeHtml(e.message));
        return setBuf('');
      } finally {
        setSibuk(false);
      }
    }
    // mode buat
    if (pertama === null) {
      // 1234 dulu PIN bawaan SEMUA akun & kepajang di layar - siapa pun yang pernah liat bakal
      // nyoba itu duluan.
      if (PIN_GAMPANG.has(pin)) {
        toast('PIN itu gampang ditebak - pilih kombinasi lain ya');
        return setBuf('');
      }
      setPertama(pin);
      return setBuf('');
    }
    if (pin !== pertama) {
      toast('PIN-nya beda - ulangi dari awal ya');
      setPertama(null);
      return setBuf('');
    }
    setSibuk(true);
    try {
      await api.pin.buat(pin);
      await simpanCache(pin);
      toast('PIN pemilik udah dibuat - berlaku di semua HP akun ini');
      onSukses();
    } catch (e) {
      setPertama(null);
      setBuf('');
      // HP lain barusan bikin PIN duluan -> PIN itu yang berlaku.
      if (e.status === 409) setMode('masuk');
      toast(escapeHtml(e.message || 'Gagal nyimpen PIN'));
    } finally {
      setSibuk(false);
    }
  };

  const tekan = (t) => {
    if (!bisaKetik) return;
    if (t === '\u232b') return setBuf((b) => b.slice(0, -1));
    if (!t || buf.length >= 4) return;
    const next = buf + t;
    setBuf(next);
    if (next.length === 4) setTimeout(() => cek(next), 160);
  };

  const judul = {
    memuat: 'PIN pemilik',
    masuk: 'Masukkan PIN',
    offline: 'Masukkan PIN',
    buat: pertama === null ? 'Bikin PIN pemilik' : 'Ulangi PIN',
    gagal: 'Nggak bisa ngecek PIN',
  }[mode];
  const keterangan = {
    memuat: 'Sebentar…',
    masuk: 'Detail modal & untung hanya untuk pemilik.',
    offline: 'Detail modal & untung hanya untuk pemilik. Lagi offline - dicek pakai PIN terakhir yang dibuka di HP ini.',
    buat:
      pertama === null
        ? 'PIN 4 angka ini ngunci detail modal & untung di semua HP yang login pakai akun ini. Jangan dikasih tau ke penjaga ya.'
        : 'Ketik sekali lagi PIN yang sama.',
    gagal: 'Butuh internet buat ngecek PIN pemilik. Coba lagi pas sinyal ada.',
  }[mode];
  const bisaKetik = (mode === 'masuk' || mode === 'offline' || mode === 'buat') && !sibuk;

  return (
    <div className="sheet tengah show">
      <div className="panel mid">
        <h3>{judul}</h3>
        <p>{keterangan}</p>
        <div className="pinbox">
          {[0, 1, 2, 3].map((i) => (
            <i key={i} className={i < buf.length ? 'on' : ''} />
          ))}
        </div>
        <div className="keypad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '\u232b'].map((t, i) => (
            <button key={i} style={!t ? { visibility: 'hidden' } : undefined} onClick={() => tekan(t)}>
              {t}
            </button>
          ))}
        </div>
        {(mode === 'masuk' || mode === 'offline') && (
          <button
            className="btn kecil"
            style={{ width: '100%', marginTop: 14 }}
            onClick={() => {
              onClose();
              goTo('s-lainnya');
              toast('Lupa PIN? Pakai menu <b>Ganti PIN</b> - kodenya dikirim ke WhatsApp');
            }}
          >
            Lupa PIN?
          </button>
        )}
        <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={onClose}>
          Batal
        </button>
      </div>
    </div>
  );
}
