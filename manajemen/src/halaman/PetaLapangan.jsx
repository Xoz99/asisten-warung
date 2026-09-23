import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { tgl } from '../lib/format.js';
import { Gagal, Memuat, useData } from '../komponen/Ui.jsx';

// Peta kunjungan sales: satu titik per log kunjungan (dari GPS waktu dicatat). Buat lihat daerah mana yang udah
// dijangkau dan sales mana yang pegang daerah itu. Peta dasar: OpenStreetMap.
const HASIL = {
  berhasil: { nama: 'Berhasil', warna: '#16A34A' },
  tertarik: { nama: 'Tertarik', warna: '#1D4ED8' },
  pikir: { nama: 'Pikir-pikir', warna: '#EAB308' },
  ditolak: { nama: 'Ditolak', warna: '#DC2626' },
};
// Warna per sales: dibedain jelas satu sama lain, urutannya tetap biar sales yang sama selalu warnanya sama.
const PALET = ['#1D4ED8', '#DC2626', '#16A34A', '#9333EA', '#EA580C', '#0891B2', '#DB2777', '#65A30D', '#B45309', '#4F46E5', '#0D9488', '#BE123C'];
const PERIODE = [
  ['7', '7 hari'],
  ['30', '30 hari'],
  ['90', '90 hari'],
  ['', 'Semua'],
];
const PUSAT_AWAL = [-6.3, 107.3]; // sekitar Karawang - kepakai cuma kalau belum ada titik sama sekali
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const tanggalMundur = (hari) => {
  const d = new Date(Date.now() + 7 * 3600000 - (Number(hari) - 1) * 86400000);
  return d.toISOString().slice(0, 10);
};

