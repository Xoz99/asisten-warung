import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { ProductIcon, Ikon } from '../lib/icons.jsx';
import { rupiah, singkat, tglID, jamID } from '../lib/format';
import { api } from '../lib/api';

// Lengkapin deret harian dari backend (yang cuma balikin hari-hari yang ADA transaksinya)
// jadi n-hari penuh berturut-turut, biar grafik batangnya rata kayak semula.
function deretPenuh(n, offset, sparse, targetSparse = []) {
  const akhir = new Date();
  akhir.setHours(0, 0, 0, 0);
  akhir.setDate(akhir.getDate() - offset * n);
  const byTgl = new Map(sparse.map((r) => [new Date(r.hari).toDateString(), r]));
  // Target dikunci pakai toDateString() yang sama kayak deret transaksi - kolom `tanggal` di
  // database bertipe DATE (tanpa jam), jadi aman dibanding per-hari tanpa urusan zona waktu.
  const byTarget = new Map(targetSparse.map((r) => [new Date(r.tanggal).toDateString(), Number(r.jumlah)]));
  const arr = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(akhir);
    d.setDate(akhir.getDate() - i);
    const match = byTgl.get(d.toDateString());
    arr.push({
      d,
      v: match ? Number(match.untung) : 0,
      omzet: match ? Number(match.omzet) : 0,
      // 0 berarti "hari itu nggak pasang target" - dibedain dari target yang beneran diisi,
      // supaya grafiknya nggak nampilin garis target di hari yang emang nggak ditargetin.
      target: byTarget.get(d.toDateString()) || 0,
    });
  }
  return arr;
}

// Kelompokkan deret HARIAN jadi mingguan - dipakai buat tampilan "1 bulan terakhir" biar grafiknya
// nggak 30 batang sempit berdesakan (cuma kelipatan 5 hari yang kebagian label), tapi ~5 batang
// per minggu yang jauh lebih gampang dibaca. Dikelompokkan MUNDUR dari hari paling baru (data
// array-nya urut lama->baru), jadi minggu paling akhir selalu genap 7 hari; sisa pembagian (kalau
// n bukan kelipatan 7) numpuk di bucket paling awal/lama.
function keMingguan(data) {
  const minggu = [];
  for (let akhir = data.length; akhir > 0; akhir -= 7) {
    const awal = Math.max(0, akhir - 7);
    const chunk = data.slice(awal, akhir);
    minggu.unshift({
      awal: chunk[0].d,
      akhir: chunk[chunk.length - 1].d,
      v: chunk.reduce((a, x) => a + x.v, 0),
      omzet: chunk.reduce((a, x) => a + x.omzet, 0),
      target: chunk.reduce((a, x) => a + x.target, 0),
    });
  }
  return minggu;
}

// Urutan kartu yang digeser di hero. Ditaruh di satu tempat biar nambah/ngurangin tampilan nggak
// perlu nyisir beberapa titik (tombol titik, arah animasi, dan urutan geser) yang gampang kelewat.
const URUT_HERO = ['bar', 'pie', 'target'];

