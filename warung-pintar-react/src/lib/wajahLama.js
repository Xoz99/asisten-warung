// Data wajah pelanggan yang didaftarin pakai model lama (versi 1) nggak dipakai lagi buat ngenalin -
// descriptor-nya nggak bisa dibandingin sama model baru (lihat lib/wajah.js). Biar pemilik warung nggak
// harus foto ulang pelanggannya satu-satu, descriptor baru dihitung ulang dari FOTO pelanggan yang udah
// kesimpen. Pelanggan lama yang nggak punya foto (atau fotonya nggak kedeteksi) tetap perlu difoto ulang
// lewat layar Pelanggan.
import { api } from './api';
import { ambilDeskriptorWajah, gambarDariDataUrl } from './wajah';

// Dicoba sekali per sesi per pelanggan - foto yang wajahnya nggak kedeteksi nggak bakal tiba-tiba
// kedeteksi di percobaan berikutnya, jadi jangan diulang tiap kali layar dibuka.
const sudahDicoba = new Set();

export const perluPerbaruiWajah = (p) => p.punyaWajahLama && !p.punyaWajah && !!p.foto && !sudahDicoba.has(p.id);

// Balikin jumlah pelanggan yang berhasil diperbarui.
export async function perbaruiWajahLama(daftarPelanggan) {
  let berhasil = 0;
  for (const p of daftarPelanggan.filter(perluPerbaruiWajah)) {
    sudahDicoba.add(p.id);
    try {
      const d = await ambilDeskriptorWajah(await gambarDariDataUrl(p.foto));
      if (d) {
        await api.wajah.daftarkan(p.id, d);
        berhasil++;
      }
    } catch {
      /* foto rusak/nggak kebaca - pelanggan ini tetap bisa difoto ulang manual */
    }
  }
  return berhasil;
}