export default function PetaLapangan({ api, sales }) {
  const [periode, setPeriode] = useState('30');
  const [pilihSales, setPilihSales] = useState('');
  const [hasil, setHasil] = useState('');
  const [warnai, setWarnai] = useState(sales ? 'hasil' : 'sales');
  const qs = new URLSearchParams({ ...(periode ? { dari: tanggalMundur(periode) } : {}), ...(pilihSales ? { sales: pilihSales } : {}), ...(hasil ? { hasil } : {}) });
  const { data, error, muat } = useData(api, `/lapangan/peta?${qs}`);

  const warnaSales = useMemo(() => Object.fromEntries((data?.sales || []).map((s, i) => [s.id, PALET[i % PALET.length]])), [data]);
  const ringkas = useMemo(() => {
    const m = {};
    for (const t of data?.titik || []) {
      const x = (m[t.sales_id] = m[t.sales_id] || { id: t.sales_id, nama: t.sales_nama || 'Sales dihapus', n: 0, berhasil: 0, toko: new Set(), terakhir: t.tanggal, titik: [] });
      x.n++;
      if (t.hasil === 'berhasil') x.berhasil++;
      if (t.id_kunjungan) x.toko.add(t.id_kunjungan.trim().toLowerCase());
      if (t.tanggal > x.terakhir) x.terakhir = t.tanggal;
      x.titik.push([t.lat, t.lng]);
    }
    return Object.values(m).sort((a, b) => b.n - a.n);
  }, [data]);

  const wadah = useRef(null);
  const peta = useRef(null);
  const lapisan = useRef(null);
  useEffect(() => {
    if (!wadah.current || peta.current) return;
    const p = L.map(wadah.current, { zoomControl: true, attributionControl: true }).setView(PUSAT_AWAL, 11);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    }).addTo(p);
    lapisan.current = L.layerGroup().addTo(p);
    peta.current = p;
    // Ukuran wadah berubah (layar diputar, sidebar pindah ke bawah) -> Leaflet perlu dikasih tau biar tile-nya nggak bolong.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => p.invalidateSize()) : null;
    ro?.observe(wadah.current);
    return () => {
      ro?.disconnect();
      p.remove();
      peta.current = null;
    };
  }, []);

  // Gambar ulang titik tiap data / cara pewarnaan berubah, lalu zoom biar semua titik kelihatan.
  useEffect(() => {
    const p = peta.current;
    if (!p || !data) return;
    lapisan.current.clearLayers();
    const batas = [];
    for (const t of data.titik) {
      const warna = warnai === 'hasil' ? HASIL[t.hasil]?.warna || '#52525B' : warnaSales[t.sales_id] || '#52525B';
      const lokasi = `https://www.google.com/maps?q=${t.lat},${t.lng}`;
      L.circleMarker([t.lat, t.lng], { radius: 8, color: '#111', weight: 2, fillColor: warna, fillOpacity: 0.9 })
        .bindPopup(
          `<div class="pt-popup"><b>${esc(t.id_kunjungan || `Kunjungan #${t.nomor}`)}</b>` +
            `<span>${esc(t.sales_nama || '-')} · ${esc(tgl(t.tanggal))}</span>` +
            `<span>${esc(HASIL[t.hasil]?.nama || t.hasil)} · ${esc(t.kategori)}</span>` +
            (t.akurasi_m ? `<span>Akurasi GPS ±${Math.round(t.akurasi_m)} m</span>` : '') +
            `<a href="${lokasi}" target="_blank" rel="noopener noreferrer">Buka di Google Maps</a></div>`
        )
        .addTo(lapisan.current);
      batas.push([t.lat, t.lng]);
    }
    if (batas.length) p.fitBounds(batas, { padding: [40, 40], maxZoom: 15 });
  }, [data, warnai, warnaSales]);

  const fokus = (titik) => titik.length && peta.current?.fitBounds(titik, { padding: [40, 40], maxZoom: 16 });

  return (
    <div className="pt">
      <div className="pt-alat">
        <div className="pt-segmen" role="group" aria-label="Periode">
          {PERIODE.map(([v, n]) => (
            <button key={n} className={periode === v ? 'on' : ''} aria-pressed={periode === v} onClick={() => setPeriode(v)}>
              {n}
            </button>
          ))}
        </div>
        {!sales && (
          <select value={pilihSales} onChange={(e) => setPilihSales(e.target.value)} aria-label="Filter sales">
            <option value="">Semua sales</option>
            {(data?.sales || []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.nama}
              </option>
            ))}
          </select>
        )}
        <select value={hasil} onChange={(e) => setHasil(e.target.value)} aria-label="Filter hasil">
          <option value="">Semua hasil</option>
          {Object.entries(HASIL).map(([v, h]) => (
            <option key={v} value={v}>
              {h.nama}
            </option>
          ))}
        </select>
        {!sales && (
          <div className="pt-segmen" role="group" aria-label="Warna titik">
            {[
              ['sales', 'Warna per sales'],
              ['hasil', 'Warna per hasil'],
            ].map(([v, n]) => (
              <button key={v} className={warnai === v ? 'on' : ''} aria-pressed={warnai === v} onClick={() => setWarnai(v)}>
                {n}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <Gagal apa="peta" pesan={error} onUlang={muat} />}
      <div className="pt-isi">
        <div className="pt-peta-bungkus">
          <div ref={wadah} className="pt-peta" role="region" aria-label="Peta kunjungan sales" />
          {!data && !error && (
            <div className="pt-lapis">
              <Memuat apa="peta" />
            </div>
          )}
          {data && data.titik.length === 0 && (
            <div className="pt-lapis">
              <p>
                <b>Belum ada kunjungan bertitik GPS</b>
                <span>di periode & filter ini.</span>
              </p>
            </div>
          )}
        </div>

        <aside className="pt-samping" aria-label="Ringkasan per sales">
          <p className="adm-label pt-judul">
            {data ? `${data.titik.length} kunjungan di peta` : 'Memuat…'}
          </p>
          {data?.tanpaGps > 0 && <p className="adm-redup pt-catatan">{data.tanpaGps} kunjungan lain nggak punya titik GPS (data lama), jadi nggak muncul.</p>}
          {warnai === 'hasil' || sales ? (
            <ul className="pt-legenda">
              {Object.entries(HASIL).map(([v, h]) => (
                <li key={v}>
                  <i style={{ background: h.warna }} /> {h.nama}
                </li>
              ))}
            </ul>
          ) : null}
          <ul className="pt-sales">
            {ringkas.map((r) => (
              <li key={r.id}>
                <button onClick={() => fokus(r.titik)} title="Zoom ke kunjungan sales ini">
                  {!sales && warnai === 'sales' && <i style={{ background: warnaSales[r.id] || '#52525B' }} aria-hidden="true" />}
                  <span className="pt-sales-teks">
                    <b>{r.nama}</b>
                    <span>
                      {r.n} kunjungan · {r.toko.size} toko · {r.berhasil} berhasil
                    </span>
                    <span>Terakhir {tgl(r.terakhir)}</span>
                  </span>
                  <span className="pt-fokus" aria-hidden="true">
                    Lihat
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
