import { createContext, useContext, useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { api, sesi } from '../lib/api';
import { inisial, escapeHtml } from '../lib/format';
import { simpanSemuaKeCache, muatSemuaDariCache } from '../lib/dataCache';
import { getMeta, setMeta, hapusCacheWarung } from '../lib/localdb';
import { tambahKeOutbox, hapusDariOutbox, ambilOutboxPending, prosesOutbox } from '../lib/outbox';

// Preferensi tampilan itu per-HP (tema/warna/font/ukuran), jadi tetap disimpan lokal di
// localStorage — nggak perlu disinkronkan ke server. Semua data warung yang sebenarnya
// (produk, transaksi, kasbon, dst.) sekarang datang dari backend, TAPI juga di-cache ke
// IndexedDB (lihat lib/localdb.js + lib/dataCache.js) biar app tetap kepake baca & catat
// transaksi walau internet putus sebentar — server tetap source of truth permanen.
const PREFS_KEY = 'warungpintar_prefs_v1';

// Aksi tulis yang BELUM aman diantre offline - backend-nya belum punya jaminan "aman dikirim
// ulang tanpa efek dobel" (client_id UNIQUE) kayak yang udah ada di transaksi bayar/kasbon
// (Tingkat A, lihat SELESAI_BAYAR/CATAT_KASBON di dispatch()). Kalau dipaksa jalan offline
// sekarang, request yang keulang bisa motong stok/nge-lunasin kasbon 2x. Jadi ini WAJIB online -
// nambah client_id + pola cek-dulu-baru-insert ke endpoint-nya masing-masing adalah kerjaan
// fase 2 terpisah (backlog), baru abis itu action-nya boleh "naik kelas" ke outbox kayak Tingkat A.
const AKSI_WAJIB_ONLINE = new Set([
  'LUNASI_KASBON',
  'BAYAR_UTANG_PELANGGAN',
  'BAYAR_SEBAGIAN_KASBON',
  'TAMBAH_PELANGGAN',
  'MASUK_STOK',
  'UBAH_PRODUK',
  'HAPUS_PRODUK',
  'SIMPAN_OPNAME',
  'TERAPKAN_NOTA',
  'SERAH_TERIMA',
  'TAMBAH_PENJAGA',
  'PILIH_PENJAGA',
  'KOSONGKAN_PENJAGA',
]);

function prefsAwal() {
  return { tema: 't-mono', warna: '#ffc001', font: 'Inter', ukuran: 'sedang', pin: '1234' };
}
function muatPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...prefsAwal(), ...JSON.parse(raw) } : prefsAwal();
  } catch {
    return prefsAwal();
  }
}

function dataKosong() {
  return {
    penjagaAktif: null,
    penjagaList: [],
    produk: [],
    kasbon: [],
    pelanggan: [],
    transaksi: [],
    riwayatJaga: [],
    masukLog: [],
    modalLog: [],
    ngendap: [],
    terjual: {},
    untung: 0,
    omzetHariIni: 0,
    trx: 0,
  };
}

// ---- normalisasi respons backend ke bentuk yang sudah dipakai layar-layar (biar screen nggak perlu diubah) ----
function hariRelatif(iso) {
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const diff = Math.round((startOf(new Date()) - startOf(new Date(iso))) / 86400000);
  if (diff <= 0) return 'Baru saja';
  if (diff === 1) return 'Kemarin';
  return `${diff} hari lalu`;
}
const hariIniKah = (iso) => new Date(iso).toDateString() === new Date().toDateString();

function normProduk(r) {
  const harga = Number(r.harga);
  const modal = Number(r.modal);
  return {
    id: r.id,
    nama: r.nama,
    kat: r.kategori,
    barcode: r.barcode,
    harga,
    modal,
    untung: harga - modal,
    stok: r.stok,
    laku: Number(r.laku_per_hari) || 0,
    satuan: r.satuan || 'pcs',
    isiKemasan: Number(r.isi_kemasan) || 1,
    namaKemasan: r.nama_kemasan || null,
    grup: r.grup || null,
    foto: r.foto_url || null,
  };
}
function normKasbon(r) {
  return {
    id: r.id,
    pelangganId: r.pelanggan_id,
    ini: inisial(r.nama),
    nama: r.nama,
    hari: hariRelatif(r.dibuat_pada),
    jml: Number(r.jumlah),
    lunas: r.lunas,
    baru: hariIniKah(r.dibuat_pada),
  };
}
function normPelanggan(r) {
  return {
    id: r.id,
    nama: r.nama,
    wa: r.wa || '',
    foto: r.foto_url || null,
    totalUtang: Number(r.total_utang || 0),
    punyaWajah: !!r.punya_wajah,
  };
}
function normRiwayat(r) {
  return {
    waktu: r.waktu,
    dari: r.dari,
    ke: r.ke,
    uang: Number(r.uang_laci),
    jual: Number(r.penjualan_tunai),
    // Selisih laci vs penjualan tunai - INTINYA fitur ini ("deteksi selisih otomatis"), tapi dulu
    // cuma disimpen di database & nggak pernah sampai ke layar mana pun. Jadi uang kurang nggak
    // pernah ketauan siapa pun, padahal angkanya udah dihitung tiap serah terima.
    selisih: Number(r.selisih),
    trx: r.total_transaksi,
    habis: (r.stok_habis || []).map((x) => x.nama),
    // Nominalnya dibiarin ANGKA di sini, diformat pas ditampilin - dulu digabung jadi teks di
    // sini juga, hasilnya "Bu Sri 12000" mentah di layar Riwayat jaga.
    utangBaru: (r.utang_baru || []).map((x) => ({ nama: x.nama, jml: Number(x.jumlah) })),
  };
}
function normTransaksi(r) {
  return {
    waktu: r.waktu,
    total: Number(r.total),
    laba: Number(r.laba),
    mode: r.mode,
    oleh: r.penjaga_nama || '-',
    pembeli: r.pembeli_nama || null,
    items: (r.items || []).map((it) => `${it.qty}x ${it.nama_produk}`),
  };
}
function normLog(r) {
  return { waktu: r.waktu, ket: r.keterangan, jml: Number(r.jumlah), metode: r.metode };
}

