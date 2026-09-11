import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { ProductIcon, Ikon } from '../lib/icons.jsx';
import { kritisQ } from '../lib/voice';
import { rupiah, singkat, tglID, jamID, escapeHtml } from '../lib/format';
import { ambilCuaca, ikonCuaca } from '../lib/weather';
import SheetStruk from '../components/SheetStruk.jsx';

export default function Beranda() {
  const { S, dispatch, goTo, openLunas, toast } = useApp();
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

  // Perbandingan untung hari ini vs kemarin buat badge "Naik/Turun Rp X dari kemarin" di hero
  // card - class CSS-nya (.delta) udah lama ada disiapin tapi belum pernah kepasang di JSX mana
  // pun. Dihitung dari S.transaksi (list 150 transaksi terakhir yang udah kemuat) - kalau kemarin
  // beneran nggak ada transaksi sama sekali (bukan cuma untungnya 0), badge-nya disembunyikan aja
  // biar nggak nyesatin (misal warung baru buka / belum ada histori) daripada nampilin "Turun Rp 0".
  const bandingKemarin = useMemo(() => {
    const kemarin = new Date();
    kemarin.setDate(kemarin.getDate() - 1);
    const kemarinStr = kemarin.toDateString();
    const trxKemarin = S.transaksi.filter((t) => new Date(t.waktu).toDateString() === kemarinStr);
    if (!trxKemarin.length) return null;
    const untungKemarin = trxKemarin.reduce((a, t) => a + t.laba, 0);
    return { selisih: S.untung - untungKemarin };
  }, [S.transaksi, S.untung]);
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
          <p className="p-sub">Warung Berkah</p>
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

      <div className="hero-card">
        <div className="blob" />
        <p className="lbl">Untung hari ini</p>
        <p className="big p-num">{rupiah(S.untung)}</p>
        {bandingKemarin && (
          <span className="delta">
            {bandingKemarin.selisih > 0
              ? `Naik ${rupiah(bandingKemarin.selisih)} dari kemarin`
              : bandingKemarin.selisih < 0
                ? `Turun ${rupiah(-bandingKemarin.selisih)} dari kemarin`
                : 'Sama kayak kemarin'}
          </span>
        )}
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
          rows={trxHariIni.map((t) => ({
            nama: t.items.length ? t.items.join(', ') : 'Penjualan',
            sub: `${tglID(t.waktu)} · ${jamID(t.waktu)} · ${t.oleh || '-'}${t.mode === 'kasbon' ? ' · kasbon ' + (t.pembeli || '') : ''}`,
            kanan: <span className="p-num">{rupiah(t.total)}</span>,
            onClick: () => {
              setDaftarOpen(null);
              setStrukLihat({ ...t, metode: t.metode || (t.mode === 'kasbon' ? 'Kasbon' : 'Tunai') });
            },
          }))}
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

  const trxHariIni = S.transaksi.filter((t) => new Date(t.waktu).toDateString() === new Date().toDateString());
  const jual = trxHariIni.reduce((a, t) => a + t.total, 0);
  // sama seperti formula stok kritis di backend (POST /api/jaga/serah-terima) — preview di sini
  // biar mendekati apa yang bakal tersimpan pas beneran dikonfirmasi
  const habis = S.produk.filter((p) => p.stok <= Math.max(1, Math.floor(p.laku * 0.2)));
  const utangBaru = S.kasbon.filter((k) => k.baru && !k.lunas);

  const konfirmasi = () => {
    const uang = parseInt(uangLaci, 10);
    if (!uang) return toast('Isi dulu uang di laci');
    dispatch({ type: 'SERAH_TERIMA', uangLaci: uang, ke });
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
        <div className="card" style={{ marginTop: 16 }}>
          <div className="item">
            <div className="nama">Penjualan hari ini</div>
            <div className="kanan p-num">{rupiah(jual)}</div>
          </div>
          <div className="item">
            <div className="nama">Jumlah transaksi</div>
            <div className="kanan p-num">{trxHariIni.length}×</div>
          </div>
          <div className="item">
            <div className="nama">Untung tercatat</div>
            <div className="kanan p-num">{rupiah(S.untung)}</div>
          </div>
          <div className="item">
            <div style={{ flex: 1 }}>
              <div className="nama">Stok menipis sejak pagi</div>
              <div className="tgl">{habis.length ? habis.map((p) => `${p.nama} (${p.stok})`).join(', ') : 'tidak ada'}</div>
            </div>
          </div>
          <div className="item">
            <div style={{ flex: 1 }}>
              <div className="nama">Utang baru hari ini</div>
              <div className="tgl">{utangBaru.length ? utangBaru.map((k) => `${k.nama} ${rupiah(k.jml)}`).join(', ') : 'tidak ada'}</div>
            </div>
          </div>
        </div>
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
        <button className="btn utama" style={{ width: '100%', marginTop: 16 }} onClick={konfirmasi}>
          Konfirmasi serah terima
        </button>
        <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={onClose}>
          Batal
        </button>
      </div>
    </div>
  );
}
