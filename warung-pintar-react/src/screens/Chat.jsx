import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { api } from '../lib/api';
import { escapeHtml, rupiah, tglID, jamID, inisial } from '../lib/format';
import { hargaDariMargin, modalDariHarga, MARGIN_DEFAULT } from '../lib/harga';
import { Sheet } from '../components/SharedSheets.jsx';
import { CameraIcon } from '../lib/icons.jsx';
import { bukaKamera, tutupKamera, jepretFrame, keWebp } from '../lib/kamera';
import mangWarungImg from '../assets/mangwarung.webp';

// Balasan Gemini kadang ngandung markdown ringan (**tebal**, baris baru buat paragraf) - di-escape
// dulu (biar aman dari HTML asing), baru **teks** dikonversi jadi <b>, dan baris baru jadi <br>.
const formatBot = (s) => escapeHtml(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');

// Riwayat obrolan Mang AI disimpen di localStorage (bukan server - ini murni percakapan lokal di
// HP, beda dari Komunitas yang emang feed bersama) - dulu cuma state lokal di TanyaAI, jadi ilang
// tiap komponennya di-unmount: pindah ke menu lain terus balik lagi ke Tanya, atau geser ke tab
// Komunitas terus balik ke Mang AI (lihat gimana <Screen> nge-null-in children pas nggak aktif di
// PhoneShell.jsx). localStorage dipilih (bukan IndexedDB kayak lib/localdb.js) karena ini cuma
// preferensi/isi lokal per-HP, sama kayak PREFS_KEY di AppContext.jsx - nggak butuh disinkronkan.
const CHAT_LOG_KEY = 'warungpintar_chat_log_v1';
const CHAT_LOG_MAKS = 60; // batasin biar localStorage-nya nggak numpuk tak terbatas

// Id lokal buat tiap bubble (dipakai sebagai React key, dan nargetin bubble "nota-hasil" tertentu
// pas tombol Terapkan/Batal-nya dipencet - lihat terapkanNota/batalNota) - bukan id dari server,
// cuma biar React & handler-nya bisa nunjuk ke bubble yang tepat di antara bubble lain di log.
let idCounter = 0;
const idBaru = () => `${Date.now()}-${idCounter++}`;

const SAPAAN_AWAL = () => ({ id: idBaru(), who: 'bot', html: 'Pagi. Ada yang mau ditanya soal warung?' });

// Ketik salah satu dari ini (persis, nggak perlu embel-embel) buat bersihin riwayat obrolan Mang AI
// - ditangani LOKAL di client (lihat tanya() di TanyaAI), nggak lewat API sama sekali.
const PERINTAH_RESET = new Set(['reset', 'reset chat', 'reset obrolan', 'mulai ulang', 'mulai ulang obrolan', 'hapus riwayat', 'hapus chat', 'hapus obrolan']);

function muatLogTersimpan() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CHAT_LOG_KEY));
    if (!Array.isArray(parsed) || !parsed.length) return [SAPAAN_AWAL()];
    // Riwayat lama (sebelum bubble tipe foto/nota-hasil ada) belum punya field `id` - dikasih di
    // sini biar tetep aman dipakai sebagai React key & target Terapkan/Batal, bukan cuma pas bubble
    // baru dibikin.
    return parsed.map((b) => (b.id ? b : { ...b, id: idBaru() }));
  } catch {
    return [SAPAAN_AWAL()];
  }
}

// Riwayat obrolan yang dikirim ke Gemini (lihat tanya() di TanyaAI) biar AI-nya "inget" konteks
// beberapa bales-balesan terakhir - dulu tiap pesan dikirim SENDIRIAN tanpa histori, jadi kalau
// user ngomong hal yang nyambung ke pesan sebelumnya (misal "maksudnya X", "iya" doang), AI-nya
// nggak ngerti itu nyambung ke apa. Dibatasi jumlah turn-nya (bukan histori penuh) biar hemat
// token/latensi - model -lite dipilih justru buat cepet & murah (lihat gemini.service.js).
const RIWAYAT_MAKS_TURN = 6;

// Bubble tipe foto/nota-hasil/aksi isinya bukan teks obrolan biasa - diringkas jadi 1 kalimat
// penjelas biar AI tetap "tau" itu pernah kejadian (misal user nanya "udah dicatat belom?" abis
// nge-scan nota, AI bisa jawab bener alih-alih nanya balik nggak nyambung).
function ringkasBubbleUntukRiwayat(b) {
  if (b.type === 'foto') return '(user mengirim foto)';
  if (b.type === 'nota-hasil') {
    const daftar = b.rows.map((r) => `${r.nama} ${r.qty}x @Rp${r.harga}`).join(', ');
    const status = b.status === 'diterapkan' ? 'sudah diterapkan ke stok' : b.status === 'batal' ? 'dibatalkan oleh user' : 'menunggu dikonfirmasi user';
    return `(Mang AI membaca nota, kebaca: ${daftar} - status: ${status})`;
  }
  if (b.type === 'aksi') {
    const status = b.status === 'selesai' ? 'sudah dikonfirmasi & disimpan user' : b.status === 'batal' ? 'dibatalkan user' : 'menunggu dikonfirmasi user';
    // Riwayat ini dikirim balik ke AI sebagai konteks - kalau tipe non-barang ikut dirangkum pakai
    // kalimat "usul <tipe> barang", AI-nya jadi ngira dia lagi ngurusin barang dan ngulang usul
    // tambah barang lagi di giliran berikutnya.
    if (b.aksi?.tipe === 'catat_modal') {
      return `(Mang AI mengusulkan catat modal masuk Rp${b.aksi?.data?.jumlah ?? 0} - status: ${status})`;
    }
    if (b.aksi?.tipe === 'target_penjualan') {
      return `(Mang AI mengusulkan pasang target setoran Rp${b.aksi?.data?.jumlah ?? 0} - status: ${status})`;
    }
    if (b.aksi?.tipe === 'belanja_banyak') {
      const n = (b.aksi?.data?.barang || []).length;
      return `(Mang AI mengusulkan daftar belanja ${n} barang - status: ${status})`;
    }
    const nama = b.aksi?.data?.nama || '(barang tidak disebut namanya)';
    return `(Mang AI mengusulkan ${b.aksi.tipe} barang "${nama}" - status: ${status})`;
  }
  // bubble teks biasa - lepas tag HTML ringan (<b>/<br>, lihat formatBot) jadi teks polos
  return (b.html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/?b>/gi, '').replace(/<[^>]+>/g, '');
}

// Snapshot log JADI riwayat siap kirim - dipanggil SEBELUM pesan user yang baru ditambahin ke log
// (biar nggak dobel sama `teks` yang dikirim terpisah di body request).
function riwayatUntukGemini(log) {
  return log.slice(-RIWAYAT_MAKS_TURN * 2).map((b) => ({ peran: b.who === 'me' ? 'user' : 'model', teks: ringkasBubbleUntukRiwayat(b) }));
}

// Menu "Tanya" — 2 sub-fitur: chatbot AI (Mang Warung, jawab dari data warung sendiri) & Komunitas
// (feed lintas-warung buat sharing harga jual/untung, PRD baru — lihat komentar di Komunitas()).
export default function Chat() {
  const [tab, setTab] = useState('ai'); // ai | komunitas
  return (
    // .chat-page--ai cuma dipakai pas tab Mang AI aktif - ini beda konteks dari Komunitas (feed
    // biasa yang cocok ikut scroll halaman normal, lihat komentar di .chat-page index.css): buat
    // chat, kotak inputnya HARUS nempel di bawah layar terus (nggak ikut kescroll bareng percakapan),
    // makanya tetap butuh layout panel tinggi-penuh + scroll internal (chat-log scroll sendiri, input
    // fixed di bawah). Bug ketutupnya dulu bukan dari pola panel ini - itu dari target scroll-otomatis
    // yang salah (lihat useEffect di TanyaAI), udah dibenerin di situ tanpa perlu buang panelnya.
    <div className={'chat-page' + (tab === 'ai' ? ' chat-page--ai' : '')}>
      <div className="seg-tanya">
        <button className={tab === 'ai' ? 'on' : ''} onClick={() => setTab('ai')}>
          <img src={mangWarungImg} alt="" style={{ width: 18, height: 18, objectFit: 'contain', verticalAlign: -4, marginRight: 6 }} />
          Mang AI
        </button>
        <button className={tab === 'komunitas' ? 'on' : ''} onClick={() => setTab('komunitas')}>
          <svg viewBox="0 0 24 24" width="16" height="16" style={{ verticalAlign: -3, marginRight: 6 }}>
            <circle cx="8.5" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M3 18c1-3 3-4.5 5.5-4.5S13 15 14 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="16.5" cy="9" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M15 13.3c2-.3 4 .7 5 3.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          Komunitas
        </button>
      </div>
      {tab === 'ai' ? <TanyaAI /> : <Komunitas />}
    </div>
  );
}

