import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { ProductIcon, CameraIcon, Ikon } from '../lib/icons.jsx';
import { parseUcapan, bisaDijual, belumDiatur } from '../lib/voice';
import { perangkatIOS } from '../lib/mic';
import { mulaiRekam, rekamanDidukung } from '../lib/rekam';
import { terpasangSebagaiApp } from '../lib/pwa';
import { rupiah, inisial, escapeHtml } from '../lib/format';
import { api } from '../lib/api';
import { bukaKamera, tutupKamera, jepretFrame, keWebp } from '../lib/kamera';
import { ambilEmbedding } from '../lib/visualScan';
import { useModelVisual } from '../lib/useModelVisual';
import { mulaiScanBarcode } from '../lib/barcodeScan';
import { ambilDeskriptorWajah, gambarDariDataUrl, panaskanModelWajah } from '../lib/wajah';
import { perbaruiWajahLama, perluPerbaruiWajah } from '../lib/wajahLama';
import { buatPengumpulSampel, layakDitampilkan } from '../lib/sampelWajah';
import SheetStruk from '../components/SheetStruk.jsx';
import { tungguReferensiKatalog } from '../lib/referensiKatalog';

// Instance SpeechRecognition yang lagi AKTIF saat ini, kalau ada — sengaja modul-level (di luar
// komponen React), bukan state/ref biasa, biar tetap "keinget" lintas mount/unmount SheetVoice.
// Ini buat nyegah race pas tombol "Sebut barang" di-klik cepet berulang ("spam"): kalau sesi
// SpeechRecognition sebelumnya belum SEMPET dilepas beneran (teardown-nya async, nggak instan)
// pas yang baru langsung dicoba di-start(), browser (terutama Android Chrome) bisa nolak dengan
// error "recognition already started" — dan tanpa penanganan, error itu ke-swallow diem-diem,
// bikin sheet kebuka tapi speech-nya nggak pernah beneran jalan.
let recAktifSaatIni = null;

// Matiin sesi SpeechRecognition SETEGAS mungkin — dipanggil di SEMUA titik "user/sistem beneran
// udah selesai" (Batal, Masukkan ke keranjang, pilih varian, timeout, error). .stop() dipanggil
// DULUAN (minta berhenti secara "baik-baik", ngasih browser kesempatan beresin sesi audio-nya
// sendiri) baru .abort() (paksa putus) - beberapa laporan Android Chrome nunjukkin .abort() doang
// kadang nggak langsung ngelepas indikator mic/mic-nya sendiri (delay/nyangkut), dua-duanya
// dipanggil bareng buat jaga-jaga. Diulang lagi 300ms kemudian (retry) — di Safari/WebKit iOS ada
// laporan abort() pertama kadang gak nempel kalau dipanggil pas sesi audio internalnya masih
// "baru banget" kesetup, panggilan kedua ini jaring pengaman ekstra buat kasus itu.
function matikanMic(target) {
  // Penanda mode (string 'tidak-didukung' / 'rekam') bukan sesi beneran - nggak ada yang perlu
  // dimatiin, dan manggil .stop() di string bakal ngelempar.
  if (!target || typeof target === 'string') return;
  const coba = () => {
    try {
      target.stop();
    } catch {
      /* abaikan */
    }
    try {
      target.abort();
    } catch {
      /* abaikan */
    }
  };
  coba();
  setTimeout(coba, 300);
  if (recAktifSaatIni === target) recAktifSaatIni = null;
}

// Kelompokkan hasil (barang) yang punya grup varian (misal "Aqua" — beberapa ukuran) jadi 1 baris,
// biar user pilih grup-nya dulu baru pilih variannya - sama pola "{grup} yang mana?" yang udah
// dipakai Sebut Barang (suara), dipakai juga di Cari Manual & hasil Scan Foto biar konsisten (dulu
// tiap varian numpuk jadi baris terpisah tanpa pengelompokan, gampang keliru mirip-mirip). Grup yang
// kebetulan cuma ketemu 1 item DIRATAIN jadi baris biasa (nggak perlu nge-tap 2x buat 1 pilihan).
function kelompokkanBuatPilih(items, ambilGrup) {
  const baris = [];
  const map = new Map(); // grup (lowercase) -> baris tipe 'grup'
  for (const item of items) {
    const g = ambilGrup(item)?.trim();
    const key = g?.toLowerCase();
    if (key) {
      if (!map.has(key)) {
        const row = { tipe: 'grup', grup: g, items: [] };
        map.set(key, row);
        baris.push(row);
      }
      map.get(key).items.push(item);
    } else {
      baris.push({ tipe: 'satu', item });
    }
  }
  return baris.map((row) => (row.tipe === 'grup' && row.items.length === 1 ? { tipe: 'satu', item: row.items[0] } : row));
}