export default function Laporan() {
  const { S } = useApp();
  const [rngN, setRngN] = useState(7);
  const [rngOffset, setRngOffset] = useState(0);
  const [selDay, setSelDay] = useState(null); // index terpilih di grafik
  const [kasJenis, setKasJenis] = useState(null); // null | 'masuk' | 'modal'
  const [ringkasan, setRingkasan] = useState(null);
  const [heroView, setHeroView] = useState('bar'); // 'bar' | 'pie' | 'target' - digeser (swipe) di kartu hero, bukan kartu kepisah
  const [dragX, setDragX] = useState(0); // offset geser transform (px) - JS penuh yang ngatur, bukan CSS keyframe
  const [transisi, setTransisi] = useState(false); // true = transform translateX pakai transisi CSS mulus, false = "teleport" instan (dipakai sesaat pas ganti konten - lihat sentuhSelesai)
  const touchXRef = useRef(null);

  useEffect(() => {
    let hidup = true;
    api.laporan.ringkasan(rngN, rngOffset).then((r) => hidup && setRingkasan(r));
    return () => {
      hidup = false;
    };
  }, [rngN, rngOffset]);

  const data = useMemo(
    () => (ringkasan ? deretPenuh(rngN, rngOffset, ringkasan.deret, ringkasan.target || []) : []),
    [ringkasan, rngN, rngOffset]
  );
  const tot = data.reduce((a, x) => a + x.v, 0);

  // "1 bulan terakhir" ditampilin per MINGGU (~5 batang), bukan 30 batang harian sempit - jauh
  // lebih gampang dibaca. "Per 7 hari" tetap harian seperti biasa (7 batang udah pas).
  const chartRows = useMemo(() => (rngN === 30 ? keMingguan(data) : data), [rngN, data]);
  const max = Math.max(1, ...chartRows.map((x) => x.v));

  const gantiRng = (n) => {
    setRngN(n);
    setRngOffset(0);
    setSelDay(null);
  };

  // Swipe di kartu hero buat gonta-ganti tampilan (grafik batang <-> pie untung vs modal) - kontennya
  // BENERAN NGIKUTIN JARI real-time selagi drag (transisi CSS dimatiin biar translateX-nya 1:1 sama
  // gerakan jari, nggak ketinggalan/nunda). Pas jari dilepas: gesernya kurang jauh (< 40px) = PEGAS
  // BALIK ke tengah (transisi nyala). Gesernya cukup jauh = kartunya keanimasiin NERUSIN keluar
  // layar dulu (masih arah yang sama), abis itu (220ms) baru kontennya diganti + "diteleport" ke
  // sisi seberang TANPA transisi, lalu 2 frame kemudian dianimasiin masuk ke tengah - biar keliatan
  // 1 gerakan geser yang nyambung (keluar dari 1 sisi, masuk dari sisi lain), bukan lompat diem-diem.
  const LEBAR_GESER = 260; // px - seberapa jauh kontennya "keluar layar" pas transisi (approx, kartu-nya sendiri nggak selebar ini di HP kecil, cukup buat kesan "kabur")
  const sentuhMulai = (e) => {
    touchXRef.current = e.touches[0].clientX;
    setTransisi(false);
  };
  const sentuhGerak = (e) => {
    if (touchXRef.current === null) return;
    setDragX(e.touches[0].clientX - touchXRef.current);
  };
  const sentuhSelesai = (e) => {
    if (touchXRef.current === null) return;
    const delta = e.changedTouches[0].clientX - touchXRef.current;
    touchXRef.current = null;
    setTransisi(true);
    if (Math.abs(delta) <= 40) {
      setDragX(0); // batal - pegas balik ke tengah
      return;
    }
    const kanan = delta < 0; // geser ke kiri (delta negatif) = MAJU ke tampilan berikutnya
    setDragX(kanan ? -LEBAR_GESER : LEBAR_GESER); // nerusin keluar layar ke arah geser
    setTimeout(() => {
      // Arah geser IKUT nentuin tampilan mana yang dituju - dulu selalu maju (+1) apa pun arahnya.
      // Waktu tampilannya masih 2, maju & mundur kebetulan sama jadi nggak kerasa. Begitu jadi 3,
      // geser ke kanan tetep maju: kartunya keluar ke kanan lalu konten barunya masuk dari kanan
      // juga - gerakannya jadi patah, nggak nyambung sama jari.
      setHeroView((v) => {
        const i = URUT_HERO.indexOf(v);
        const langkah = kanan ? 1 : -1;
        return URUT_HERO[(i + langkah + URUT_HERO.length) % URUT_HERO.length];
      });
      setTransisi(false);
      setDragX(kanan ? LEBAR_GESER : -LEBAR_GESER); // "teleport" ke sisi seberang, konten baru masuk dari situ
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTransisi(true);
          setDragX(0); // animasiin masuk ke tengah
        });
      });
    }, 220);
  };
  // Sama animasinya kayak sentuhSelesai (keluar-teleport-masuk), buat dot indikator - tap dot BEDA
  // dari yang lagi aktif jalanin transisi yang sama, tap dot yang UDAH aktif nggak ngapa-ngapain.
  const pindahLewatDot = (v) => {
    if (v === heroView) return;
    const kanan = URUT_HERO.indexOf(v) > URUT_HERO.indexOf(heroView);
    setTransisi(true);
    setDragX(kanan ? -LEBAR_GESER : LEBAR_GESER);
    setTimeout(() => {
      setHeroView(v);
      setTransisi(false);
      setDragX(kanan ? LEBAR_GESER : -LEBAR_GESER);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTransisi(true);
          setDragX(0);
        });
      });
    }, 220);
  };

  const labelMinggu = (r) => `Untung ${tglID(r.awal)} – ${tglID(r.akhir)}`;
  const chartLbl =
    selDay !== null
      ? rngN === 30
        ? labelMinggu(chartRows[selDay])
        : 'Untung ' + chartRows[selDay].d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' })
      : rngN === 7
        ? 'Untung 7 hari ini'
        : 'Untung 1 bulan terakhir';
  const chartVal = selDay !== null ? chartRows[selDay].v : tot;

  // Skala grafik target: dipatok ke nilai TERBESAR antara omzet & target di rentang itu - kalau
  // cuma dipatok ke omzet, garis target yang lebih tinggi dari omzet bakal nongol di luar kartu.
  const maxTarget = Math.max(1, ...chartRows.map((x) => Math.max(x.omzet || 0, x.target || 0)));
  const targetTercapai = useMemo(() => {
    const baris = selDay !== null ? [chartRows[selDay]] : chartRows;
    const omzet = baris.reduce((a, x) => a + (x.omzet || 0), 0);
    const target = baris.reduce((a, x) => a + (x.target || 0), 0);
    return { omzet, target, adaTarget: target > 0, persen: target > 0 ? Math.round((omzet / target) * 100) : 0 };
  }, [chartRows, selDay]);

  // Rentang tanggal buat daftar "Transaksi" di bawah - NGIKUTIN batang yang lagi ditap di grafik
  // (dulu selalu hardcode "hari ini" doang, nggak peduli batang mana yang ditap - tap tanggal 6
  // cuma ngubah angka gede di atas, daftar transaksinya tetep nunjukin hari ini). Nggak ada batang
  // yang dipilih (selDay null) = defaultnya tetep hari ini, sama kayak sebelumnya.
  const rentangTrx = useMemo(() => {
    if (selDay === null) {
      const awal = new Date();
      awal.setHours(0, 0, 0, 0);
      const akhir = new Date(awal);
      akhir.setDate(akhir.getDate() + 1);
      return { awal, akhir, label: 'hari ini' };
    }
    const row = chartRows[selDay];
    if (rngN === 30) {
      const awal = new Date(row.awal);
      awal.setHours(0, 0, 0, 0);
      const akhir = new Date(row.akhir);
      akhir.setHours(0, 0, 0, 0);
      akhir.setDate(akhir.getDate() + 1);
      return { awal, akhir, label: `${tglID(row.awal)} – ${tglID(row.akhir)}` };
    }
    const awal = new Date(row.d);
    awal.setHours(0, 0, 0, 0);
    const akhir = new Date(awal);
    akhir.setDate(akhir.getDate() + 1);
    return { awal, akhir, label: row.d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' }) };
  }, [selDay, chartRows, rngN]);
  const trxTerpilih = S.transaksi.filter((t) => {
    const w = new Date(t.waktu);
    return w >= rentangTrx.awal && w < rentangTrx.akhir;
  });
  // Batang "hari ini" (nggak ada yang ditap) tetep dibatesin 8 biar ringkas kayak sebelumnya - tap
  // batang tanggal LAIN nampilin SEMUA transaksi hari/minggu itu (itu yang diminta), nggak dibatesin.
  const trxHariIni = selDay === null ? trxTerpilih.slice(0, 8) : trxTerpilih;

  // Rentang buat "Uang masuk"/"Modal" - BEDA default-nya dari rentangTrx (yang defaultnya "hari
  // ini" doang, buat cek cepet transaksi hari ini) - di sini defaultnya rentang PENUH yang lagi
  // ditampilin di grafik (7 hari/1 bulan, sama kayak chartVal pas nggak ada batang dipilih), biar
  // "Uang masuk"/"Modal" nyambung sama angka Untung gede di atas. Begitu ADA batang yang ditap,
  // ikutan nyempit ke hari/minggu itu doang - SAMA persis kayak rentangTrx (itu yang diminta).
  const rentangKas = selDay === null ? { awal: new Date(ringkasan?.awal || 0), akhir: new Date(ringkasan?.akhir || 0), label: chartLbl } : rentangTrx;
  // Uang masuk & modal beneran dari catatan kas (bukan tebakan) - ikut rentangKas di atas.
  const masuk = S.masukLog.filter((m) => new Date(m.waktu) >= rentangKas.awal && new Date(m.waktu) < rentangKas.akhir).reduce((a, m) => a + m.jml, 0);
  const modal = S.modalLog.filter((m) => new Date(m.waktu) >= rentangKas.awal && new Date(m.waktu) < rentangKas.akhir).reduce((a, m) => a + m.jml, 0);

  // Perbandingan LANGSUNG untung vs modal yang dikeluarin - biar keliatan jelas "untungnya udah
  // nutup modal yang dikeluarin apa belum" (PENTING: modal di sini itu duit keluar buat BELANJA
  // STOK di periode ini - bukan berarti 1:1 sama barang yang KEJUAL di periode yang sama, ada
  // kemungkinan sebagian barangnya belum laku/masih di rak, itu BUKAN rugi, itu aset stok. Untung
  // di sini sebaliknya udah bersih (harga jual dikurang modal PER barang yang laku), jadi
  // perbandingan ini condong ke "kesehatan arus kas" praktis, bukan neraca akuntansi formal).
  const untungKas = chartVal;
  const selisihUntungModal = untungKas - modal;
  // Persentase potongan "Untung" di pie chart - untung di-clamp ke 0 dulu (nggak ada "pie negatif"
  // buat kasus rugi, lihat komentar lengkap di JSX-nya).
  const totalPie = Math.max(untungKas, 0) + modal;
  const persenUntungPie = totalPie > 0 ? (Math.max(untungKas, 0) / totalPie) * 100 : 0;

  const laris = Object.entries(S.terjual)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, n]) => ({ p: S.produk.find((x) => x.id === id), n }))
    .filter((x) => x.p);

  if (!data.length) return null;

  return (
    <>
      <div style={{ paddingTop: 14 }}>
        <p className="p-h1">Untung rugi</p>
        <p className="p-sub">Pilih rentang tanggalnya</p>
      </div>

      <div className="segkecil">
        <button className={rngN === 7 ? 'on' : ''} onClick={() => gantiRng(7)}>
          Per 7 hari
        </button>
        <button className={rngN === 30 ? 'on' : ''} onClick={() => gantiRng(30)}>
          1 bulan terakhir
        </button>
      </div>

      <div className="rangebar">
        <button aria-label="Sebelumnya" onClick={() => setRngOffset((o) => o + 1)}>
          &lsaquo;
        </button>
        <b>
          {tglID(data[0].d)} &ndash; {tglID(data[data.length - 1].d)}
        </b>
        <button
          aria-label="Sesudahnya"
          onClick={() => {
            if (rngOffset > 0) setRngOffset((o) => o - 1);
          }}
        >
          &rsaquo;
        </button>
      </div>

      {/* Kartu hero SEKARANG punya 2 tampilan yang digeser (swipe) - grafik batang untung harian
          (bawaan) & pie untung-vs-modal (baru). Dulu 2 kartu kepisah numpuk vertikal, sekarang
          gantian di 1 kartu yang sama biar layarnya nggak makin panjang, sesuai diminta ("kalo di
          geser diagram pie"). Dot di bawah jadi jalan alternatif tap buat yang nggak sadar bisa
          digeser / lagi pakai mouse (desktop, sentuhMulai/sentuhSelesai nggak kepanggil sama sekali
          pas nggak ada touch event). */}
      {/* .hero-card CSS udah punya overflow:hidden bawaan - konten yang digeser ±LEBAR_GESER pas
          transisi kepotong rapi di tepi kartu, nggak numpuk ke konten lain di bawahnya. */}
      <div className="hero-card" onTouchStart={sentuhMulai} onTouchMove={sentuhGerak} onTouchEnd={sentuhSelesai}>
        <div
          style={{
            transform: `translateX(${dragX}px)`,
            transition: transisi ? 'transform .22s cubic-bezier(.2,.9,.3,1)' : 'none',
          }}
        >
        {/* key={heroView} MEMAKSA React bikin ulang isinya tiap ganti tampilan, bukan dipakai ulang.
            Tanpa ini: struktur 'bar' & 'target' mirip (sama-sama .chart berisi .col > i), jadi React
            nganggep node-nya sama dan cuma nge-update inline height-nya. Akibatnya CSS
            `transition: height .7s` di .col i ikut jalan - batangnya pelan-pelan berubah bentuk
            SELAMA kartunya lagi digeser (0,22 detik). Dua animasi tabrakan dengan durasi beda tiga
            kali lipat, itu yang kerasa patah.
            Dengan key, node lama dibuang & yang baru muncul langsung di tinggi finalnya - nggak ada
            transisi height yang nyangkut, gesernya jadi satu gerakan bersih. */}
        <div key={heroView}>
        {heroView === 'bar' ? (
          <>
            <p className="lbl">{chartLbl}</p>
            <p className="big p-num" style={{ fontSize: 44 }}>
              {rupiah(chartVal)}
            </p>
            <div className="chart">
              {chartRows.map((h, i) => {
                const isSel = selDay === null ? i === chartRows.length - 1 : i === selDay;
                // harian (7 hari): label nama hari. mingguan (1 bulan): cuma ~5 batang jadi semuanya
                // kebagian label, ditampilin tanggal mulai minggunya (mis. "23" buat minggu 23-29).
                const lbl =
                  rngN === 7
                    ? ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'][h.d.getDay()]
                    : String(h.awal.getDate());
                return (
                  <div key={i} className={'col' + (isSel ? ' sel' : '')} onClick={() => setSelDay(i)}>
                    <i style={{ height: (h.v / max) * 100 + '%', borderRadius: rngN > 7 ? '5px 5px 2px 2px' : undefined }} />
                    <span>{lbl}</span>
                  </div>
                );
              })}
            </div>
            <p className="lbl" style={{ marginTop: 14, fontSize: 14 }}>
              {rngN === 30 ? 'Tap batangnya untuk lihat per minggu' : 'Tap batangnya untuk lihat per hari'}
            </p>
          </>
        ) : heroView === 'target' ? (
          // Target vs jualan beneran. Batangnya OMZET (bukan untung) - targetnya emang target
          // setoran/isi laci, jadi yang adil dibandingin ya duit yang masuk, bukan labanya.
          //
          // Garis target digambar sebagai marker di dalam batang, bukan batang kedua di sebelahnya:
          // di HP, 7 pasang batang berdesakan jadi terlalu sempit buat kebaca. Marker di dalam
          // batang bikin "kekejar / nggak" langsung kelihatan sekali lihat.
          <>
            <p className="lbl">Target vs jualan {chartLbl}</p>
            <p className="big p-num" style={{ fontSize: 44 }}>
              {rupiah(targetTercapai.omzet)}
            </p>
            {/* marginTop 2px, bukan -6: angka besarnya 44px & ekor huruf "p" di "Rp" turun cukup
                jauh - ditarik ke atas bikin subjudulnya nabrak. */}
            <p className="lbl" style={{ marginTop: 2 }}>
              {targetTercapai.adaTarget
                ? `dari target ${rupiah(targetTercapai.target)} · ${targetTercapai.persen}% tercapai`
                : 'Belum ada target dipasang di rentang ini'}
            </p>
            <div className="chart">
              {chartRows.map((h, i) => {
                const isSel = selDay === null ? i === chartRows.length - 1 : i === selDay;
                const lbl =
                  rngN === 7
                    ? ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'][h.d ? h.d.getDay() : h.awal.getDay()]
                    : String(h.awal.getDate());
                const tinggiOmzet = (h.omzet / maxTarget) * 100;
                const tinggiTarget = (h.target / maxTarget) * 100;
                const tercapai = h.target > 0 && h.omzet >= h.target;
                return (
                  <div key={i} className={'col' + (isSel ? ' sel' : '')} onClick={() => setSelDay(i)} style={{ position: 'relative' }}>
                    <i
                      style={{
                        height: tinggiOmzet + '%',
                        background: tercapai ? '#4ade80' : undefined,
                      }}
                    />
                    {h.target > 0 && (
                      <span
                        aria-hidden="true"
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          bottom: `calc(${tinggiTarget}% + 22px)`,
                          height: 0,
                          borderTop: '2px dashed rgba(255,255,255,.75)',
                          pointerEvents: 'none',
                        }}
                      />
                    )}
                    <span>{lbl}</span>
                  </div>
                );
              })}
            </div>
            <p className="lbl" style={{ marginTop: 14, fontSize: 14 }}>
              Garis putus-putus = target. Batang hijau = target kekejar.
            </p>
          </>
        ) : (
          // Pie untung vs modal keluar - digambar conic-gradient CSS polos (DIY tanpa library
          // chart, konsisten sama grafik batang di sebelah). Untung NEGATIF (rugi) nggak bisa
          // digambar sebagai potongan pie (nggak ada "pie negatif") - potongan untung-nya di-clamp
          // ke 0 (pie jadi 100% modal), rugi-nya tetep disebutin eksplisit di teks bawah.
          <>
            <p className="lbl">Untung vs modal keluar {rentangKas.label}</p>
            <p className="big p-num" style={{ fontSize: 32, color: selisihUntungModal >= 0 ? '#4ade80' : '#ff8080' }}>
              {selisihUntungModal >= 0 ? '+' : ''}
              {rupiah(selisihUntungModal)}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 6 }}>
              <div
                style={{
                  width: 148,
                  height: 148,
                  borderRadius: '50%',
                  background:
                    persenUntungPie > 0
                      ? `conic-gradient(#4ade80 0 ${persenUntungPie}%, var(--aksen) ${persenUntungPie}% 100%)`
                      : 'var(--aksen)',
                  position: 'relative',
                  flex: 'none',
                }}
              >
                {/* Lubang donat - overlay hitam transparan (bukan nyamain warna background
                    hero-card persis, itu beda-beda tergantung tema terang/gelap & rapuh kalau
                    salah 1 diubah tapi lupa disamain di sini) - tetap kebaca donat di background
                    manapun. */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 20,
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,.55)',
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: 24, marginTop: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 4, background: '#4ade80', flex: 'none' }} />
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.65, fontWeight: 700 }}>Untung</div>
                    <div className="p-num" style={{ fontSize: 15 }}>
                      {rupiah(untungKas)}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 4, background: 'var(--aksen)', flex: 'none' }} />
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.65, fontWeight: 700 }}>Modal keluar</div>
                    <div className="p-num" style={{ fontSize: 15 }}>
                      {rupiah(modal)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <p className="lbl" style={{ marginTop: 14, fontSize: 13, opacity: 0.75 }}>
              {modal === 0
                ? 'Belum ada belanja stok tercatat di periode ini.'
                : selisihUntungModal >= 0
                  ? 'Untung udah nutup modal yang dikeluarin ✓'
                  : 'Untung belum nutup modal - wajar kalau baru belanja stok banyak, belum tentu rugi.'}
            </p>
          </>
        )}
        </div>
        </div>

        {/* Dot indikator tiap tampilan - tap juga bisa, nggak wajib geser */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          {URUT_HERO.map((v) => (
            <button
              key={v}
              type="button"
              aria-label={v === 'bar' ? 'Lihat grafik untung' : v === 'pie' ? 'Lihat pie untung vs modal' : 'Lihat grafik target vs jualan'}
              onClick={() => pindahLewatDot(v)}
              style={{
                width: heroView === v ? 18 : 7,
                height: 7,
                borderRadius: 99,
                border: 0,
                padding: 0,
                cursor: 'pointer',
                background: heroView === v ? 'var(--aksen)' : 'rgba(255,255,255,.3)',
                transition: 'width .2s, background .2s',
              }}
            />
          ))}
        </div>
      </div>

      <div className="bento">
        <div className="tile tap" onClick={() => setKasJenis('masuk')}>
          <Ikon nama="modal" />
          <p className="k">Uang masuk ›</p>
          <p className="v p-num">{singkat(masuk)}</p>
        </div>
        <div className="tile tap" onClick={() => setKasJenis('modal')}>
          <Ikon nama="belanja" />
          <p className="k">Modal ›</p>
          <p className="v p-num">{singkat(modal)}</p>
        </div>
      </div>

      <p className="p-sec">Transaksi {rentangTrx.label}</p>
      <div className="card">
        {trxHariIni.length === 0 && <div className="kosong">Belum ada transaksi tercatat {rentangTrx.label}</div>}
        {trxHariIni.map((x, i) => (
          <div className="item" key={i}>
            <div style={{ flex: 1 }}>
              <div className="nama">{x.items.join(', ')}</div>
              <div className="tgl">
                {jamID(x.waktu)} · {x.oleh}
                {x.mode === 'kasbon' ? ' · kasbon ' + x.pembeli : ''}
              </div>
            </div>
            <div className="kanan p-num">{rupiah(x.total)}</div>
          </div>
        ))}
      </div>

      <p className="p-sec">Paling laris</p>
      <div className="card">
        {laris.length === 0 && <div className="kosong">Belum ada penjualan tercatat</div>}
        {laris.map(({ p, n }, i) => (
          <div className="item" key={p.id}>
            <div className="rk">{i + 1}</div>
            <ProductIcon id={p.id} foto={p.foto} />
            <div className="nama">{p.nama}</div>
            <div className="kanan">
              <span className="p-num">{n}</span>
            </div>
          </div>
        ))}
      </div>

      <p className="p-sec">Ngendap di rak</p>
      <div className="card">
        {S.ngendap.length === 0 && <div className="kosong">Tidak ada barang yang ngendap</div>}
        {S.ngendap.map((p) => (
          <div className="item" key={p.id}>
            <div className="rk dim">—</div>
            <div>
              <div className="nama">{p.nama}</div>
              <div className="tgl">{p.terakhirLaku ? `Laku terakhir ${tglID(p.terakhirLaku)}` : 'Belum pernah laku'}</div>
            </div>
            <div className="kanan">
              <span className="p-num">{p.stok}</span>
            </div>
          </div>
        ))}
      </div>

      {kasJenis && <SheetKas jenis={kasJenis} rentang={rentangKas} onClose={() => setKasJenis(null)} />}
    </>
  );
}

