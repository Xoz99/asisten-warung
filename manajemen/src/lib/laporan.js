import { susunBlok } from '../komponen/TeksMarkdown.jsx';

// File laporan Kantor Konsulin: PDF (pdfmake, dimuat cuma waktu diunduh biar bundle utama tetap ringan), Markdown,
// dan CSV dari tabel di laporan. Bentuk PDF ngikutin markdown yang sama kayak di layar.

const POLA_INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
function inline(teks) {
  return String(teks)
    .split(POLA_INLINE)
    .filter(Boolean)
    .map((b) => {
      if (b.startsWith('**') && b.endsWith('**') && b.length > 4) return { text: b.slice(2, -2), bold: true };
      if (b.startsWith('`') && b.endsWith('`') && b.length > 2) return { text: b.slice(1, -1), background: '#F1F0E8' };
      if (((b.startsWith('*') && b.endsWith('*')) || (b.startsWith('_') && b.endsWith('_'))) && b.length > 2) return { text: b.slice(1, -1), italics: true };
      return b;
    });
}

function isiPdf(md) {
  const isi = [];
  for (const b of susunBlok(md)) {
    if (b.jenis === 'h') isi.push({ text: inline(b.isi), style: b.level <= 1 ? 'h1' : b.level === 2 ? 'h2' : 'h3' });
    else if (b.jenis === 'p') isi.push({ text: b.isi.flatMap((x, i) => (i ? ['\n', ...inline(x)] : inline(x))), margin: [0, 0, 0, 8] });
    else if (b.jenis === 'ul' || b.jenis === 'ol') {
      const daftar = b.isi.map((x) => ({ text: inline(x.teks), margin: [x.tingkat * 14, 0, 0, 3] }));
      isi.push(b.jenis === 'ol' ? { ol: daftar, margin: [0, 0, 0, 8] } : { ul: daftar, margin: [0, 0, 0, 8] });
    } else if (b.jenis === 'kutip') isi.push({ table: { widths: ['*'], body: [[{ text: b.isi.join('\n'), italics: true, margin: [6, 4, 6, 4] }]] }, layout: { hLineWidth: () => 0, vLineWidth: (i) => (i === 0 ? 4 : 0), vLineColor: () => '#FACC15', fillColor: () => '#FFFBEA' }, margin: [0, 0, 0, 8] });
    else if (b.jenis === 'kode') isi.push({ text: b.isi, font: 'Roboto', fontSize: 8, background: '#F4F4F5', margin: [0, 0, 0, 8], preserveLeadingSpaces: true });
    else if (b.jenis === 'tabel') {
      const kolom = b.kepala.length;
      isi.push({
        table: {
          headerRows: 1,
          widths: Array(kolom).fill('*'),
          body: [b.kepala.map((k) => ({ text: inline(k), bold: true, color: '#FFFFFF', fillColor: '#111111' })), ...b.isi.map((r) => b.kepala.map((_, i) => ({ text: inline(r[i] ?? '') })))],
        },
        layout: { hLineWidth: () => 1, vLineWidth: () => 1, hLineColor: () => '#000000', vLineColor: () => '#000000', fillColor: (i) => (i > 0 && i % 2 === 0 ? '#FAFAF5' : null), paddingTop: () => 4, paddingBottom: () => 4 },
        fontSize: 9,
        margin: [0, 2, 0, 10],
      });
    } else if (b.jenis === 'garis') isi.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1.5 }], margin: [0, 4, 0, 10] });
  }
  return isi;
}

// Model AI (terutama GPT-OSS) suka nulis spasi khusus kayak U+202F ("Oktober 2026", "1 minggu") yang nggak ada di
// font Roboto PDF, jadinya kotak & spasinya ilang. Semua jenis spasi dijadiin spasi biasa, karakter tak kelihatan dibuang.
export const rapikanTeks = (teks) => String(teks ?? '').replace(/[\p{Zs}]/gu, ' ').replace(/[​-‍⁠﻿]/g, '');

const tanggal = (d = new Date()) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
export const namaFile = (judul, ext) => `${String(judul || 'laporan').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'laporan'}-${new Date().toISOString().slice(0, 10)}.${ext}`;

