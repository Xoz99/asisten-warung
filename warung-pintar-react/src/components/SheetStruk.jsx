import { useApp } from '../state/AppContext.jsx';
import { Ikon } from '../lib/icons.jsx';
import { rupiah, tglID, jamID } from '../lib/format';

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
  const { S, toast } = useApp();
  const d = new Date(data.waktu);
  const no = 'WB' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' + String(Math.floor(d.getTime() / 1000) % 10000).padStart(4, '0');

  const print = () => {
    toast('Mencari printer Bluetooth…');
    setTimeout(() => toast('Struk <b>dicetak</b> di printer POS58 ✓'), 1200);
  };
  const waLink = () => {
    const teks = [
      'WARUNG BERKAH',
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
              <div className="nm">WARUNG BERKAH</div>
              <div className="al">Jl. Melati No. 12 · 0812-0000-0000</div>
            </div>
            <hr />
            <div className="meta">
              <span>
                {tglID(data.waktu)} {jamID(data.waktu)}
              </span>
              <span>Kasir: {data.oleh || '—'}</span>
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
            <div className="b">
              <span>Kembali</span>
              <span>{rupiah(0)}</span>
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
        <button className="btn utama brand" style={{ width: '100%', marginTop: 16 }} onClick={print}>
          <Ikon nama="printer" /> Print printer Bluetooth
        </button>
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
