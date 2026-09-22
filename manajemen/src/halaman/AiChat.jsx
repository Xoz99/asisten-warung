import { useEffect, useRef, useState } from 'react';
import { bacaSesi, bukaFile } from '../lib/api.js';

// Tampilan jawaban AI: **tebal**, daftar (- / * / 1.), dan baris baru. Tanpa HTML mentah dari model.
function Tebal({ teks }) {
  return teks.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g).map((b, i) =>
    b.startsWith('**') && b.endsWith('**') && b.length > 4 ? (
      <strong key={i}>{b.slice(2, -2)}</strong>
    ) : b.startsWith('`') && b.endsWith('`') && b.length > 2 ? (
      <code key={i}>{b.slice(1, -1)}</code>
    ) : (b.startsWith('*') && b.endsWith('*')) || (b.startsWith('_') && b.endsWith('_')) ? (
      b.length > 2 ? <em key={i}>{b.slice(1, -1)}</em> : b
    ) : (
      b
    )
  );
}
function TeksAi({ teks }) {
  const blok = [];
  for (const baris of String(teks || '').split('\n')) {
    const h = baris.match(/^\s*#{1,6}\s+(.*)$/);
    if (h) {
      blok.push({ jenis: 'h', isi: [h[1]] });
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(baris)) continue;
    const m = baris.match(/^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/);
    const akhir = blok[blok.length - 1];
    if (m) {
      const jenis = m[1] ? 'ol' : 'ul';
      if (akhir?.jenis === jenis) akhir.isi.push(m[2]);
      else blok.push({ jenis, isi: [m[2]] });
    } else blok.push({ jenis: 'p', isi: [baris] });
  }
  return blok.map((b, i) =>
    b.jenis === 'h' ? (
      <p key={i} className="ai-judul"><Tebal teks={b.isi[0]} /></p>
    ) : b.jenis === 'p' ? (
      b.isi[0].trim() ? <p key={i}><Tebal teks={b.isi[0]} /></p> : null
    ) : b.jenis === 'ul' ? (
      <ul key={i}>{b.isi.map((x, j) => <li key={j}><Tebal teks={x} /></li>)}</ul>
    ) : (
      <ol key={i}>{b.isi.map((x, j) => <li key={j}><Tebal teks={x} /></li>)}</ol>
    )
  );
}

// Lampiran file dari AI: dibuka/diunduh langsung dari server pakai sesi login (file Artifact lewat link sementara).
const ukuranTeks = (n) => (!n ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const labelMime = (m) => (m === 'application/pdf' ? 'PDF' : m?.startsWith('image/') ? 'GAMBAR' : m?.startsWith('video/') ? 'VIDEO' : 'FILE');
async function ambilBlob(api, l) {
  if (l.jenis === 'artifact') {
    const r = await api('POST', `${l.path}/tautan`, {});
    const res = await fetch(r.url);
    if (!res.ok) throw new Error('File nggak bisa dibuka');
    return res.blob();
  }
  const res = await fetch('/api' + l.path, { headers: { Authorization: 'Bearer ' + (bacaSesi()?.token || '') } });
  if (!res.ok) throw new Error(`File nggak bisa dibuka (${res.status})`);
  return res.blob();
}
function Lampiran({ api, l, onError }) {
  const [pratinjau, setPratinjau] = useState(null);
  useEffect(() => {
    if (!l.mime?.startsWith('image/')) return;
    let u = null;
    let batal = false;
    ambilBlob(api, l).then((b) => !batal && setPratinjau((u = URL.createObjectURL(b))), () => {});
    return () => {
      batal = true;
      if (u) URL.revokeObjectURL(u);
    };
  }, [api, l]);
  const buka = async () => {
    try {
      if (l.jenis === 'artifact') {
        const r = await api('POST', `${l.path}/tautan`, {});
        window.open(r.url, '_blank', 'noopener');
      } else await bukaFile(l.path);
    } catch (e) {
      onError(e.message);
    }
  };
  const unduh = async () => {
    try {
      const b = await ambilBlob(api, l);
      const u = URL.createObjectURL(b);
      const a = document.createElement('a');
      a.href = u;
      a.download = l.nama || 'file';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 30000);
    } catch (e) {
      onError(e.message);
    }
  };
  return (
    <div className="ai-lampiran">
      {pratinjau ? <img src={pratinjau} alt={l.nama} /> : <span className="ai-lampiran-ikon">{labelMime(l.mime)}</span>}
      <span className="ai-lampiran-info">
        <b>{l.nama}</b>
        <small>{[labelMime(l.mime), ukuranTeks(l.ukuran)].filter(Boolean).join(' · ')}</small>
      </span>
      <span className="ai-lampiran-tombol">
        <button type="button" onClick={buka}>Buka</button>
        <button type="button" onClick={unduh}>Unduh</button>
      </span>
    </div>
  );
}

export default function AiChat({ api }) {
  const [status, setStatus] = useState(null);
  const [messages, setMessages] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [pending, setPending] = useState(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const end = useRef(null);
  const lock = useRef(false);
  const [versiStatus, setVersiStatus] = useState(0);
  useEffect(() => { let active = true; api('GET', '/ai/status').then(r => active && setStatus(r)).catch(e => active && setError(e.message)); return () => { active = false; }; }, [api, versiStatus]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [messages, pending, busy]);
  async function send(e) {
    e.preventDefault();
    if (lock.current || pending || !input.trim()) return;
    const text = input.trim();
    lock.current = true; setBusy(true); setError(''); setInput('');
    setMessages(m => [...m, { role: 'user', text }]);
    try {
      const r = await api('POST', '/ai/chat', { sessionId, message: text });
      setSessionId(r.sessionId); setPending(r.pending || null);
      setMessages(m => [...m, { role: 'assistant', text: r.message, lampiran: r.lampiran || [] }]);
    } catch (e) { setError(e.message); setInput(text); }
    finally { lock.current = false; setBusy(false); setVersiStatus(v => v + 1); }
  }
  async function decide(approve) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const r = await api('POST', '/ai/action', { sessionId, actionId: pending.id, approve });
      setPending(null); setMessages(m => [...m, { role: 'assistant', text: r.message }]);
    } catch (e) { setError(e.message); if ([404, 409].includes(e.status)) setPending(null); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="ai-chat">
    <div className="ai-heading"><div><span className="adm-mono">ASISTEN WORKSPACE</span><h1>AI Chat</h1><p>Baca data, cek kondisi bisnis, dan jalankan pekerjaan dari satu percakapan.</p></div>
      <button type="button" disabled={busy || Boolean(pending)} onClick={() => { setMessages([]); setSessionId(null); setError(''); }}>Chat baru</button></div>
    <p className="ai-info">{status ? status.aktif ? `Terhubung · ${status.model}${status.cadangan?.length ? ` (+${status.cadangan.length} cadangan)` : ''} · Akses mengikuti akunmu${status.jatah?.batasPesan > 0 ? ` · Sisa hari ini ${Math.max(0, status.jatah.batasPesan - status.jatah.pesan)}/${status.jatah.batasPesan} pesan` : ''}` : 'AI belum aktif. Isi OPENROUTER_API_KEY di konfigurasi server.' : 'Memeriksa koneksi…'}</p>
    <div className="ai-messages" role="log" aria-label="Percakapan AI" aria-live="polite" aria-busy={busy}>
      {!messages.length && <div className="ai-welcome"><h2>Mau dibantu apa?</h2><p>Data yang dibutuhkan untuk menjawab dikirim ke OpenRouter. Perubahan data ditampilkan untuk ditinjau sebelum dijalankan.</p>
        <div className="ai-suggestions">{['Ringkas kondisi bisnis dari dashboard', 'Tampilkan leads yang perlu follow-up', 'Siapa aja kandidat rekrutmen yang perlu aksi aku?', 'Kirimin CV kandidat terbaru'].map(t => <button key={t} onClick={() => setInput(t)}>{t}</button>)}</div></div>}
      {messages.map((m, i) => <article className={`ai-message ${m.role}`} key={i}><b>{m.role === 'user' ? 'Kamu' : 'Makalin AI'}</b><div className={m.role === 'user' ? '' : 'ai-teks'}>{m.role === 'user' ? m.text : <TeksAi teks={m.text} />}</div>{m.lampiran?.length > 0 && <div className="ai-lampiran-daftar">{m.lampiran.map(l => <Lampiran key={l.path} api={api} l={l} onError={setError} />)}</div>}</article>)}
      {pending && <div className="ai-action"><h3>Tinjau tindakan</h3><p>{pending.ringkasan}</p><p className="adm-mono">{pending.method} {pending.path}</p><pre>{JSON.stringify(pending.body, null, 2)}</pre><p>Jalankan hanya jika target dan isi perubahan sudah sesuai.</p><div className="ai-actions"><button disabled={busy} onClick={() => decide(true)}>Jalankan tindakan</button><button disabled={busy} onClick={() => decide(false)}>Batalkan</button></div></div>}
      {busy && <p role="status">AI sedang memproses…</p>}<div ref={end} />
    </div>
    {error && <p className="mk-error" role="alert">{error}</p>}
    <form className="ai-composer" onSubmit={send}><label htmlFor="ai-message">Pesan untuk AI</label><textarea id="ai-message" maxLength={6000} rows={3} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} disabled={busy || Boolean(pending) || !status?.aktif} placeholder="Contoh: cari lead Warung Bu Siti dan catat hasil follow-up…" /><div><small>Enter kirim · Shift+Enter baris baru · percakapan hilang setelah 30 menit nggak aktif.</small><button type="submit" disabled={busy || Boolean(pending) || !status?.aktif || !input.trim()}>Kirim</button></div></form>
  </section>;
}
