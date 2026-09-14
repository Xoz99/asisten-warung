import { escapeHtml } from './format';

// Balasan Mang AI boleh pakai markdown RINGAN: **tebal**, daftar "- " / "1. ", dan paragraf. Dulu
// cuma **tebal** yang dikenali & prompt-nya ngelarang daftar, jadi balasan yang nyebut beberapa
// orang/barang numpuk jadi satu paragraf panjang yang susah dibaca sekilas di HP.
//
// Di-escape DULUAN (biar teks dari AI nggak bisa nyisipin HTML), baru polanya diubah jadi tag.
// Heading (#) nggak diminta di prompt, tapi kalau modelnya tetep ngasih, cukup ditebalin - jangan
// sampai tanda pagarnya nongol mentah. Semua ini jalan di HP, nggak nambah token sama sekali.
const tebalBot = (t) => t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
export const formatBot = (s) => {
  let html = '';
  let daftar = null; // 'ul' | 'ol' | null - daftar yang lagi kebuka
  const tutup = () => {
    if (daftar) html += `</${daftar}>`;
    daftar = null;
  };
  for (const mentah of escapeHtml(String(s || '')).split('\n')) {
    const t = mentah.trim();
    const titik = /^[-*\u2022]\s+(.*)$/.exec(t);
    const nomor = /^\d+[.)]\s+(.*)$/.exec(t);
    if (titik || nomor) {
      const jenis = titik ? 'ul' : 'ol';
      if (daftar !== jenis) {
        tutup();
        html += `<${jenis}>`;
        daftar = jenis;
      }
      html += `<li>${tebalBot((titik || nomor)[1])}</li>`;
      continue;
    }
    tutup();
    const judul = /^#{1,6}\s+(.*)$/.exec(t);
    if (judul) html += `<p><b>${judul[1].replace(/\*\*/g, '')}</b></p>`;
    else if (t) html += `<p>${tebalBot(t)}</p>`;
  }
  tutup();
  return html;
};

// Tombol lanjutan di bawah balasan TERAKHIR Mang AI - kayak saran di ChatGPT/Gemini, tapi dihitung
// di HP dari topik obrolannya, BUKAN diminta ke AI. Jadi nggak makan token: kalau AI yang disuruh
// ngusulin, tiap balasan nambah puluhan token keluaran cuma buat tombol.
//   jenis 'buka'  -> langsung pindah ke layar terkait (gratis)
//   jenis 'tanya' -> ngirim pertanyaan lanjutan (makan token kayak pesan biasa)
// Pertanyaan lanjutannya cuma yang BISA dijawab dari data yang dikirim ke AI - jangan nyaranin
// sesuatu yang ujungnya dijawab "datanya nggak ada".
export function saranLanjutan(pertanyaan, jawaban) {
  const t = `${pertanyaan} ${jawaban}`.toLowerCase();
  const hasil = [];
  const buka = (label, layar) => hasil.push({ jenis: 'buka', label, layar });
  const tanya = (label) => hasil.push({ jenis: 'tanya', label });
  if (/kasbon|utang|hutang|ngutang/.test(t)) {
    buka('Lihat daftar kasbon', 's-pelanggan');
    tanya('Total utang semua berapa?');
  }
  if (/penjualan|omzet|jualan|untung|laba|pemasukan/.test(t)) {
    buka('Buka laporan', 's-laporan');
    tanya('Barang paling laris apa?');
  }
  if (/stok|habis|menipis|kulakan/.test(t)) {
    buka('Buka stok', 's-stok');
    tanya('Barang apa yang ngendap?');
  }
  if (/serah terima|giliran|laci/.test(t)) buka('Riwayat serah terima', 's-riwayat');
  const unik = hasil.filter((x, i) => hasil.findIndex((y) => y.label === x.label) === i);
  // Maksimal 3 - lebih dari itu tombolnya ngalahin balasannya sendiri.
  return unik.slice(0, 3);
}
