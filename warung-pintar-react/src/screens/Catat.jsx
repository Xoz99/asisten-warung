import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { ProductIcon, CameraIcon } from '../lib/icons.jsx';
import { parseUcapan } from '../lib/voice';
import { rupiah, inisial, escapeHtml } from '../lib/format';
import { api } from '../lib/api';
import { bukaKamera, tutupKamera, jepretFrame, keWebp } from '../lib/kamera';
import { muatModelVisual, ambilEmbedding } from '../lib/visualScan';
import { mulaiScanBarcode } from '../lib/barcodeScan';
import { ambilDeskriptorWajah, gambarDariDataUrl, panaskanModelWajah } from '../lib/wajah';
import SheetStruk from '../components/SheetStruk.jsx';

// Instance SpeechRecognition yang lagi AKTIF saat ini, kalau ada — sengaja modul-level (di luar
// komponen React), bukan state/ref biasa, biar tetap "keinget" lintas mount/unmount SheetVoice.
// Ini buat nyegah race pas tombol "Sebut barang" di-klik cepet berulang ("spam"): kalau sesi
// SpeechRecognition sebelumnya belum SEMPET dilepas beneran (teardown-nya async, nggak instan)
// pas yang baru langsung dicoba di-start(), browser (terutama Android Chrome) bisa nolak dengan
// error "recognition already started" — dan tanpa penanganan, error itu ke-swallow diem-diem,
// bikin sheet kebuka tapi speech-nya nggak pernah beneran jalan.
let recAktifSaatIni = null;