function TanyaAI() {
  const { dispatch, refreshData, toast, cekLisensi } = useApp();
  const [log, setLog] = useState(muatLogTersimpan);
  const [typing, setTyping] = useState(false);
  const [draf, setDraf] = useState('');
  const [kameraNotaOpen, setKameraNotaOpen] = useState(false); // kamera buat "foto nota, kirim ke Mang AI"
  // Foto BEBAS yang dilampirin ke pesan biasa (BEDA dari kameraNotaOpen di atas - itu alur khusus
  // scan nota/OCR). Ini buat kasus kayak "ini rokok gudang garam, tambahin" - foto dibaca Gemini
  // Vision bareng teksnya, bisa dipakai buat ngisi detail barang di usulan aksi "tambah" (lihat
  // BubbleAksi). Dipilih dari galeri/kamera lewat <input type=file>, BUKAN live camera terpisah -
  // lebih murah dibikin (nggak perlu buka/tutup stream kamera cuma buat 1 foto sebelum ngetik).
  const [fotoTerlampir, setFotoTerlampir] = useState(null); // dataURL webp, atau null
  const [fotoMenuOpen, setFotoMenuOpen] = useState(false); // popup kecil pilih "foto nota" vs "foto barang"
  const logRef = useRef(null);
  const inputFotoRef = useRef(null);

  // Simpen ulang tiap kali log berubah (pesan baru masuk/dihapus) - cuma N pesan terakhir yang
  // disimpen (lihat CHAT_LOG_MAKS), riwayat lama nggak sepenting itu buat disimpen selamanya.
  useEffect(() => {
    try {
      localStorage.setItem(CHAT_LOG_KEY, JSON.stringify(log.slice(-CHAT_LOG_MAKS)));
    } catch {
      /* kuota localStorage penuh / mode privat - riwayat cuma nggak kesimpen, bukan fatal */
    }
  }, [log]);

  // Nge-scroll .chat-log (scrollbox internalnya sendiri, punya overflow-y:auto - lihat index.css)
  // langsung ke scrollHeight-nya tiap ada pesan baru / status ngetik berubah. Dulu pakai
  // scrollIntoView({block:'end'}) ke elemen penanda kosong di akhir log - kadang berhenti SEBELUM
  // beneran mentok (keburu dianggap "udah cukup keliatan"), jadi baris terakhir bubble baru
  // kepotong ketiban .chat-tail (kotak input) yang nempel tepat di bawahnya. scrollTop=scrollHeight
  // langsung nggak punya ambiguitas begitu - selalu ke paling bawah.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log, typing]);

  // Jawabannya dihitung di BACKEND (lihat asisten.routes.js) - query langsung ke database
  // (bukan cuma state lokal yang bisa basi), jadi bisa tau lebih banyak hal: untung, kasbon,
  // stok, jaga, margin per produk, barang paling laris/ngendap, sampai harga barang tertentu.
  // Sekarang juga bisa balikin `aksi` (usulan tambah/ubah/hapus barang, lihat gemini.service.js) -
  // kalau ada, ditambahin sebagai bubble KHUSUS (type 'aksi') di bawah balasan teksnya, isinya form
  // yang bisa diedit + tombol Setuju/Batal (BubbleAksi) - AI CUMA USUL, eksekusi beneran nunggu tap
  // Setuju dari user (human-in-the-loop, sama prinsipnya kayak fitur AI lain di app ini).
  const tanya = async (teks) => {
    const q = teks.trim();
    if ((!q && !fotoTerlampir) || typing) return;
    // Perintah reset - dicek LOKAL doang (nggak manggil API sama sekali, langsung bersihin log &
    // localStorage-nya ikut ke-overwrite lewat efek penyimpan di atas), biar instan & gratis. Match
    // EXACT (bukan .includes()) - biar pertanyaan asli yang KEBETULAN ngandung kata ini di tengah
    // kalimat (misal "reset penjualan kemarin ada nggak") nggak ketriger nggak sengaja.
    if (!fotoTerlampir && PERINTAH_RESET.has(q.toLowerCase())) {
      setLog([SAPAAN_AWAL()]);
      setDraf('');
      return;
    }
    const riwayat = riwayatUntukGemini(log); // snapshot SEBELUM pesan baru ini ditambahin ke log
    const fotoKirim = fotoTerlampir;
    setLog((l) => [
      ...l,
      ...(fotoKirim ? [{ id: idBaru(), who: 'me', type: 'foto', fotoUrl: fotoKirim }] : []),
      ...(q ? [{ id: idBaru(), who: 'me', html: escapeHtml(q) }] : []),
    ]);
    setDraf('');
    setFotoTerlampir(null);
    setTyping(true);
    try {
      const { jawaban, aksi, jatahAiHabis } = await api.asisten.tanya(q || 'Tolong lihat foto ini.', riwayat, fotoKirim);
      setLog((l) => [...l, { id: idBaru(), who: 'bot', html: formatBot(jawaban) }]);
      // Jatah AI habis: jawabannya TETAP dikasih (versi rule-based, kaku), tapi user wajib dikasih
      // tau kenapa - tanpa ini dia cuma liat Mang Warung tiba-tiba jawab "aku belum paham" dan
      // ngiranya aplikasinya rusak, bukan jatahnya yang abis. Ditaruh sebagai gelembung terpisah
      // biar kebaca sebagai keterangan sistem, bukan omongan Mang Warung.
      if (jatahAiHabis) {
        setLog((l) => [
          ...l,
          {
            id: idBaru(),
            who: 'bot',
            html:
              '⚡ <b>Jatah AI hari ini habis</b><br>Mang Warung lagi jawab seadanya dulu. ' +
              'Reset otomatis besok jam 00:00, atau upgrade paket buat jatah lebih besar.',
          },
        ]);
      }
      // Angka jatah di layar Lainnya ditarik ulang tiap habis chat - dulu cuma diambil pas app
      // dibuka, jadi bar-nya baru keliatan gerak setelah user refresh sendiri. Sengaja nggak
      // di-await: nyegerin angka nggak boleh bikin balesan chat ikut ketahan.
      cekLisensi().catch(() => {});
      if (aksi) {
        setLog((l) => [
          ...l,
          { id: idBaru(), who: 'bot', type: 'aksi', aksi, foto: aksi.fotoDipakai ? fotoKirim : null, status: 'menunggu' },
        ]);
      }
    } catch (e) {
      setLog((l) => [...l, { id: idBaru(), who: 'bot', html: escapeHtml(e.message || 'Waduh, lagi nggak bisa jawab. Coba lagi.') }]);
    } finally {
      setTyping(false);
    }
  };

  const pilihFotoLampiran = (e) => {
    const f = e.target.files[0];
    e.target.value = ''; // reset biar file yang sama bisa dipilih lagi
    if (!f) return;
    const r = new FileReader();
    r.onload = async () => {
      try {
        setFotoTerlampir(await keWebp(r.result, 1024));
      } catch {
        toast('Gagal memproses foto');
      }
    };
    r.readAsDataURL(f);
  };

  const tandaiSelesaiAksi = (id, status) => setLog((l) => l.map((b) => (b.id === id ? { ...b, status } : b)));

  // Scan nota lewat Mang AI (dulu punya layar sendiri di menu Stok pakai tabel yang bisa dikoreksi
  // per baris - sekarang disederhanain jadi alur chat: foto muncul sebagai bubble "aku", Mang AI
  // balas ringkasan hasil bacanya + tombol Terapkan/Batal, BUKAN tabel yang bisa diedit per baris
  // lagi. Kalau ada baris yang salah baca, jalan keluarnya sekarang cuma foto ulang (lebih jelas/
  // lebih terang) - bukan koreksi manual di tempat kayak dulu.
  const kirimFotoNota = async (fotoAsli) => {
    setKameraNotaOpen(false);
    // 2 ukuran beda kebutuhan dari foto asli yang sama: fotoOcr agak gedean (1600px) biar tulisan
    // di nota masih kebaca jelas pas dibaca OCR/Gemini, fotoBubble kecil (480px) karena cuma buat
    // ditampilin sebagai bubble kiriman di chat - dan ini ikut kesimpen di localStorage (riwayat
    // chat), jadi nggak perlu gede-gede (lihat CHAT_LOG_MAKS & diskusi hemat storage sebelumnya).
    const [fotoOcr, fotoBubble] = await Promise.all([keWebp(fotoAsli, 1600), keWebp(fotoAsli, 480)]);
    setLog((l) => [...l, { id: idBaru(), who: 'me', type: 'foto', fotoUrl: fotoBubble }]);
    setTyping(true);
    try {
      const { baris } = await api.nota.scan(fotoOcr);
      setTyping(false);
      if (!baris.length) {
        setLog((l) => [...l, { id: idBaru(), who: 'bot', html: 'Notanya nggak kebaca jelas. Coba foto ulang - pastiin terang & fokus ya.' }]);
        return;
      }
      setLog((l) => [...l, { id: idBaru(), who: 'bot', type: 'nota-hasil', rows: baris, status: 'menunggu' }]);
    } catch (e) {
      setTyping(false);
      setLog((l) => [...l, { id: idBaru(), who: 'bot', html: escapeHtml(e.message || 'Gagal membaca nota, coba lagi ya.') }]);
    }
  };

  // Nerapin hasil satu bubble nota-hasil tertentu (ditarget lewat id, bukan index array - biar
  // tetep bener nunjuk ke bubble yang sama walau ada bubble lain nambah di antaranya sementara
  // request ini masih jalan).
  const terapkanNota = async (id) => {
    const entry = log.find((b) => b.id === id);
    if (!entry || entry.status !== 'menunggu') return;
    setLog((l) => l.map((b) => (b.id === id ? { ...b, status: 'menerapkan' } : b)));
    const totalModal = entry.rows.reduce((a, r) => a + (+r.qty || 0) * (+r.harga || 0), 0);
    const hasil = await dispatch({ type: 'TERAPKAN_NOTA', rows: entry.rows });
    if (!hasil) {
      // dispatch() nggak pernah throw ke sini (gagal ditangani internal via toast + guard "perlu
      // online" sendiri) - balikin undefined berarti gagal/diblokir, biar bisa dicoba Terapkan lagi.
      setLog((l) => l.map((b) => (b.id === id ? { ...b, status: 'menunggu' } : b)));
      return;
    }
    setLog((l) => l.map((b) => (b.id === id ? { ...b, status: 'diterapkan' } : b)));
    const baru = (hasil.diterapkan || []).filter((d) => d.aksi === 'produk_baru');
    const catatanFoto = baru.length
      ? ` ${baru.length} barang baru (${baru.map((b) => escapeHtml(b.nama)).join(', ')}) belum ada foto - tambahin nanti dari menu Stok ya.`
      : '';
    setLog((l) => [...l, { id: idBaru(), who: 'bot', html: `Beres! Stok masuk, modal ${rupiah(totalModal)}.${catatanFoto}` }]);
    refreshData();
  };

  const batalNota = (id) => {
    setLog((l) => l.map((b) => (b.id === id ? { ...b, status: 'batal' } : b)));
  };

  return (
    <>
      <div className="head">
        {/* background dibikin transparent (bukan warna .ava bawaan) - gambarnya sendiri udah
            transparan, jadi biar nggak ada "kotak"/lingkaran warna nongol di belakang karakternya */}
        <div className="ava" style={{ background: 'transparent', borderRadius: '50%' }}>
          <img src={mangWarungImg} alt="Mang Warung" />
        </div>
        <div>
          <p className="p-h1">Mang Warung</p>
          <p className="p-sub">Tanya apa aja soal warung</p>
        </div>
      </div>

      <div className="chat-log" ref={logRef}>
        {log.map((b) => {
          const kelas = 'bubble ' + (b.who === 'me' ? 'me' : 'bot');
          if (b.type === 'foto') {
            return (
              <div key={b.id} className={kelas + ' bubble-foto'}>
                <img src={b.fotoUrl} alt="Foto nota" />
              </div>
            );
          }
          if (b.type === 'nota-hasil') {
            return <BubbleNotaHasil key={b.id} data={b} onTerapkan={() => terapkanNota(b.id)} onBatal={() => batalNota(b.id)} />;
          }
          if (b.type === 'aksi') {
            // Tipe aksi yang BUKAN CRUD satu barang punya kartunya sendiri - dipisah biar BubbleAksi
            // nggak jadi komponen serba-bisa yang tiap field-nya harus dijaga "ini kepake tipe apa".
            const Kartu =
              b.aksi?.tipe === 'catat_modal' ? BubbleCatatModal
              : b.aksi?.tipe === 'belanja_banyak' ? BubbleBelanjaBanyak
              : b.aksi?.tipe === 'target_penjualan' ? BubbleTargetPenjualan
              : BubbleAksi;
            return (
              <Kartu
                key={b.id}
                data={b}
                onSelesai={() => tandaiSelesaiAksi(b.id, 'selesai')}
                onBatal={() => tandaiSelesaiAksi(b.id, 'batal')}
              />
            );
          }
          return <div key={b.id} className={kelas} dangerouslySetInnerHTML={{ __html: b.html }} />;
        })}
        {typing && (
          <div className="bubble bot">
            <div className="typing">
              <i /><i /><i />
            </div>
          </div>
        )}
      </div>

      <div className="chat-tail">
        {/* Preview foto yang lagi dilampirin ke pesan berikutnya (BEDA dari alur "Foto nota" di
            bawah - ini buat pesan bebas, misal "ini rokok gudang garam, tambahin") - muncul di
            atas kotak ketik selama belum dikirim/dibatalin. */}
        {fotoTerlampir && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 4px' }}>
            <img src={fotoTerlampir} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 10 }} />
            <span style={{ fontSize: 13, opacity: 0.7, flex: 1 }}>Foto terlampir - tulis pesannya lalu kirim</span>
            <button
              type="button"
              className="cari-clear"
              style={{ position: 'static', flex: 'none' }}
              onClick={() => setFotoTerlampir(null)}
              aria-label="Batal lampirkan foto"
            >
              <svg viewBox="0 0 24 24">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        )}
        <form
          className="tanya"
          onSubmit={(e) => {
            e.preventDefault();
            tanya(draf);
          }}
        >
          {/* 1 tombol foto buat 2 kebutuhan (dulu 2 icon kamera terpisah, disatuin biar nggak
              numpuk mirip-mirip) - tap-nya buka pilihan kecil (lihat fotoMenuOpen di bawah): "Foto
              nota belanja" (alur khusus OCR banyak barang sekaligus, lihat kirimFotoNota) atau
              "Foto barang" (lampiran bebas ke pesan biasa, lihat pilihFotoLampiran) - dua-duanya
              tetep jalur/alur masing-masing di belakangnya, cuma pintu masuknya disatuin. */}
          <button
            type="button"
            className="mic"
            style={{ marginLeft: 0 }}
            onClick={() => setFotoMenuOpen(true)}
            disabled={typing}
            aria-label="Kirim foto"
          >
            <CameraIcon style={{ width: 22, height: 22, marginRight: 0, verticalAlign: 'middle' }} />
          </button>
          <input ref={inputFotoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={pilihFotoLampiran} />
          <input
            type="text"
            placeholder="Tulis pertanyaan…"
            value={draf}
            onChange={(e) => setDraf(e.target.value)}
            disabled={typing}
          />
          <button type="submit" className="mic" disabled={(!draf.trim() && !fotoTerlampir) || typing} aria-label="Kirim pertanyaan">
            <svg viewBox="0 0 24 24">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </form>
      </div>

      {kameraNotaOpen && <SheetJepretNota onJepret={kirimFotoNota} onClose={() => setKameraNotaOpen(false)} />}

      {fotoMenuOpen && (
        <Sheet center mid>
          <h3>Kirim foto apa?</h3>
          <button
            className="btn utama brand"
            style={{ width: '100%', marginTop: 16 }}
            onClick={() => {
              setFotoMenuOpen(false);
              setKameraNotaOpen(true);
            }}
          >
            📄 Foto nota belanja
          </button>
          <p style={{ fontSize: 12, opacity: 0.6, textAlign: 'center', margin: '6px 0 0' }}>
            Baca banyak barang sekaligus dari struk, langsung ke stok
          </p>
          <button
            className="btn utama"
            style={{ width: '100%', marginTop: 16 }}
            onClick={() => {
              setFotoMenuOpen(false);
              inputFotoRef.current?.click();
            }}
          >
            🏷️ Foto barang
          </button>
          <p style={{ fontSize: 12, opacity: 0.6, textAlign: 'center', margin: '6px 0 0' }}>
            Misal foto 1 barang buat ditanyain/ditambahin ke katalog
          </p>
          <button className="btn" style={{ width: '100%', marginTop: 16 }} onClick={() => setFotoMenuOpen(false)}>
            Batal
          </button>
        </Sheet>
      )}
    </>
  );
}

