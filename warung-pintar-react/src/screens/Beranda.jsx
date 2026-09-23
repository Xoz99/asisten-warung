import { useEffect, useMemo, useState, useRef } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { ProductIcon, Ikon } from '../lib/icons.jsx';
import { kritisQ } from '../lib/voice';
import { rupiah, singkat, tglID, jamID, escapeHtml } from '../lib/format';
import { ambilCuaca, ikonCuaca } from '../lib/weather';
import { api } from '../lib/api';
import SheetStruk from '../components/SheetStruk.jsx';

export default function Beranda() {
  const { S, dispatch, goTo, openLunas, toast, authWarung, profilUsaha } = useApp();
  // Kartu "Langkah awal" bisa ditutup - diingat per akun di HP ini.
  const kunciTutupLangkah = `warungpintar_langkah_awal_tutup_${authWarung?.id}`;
  const [langkahDitutup, setLangkahDitutup] = useState(() => {
    try {
      return localStorage.getItem(kunciTutupLangkah) === '1';
    } catch {
      return false;
    }
  });
  const [heroMode, setHeroMode] = useState(() => {
    try {
      return localStorage.getItem('warungpintar_hero_mode') || 'untung';
    } catch {
      return 'untung';
    }
  });

  const gantiHeroMode = (m) => {
    setHeroMode(m);
    try {
      localStorage.setItem('warungpintar_hero_mode', m);
    } catch {
      /* ignore */
    }
  };

  const [dragX, setDragX] = useState(0);
  const [transisi, setTransisi] = useState(false);
  const touchXRef = useRef(null);
  const isDraggingRef = useRef(false);

  const sentuhMulai = (e) => {
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    touchXRef.current = x;
    isDraggingRef.current = true;
    setTransisi(false);
  };

  const sentuhGerak = (e) => {
    if (!isDraggingRef.current || touchXRef.current === null) return;
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    const diff = x - touchXRef.current;
    setDragX(diff);
  };

  const sentuhSelesai = (e) => {
    if (!isDraggingRef.current || touchXRef.current === null) return;
    const x = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
    const delta = x - touchXRef.current;
    touchXRef.current = null;
    isDraggingRef.current = false;
    setTransisi(true);

    if (delta > 20) {
      // Geser ke KANAN -> Penjualan hari ini (Omzet)
      gantiHeroMode('omzet');
    } else if (delta < -20) {
      // Geser ke KIRI -> Untung hari ini
      gantiHeroMode('untung');
    }
    setDragX(0);
  };

  const [serahOpen, setSerahOpen] = useState(false);
  const [daftarOpen, setDaftarOpen] = useState(null); // null | 'jual' | 'kasbon'
  const [strukLihat, setStrukLihat] = useState(null);
  const [pilihBayarK, setPilihBayarK] = useState(null); // baris kasbon yang lagi dipilih cara bayarnya
  const [jumlahCustom, setJumlahCustom] = useState('');
  const [waktu, setWaktu] = useState(() => new Date());
  const [cuaca, setCuaca] = useState(null);

  useEffect(() => {
    const t = setInterval(() => setWaktu(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let hidup = true;
    const muat = () => ambilCuaca().then((d) => hidup && setCuaca(d));
    muat();
    window.addEventListener('online', muat);
    window.addEventListener('offline', muat);
    return () => {
      hidup = false;
      window.removeEventListener('online', muat);
      window.removeEventListener('offline', muat);
    };
  }, []);

  const jamTeks = waktu.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  const nama = S.penjagaAktif || 'Pak Budi';
  const jam = waktu.getHours();
  const sapa = jam < 11 ? 'Pagi' : jam < 15 ? 'Siang' : jam < 18 ? 'Sore' : 'Malam';

  const kritis = useMemo(
    () => S.produk.filter(kritisQ).sort((a, b) => a.stok - b.stok).slice(0, 4),
    [S.produk]
  );

  // Perbandingan untung & omzet hari ini vs kemarin buat badge "Naik/Turun Rp X dari kemarin"
  const bandingKemarin = useMemo(() => {
    const kemarin = new Date();
    kemarin.setDate(kemarin.getDate() - 1);
    const kemarinStr = kemarin.toDateString();
    const trxKemarin = S.transaksi.filter((t) => new Date(t.waktu).toDateString() === kemarinStr);
    if (!trxKemarin.length) return null;
    const untungKemarin = trxKemarin.reduce((a, t) => a + t.laba, 0);
    const omzetKemarin = trxKemarin.filter((t) => t.mode !== 'kasbon').reduce((a, t) => a + t.total, 0);
    return {
      selisihUntung: S.untung - untungKemarin,
      selisihOmzet: S.omzetHariIni - omzetKemarin,
    };
  }, [S.transaksi, S.untung, S.omzetHariIni]);
  // "Riwayat penjualan" (drill-down tile Penjualan) niatnya cuma nampilin transaksi HARI INI (sub
  // judulnya bilang "N× hari ini") - dulu isinya malah dari S.transaksi mentah (150 transaksi
  // TERAKHIR apapun tanggalnya, termasuk hari-hari sebelumnya), jadi kelist/total-nya nggak
  // nyambung sama judulnya. Difilter di sini dulu baru dipakai di drill-down-nya.
  const trxHariIni = useMemo(() => {
    const hariIni = new Date().toDateString();
    return S.transaksi.filter((t) => new Date(t.waktu).toDateString() === hariIni);
  }, [S.transaksi]);
  const sisaKasbon = S.kasbon.filter((k) => !k.lunas).reduce((a, b) => a + b.jml, 0);
  // kartu ringkasan di beranda cuma nampilin beberapa baris teratas - daftar lengkapnya
  // (yang bisa numpuk terus seiring waktu) ada di drill-down lewat tile "Kasbon"/tombol "Lihat semua"
  const KASBON_RINGKAS = 5;
  const kasbonRingkas = S.kasbon.slice(0, KASBON_RINGKAS);
  const kasbonSisa = S.kasbon.length - kasbonRingkas.length;

  // Langkah awal disesuaiin sama jawaban "kenalan dulu" (lib/profilUsaha.js) & data yang udah ada: yang udah
  // dikerjain nggak ditampilin lagi, dan kartunya hilang sendiri kalau semuanya beres.
  const profil = profilUsaha?.data && !profilUsaha.data.dilewati ? profilUsaha.data : null;
  const langkahAwal = [];
  if (!S.produk.length) {
    langkahAwal.push({
      k: 'barang',
      judul: 'Masukin barang daganganmu',
      ket: 'Ambil dari katalog - centang barang yang kamu jual, nggak perlu ngetik satu-satu',
      aksi: () => {
        // Stok baca flag ini sekali waktu dibuka, terus langsung buka layar katalog.
        try {
          sessionStorage.setItem('wp_buka_katalog', '1');
        } catch {
          /* storage diblok - tetap ke Stok, katalog dibuka manual */
        }
        goTo('s-stok');
      },
    });
  }
  if (!S.transaksi.length) {
    langkahAwal.push({ k: 'jual', judul: 'Catat penjualan pertama', ket: 'Tinggal sebut atau pilih barangnya', aksi: () => goTo('s-catat') });
  }
  if (profil?.kebutuhan?.includes('kasbon') && !S.pelanggan.length) {
    langkahAwal.push({ k: 'kasbon', judul: 'Daftarin pelanggan langganan', ket: 'Biar kasbon & utangnya kecatat per orang', aksi: () => goTo('s-pelanggan') });
  }
  if (profil && profil.penjaga !== 'sendiri' && S.penjagaList.length <= 1) {
    langkahAwal.push({
      k: 'penjaga',
      judul: profil.penjaga === 'karyawan' ? 'Tambahin nama karyawan' : 'Tambahin nama keluarga yang ikut jaga',
      ket: 'Biar serah terima & uang laci kecatat per giliran',
      aksi: () => setSerahOpen(true),
    });
  }
  if (langkahAwal.length && (profil?.kebutuhan?.includes('harga') || profil?.kebutuhan?.includes('stok'))) {
    langkahAwal.push({ k: 'ai', judul: 'Tanya Mang AI', ket: 'Soal harga jual, stok, atau mau kulakan apa', aksi: () => goTo('s-chat') });
  }
  const tutupLangkahAwal = () => {
    setLangkahDitutup(true);
    try {
      localStorage.setItem(kunciTutupLangkah, '1');
    } catch {
      /* mode privat - cuma nggak keinget */
    }
  };

  const bukaLunasi = (k) => {
    openLunas(`${k.nama} mau bayar?`, `Sisa utang <b style="color:var(--ink)">${rupiah(k.jml)}</b> (${k.hari}). Tandai lunas sekarang?`, (metode) => {
      dispatch({ type: 'LUNASI_KASBON', id: k.id, metode });
      toast(`${escapeHtml(k.nama)} <b>lunas</b> ${rupiah(k.jml)} via ${escapeHtml(metode)}`);
    });
  };

  const bayarSebagian = (k, jumlah) => {
    openLunas(`${k.nama} bayar sebagian`, `Bayar <b style="color:var(--ink)">${rupiah(jumlah)}</b> dari sisa utang ${rupiah(k.jml)}?`, (metode) => {
      dispatch({ type: 'BAYAR_SEBAGIAN_KASBON', id: k.id, jumlah, metode });
      toast(
        jumlah >= k.jml
          ? `${escapeHtml(k.nama)} <b>lunas</b> ${rupiah(jumlah)} via ${escapeHtml(metode)}`
          : `${escapeHtml(k.nama)} bayar ${rupiah(jumlah)}, sisa ${rupiah(k.jml - jumlah)}`
      );
      setPilihBayarK(null);
      setJumlahCustom('');
    });
  };

  return (
    <>
      <div className="head">
        <div className="head-info">
          <p className="p-h1">
            {sapa}, {nama}
          </p>
          <p className="p-sub">{authWarung?.nama || 'Warungku'}</p>
        </div>
        <div className="jamcuaca">
          <span className="jc-jam">{jamTeks}</span>
          {cuaca && (
            <span
              className={'jc-cuaca' + (cuaca.offline ? ' offline' : '')}
              title={cuaca.dariCache ? 'Data cuaca terakhir (offline)' : cuaca.label}
            >
              <span className="jc-ic" dangerouslySetInnerHTML={{ __html: ikonCuaca(cuaca.ikon) }} />
              <span className="jc-teks">
                {cuaca.suhu != null ? `${cuaca.suhu}°${cuaca.nama ? ' · ' + cuaca.nama : ''}` : 'Offline'}
              </span>
            </span>
          )}
        </div>
      </div>

      <div
        className="hero-card"
        style={{ touchAction: 'pan-y', cursor: 'grab', userSelect: 'none' }}
        onTouchStart={sentuhMulai}
        onTouchMove={sentuhGerak}
        onTouchEnd={sentuhSelesai}
        onMouseDown={sentuhMulai}
        onMouseMove={sentuhGerak}
        onMouseUp={sentuhSelesai}
        onMouseLeave={() => {
          if (isDraggingRef.current) {
            isDraggingRef.current = false;
            setTransisi(true);
            setDragX(0);
          }
        }}
      >
        <div className="blob" />
        <div
          className="hero-inner"
          style={{
            transform: `translateX(${dragX}px)`,
            transition: transisi ? 'transform 0.28s cubic-bezier(0.18, 0.89, 0.32, 1.28)' : 'none',
          }}
        >
          <div className="hero-head">
            <p className="lbl">{heroMode === 'untung' ? 'Untung hari ini' : 'Penjualan hari ini (Omzet)'}</p>
          </div>
          <p className="big p-num">{rupiah(heroMode === 'untung' ? S.untung : S.omzetHariIni)}</p>
          {bandingKemarin && (
            <span className="delta">
              {(() => {
                const selisih = heroMode === 'untung' ? bandingKemarin.selisihUntung : bandingKemarin.selisihOmzet;
                if (selisih > 0) return `Naik ${rupiah(selisih)} dari kemarin`;
                if (selisih < 0) return `Turun ${rupiah(-selisih)} dari kemarin`;
                return 'Sama kayak kemarin';
              })()}
            </span>
          )}
          <div className="hero-swipe-hint">
            {heroMode === 'untung' ? 'geser ke kanan untuk Penjualan ›' : '‹ geser ke kiri untuk Untung'}
          </div>
        </div>
      </div>

      <div className="bento">
        <div className="tile tap" onClick={() => setDaftarOpen('jual')}>
          <Ikon nama="nota" />
          <p className="k">Penjualan ›</p>
          <p className="v p-num">{S.trx}×</p>
        </div>
        <div className="tile ink tap" onClick={() => setDaftarOpen('kasbon')}>
          <Ikon nama="dompet" />
          <p className="k">Kasbon ›</p>
          <p className="v p-num">{sisaKasbon ? singkat(sisaKasbon) : '0'}</p>
        </div>
      </div>

      {langkahAwal.length > 0 && !langkahDitutup && (
        <div className="langkah-awal">
          <div className="between">
            <b>Langkah awal</b>
            <button className="hapus-mini" onClick={tutupLangkahAwal} aria-label="Sembunyikan langkah awal">
              ×
            </button>
          </div>
          <p>Biar aplikasinya langsung kepake buat usahamu.</p>
          {langkahAwal.map((l, i) => (
            <button key={l.k} type="button" className="langkah-item" onClick={l.aksi}>
              <span className="nomor">{i + 1}</span>
              <span>
                <b>{l.judul}</b>
                <small>{l.ket}</small>
              </span>
              <span className="ar">›</span>
            </button>
          ))}
        </div>
      )}

      <div className="menu" style={{ marginTop: 16 }}>
        <button className="mrow" onClick={() => setSerahOpen(true)}>
          <span className="ic aksen">
            <svg viewBox="0 0 24 24">
              <path d="M4 8h11l-2.5-2.5M20 16H9l2.5 2.5" />
            </svg>
          </span>
          <span className="tx">
            <b>Serah terima jaga</b>
            <span>Tutup giliran &amp; hitung uang laci</span>
          </span>
          <span className="ar">›</span>
        </button>
      </div>

      <p className="p-sec">Sebentar lagi habis</p>
      <div className="card">
        {kritis.length === 0 && <div className="kosong">Semua stok aman</div>}
        {kritis.map((p) => (
          <div className="item" key={p.id}>
            <ProductIcon id={p.id} foto={p.foto} />
            <div className="nama">{p.nama}</div>
            <span className="sisa-kritis">sisa {p.stok}</span>
          </div>
        ))}
      </div>

      <div className="between" style={{ marginTop: 28 }}>
        <p className="p-sec" style={{ margin: 0 }}>
          Yang belum bayar
        </p>
        <button className="btn kecil" onClick={() => goTo('s-pelanggan')}>
          Pelanggan
        </button>
      </div>
      <div className="card">
        {S.kasbon.length === 0 && <div className="kosong">Belum ada kasbon</div>}
        {kasbonRingkas.map((k) => {
          return (
            <div key={k.id} className={'item' + (k.lunas ? '' : ' tap')} onClick={() => !k.lunas && setPilihBayarK(k)}>
              <div>
                <div className="nama">{k.nama}</div>
                <div className="tgl">{k.lunas ? 'Sudah lunas' : k.hari}</div>
              </div>
              <div className="kanan">
                {k.lunas ? <span className="tag lunas">Lunas ✓</span> : <div className="p-num">{rupiah(k.jml)}</div>}
              </div>
            </div>
          );
        })}
        {kasbonSisa > 0 && (
          <div className="item tap" style={{ color: 'var(--abu)', fontWeight: 700, justifyContent: 'center' }} onClick={() => setDaftarOpen('kasbon')}>
            Lihat semua ({kasbonSisa} lagi) ›
          </div>
        )}
      </div>
      <p className="p-sub" style={{ marginTop: 12, fontSize: 14 }}>
        Tap nama untuk konfirmasi pembayaran
      </p>

      <div className="menu" style={{ marginTop: 26 }}>
        <button className="mrow hi" onClick={() => goTo('s-laporan')}>
          <span className="ic">
            <svg viewBox="0 0 24 24">
              <path d="M4 19V5M4 19h16M8 16V11M12.5 16V7.5M17 16v-4" />
            </svg>
          </span>
          <span className="tx">
            <b>Laporan untung rugi</b>
            <span>Lihat grafik &amp; uang masuk warung</span>
          </span>
          <span className="ar">›</span>
        </button>
      </div>

      {serahOpen && <SheetSerah onClose={() => setSerahOpen(false)} />}
      {daftarOpen === 'jual' && (
        <SheetDaftar
          judul="Riwayat penjualan"
          sub={`${trxHariIni.length}× hari ini · total ${rupiah(trxHariIni.reduce((a, t) => a + t.total, 0))} · tap untuk lihat struk`}
          kosong="Belum ada penjualan hari ini"
          rows={trxHariIni.map((t) => {
            const kRelated = t.mode === 'kasbon' ? S.kasbon.find((k) => k.transaksiId === t.id || k.nama === t.pembeli) : null;
            const isLunas = kRelated ? kRelated.lunas : false;
            const kasbonLabel = t.mode === 'kasbon' ? ` · kasbon ${t.pembeli || ''}${isLunas ? ' (lunas ✓)' : ''}` : '';
            return {
              nama: t.items.length ? t.items.join(', ') : 'Penjualan',
              sub: `${tglID(t.waktu)} · ${jamID(t.waktu)} · ${t.oleh || '-'}${kasbonLabel}`,
              kanan: <span className="p-num">{rupiah(t.total)}</span>,
              onClick: () => {
                setDaftarOpen(null);
                setStrukLihat({ ...t, metode: t.metode || (t.mode === 'kasbon' ? 'Kasbon' : 'Tunai') });
              },
            };
          })}
          onClose={() => setDaftarOpen(null)}
        />
      )}
      {daftarOpen === 'kasbon' && (
        <SheetDaftar
          judul="Yang masih ngutang"
          sub={`${S.kasbon.filter((k) => !k.lunas).length} orang · total ${rupiah(sisaKasbon)} · tap nama untuk terima bayaran`}
          kosong="Semua kasbon sudah lunas"
          rows={S.kasbon
            .filter((k) => !k.lunas)
            .map((k) => ({
              nama: k.nama,
              sub: 'Ngutang ' + k.hari,
              kanan: <span className="p-num">{rupiah(k.jml)}</span>,
              onClick: () => {
                setDaftarOpen(null);
                setPilihBayarK(k);
              },
            }))}
          onClose={() => setDaftarOpen(null)}
        />
      )}
      {strukLihat && <SheetStruk data={strukLihat} onClose={() => setStrukLihat(null)} />}
      {pilihBayarK && (
        <div className="sheet tengah show">
          <div className="panel mid">
            <h3>{pilihBayarK.nama} mau bayar berapa?</h3>
            <p>
              Sisa utang <b style={{ color: 'var(--ink)' }}>{rupiah(pilihBayarK.jml)}</b> ({pilihBayarK.hari})
            </p>
            <button
              className="btn utama"
              style={{ width: '100%', marginTop: 12 }}
              onClick={() => {
                bukaLunasi(pilihBayarK);
                setPilihBayarK(null);
              }}
            >
              Lunasi {rupiah(pilihBayarK.jml)}
            </button>
            <div className="field" style={{ marginTop: 10, textAlign: 'left' }}>
              <label>Atau bayar sebagian</label>
              <input
                type="number"
                inputMode="numeric"
                placeholder={`maks ${pilihBayarK.jml}`}
                value={jumlahCustom}
                onChange={(e) => setJumlahCustom(e.target.value)}
              />
            </div>
            <button
              className="btn"
              style={{ width: '100%', marginTop: 8 }}
              onClick={() => {
                const j = Math.floor(Number(jumlahCustom));
                if (!j || j <= 0) return toast('Isi jumlahnya dulu');
                if (j > pilihBayarK.jml) return toast('Nggak boleh lebih dari sisa utang');
                bayarSebagian(pilihBayarK, j);
              }}
            >
              Bayar sebagian
            </button>
            <button
              className="btn"
              style={{ width: '100%', marginTop: 10 }}
              onClick={() => {
                setPilihBayarK(null);
                setJumlahCustom('');
              }}
            >
              Batal
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// Generik: dipakai buat drill-down dari tile Penjualan & Kasbon (revisi v5) — cuma nampilin
// daftar item, masing-masing baris opsional bisa di-tap.
function SheetDaftar({ judul, sub, rows, kosong, onClose }) {
  return (
    <div className="sheet show">
      <div className="panel">
        <h3>{judul}</h3>
        <p>{sub}</p>
        {/* daftar-geser: daftarnya bisa jadi panjang banget seiring waktu (riwayat jualan/utang
            numpuk terus) - dibikin scroll sendiri biar sheet-nya nggak makin tinggi tak berujung
            dan tombol "Tutup" tetap gampang dijangkau */}
        <div className="card daftar-geser">
          {rows.length === 0 && <div className="kosong">{kosong || 'Belum ada data'}</div>}
          {rows.map((r, i) => (
            <div key={i} className={'item' + (r.onClick ? ' tap' : '')} onClick={r.onClick}>
              <div style={{ flex: 1 }}>
                <div className="nama">{r.nama}</div>
                <div className="tgl">{r.sub}</div>
              </div>
              <div className="kanan">{r.kanan}</div>
            </div>
          ))}
        </div>
        <button className="btn" style={{ width: '100%', marginTop: 14 }} onClick={onClose}>
          Tutup
        </button>
      </div>
    </div>
  );
}

function SheetSerah({ onClose }) {
  const { S, dispatch, toast } = useApp();
  const [uangLaci, setUangLaci] = useState('');
  const [ke, setKe] = useState(S.penjagaList.find((n) => n !== S.penjagaAktif) || S.penjagaList[0]);
  const [kirim, setKirim] = useState(false);
  // Angka giliran DIAMBIL DARI SERVER, bukan dihitung ulang di sini. Versi lama ngitung sendiri
  // dari state lokal pakai aturan yang beda sama backend: layar nampilin jumlah SEMUA transaksi
  // (tunai + QRIS + kasbon), yang kesimpen cuma yang tunai. Pemilik warung ngitung laci sambil
  // ngeliat angka gede, terus buka Riwayat jaga & nemu angka jauh lebih kecil - kayak duitnya
  // ilang. Satu-satunya cara bikin itu nggak balik lagi: satu rumus, satu tempat.
  const [ringkas, setRingkas] = useState(null);
  const [gagalMuat, setGagalMuat] = useState(false);

  useEffect(() => {
    let batal = false;
    api.jaga
      .ringkasan()
      .then((r) => !batal && setRingkas(r))
      .catch(() => !batal && setGagalMuat(true));
    return () => {
      batal = true;
    };
  }, []);

  const uang = parseInt(uangLaci, 10) || 0;
  // Selisih dihitung di layar SELAGI ngetik biar keliatan langsung, tapi patokannya
  // ringkas.penjualanTunai - angka yang sama persis yang bakal dipakai server pas nyimpen.
  const selisih = ringkas ? uang - ringkas.penjualanTunai : 0;

  const konfirmasi = async () => {
    if (!uang) return toast('Isi dulu uang di laci');
    if (kirim) return;
    setKirim(true);
    // DITUNGGU sampai selesai. Dulu nggak: toast "Giliran diserahkan ke X" langsung muncul & sheet
    // ditutup sebelum servernya jawab - kalau gagal, pemilik warung udah terlanjur dikasih tau
    // berhasil, terus muncul toast error kedua yang isinya bertentangan.
    const ok = await dispatch({ type: 'SERAH_TERIMA', uangLaci: uang, ke });
    setKirim(false);
    if (!ok) return; // pesan gagalnya udah dikeluarin dispatch - sheet-nya biarin kebuka
    toast(`Giliran diserahkan ke <b>${escapeHtml(ke)}</b>`);
    onClose();
  };

  return (
    <div className="sheet show">
      <div className="panel">
        <h3>Serah terima jaga</h3>
        <p style={{ marginTop: 8 }}>
          Giliran {S.penjagaAktif || '-'} ·{' '}
          {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <div className="field">
          <label>Uang di laci sekarang (hitung dulu)</label>
          <input
            type="number"
            inputMode="numeric"
            placeholder="contoh: 812000"
            value={uangLaci}
            onChange={(e) => setUangLaci(e.target.value)}
          />
        </div>
        {gagalMuat && <p className="p-sub" style={{ marginTop: 12 }}>Ringkasan giliran gagal dimuat. Coba tutup lalu buka lagi ya.</p>}
        {!ringkas && !gagalMuat && <p className="p-sub" style={{ marginTop: 12 }}>Ngitung giliran ini...</p>}
        {ringkas && (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="item">
              <div style={{ flex: 1 }}>
                <div className="nama">Penjualan tunai {ringkas.lanjutanGiliran ? 'giliran ini' : 'hari ini'}</div>
                {/* Ditulis tegas ini yang HARUS ada di laci - selebihnya nggak nambah isi laci:
                    QRIS/transfer masuk ke rekening, kasbon malah belum kebayar. Sebelumnya
                    layar ini cuma nampilin satu angka gabungan tanpa keterangan apa-apa. */}
                <div className="tgl">Ini yang harusnya ada di laci</div>
              </div>
              <div className="kanan p-num">{rupiah(ringkas.penjualanTunai)}</div>
            </div>
            {ringkas.penjualanNonTunai > 0 && (
              <div className="item">
                <div style={{ flex: 1 }}>
                  <div className="nama">QRIS / transfer</div>
                  <div className="tgl">Masuk ke rekening, bukan ke laci</div>
                </div>
                <div className="kanan p-num">{rupiah(ringkas.penjualanNonTunai)}</div>
              </div>
            )}
            <div className="item">
              <div className="nama">Jumlah transaksi</div>
              <div className="kanan p-num">{ringkas.totalTransaksi}×</div>
            </div>
            <div className="item">
              <div className="nama">Untung tercatat</div>
              <div className="kanan p-num">{rupiah(ringkas.labaGiliran)}</div>
            </div>
            <div className="item">
              <div style={{ flex: 1 }}>
                <div className="nama">Stok menipis</div>
                <div className="tgl">
                  {ringkas.stokHabis.length ? ringkas.stokHabis.map((p) => `${p.nama} (${p.stok})`).join(', ') : 'tidak ada'}
                </div>
              </div>
            </div>
            <div className="item">
              <div style={{ flex: 1 }}>
                <div className="nama">Utang baru {ringkas.lanjutanGiliran ? 'giliran ini' : 'hari ini'}</div>
                <div className="tgl">
                  {ringkas.utangBaru.length ? ringkas.utangBaru.map((k) => `${k.nama} ${rupiah(k.jumlah)}`).join(', ') : 'tidak ada'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Selisih laci - ALASAN fitur ini ada, tapi dulu cuma dihitung diam-diam di server & nggak
            pernah nongol di layar mana pun. Sekarang gerak langsung selagi angka lacinya diketik,
            jadi ketauan di tempat, bukan pas udah telanjur ganti giliran. */}
        {ringkas && uang > 0 && (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="item" style={{ border: 0, padding: 0 }}>
              <div style={{ flex: 1 }}>
                <div className="nama">{selisih === 0 ? 'Uangnya pas' : selisih > 0 ? 'Uang lebih' : 'Uang kurang'}</div>
                <div className="tgl">
                  {selisih === 0
                    ? 'Isi laci cocok sama penjualan tunai'
                    : selisih > 0
                      ? 'Ada uang lebih di laci - mungkin kembalian atau modal awal'
                      : 'Isi laci kurang dari penjualan tunai - cek lagi sebelum diserahkan'}
                </div>
              </div>
              {/* Tandanya dipisah dari angkanya: rupiah(-5000) ngasih "Rp -5.000", minusnya
                  nyempil di tengah & gampang kelewat - padahal itu justru bagian pentingnya. */}
              <div className="kanan p-num" style={{ color: selisih < 0 ? '#E5484D' : undefined }}>
                {selisih > 0 ? '+ ' : selisih < 0 ? '- ' : ''}
                {rupiah(Math.abs(selisih))}
              </div>
            </div>
          </div>
        )}
        <div className="field">
          <label>Diserahkan ke</label>
          <select value={ke} onChange={(e) => setKe(e.target.value)}>
            {S.penjagaList.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <button className="btn utama" style={{ width: '100%', marginTop: 16 }} onClick={konfirmasi} disabled={kirim || !ringkas}>
          {kirim ? 'Menyimpan...' : 'Konfirmasi serah terima'}
        </button>
        <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={onClose}>
          Batal
        </button>
      </div>
    </div>
  );
}
