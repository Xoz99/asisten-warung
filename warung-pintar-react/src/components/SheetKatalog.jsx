import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { api } from '../lib/api';
import { escapeHtml, rupiah } from '../lib/format';

// "Ambil dari katalog": centang banyak barang sekaligus dari Katalog Barang Bersama, langsung masuk Stok tanpa ngisi
// apa-apa di sini. Harga jual, modal/HPP & stok awalnya diatur belakangan di Stok (kotak "Perlu diatur" -> Atur
// barang). Kisaran harga cuma muncul kalau udah ada minimal 5 warung yang jual barang itu (katalog.service.js).
const NAMA_KATEGORI = { lainnya: 'Lainnya', 'mie instan': 'Mie instan' };
const namaKategori = (k) => NAMA_KATEGORI[k] || k.charAt(0).toUpperCase() + k.slice(1);
const PER_HALAMAN = 60;

export default function SheetKatalog({ onClose }) {
  const { toast, refreshData } = useApp();
  const [ketik, setKetik] = useState('');
  const [q, setQ] = useState('');
  const [kategori, setKategori] = useState('');
  const [data, setData] = useState({ barang: [], kategori: [], adaLagi: false });
  const [memuat, setMemuat] = useState(true);
  const [gagal, setGagal] = useState('');
  const [pilihan, setPilihan] = useState({}); // id -> barang katalog
  const [simpan, setSimpan] = useState(false);
  const minta = useRef(0);

  // Ketikan dicari setelah berhenti ngetik sebentar, biar nggak nembak server tiap huruf.
  useEffect(() => {
    const t = setTimeout(() => setQ(ketik.trim()), 350);
    return () => clearTimeout(t);
  }, [ketik]);

  const muat = async (offset = 0) => {
    const no = ++minta.current;
    setMemuat(true);
    setGagal('');
    try {
      const r = await api.katalog.list({ q, kategori, limit: PER_HALAMAN, offset });
      if (no !== minta.current) return;
      setData((d) => ({ barang: offset ? [...d.barang, ...r.barang] : r.barang, kategori: r.kategori, adaLagi: r.adaLagi }));
    } catch (e) {
      if (no === minta.current) setGagal(e.message || 'Katalog nggak bisa dibuka');
    } finally {
      if (no === minta.current) setMemuat(false);
    }
  };
  useEffect(() => {
    muat(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, kategori]);

  const dipilih = Object.values(pilihan);
  const kategoriUrut = useMemo(
    () => [...data.kategori].sort((a, b) => (a.kategori === 'lainnya') - (b.kategori === 'lainnya') || b.n - a.n),
    [data.kategori]
  );

  const toggle = (b) =>
    setPilihan((p) => {
      const x = { ...p };
      if (x[b.id]) delete x[b.id];
      else x[b.id] = b;
      return x;
    });

  const tambah = async () => {
    if (!dipilih.length) return;
    setSimpan(true);
    try {
      const r = await api.katalog.tambah(dipilih.map((b) => ({ id: b.id })));
      await refreshData();
      toast(
        `<b>${r.ditambah} barang</b> masuk ke Stok${r.dilewati ? ` (${r.dilewati} udah ada, dilewati)` : ''}. Atur harga jual & HPP-nya dulu di Stok sebelum dijual.`
      );
      onClose(r.ditambah);
    } catch (e) {
      toast(escapeHtml(e.message || 'Gagal nambah barang, coba lagi'));
      setSimpan(false);
    }
  };

  return (
    <div className="sheet show kat-sheet">
      <div className="panel kat-panel">
        <div className="kat-kepala">
          <div>
            <h3>Ambil dari katalog</h3>
            <p>Centang aja barang yang kamu jual. Harga & HPP-nya diatur nanti di Stok.</p>
          </div>
          <button type="button" className="kat-tutup" onClick={onClose} aria-label="Tutup">
            <svg viewBox="0 0 24 24">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="cari" style={{ marginTop: 14 }}>
          <svg viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="6.2" />
            <path d="m15.6 15.6 4.4 4.4" />
          </svg>
          <input type="search" placeholder="Cari: indomie, aqua, kecap…" value={ketik} onChange={(e) => setKetik(e.target.value)} />
        </div>
        <div className="tabs" style={{ marginTop: 10 }}>
          <button className={'tab' + (!kategori ? ' act' : '')} onClick={() => setKategori('')}>
            Semua
          </button>
          {kategoriUrut.map((k) => (
            <button key={k.kategori} className={'tab' + (kategori === k.kategori ? ' act' : '')} onClick={() => setKategori(k.kategori)}>
              {namaKategori(k.kategori)}
            </button>
          ))}
        </div>

        <div className="kat-daftar">
          {gagal && (
            <div className="kosong">
              {gagal}{' '}
              <button type="button" className="linkkecil" onClick={() => muat(0)}>
                Coba lagi
              </button>
            </div>
          )}
          {!gagal && !memuat && !data.barang.length && <div className="kosong">{q ? `Nggak ada barang cocok "${q}" di katalog.` : 'Katalog masih kosong.'}</div>}
          {data.barang.map((b) => {
            const x = pilihan[b.id];
            return (
              <div key={b.id} className={'kat-item' + (x ? ' kat-on' : '') + (b.sudahPunya ? ' punya' : '')}>
                <button type="button" className="kat-baris" onClick={() => !b.sudahPunya && toggle(b)} disabled={b.sudahPunya} aria-pressed={!!x}>
                  <span className="kat-foto">
                    <i>{b.nama.charAt(0)}</i>
                    {b.foto_url && (
                      <img src={b.foto_url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.display = 'none')} />
                    )}
                  </span>
                  <span className="kat-teks">
                    <b>{b.nama}</b>
                    <span>
                      {namaKategori(b.kategori)}
                      {b.harga ? ` · warung lain ${rupiah(b.harga.bawah)}–${rupiah(b.harga.atas).replace('Rp ', '')}` : ''}
                    </span>
                  </span>
                  <span className="kat-cek">{b.sudahPunya ? 'Udah ada' : x ? '✓' : ''}</span>
                </button>
              </div>
            );
          })}
          {memuat && <div className="kosong">Memuat katalog…</div>}
          {!memuat && data.adaLagi && (
            <button type="button" className="btn kecil" style={{ width: '100%', marginTop: 10 }} onClick={() => muat(data.barang.length)}>
              Tampilkan lebih banyak
            </button>
          )}
          <p className="kat-sumber">
            Sebagian data barang dari{' '}
            <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener noreferrer">
              Open Food Facts
            </a>
            ,{' '}
            <a href="https://world.openbeautyfacts.org" target="_blank" rel="noopener noreferrer">
              Open Beauty Facts
            </a>{' '}
            &amp;{' '}
            <a href="https://world.openproductsfacts.org" target="_blank" rel="noopener noreferrer">
              Open Products Facts
            </a>{' '}
            (lisensi ODbL), katalog publik{' '}
            <a href="https://order.lottemart.co.id" target="_blank" rel="noopener noreferrer">Lotte Grosir</a>
            , serta barang yang diverifikasi tim atau dipakai banyak warung. Harga & stok warungmu nggak pernah dibagikan.
          </p>
        </div>

        <div className="kat-bawah">
          <button className="btn utama" style={{ width: '100%' }} disabled={!dipilih.length || simpan} onClick={tambah}>
            {simpan ? 'Menyimpan…' : dipilih.length ? `Masukin ${dipilih.length} barang ke Stok` : 'Centang barang dulu'}
          </button>
        </div>
      </div>
    </div>
  );
}
