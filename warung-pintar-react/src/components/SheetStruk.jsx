import { useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { Ikon } from '../lib/icons.jsx';
import { rupiah, tglID, jamID, escapeHtml, tampilNoHp } from '../lib/format';
import { bisaCetakBluetooth, cetak, daftarPrinter, printerTersimpan, simpanPrinter, susunStruk } from '../lib/printer';


// items di sini array teks "qtyx nama produk" (lihat itemsTxt di Catat.jsx) — dicocokkan balik ke
// S.produk buat dapetin harga satuannya, biar struknya bisa nunjukkin rincian qty x harga.
function itemHarga(txt, produk) {
  const m = /^(\d+)x\s+(.+)$/.exec(txt);
  if (!m) return null;
  const q = +m[1];
  const nm = m[2];
  const p = produk.find((x) => x.nama === nm);
  return p ? { q, nm, h: p.harga } : { q, nm, h: null };
}

// dari warung-pintar-v5.html — struk model kertas kasir beneran (bergerigi, ada nomor struk),
// dipakai baik buat struk transaksi yang baru selesai maupun buat lihat ulang riwayat lama.
export default function SheetStruk({ data, onClose }) {
  const { S, toast, authWarung } = useApp();
  // Kop struk = nama warung yang login (dulu ketulis mati "WARUNG BERKAH, Jl. Melati No. 12" buat semua warung).
  const namaWarung = (authWarung?.nama || 'Warung').toUpperCase();
  const hpWarung = authWarung?.noHp ? tampilNoHp(authWarung.noHp) : '';
  const [pilihPrinter, setPilihPrinter] = useState(null); // null | 'memuat' | [{nama, alamat}]
  const [lebar, setLebar] = useState(() => printerTersimpan()?.lebar || 32);
  const [mencetak, setMencetak] = useState(false);
  const d = new Date(data.waktu);
  const no = 'WB' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' + String(Math.floor(d.getTime() / 1000) % 10000).padStart(4, '0');

  // Isi struk buat printer thermal (ESC/POS) - sama persis sama yang tampil di layar.
  const bytesStruk = (lebarKertas) => {
    const baris = [
      { jenis: 'dua', kiri: `${tglID(data.waktu)} ${jamID(data.waktu)}`, kanan: `Kasir: ${data.oleh || '-'}` },
      { jenis: 'dua', kiri: `No. ${no}`, kanan: data.pembeli || 'Umum' },
      { jenis: 'garis' },
    ];
    for (const i of data.items) {
      const it = itemHarga(i, S.produk);
      if (!it) {
        baris.push({ teks: i });
        continue;
      }
      baris.push({ teks: it.nm });
      baris.push({ jenis: 'dua', kiri: it.h != null ? `  ${it.q} x ${rupiah(it.h)}` : `  ${it.q} x`, kanan: it.h != null ? rupiah(it.q * it.h) : '' });
    }
    baris.push({ jenis: 'garis' }, { jenis: 'dua', kiri: 'TOTAL', kanan: rupiah(data.total), tebal: true });
    baris.push({ jenis: 'dua', kiri: `Bayar (${data.metode || 'Tunai'})`, kanan: rupiah(data.total) });
    baris.push({ jenis: 'garis' }, { jenis: 'tengah', teks: 'Terima kasih, sehat selalu!' });
    return susunStruk({ kop: namaWarung, subKop: hpWarung, baris, lebar: lebarKertas });
  };
  const cetakKe = async (printer) => {
    setMencetak(true);
    try {
      await cetak(printer.alamat, bytesStruk(printer.lebar || lebar));
      simpanPrinter(printer);
      setPilihPrinter(null);
      toast(`Struk dicetak di <b>${escapeHtml(printer.nama)}</b>`);
    } catch (e) {
      toast(escapeHtml(e.message || 'Gagal mencetak'));
    } finally {
      setMencetak(false);
    }
  };
  const bukaPilihan = async () => {
    setPilihPrinter('memuat');
    try {
      setPilihPrinter(await daftarPrinter());
    } catch (e) {
      setPilihPrinter(null);
      toast(escapeHtml(e.message || 'Daftar printer nggak kebaca'));
    }
  };
  // Printer yang terakhir dipakai langsung dicetak; belum pernah milih -> tampilkan daftar printer.
  const print = () => {
    const p = printerTersimpan();
    if (p) cetakKe(p);
    else bukaPilihan();
  };
  const waLink = () => {
    const teks = [
      namaWarung,
      'Struk pembayaran',
      `No. ${no}`,
      `${tglID(data.waktu)} ${jamID(data.waktu)} · ${data.oleh || '-'}`,
      ...data.items,
      `Total ${rupiah(data.total)}`,
      `Bayar ${data.metode || 'Tunai'}`,
      data.pembeli ? `Nama ${data.pembeli}` : '',
      'Terima kasih, sehat selalu!',
    ]
      .filter(Boolean)
      .join('\n');
    window.open('https://wa.me/?text=' + encodeURIComponent(teks), '_blank');
  };

  return (
    <div className="sheet show">
      <div className="panel">
        <h3 style={{ textAlign: 'center' }}>Struk pembayaran</h3>
        <div className="strukwrap">
          <div className="struk">
            <div className="kop">
              <div className="nm">{namaWarung}</div>
              {hpWarung && <div className="al">{hpWarung}</div>}
            </div>
            <hr />
            <div className="meta">
              <span>
                {tglID(data.waktu)} {jamID(data.waktu)}
              </span>
              <span>Kasir: {data.oleh || '-'}</span>
            </div>
            <div className="meta">
              <span>No. {no}</span>
              <span>{data.pembeli || 'Umum'}</span>
            </div>
            <hr />
            {data.items.map((i, idx) => {
              const it = itemHarga(i, S.produk);
              if (!it)
                return (
                  <div className="it" key={idx}>
                    <div className="b">
                      <span>{i}</span>
                      <span></span>
                    </div>
                  </div>
                );
              const sub = it.h != null ? it.q * it.h : null;
              return (
                <div className="it" key={idx}>
                  <div className="b">
                    <span>{it.nm}</span>
                    <span>{sub != null ? rupiah(sub) : ''}</span>
                  </div>
                  {it.h != null && (
                    <div className="q">
                      {it.q} x {rupiah(it.h)}
                    </div>
                  )}
                </div>
              );
            })}
            <hr />
            <div className="b j">
              <span>TOTAL</span>
              <span>{rupiah(data.total)}</span>
            </div>
            <div className="b">
              <span>Bayar ({data.metode || 'Tunai'})</span>
              <span>{rupiah(data.total)}</span>
            </div>
            <hr />
            <div className="tks">
              Terima kasih, sehat selalu!
              <br />
              Barang yang sudah dibeli boleh ditukar 1x24 jam
            </div>
            <div className="bar" />
            <div className="kode">{no}</div>
          </div>
        </div>
        {/* Printer Bluetooth cuma bisa dari APK - di browser tombolnya nggak ditampilin (dulu tombolnya pura-pura
            nyetak: cuma munculin tulisan "dicetak ✓" tanpa ngirim apa-apa ke printer). */}
        {bisaCetakBluetooth() && (
          <>
            <button className="btn utama brand" style={{ width: '100%', marginTop: 16 }} onClick={print} disabled={mencetak}>
              <Ikon nama="printer" /> {mencetak ? 'Mencetak…' : printerTersimpan() ? `Cetak ke ${printerTersimpan().nama}` : 'Cetak ke printer Bluetooth'}
            </button>
            {printerTersimpan() && !pilihPrinter && (
              <button type="button" className="linkkecil" style={{ marginTop: 8 }} onClick={bukaPilihan}>
                Ganti printer
              </button>
            )}
            {pilihPrinter && (
              <div className="card" style={{ marginTop: 12 }}>
                <p className="p-sec" style={{ margin: '0 0 6px' }}>Pilih printer</p>
                {pilihPrinter === 'memuat' ? (
                  <p className="tgl">Mencari printer yang udah dipasangkan…</p>
                ) : pilihPrinter.length === 0 ? (
                  <p className="tgl">
                    Belum ada printer yang dipasangkan. Nyalain printernya, lalu pasangkan dulu di Pengaturan HP &gt; Bluetooth (PIN printer biasanya 0000 atau 1234), terus balik ke sini.
                  </p>
                ) : (
                  pilihPrinter.map((p) => (
                    <button key={p.alamat} type="button" className="hasil" disabled={mencetak} onClick={() => cetakKe({ ...p, lebar })}>
                      <Ikon nama="printer" />
                      <div>
                        <div className="nama">{p.nama}</div>
                        <div className="tgl">{p.alamat}</div>
                      </div>
                    </button>
                  ))
                )}
                <div className="tabs" style={{ marginTop: 10 }}>
                  {[
                    [32, 'Kertas 58mm'],
                    [48, 'Kertas 80mm'],
                  ].map(([n, t]) => (
                    <button key={n} type="button" className={'tab' + (lebar === n ? ' act' : '')} onClick={() => setLebar(n)}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={waLink}>
          <Ikon nama="chat" /> Kirim ke WhatsApp
        </button>
        <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={onClose}>
          Tutup
        </button>
      </div>
    </div>
  );
}