export default function Catat() {
  const { S, cart, tambah, kurang, totalCart, pelangganTerpilih, setPelangganTerpilih, dispatch, openLunas, openOk, kosongkanCart, setPelangganFormOpen, toast, targetSetoran, setTargetSetoran } =
    useApp();

  // Target setoran harian (lihat blok "total" di bawah) - datang dari context, bukan state lokal,
  // karena bisa dipasang dari DUA arah: tombol "pasang target" di layar ini, ATAU lewat chat Mang
  // AI ("catat penjualan hari ini 900rb"). Nilainya sementara, nggak disimpen ke server.
  const target = targetSetoran;
  // Yang dibandingin sama target itu PENJUALAN HARI INI, bukan isi keranjang yang lagi disusun.
  // Dulu cuma totalCart - jadi tiap selesai checkout keranjangnya dikosongin & progress-nya balik
  // ke Rp 0, seolah jualan hari itu belum ada apa-apa. Salah arah: target ini target HARIAN.
  //
  // Keranjang yang lagi jalan ikut DITAMBAHIN biar progress-nya gerak real-time selagi barang
  // disebut, bukan baru meloncat setelah tap Bayar.
  const terkumpul = S.omzetHariIni + totalCart;
  const setTarget = setTargetSetoran;
  const [targetOpen, setTargetOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceRec, setVoiceRec] = useState(null); // instance SpeechRecognition yang udah di-start(), atau 'tidak-didukung'
  const [visualOpen, setVisualOpen] = useState(false);
  const [cariOpen, setCariOpen] = useState(false); // pencarian manual - fallback kalau suara/kamera/AI-nya semua nggak bisa dipakai
  const [wajahOpen, setWajahOpen] = useState(false);
  const [siapaOpen, setSiapaOpen] = useState(false);
  const [strukData, setStrukData] = useState(null);
  const [flashId, setFlashId] = useState(null);
  const [idSeringPagi, setIdSeringPagi] = useState(null); // null = belum kemuat; [] = kemuat tapi kosong (belum ada histori jam pagi)

  const produkById = Object.fromEntries(S.produk.map((p) => [p.id, p]));
  const cartIds = Object.keys(cart);

  // Dulu chip "Sering dibeli pagi" cuma comot S.produk.slice(0,6) - 6 produk pertama urut ABJAD,
  // BUKAN beneran dihitung dari histori transaksi. Sekarang dihitung asli di backend (jam 05:00-
  // 11:00, 30 hari terakhir - lihat /api/produk/sering-pagi). Warung yang belum punya histori
  // transaksi pagi (baru mulai pakai app, atau emang nggak pernah ada penjualan pagi) balikin array
  // kosong - fallback ke perilaku lama (produk pertama di daftar) di bawah, biar chip-nya tetap ada
  // isinya buat dicoba, bukan kosong melompong pas pertama kali pakai.
  useEffect(() => {
    let batal = false;
    api.produk
      .seringPagi()
      .then((ids) => {
        if (!batal) setIdSeringPagi(ids);
      })
      .catch(() => {
        if (!batal) setIdSeringPagi([]); // gagal muat - anggap kosong, jangan biarin chip nyangkut nunggu selamanya
      });
    return () => {
      batal = true;
    };
  }, []);

  // Barang yang belum bisa dijual (harga/HPP belum diatur) nggak ditawarin di chip cepat.
  const produkSeringPagi = ((idSeringPagi?.length ? idSeringPagi.map((id) => produkById[id]).filter(Boolean) : null) || S.produk.slice(0, 12)).filter(bisaDijual).slice(0, 6);

  const chipTap = (id) => {
    tambah(id, 1);
    setFlashId(id);
    setTimeout(() => setFlashId(null), 220);
  };

  const utangPelanggan = (p) => S.kasbon.filter((k) => !k.lunas && k.nama === p.nama).reduce((a, b) => a + b.jml, 0);

  // rec.start() WAJIB dipanggil LANGSUNG di dalam event klik ini (bukan belakangan di
  // useEffect pas SheetVoice baru kebuka) - Chrome Android terkenal strict soal ini: kalau
  // start() dipanggil di luar "user gesture" asli (misal setelah render/mount async), dia bisa
  // diam-diam gagal minta izin mic TANPA nge-trigger onerror sama sekali (beda dari Chrome
  // desktop yang lebih longgar) - persis gejala "sheet kebuka tapi macet selamanya di 'Dengar…'"
  // yang cuma kejadian di HP, nggak di desktop.
  const bukaVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

    // iPhone yang dibuka dari IKON LAYAR HP: SpeechRecognition-nya ADA (jadi `SR` di atas nggak
    // null) tapi SELALU ditolak WebKit, walau izin mikrofonnya udah dikasih. Jadi jangan dicoba
    // dulu - percobaan itu cuma ngasih dialog error yang nggak ada obatnya. Langsung ke jalur
    // rekam + transkrip AI, yang di situ jalan normal. Lihat lib/rekam.js.
    const iosTerpasang = perangkatIOS() && terpasangSebagaiApp();
    if ((!SR || iosTerpasang) && rekamanDidukung()) {
      setVoiceRec('rekam');
      setVoiceOpen(true);
      return;
    }
    if (!SR) {
      setVoiceRec('tidak-didukung');
      setVoiceOpen(true);
      return;
    }
    // Beresin sesi SEBELUMNYA dulu kalau masih ketinggalan (belum sempet dibersihin sendiri) -
    // klik "Sebut barang" berulang cepat ("spam") bisa nyisain sesi lama yang belum bener2
    // dilepas, bikin start() yang baru ditolak browser.
    if (recAktifSaatIni) matikanMic(recAktifSaatIni);
    const rec = new SR();
    rec.lang = 'id-ID';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    // continuous SEHARUSNYA false by default per spek, tapi di-set eksplisit jaga-jaga —
    // beberapa versi Safari/WebKit (iOS) dilaporkan nggak konsisten soal ini, dan sesi yang
    // "nganggep" masih continuous lebih susah ngelepas microphone-nya sendiri.
    rec.continuous = false;
    try {
      rec.start();
      recAktifSaatIni = rec;
    } catch {
      // start() beneran ditolak (misal sesi lama masih dalam proses dilepas, walau udah
      // di-abort barusan - ada jeda dikit di level browser) - kasih tau jelas, jangan diem-diem
      // lanjut buka sheet seolah semua baik-baik aja padahal speech-nya nggak bakal pernah jalan
      toast('Lagi proses sesi sebelumnya, coba lagi sebentar lagi');
      return;
    }
    setVoiceRec(rec);
    setVoiceOpen(true);
  };

  const itemsFromCart = () => Object.entries(cart).map(([id, qty]) => ({ id, qty }));
  const itemsTxt = (items) => items.map(({ id, qty }) => `${qty}x ${produkById[id].nama}`);

  const bayar = () => {
    if (!totalCart) return;
    openLunas('Konfirmasi pembayaran', `Total belanja <b style="color:var(--ink)">${rupiah(totalCart)}</b>.`, (metode) => {
      const items = itemsFromCart();
      const laba = items.reduce((a, { id, qty }) => a + produkById[id].untung * qty, 0);
      const pembeli = pelangganTerpilih ? pelangganTerpilih.nama : null;
      dispatch({ type: 'SELESAI_BAYAR', items, total: totalCart, laba, metode, pembeli, pembeliId: pelangganTerpilih?.id });
      setStrukData({ waktu: new Date().toISOString(), total: totalCart, items: itemsTxt(items), pembeli, metode, oleh: S.penjagaAktif || '-' });
      kosongkanCart();
      setPelangganTerpilih(null);
    });
  };

  // pelangganId WAJIB dikirim ke backend kalau pembelinya pelanggan terdaftar — tanpa ini,
  // kasbon-nya cuma "nempel" ke nama (teks), jadi fitur Kenal Wajah nggak akan pernah ketemu
  // utangnya waktu dicek ulang lewat kamera (backend nyari berdasarkan ID, bukan nama).
  const prosesKasbon = (namaPembeli, pelangganId) => {
    const items = itemsFromCart();
    dispatch({ type: 'CATAT_KASBON', items, total: totalCart, pembeli: namaPembeli, pembeliId: pelangganId });
    openOk('Kasbon dicatat', `${rupiah(totalCart)} atas nama <b>${escapeHtml(namaPembeli)}</b>. Dicatat oleh ${escapeHtml(S.penjagaAktif) || '-'}.`);
    kosongkanCart();
    setPelangganTerpilih(null);
    setSiapaOpen(false);
  };

  return (
    <>
      <div style={{ paddingTop: 14 }}>
        <p className="p-h1">Catat jualan</p>
        <p className="p-sub">Sebut barangnya, atau tap tombol di bawah</p>
      </div>

      <div className="ai-row">
        <button className="mic-big" onClick={bukaVoice}>
          <span className="ic">
            <svg viewBox="0 0 24 24">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
            </svg>
          </span>
          Sebut barang
        </button>
        <button className="kotak-btn" title="Foto barang" onClick={() => setVisualOpen(true)}>
          <svg viewBox="0 0 24 24">
            <path d="M2 4v16" strokeWidth="1.4" />
            <path d="M4.4 4v16" strokeWidth="0.9" />
            <path d="M6.6 4v16" strokeWidth="1.6" />
            <path d="M9 4v16" strokeWidth="0.9" />
            <path d="M11 4v16" strokeWidth="0.9" />
            <path d="M13.4 4v16" strokeWidth="2.6" />
            <path d="M16.4 4v16" strokeWidth="1.2" />
            <path d="M18.6 4v16" strokeWidth="1.6" />
            <path d="M20.8 4v16" strokeWidth="0.9" />
          </svg>
        </button>
        <button className="kotak-btn" title="Kenal wajah" onClick={() => setWajahOpen(true)}>
          <svg viewBox="0 0 24 24">
            <path d="M2 6.5V4A1.5 1.5 0 0 1 3.5 2.5H6" />
            <path d="M18 2.5h2.5A1.5 1.5 0 0 1 22 4v2.5" />
            <path d="M2 17.5V20A1.5 1.5 0 0 0 3.5 21.5H6" />
            <path d="M18 21.5h2.5A1.5 1.5 0 0 0 22 20v-2.5" />
            <path d="M7.3 10.2C7.3 6.2 9.4 3 12 3s4.7 3.2 4.7 7.2c0 5-2.4 9-4.7 9s-4.7-4-4.7-9z" />
            <path d="M2.5 10.2h19" />
            <path d="M9.3 15.8c.2 2.4-.8 4-2.7 5" />
            <path d="M14.7 15.8c-.2 2.4.8 4 2.7 5" />
          </svg>
        </button>
        {/* Fallback kalau suara/kamera/AI di atas semuanya nggak bisa dipakai (mic ditolak, kamera
            error, model gagal kemuat, dll) - cari nama barang manual terus tap buat masukin
            keranjang. Nggak nyandar ke mic/kamera/API luar sama sekali, jadi INI yang paling nggak
            mungkin ikut error bareng yang lain. */}
        <button className="kotak-btn" title="Cari manual" onClick={() => setCariOpen(true)}>
          <svg viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="6.2" />
            <path d="m15.6 15.6 4.4 4.4" />
          </svg>
        </button>
      </div>

      {/* Target setoran: buat pemilik warung yang nggak nyatet per pembeli sepanjang hari, terus
          pas tutup baru tau laci isinya (misal) 100rb. Dia ceklis barang sampai totalnya ketemu,
          bukan ngetik 100rb gelondongan - biar LABA & STOK tetap kehitung bener (dua hal yang
          justru jadi inti Laporan untung rugi & sisa stok). Angkanya cuma alat bantu hitung di
          layar, NGGAK ikut kesimpen ke transaksi. */}
      <div className="total">
        <p className="t">
          Total belanja pembeli
          {/* marginTop DIMATIKAN: .linkkecil defaultnya punya margin-top 26px (buat link yang berdiri
              sendiri di bawah form). Di sini dia nempel di baris judul, jadi margin itu bikin
              tombolnya turun & kelihatan nggak sebaris sama "Total belanja pembeli". */}
          <button
            className="linkkecil"
            style={{ width: 'auto', flex: '0 0 auto', margin: 0 }}
            onClick={() => setTargetOpen(true)}
          >
            {target > 0 ? 'ubah target' : 'pasang target'}
          </button>
        </p>
        {/* SELALU total keranjang, jangan akumulasi harian. Tugas utama angka ini ngasih tau
            PEMBELI harus bayar berapa - sempat diganti jadi terkumpul-hari-ini, dan itu ngerusak
            fungsi pokoknya. Progress target cukup di baris kecil di bawah. */}
        <p className="n p-num">{rupiah(totalCart)}</p>
        {target > 0 && (
          <>
            <div
              style={{
                height: 6, borderRadius: 99, background: 'rgba(255,255,255,.18)',
                marginTop: 10, overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: Math.min(100, (terkumpul / target) * 100) + '%',
                  background: terkumpul >= target ? '#4ade80' : 'var(--brand)',
                  transition: 'width .2s',
                }}
              />
            </div>
            <p className="t" style={{ marginTop: 8 }}>
              {terkumpul >= target ? (
                <>Target {rupiah(target)} tercapai - lebih {rupiah(terkumpul - target)}</>
              ) : (
                <>Kurang {rupiah(target - terkumpul)} dari target {rupiah(target)}</>
              )}
            </p>
          </>
        )}
      </div>
      {targetOpen && (
        <SheetTarget
          awal={target}
          onSimpan={(n) => {
            setTarget(n);
            setTargetOpen(false);
          }}
          onClose={() => setTargetOpen(false)}
        />
      )}

      {pelangganTerpilih && (
        <div className="card">
          <div className="row">
            <div className="bulat">{pelangganTerpilih.foto ? <img src={pelangganTerpilih.foto} alt="" /> : inisial(pelangganTerpilih.nama)}</div>
            <div>
              <div className="nama">{pelangganTerpilih.nama}</div>
              <div className="tgl">
                {utangPelanggan(pelangganTerpilih) ? 'Utang lama ' + rupiah(utangPelanggan(pelangganTerpilih)) : 'Tidak punya utang'}
              </div>
            </div>
            <button className="btn kecil kanan" onClick={() => setPelangganTerpilih(null)}>
              Lepas
            </button>
          </div>
        </div>
      )}

      <p className="p-sec">Di keranjang</p>
      <div className="card">
        {cartIds.length === 0 && (
          <div className="kosong">
            Belum ada barang.
            <br />
            Tekan <Ikon nama="mikrofon" style={{ width: 16, height: 16, verticalAlign: '-3px' }} /> <b>Sebut barang</b> dan sebutkan barangnya
          </div>
        )}
        {cartIds.map((id) => {
          const p = produkById[id];
          return (
            <div className="item masuk" key={id}>
              <ProductIcon id={p.id} foto={p.foto} />
              <div>
                <div className="nama">{p.nama}</div>
                <div className="tgl">{rupiah(p.harga)}</div>
              </div>
              <div className="qty">
                <button className="qbtn" onClick={() => kurang(id)}>
                  −
                </button>
                <span className="p-num">{cart[id]}</span>
                <button className="qbtn" onClick={() => tambah(id, 1, true)}>
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="p-sec">Sering dibeli pagi</p>
      <div className="grid3">
        {produkSeringPagi.map((p) => (
          <button key={p.id} className={'chip' + (flashId === p.id ? ' flash' : '')} onClick={() => chipTap(p.id)}>
            <ProductIcon id={p.id} foto={p.foto} />
            <span className="chip-nama">{p.nama}</span>
          </button>
        ))}
      </div>

      <div className="actions">
        <button
          className="btn"
          disabled={!cartIds.length}
          onClick={() => {
            // udah tau siapa pembelinya (misal dari Kenal Wajah / lepas pilih pelanggan sebelumnya)
            // -> langsung catat, nggak perlu nanya ulang "siapa yang kasbon"
            if (pelangganTerpilih) prosesKasbon(pelangganTerpilih.nama, pelangganTerpilih.id);
            else setSiapaOpen(true);
          }}
        >
          Kasbon
        </button>
        <button className="btn utama" disabled={!cartIds.length} onClick={bayar}>
          Selesai, dibayar
        </button>
      </div>

      {voiceOpen && (
        <SheetVoice
          rec={voiceRec}
          onClose={() => {
            setVoiceOpen(false);
            setVoiceRec(null);
          }}
        />
      )}
      {visualOpen && <SheetVisual onClose={() => setVisualOpen(false)} />}
      {cariOpen && <SheetCariManual onClose={() => setCariOpen(false)} />}
      {wajahOpen && (
        <SheetWajah
          onClose={() => setWajahOpen(false)}
          onTambahBaru={() => {
            setWajahOpen(false);
            setPelangganFormOpen(true);
          }}
        />
      )}
      {siapaOpen && <SheetSiapaKasbon onClose={() => setSiapaOpen(false)} onPilih={prosesKasbon} />}
      {strukData && <SheetStruk data={strukData} onClose={() => setStrukData(null)} />}
    </>
  );
}

// Cari manual - jaring pengaman TERAKHIR kalau Sebut barang/Foto barang/Kenal wajah semua nggak
// bisa dipakai (mic ditolak browser, kamera error, model gagal kemuat, dll). Nggak nyandar ke
// mic/kamera/API luar sama sekali - cuma nyaring S.produk yang UDAH kemuat di client, jadi ini
// yang paling nggak mungkin ikut kena masalah yang sama kayak jalur-jalur lain. Sheet-nya SENGAJA
// nggak nutup sendiri abis nambah 1 barang (beda dari pilih() di SheetVisual) - biar bisa cari &
// tap berkali-kali buat masukin banyak barang manual sekaligus (skenario "semua eror, kudu manual"
// biasanya emang butuh masukin lebih dari 1 barang), tutupnya lewat tombol "Selesai" sendiri.
function SheetCariManual({ onClose }) {
  const { S, tambah } = useApp();
  const [cari, setCari] = useState('');
  const [grupTerbuka, setGrupTerbuka] = useState(null); // grup mana yang lagi kebuka pickernya (accordion)
  const q = cari.trim().toLowerCase();
  const cocok = q ? S.produk.filter((p) => p.nama.toLowerCase().includes(q) || p.grup?.toLowerCase().includes(q)) : S.produk;
  const baris = kelompokkanBuatPilih(cocok, (p) => p.grup);

  const pilihDariHasil = (p) => {
    tambah(p.id, 1);
    setGrupTerbuka(null);
  };

  return (
    <div className="sheet show">
      <div className="panel">
        <h3>Cari barang manual</h3>
        <div className="cari" style={{ marginTop: 14 }}>
          <svg viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="6.2" />
            <path d="m15.6 15.6 4.4 4.4" />
          </svg>
          <input type="text" autoFocus placeholder="Ketik nama barang…" value={cari} onChange={(e) => setCari(e.target.value)} />
          {cari && (
            <button className="cari-clear" onClick={() => setCari('')} aria-label="Hapus pencarian">
              <svg viewBox="0 0 24 24">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          )}
        </div>
        <div style={{ marginTop: 12, maxHeight: '50vh', overflowY: 'auto' }}>
          {baris.length === 0 && <div className="kosong">Nggak ada barang cocok "{escapeHtml(cari)}"</div>}
          {baris.map((row) =>
            row.tipe === 'satu' ? (
              <button key={row.item.id} className={'hasil' + (bisaDijual(row.item) ? '' : ' belum-siap')} onClick={() => pilihDariHasil(row.item)}>
                <ProductIcon id={row.item.id} foto={row.item.foto} />
                <div>
                  <div className="nama">{row.item.nama}</div>
                  <div className="tgl">{bisaDijual(row.item) ? `${rupiah(row.item.harga)} · sisa ${row.item.stok}` : `Belum bisa dijual · ${belumDiatur(row.item)}`}</div>
                </div>
              </button>
            ) : (
              <div key={row.grup}>
                <button
                  className="hasil"
                  onClick={() => setGrupTerbuka(grupTerbuka === row.grup ? null : row.grup)}
                >
                  <ProductIcon id={row.items[0].id} foto={row.items[0].foto} />
                  <div>
                    <div className="nama">{row.grup}</div>
                    <div className="tgl">{row.items.length} varian - pilih ukuran/jenisnya</div>
                  </div>
                  <span className="mirip">{grupTerbuka === row.grup ? '▲' : '▼'}</span>
                </button>
                {grupTerbuka === row.grup && (
                  <div style={{ paddingLeft: 16 }}>
                    {row.items.map((p) => (
                      <button key={p.id} className={'hasil' + (bisaDijual(p) ? '' : ' belum-siap')} style={{ marginTop: 6 }} onClick={() => pilihDariHasil(p)}>
                        <ProductIcon id={p.id} foto={p.foto} />
                        <div>
                          <div className="nama">{p.nama}</div>
                          <div className="tgl">{bisaDijual(p) ? `${rupiah(p.harga)} · sisa ${p.stok}` : `Belum bisa dijual · ${belumDiatur(p)}`}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          )}
        </div>
        <button className="btn utama" style={{ width: '100%', marginTop: 12 }} onClick={onClose}>
          Selesai
        </button>
      </div>
    </div>
  );
}

// Voice-First (PRD #2) — beneran pakai Web Speech API bawaan browser (STT-nya jalan di Chrome/Edge,
// gratis, offline setelah bahasanya kedownload sekali). Hasil transkrip dicocokkan ke S.produk yang
// asli lewat parseUcapan (fuzzy match + baca angka Indonesia), sama kayak sebelumnya.
// `rec`: instance SpeechRecognition yang UDAH di-start() dari luar (lihat bukaVoice() di Catat())
// - atau string 'tidak-didukung' kalau browsernya nggak dukung API ini sama sekali. WAJIB begini
// (bukan bikin+start sendiri di sini lewat useEffect) karena Chrome Android strict soal
// SpeechRecognition.start() harus kepanggil di dalam user gesture ASLI (event klik langsung),
// bukan belakangan setelah render/mount async - kalau dilanggar, izin mic bisa diam-diam gagal
// diminta TANPA nge-trigger onerror sama sekali (Chrome desktop lebih longgar soal ini, makanya
// dulu bug ini cuma kejadian di HP, nggak kelihatan pas dites di desktop).
function SheetVoice({ rec, onClose }) {
  const { S, tambah, totalCart, toast, openIzin } = useApp();
  const [step, setStep] = useState('dengar'); // dengar | teks | tidak-didukung | memproses-ai | pilih-varian
  const [teks, setTeks] = useState('');
  const [ngomong, setNgomong] = useState(false); // true selagi speech recognition-nya deteksi ada suara masuk
  const [batang, setBatang] = useState([1, 1, 1, 1, 1, 1, 1]); // scaleY tiap batang wave, diacak biar keliatan "ngikutin" ngomong
  const [antrianAmbigu, setAntrianAmbigu] = useState([]); // entri yang variannya belum jelas (mis. "aqua" tanpa sebut ukuran), ditanyain satu-satu
  const recRef = useRef(null);
  const diIOS = perangkatIOS();
  // Jalur rekam+transkrip (dipakai kalau SpeechRecognition nggak bisa dipakai - lihat bukaVoice).
  // perekamRef nyimpen pengendali dari mulaiRekam(); mikrofonnya baru dilepas pas selesai/batal.
  const perekamRef = useRef(null);
  const [statusRekam, setStatusRekam] = useState('siap'); // siap | rekam | kirim

  // Kalau sheet-nya ditutup selagi masih ngerekam (tap Batal, atau komponennya dilepas),
  // mikrofonnya HARUS dilepas - kalau nggak, indikator rekaman di HP nyala terus.
  useEffect(
    () => () => {
      perekamRef.current?.batal();
      perekamRef.current = null;
    },
    []
  );

  const mulaiNgerekam = async () => {
    try {
      // Dipanggil LANGSUNG di dalam handler tap - getUserMedia butuh itu biar dialog izinnya
      // kehitung sebagai permintaan user (sama alasannya kayak SpeechRecognition.start()).
      perekamRef.current = await mulaiRekam({
        onOtomatisBerhenti: () => {
          // Kena batas 20 detik. Rekamannya tetep dikirim - yang udah kerekam masih berguna,
          // daripada dibuang & user harus ngulang dari nol.
          selesaiNgerekam();
        },
      });
      setStatusRekam('rekam');
    } catch (e) {
      perekamRef.current = null;
      if (e?.name === 'NotAllowedError') openIzin();
      else toast('Mikrofonnya nggak bisa dipakai. Ketik manual dulu ya.');
      setStep('teks'); // dialihin ke ketik manual, jangan mentok - pembelinya lagi nunggu
    }
  };

  const selesaiNgerekam = async () => {
    const perekam = perekamRef.current;
    if (!perekam) return;
    perekamRef.current = null;
    setStatusRekam('kirim');
    try {
      const audio = await perekam.selesai();
      if (!audio) {
        toast('Nggak ada suara yang kerekam. Coba lagi ya.');
        setStatusRekam('siap');
        return;
      }
      const { teks: hasil } = await api.suara.transkrip(audio);
      if (!hasil) {
        toast('Suaranya nggak kedengeran jelas. Coba lagi, atau ketik manual.');
        setStatusRekam('siap');
        return;
      }
      // Masuk ke langkah yang SAMA PERSIS kayak hasil SpeechRecognition: ditaruh di kotak teks
      // yang bisa dikoreksi dulu, baru dimasukin keranjang. Nggak ada jalur pintas yang langsung
      // eksekusi - transkrip AI juga bisa salah denger.
      setTeks(hasil);
      setStep('teks');
    } catch (e) {
      toast(e?.message ? escapeHtml(e.message) : 'Gagal membaca suara. Ketik manual dulu ya.');
      setStatusRekam('siap');
    }
  };

  const batalRekam = () => {
    perekamRef.current?.batal();
    perekamRef.current = null;
    onClose();
  };

  // SpeechRecognition TIDAK ngasih data level volume suara asli — cuma event on/off
  // (onspeechstart/onspeechend). Visualizer amplitudo BENERAN butuh stream mic terpisah
  // (getUserMedia+AnalyserNode), yang UDAH DICOBA sebelumnya (lihat komentar di bawah) dan
  // kebukti bikin speech recognition-nya sendiri mati di banyak HP Android (2 konsumen mic
  // bersamaan saling rebutan akses). Jalan tengahnya di sini: acak-acak tinggi tiap batang
  // sesering mungkin SELAMA ngomong true — bukan amplitudo asli, tapi keliatan "hidup"/nyambung
  // sama omongan tanpa nyentuh mic sama sekali (nggak ada risiko konflik).
  useEffect(() => {
    // Ikut hidup juga selama jalur rekam lagi jalan - di situ juga nggak ada data amplitudo asli
    // (kita cuma nampung potongan suara), jadi perlakuannya sama: gerak biar keliatan nyala.
    if (!ngomong && statusRekam !== 'rekam') {
      setBatang([1, 1, 1, 1, 1, 1, 1]);
      return;
    }
    const iv = setInterval(() => {
      setBatang(Array.from({ length: 7 }, () => 0.6 + Math.random() * 1.6));
    }, 110);
    return () => clearInterval(iv);
  }, [ngomong, statusRekam]);

  useEffect(() => {
    if (rec === 'rekam') {
      setStep('rekam');
      return;
    }
    if (rec === 'tidak-didukung' || !rec) {
      setStep('tidak-didukung');
      return;
    }

    const waktuMulaiEfek = Date.now(); // dipakai cleanup di bawah buat bedain simulasi StrictMode vs unmount beneran

    // Jaga-jaga kalau onresult/onerror DUA-DUANYA nggak pernah kepanggil sama sekali (kejadian
    // kalau speech service-nya - yang di banyak Android/Chrome beneran roundtrip ke server Google,
    // bukan murni on-device - macet/nggak jawab) - tanpa ini, UI nyangkut selamanya di "Dengar…"
    // tanpa ada tanda apapun. Di-clear begitu onresult/onerror beneran kepanggil, biar nggak
    // nutup sheet sendiri belakangan pas user lagi ngedit hasil transkrip di step 'teks'.
    const timeoutTimer = setTimeout(() => {
      matikanMic(rec);
      toast('Nggak kedengeran jelas. Coba lagi.');
      onClose();
    }, 15000);

    rec.onresult = (e) => {
      clearTimeout(timeoutTimer);
      if (recAktifSaatIni === rec) recAktifSaatIni = null; // sesi udah kelar wajar (dapet hasil)
      setTeks(e.results[0][0].transcript);
      setStep('teks');
    };
    rec.onerror = (e) => {
      clearTimeout(timeoutTimer);
      matikanMic(rec);
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        // Panduan langkah-per-langkah, bukan toast sekilas: menu setelannya beda tiap HP, dan
        // toast 3 detik nggak cukup buat nuntun orang ke sana (lihat SheetIzin di SharedSheets).
        openIzin();
        // Dialihkan ke ketik manual, JANGAN cuma ditutup - pembelinya lagi nunggu di depan,
        // jangan sampai pemilik warung mentok tanpa jalan lain gara-gara mic bermasalah.
        setStep('teks');
        return;
      }
      if (e.error !== 'aborted') {
        toast('Nggak kedengeran jelas. Coba lagi.');
      }
      onClose();
    };
    // Animasi batang ngikutin kapan SpeechRecognition beneran deteksi ada suara masuk (bukan mic
    // stream terpisah — sempat dicoba pakai getUserMedia+AnalyserNode buat visualizer amplitudo
    // asli, tapi di banyak HP Android itu ngerebut akses mic dari SpeechRecognition sendiri jadi
    // transkripnya nggak pernah keluar. Event bawaan ini aman karena nggak buka koneksi mic baru.
    rec.onspeechstart = () => setNgomong(true);
    rec.onspeechend = () => setNgomong(false);
    recRef.current = rec;

    return () => {
      clearTimeout(timeoutTimer);
      // Detach listener-nya dulu — aman dipanggil berkali-kali, gak matiin sesi apa pun.
      rec.onresult = null;
      rec.onerror = null;
      rec.onspeechstart = null;
      rec.onspeechend = null;
      // React StrictMode (mode development, lihat main.jsx) manggil cleanup INI sesaat (dalam
      // hitungan milidetik) setelah mount pertama buat ngetes ketahanan efek (mount -> cleanup ->
      // mount lagi) — padahal `rec` di sini dibikin & di-start() di LUAR efek ini (bukaVoice() di
      // komponen Catat(), demi syarat user-gesture Chrome Android). Kalau di sini main-main
      // abort() TANPA syarat, sesi speech recognition yang BENERAN lagi jalan bakal MATI DULUAN
      // sebelum user sempet ngomong sepatah kata pun (gejalanya: mic keliatan aktif sesaat terus
      // diem mendadak, UI nyangkut "Dengar…" sampe timeout).
      //
      // TAPI kalau abort()-nya di-skip SELAMANYA (versi sebelum ini), sheet yang ke-unmount lewat
      // jalur LAIN di luar tombol Batal/Tutup manual (misal user pindah ke tab/layar lain padahal
      // sheet-nya masih kebuka) jadi nggak pernah matiin mic-nya — bocor nyala terus.
      //
      // Jalan tengahnya: cleanup simulasi StrictMode kejadian PERSIS setelah mount (<50ms,
      // gak butuh reaksi manusia), sedangkan unmount BENERAN (nutup manual, atau navigasi
      // pindah layar) minimal butuh 1 event asli yang jaraknya jauh lebih dari itu. Threshold ini
      // yang misahin dua kejadian itu — abort() di sini dijalanin lagi sebagai JARING PENGAMAN
      // (tutupManual/timeout/onresult/onerror di atas udah nanganin skenario yang mereka tau,
      // ini nutup celah buat unmount yang gak lewat jalur itu).
      if (Date.now() - waktuMulaiEfek > 50) {
        matikanMic(rec);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dipakai di SEMUA titik "user beneran selesai/nutup" (Batal, Tutup, Masukkan ke keranjang,
  // pilih varian) — beda sama cleanup efek di atas, di sini matiin mic AMAN karena beneran user
  // yang mutusin selesai (bukan StrictMode ngetes idempotency).
  const tutupManual = () => {
    matikanMic(recRef.current);
    onClose();
  };

  const proses = async () => {
    const hasil = parseUcapan(S.produk, teks);
    if (!hasil.length) {
      // parseUcapan (gratis, instan, keyword matching) sama sekali nggak nemu apa-apa - bisa jadi
      // ucapannya emang di luar pola yang dia kenali, ATAU speech-to-text browser salah denger
      // (misal "satu" ketranskrip jadi kata lain yang kebetulan ada di daftar kata pengisi/filler,
      // jadi kebuang tanpa kebaca). Coba sekali lagi lewat AI (teks doang, jauh lebih murah dari
      // scan foto) sebelum beneran nyerah - Gemini lebih toleran ke ucapan nggak baku/typo STT.
      setStep('memproses-ai');
      try {
        const hasilAi = await api.voice.parseAi(teks);
        if (hasilAi.length) {
          hasilAi.forEach(({ produk, qty }) => tambah(produk.id, qty, true));
          const tambahan = hasilAi.reduce((a, { produk, qty }) => a + produk.harga * qty, 0);
          toast(`${hasilAi.length} jenis barang (dibantu AI) - <b>${rupiah(totalCart + tambahan)}</b>`);
          return tutupManual();
        }
      } catch {
        /* AI juga gagal/error jaringan - lanjut ke pesan gagal biasa di bawah, jangan nyangkut */
      }
      tutupManual();
      return toast('Barangnya nggak ketemu di katalog. Coba sebut ulang / ketik manual.');
    }
    // yang jelas produknya langsung masuk keranjang; yang ambigu (mis. "aqua" tanpa sebut
    // ukuran, ada beberapa varian dalam 1 grup) ditanyain dulu satu-satu, nggak asal nebak
    const pasti = hasil.filter((h) => !h.ambigu);
    const ambigu = hasil.filter((h) => h.ambigu);
    pasti.forEach((h) => tambah(h.p.id, h.q, true));
    if (pasti.length) {
      const tambahan = pasti.reduce((a, h) => a + h.p.harga * h.q, 0);
      toast(`${pasti.length} jenis barang masuk - <b>${rupiah(totalCart + tambahan)}</b>`);
    }
    if (ambigu.length) {
      setAntrianAmbigu(ambigu);
      setStep('pilih-varian');
    } else {
      tutupManual();
    }
  };

  const pilihVarian = (p) => {
    const item = antrianAmbigu[0];
    tambah(p.id, item.q, true);
    toast(`${item.q}× ${escapeHtml(p.nama)} masuk keranjang`);
    const sisa = antrianAmbigu.slice(1);
    if (sisa.length) setAntrianAmbigu(sisa);
    else tutupManual();
  };

  return (
    <div className="sheet show">
      <div className="panel mid">
        {step === 'dengar' && (
          <>
            <div className={'wave' + (ngomong ? ' ngomong' : '')}>
              {batang.map((s, i) => (
                <i key={i} style={ngomong ? { transform: `scaleY(${s})` } : undefined} />
              ))}
            </div>
            <h3>Dengar…</h3>
            <p>
              Sebutkan barangnya, contoh:
              <br />
              &ldquo;tiga mie goreng satu minyak&rdquo;
            </p>
            <button className="btn" style={{ width: '100%', marginTop: 18 }} onClick={tutupManual}>
              Batal
            </button>
            {diIOS && (
              <p style={{ fontSize: 12, opacity: 0.6, textAlign: 'center', marginTop: 10 }}>
                Titik oranye di pojok atas kadang tetap nyala sesaat setelah ini ditutup - itu
                batasan Safari/iOS ngelepas mic, bukan aplikasi ini yang diam-diam masih merekam.
              </p>
            )}
          </>
        )}
        {/* Jalur rekam+transkrip. Beda dari 'dengar' di atas yang otomatis berhenti sendiri pas
            user diem: di sini user yang mutusin kapan selesai, soalnya nggak ada sinyal apa pun
            dari browser soal "udah berhenti ngomong belum" - yang kita punya cuma potongan suara
            mentah. Dua tap: mulai, terus selesai. */}
        {step === 'rekam' && (
          <>
            <div className={'wave' + (statusRekam === 'rekam' ? ' ngomong' : '')}>
              {batang.map((s2, i) => (
                <i key={i} style={statusRekam === 'rekam' ? { transform: `scaleY(${s2})` } : undefined} />
              ))}
            </div>
            {statusRekam === 'kirim' ? (
              <>
                <h3>Lagi dibaca...</h3>
                <p>Sebentar ya, suaranya lagi diubah jadi tulisan.</p>
              </>
            ) : statusRekam === 'rekam' ? (
              <>
                <h3>Lagi merekam</h3>
                <p>Sebutkan barangnya, terus tap Selesai.</p>
                <button className="btn utama" style={{ width: '100%', marginTop: 18 }} onClick={selesaiNgerekam}>
                  Selesai
                </button>
              </>
            ) : (
              <>
                <h3>Sebut barang</h3>
                <p>
                  Tap Mulai, sebutkan barangnya, contoh:
                  <br />
                  &ldquo;tiga mie goreng satu minyak&rdquo;
                </p>
                <button className="btn utama" style={{ width: '100%', marginTop: 18 }} onClick={mulaiNgerekam}>
                  Mulai rekam
                </button>
              </>
            )}
            <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={batalRekam}>
              {/* Tetep ada selagi nunggu transkrip: kalau jaringannya lelet, jangan sampai user
                  kekunci di layar "Lagi dibaca..." tanpa jalan keluar - pembelinya nunggu di depan. */}
              {statusRekam === 'kirim' ? 'Batal, ketik manual aja' : 'Batal'}
            </button>
            <p style={{ fontSize: 12, opacity: 0.6, textAlign: 'center', marginTop: 10 }}>
              Di HP ini suaranya dibaca lewat Mang AI - kepotong sendiri kalau lebih dari 20 detik.
            </p>
          </>
        )}
        {step === 'tidak-didukung' && (
          <>
            <h3>Browser ini belum dukung dengar suara</h3>
            <p>Fitur ini pakai Web Speech API - coba pakai Chrome/Edge, atau ketik manual dulu ya.</p>
            <button className="btn utama" style={{ width: '100%', marginTop: 16 }} onClick={tutupManual}>
              Tutup
            </button>
          </>
        )}
        {step === 'teks' && (
          <div style={{ textAlign: 'left' }}>
            <h3 style={{ textAlign: 'center' }}>Yang terdengar</h3>
            <div className="field">
              <label>Ubah kalau ada yang salah dengar</label>
              <input value={teks} onChange={(e) => setTeks(e.target.value)} />
            </div>
            <button className="btn utama" style={{ width: '100%', marginTop: 14 }} onClick={proses}>
              Masukkan ke keranjang
            </button>
            <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={tutupManual}>
              Batal
            </button>
          </div>
        )}
        {step === 'memproses-ai' && (
          <>
            <h3>Coba dibantu AI…</h3>
            <p>Pola ucapan tadi belum kekenal, lagi dicoba diinterpretasi ulang pakai AI</p>
          </>
        )}
        {step === 'pilih-varian' && antrianAmbigu[0] && (
          <div style={{ textAlign: 'left' }}>
            <h3 style={{ textAlign: 'center' }}>{antrianAmbigu[0].grup} yang mana?</h3>
            <p style={{ textAlign: 'center' }}>
              Nggak nyebut ukuran/variannya - pilih salah satu ({antrianAmbigu[0].q}×)
            </p>
            {antrianAmbigu[0].kandidat.map((p) => (
              <button key={p.id} className="hasil" style={{ marginTop: 10 }} onClick={() => pilihVarian(p)}>
                <ProductIcon id={p.id} foto={p.fotoUrl} />
                <div>
                  <div className="nama">{p.nama}</div>
                  <div className="tgl">sisa {p.stok}</div>
                </div>
                <span className="mirip">{rupiah(p.harga)}</span>
              </button>
            ))}
            <button className="btn" style={{ width: '100%', marginTop: 14 }} onClick={tutupManual}>
              {antrianAmbigu.length > 1 ? 'Batal sisanya' : 'Batal'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Scan Barang — Hybrid MobileNet + Visual Similarity (PRD 10.1). Kamera live beneran dibuka,
// MobileNet (jalan di browser lewat TensorFlow.js) ekstrak vektor embedding dari frame yang
// difoto, lalu dicocokkan ke semua foto referensi barang yang sudah didaftarkan (lewat
// POST /api/scan/visual di backend, cosine similarity). Kalau belum ada barang yang punya foto
// referensi sama sekali, hasilnya bakal selalu kosong — itu wajar, bukan bug (lihat Stok > Daftarkan
// foto barang buat ngedaftarin referensinya dulu).
//
// SEMPAT dicoba auto-jepret (nyoba sendiri tiap ~1.2 detik) sesuai PRD 10.1, tapi ternyata di
// pemakaian nyata sering nggak kebaca — beda sama face-api yang punya descriptor net khusus buat
// tahan beda angle/cahaya, MobileNet embedding biasa jauh lebih sensitif ke framing. Auto-scan
// keburu nangkep frame pas kamera lagi digeser/miring, jadi balik ke manual: user yang nentuin
// kapan tembakannya udah pas (mirip kondisi pas foto referensi diambil), baru di-cocokkan.
function SheetVisual({ onClose }) {
  const { tambah, toast, tanganiErrorAi } = useApp();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const controlsRef = useRef(null); // {stop()} loop scan barcode yang lagi jalan di background
  const matiRef = useRef(false); // true kalau sheet ini udah ditutup/unmount
  const [status, setStatus] = useState('memuat'); // memuat | siap | memindai | hasil | tidak-ketemu | error | memindai-banyak | hasil-banyak
  const [hasil, setHasil] = useState([]);
  const [hasilBanyak, setHasilBanyak] = useState([]); // [{qty, produk}] - hasil dari jepretBanyak (foto banyak barang sekaligus)
  const [sumberHasil, setSumberHasil] = useState('visual'); // 'visual' (foto barang) | 'barcode'
  const [errorMsg, setErrorMsg] = useState('');
  const [fotoJepretan, setFotoJepretan] = useState(null);
  const [grupTerbuka, setGrupTerbuka] = useState(null); // grup mana yang lagi kebuka pickernya di hasil scan (accordion)

  // Mode HYBRID (PRD 10.1): kamera yang sama dipakai buat 2 cara sekaligus — barcode dideteksi
  // OTOMATIS terus-menerus di background (lib/barcodeScan.js, sama persis kayak Stok > Scan
  // Barcode) selagi user liat live camera, SEMENTARA foto barang tetep manual (tap tombol) kayak
  // biasa. Jadi kasir tinggal arahin kamera: kalau kebaca barcode-nya langsung ketemu, kalau
  // nggak ada/nggak kebaca barcode-nya tinggal tap "Jepret & cocokkan" buat cocokin dari fotonya.
  const mulaiBarcode = () => {
    controlsRef.current = mulaiScanBarcode({ videoRef, matiRef, onDetect: barcodeKetemu });
  };

  const barcodeKetemu = async (kode) => {
    try {
      const p = await api.produk.barcode(kode);
      // Endpoint barcode balikin baris mentah (foto_url, harga string) - disamain bentuknya sama hasil /scan/visual
      // (fotoUrl dst). Dulu fotonya nggak pernah kebaca & yang tampil selalu ikon.
      setHasil([
        {
          produk: {
            ...p,
            harga: Number(p.harga),
            modal: Number(p.modal),
            fotoUrl: p.foto_url || null,
            satuan: p.satuan || 'pcs',
            isiKemasan: Number(p.isi_kemasan) || 1,
            namaKemasan: p.nama_kemasan || null,
            grup: p.grup || null,
          },
          skor: 1,
        },
      ]);
      setSumberHasil('barcode');
      setStatus('hasil');
    } catch (e) {
      // 404 (barang belum terdaftar) ATAU error jaringan/server — dua-duanya sama-sama JANGAN
      // nginterupsi kasir yang lagi transaksi (beda konteks sama menu Stok yang emang niatnya
      // ngedaftarin barang baru). Kasih tau doang & lanjut scan lagi.
      toast(e.status === 404 ? 'Barcode ini belum terdaftar - daftarin dulu lewat menu Stok' : e.message ? escapeHtml(e.message) : 'Gagal mencari barang dari barcode');
      if (!matiRef.current) mulaiBarcode();
    }
  };

  const model = useModelVisual();

  useEffect(() => {
    let batal = false;
    // Di-reset di sini, bukan cuma diisi false pas useRef dibuat: StrictMode (dev) ngejalanin efek
    // ini DUA KALI, dan cleanup yang pertama ngeset matiRef = true. Tanpa reset, loop scan barcode
    // langsung berhenti di putaran pertama & nggak pernah jalan lagi - kebukti waktu diukur: 0x baca
    // piksel selama 6 detik padahal videonya udah siap.
    matiRef.current = false;
    (async () => {
      try {
        // Kamera DIPISAH dari model pengenal foto barang (lihat useModelVisual). Dulu dua-duanya
        // ditunggu lewat Promise.all: kalau modelnya gagal dimuat, stream kamera yang UDAH kebuka
        // hilang referensinya & nyala terus setelah sheet ditutup - dan layarnya malah bilang
        // "Kamera nggak bisa dibuka" padahal yang gagal modelnya. Scan barcode juga nggak butuh
        // model, jadi sekarang langsung jalan begitu kamera siap.
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
        mulaiBarcode();
        setStatus('siap');
      } catch (e) {
        if (batal) return;
        setErrorMsg(e.message || 'Gagal membuka kamera');
        setStatus('error');
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

  const jepret = async () => {
    controlsRef.current?.stop(); // jeda scan barcode selagi lagi proses cocokin foto, biar gak dobel
    setFotoJepretan(jepretFrame(videoRef.current)); // biar keliatan apa yang barusan difoto
    setStatus('memindai');
    try {
      const embedding = await ambilEmbedding(videoRef.current);
      await tungguReferensiKatalog(); // barang yang baru diambil dari katalog ikut kecocokan
      const cocok = await api.scan.visual(embedding);
      setHasil(cocok);
      setSumberHasil('visual');
      setStatus(cocok.length ? 'hasil' : 'tidak-ketemu');
    } catch (e) {
      toast(e.message ? escapeHtml(e.message) : 'Gagal memindai barang');
      setStatus('siap');
      if (!matiRef.current) mulaiBarcode();
    }
  };

  // "Foto banyak sekaligus" - beda dari jepret() di atas (1 foto = 1 barang, cocokin embedding
  // MobileNet gratis di client). Ini buat customer yang bawa BEBERAPA barang beda ke kasir, biar
  // nggak perlu buka-tutup sheet ini berkali-kali satu-satu. Nggak bisa pakai MobileNet lokal buat
  // ini (itu cuma bisa "1 foto = 1 embedding", nggak misahin beberapa barang dalam 1 foto) - jadi
  // lewat Gemini Vision (ada biaya kecil tiap foto, lihat cariBanyakBarangGemini di backend), dan
  // TETAP kudu dikonfirmasi user dulu (status 'hasil-banyak') sebelum masuk keranjang - salah kenal
  // pas checkout beneran salah nagih customer, beda taruhannya sama salah kenal pas daftar barang.
  const jepretBanyak = async () => {
    controlsRef.current?.stop();
    const fotoAsli = jepretFrame(videoRef.current);
    setFotoJepretan(fotoAsli);
    setStatus('memindai-banyak');
    try {
      const fotoKirim = await keWebp(fotoAsli, 1024);
      const hasilBanyakBaru = await api.scan.visualAiBanyak(fotoKirim);
      if (!hasilBanyakBaru.length) {
        toast('AI nggak nemu barang yang yakin dikenali - coba foto ulang lebih jelas, atau satu-satu aja');
        setStatus('siap');
        if (!matiRef.current) mulaiBarcode();
        return;
      }
      setHasilBanyak(hasilBanyakBaru);
      setStatus('hasil-banyak');
    } catch (e) {
      tanganiErrorAi(e);
      setStatus('siap');
      if (!matiRef.current) mulaiBarcode();
    }
  };

  const hapusDariHasilBanyak = (id) => setHasilBanyak((h) => h.filter((x) => x.produk.id !== id));

  const tambahkanSemuaHasilBanyak = () => {
    // diam=true di tiap tambah() - nggak nampilin toast per-barang (bisa numpuk 5 toast sekaligus),
    // 1 toast rangkuman di akhir aja cukup.
    hasilBanyak.forEach(({ produk, qty }) => tambah(produk.id, qty, true));
    const total = hasilBanyak.reduce((a, { produk, qty }) => a + produk.harga * qty, 0);
    toast(`${hasilBanyak.length} barang ditambahin - total <b>${rupiah(total)}</b>`);
    onClose();
  };

  const coba = () => {
    setHasil([]);
    setHasilBanyak([]);
    setFotoJepretan(null);
    setGrupTerbuka(null);
    setStatus('siap');
    if (!matiRef.current) mulaiBarcode(); // lanjut scan barcode lagi di background
  };

  const pilih = (produk) => {
    tambah(produk.id, 1);
    onClose();
  };

  const sedangLive = status === 'memuat' || status === 'siap';

  return (
    <div className="sheet tengah show">
      <div className="panel">
        <div className={'viewfinder' + (sedangLive ? '' : ' diam')}>
          <div className="frame" />
          {/* video TETAP dimount biar stream & loop scan barcode-nya gak pernah putus - kalau
              di-unmount lalu status balik ke 'siap', elemen <video> baru yang ke-mount gak
              ke-reattach ke stream & loop-nya ikut mati diam-diam. Disembunyiin doang lewat CSS
              pas lagi nampilin hasil/foto. */}
          <video
            ref={videoRef}
            muted
            playsInline
            style={sedangLive ? { width: '100%', height: '100%', objectFit: 'cover' } : { visibility: 'hidden', position: 'absolute' }}
          />
          {!sedangLive && (
            <div className="isi">
              {fotoJepretan ? (
                <img src={fotoJepretan} alt="" />
              ) : (
                <ProductIcon id={hasil[0]?.produk?.id ?? null} foto={hasil[0]?.produk?.fotoUrl} className="" />
              )}
            </div>
          )}
        </div>

        {status === 'memuat' && (
          <>
            <h3 style={{ textAlign: 'center' }}>Menyiapkan kamera…</h3>
            <p style={{ textAlign: 'center' }}>Sebentar ya</p>
          </>
        )}
        {status === 'error' && (
          <>
            <h3 style={{ textAlign: 'center' }}>Kamera nggak bisa dibuka</h3>
            <p style={{ textAlign: 'center' }}>{errorMsg}</p>
          </>
        )}
        {status === 'siap' && (
          <>
            <h3 style={{ textAlign: 'center' }}>Arahkan ke barangnya</h3>
            <p style={{ textAlign: 'center' }}>Ada barcode-nya kebaca otomatis - kalau nggak ada/nggak kebaca, tahan sebentar biar jelas terus tap tombol di bawah</p>
          </>
        )}
        {status === 'memindai' && (
          <>
            <h3 style={{ textAlign: 'center' }}>Mencocokkan…</h3>
            <p style={{ textAlign: 'center' }}>Sebentar ya</p>
          </>
        )}
        {status === 'memindai-banyak' && (
          <>
            <h3 style={{ textAlign: 'center' }}>Mengenali barang-barangnya…</h3>
            <p style={{ textAlign: 'center' }}>Sebentar ya, ini lewat AI jadi agak lebih lama dikit</p>
          </>
        )}
        {status === 'tidak-ketemu' && (
          <>
            <h3 style={{ textAlign: 'center' }}>Belum ketemu yang mirip</h3>
            <p style={{ textAlign: 'center' }}>Coba foto ulang lebih dekat/terang, atau ketik manual</p>
          </>
        )}
        {status === 'hasil' && (
          <>
            <h3 style={{ textAlign: 'center' }}>{sumberHasil === 'barcode' ? 'Ketemu dari barcode' : `${hasil.length} barang paling mirip`}</h3>
            <p style={{ textAlign: 'center' }}>Tap yang benar untuk masuk keranjang</p>
            <div>
              {/* Kandidat yang kebetulan 1 grup varian (misal 2 ukuran Aqua sama-sama mirip di foto)
                  dikelompokkan jadi 1 kartu dulu - biar nggak numpuk baris mirip yang gampang keliru
                  ditap, user pilih grup-nya dulu baru pilih ukuran/jenisnya. Hasil barcode selalu
                  pasti 1 barang spesifik, nggak perlu dikelompokkan. */}
              {(sumberHasil === 'barcode' ? hasil.map((h) => ({ tipe: 'satu', item: h })) : kelompokkanBuatPilih(hasil, (h) => h.produk.grup)).map((row) =>
                row.tipe === 'satu' ? (
                  <button key={row.item.produk.id} className="hasil" onClick={() => pilih(row.item.produk)}>
                    <ProductIcon id={row.item.produk.id} foto={row.item.produk.fotoUrl} />
                    <div>
                      <div className="nama">{row.item.produk.nama}</div>
                      <div className="tgl">
                        {rupiah(row.item.produk.harga)} · sisa {row.item.produk.stok}
                      </div>
                    </div>
                    {sumberHasil !== 'barcode' && <span className="mirip">{Math.round(row.item.skor * 100)}%</span>}
                  </button>
                ) : (
                  <div key={row.grup}>
                    <button className="hasil" onClick={() => setGrupTerbuka(grupTerbuka === row.grup ? null : row.grup)}>
                      <ProductIcon id={row.items[0].produk.id} foto={row.items[0].produk.fotoUrl} />
                      <div>
                        <div className="nama">{row.grup}</div>
                        <div className="tgl">{row.items.length} varian mirip - pilih ukuran/jenisnya</div>
                      </div>
                      <span className="mirip">{grupTerbuka === row.grup ? '▲' : '▼'}</span>
                    </button>
                    {grupTerbuka === row.grup && (
                      <div style={{ paddingLeft: 16 }}>
                        {row.items.map(({ produk, skor }) => (
                          <button key={produk.id} className="hasil" style={{ marginTop: 6 }} onClick={() => pilih(produk)}>
                            <ProductIcon id={produk.id} foto={produk.fotoUrl} />
                            <div>
                              <div className="nama">{produk.nama}</div>
                              <div className="tgl">
                                {rupiah(produk.harga)} · sisa {produk.stok}
                              </div>
                            </div>
                            <span className="mirip">{Math.round(skor * 100)}%</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          </>
        )}
        {status === 'hasil-banyak' && (
          <>
            <h3 style={{ textAlign: 'center' }}>{hasilBanyak.length} barang dikenali AI</h3>
            <p style={{ textAlign: 'center' }}>Cek dulu - hapus yang salah/nggak sesuai, baru tambahin semua ke keranjang</p>
            <div>
              {hasilBanyak.map(({ produk, qty }) => (
                <div key={produk.id} className="hasil" style={{ cursor: 'default' }}>
                  <ProductIcon id={produk.id} foto={produk.fotoUrl} />
                  <div>
                    <div className="nama">{produk.nama}</div>
                    <div className="tgl">
                      {qty} × {rupiah(produk.harga)}
                    </div>
                  </div>
                  <button className="cari-clear" style={{ position: 'static', flex: 'none' }} onClick={() => hapusDariHasilBanyak(produk.id)} aria-label={`Hapus ${produk.nama}`}>
                    <svg viewBox="0 0 24 24">
                      <path d="M6 6l12 12M18 6 6 18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {status === 'siap' && (
          <>
            {model.keadaan !== 'siap' && (
              <p style={{ textAlign: 'center', fontSize: 13, marginTop: 12 }}>
                {model.keadaan === 'gagal' ? (
                  <>
                    Pengenal foto barang gagal dimuat - scan barcode tetap jalan.{' '}
                    <button type="button" className="btn kecil" style={{ marginTop: 8 }} onClick={model.cobaLagi}>
                      Coba muat lagi
                    </button>
                  </>
                ) : (
                  'Pengenal foto barang lagi disiapin - barcode udah bisa di-scan dari sekarang.'
                )}
              </p>
            )}
            <button className="btn utama brand" style={{ width: '100%', marginTop: 16 }} onClick={jepret} disabled={model.keadaan !== 'siap'}>
              <CameraIcon /> Jepret &amp; cocokkan
            </button>
            <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={jepretBanyak}>
              <CameraIcon /> Foto banyak barang sekaligus (AI)
            </button>
          </>
        )}
        {status === 'hasil-banyak' && (
          <button
            className="btn utama brand"
            style={{ width: '100%', marginTop: 10 }}
            disabled={!hasilBanyak.length}
            onClick={tambahkanSemuaHasilBanyak}
          >
            Tambahkan {hasilBanyak.length} barang ke keranjang
          </button>
        )}
        {(status === 'hasil' || status === 'tidak-ketemu' || status === 'hasil-banyak') && (
          <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={coba}>
            Coba lagi
          </button>
        )}
        <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={onClose}>
          Tutup
        </button>
      </div>
    </div>
  );
}

// Kasbon Kenal Wajah (PRD 10.3) — kamera depan beneran dibuka, face-api.js (tiny face detector,
// jalan di browser) ekstrak descriptor wajah, dicocokkan ke pelanggan yang sudah didaftarkan
// fotonya (lewat POST /api/wajah/identifikasi, cosine similarity di backend). Auto nyoba tiap
// ~1.2 detik selagi kamera nyala — nggak perlu tap tombol, sesuai niatnya "otomatis" di PRD.
const MAKS_PERCOBAAN_WAJAH = 10;
const BATAS_CARI_WAJAH_MS = 20000; // lewat segini (& udah >= 3 percobaan) -> tampilkan 'nggak ketemu'

const KUNCI_KAMERA_WAJAH = 'warungpintar_kamera_wajah';

function SheetWajah({ onClose, onTambahBaru }) {
  const { S, setPelangganTerpilih, toast, dispatch, openLunas, refreshData } = useApp();
  const [state, setState] = useState('memuat'); // memuat | menyiapkan | mencari | hasil | tidak-ketemu | pilih | error
  const [match, setMatch] = useState(null); // { pelanggan, totalUtang, jarak, templateBelanjaan, descriptor }
  const [wajahKedeteksi, setWajahKedeteksi] = useState(null); // null = belum dicoba, true/false = frame terakhir
  // Kamera depan (pembeli ngadep HP) atau belakang (HP diarahin ke pembeli, kamera belakang biasanya lebih tajam).
  // Pilihan terakhir diingat di HP ini.
  const [arahKamera, setArahKamera] = useState(() => {
    try {
      return localStorage.getItem(KUNCI_KAMERA_WAJAH) === 'environment' ? 'environment' : 'user';
    } catch {
      return 'user';
    }
  });
  const [bisaGantiKamera, setBisaGantiKamera] = useState(true); // disembunyiin kalau perangkat cuma punya 1 kamera
  const namaKamera = arahKamera === 'user' ? 'depan' : 'belakang';

  useEffect(() => {
    navigator.mediaDevices
      ?.enumerateDevices?.()
      .then((d) => setBisaGantiKamera(d.filter((x) => x.kind === 'videoinput').length !== 1))
      .catch(() => {});
  }, []);

  const gantiKamera = () => {
    const baru = arahKamera === 'user' ? 'environment' : 'user';
    setArahKamera(baru);
    try {
      localStorage.setItem(KUNCI_KAMERA_WAJAH, baru);
    } catch {
      /* mode privat - cuma nggak keinget */
    }
  };
  const [bayarSebagian, setBayarSebagian] = useState(false);
  const [jumlahCustom, setJumlahCustom] = useState('');
  const [percobaanWajah, setPercobaanWajah] = useState(0); // ditampilkan biar kelihatan masih jalan, bukan nyangkut
  // Wajah terakhir yang kebaca (rata-rata beberapa frame) - dipakai buat "Ini pelanggan lama": pemilik milih namanya,
  // wajah ini disimpen jadi sampel orang itu. Dulu wajah cuma dipelajari kalau UDAH kekenal, jadi pelanggan yang dari
  // awal nggak kekenal (foto daftar beda kamera/cahaya) nggak pernah dapet kesempatan belajar sama sekali.
  const wajahTerakhirRef = useRef(null);
  const [cariNama, setCariNama] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const bayarUtang = (jumlah) => {
    openLunas(
      `${match.pelanggan.nama} bayar utang`,
      `Bayar <b style="color:var(--ink)">${rupiah(jumlah)}</b> dari total utang ${rupiah(match.totalUtang)}?`,
      (metode) => {
        dispatch({ type: 'BAYAR_UTANG_PELANGGAN', pelangganId: match.pelanggan.id, jumlah, metode });
        pelajariWajah();
        toast(jumlah >= match.totalUtang ? 'Utang lunas' : `Sisa utang ${rupiah(match.totalUtang - jumlah)}`);
        onClose();
      }
    );
  };

  // Wajah yang barusan DIKONFIRMASI pemilik ("Ya, pakai nama dia" / bayar utang) disimpen jadi sampel tambahan
  // orang itu - makin sering dikenali, makin kenal sama kamera & cahaya warung sendiri. "Bukan dia" nggak nyimpen apa-apa.
  const pelajariWajah = () => {
    if (match?.descriptor) api.wajah.daftarkan(match.pelanggan.id, match.descriptor).catch(() => {});
  };

  // Pemilik nunjuk sendiri ini siapa (wajahnya nggak kekenal / Mang AI salah orang) -> wajah yang barusan kebaca
  // disimpen jadi sampel orang itu, terus dia langsung dipilih jadi pembeli.
  const pilihPelangganManual = (p) => {
    const d = wajahTerakhirRef.current;
    if (d) api.wajah.daftarkan(p.id, d).then(() => refreshData()).catch(() => {});
    setPelangganTerpilih({ id: p.id, nama: p.nama, wa: p.wa, foto: p.foto || null });
    toast(d ? `Wajah ${escapeHtml(p.nama)} dipelajari - besok lebih gampang kenal` : `Pembeli: ${escapeHtml(p.nama)}`);
    onClose();
  };
  const hasilCari = S.pelanggan
    .filter((p) => !cariNama.trim() || p.nama.toLowerCase().includes(cariNama.trim().toLowerCase()))
    .slice(0, 8);

  useEffect(() => {
    let batal = false;
    let percobaan = 0;
    let timer;
    let mulaiCari = Date.now();
    // Descriptor beberapa frame dirata-rata sebelum dicocokkan (lihat lib/sampelWajah.js) - satu frame sendirian
    // terlalu berisik, dulu bikin wajah yang jelas & terang sering nggak kekenal.
    const pengumpul = buatPengumpulSampel();

    const cobaKenali = async () => {
      if (batal) return;
      percobaan++;
      const mulai = performance.now();
      try {
        // `cepat: true` - sumbernya video yang di-loop, bukan foto sekali jepret (lihat
        // penjelasan panjangnya di lib/wajah.js). Frame berikutnya toh dateng lagi sebentar lagi.
        const descriptor = await ambilDeskriptorWajah(videoRef.current, { cepat: true });
        if (batal) return;
        setWajahKedeteksi(Boolean(descriptor));
        if (descriptor) {
          const { rata, jumlah } = pengumpul.tambah(descriptor);
          wajahTerakhirRef.current = rata;
          const hasil = await api.wajah.identifikasi(rata);
          if (batal) return;
          if (layakDitampilkan(hasil, jumlah)) {
            setMatch({ ...hasil, descriptor: rata });
            setState('hasil');
            return;
          }
          // Aplikasi masih versi lama padahal server udah baru - nggak bakal pernah kenal siapa pun.
          if (hasil.perluUpdate) {
            toast('Aplikasi perlu diperbarui - tutup lalu buka lagi aplikasinya');
            onClose();
            return;
          }
        } else {
          pengumpul.reset();
        }
      } catch (e) {
        // model gagal DIMUAT (timeout/koneksi) - bukan soal "wajah belum kedeteksi di frame ini".
        // Nggak ada gunanya ngulang 10x nunggu 25 detik tiap kali (bisa berujung nunggu ~4 menit
        // buat akhirnya nyerah) - langsung kasih tau & berenti di percobaan pertama yang gagal gini.
        if (e.message?.includes('model')) {
          if (!batal) {
            toast(escapeHtml(e.message));
            onClose();
          }
          return;
        }
        /* selain itu: frame gagal diproses / belum ada wajah kedeteksi — coba lagi di percobaan berikutnya */
      }
      if (batal) return;
      // Nyerah berdasar WAKTU juga, bukan cuma jumlah percobaan. Di HP lambat 1 deteksi bisa ~2 detik,
      // jadi 10 percobaan = ~30 detik nyangkut di "Mengenali wajah..." tanpa tanda apa-apa - itu yang
      // kerasa "ngestack". Minimal 3 percobaan biar HP lambat tetap dapet kesempatan.
      if (percobaan >= MAKS_PERCOBAAN_WAJAH || (percobaan >= 3 && Date.now() - mulaiCari >= BATAS_CARI_WAJAH_MS)) {
        setState('tidak-ketemu');
      } else {
        // Jeda minimal 2x lama deteksi barusan (paling cepat 700ms). Diukur: 1 deteksi face-api
        // makan ~2,2 detik di CPU yang dilambatin kayak HP kelas menengah - SAMA AJA di 1920x1080
        // maupun 320x180, karena face-api ngecilin gambarnya sendiri. Dulu jedanya tetap 700ms, jadi
        // deteksi berikutnya langsung nyambung & layar macet 66% selama sheet kebuka. Sekarang HP
        // lambat otomatis dapet jeda lebih panjang, main thread-nya kebagian napas buat gambar layar.
        const lama = performance.now() - mulai;
        setPercobaanWajah(percobaan);
        // Lagi nunggu konfirmasi frame kedua - dipercepat, orangnya masih di depan kamera.
        timer = setTimeout(cobaKenali, pengumpul.jumlah ? Math.max(300, lama) : Math.max(700, lama * 2));
      }
    };

    (async () => {
      try {
        setState('memuat');
        setWajahKedeteksi(null);
        setPercobaanWajah(0);
        // Model dipanasin BARENGAN sama proses buka kamera, bukan setelahnya - dua-duanya makan
        // waktu & nggak saling nunggu, jadi jalanin paralel. Nggak di-await di sini; kalau belum
        // kelar pas cobaKenali jalan, dia bakal nunggu sendiri lewat muatModelWajah() di dalam.
        panaskanModelWajah();
        const stream = await bukaKamera(arahKamera); // ganti kamera = efek ini jalan ulang (lihat deps di bawah)
        if (batal) {
          tutupKamera(stream);
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        // Pelanggan yang data wajahnya masih model lama dihitung ulang dulu dari fotonya (sekali doang
        // seumur data) - kalau nggak, orang itu nggak bakal pernah kekenal di pencarian bawah.
        if (S.pelanggan.some(perluPerbaruiWajah)) {
          setState('menyiapkan');
          if ((await perbaruiWajahLama(S.pelanggan)) > 0) refreshData();
          if (batal) return;
        }
        setState('mencari');
        mulaiCari = Date.now();
        timer = setTimeout(cobaKenali, 600);
      } catch (e) {
        toast(e.message ? escapeHtml(e.message) : `Gagal membuka kamera ${arahKamera === 'user' ? 'depan' : 'belakang'}`);
        setState('error');
      }
    })();

    return () => {
      batal = true;
      clearTimeout(timer);
      tutupKamera(streamRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arahKamera]);

  return (
    <div className="sheet tengah show">
      <div className="panel mid">
        <div
          className={'viewfinder' + (state === 'hasil' || state === 'tidak-ketemu' || state === 'error' || state === 'pilih' ? ' diam' : '')}
          style={state === 'pilih' ? { display: 'none' } : undefined}
        >
          <div className="frame" />
          {state !== 'error' && (
            // Kamera depan ditampilin kayak cermin (biar nggak bingung pas geser), deteksinya tetap pakai gambar asli.
            <video
              ref={videoRef}
              muted
              playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: arahKamera === 'user' ? 'scaleX(-1)' : undefined }}
            />
          )}
          {bisaGantiKamera && state !== 'hasil' && (
            <button type="button" className="kamera-ganti" onClick={gantiKamera} aria-label={`Ganti ke kamera ${arahKamera === 'user' ? 'belakang' : 'depan'}`}>
              <svg viewBox="0 0 24 24">
                <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1-1.6A1.5 1.5 0 0 1 9.8 4.6h4.4a1.5 1.5 0 0 1 1.3.8L16.5 7h2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5Z" />
                <path d="M9 12.2a3 3 0 0 1 5.2-1.9M15 13.8a3 3 0 0 1-5.2 1.9" />
                <path d="M14.4 9v1.5h-1.5M9.6 17v-1.5h1.5" />
              </svg>
            </button>
          )}
        </div>

        {state === 'menyiapkan' && (
          <>
            <h3>Menyiapkan data wajah…</h3>
            <p>Data wajah pelanggan lama lagi diperbarui dari fotonya. Cuma sekali ini aja.</p>
          </>
        )}
        {(state === 'memuat' || state === 'mencari') && (
          <>
            <h3>Mengenali wajah…</h3>
            {/* Nomor percobaan ditampilkan biar kelihatan masih jalan - di HP lambat tiap percobaan bisa
                beberapa detik, dan layar yang diem tanpa perubahan kerasa kayak nyangkut. */}
            <p>
              {/* Bedain "wajahnya belum kelihatan" (arahin ulang kameranya) sama "wajahnya udah kelihatan, lagi dicocokin"
                  (tunggu sebentar) - dulu dua-duanya sama-sama "Arahkan kamera", jadi nggak jelas harus ngapain. */}
              {state !== 'mencari' || wajahKedeteksi === null
                ? arahKamera === 'user'
                  ? 'Arahkan kamera depan ke pembeli'
                  : 'Arahkan kamera belakang ke wajah pembeli'
                : wajahKedeteksi
                  ? 'Wajah kedeteksi, lagi dicocokkan…'
                  : 'Wajah belum kelihatan jelas - hadap ke kamera, agak dekat, jangan ketutup'}
              {state === 'mencari' && percobaanWajah > 0 ? ` \u00b7 percobaan ${percobaanWajah + 1}` : ''}
            </p>
          </>
        )}
        {state === 'error' && (
          <>
            <h3>Kamera {namaKamera} nggak bisa dibuka</h3>
            <p>Coba lagi, atau pilih manual lewat daftar pelanggan.</p>
          </>
        )}
        {state === 'tidak-ketemu' && (
          <>
            <h3>Wajah belum dikenali</h3>
            <p>
              {wajahTerakhirRef.current
                ? 'Wajahnya kebaca tapi belum ketemu yang cocok. Kalau dia pelanggan lama, pilih namanya - Mang AI jadi kenal wajahnya.'
                : 'Wajahnya belum kebaca jelas - hadap ke kamera, agak dekat & terang, lalu coba lagi.'}
            </p>
            {wajahTerakhirRef.current && S.pelanggan.length > 0 && (
              <button className="btn utama" style={{ width: '100%', marginTop: 10 }} onClick={() => setState('pilih')}>
                Ini pelanggan lama - pilih namanya
              </button>
            )}
            <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={onTambahBaru}>
              + Tambahkan pelanggan baru
            </button>
          </>
        )}
        {state === 'pilih' && (
          <>
            <h3>Ini siapa?</h3>
            <p>Wajah yang barusan kebaca disimpen ke pelanggan yang kamu pilih.</p>
            <div className="field" style={{ textAlign: 'left' }}>
              <input value={cariNama} onChange={(e) => setCariNama(e.target.value)} placeholder="Cari nama pelanggan" autoFocus />
            </div>
            <div className="pilih-wajah">
              {hasilCari.map((p) => (
                <button key={p.id} className="pilih-wajah-baris" onClick={() => pilihPelangganManual(p)}>
                  <span className="ava">{p.foto ? <img src={p.foto} alt="" /> : inisial(p.nama)}</span>
                  <span>{p.nama}</span>
                </button>
              ))}
              {!hasilCari.length && <p style={{ margin: '8px 0' }}>Nggak ada nama yang cocok.</p>}
            </div>
          </>
        )}
        {state === 'hasil' && match && (
          <>
            {match.pelanggan.foto && (
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                <div className="ava" style={{ width: 90, height: 90, borderRadius: 28 }}>
                  <img src={match.pelanggan.foto} alt="" />
                </div>
              </div>
            )}
            <h3>Ini {match.pelanggan.nama}?</h3>
            <p
              dangerouslySetInnerHTML={{
                __html: match.totalUtang
                  ? `Utang belum lunas: <b style="color:var(--ink)">${rupiah(match.totalUtang)}</b>`
                  : 'Tidak punya utang.',
              }}
            />
            {match.templateBelanjaan?.length > 0 && (
              <p style={{ fontSize: 13 }}>Biasa beli: {match.templateBelanjaan.map((t) => t.nama_produk).join(', ')}</p>
            )}

            {match.totalUtang > 0 && (
              <>
                <button className="btn utama" style={{ width: '100%', marginTop: 16 }} onClick={() => bayarUtang(match.totalUtang)}>
                  Lunasi {rupiah(match.totalUtang)}
                </button>
                {!bayarSebagian ? (
                  <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={() => setBayarSebagian(true)}>
                    Bayar sebagian
                  </button>
                ) : (
                  <div className="field" style={{ marginTop: 10, textAlign: 'left' }}>
                    <label>Jumlah bayar sekarang</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      autoFocus
                      placeholder={`maks ${match.totalUtang}`}
                      value={jumlahCustom}
                      onChange={(e) => setJumlahCustom(e.target.value)}
                    />
                    <button
                      className="btn utama"
                      style={{ width: '100%', marginTop: 8 }}
                      onClick={() => {
                        const j = Math.floor(Number(jumlahCustom));
                        if (!j || j <= 0) return toast('Isi jumlahnya dulu');
                        if (j > match.totalUtang) return toast('Nggak boleh lebih dari total utang');
                        bayarUtang(j);
                      }}
                    >
                      Bayar sekarang
                    </button>
                  </div>
                )}
              </>
            )}

            <button
              className="btn"
              style={{ width: '100%', marginTop: 10 }}
              onClick={() => {
                // Foto dibawa - dulu dipaksa null, jadi chip pembeli di Catat nampilin inisial walau pelanggannya punya foto.
                setPelangganTerpilih({ id: match.pelanggan.id, nama: match.pelanggan.nama, wa: match.pelanggan.wa, foto: match.pelanggan.foto || null });
                pelajariWajah();
                onClose();
              }}
            >
              Ya, pakai nama dia (belanja baru)
            </button>
            <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={onTambahBaru}>
              + Tambahkan pelanggan baru
            </button>
            <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={() => setState('pilih')}>
              Bukan dia - pilih yang bener
            </button>
          </>
        )}
        {(state === 'memuat' || state === 'menyiapkan' || state === 'mencari' || state === 'error' || state === 'tidak-ketemu' || state === 'pilih') && (
          <button className="btn" style={{ width: '100%', marginTop: 12 }} onClick={onClose}>
            Tutup
          </button>
        )}
      </div>
    </div>
  );
}

function SheetSiapaKasbon({ onClose, onPilih }) {
  const { S, toast } = useApp();
  const [namaBaru, setNamaBaru] = useState('');
  const [foto, setFoto] = useState(null);
  const [descriptor, setDescriptor] = useState(null);
  const [statusWajah, setStatusWajah] = useState(null); // null | 'mengecek' | 'oke' | 'gagal'
  const [loading, setLoading] = useState(false);

  const ambilFoto = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = async () => {
      setDescriptor(null);
      setStatusWajah('mengecek');
      try {
        // foto dari app kamera NATIVE HP (bukan video-stream) - bisa beneran 3-8MB di resolusi
        // asli. Dikecilin dulu SEBELUM disimpen/dipakai, ini yang bakal ikut ke-upload jadi
        // fotoUrl pelanggan - 800px lebih dari cukup jelas buat deteksi wajah & tampilan.
        const dataUrl = await keWebp(r.result, 800);
        setFoto(dataUrl);
        const img = await gambarDariDataUrl(dataUrl);
        const d = await ambilDeskriptorWajah(img);
        setDescriptor(d);
        setStatusWajah(d ? 'oke' : 'gagal');
      } catch {
        setStatusWajah('gagal');
      }
    };
    r.readAsDataURL(f);
  };

  // Nama baru di sini dulu cuma teks nempel ke transaksi doang (pelanggan_id kosong) — orangnya
  // nggak pernah punya identitas permanen, jadi nggak ketangkep Kenal Wajah & rawan dobel-catat
  // gara-gara typo nama beda dikit. Sekarang beneran dibikinin data pelanggan (nama + foto
  // OPSIONAL — boleh dilewatin, terutama buat yang nggak nyaman difoto gara-gara lagi ngutang),
  // baru abis itu langsung lanjut catat kasbonnya — nggak ada langkah "siapa yang kasbon" lagi
  // sesudahnya, sama kayak kalau milih nama yang udah ada di daftar atas.
  const catatBaru = async () => {
    const n = namaBaru.trim();
    if (!n) return;
    setLoading(true);
    try {
      const pelanggan = await api.pelanggan.tambah({ nama: n, fotoUrl: foto });
      if (descriptor) await api.wajah.daftarkan(pelanggan.id, descriptor);
      onPilih(pelanggan.nama, pelanggan.id);
    } catch (e) {
      toast(e.message ? escapeHtml(e.message) : 'Gagal mencatat pelanggan baru');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sheet show">
      <div className="panel">
        <h3>Siapa yang kasbon?</h3>
        <p>Pilih dulu namanya supaya utangnya tidak tertukar.</p>
        <div className="daftar-geser">
          {S.pelanggan.length === 0 && <div className="kosong">Belum ada pelanggan terdaftar</div>}
          {S.pelanggan.map((p) => {
            const utang = S.kasbon.filter((k) => !k.lunas && k.nama === p.nama).reduce((a, b) => a + b.jml, 0);
            return (
              <button key={p.id} className="pilih" onClick={() => onPilih(p.nama, p.id)}>
                <div className="bulat">{p.foto ? <img src={p.foto} alt="" /> : inisial(p.nama)}</div>
                <div>
                  <div className="nama">{p.nama}</div>
                  <div className="tgl">{utang ? 'Utang lama ' + rupiah(utang) : 'Tidak punya utang'}</div>
                </div>
              </button>
            );
          })}
        </div>
        <div className="field">
          <label>Atau catat orang baru</label>
          <input value={namaBaru} onChange={(e) => setNamaBaru(e.target.value)} placeholder="Contoh: Bu Rina" />
        </div>
        {namaBaru.trim() && (
          <>
            {foto && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
                <div className="ava" style={{ width: 90, height: 90, borderRadius: 28, fontSize: 28 }}>
                  <img src={foto} alt="" />
                </div>
              </div>
            )}
            <label className="btn" style={{ width: '100%', marginTop: 8, display: 'block', textAlign: 'center' }}>
              <CameraIcon /> {foto ? 'Ganti foto wajah' : 'Ambil foto wajah (opsional)'}
              <input type="file" accept="image/*" capture="user" style={{ display: 'none' }} onChange={ambilFoto} />
            </label>
            {!foto && (
              <p className="p-sub" style={{ textAlign: 'center', marginTop: 6, fontSize: 13 }}>
                Boleh dilewati - kasbonnya tetap kecatat, cuma kenal wajah nggak jalan buat orang ini.
              </p>
            )}
            {statusWajah === 'mengecek' && (
              <p className="p-sub" style={{ textAlign: 'center', marginTop: 6 }}>
                Mengecek wajahnya…
              </p>
            )}
            {statusWajah === 'oke' && (
              <p className="p-sub" style={{ textAlign: 'center', marginTop: 6, color: 'var(--ink)', fontWeight: 700 }}>
                ✓ Wajah kedeteksi jelas
              </p>
            )}
            {statusWajah === 'gagal' && (
              <p className="p-sub" style={{ textAlign: 'center', marginTop: 6, color: '#e5484d', fontWeight: 700 }}>
                ⚠ Wajah nggak kedeteksi - coba foto ulang, atau lanjut tanpa foto
              </p>
            )}
          </>
        )}
        <button
          className="btn utama"
          style={{ width: '100%', marginTop: 14 }}
          onClick={catatBaru}
          disabled={!namaBaru.trim() || loading}
        >
          {loading ? 'Menyimpan…' : 'Catat kasbon nama baru'}
        </button>
        <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={onClose}>
          Batal
        </button>
      </div>
    </div>
  );
}


// Isi target setoran. Disediain tombol nominal yang sering kepake biar pemilik warung nggak perlu
// ngetik nol banyak-banyak di HP - "100rb" itu 6 digit yang gampang kelebihan/kurang satu nol.
function SheetTarget({ awal, onSimpan, onClose }) {
  const [nilai, setNilai] = useState(awal ? String(awal) : '');
  const cepat = [50000, 100000, 200000, 500000, 1000000];
  return (
    <div className="sheet show">
      <div className="panel">
        <h3>Target setoran</h3>
        <p>
          Target jualan buat hari ini. Dipakai buat nyocokin isi laci sama barang yang kejual, dan
          ikut kegambar di grafik Laporan biar kelihatan hari mana yang kekejar dan mana yang nggak.
          Tersimpan otomatis - nggak ilang walau aplikasinya ditutup.
        </p>
        <div className="field">
          <label>Target (Rp)</label>
          <input type="number" inputMode="numeric" value={nilai} onChange={(e) => setNilai(e.target.value)} placeholder="100000" />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
          {cepat.map((n) => (
            <button key={n} className="btn kecil" style={{ width: 'auto', flex: '0 0 auto' }} onClick={() => setNilai(String(n))}>
              {rupiah(n)}
            </button>
          ))}
        </div>
        <button className="btn utama" style={{ width: '100%', marginTop: 18 }} onClick={() => onSimpan(Math.max(0, Number(nilai) || 0))}>
          Pasang target
        </button>
        {awal > 0 && (
          <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={() => onSimpan(0)}>
            Hapus target
          </button>
        )}
        <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={onClose}>
          Batal
        </button>
      </div>
    </div>
  );
}