// Semua browser di iOS/iPadOS (Safari, Chrome, dst) WAJIB pakai mesin WebKit-nya Apple (kebijakan
// App Store) — jadi bug/keterbatasan WebKit soal ini kena ke SEMUANYA, bukan cuma Safari doang.
// Dipakai buat nampilin catatan kecil di bawah, biar user iOS gak ngira aplikasinya diam-diam
// masih ngerekam pas titik oranye status-bar-nya nyala sesaat lebih lama dari harusnya.
function perangkatIOS() {
  if (typeof navigator === 'undefined') return false;
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;
  // iPadOS 13+ nyamar jadi "Mac" di user-agent, dibedain dari Mac beneran lewat touch support.
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

// Matiin sesi SpeechRecognition SETEGAS mungkin — dipanggil di SEMUA titik "user/sistem beneran
// udah selesai" (Batal, Masukkan ke keranjang, pilih varian, timeout, error). .stop() dipanggil
// DULUAN (minta berhenti secara "baik-baik", ngasih browser kesempatan beresin sesi audio-nya
// sendiri) baru .abort() (paksa putus) - beberapa laporan Android Chrome nunjukkin .abort() doang
// kadang nggak langsung ngelepas indikator mic/mic-nya sendiri (delay/nyangkut), dua-duanya
// dipanggil bareng buat jaga-jaga. Diulang lagi 300ms kemudian (retry) — di Safari/WebKit iOS ada
// laporan abort() pertama kadang gak nempel kalau dipanggil pas sesi audio internalnya masih
// "baru banget" kesetup, panggilan kedua ini jaring pengaman ekstra buat kasus itu.
function matikanMic(target) {
  if (!target || target === 'tidak-didukung') return;
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

  const produkSeringPagi = (idSeringPagi?.length ? idSeringPagi.map((id) => produkById[id]).filter(Boolean) : null) || S.produk.slice(0, 6);

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
      setTarget(0); // target itu alat bantu buat SATU sesi pencocokan - jangan kebawa ke transaksi berikutnya
      setStrukData({ waktu: new Date().toISOString(), total: totalCart, items: itemsTxt(items), pembeli, metode, oleh: S.penjagaAktif || '—' });
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
    openOk('Kasbon dicatat', `${rupiah(totalCart)} atas nama <b>${escapeHtml(namaPembeli)}</b>. Dicatat oleh ${escapeHtml(S.penjagaAktif) || '—'}.`);
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
          {target > 0 ? 'Sudah terkumpul' : 'Total belanja pembeli'}
          <button
            className="linkkecil"
            style={{ marginLeft: 8, display: 'inline', width: 'auto' }}
            onClick={() => setTargetOpen(true)}
          >
            {target > 0 ? 'ubah target' : 'pasang target'}
          </button>
        </p>
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
                  width: Math.min(100, (totalCart / target) * 100) + '%',
                  background: totalCart > target ? '#e5484d' : totalCart === target ? '#4ade80' : 'var(--brand)',
                  transition: 'width .2s',
                }}
              />
            </div>
            <p className="t" style={{ marginTop: 8 }}>
              {totalCart === target ? (
                <>Pas dengan target {rupiah(target)} ✓</>
              ) : totalCart > target ? (
                <>Lebih {rupiah(totalCart - target)} dari target {rupiah(target)}</>
              ) : (
                <>Kurang {rupiah(target - totalCart)} dari target {rupiah(target)}</>
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
        {cartIds.length === 0 && <div className="kosong">Belum ada barang.<br />Tekan 🎙️ dan sebutkan barangnya</div>}
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
            {p.nama.split(' ')[0]}
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
              <button key={row.item.id} className="hasil" onClick={() => pilihDariHasil(row.item)}>
                <ProductIcon id={row.item.id} foto={row.item.foto} />
                <div>
                  <div className="nama">{row.item.nama}</div>
                  <div className="tgl">
                    {rupiah(row.item.harga)} · sisa {row.item.stok}
                  </div>
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
                    <div className="tgl">{row.items.length} varian — pilih ukuran/jenisnya</div>
                  </div>
                  <span className="mirip">{grupTerbuka === row.grup ? '▲' : '▼'}</span>
                </button>
                {grupTerbuka === row.grup && (
                  <div style={{ paddingLeft: 16 }}>
                    {row.items.map((p) => (
                      <button key={p.id} className="hasil" style={{ marginTop: 6 }} onClick={() => pilihDariHasil(p)}>
                        <ProductIcon id={p.id} foto={p.foto} />
                        <div>
                          <div className="nama">{p.nama}</div>
                          <div className="tgl">
                            {rupiah(p.harga)} · sisa {p.stok}
                          </div>
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
  const { S, tambah, totalCart, toast } = useApp();
  const [step, setStep] = useState('dengar'); // dengar | teks | tidak-didukung | memproses-ai | pilih-varian
  const [teks, setTeks] = useState('');
  const [ngomong, setNgomong] = useState(false); // true selagi speech recognition-nya deteksi ada suara masuk
  const [batang, setBatang] = useState([1, 1, 1, 1, 1, 1, 1]); // scaleY tiap batang wave, diacak biar keliatan "ngikutin" ngomong
  const [antrianAmbigu, setAntrianAmbigu] = useState([]); // entri yang variannya belum jelas (mis. "aqua" tanpa sebut ukuran), ditanyain satu-satu
  const recRef = useRef(null);
  const diIOS = perangkatIOS();

  // SpeechRecognition TIDAK ngasih data level volume suara asli — cuma event on/off
  // (onspeechstart/onspeechend). Visualizer amplitudo BENERAN butuh stream mic terpisah
  // (getUserMedia+AnalyserNode), yang UDAH DICOBA sebelumnya (lihat komentar di bawah) dan
  // kebukti bikin speech recognition-nya sendiri mati di banyak HP Android (2 konsumen mic
  // bersamaan saling rebutan akses). Jalan tengahnya di sini: acak-acak tinggi tiap batang
  // sesering mungkin SELAMA ngomong true — bukan amplitudo asli, tapi keliatan "hidup"/nyambung
  // sama omongan tanpa nyentuh mic sama sekali (nggak ada risiko konflik).
  useEffect(() => {
    if (!ngomong) {
      setBatang([1, 1, 1, 1, 1, 1, 1]);
      return;
    }
    const iv = setInterval(() => {
      setBatang(Array.from({ length: 7 }, () => 0.6 + Math.random() * 1.6));
    }, 110);
    return () => clearInterval(iv);
  }, [ngomong]);

  useEffect(() => {
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
        toast('Akses mikrofon ditolak — izinkan dulu lewat pengaturan browser');
      } else if (e.error !== 'aborted') {
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
          toast(`🤖 ${hasilAi.length} jenis barang (dibantu AI) — <b>${rupiah(totalCart + tambahan)}</b>`);
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
      toast(`${pasti.length} jenis barang masuk — <b>${rupiah(totalCart + tambahan)}</b>`);
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
                Titik oranye di pojok atas kadang tetap nyala sesaat setelah ini ditutup — itu
                batasan Safari/iOS ngelepas mic, bukan aplikasi ini yang diam-diam masih merekam.
              </p>
            )}
          </>
        )}
        {step === 'tidak-didukung' && (
          <>
            <h3>Browser ini belum dukung dengar suara</h3>
            <p>Fitur ini pakai Web Speech API — coba pakai Chrome/Edge, atau ketik manual dulu ya.</p>
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
              Nggak nyebut ukuran/variannya — pilih salah satu ({antrianAmbigu[0].q}×)
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
      setHasil([{ produk: p, skor: 1 }]);
      setSumberHasil('barcode');
      setStatus('hasil');
    } catch (e) {
      // 404 (barang belum terdaftar) ATAU error jaringan/server — dua-duanya sama-sama JANGAN
      // nginterupsi kasir yang lagi transaksi (beda konteks sama menu Stok yang emang niatnya
      // ngedaftarin barang baru). Kasih tau doang & lanjut scan lagi.
      toast(e.status === 404 ? 'Barcode ini belum terdaftar — daftarin dulu lewat menu Stok' : e.message ? escapeHtml(e.message) : 'Gagal mencari barang dari barcode');
      if (!matiRef.current) mulaiBarcode();
    }
  };

  useEffect(() => {
    let batal = false;
    (async () => {
      try {
        // Model AI & buka kamera itu 2 proses independen yang nggak saling butuh - dulu
        // ditunggu satu-satu (numpuk waktunya, jadi kerasa lama). Sekarang dijalanin BARENGAN
        // pakai Promise.all, totalnya cuma nunggu yang paling lama di antara keduanya.
        const [stream] = await Promise.all([bukaKamera('environment'), muatModelVisual()]);
        if (batal) {
          tutupKamera(stream);
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        mulaiBarcode();
        setStatus('siap');
      } catch (e) {
        setErrorMsg(e.message || 'Gagal menyiapkan kamera/model');
        setStatus('error');
      }
    })();
    return () => {
      batal = true;
      matiRef.current = true;
      controlsRef.current?.stop();
      tutupKamera(streamRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const jepret = async () => {
    controlsRef.current?.stop(); // jeda scan barcode selagi lagi proses cocokin foto, biar gak dobel
    setFotoJepretan(jepretFrame(videoRef.current)); // biar keliatan apa yang barusan difoto
    setStatus('memindai');
    try {
      const embedding = await ambilEmbedding(videoRef.current);
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
        toast('AI nggak nemu barang yang yakin dikenali — coba foto ulang lebih jelas, atau satu-satu aja');
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
    toast(`${hasilBanyak.length} barang ditambahin — total <b>${rupiah(total)}</b>`);
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
          {/* video TETAP dimount biar stream & loop scan barcode-nya gak pernah putus — kalau
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
            <p style={{ textAlign: 'center' }}>Sebentar, lagi muat model pengenal barang</p>
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
            <p style={{ textAlign: 'center' }}>Ada barcode-nya kebaca otomatis — kalau nggak ada/nggak kebaca, tahan sebentar biar jelas terus tap tombol di bawah</p>
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
                        <div className="tgl">{row.items.length} varian mirip — pilih ukuran/jenisnya</div>
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
            <h3 style={{ textAlign: 'center' }}>🤖 {hasilBanyak.length} barang dikenali AI</h3>
            <p style={{ textAlign: 'center' }}>Cek dulu — hapus yang salah/nggak sesuai, baru tambahin semua ke keranjang</p>
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
            <button className="btn utama brand" style={{ width: '100%', marginTop: 16 }} onClick={jepret}>
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

function SheetWajah({ onClose, onTambahBaru }) {
  const { setPelangganTerpilih, toast, dispatch, openLunas } = useApp();
  const [state, setState] = useState('memuat'); // memuat | mencari | hasil | tidak-ketemu | error
  const [match, setMatch] = useState(null); // { pelanggan, totalUtang, skor, templateBelanjaan }
  const [bayarSebagian, setBayarSebagian] = useState(false);
  const [jumlahCustom, setJumlahCustom] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const bayarUtang = (jumlah) => {
    openLunas(
      `${match.pelanggan.nama} bayar utang`,
      `Bayar <b style="color:var(--ink)">${rupiah(jumlah)}</b> dari total utang ${rupiah(match.totalUtang)}?`,
      (metode) => {
        dispatch({ type: 'BAYAR_UTANG_PELANGGAN', pelangganId: match.pelanggan.id, jumlah, metode });
        toast(jumlah >= match.totalUtang ? 'Utang lunas' : `Sisa utang ${rupiah(match.totalUtang - jumlah)}`);
        onClose();
      }
    );
  };

  useEffect(() => {
    let batal = false;
    let percobaan = 0;
    let timer;

    const cobaKenali = async () => {
      if (batal) return;
      percobaan++;
      try {
        // `cepat: true` - sumbernya video yang di-loop, bukan foto sekali jepret (lihat
        // penjelasan panjangnya di lib/wajah.js). Frame berikutnya toh dateng lagi sebentar lagi.
        const descriptor = await ambilDeskriptorWajah(videoRef.current, { cepat: true });
        if (batal) return;
        if (descriptor) {
          const hasil = await api.wajah.identifikasi(descriptor);
          if (batal) return;
          if (hasil.cocok) {
            setMatch(hasil);
            setState('hasil');
            return;
          }
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
      if (percobaan >= MAKS_PERCOBAAN_WAJAH) {
        setState('tidak-ketemu');
      } else {
        // 700ms, dulu 1200ms. Bisa dipercepat karena tiap percobaan sekarang cuma 1 inferensi
        // ukuran 320 (dulu 3 inferensi sampai 608) - total kerjaannya tetap jauh lebih ringan
        // dari sebelumnya, tapi wajah kedeteksi lebih cepet & nyerahnya juga nggak kelamaan.
        timer = setTimeout(cobaKenali, 700);
      }
    };

    (async () => {
      try {
        setState('memuat');
        // Model dipanasin BARENGAN sama proses buka kamera, bukan setelahnya - dua-duanya makan
        // waktu & nggak saling nunggu, jadi jalanin paralel. Nggak di-await di sini; kalau belum
        // kelar pas cobaKenali jalan, dia bakal nunggu sendiri lewat muatModelWajah() di dalam.
        panaskanModelWajah();
        const stream = await bukaKamera('user'); // kamera depan
        if (batal) {
          tutupKamera(stream);
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setState('mencari');
        timer = setTimeout(cobaKenali, 600);
      } catch (e) {
        toast(e.message ? escapeHtml(e.message) : 'Gagal membuka kamera depan');
        setState('error');
      }
    })();

    return () => {
      batal = true;
      clearTimeout(timer);
      tutupKamera(streamRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="sheet tengah show">
      <div className="panel mid">
        <div className={'viewfinder' + (state === 'hasil' || state === 'tidak-ketemu' || state === 'error' ? ' diam' : '')}>
          <div className="frame" />
          {state !== 'error' && (
            <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
        </div>

        {(state === 'memuat' || state === 'mencari') && (
          <>
            <h3>Mengenali wajah…</h3>
            <p>Arahkan kamera depan ke pembeli</p>
          </>
        )}
        {state === 'error' && (
          <>
            <h3>Kamera depan nggak bisa dibuka</h3>
            <p>Coba lagi, atau pilih manual lewat daftar pelanggan.</p>
          </>
        )}
        {state === 'tidak-ketemu' && (
          <>
            <h3>Wajah belum dikenali</h3>
            <p>Belum ketemu yang cocok — bisa jadi belum terdaftar, atau fotonya belum kedaftar wajahnya.</p>
            <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={onTambahBaru}>
              + Tambahkan pelanggan baru
            </button>
          </>
        )}
        {state === 'hasil' && match && (
          <>
            <h3>Ini {match.pelanggan.nama}?</h3>
            <p
              dangerouslySetInnerHTML={{
                __html: match.totalUtang
                  ? `Utang belum lunas: <b style="color:var(--ink)">${rupiah(match.totalUtang)}</b>`
                  : `Tidak punya utang. Kecocokan ${Math.round(match.skor * 100)}%.`,
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
                setPelangganTerpilih({ id: match.pelanggan.id, nama: match.pelanggan.nama, wa: match.pelanggan.wa, foto: null });
                onClose();
              }}
            >
              Ya, pakai nama dia (belanja baru)
            </button>
            <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={onTambahBaru}>
              + Tambahkan pelanggan baru
            </button>
            <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={onClose}>
              Bukan dia
            </button>
          </>
        )}
        {(state === 'memuat' || state === 'mencari' || state === 'error' || state === 'tidak-ketemu') && (
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
                Boleh dilewati — kasbonnya tetap kecatat, cuma kenal wajah nggak jalan buat orang ini.
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
                ⚠ Wajah nggak kedeteksi — coba foto ulang, atau lanjut tanpa foto
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
          Buat nyocokin isi laci sama barang yang kejual. Ceklis barangnya sampai totalnya pas —
          stok sama untungnya tetap kehitung bener, beda sama kalau cuma dicatat gelondongan.
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