// laporan: { judul, tugas, md, meta: [teks kecil, ...], dibuat: Date|string }
export async function buatPdf({ judul: judulAsli, tugas: tugasAsli, md: mdAsli, meta: metaAsli = [], dibuat }) {
  const [judul, tugas, md] = [judulAsli, tugasAsli, mdAsli].map(rapikanTeks);
  const meta = metaAsli.map(rapikanTeks);
  const [{ default: pdfMake }, { default: vfs }] = await Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')]);
  pdfMake.vfs = vfs;
  // Judul "# ..." dari Writer biasanya sama kayak judul kop, jadi nggak ditulis dua kali.
  const isi = md.replace(/^\s*#\s+(.+)\n/, (m, j) => (j.replace(/[*_`]/g, '').trim() === String(judul).trim() ? '' : m));
  const def = {
    pageSize: 'A4',
    pageMargins: [40, 70, 40, 50],
    info: { title: judul, author: 'Kantor Konsulin', creator: 'Makalin Ops' },
    header: () => ({
      margin: [40, 24, 40, 0],
      columns: [
        { text: 'KANTOR KONSULIN', bold: true, fontSize: 9, characterSpacing: 1.5, background: '#FACC15' },
        { text: 'Laporan analisa data Makalin', fontSize: 8, color: '#52525B', alignment: 'right' },
      ],
    }),
    footer: (hal, total) => ({
      margin: [40, 16, 40, 0],
      columns: [
        { text: 'Dibuat tim AI Kantor Konsulin dari data asli Makalin. Cek ulang sebelum dipakai buat keputusan.', fontSize: 7, color: '#52525B' },
        { text: `${hal} / ${total}`, fontSize: 8, alignment: 'right' },
      ],
    }),
    content: [
      { text: judul, style: 'judul' },
      { text: [{ text: 'Tugas: ', bold: true }, tugas || '-'], fontSize: 9, margin: [0, 0, 0, 4] },
      { text: [tanggal(dibuat ? new Date(dibuat) : new Date()), ...meta.map((m) => ` · ${m}`)].join(''), fontSize: 8, color: '#52525B', margin: [0, 0, 0, 6] },
      { canvas: [{ type: 'rect', x: 0, y: 0, w: 515, h: 3, color: '#000000' }], margin: [0, 0, 0, 14] },
      ...isiPdf(isi),
    ],
    defaultStyle: { font: 'Roboto', fontSize: 10, lineHeight: 1.3, color: '#111111' },
    styles: {
      judul: { fontSize: 20, bold: true, margin: [0, 0, 0, 6] },
      h1: { fontSize: 15, bold: true, margin: [0, 10, 0, 6] },
      h2: { fontSize: 13, bold: true, margin: [0, 10, 0, 5] },
      h3: { fontSize: 11, bold: true, margin: [0, 8, 0, 4] },
    },
  };
  return new Promise((ok) => pdfMake.createPdf(def).getBlob(ok));
}

// Semua tabel di laporan jadi satu CSV (dipisah baris kosong), siap dibuka di Excel/Sheets. null kalau nggak ada tabel.
export function tabelKeCsv(md) {
  const sel = (x) => {
    const s = String(x ?? '').replace(/\*\*|`/g, '');
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const tabel = susunBlok(md).filter((b) => b.jenis === 'tabel');
  if (!tabel.length) return null;
  return '﻿' + tabel.map((t) => [t.kepala, ...t.isi.map((r) => t.kepala.map((_, i) => r[i] ?? ''))].map((r) => r.map(sel).join(',')).join('\n')).join('\n\n');
}

// Butir-butir di bagian "Rekomendasi" laporan (sampai judul berikutnya). Sub-butir digabung ke butir induknya.
export function ambilRekomendasi(md) {
  const hasil = [];
  let dalam = false;
  for (const b of susunBlok(md)) {
    if (b.jenis === 'h') {
      if (dalam) break;
      dalam = /rekomendasi|tindak lanjut|saran/i.test(b.isi);
    } else if (dalam && (b.jenis === 'ul' || b.jenis === 'ol')) {
      for (const x of b.isi) {
        if (x.tingkat > 0 && hasil.length) hasil[hasil.length - 1] = `${hasil[hasil.length - 1].replace(/[.;:,]\s*$/, '')} (${x.teks.replace(/[.;]\s*$/, '')})`;
        else hasil.push(x.teks);
      }
    }
  }
  return hasil.map((t) => t.replace(/\*\*/g, '').trim()).filter(Boolean);
}

// Teks mentah satu bagian laporan (judul "## ..." yang cocok sampai judul setingkat berikutnya).
export function ambilBagian(md, pola) {
  const baris = String(md || '').split('\n');
  const awal = baris.findIndex((b) => /^\s*#{1,3}\s/.test(b) && pola.test(b));
  if (awal < 0) return '';
  const akhir = baris.findIndex((b, i) => i > awal && /^\s*#{1,3}\s/.test(b));
  return baris.slice(awal + 1, akhir < 0 ? undefined : akhir).join('\n').trim();
}

// Pesan buat AI Chat dari laporan: rekomendasi terpilih + konteks angka, maks 6.000 huruf (batas AI Chat).
export function pesanEksekusi({ judul, dibuat, md, rekomendasi, catatan }) {
  const tgl = dibuat ? ` (${new Date(dibuat).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })})` : '';
  const daftar = rekomendasi.length
    ? `Rekomendasi:\n${rekomendasi.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
    : `Ringkasan laporan:\n${(ambilBagian(md, /ringkasan/i) || md).slice(0, 1500)}`;
  const kepala = `Dari laporan Kantor Konsulin "${judul}"${tgl}.\n\nTolong bantu eksekusi ${rekomendasi.length ? 'rekomendasi' : 'tindak lanjut'} di bawah ini di Makalin. Cek data aktualnya dulu (angka laporan bisa udah berubah), lalu usulkan perubahan satu per satu buat gw setujui. Kalau ada yang nggak bisa dikerjain lewat Makalin, bilang aja dan kasih langkah manualnya.`;
  const tambahan = catatan?.trim() ? `\n\nCatatan dari gw: ${catatan.trim()}` : '';
  const isi = `${kepala}\n\n${daftar}${tambahan}`;
  const angka = ambilBagian(md, /angka kunci/i);
  const konteks = angka ? `\n\nKonteks angka dari laporan:\n${angka}` : '';
  return (isi + konteks).length <= 6000 ? isi + konteks : isi.slice(0, 6000);
}

export function unduhBlob(blob, nama) {
  const u = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: u, download: nama });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 10000);
}