// Ringkasan hasil baca nota (bubble tipe 'nota-hasil', lihat kirimFotoNota) - daftar barang+harga
// yang kebaca + total, dengan tombol Terapkan/Batal. `status` nentuin tampilannya: 'menunggu'
// (tombolnya masih aktif), 'menerapkan' (lagi proses, tombol dimatiin), 'diterapkan'/'batal'
// (udah final, tombol diganti keterangan teks - nggak bisa dipencet dua kali).
function BubbleNotaHasil({ data, onTerapkan, onBatal }) {
  const { rows, status } = data;
  const totalModal = rows.reduce((a, r) => a + (+r.qty || 0) * (+r.harga || 0), 0);
  return (
    <div className="bubble bot bubble-nota">
      <p className="nota-judul">Ini yang kebaca dari notanya:</p>
      <ul className="nota-list">
        {rows.map((r, i) => (
          <li key={i}>
            <span>{r.nama || '(nama kosong)'}</span>
            <span>
              {r.qty} × {rupiah(r.harga)}
            </span>
          </li>
        ))}
      </ul>
      <div className="nota-total">
        <span>Total modal</span>
        <b>{rupiah(totalModal)}</b>
      </div>
      {status === 'menunggu' && (
        <div className="actions nota-aksi">
          <button className="btn kecil" onClick={onBatal}>
            Batal
          </button>
          <button className="btn kecil utama brand" onClick={onTerapkan} disabled={!totalModal}>
            Terapkan ke stok
          </button>
        </div>
      )}
      {status === 'menerapkan' && <p className="nota-status">Menerapkan…</p>}
      {status === 'diterapkan' && <p className="nota-status">✓ Diterapkan ke stok</p>}
      {status === 'batal' && <p className="nota-status">Dibatalkan</p>}
    </div>
  );
}