// Bangun bentuk state `S` dari raw rows (dari API ATAU dari cache lokal - dua-duanya bentuknya
// identik). Dipisah jadi fungsi murni terpisah biar refreshData() (fetch dari server) dan
// muatDariCache() (baca dari IndexedDB) bisa reuse logic normalisasi yang sama persis, nggak
// duplikasi.
function bangunState({ produkRows, kasbonRows, pelangganRows, riwayatRows, penjagaR, masukRows, modalRows, trxRows, larisRows, ngendapRows }) {
  const transaksi = trxRows.map(normTransaksi);
  const hariIni = new Date().toDateString();
  const trxHariIni = transaksi.filter((t) => new Date(t.waktu).toDateString() === hariIni);
  const terjual = Object.fromEntries(larisRows.map((r) => [r.produk_id, Number(r.total_qty)]));

  return {
    penjagaAktif: penjagaR.find((p) => p.aktif)?.nama || null,
    penjagaList: penjagaR.map((p) => p.nama),
    produk: produkRows.map(normProduk),
    kasbon: kasbonRows.map(normKasbon),
    pelanggan: pelangganRows.map(normPelanggan),
    transaksi,
    riwayatJaga: riwayatRows.map(normRiwayat),
    masukLog: masukRows.map(normLog),
    modalLog: modalRows.map(normLog),
    ngendap: ngendapRows.map((r) => ({ id: r.id, nama: r.nama, stok: r.stok, terakhirLaku: r.terakhir_laku })),
    terjual,
    untung: trxHariIni.reduce((a, t) => a + t.laba, 0),
    // Omzet hari ini - duit yang MASUK, beda dari `untung` (laba). Dipakai buat progress target
    // setoran di layar Catat jualan: yang dibandingin sama target itu isi laci, bukan labanya.
    // Transaksi kasbon TIDAK dihitung: barangnya keluar tapi duitnya belum masuk, jadi kalau ikut
    // dijumlah, target kelihatan kekejar padahal lacinya masih kosong.
    omzetHariIni: trxHariIni.filter((t) => t.mode !== 'kasbon').reduce((a, t) => a + t.total, 0),
    trx: trxHariIni.length,
  };
}

const AppCtx = createContext(null);

