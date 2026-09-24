// Markdown sederhana (jawaban AI Chat, catatan Artifact): judul, tebal/miring/kode, tautan http(s), daftar (bertingkat), kutipan,
// tabel, dan blok kode. Semua dirender jadi elemen React - HTML mentah dari teksnya nggak pernah dipakai.
const POLA_INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
function Inline({ teks }) {
  return String(teks).split(POLA_INLINE).map((b, i) => {
    if (!b) return null;
    if (b.startsWith('**') && b.endsWith('**') && b.length > 4) return <strong key={i}>{b.slice(2, -2)}</strong>;
    if (b.startsWith('`') && b.endsWith('`') && b.length > 2) return <code key={i}>{b.slice(1, -1)}</code>;
    const t = b.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (t) return <a key={i} href={t[2]} target="_blank" rel="noopener noreferrer">{t[1]}</a>;
    if (/^https?:\/\//.test(b)) return <a key={i} href={b} target="_blank" rel="noopener noreferrer">{b}</a>;
    if (((b.startsWith('*') && b.endsWith('*')) || (b.startsWith('_') && b.endsWith('_'))) && b.length > 2) return <em key={i}>{b.slice(1, -1)}</em>;
    return b;
  });
}
const selTabel = (baris) => baris.trim().replace(/^\||\|$/g, '').split('|').map((x) => x.trim());
function susunBlok(teks) {
  const baris = String(teks || '').replace(/\r/g, '').split('\n');
  const blok = [];
  for (let i = 0; i < baris.length; i++) {
    const b = baris[i];
    const pagar = b.match(/^\s*```\s*([\w-]*)/);
    if (pagar) {
      const isi = [];
      while (++i < baris.length && !/^\s*```/.test(baris[i])) isi.push(baris[i]);
      blok.push({ jenis: 'kode', bahasa: pagar[1], isi: isi.join('\n') });
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(b) && /^\s*\|?[\s:|-]+\|?\s*$/.test(baris[i + 1] || '') && (baris[i + 1] || '').includes('-')) {
      const kepala = selTabel(b);
      const isi = [];
      i++;
      while (i + 1 < baris.length && /^\s*\|.*\|\s*$/.test(baris[i + 1])) isi.push(selTabel(baris[++i]));
      blok.push({ jenis: 'tabel', kepala, isi });
      continue;
    }
    const h = b.match(/^\s*(#{1,6})\s+(.*)$/);
    if (h) {
      blok.push({ jenis: 'h', level: h[1].length, isi: h[2].replace(/\s*#+\s*$/, '') });
      continue;
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(b)) {
      blok.push({ jenis: 'garis' });
      continue;
    }
    const q = b.match(/^\s*>\s?(.*)$/);
    const akhir = blok[blok.length - 1];
    if (q) {
      if (akhir?.jenis === 'kutip') akhir.isi.push(q[1]);
      else blok.push({ jenis: 'kutip', isi: [q[1]] });
      continue;
    }
    const m = b.match(/^(\s*)(?:[-*•+]|(\d+)[.)])\s+(.*)$/);
    if (m) {
      const jenis = m[2] ? 'ol' : 'ul';
      const item = { teks: m[3], tingkat: Math.min(3, Math.floor(m[1].replace(/\t/g, '  ').length / 2)), nomor: m[2] };
      if (akhir && (akhir.jenis === jenis || (item.tingkat > 0 && (akhir.jenis === 'ul' || akhir.jenis === 'ol')))) akhir.isi.push(item);
      else blok.push({ jenis, isi: [item] });
      continue;
    }
    if (!b.trim()) {
      if (akhir && akhir.jenis !== 'kosong') blok.push({ jenis: 'kosong' });
      continue;
    }
    // Baris lanjutan item daftar (menjorok) digabung ke item terakhir.
    if (/^\s{2,}\S/.test(b) && (akhir?.jenis === 'ul' || akhir?.jenis === 'ol')) {
      akhir.isi[akhir.isi.length - 1].teks += ' ' + b.trim();
      continue;
    }
    if (akhir?.jenis === 'p') akhir.isi.push(b);
    else blok.push({ jenis: 'p', isi: [b] });
  }
  return blok;
}
export default function TeksMarkdown({ teks }) {
  return susunBlok(teks).map((b, i) => {
    switch (b.jenis) {
      case 'h':
        return <p key={i} className={`ai-judul ai-judul-${Math.min(b.level, 3)}`}><Inline teks={b.isi} /></p>;
      case 'p':
        return <p key={i}>{b.isi.map((x, j) => <span key={j}>{j > 0 && <br />}<Inline teks={x} /></span>)}</p>;
      case 'ul':
      case 'ol':
        return (
          <div key={i} className={`ai-daftar ${b.jenis}`}>
            {b.isi.map((x, j) => (
              <div key={j} className="ai-butir" style={{ '--tingkat': x.tingkat }}>
                <span className="ai-penanda" aria-hidden="true">{b.jenis === 'ol' && x.tingkat === 0 ? `${x.nomor || j + 1}.` : x.tingkat ? '◦' : '■'}</span>
                <span><Inline teks={x.teks} /></span>
              </div>
            ))}
          </div>
        );
      case 'kutip':
        return <blockquote key={i}>{b.isi.map((x, j) => <span key={j}>{j > 0 && <br />}<Inline teks={x} /></span>)}</blockquote>;
      case 'kode':
        return <pre key={i} className="ai-kode"><code>{b.isi}</code></pre>;
      case 'tabel':
        return (
          <div key={i} className="ai-tabel-bungkus">
            <table className="ai-tabel">
              <thead><tr>{b.kepala.map((x, j) => <th key={j}><Inline teks={x} /></th>)}</tr></thead>
              <tbody>{b.isi.map((r, j) => <tr key={j}>{b.kepala.map((_, k) => <td key={k}><Inline teks={r[k] ?? ''} /></td>)}</tr>)}</tbody>
            </table>
          </div>
        );
      case 'garis':
        return <hr key={i} />;
      default:
        return null;
    }
  });
}