// Usulan CRUD barang dari Mang AI (field `aksi` di respons /api/asisten/tanya, lihat komentar
// lengkap di gemini.service.js) - kartu FORM YANG BISA DIEDIT, bukan cuma teks "udah aku
// tambahin" - AI CUMA USUL, belum nulis apapun ke database. User cek/koreksi dulu field-nya
// (AI kadang kelewat nangkep salah satu angka dari obrolan), baru tap Setuju buat beneran
// eksekusi lewat endpoint produk yang SAMA yang dipakai menu Stok manual (api.produk.tambah/
// ubah/hapus) - prinsip human-in-the-loop, sama kayak fitur AI lain di app ini (scan visual
// banyak sekaligus, dst).
// Usulan CATAT MODAL dari Mang AI - duit yang disetor pemilik ke warung, masuk ke modal_log
// (lihat POST /api/laporan/kas/modal). Prinsipnya sama kayak BubbleAksi: AI CUMA USUL, nominalnya
// masih bisa dikoreksi user sebelum tap Setuju - AI sering salah baca "100jt" jadi angka lain.
function BubbleCatatModal({ data, onSelesai, onBatal }) {
  const { refreshData, toast } = useApp();
  const { aksi, status } = data;
  const [jumlah, setJumlah] = useState(String(aksi.data?.jumlah ?? ''));
  const [keterangan, setKeterangan] = useState(aksi.data?.keterangan || 'Modal masuk');
  const [loading, setLoading] = useState(false);

  const setuju = async () => {
    const n = Number(jumlah);
    if (!Number.isFinite(n) || n <= 0) return toast('Jumlah modal harus lebih dari 0');
    setLoading(true);
    try {
      await api.laporan.catatModal(n, keterangan.trim() || 'Modal masuk');
      toast(`Modal <b>${escapeHtml(rupiah(n))}</b> dicatat`);
      await refreshData();
      onSelesai();
    } catch (e) {
      toast(e.message ? escapeHtml(e.message) : 'Gagal mencatat modal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bubble bot bubble-nota">
      <p className="nota-judul">💰 Usul catat modal</p>
      {status === 'menunggu' ? (
        <>
          <div className="field">
            <label>Jumlah modal (Rp)</label>
            <input type="number" inputMode="numeric" value={jumlah} onChange={(e) => setJumlah(e.target.value)} />
          </div>
          <div className="field">
            <label>Keterangan</label>
            <input value={keterangan} onChange={(e) => setKeterangan(e.target.value)} placeholder="Modal masuk" />
          </div>
          <p className="opnhint">Dicatat sebagai modal masuk, bukan hasil jualan — jadi laporan untung tetap bersih.</p>
          <div className="notabtn">
            <button className="btn" onClick={onBatal}>Batal</button>
            <button className="btn utama" onClick={setuju} disabled={loading}>
              {loading ? 'Menyimpan…' : 'Setuju'}
            </button>
          </div>
        </>
      ) : (
        <p className="opnhint">{status === 'selesai' ? 'Tersimpan ✓' : 'Dibatalkan'}</p>
      )}
    </div>
  );
}

// Usulan DAFTAR BELANJA dari Mang AI - dipakai waktu user nyerahin pilihan barangnya ("modal 100jt
// belanjain apa aja"). Tiap baris bisa dicentang/dilepas & angkanya diedit, karena harga kulakan
// tiap warung beda dan AI cuma nebak dari pengetahuan umum, bukan dari nota beneran.
//
// Disimpan lewat endpoint produk yang SAMA kayak menu Stok manual (api.produk.tambah), satu per
// satu - sengaja nggak bikin endpoint "tambah borongan" baru supaya aturan/validasi produk cuma
// hidup di satu tempat. Barang yang gagal dicatat & dilaporkan, sisanya tetap kesimpen (bukan
// all-or-nothing) - dari 20 barang, 1 gagal jangan sampai ngebatalin 19 yang udah bener.
function BubbleBelanjaBanyak({ data, onSelesai, onBatal }) {
  const { refreshData, toast } = useApp();
  const { aksi, status } = data;
  const [baris, setBaris] = useState(() =>
    (aksi.data?.barang || []).map((b, i) => {
      // Modal bisa kosong kalau usulannya lewat jalur OpenRouter (skemanya nggak seketat Gemini).
      // Diturunin balik dari harga jual pakai margin yang sama, biar total di bawah tetap masuk akal.
      const modal = Number(b.modal) > 0 ? Number(b.modal) : modalDariHarga(Number(b.harga) || 0);
      // Harga jual sering NGGAK diisi AI (dia fokus ngitung modal x stok biar pas budget), dan
      // kalau dibiarin kosong barangnya kesimpen dengan harga 0 - kejual rugi total. Diisi pakai
      // rumus margin yang SAMA persis kayak saran harga di detail stok (lib/harga.js), jadi
      // angkanya nyambung sama yang user udah biasa liat di sana. Tetap bisa diedit di kartu ini.
      const harga = Number(b.harga) > 0 ? Number(b.harga) : hargaDariMargin(modal);
      // Stok WAJIB bulat: AI ngitung stok dengan cara ngebagi budget sama modal, hasilnya kebawa
      // apa adanya jadi pecahan panjang macam 526,3157894736842 - nggak ada warung yang punya
      // setengah bungkus mie. Dibulatin ke bawah biar totalnya nggak malah nglewatin budget.
      const stok = Math.max(0, Math.floor(Number(b.stok) || 0));
      return {
        key: i,
        pakai: true,
        nama: b.nama || '',
        kategori: b.kategori || 'sembako',
        harga: harga ? String(harga) : '',
        modal: modal ? String(modal) : '',
        stok: String(stok),
        satuan: b.satuan || 'pcs',
      };
    })
  );
  const [loading, setLoading] = useState(false);

  const ubahBaris = (key, field) => (e) =>
    setBaris((r) => r.map((b) => (b.key === key ? { ...b, [field]: e.target.value } : b)));
  const toggle = (key) => setBaris((r) => r.map((b) => (b.key === key ? { ...b, pakai: !b.pakai } : b)));

  const dipakai = baris.filter((b) => b.pakai);
  const totalModal = dipakai.reduce((a, b) => a + (Number(b.modal) || 0) * (Number(b.stok) || 0), 0);

  const setuju = async () => {
    if (!dipakai.length) return toast('Centang minimal satu barang');
    setLoading(true);
    let sukses = 0;
    const gagal = [];
    for (const b of dipakai) {
      try {
        await api.produk.tambah({
          nama: b.nama.trim(),
          kategori: b.kategori.trim() || 'sembako',
          harga: +b.harga || 0,
          modal: +b.modal || 0,
          stok: +b.stok || 0,
          satuan: b.satuan.trim() || 'pcs',
        });
        sukses++;
      } catch {
        gagal.push(b.nama);
      }
    }
    await refreshData();
    setLoading(false);
    if (gagal.length) toast(`${sukses} barang masuk, ${gagal.length} gagal: ${escapeHtml(gagal.join(', '))}`);
    else toast(`<b>${sukses} barang</b> ditambahin ke katalog`);
    onSelesai();
  };

  return (
    <div className="bubble bot bubble-nota">
      <p className="nota-judul">🛒 Usul daftar belanja ({baris.length} barang)</p>
      {status === 'menunggu' ? (
        <>
          <p className="opnhint">
            Harga & stok di bawah masih <b>perkiraan Mang AI</b>, bukan dari nota beneran — cek dulu sama harga
            kulakan kamu. Harga jual yang kosong diisi otomatis pakai <b>margin {MARGIN_DEFAULT}%</b>, sama kayak
            saran harga di detail stok. Lepas centang buat barang yang nggak jadi diambil.
          </p>
          <div style={{ maxHeight: 320, overflowY: 'auto', marginTop: 10 }}>
            {baris.map((b) => (
              <div
                key={b.key}
                style={{
                  display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0',
                  borderBottom: '1px solid var(--garis)', opacity: b.pakai ? 1 : 0.45,
                }}
              >
                <input type="checkbox" checked={b.pakai} onChange={() => toggle(b.key)} style={{ flex: '0 0 auto' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <input value={b.nama} onChange={ubahBaris(b.key, 'nama')} style={{ width: '100%', fontWeight: 700 }} />
                  {/* Label ditulis permanen, BUKAN cuma placeholder - placeholder ilang begitu
                      kolomnya keisi, dan tiga angka berjejer tanpa keterangan bikin salah baca
                      mana modal mana harga jual. */}
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    {[
                      ['modal', 'Modal'],
                      ['harga', 'Jual'],
                      ['stok', 'Stok'],
                    ].map(([field, label]) => (
                      <label key={field} style={{ width: '33%' }}>
                        <span className="opnhint" style={{ display: 'block', marginBottom: 2 }}>{label}</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={b[field]}
                          onChange={ubahBaris(b.key, field)}
                          style={{ width: '100%' }}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="opnhint" style={{ marginTop: 10 }}>
            Dicentang: <b>{dipakai.length} barang</b> · perkiraan modal kepakai <b>{rupiah(totalModal)}</b>
          </p>
          <div className="notabtn">
            <button className="btn" onClick={onBatal}>Batal</button>
            <button className="btn utama" onClick={setuju} disabled={loading}>
              {loading ? 'Menyimpan…' : `Setuju (${dipakai.length})`}
            </button>
          </div>
        </>
      ) : (
        <p className="opnhint">{status === 'selesai' ? 'Tersimpan ✓' : 'Dibatalkan'}</p>
      )}
    </div>
  );
}

// Usulan PASANG TARGET SETORAN. Sengaja BUKAN "langsung catat 900rb jadi transaksi": Mang AI
// nggak punya cara tau barang apa yang beneran kejual, dan ngarang isinya bakal motong stok barang
// yang nggak laku + bikin angka untung jadi bohong. Yang dilakuin di sini cuma mindahin user ke
// layar Catat jualan dengan target udah keisi - nyentang barangnya tetap dia sendiri, dari
// ingatannya, bukan dari tebakan AI.
function BubbleTargetPenjualan({ data, onSelesai, onBatal }) {
  const { setTargetSetoran, goTo, toast } = useApp();
  const { aksi, status } = data;
  const [jumlah, setJumlah] = useState(String(aksi.data?.jumlah ?? ''));

  const setuju = () => {
    const n = Number(jumlah);
    if (!Number.isFinite(n) || n <= 0) return toast('Jumlahnya harus lebih dari 0');
    setTargetSetoran(n);
    goTo('s-catat');
    toast(`Target <b>${escapeHtml(rupiah(n))}</b> dipasang — ceklis barangnya sampai pas`);
    onSelesai();
  };

  return (
    <div className="bubble bot bubble-nota">
      <p className="nota-judul">🎯 Pasang target setoran</p>
      {status === 'menunggu' ? (
        <>
          <div className="field">
            <label>Total penjualan (Rp)</label>
            <input type="number" inputMode="numeric" value={jumlah} onChange={(e) => setJumlah(e.target.value)} />
          </div>
          <p className="opnhint">
            Kamu bakal dibawa ke <b>Catat jualan</b> dengan target ini kepasang. Tinggal ceklis barang yang
            kejual sampai totalnya pas — stok sama untungnya tetap kehitung bener.
          </p>
          <div className="notabtn">
            <button className="btn" onClick={onBatal}>Batal</button>
            <button className="btn utama" onClick={setuju}>Buka catat jualan</button>
          </div>
        </>
      ) : (
        <p className="opnhint">{status === 'selesai' ? 'Target dipasang ✓' : 'Dibatalkan'}</p>
      )}
    </div>
  );
}

function BubbleAksi({ data, onSelesai, onBatal }) {
  const { S, refreshData, toast } = useApp();
  const { aksi, foto, status } = data;
  const tipe = aksi.tipe;
  // Buat ubah/hapus: cari data ASLI barangnya dari katalog (S.produk) - dipakai buat (a) nampilin
  // nama/harga SEKARANG sebagai konteks di kartu, (b) pre-fill form edit (mulai dari nilai
  // sekarang, ditimpa field yang diusulin AI), (c) jaga-jaga barangnya udah kehapus/berubah id
  // sejak usulan ini dibikin (obrolan bisa lama nggak dibales).
  const produkLama = tipe !== 'tambah' ? S.produk.find((p) => p.id === aksi.produkId) : null;
  const produkHilang = tipe !== 'tambah' && !produkLama;

  const [form, setForm] = useState(() => ({
    nama: aksi.data?.nama ?? produkLama?.nama ?? '',
    kategori: aksi.data?.kategori ?? produkLama?.kat ?? 'sembako',
    barcode: aksi.data?.barcode ?? produkLama?.barcode ?? '',
    harga: aksi.data?.harga ?? produkLama?.harga ?? '',
    modal: aksi.data?.modal ?? produkLama?.modal ?? '',
    stok: aksi.data?.stok ?? (tipe === 'tambah' ? '' : produkLama?.stok ?? ''),
    satuan: aksi.data?.satuan ?? produkLama?.satuan ?? 'pcs',
    isiKemasan: aksi.data?.isiKemasan ?? produkLama?.isiKemasan ?? 1,
    namaKemasan: aksi.data?.namaKemasan ?? produkLama?.namaKemasan ?? '',
    grup: aksi.data?.grup ?? produkLama?.grup ?? '',
  }));
  // Foto EDITABLE di kartu ini - beda dari `foto` di props (itu foto yang KEBETULAN dilampirin user
  // pas ngobrol, lihat aksi.fotoDipakai di Chat.jsx > tanya()). Dulu kalau nggak ada foto pas
  // ngobrol, kartunya nggak ngasih jalan buat nambahin - sekarang bisa jepret/pilih foto langsung
  // di sini juga, sebelum tap Setuju. Dipakai buat tipe "tambah" (foto produk baru) & "ubah" (ganti
  // foto produk yang udah ada) - "hapus" nggak butuh foto sama sekali.
  const [fotoForm, setFotoForm] = useState(foto || null);
  const [loading, setLoading] = useState(false);
  const ubah = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const pilihFoto = (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const r = new FileReader();
    r.onload = async () => {
      try {
        setFotoForm(await keWebp(r.result, 800));
      } catch {
        toast('Gagal memproses foto');
      }
    };
    r.readAsDataURL(f);
  };

  const setuju = async () => {
    if (tipe !== 'hapus' && !form.nama.trim()) return toast('Nama barang wajib diisi');
    setLoading(true);
    try {
      if (tipe === 'tambah') {
        await api.produk.tambah({
          nama: form.nama.trim(),
          kategori: form.kategori.trim() || 'sembako',
          barcode: form.barcode.trim() || undefined,
          harga: +form.harga || 0,
          modal: +form.modal || 0,
          stok: +form.stok || 0,
          satuan: form.satuan.trim() || 'pcs',
          isiKemasan: +form.isiKemasan || 1,
          namaKemasan: form.namaKemasan.trim() || undefined,
          grup: form.grup.trim() || undefined,
          fotoUrl: fotoForm || undefined,
        });
        toast(`<b>${escapeHtml(form.nama.trim())}</b> ditambahin ke katalog`);
      } else if (tipe === 'ubah') {
        await api.produk.ubah(aksi.produkId, {
          nama: form.nama.trim(),
          kategori: form.kategori.trim() || 'sembako',
          barcode: form.barcode.trim(),
          harga: +form.harga || 0,
          modal: +form.modal || 0,
          satuan: form.satuan.trim() || 'pcs',
          isiKemasan: +form.isiKemasan || 1,
          namaKemasan: form.namaKemasan.trim(),
          grup: form.grup.trim(),
          fotoUrl: fotoForm || undefined,
        });
        toast(`<b>${escapeHtml(form.nama.trim())}</b> diubah`);
      } else if (tipe === 'hapus') {
        await api.produk.hapus(aksi.produkId);
        toast(`<b>${escapeHtml(produkLama?.nama || '')}</b> dihapus dari katalog`);
      }
      await refreshData();
      onSelesai();
    } catch (e) {
      toast(e.message ? escapeHtml(e.message) : 'Gagal menyimpan');
    } finally {
      setLoading(false);
    }
  };

  const judul = tipe === 'tambah' ? '➕ Usul tambah barang' : tipe === 'ubah' ? '✏️ Usul ubah barang' : '🗑️ Usul hapus barang';

  return (
    <div className="bubble bot bubble-nota">
      <p className="nota-judul">{judul}</p>

      {produkHilang && (
        <p className="opnhint" style={{ color: '#e5484d' }}>
          Barang ini kayaknya udah nggak ada di katalog (mungkin kehapus/berubah) - nggak bisa diproses lagi.
        </p>
      )}

      {!produkHilang && status === 'menunggu' && (
        <>
          {tipe !== 'hapus' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              {fotoForm && <img src={fotoForm} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 14 }} />}
              <label className="btn kecil" style={{ display: 'inline-block', cursor: 'pointer' }}>
                {fotoForm ? 'Ganti foto' : <><CameraIcon /> Tambah foto</>}
                <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={pilihFoto} />
              </label>
            </div>
          )}
          {tipe === 'hapus' ? (
            <p style={{ margin: '4px 0 0' }}>
              Yakin hapus <b>{escapeHtml(produkLama?.nama || '')}</b>? Barang ini bakal ilang dari katalog (histori transaksi lama tetap aman).
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              <div className="field" style={{ margin: 0 }}>
                <label>Nama barang</label>
                <input value={form.nama} onChange={ubah('nama')} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div className="field" style={{ margin: 0, flex: 1 }}>
                  <label>Kategori</label>
                  <input value={form.kategori} onChange={ubah('kategori')} />
                </div>
                <div className="field" style={{ margin: 0, flex: 1 }}>
                  <label>Satuan</label>
                  <input value={form.satuan} onChange={ubah('satuan')} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div className="field" style={{ margin: 0, flex: 1 }}>
                  <label>Harga jual</label>
                  <input type="number" inputMode="numeric" value={form.harga} onChange={ubah('harga')} />
                </div>
                <div className="field" style={{ margin: 0, flex: 1 }}>
                  <label>Modal (HPP)</label>
                  <input type="number" inputMode="numeric" value={form.modal} onChange={ubah('modal')} />
                </div>
              </div>
              {tipe === 'tambah' && (
                <div className="field" style={{ margin: 0 }}>
                  <label>Stok awal</label>
                  <input type="number" inputMode="numeric" value={form.stok} onChange={ubah('stok')} />
                </div>
              )}
              <div className="field" style={{ margin: 0 }}>
                <label>Grup varian (opsional)</label>
                <input value={form.grup} onChange={ubah('grup')} placeholder='Cuma nama merek, misal "Aqua"' />
              </div>
            </div>
          )}
          <div className="actions nota-aksi" style={{ marginTop: 12 }}>
            <button className="btn kecil" onClick={onBatal} disabled={loading}>
              Batal
            </button>
            <button className="btn kecil utama brand" onClick={setuju} disabled={loading}>
              {loading ? 'Menyimpan…' : 'Setuju'}
            </button>
          </div>
        </>
      )}

      {status === 'selesai' && <p className="nota-status">✓ Disimpan</p>}
      {status === 'batal' && <p className="nota-status">Dibatalkan</p>}
    </div>
  );
}

// Kamera buat "foto nota, kirim ke Mang AI" - versi ringkas dari alur kamera SheetNota yang lama:
// nggak ada langkah "hasil"/tabel di sini, jepret langsung nutup diri & nyerahin foto ke pemanggil
// (kirimFotoNota di TanyaAI) lewat onJepret, yang lanjutin sisa alurnya (kirim ke OCR, balas di chat).
function SheetJepretNota({ onJepret, onClose }) {
  const [step, setStep] = useState('memuat'); // memuat | kamera | error
  const [errorMsg, setErrorMsg] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    let batal = false;
    (async () => {
      try {
        const stream = await bukaKamera('environment');
        if (batal) return tutupKamera(stream);
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        if (!batal) setStep('kamera');
      } catch (e) {
        if (!batal) {
          setErrorMsg(e.message || 'Gagal membuka kamera');
          setStep('error');
        }
      }
    })();
    return () => {
      batal = true;
      tutupKamera(streamRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const jepret = () => {
    const fotoAsli = jepretFrame(videoRef.current);
    tutupKamera(streamRef.current);
    onJepret(fotoAsli);
  };

  return (
    <div className="sheet show">
      <div className="panel">
        <h3>Foto nota belanja</h3>
        {(step === 'memuat' || step === 'kamera') && (
          <>
            <div className={'viewfinder' + (step === 'memuat' ? ' diam' : '')}>
              <div className="frame" />
              <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <p style={{ textAlign: 'center' }}>
              {step === 'memuat' ? 'Menyiapkan kamera…' : 'Arahkan ke nota belanjaan, pastikan tulisannya kelihatan jelas & nggak silau'}
            </p>
            {step === 'kamera' && (
              <button className="btn utama brand" style={{ width: '100%', marginTop: 12 }} onClick={jepret}>
                <CameraIcon /> Jepret nota
              </button>
            )}
          </>
        )}
        {step === 'error' && <p style={{ textAlign: 'center' }}>{errorMsg}</p>}
        <button className="btn" style={{ width: '100%', marginTop: 12 }} onClick={onClose}>
          Batal
        </button>
      </div>
    </div>
  );
}

const MAKS_PER_HALAMAN = 20;

// Tombol "Balas" kecil di bawah tiap komentar - SENGAJA style inline (bukan className="linkkecil",
// itu buat link SELEBAR LAYAR kayak "Lupa password?", `display:block;width:100%;margin-top:26px`,
// dulu kepake keliru di sini & bikin tombolnya jadi bar lebar aneh + jarak gede ke teks komentar di
// atasnya, berantakan banget di layar sempit) - inline-block kecil nempel pas di bawah teks.
const GAYA_TOMBOL_BALAS = {
  display: 'inline-block',
  width: 'auto',
  margin: '4px 0 0',
  padding: 0,
  border: 0,
  background: 'none',
  color: 'var(--abu)',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
};

const TOPIK = ['Dagangan', 'Kasbon', 'Supplier', 'Lainnya']; // topik postingan komunitas
const FILTER_TABS = ['terbaru', 'ramai', ...TOPIK];
const labelFilter = (f) => (f === 'terbaru' ? 'Terbaru' : f === 'ramai' ? 'Ramai' : f);

// Waktu relatif ringkas ("20 mnt lalu", "3 jam lalu") buat baris kecil di header tiap post -
// mirip waktuLalu() di PhoneShell.jsx (badge sync), tapi disalin lokal di sini biar Komunitas()
// nggak nambah ketergantungan lintas-file cuma buat 1 fungsi kecil begini.
// Icon suka (jempol) - SVG stroke, biar konsisten sama gaya ikon lain di app ini (bukan emoji).
// Dipakai di 2 tempat: kartu post di feed & sheet detail diskusi.
function IkonSuka({ aktif }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16">
      <path d="M2 22V11h4v11H2Z" fill={aktif ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path
        d="M6 11l4.4-8.4a1.8 1.8 0 0 1 3.4.8V9h5.3a2 2 0 0 1 1.94 2.49l-1.8 7A2 2 0 0 1 17.3 20H6"
        fill={aktif ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function waktuRelatif(iso) {
  const menit = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (menit < 1) return 'baru saja';
  if (menit < 60) return `${menit} menit lalu`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  return `${Math.floor(jam / 24)} hari lalu`;
}

// Komunitas — feed NASIONAL (semua warung berlangganan lihat feed yang sama) buat saling sharing
// harga jual & untung penjualan, ditampilin ATAS NAMA WARUNG (bukan anonim — keputusan produk: di
// bisnis kecil begini nama warung sendiri udah cukup "generik" secara lokasi, dan atribusi bikin
// info-nya lebih bisa dipercaya). Backend-nya di komunitas.routes.js, pola query & access-control-nya
// (WHERE warung_id=$2 pas hapus, dst) niru pola tukar_stok_post/koperasi_grup yang udah ada duluan.
function Komunitas() {
  const { authWarung, toast } = useApp();
  const [feed, setFeed] = useState(null); // null = belum sempat fetch pertama kali
  const [habis, setHabis] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [draf, setDraf] = useState('');
  const [kirimLoading, setKirimLoading] = useState(false);
  const [komentarBuka, setKomentarBuka] = useState(null); // id post yang sheet detailnya lagi kebuka (cuma 1 pada satu waktu)
  const [komentarMap, setKomentarMap] = useState({}); // postId -> daftar komentar yang udah dimuat
  const [sukaMap, setSukaMap] = useState({}); // postId -> daftar nama warung yang suka (buat badge ala Facebook)
  const [draftKomentar, setDraftKomentar] = useState('');
  const [balasKe, setBalasKe] = useState(null); // komentar (bukan cuma id - butuh nama-nya buat "Membalas @...") yang lagi ditarget, null = komentar biasa langsung ke post
  const [filter, setFilter] = useState('terbaru'); // terbaru | ramai | <nama topik> — cuma nyaring/ngurutin feed yang UDAH kemuat, bukan query baru ke server
  const [topikPilih, setTopikPilih] = useState(TOPIK[0]); // topik yang dipilih buat postingan BARU
  const [komposerBuka, setKomposerBuka] = useState(false); // sheet "nanya ke komunitas" - kebuka pas tombol + dipencet
  const [confirmHapus, setConfirmHapus] = useState(null); // null | {tipe:'post', post} | {tipe:'komentar', postId, komentarId}

  // Urutan tampil dibekukan (cuma dihitung ulang pas filter ganti / jumlah postingan berubah -
  // post baru masuk atau dihapus), BUKAN tiap kali ada yang suka/komentar. Alasannya: dulu "Ramai"
  // di-sort ulang tiap `feed` berubah (termasuk pas cuma toggle suka), jadi postingan yang baru
  // disuka langsung lompat ke atas feed pas itu juga — bikin bingung orang yang lagi nge-tap suka.
  const urutanIds = useMemo(() => {
    if (!feed) return [];
    let arr = feed;
    if (filter === 'ramai') {
      arr = [...feed].sort((a, b) => +b.jumlah_suka + +b.jumlah_komentar - (+a.jumlah_suka + +a.jumlah_komentar));
    } else if (filter !== 'terbaru') {
      arr = feed.filter((p) => p.tag === filter);
    }
    return arr.map((p) => p.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, feed?.length]);

  // Objek post-nya sendiri tetap diambil FRESH dari `feed` tiap render (biar angka suka/komentar
  // di kartu selalu update langsung), cuma URUTANnya yang ngikutin urutanIds yang dibekukan di atas.
  const daftar = useMemo(() => {
    if (!feed) return feed;
    const map = new Map(feed.map((p) => [p.id, p]));
    return urutanIds.map((id) => map.get(id)).filter(Boolean);
  }, [feed, urutanIds]);

  const muat = async (cursor) => {
    try {
      const rows = await api.komunitas.feed(cursor);
      setFeed((f) => (cursor ? [...(f || []), ...rows] : rows));
      if (rows.length < MAKS_PER_HALAMAN) setHabis(true);
    } catch (e) {
      toast(e.message || 'Gagal memuat komunitas');
      if (!cursor) setFeed([]);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const muatLagi = () => {
    if (!feed?.length) return;
    setLoadingMore(true);
    muat(feed[feed.length - 1].created_at);
  };

  // Posting sekarang cuma teks bebas (kayak nanya di chat) - dulu ada form kepisah 4 kolom
  // (nama barang/harga jual/untung/cerita), diringkas jadi 1 kotak teks doang biar nggak ribet,
  // nempel di bar bawah yang sama gayanya kayak Tanya AI (lihat warung-pintar-tanya.html - di situ
  // Komunitas juga posting lewat bar bawah, bukan form terpisah). Backend-nya (namaBarang/hargaJual/
  // profit) TETAP ada di api.komunitas.posting - postingan lama yang masih punya field itu tetap
  // tampil lengkap (lihat render post-q di bawah), cuma jalur bikin postingan BARU yang disederhanain.
  const kirimPost = async (teks) => {
    const ct = teks.trim();
    if (!ct) return;
    setDraf('');
    setKirimLoading(true);
    try {
      const baru = await api.komunitas.posting({ cerita: ct, tag: topikPilih });
      setFeed((f) => [baru, ...(f || [])]);
    } catch (e) {
      toast(e.message || 'Gagal ngirim postingan');
    } finally {
      setKirimLoading(false);
    }
  };

  // Dulu pakai window.confirm() (dialog bawaan browser, tampilannya nggak bisa disamain sama
  // desain app) - sekarang lewat popup sendiri (reuse Sheet dari SharedSheets.jsx, lihat
  // render-nya di bawah), state confirmHapus nyimpen APA yang lagi mau dihapus (post/komentar
  // mana) sampai user beneran nekan "Hapus" di popup itu.
  const hapusPost = async (post) => {
    try {
      await api.komunitas.hapus(post.id);
      setFeed((f) => f.filter((p) => p.id !== post.id));
      if (komentarBuka === post.id) setKomentarBuka(null);
    } catch (e) {
      toast(e.message || 'Gagal menghapus postingan');
    }
  };

  // Optimistic update dulu (langsung kelihatan responsif), baru dikoreksi pakai angka asli dari
  // server — kalau requestnya gagal, muat ulang feed biar hitungannya balik sinkron lagi.
  const toggleSuka = async (post) => {
    setFeed((f) => f.map((p) => (p.id === post.id ? { ...p, disukai: !p.disukai, jumlah_suka: +p.jumlah_suka + (p.disukai ? -1 : 1) } : p)));
    // Kalau daftar "siapa yang suka" post ini udah pernah dimuat (sheet detailnya pernah dibuka),
    // ikutan dikoreksi optimis juga - biar badge avatarnya langsung nambah/ilang nama sendiri.
    setSukaMap((m) => {
      if (!m[post.id]) return m;
      const namaSendiri = authWarung?.nama;
      const list = post.disukai ? m[post.id].filter((n) => n !== namaSendiri) : [namaSendiri, ...m[post.id]];
      return { ...m, [post.id]: list };
    });
    try {
      const { disukai, jumlahSuka } = await api.komunitas.suka(post.id);
      setFeed((f) => f.map((p) => (p.id === post.id ? { ...p, disukai, jumlah_suka: jumlahSuka } : p)));
    } catch (e) {
      toast(e.message || 'Gagal nyimpen suka');
      muat();
    }
  };

  // Dulu "Jawab" nge-toggle expand komentar inline di bawah kartunya sendiri di feed. Sekarang
  // dibikin buka sheet detail terpisah (kaya klik jumlah komentar di Facebook - post-nya kepajang
  // sendiri di popup, bukan numpuk mepet-mepet di tengah feed), jadi nggak toggle-close lagi -
  // sekali klik selalu buka, tutupnya lewat tombol × di sheet-nya (tutupDetail).
  const bukaDetail = async (postId) => {
    setKomentarBuka(postId);
    setDraftKomentar('');
    setBalasKe(null);
    if (!komentarMap[postId]) {
      try {
        const list = await api.komunitas.komentar.list(postId);
        setKomentarMap((m) => ({ ...m, [postId]: list }));
      } catch (e) {
        toast(e.message || 'Gagal memuat komentar');
      }
    }
    if (!sukaMap[postId]) {
      try {
        const list = await api.komunitas.sukaSiapa(postId);
        setSukaMap((m) => ({ ...m, [postId]: list }));
      } catch {
        // non-fatal — badge "disukai oleh" cuma nggak nongol namanya, angka suka tetep kelihatan
      }
    }
  };
  const tutupDetail = () => setKomentarBuka(null);

  const kirimKomentar = async (postId) => {
    const teks = draftKomentar.trim();
    if (!teks) return;
    setDraftKomentar('');
    const targetId = balasKe?.id || null;
    setBalasKe(null);
    try {
      const baru = await api.komunitas.komentar.tambah(postId, teks, targetId);
      setKomentarMap((m) => ({ ...m, [postId]: [...(m[postId] || []), baru] }));
      setFeed((f) => f.map((p) => (p.id === postId ? { ...p, jumlah_komentar: +p.jumlah_komentar + 1 } : p)));
    } catch (e) {
      toast(e.message || 'Gagal ngirim komentar');
    }
  };

  const hapusKomentar = async (postId, komentarId) => {
    try {
      await api.komunitas.komentar.hapus(komentarId);
      setKomentarMap((m) => ({ ...m, [postId]: m[postId].filter((k) => k.id !== komentarId) }));
      setFeed((f) => f.map((p) => (p.id === postId ? { ...p, jumlah_komentar: Math.max(0, +p.jumlah_komentar - 1) } : p)));
    } catch (e) {
      toast(e.message || 'Gagal menghapus komentar');
    }
  };

  const jalankanHapus = () => {
    const target = confirmHapus;
    setConfirmHapus(null);
    if (!target) return;
    if (target.tipe === 'post') hapusPost(target.post);
    else hapusKomentar(target.postId, target.komentarId);
  };

  const postDetail = feed?.find((p) => p.id === komentarBuka) || null;
  const daftarKomentar = postDetail ? komentarMap[postDetail.id] : null;

  // Kelompokkan komentar rata (dari API) jadi POHON 1 tingkat - komentar root (balas_ke null) tiap
  // satu bawa daftar balesannya sendiri (balas_ke === id root itu). Server udah nge-ratain balesan-
  // ke-balesan ke akar yang sama (lihat komentar di komunitas.routes.js), jadi di sini nggak perlu
  // rekursi - cukup 1 lapis pengelompokan.
  const pohonKomentar = useMemo(() => {
    if (!daftarKomentar) return [];
    const balasanMap = new Map(); // rootId -> [balasan, ...]
    const root = [];
    for (const k of daftarKomentar) {
      if (k.balas_ke) {
        if (!balasanMap.has(k.balas_ke)) balasanMap.set(k.balas_ke, []);
        balasanMap.get(k.balas_ke).push(k);
      } else {
        root.push(k);
      }
    }
    return root.map((k) => ({ ...k, balasan: balasanMap.get(k.id) || [] }));
  }, [daftarKomentar]);

  return (
    <>
      {/* Feed & detail postingan sekarang SALING GANTIAN (bukan detail numpuk di ATAS feed lewat
          Sheet/modal kayak sebelumnya) - tap postingan "pindah halaman" beneran (kayak Facebook),
          balik ke feed lewat tombol "‹ Kembali", sama pola navigasi yang dipakai layar lain di app
          ini (lihat Pelanggan.jsx/Riwayat.jsx). Ini navigasi LOKAL (state komentarBuka di komponen
          ini, bukan lewat goTo() global) - tab Komunitas sendiri masih 1 dari 2 tab di Chat.jsx,
          nggak perlu daftar sebagai screen `s-*` terpisah di PhoneShell. */}
      {!postDetail && (
      <div className="komunitas-feed">
      {feed?.length > 0 && (
        <div className="tabs">
          {FILTER_TABS.map((f) => (
            <button key={f} className={'tab' + (filter === f ? ' act' : '')} onClick={() => setFilter(f)}>
              {labelFilter(f)}
            </button>
          ))}
        </div>
      )}

      {/* Tombol biasa (bukan FAB ngambang) - nav bar udah punya FAB "Catat" sendiri di zona
          bawah yang sama, jadi tombol tambah postingan taruh di alur feed aja biar nggak numpuk. */}
      <button
        type="button"
        className="btn utama brand"
        style={{ width: '100%', marginTop: 14 }}
        onClick={() => setKomposerBuka(true)}
      >
        + Tanya ke komunitas
      </button>

      {feed === null && (
        <p className="p-sub" style={{ textAlign: 'center', marginTop: 30 }}>
          Memuat komunitas…
        </p>
      )}
      {feed?.length === 0 && (
        <div className="kosong">
          Belum ada postingan.
          <br />
          Jadi yang pertama share!
        </div>
      )}

      <div className="posts">
        {daftar?.map((post) => (
          <article key={post.id} className="post" onClick={() => bukaDetail(post.id)}>
            <div className="post-head">
              <div className="bulat">{inisial(post.warung_nama)}</div>
              <div className="post-id">
                <b>{post.warung_nama}</b>
                <span title={`${tglID(post.created_at)} · ${jamID(post.created_at)}`}>{waktuRelatif(post.created_at)}</span>
              </div>
              {post.tag && <span className="tag">{post.tag}</span>}
              {post.warung_id === authWarung?.id && (
                <button
                  className="hapus-mini"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmHapus({ tipe: 'post', post });
                  }}
                  aria-label="Hapus postingan"
                >
                  ×
                </button>
              )}
            </div>

            {post.nama_barang && (
              <p className="post-q" style={{ marginBottom: post.cerita ? 0 : undefined }}>
                <b>{post.nama_barang}</b>
                {post.harga_jual != null && <> · Jual {rupiah(post.harga_jual)}</>}
                {post.profit != null && <> · Untung {rupiah(post.profit)}/pcs</>}
              </p>
            )}
            {post.cerita && (
              <p className="post-q" style={{ marginTop: post.nama_barang ? 6 : 13, whiteSpace: 'pre-wrap' }}>
                {post.cerita}
              </p>
            )}

            <div className="post-meta">
              <span>{post.jumlah_komentar} komentar</span>
              <button
                className={'aksi' + (post.disukai ? ' suka-on' : '')}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSuka(post);
                }}
              >
                <IkonSuka aktif={post.disukai} /> {post.jumlah_suka}
              </button>
              {/* Kartu-nya sendiri sekarang udah bisa diklik buat buka detail (kaya tap post di
                  Facebook) - tombol ini dibiarin ada juga sebagai affordance yang lebih eksplisit,
                  bukan lagi satu-satunya jalan buka sheet detail. */}
              <span className="lihat">Lihat detail →</span>
            </div>
          </article>
        ))}
      </div>

      {feed?.length > 0 && !habis && (
        <button className="btn" style={{ width: '100%', marginTop: 14, marginBottom: 14 }} disabled={loadingMore} onClick={muatLagi}>
          {loadingMore ? 'Memuat…' : 'Muat lagi'}
        </button>
      )}
      </div>
      )}

      {komposerBuka && (
        <Sheet>
          <div className="between">
            <h3 style={{ fontSize: 20 }}>Nanya ke komunitas</h3>
            <button className="hapus-mini" onClick={() => setKomposerBuka(false)} aria-label="Tutup">
              ×
            </button>
          </div>

          {/* Topik postingan (Dagangan/Kasbon/Supplier/Lainnya) - dipilih sebelum kirim, dipakai
              backend buat kolom `tag` yang sama yang dipakai tab filter di feed. */}
          <div className="tabs" style={{ marginTop: 16 }}>
            {TOPIK.map((t) => (
              <button key={t} type="button" className={'tab' + (topikPilih === t ? ' act' : '')} onClick={() => setTopikPilih(t)}>
                {t}
              </button>
            ))}
          </div>

          <form
            className="tanya"
            style={{ marginTop: 14 }}
            onSubmit={(e) => {
              e.preventDefault();
              kirimPost(draf);
              setKomposerBuka(false);
            }}
          >
            <input
              type="text"
              placeholder="Nanya ke sesama juragan…"
              value={draf}
              onChange={(e) => setDraf(e.target.value)}
              disabled={kirimLoading}
              autoFocus
            />
            <button type="submit" className="mic" disabled={!draf.trim() || kirimLoading} aria-label="Kirim">
              <svg viewBox="0 0 24 24">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          </form>
        </Sheet>
      )}

      {/* Halaman detail diskusi - dulu Sheet/popup numpuk di atas feed, sekarang GANTI TOTAL ke
          feed (lihat {!postDetail && (...)} di atas), kayak buka postingan di Facebook: postnya
          "kepajang sendiri" 1 halaman, balik ke feed lewat tombol "‹ Kembali", bukan tombol × nutup
          popup. */}
      {postDetail && (
        <div style={{ paddingTop: 14 }}>
          <button className="btn kecil" onClick={tutupDetail}>
            ‹ Kembali
          </button>
          <p className="p-h1" style={{ marginTop: 16 }}>
            Diskusi
          </p>

          <div className="post-head" style={{ marginTop: 16 }}>
            <div className="bulat">{inisial(postDetail.warung_nama)}</div>
            <div className="post-id">
              <b>{postDetail.warung_nama}</b>
              <span title={`${tglID(postDetail.created_at)} · ${jamID(postDetail.created_at)}`}>{waktuRelatif(postDetail.created_at)}</span>
            </div>
            {postDetail.tag && <span className="tag">{postDetail.tag}</span>}
          </div>
          {postDetail.nama_barang && (
            <p className="post-q" style={{ marginBottom: postDetail.cerita ? 0 : undefined }}>
              <b>{postDetail.nama_barang}</b>
              {postDetail.harga_jual != null && <> · Jual {rupiah(postDetail.harga_jual)}</>}
              {postDetail.profit != null && <> · Untung {rupiah(postDetail.profit)}/pcs</>}
            </p>
          )}
          {postDetail.cerita && (
            <p className="post-q" style={{ marginTop: postDetail.nama_barang ? 6 : 13, whiteSpace: 'pre-wrap' }}>
              {postDetail.cerita}
            </p>
          )}
          <div className="post-meta">
            <span>{postDetail.jumlah_komentar} komentar</span>
            <button className={'aksi' + (postDetail.disukai ? ' suka-on' : '')} onClick={() => toggleSuka(postDetail)}>
              <IkonSuka aktif={postDetail.disukai} /> {postDetail.jumlah_suka}
            </button>
          </div>

          {/* Badge "disukai oleh..." ala Facebook - avatar bertumpuk + nama, muncul cuma di sini
              (bukan di kartu feed) biar feednya tetep ringkas. */}
          {sukaMap[postDetail.id]?.length > 0 && (
            <div className="suka-row">
              <div className="suka-badges">
                {sukaMap[postDetail.id].slice(0, 3).map((nama, i) => (
                  <div key={i} className="suka-avatar">
                    {inisial(nama)}
                  </div>
                ))}
              </div>
              <span className="suka-teks">
                Disukai {sukaMap[postDetail.id].slice(0, 3).join(', ')}
                {postDetail.jumlah_suka > 3 ? ` dan ${postDetail.jumlah_suka - 3} lainnya` : ''}
              </span>
            </div>
          )}

          {pohonKomentar.length > 0 && (
            <div className="balas-list">
              {pohonKomentar.map((k) => (
                <div key={k.id}>
                  <div className="balas-row">
                    <div className="bulat">{inisial(k.warung_nama)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b>{k.warung_nama}</b>
                      <p>{k.teks}</p>
                      <button type="button" style={GAYA_TOMBOL_BALAS} onClick={() => setBalasKe(k)}>
                        Balas
                      </button>
                    </div>
                    {k.warung_id === authWarung?.id && (
                      <button
                        className="hapus-mini"
                        onClick={() => setConfirmHapus({ tipe: 'komentar', postId: postDetail.id, komentarId: k.id })}
                        aria-label="Hapus komentar"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  {/* Balesan ke komentar ini - dibungkus jadi 1 kartu (background beda + garis
                      kiri tegas pakai --abu, --garis di tema terang nyaris nggak keliatan di atas
                      background putih) biar jelas ini area balesan yang "nempel" ke komentar di
                      atasnya. */}
                  {(k.balasan.length > 0 || balasKe?.id === k.id) && (
                    <div
                      style={{
                        marginLeft: 17,
                        marginTop: 6,
                        padding: '8px 10px 8px 13px',
                        borderLeft: '3px solid var(--abu)',
                        background: 'var(--bg)',
                        borderRadius: '0 14px 14px 0',
                      }}
                    >
                      {k.balasan.length > 0 && (
                        <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 800, letterSpacing: '.02em', textTransform: 'uppercase', color: 'var(--abu)' }}>
                          {k.balasan.length} BALASAN
                        </p>
                      )}
                      {k.balasan.map((b) => (
                        <div key={b.id} className="balas-row">
                          <div className="bulat">{inisial(b.warung_nama)}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <b>{b.warung_nama}</b>
                            <p>{b.teks}</p>
                            <button type="button" style={GAYA_TOMBOL_BALAS} onClick={() => setBalasKe(k)}>
                              Balas
                            </button>
                          </div>
                          {b.warung_id === authWarung?.id && (
                            <button
                              className="hapus-mini"
                              onClick={() => setConfirmHapus({ tipe: 'komentar', postId: postDetail.id, komentarId: b.id })}
                              aria-label="Hapus komentar"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                      {/* Form balas MUNCUL DI SINI (nempel langsung di bawah komentar/balesan yang
                          lagi ditarget), BUKAN nyorong ke form paling bawah - biar nggak perlu
                          geser jauh buat liat konteks apa yang lagi dibales. Tombol batal dipisah
                          jadi baris label kecil di atas input (bukan numpuk di 1 baris bareng
                          input+Kirim). */}
                      {balasKe?.id === k.id && (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12, color: 'var(--abu)' }}>
                            <span>
                              Membalas <b>{escapeHtml(k.warung_nama)}</b>
                            </span>
                            <button type="button" style={{ ...GAYA_TOMBOL_BALAS, margin: 0, color: '#e5484d' }} onClick={() => setBalasKe(null)}>
                              Batal
                            </button>
                          </div>
                          <form
                            className="balas-form"
                            style={{ marginTop: 6 }}
                            onSubmit={(e) => {
                              e.preventDefault();
                              kirimKomentar(postDetail.id);
                            }}
                          >
                            <input
                              value={draftKomentar}
                              onChange={(e) => setDraftKomentar(e.target.value)}
                              placeholder={`Balas ${k.warung_nama}…`}
                              autoFocus
                            />
                            <button type="submit" disabled={!draftKomentar.trim()}>
                              Kirim
                            </button>
                          </form>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {daftarKomentar && !daftarKomentar.length && (
            <p className="p-sub" style={{ fontSize: 13, marginTop: 14 }}>
              Belum ada jawaban. Jadi yang pertama jawab!
            </p>
          )}
          {/* Form komentar BARU (bukan balesan) - disembunyiin selagi lagi mode "Balas" (form
              inline di atas yang jadi fokusnya, biar nggak ada 2 kotak ketik keliatan bareng). */}
          {!balasKe && (
          <form
            className="balas-form"
            onSubmit={(e) => {
              e.preventDefault();
              kirimKomentar(postDetail.id);
            }}
          >
            <input value={draftKomentar} onChange={(e) => setDraftKomentar(e.target.value)} placeholder="Tulis jawaban…" autoFocus />
            <button type="submit" disabled={!draftKomentar.trim()}>
              Kirim
            </button>
          </form>
          )}
        </div>
      )}

      {/* Popup konfirmasi hapus - gantiin window.confirm() bawaan browser biar tampilannya nyatu
          sama desain app (reuse Sheet yang sama kayak popup lain, contoh SheetOk di SharedSheets.jsx) */}
      {confirmHapus && (
        <Sheet center mid>
          <h3>{confirmHapus.tipe === 'post' ? 'Hapus postingan?' : 'Hapus jawaban?'}</h3>
          <p>Tindakan ini nggak bisa dibatalin.</p>
          <button className="btn utama" style={{ width: '100%', marginTop: 20, background: '#e5484d', color: '#fff' }} onClick={jalankanHapus}>
            Ya, hapus
          </button>
          <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={() => setConfirmHapus(null)}>
            Batal
          </button>
        </Sheet>
      )}
    </>
  );
}
