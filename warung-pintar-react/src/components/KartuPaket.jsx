import { rupiah } from '../lib/format';
import mangWarungImg from '../assets/mangwarung.webp';

// Kartu pilihan paket langganan - SATU komponen dipakai bareng layar Lainnya & LisensiHabis.
//
// Dulu dua layar itu punya salinan daftar paketnya masing-masing, LENGKAP sama harga yang ditulis
// tangan sebagai teks ('Rp 490.000'). Begitu harga di backend naik, dua-duanya ketinggalan -
// pelanggan liat Rp 49.000 di layar tapi ditagih Rp 50.000 sama Midtrans. Nggak ada error, nggak
// ada yang ngeh, cuma pelanggan yang ngerasa dikadalin.
//
// Sekarang `paket` datang dari backend (lisensi.paket, lihat KATALOG_PLAN di midtrans.service.js)
// dan tampilannya cuma ditulis sekali di sini.
export default function KartuPaket({ paket = [], pilih, onPilih }) {
  if (!paket.length) return <p className="opnhint">Memuat daftar paket…</p>;
  return (
    // auto-fit + minmax: kartunya berdampingan kalau layarnya muat, menumpuk ke bawah di HP
    // sempit - tanpa media query yang mesti dijaga sendiri.
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
      {paket.map((p) => {
        const dipilih = pilih === p.id;
        return (
          <button
            key={p.id}
            onClick={() => onPilih(p.id)}
            style={{
              position: 'relative',
              textAlign: 'left',
              background: dipilih ? 'var(--ink)' : 'var(--surface)',
              color: dipilih ? 'var(--bg)' : 'var(--ink)',
              border: dipilih ? '2px solid var(--brand)' : '1.5px solid var(--garis)',
              borderRadius: 20,
              padding: '16px 14px',
              font: 'inherit',
              cursor: 'pointer',
            }}
          >
            {p.badge && (
              <span
                style={{
                  position: 'absolute', top: -9, right: 10,
                  background: 'var(--brand)', color: '#0A0A0A',
                  fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 99, whiteSpace: 'nowrap',
                }}
              >
                {p.badge}
              </span>
            )}
            <div style={{ fontWeight: 800, fontSize: 15 }}>{p.label}</div>
            <div className="p-num" style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>
              {rupiah(p.harga)}
            </div>
            {/* Padanan per bulan cuma buat paket yang punya durasi - ini yang bikin "hemat"-nya
                kelihatan NYATA (Rp 41.667 vs Rp 50.000), bukan cuma diklaim di teks. Paket
                permanen nggak punya padanan, jadi dikasih keterangan sifatnya. */}
            <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2, fontWeight: 600 }}>
              {p.perBulan ? `≈ ${rupiah(p.perBulan)}/bulan` : 'sekali bayar'}
            </div>
            {/* Hemat dalam RUPIAH, bukan persen - "hemat Rp 100.000" lebih kebayang buat pemilik
                warung daripada "hemat 17%". Angkanya dihitung backend dari harga asli. */}
            {p.hemat > 0 && (
              <div style={{ fontSize: 12, marginTop: 4, fontWeight: 700, color: dipilih ? 'var(--brand)' : '#16a34a' }}>
                Hemat {rupiah(p.hemat)}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 10, fontSize: 12, fontWeight: 600, opacity: 0.75 }}>
              <img src={mangWarungImg} alt="" style={{ width: 14, height: 14, objectFit: 'contain', flex: 'none' }} />
              AI {Number(p.jatahAi).toLocaleString('id-ID')}/hari
            </div>
          </button>
        );
      })}
    </div>
  );
}