export function AppProvider({ children }) {
  const [prefs, setPrefs] = useState(muatPrefs);
  const [S, setS] = useState(dataKosong);
  const [penjagaRows, setPenjagaRows] = useState([]); // {id,nama,aktif} dari backend - buat cari id dari nama

  const [authWarung, setAuthWarung] = useState(sesi.warung);
  const [authLoading, setAuthLoading] = useState(!!sesi.token());
  const authed = !!authWarung && !!sesi.token();
  const [lisensi, setLisensi] = useState(null); // {plan, berlakuSampai, aktif, dicekPada} | null = belum dicek
  // Popup "berhasil upgrade" - sengaja state sendiri, BUKAN toast. Bayar langganan itu momen yang
  // paling perlu dikonfirmasi jelas ke pemilik warung (dia baru ngeluarin duit) - toast kecil yang
  // ilang sendiri gampang kelewat, dan kalau kelewat dia bakal ngira pembayarannya gagal.
  const [upgradeSukses, setUpgradeSukses] = useState(null); // {plan, berlakuSampai} | null
  // Target setoran HARIAN. Ditaruh di context (bukan state lokal layar Catat) supaya bisa dipasang
  // dari dua arah: tombol di layar itu sendiri, ATAU lewat chat Mang AI ("catat penjualan hari ini
  // 900rb").
  //
  // Dulu cuma angka di memori & ilang tiap reload. Sekarang DISIMPAN KE SERVER per tanggal, karena
  // dia dipakai juga sebagai pembanding di grafik Laporan - tanpa riwayat, grafiknya nggak ada
  // yang mau dibandingin. Efek sampingnya bagus: target yang dipasang pagi tetap kelihatan walau
  // aplikasinya ditutup, atau dibuka dari HP lain yang login akun sama.
  const [targetSetoran, setTargetSetoranLokal] = useState(0);
  const setTargetSetoran = useCallback((n) => {
    const angka = Math.max(0, Number(n) || 0);
    setTargetSetoranLokal(angka); // tampilan diperbarui DULU biar kerasa instan
    // Sengaja nggak di-await & kegagalannya ditelan: target gagal kesimpen cuma bikin dia ilang
    // pas reload berikutnya, bukan alasan buat nge-block pemilik warung yang lagi ngitung laci.
    api.laporan.pasangTarget(angka).catch(() => {});
  }, []);

  // Status sinkronisasi cache lokal - dipakai buat badge di PhoneShell.jsx. 'online' = data
  // barusan berhasil disinkron ke server. 'offline' = lagi pakai data cache (fetch terakhir
  // gagal karena nggak ada koneksi, bukan karena ditolak server). 'syncing' = lagi proses fetch.
  const [syncStatus, setSyncStatus] = useState('syncing');
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [outboxCount, setOutboxCount] = useState(0);
  // true kalau device ini BELUM PERNAH tervalidasi lisensinya sama sekali (nggak ada cache) DAN
  // lagi offline - kondisi ini diblokir total (bukan disuguhin app pakai data kosong), biar akun
  // yang token-nya dicuri/kedaluwarsa nggak bisa dipakai selamanya tanpa pernah nyentuh server.
  const [perluOnlineDuluan, setPerluOnlineDuluan] = useState(false);

  // Keranjang DISIMPAN di localStorage, bukan cuma di memori. Dulu cuma useState kosong: begitu
  // halaman ke-reload (HP kehabisan memori terus browser buang tab-nya, kepencet refresh, atau
  // aplikasi ditinggal lama lalu dibuka lagi) barang yang udah disebut satu per satu HILANG dan
  // pemilik warung harus ngulang dari nol - padahal pembelinya lagi nunggu di depan.
  //
  // Ini BUKAN berarti keranjang masuk database: dia baru jadi transaksi beneran waktu ditekan
  // Bayar/Kasbon (lihat SELESAI_BAYAR/CATAT_KASBON). Yang disimpan di sini cuma "belanjaan yang
  // lagi disusun", murni lokal di HP itu.
  //
  // Dipisah per warung, alasannya sama kayak riwayat chat: satu HP bisa dipakai login akun beda
  // (apalagi buat demo), dan keranjang warung lain nyangkut di akun berikutnya itu bikin kacau.
  const [cart, setCart] = useState({});
  const [pelangganTerpilih, setPelangganTerpilih] = useState(null);
  const [screen, setScreen] = useState('s-home');
  const [toastMsg, setToastMsg] = useState(null);
  const [okInfo, setOkInfo] = useState(null); // {judul, pesan}
  const [lunasInfo, setLunasInfo] = useState(null); // {judul, pesan, onPilih}
  const [pelangganFormOpen, setPelangganFormOpen] = useState(false);
  const [kuotaAiInfo, setKuotaAiInfo] = useState(null); // {pesan} - null = sheet-nya ketutup
  const toastTimer = useRef();

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* penuh / diblokir — abaikan */
    }
  }, [prefs]);

  const toast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2600);
  }, []);

  const goTo = useCallback((id) => setScreen(id), []);
  const openOk = useCallback((judul, pesan) => setOkInfo({ judul, pesan }), []);
  const closeOk = useCallback(() => setOkInfo(null), []);
  const openLunas = useCallback((judul, pesan, onPilih) => setLunasInfo({ judul, pesan, onPilih }), []);
  const closeLunas = useCallback(() => setLunasInfo(null), []);
  const closeKuotaAi = useCallback(() => setKuotaAiInfo(null), []);

  // Dipanggil dari catch block fitur AI scan/nota/suara (BUKAN chat Mang AI - itu nggak kena jatah,
  // lihat komentar di aiQuota.service.js backend) - kalau errornya spesifik "jatah AI harian habis"
  // (flag `jatahAiHabis`, lihat lib/api.js & errorHandler.js backend), munculin sheet ajakan upgrade
  // plan (SheetKuotaAiHabis di SharedSheets.jsx) BUKAN toast biasa - biar user jelas ngerti kenapa &
  // ada jalan keluarnya (bukan cuma "gagal, coba lagi" yang bikin nyoba-nyoba berkali-kali percuma).
  // Error AI LAIN (network/timeout/dst) tetep toast biasa kayak sebelumnya.
  const tanganiErrorAi = useCallback(
    (e) => {
      if (e?.jatahAiHabis) {
        setKuotaAiInfo({ pesan: e.message });
      } else {
        toast(e?.message ? e.message : 'Gagal memproses lewat AI, coba lagi ya.');
      }
    },
    [toast]
  );

  // ---- cache lokal dulu (instant, tanpa network) - dipanggil paling awal pas app mount ----
  const muatDariCache = useCallback(async () => {
    const raw = await muatSemuaDariCache();
    // cache kosong total (device baru pertama kali) - jangan timpa dataKosong() dengan hasil
    // bangunState() yang isinya bakal kosong juga sih, tapi skip aja biar jelas niatnya
    if (!raw.produkRows.length && !raw.kasbonRows.length && !raw.trxRows.length && !raw.pelangganRows.length) return false;
    setPenjagaRows(raw.penjagaR);
    setS(bangunState(raw));
    return true;
  }, []);

  // ---- ambil semua data warung dari backend, sinkron ke cache lokal ----
  const refreshData = useCallback(async () => {
    setSyncStatus('syncing');
    let rows;
    try {
      const [produkRows, kasbonRows, pelangganRows, riwayatRows, penjagaR, masukRows, modalRows, trxRows, larisRows, ngendapRows] = await Promise.all([
        api.produk.list(),
        api.kasbon.list(),
        api.pelanggan.list(),
        api.jaga.riwayat(),
        api.penjaga.list(),
        api.laporan.kas('masuk'),
        api.laporan.kas('modal'),
        api.transaksi.list(150),
        api.laporan.laris(),
        api.laporan.ngendap(),
      ]);
      rows = { produkRows, kasbonRows, pelangganRows, riwayatRows, penjagaR, masukRows, modalRows, trxRows, larisRows, ngendapRows };
    } catch (e) {
      // error network murni (offline/nggak nyampe server) TIDAK punya e.status (lihat api.js
      // req() baris ~40) - beda dari error HTTP (401/402/dst) yang PUNYA e.status. Kalau ini
      // network murni, JANGAN ubah S sama sekali, biarin tetap isi cache yang udah kepajang
      // dari muatDariCache() - cuma tandain status offline. Error lain (401/402) dilempar lagi
      // ke pemanggil (useEffect authed) yang emang udah nangenin itu (logout/toast).
      if (e.status === undefined) {
        setSyncStatus('offline');
        return;
      }
      throw e;
    }

    setPenjagaRows(rows.penjagaR);
    setS(bangunState(rows));
    setSyncStatus('online');
    const waktu = Date.now();
    setLastSyncAt(waktu);
    await simpanSemuaKeCache(rows);
    await setMeta('lastSync', { waktu });
  }, []);

  // Setiap kali beneran berhasil ngecek ke server, hasilnya di-cache ke `meta` (IndexedDB)
  // lengkap sama timestamp `dicekPada` - dipakai buat render app pakai cache pas offline
  // (lihat cekAksesAwal di bawah) tanpa nunggu blocking network call.
  const cekLisensi = useCallback(async () => {
    const st = await api.lisensi.status();
    const withTs = { ...st, dicekPada: Date.now() };
    setLisensi(withTs);
    await setMeta('lisensi', withTs);
    return withTs;
  }, []);

  // Flow akses awal (dipanggil dari effect di bawah, JUGA dari tombol "Coba lagi" pas keblokir
  // "perlu online dulu" - makanya dipisah jadi fungsi sendiri, bukan ditulis inline di effect).
  const cekAksesAwal = useCallback(async () => {
    setPerluOnlineDuluan(false);
    const cached = await getMeta('lisensi');
    if (cached) {
      // Udah pernah tervalidasi sebelumnya (kapan pun) - render app (atau LisensiHabis kalau
      // cache-nya bilang udah nggak aktif) pakai data ini DULU, jangan nge-block nunggu network.
      // Server tetap "menang" begitu cekLisensi() di bawah berhasil - kalau ternyata beda,
      // setLisensi() di situ bakal nimpa nilai ini.
      setLisensi(cached);
      await muatDariCache();
      setAuthLoading(false);
    } else {
      setAuthLoading(true); // beneran pertama kali - nggak ada apa pun buat ditampilin dulu
    }

    try {
      // cek lisensi ke server — endpoint data lain (produk, transaksi, dst.) digembok 402 kalau
      // habis, jadi nggak ada gunanya manggil semuanya kalau ternyata lisensinya kedaluwarsa
      const st = await cekLisensi();
      if (st.aktif) await refreshData();
    } catch (e) {
      if (e.status === 401) {
        // token kedaluwarsa/nggak valid — balik ke layar masuk
        sesi.hapus();
        setAuthWarung(null);
        return;
      }
      if (e.status === undefined) {
        // network error murni (offline) - bukan ditolak server. Kalau nggak ada history sama
        // sekali, device ini belum pernah tervalidasi -> blokir total. Kalau ada history, biarin
        // app jalan pakai cache yang udah di-render di atas, jangan toast generic yang bikin
        // kesan error padahal ini emang perilaku offline yang diharapkan.
        setSyncStatus('offline');
        if (!cached) setPerluOnlineDuluan(true);
        return;
      }
      toast(e.message ? escapeHtml(e.message) : 'Gagal memuat data dari server');
    } finally {
      setAuthLoading(false);
    }
  }, [cekLisensi, muatDariCache, refreshData, toast]);

  useEffect(() => {
    if (!authed) return;
    cekAksesAwal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  // Kalau baru balik dari halaman pembayaran Midtrans (?lisensi=selesai di URL), bersihin URL-nya
  // terus cek ulang status lisensi — kasih jeda dikit-dikit karena webhook Midtrans kadang butuh
  // beberapa detik buat sampai duluan sebelum browser pelanggan balik ke sini.
  useEffect(() => {
    if (!authed) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('lisensi') !== 'selesai') return;
    window.history.replaceState({}, '', window.location.pathname);
    let batal = false;
    const coba = async (sisaPercobaan) => {
      // Nanya LANGSUNG ke Midtrans lewat backend, nggak cuma baca ulang status lokal. Dulu di sini
      // cuma cekLisensi() - itu cuma baca apa yang UDAH ditulis webhook ke database, jadi kalau
      // webhook-nya nggak nyampe (selalu kejadian di localhost) angkanya nggak akan pernah berubah
      // berapa kali pun dicek ulang. /sinkron yang beneran mastiin ke Midtrans.
      const hasil = await api.lisensi.sinkron().catch(() => null);
      if (batal) return;
      const st = await cekLisensi().catch(() => null);
      if (batal || !st) return;

      // Dulu syaratnya `st.aktif` - itu SALAH: akun trial yang belum bayar sepeser pun juga
      // "aktif" (lisensinya belum lewat tanggal), jadi popup suksesnya bisa muncul padahal nggak
      // ada yang berubah. Yang bener nanya "ada pembayaran yang BARU diaktifkan nggak?".
      if (hasil?.adaPerubahan) {
        setUpgradeSukses({ plan: st.plan, berlakuSampai: st.berlakuSampai });
        refreshData().catch(() => {});
      } else if (sisaPercobaan > 0) {
        setTimeout(() => coba(sisaPercobaan - 1), 3000);
      }
    };
    coba(4);
    return () => {
      batal = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  // Cache lokal (IndexedDB + riwayat chat) itu SATU buat seluruh app, nggak dipisah per warung.
  // Jadi tiap kali warung yang login BERGANTI, sisa punya warung sebelumnya wajib dibuang - kalau
  // nggak, pemilik warung B bakal ngeliat produk/kasbon/pelanggan warung A di HP yang sama (dan
  // riwayat obrolan Mang AI-nya juga kebawa, padahal itu ikut dikirim ke AI sebagai konteks).
  //
  // Penanda warung terakhir disimpen di localStorage, BUKAN di IndexedDB yang mau dihapus itu
  // sendiri - biar nggak ikut kebersihan & jadi nggak pernah nyadar ada pergantian.
  const pastikanCacheMilikWarungIni = useCallback(async (warungId) => {
    const KUNCI = 'warungpintar_warung_terakhir';
    let sebelumnya = null;
    try {
      sebelumnya = localStorage.getItem(KUNCI);
    } catch {
      /* mode privat - anggap aja beda, lebih aman kebanyakan bersih daripada kebocoran */
    }
    if (sebelumnya && sebelumnya !== warungId) {
      await hapusCacheWarung();
      setS(dataKosong());
      setPenjagaRows([]);
    }
    try {
      localStorage.setItem(KUNCI, warungId);
    } catch {
      /* nggak bisa nyimpen penanda - efeknya cuma kebersihan berlebih di login berikutnya */
    }
  }, []);

  // Tarik target hari ini tiap kali warung yang login berganti (termasuk saat pertama masuk).
  useEffect(() => {
    if (!authed) return;
    let batal = false;
    api.laporan
      .targetHariIni()
      .then((t) => {
        if (!batal) setTargetSetoranLokal(Number(t?.jumlah) || 0);
      })
      .catch(() => {});
    return () => {
      batal = true;
    };
  }, [authed, authWarung?.id]);

  // Muat keranjang milik warung yang lagi login, dan simpan tiap kali berubah.
  const cartKey = authWarung?.id ? `warungpintar_cart_${authWarung.id}` : null;
  useEffect(() => {
    if (!cartKey) return;
    try {
      const tersimpan = JSON.parse(localStorage.getItem(cartKey) || 'null');
      setCart(tersimpan && typeof tersimpan === 'object' ? tersimpan : {});
    } catch {
      setCart({});
    }
  }, [cartKey]);
  useEffect(() => {
    if (!cartKey) return;
    try {
      // Keranjang kosong dihapus aja, jangan nyimpen "{}" - biar localStorage nggak penuh sampah
      // dari akun yang cuma sekali dipakai.
      if (Object.keys(cart).length) localStorage.setItem(cartKey, JSON.stringify(cart));
      else localStorage.removeItem(cartKey);
    } catch {
      /* mode privat/kuota penuh - keranjang cuma nggak kesimpen, bukan alasan gagalin apa pun */
    }
  }, [cart, cartKey]);

  // ---- autentikasi akun warung ----
  const login = useCallback(async (username, password) => {
    const { warung, token } = await api.login(username, password);
    await pastikanCacheMilikWarungIni(warung.id);
    sesi.simpan(token, warung);
    setAuthWarung(warung);
  }, [pastikanCacheMilikWarungIni]);
  const register = useCallback(async (namaWarung, username, password, noHp) => {
    const { warung, token } = await api.register(namaWarung, username, password, noHp);
    await pastikanCacheMilikWarungIni(warung.id);
    sesi.simpan(token, warung);
    setAuthWarung(warung);
  }, [pastikanCacheMilikWarungIni]);
  const logout = useCallback(() => {
    sesi.hapus();
    setAuthWarung(null);
    setLisensi(null);
    setS(dataKosong());
    setPenjagaRows([]);
    setCart({});
    setPelangganTerpilih(null);
    setScreen('s-home');
  }, []);
  const gantiPassword = useCallback((lama, baru) => api.gantiPassword(lama, baru), []);
  // Nomor HP disimpan ulang ke sesi lokal juga - layar Akun baca dari authWarung, kalau nggak
  // disegarkan di sini nomornya baru keliatan berubah setelah logout-login.
  const gantiNoHp = useCallback(async (password, noHp) => {
    const { noHp: tersimpan } = await api.gantiNoHp(password, noHp);
    setAuthWarung((w) => {
      const baru = { ...w, noHp: tersimpan };
      sesi.simpan(sesi.token(), baru);
      return baru;
    });
  }, []);

  // ---- lisensi/langganan (dijual dari landing page Konsulin, dibayar lewat Midtrans) ----
  // Buka halaman pembayaran Midtrans Snap di tab yang sama — begitu selesai, Midtrans balikin
  // pelanggan ke app ini lagi lewat ?lisensi=selesai (lihat efek cekLisensi di atas).
  const mulaiCheckout = useCallback(async (plan) => {
    const { redirectUrl } = await api.lisensi.checkout(plan);
    window.location.href = redirectUrl;
  }, []);

  // ---- keranjang belanja (murni state lokal, sama seperti sebelumnya) ----
  const produkById = useMemo(() => Object.fromEntries(S.produk.map((p) => [p.id, p])), [S.produk]);
  const tambah = useCallback(
    (id, qty = 1, diam = false) => {
      const p = produkById[id];
      if (!p) return;
      setCart((c) => {
        const sudah = c[id] || 0;
        let q = qty;
        if (p.stok - sudah < q) {
          toast(`<b>${escapeHtml(p.nama)}</b> stok tinggal ${p.stok}`);
          q = Math.max(0, p.stok - sudah);
          if (!q) return c;
        }
        const next = { ...c, [id]: sudah + q };
        if (!diam) {
          const total = Object.entries(next).reduce((a, [pid, n]) => a + produkById[pid].harga * n, 0);
          toast(`${q}× ${escapeHtml(p.nama)} - total <b>${rupiahCepat(total)}</b>`);
        }
        return next;
      });
    },
    [produkById, toast]
  );
  const kurang = useCallback((id) => {
    setCart((c) => {
      if (!c[id]) return c;
      const n = c[id] - 1;
      const next = { ...c };
      if (n <= 0) delete next[id];
      else next[id] = n;
      return next;
    });
  }, []);
  const kosongkanCart = useCallback(() => setCart({}), []);
  const totalCart = useMemo(
    () => Object.entries(cart).reduce((a, [id, q]) => a + (produkById[id]?.harga || 0) * q, 0),
    [cart, produkById]
  );

  // ---- dispatch: aksi yang ubah data beneran manggil backend lalu refresh; SET_TEMA dkk tetap lokal ----
  const dispatch = useCallback(
    async (action) => {
      // aksi yang belum aman diantre offline (lihat AKSI_WAJIB_ONLINE) - tolak DI SINI dulu,
      // sebelum sempat manggil api.xxx() sama sekali, biar nggak dapet error network yang
      // membingungkan (pesannya beda & lebih jelas daripada "Tidak bisa menghubungi server...")
      if (AKSI_WAJIB_ONLINE.has(action.type) && !navigator.onLine) {
        // Banyak pemanggil dispatch() nggak nge-await & langsung nampilin toast sukses optimis
        // (pola lama, sebelum fitur offline ini ada — lihat misal bukaLunasi() di Beranda.jsx).
        // Karena async function jalan SINKRON sampai await pertama, toast di sini bakal langsung
        // ketimpa toast optimis itu di tick yang sama (React batch keduanya, cuma nilai terakhir
        // yang kepakai). setTimeout 0 dorong toast ini ke macrotask BERIKUTNYA, jadi jadi
        // "pemenang" terakhir & beneran kelihatan, bukan senyap ketiban.
        setTimeout(() => toast('Perlu koneksi internet buat aksi ini'), 0);
        return;
      }
      try {
        switch (action.type) {
          case 'SET_TEMA':
            return setPrefs((p) => ({ ...p, tema: action.tema }));
          case 'SET_WARNA':
            return setPrefs((p) => ({ ...p, warna: action.warna }));
          case 'SET_FONT':
            return setPrefs((p) => ({ ...p, font: action.font }));
          case 'SET_UKURAN':
            return setPrefs((p) => ({ ...p, ukuran: action.ukuran }));
          case 'SET_PIN':
            return setPrefs((p) => ({ ...p, pin: action.pin }));

          case 'PILIH_PENJAGA': {
            const row = penjagaRows.find((p) => p.nama === action.nama);
            if (row) await api.penjaga.pilih(row.id);
            setS((s) => ({ ...s, penjagaAktif: action.nama }));
            return;
          }
          case 'TAMBAH_PENJAGA': {
            // Nama kembar ditolak server (409) - error-nya naik ke catch di bawah & jadi toast.
            const row = await api.penjaga.tambah(action.nama);
            setPenjagaRows((rs) => [...rs, row]);
            setS((s) => ({ ...s, penjagaList: [...s.penjagaList, row.nama] }));
            return true;
          }
          case 'KOSONGKAN_PENJAGA': {
            await api.penjaga.kosongkan();
            setS((s) => ({ ...s, penjagaAktif: null }));
            return;
          }

          // Tingkat A: satu-satunya 2 aksi yang aman diantre offline, karena backend udah punya
          // jaminan idempotency lewat client_id UNIQUE (simpanTransaksi() di transaksi.routes.js
          // - kirim ulang client_id yang sama balikin data lama, bukan insert/potong stok dobel).
          // Alurnya: update UI OPTIMISTIC duluan (biar kasir bisa lanjut jualan tanpa nunggu),
          // simpen ke outbox, baru coba kirim ke server. Gagal karena OFFLINE -> biarin nongkrong
          // di outbox, optimistic update TETAP (transaksi udah "tercatat" lokal). Gagal karena
          // HTTP error beneran (401/402/dst) -> BUKAN soal koneksi, rollback + jangan diantre.
          case 'SELESAI_BAYAR':
          case 'CATAT_KASBON': {
            const isKasbon = action.type === 'CATAT_KASBON';
            const clientId = crypto.randomUUID();
            const payload = {
              items: action.items.map(({ id, qty }) => ({ produkId: id, qty })),
              ...(isKasbon ? {} : { metode: action.metode }),
              pembeliNama: action.pembeli || undefined,
              pembeliId: action.pembeliId || undefined,
              penjagaNama: S.penjagaAktif || undefined,
              clientId,
            };

            const total = action.items.reduce((a, { id, qty }) => a + (produkById[id]?.harga || 0) * qty, 0);
            // kasbon: laba dicatat 0 dulu (sama kayak backend) - baru "terealisasi" pas utangnya
            // dilunasin, bukan pas utangnya dibuat
            const laba = isKasbon ? 0 : action.items.reduce((a, { id, qty }) => a + (produkById[id]?.untung || 0) * qty, 0);
            const itemsTeks = action.items.map(({ id, qty }) => `${qty}x ${produkById[id]?.nama || '?'}`);
            const waktuIso = new Date().toISOString();
            const hariIni = new Date().toDateString();
            const tambahUntung = new Date(waktuIso).toDateString() === hariIni ? laba : 0;

            setS((s) => ({
              ...s,
              produk: s.produk.map((p) => {
                const it = action.items.find((x) => x.id === p.id);
                return it ? { ...p, stok: p.stok - it.qty } : p;
              }),
              transaksi: [
                { waktu: waktuIso, total, laba, mode: isKasbon ? 'kasbon' : 'bayar', oleh: s.penjagaAktif || '-', pembeli: action.pembeli || null, items: itemsTeks },
                ...s.transaksi,
              ],
              untung: s.untung + tambahUntung,
              trx: s.trx + 1,
              kasbon: isKasbon
                ? [
                    { id: clientId, pelangganId: action.pelangganId || null, ini: inisial(action.pembeli), nama: action.pembeli, hari: 'Baru saja', jml: total, lunas: false, baru: true },
                    ...s.kasbon,
                  ]
                : s.kasbon,
            }));

            const rollback = () =>
              setS((s) => ({
                ...s,
                produk: s.produk.map((p) => {
                  const it = action.items.find((x) => x.id === p.id);
                  return it ? { ...p, stok: p.stok + it.qty } : p;
                }),
                transaksi: s.transaksi.filter((t) => t.waktu !== waktuIso),
                untung: s.untung - tambahUntung,
                trx: s.trx - 1,
                kasbon: isKasbon ? s.kasbon.filter((k) => k.id !== clientId) : s.kasbon,
              }));

            await tambahKeOutbox({ clientId, type: action.type, payload });

            try {
              await (isKasbon ? api.transaksi.kasbon(payload) : api.transaksi.bayar(payload));
              await hapusDariOutbox(clientId);
              await refreshData(); // tarik angka pasti dari server, gantiin yang optimistic tadi
            } catch (e) {
              if (e.status === undefined) {
                // offline murni - biarin di outbox, retry otomatis lewat listener 'online'
                toast('Tersimpan lokal - disinkron otomatis begitu online');
                return;
              }
              // HTTP error beneran (bukan soal koneksi) - transaksinya nggak jadi diproses server,
              // jangan diantre & jangan biarin UI-nya kepajang seolah berhasil
              await hapusDariOutbox(clientId);
              rollback();
              throw e;
            }
            return;
          }
          case 'LUNASI_KASBON': {
            await api.kasbon.lunasi(action.id, action.metode);
            await refreshData();
            return;
          }
          case 'BAYAR_UTANG_PELANGGAN': {
            // bisa lunas total atau cuma sebagian (custom amount) — sisa utangnya tetap kecatat
            await api.kasbon.bayarPelanggan(action.pelangganId, action.jumlah, action.metode);
            await refreshData();
            return;
          }
          case 'BAYAR_SEBAGIAN_KASBON': {
            // sama kayak BAYAR_UTANG_PELANGGAN tapi buat satu baris kasbon spesifik (dari Beranda)
            await api.kasbon.bayarSebagian(action.id, action.jumlah, action.metode);
            await refreshData();
            return;
          }

          case 'TAMBAH_PELANGGAN': {
            await api.pelanggan.tambah({ nama: action.nama, wa: action.wa, fotoUrl: action.foto });
            await refreshData();
            return;
          }

          case 'MASUK_STOK': {
            // bisa {qty, harga} (satuan jual) atau {jumlahKemasan, hargaKemasan} (dus/pack)
            await api.produk.masukStok(action.produkId, action.data || { qty: action.qty, harga: action.harga });
            await refreshData();
            return;
          }
          case 'UBAH_PRODUK': {
            // buat edit field non-stok kayak grup/satuan/isi kemasan (dari sheet opname)
            await api.produk.ubah(action.produkId, action.data);
            await refreshData();
            return;
          }
          case 'HAPUS_PRODUK': {
            // SOFT delete (backend cuma set aktif=false, lihat produk.routes.js) - histori
            // transaksi lama yang masih nyantol ke barang ini tetap utuh.
            // Balikin `true` pas berhasil (bukan cuma `return;`/undefined) - dispatch() nangkep
            // error-nya SENDIRI di catch paling bawah (toast sendiri, nggak pernah throw ke
            // pemanggil), jadi pemanggil (hapusBarang di Stok.jsx) WAJIB ngecek nilai balik ini
            // buat tau beneran berhasil apa nggak, jangan nganggep "nggak ada exception" = sukses.
            await api.produk.hapus(action.produkId);
            await refreshData();
            return true;
          }
          case 'SIMPAN_OPNAME': {
            await api.produk.opname(action.produkId, action.fisik, action.harga);
            await refreshData();
            return;
          }
          case 'TERAPKAN_NOTA': {
            // hasilnya dibalikin (bukan cuma void) - pemanggil (terapkanNota di Chat.jsx, tab Mang
            // AI) butuh tau produk mana yang baru kebentuk dari scan ini, buat disebut di bubble
            // balasannya ("belum ada foto, tambahin nanti dari menu Stok")
            const hasil = await api.nota.terapkan(action.rows);
            await refreshData();
            return hasil;
          }

          case 'SERAH_TERIMA': {
            await api.jaga.serahTerima({ dari: S.penjagaAktif, ke: action.ke, uangLaci: action.uangLaci });
            await refreshData();
            // true = beneran kesimpen. Layarnya (SheetSerah) nungguin ini sebelum bilang
            // "Giliran diserahkan" - dulu toast-nya nongol duluan tanpa nunggu, jadi pas gagal
            // pemilik warung dikasih tau berhasil, terus disusul toast error yang bertentangan.
            return true;
          }

          default:
            return;
        }
      } catch (e) {
        toast(e.message ? escapeHtml(e.message) : 'Gagal menyimpan perubahan - coba lagi');
      }
    },
    [S.penjagaAktif, penjagaRows, refreshData, toast, produkById]
  );

  // ---- coba kirim ulang outbox (Tingkat A) tiap kali koneksi balik ----
  const sinkronkanOutbox = useCallback(async () => {
    await prosesOutbox({ onSukses: () => refreshData().catch(() => {}) });
    const sisa = await ambilOutboxPending();
    setOutboxCount(sisa.length);
  }, [refreshData]);

  useEffect(() => {
    if (!authed) return;
    // cek outbox begitu app dibuka (nutup app pas masih ada antrean, baru dibuka lagi online)
    ambilOutboxPending().then((rows) => {
      setOutboxCount(rows.length);
      if (rows.length && navigator.onLine) sinkronkanOutbox();
    });

    const onOnline = () => {
      sinkronkanOutbox();
      refreshData().catch(() => {});
    };
    window.addEventListener('online', onOnline);
    // jaring pengaman - kadang event 'online' browser nggak selalu akurat/kepicu, jadi tetep
    // dicoba berkala selagi app kebuka & navigator bilang lagi online
    const interval = setInterval(() => {
      if (navigator.onLine) sinkronkanOutbox();
    }, 30000);

    return () => {
      window.removeEventListener('online', onOnline);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  const value = {
    S: { ...S, ...prefs },
    dispatch,
    produkById,
    cart,
    tambah,
    kurang,
    kosongkanCart,
    totalCart,
    pelangganTerpilih,
    setPelangganTerpilih,
    screen,
    goTo,
    toast,
    toastMsg,
    okInfo,
    openOk,
    closeOk,
    lunasInfo,
    openLunas,
    closeLunas,
    pelangganFormOpen,
    setPelangganFormOpen,
    kuotaAiInfo,
    closeKuotaAi,
    tanganiErrorAi,
    authed,
    authWarung,
    authLoading,
    login,
    register,
    logout,
    gantiPassword,
    gantiNoHp,
    refreshData,
    lisensi,
    cekLisensi,
    upgradeSukses,
    targetSetoran,
    setTargetSetoran,
    tutupUpgradeSukses: () => setUpgradeSukses(null),
    mulaiCheckout,
    syncStatus,
    lastSyncAt,
    outboxCount,
    perluOnlineDuluan,
    cobaLagiKoneksi: cekAksesAwal,
  };

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

function rupiahCepat(n) {
  return 'Rp ' + Math.round(n).toLocaleString('id-ID');
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp harus dipakai di dalam <AppProvider>');
  return ctx;
}