// `rentang` (dari rentangTrx di Laporan()) - detail riwayat di sini SEKARANG ikut kefilter ke
// tanggal/minggu yang lagi dipilih di grafik, SAMA persis kayak angka total yang ditampilin di
// tile "Uang masuk"/"Modal" (dulu tile-nya kefilter ke rentang, tapi sheet detailnya nampilin
// SEMUA riwayat tanpa filter - angkanya nggak nyambung sama daftar yang keliatan pas dibuka).
function SheetKas({ jenis, rentang, onClose }) {
  const { S, refreshData, toast } = useApp();
  const [isiForm, setIsiForm] = useState(false);
  const [jumlah, setJumlah] = useState('');
  const [keterangan, setKeterangan] = useState('');
  const [loading, setLoading] = useState(false);

  // Catat modal MANUAL. Sebelum ini modal_log cuma keisi sebagai efek samping masuk-stok & scan
  // nota - nggak ada cara nyatet "saya nyetor duit ke warung" tanpa ngarang barang dulu.
  const simpanModal = async () => {
    const n = Number(jumlah);
    if (!Number.isFinite(n) || n <= 0) return toast('Jumlah modal harus lebih dari 0');
    setLoading(true);
    try {
      await api.laporan.catatModal(n, keterangan.trim() || 'Modal masuk');
      toast(`Modal <b>${rupiah(n)}</b> dicatat`);
      setJumlah('');
      setKeterangan('');
      setIsiForm(false);
      await refreshData();
    } catch (e) {
      toast(e.message || 'Gagal mencatat modal');
    } finally {
      setLoading(false);
    }
  };

  const baris = (jenis === 'masuk' ? S.masukLog : S.modalLog)
    .filter((b) => new Date(b.waktu) >= rentang.awal && new Date(b.waktu) < rentang.akhir)
    .slice()
    .sort((a, b) => new Date(b.waktu) - new Date(a.waktu));
  const totalSemua = baris.reduce((a, b) => a + b.jml, 0);

  return (
    <div className="sheet show">
      <div className="panel">
        <h3>{jenis === 'masuk' ? 'Riwayat uang masuk' : 'Riwayat modal'}</h3>
        <p>
          {rentang.label} · total {rupiah(totalSemua)}
        </p>
        <div className="card">
          {baris.length === 0 && <div className="kosong">Belum ada catatan</div>}
          {baris.slice(0, 40).map((b, i) => (
            <div className="item" key={i}>
              <div style={{ flex: 1 }}>
                <div className="nama">{b.ket}</div>
                <div className="tgl">
                  {tglID(b.waktu)} · {jenis === 'masuk' ? (b.metode || 'Tunai') + ' · ' + jamID(b.waktu) : jamID(b.waktu)}
                </div>
              </div>
              <div className="kanan p-num">{rupiah(b.jml)}</div>
            </div>
          ))}
        </div>
        {jenis === 'modal' && (
          isiForm ? (
            <>
              <div className="field" style={{ marginTop: 14 }}>
                <label>Jumlah modal masuk (Rp)</label>
                <input type="number" inputMode="numeric" value={jumlah} onChange={(e) => setJumlah(e.target.value)} placeholder="0" />
              </div>
              <div className="field">
                <label>Keterangan (opsional)</label>
                <input value={keterangan} onChange={(e) => setKeterangan(e.target.value)} placeholder="Modal masuk" />
              </div>
              <button className="btn utama" style={{ width: '100%' }} onClick={simpanModal} disabled={loading}>
                {loading ? 'Menyimpan…' : 'Simpan modal'}
              </button>
              <button className="btn" style={{ width: '100%', marginTop: 8 }} onClick={() => setIsiForm(false)}>
                Batal
              </button>
            </>
          ) : (
            <button className="btn utama" style={{ width: '100%', marginTop: 14 }} onClick={() => setIsiForm(true)}>
              + Catat modal masuk
            </button>
          )
        )}
        <button className="btn" style={{ width: '100%', marginTop: 8 }} onClick={onClose}>
          Tutup
        </button>
      </div>
    </div>
  );
}
