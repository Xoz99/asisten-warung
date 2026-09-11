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
              textAlign: 'left',
              background: dipilih ? 'var(--ink)' : 'var(--surface)',
              color: dipilih ? 'var(--bg)' : 'var(--ink)',
              border: dipilih ? '2px solid var(--brand)' : '1.5px solid var(--garis)',
              borderRadius: 20,
              padding: '16px 14px',
              font: 'inherit',
              cursor: 'pointer',
              // minWidth:0 WAJIB. Tanpa ini, item grid nggak mau nyusut di bawah lebar min-content
              // isinya - dan isinya ada teks white-space:nowrap ("Rp 3.650.000"), jadi kolomnya
              // melar & kartu kanan kepotong keluar layar di HP. Ini jebakan grid/flex yang sama
              // kayak yang udah ada catatannya di .ai-row (index.css).
              minWidth: 0,
              overflow: 'hidden',
            }}
          >
            {/* Badge ditaruh DI DALAM kartu, bukan nongol keluar lewat top:-9px. Di grid 2 kolom
                (HP), kartu baris kedua badge-nya naik ke celah antar baris & kelihatan menggantung
                lepas dari kartunya - persis kayak nempel di kartu yang di atasnya. Di satu baris
                (layar lebar) kelihatan oke, makanya kelewat waktu dicek di 1000px. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 18, marginBottom: 2 }}>
              <span style={{ fontWeight: 800, fontSize: 15 }}>{p.label}</span>
              {p.badge && (
                <span
                  style={{
                    background: 'var(--brand)', color: '#0A0A0A',
                    fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 99,
                    whiteSpace: 'nowrap', letterSpacing: '.02em', flex: 'none',
                  }}
                >
                  {p.badge}
                </span>
              )}
            </div>
            {/* Ukuran huruf ikut lebar layar. Diukur beneran di browser, bukan dikira-kira:
                  layar 320px -> grid jadi 1 kolom, kartu 282px, 22px muat
                  layar 360px -> 2 kolom, kartu 155px, 22px MELUBER (137>127), 20px ke bawah muat
                  layar 390px+ -> 2 kolom, kartu 170px+, 22px muat
                Jadi yang bermasalah cuma sekitar 360px (iPhone SE & banyak Android) - pas kartunya
                udah 2 kolom tapi layarnya masih sempit. clamp 18-22px: di 360px jadi ~18,7px
                (aman), di 430px balik 22px penuh. Sempat dipasang 4.6vw & itu kekecilan - HP lebar
                ikut kena padahal nggak perlu. */}
            <div
              className="p-num"
              style={{
                fontSize: 'clamp(18px, 5.2vw, 22px)',
                fontWeight: 800,
                marginTop: 4,
                letterSpacing: '-.01em',
                whiteSpace: 'nowrap',
              }}
            >
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
