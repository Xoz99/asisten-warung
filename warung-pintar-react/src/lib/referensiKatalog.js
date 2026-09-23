import { api } from './api';
import { ambilEmbedding, muatModelVisual } from './visualScan';

// Barang yang diambil dari Katalog Barang Bersama (atau punya foto https lain) biasanya udah bawa foto kemasan dari
// Open Food Facts, tapi belum punya referensi buat scan foto. Di sini foto itu diubah jadi embedding pakai model yang
// SAMA PERSIS dengan kamera (visualScan.js) lalu disimpen sebagai referensi (sudut 'katalog') - jadi barangnya langsung
// bisa dikenali scan foto tanpa pemilik warung jepret 3 sisi dulu. Hasil scan tetap ditampilin sebagai pilihan buat
// ditap (bukan dipilih otomatis), dan foto dari kamera sendiri tetap bisa ditambah buat akurasi lebih baik.
//
// Jalan di belakang begitu model scan siap (useModelVisual). Cuma satu proses sekaligus; barang yang fotonya gagal
// dimuat dilewati sampai halaman dibuka ulang.
let berjalan = null;
const gagal = new Set();

function muatGambar(url) {
  return new Promise((ok, tolak) => {
    const img = new Image();
    // Foto Open Food Facts ngirim Access-Control-Allow-Origin: * - tanpa crossOrigin, piksel gambarnya nggak boleh
    // dibaca model (canvas "tainted").
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    const t = setTimeout(() => tolak(new Error('Foto kelamaan dimuat')), 10000);
    img.onload = () => (clearTimeout(t), ok(img));
    img.onerror = () => (clearTimeout(t), tolak(new Error('Foto gagal dimuat')));
    img.src = url;
  });
}

export function lengkapiReferensiKatalog() {
  if (berjalan) return berjalan;
  berjalan = (async () => {
    let dibuat = 0;
    try {
      await muatModelVisual();
      const daftar = (await api.scan.perluReferensi()).filter((p) => !gagal.has(p.id));
      for (const p of daftar) {
        try {
          const img = await muatGambar(p.foto_url);
          const embedding = await ambilEmbedding(img);
          await api.scan.daftarkanReferensi(p.id, 'katalog', embedding, p.foto_url);
          dibuat++;
        } catch {
          gagal.add(p.id);
        }
        // Kasih jeda biar UI (kamera, ketikan) tetap lancar di HP kentang.
        await new Promise((ok) => setTimeout(ok, 30));
      }
    } catch {
      /* offline / model gagal - dicoba lagi lain kali scan dibuka */
    } finally {
      berjalan = null;
    }
    return dibuat;
  })();
  return berjalan;
}

// Dipanggil sebelum nyocokin hasil jepretan: kalau referensi katalog lagi dibikin, tunggu sebentar (maks `ms`)
// biar barang yang baru diambil dari katalog ikut kecocokan di scan pertama.
export async function tungguReferensiKatalog(ms = 10000) {
  if (!berjalan) return;
  await Promise.race([berjalan, new Promise((ok) => setTimeout(ok, ms))]);
}
