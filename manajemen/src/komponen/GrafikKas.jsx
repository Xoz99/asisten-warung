import { useState } from 'react';
import { bulanLabel, rupiah } from '../lib/format.js';
import { Kosong } from './Ui.jsx';

// Pemasukan vs pengeluaran per bulan (batang berpasangan). Warna biru/oranye lolos cek buta warna (validate_palette:
// CVD ΔE 36); hijau/merah di referensi gagal. Garis hitam 2px ngasih kontras ke latar putih buat oranye yang terang.
const WARNA = { masuk: '#1D4ED8', keluar: '#FB923C' };
const singkat = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} M` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} jt` : n >= 1e3 ? `${Math.round(n / 1e3)} rb` : String(n));

export default function GrafikKas({ kas }) {
  const [hover, setHover] = useState(null);
  const [tabel, setTabel] = useState(false);
  const maks = Math.max(0, ...kas.flatMap((k) => [k.masuk, k.keluar]));

  if (!maks) {
    return (
      <Kosong judul="Belum ada uang masuk atau keluar">
        6 bulan terakhir belum ada pembayaran langganan lunas maupun transaksi yang dicatat. Catat transaksi di halaman Keuangan.
      </Kosong>
    );
  }

  const W = 640;
  const H = 240;
  const kiri = 52;
  const bawah = 26;
  const atas = 10;
  const tinggiPlot = H - atas - bawah;
  const lebarKolom = (W - kiri) / kas.length;
  const lebarBatang = Math.min(34, (lebarKolom - 18) / 2);
  const y = (v) => atas + tinggiPlot - (v / maks) * tinggiPlot;
  const garis = [0, 0.5, 1].map((f) => maks * f);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <div className="adm-legend">
          <span>
            <i style={{ background: WARNA.masuk }} /> Masuk
          </span>
          <span>
            <i style={{ background: WARNA.keluar }} /> Keluar
          </span>
        </div>
        <button className="adm-link" onClick={() => setTabel((v) => !v)} aria-expanded={tabel}>
          {tabel ? 'Sembunyiin angka' : 'Lihat angka'}
        </button>
      </div>
      <div style={{ position: 'relative' }}>
        <svg className="adm-grafik" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Pemasukan dan pengeluaran per bulan, 6 bulan terakhir">
          {garis.map((g) => (
            <g key={g}>
              <line x1={kiri} x2={W} y1={y(g)} y2={y(g)} stroke="#000" strokeOpacity={g ? 0.15 : 1} strokeWidth={g ? 1 : 2} />
              <text x={kiri - 8} y={y(g) + 4} textAnchor="end">
                {singkat(g)}
              </text>
            </g>
          ))}
          {kas.map((k, i) => {
            const x0 = kiri + i * lebarKolom + (lebarKolom - (lebarBatang * 2 + 2)) / 2;
            return (
              <g key={k.bulan}>
                {[
                  ['masuk', x0],
                  ['keluar', x0 + lebarBatang + 2],
                ].map(([jenis, x]) =>
                  k[jenis] > 0 ? (
                    <rect key={jenis} x={x} y={y(k[jenis])} width={lebarBatang} height={Math.max(2, y(0) - y(k[jenis]))} fill={WARNA[jenis]} stroke="#000" strokeWidth="2" />
                  ) : null
                )}
                <text x={kiri + i * lebarKolom + lebarKolom / 2} y={H - 6} textAnchor="middle">
                  {bulanLabel(k.bulan)}
                </text>
                {/* Area hover selebar kolom bulan - lebih gampang kena daripada batangnya doang. */}
                <rect
                  x={kiri + i * lebarKolom}
                  y={atas}
                  width={lebarKolom}
                  height={tinggiPlot}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  tabIndex={0}
                  aria-label={`${bulanLabel(k.bulan, true)}: masuk ${rupiah(k.masuk)}, keluar ${rupiah(k.keluar)}`}
                />
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <div className="adm-tooltip" style={{ left: `${((kiri + (hover + 0.5) * lebarKolom) / W) * 100}%`, top: 0 }}>
            {bulanLabel(kas[hover].bulan, true)}
            <br />
            Masuk {rupiah(kas[hover].masuk)}
            <br />
            Keluar {rupiah(kas[hover].keluar)}
          </div>
        )}
      </div>
      {tabel && (
        <div className="adm-gulir" style={{ marginTop: 12, boxShadow: 'none' }}>
          <table className="adm-tabel">
            <thead>
              <tr>
                <th>Bulan</th>
                <th className="kanan">Masuk</th>
                <th className="kanan">Keluar</th>
                <th className="kanan">Selisih</th>
              </tr>
            </thead>
            <tbody>
              {kas.map((k) => (
                <tr key={k.bulan}>
                  <td>{bulanLabel(k.bulan, true)}</td>
                  <td className="kanan">{rupiah(k.masuk)}</td>
                  <td className="kanan">{rupiah(k.keluar)}</td>
                  <td className="kanan">{rupiah(k.masuk - k.keluar)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
