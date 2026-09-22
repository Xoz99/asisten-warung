import { useEffect, useRef, useState } from 'react';

// Tampilan jawaban AI: **tebal**, daftar (- / * / 1.), dan baris baru. Tanpa HTML mentah dari model.
function Tebal({ teks }) {
  return teks.split(/(\*\*[^*]+\*\*)/g).map((b, i) => (b.startsWith('**') && b.endsWith('**') && b.length > 4 ? <b key={i}>{b.slice(2, -2)}</b> : b));
}
function TeksAi({ teks }) {
  const blok = [];
  for (const baris of String(teks || '').split('\n')) {
    const m = baris.match(/^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/);
    const akhir = blok[blok.length - 1];
    if (m) {
      const jenis = m[1] ? 'ol' : 'ul';
      if (akhir?.jenis === jenis) akhir.isi.push(m[2]);
      else blok.push({ jenis, isi: [m[2]] });
    } else blok.push({ jenis: 'p', isi: [baris] });
  }
  return blok.map((b, i) =>
    b.jenis === 'p' ? (
      b.isi[0].trim() ? <p key={i}><Tebal teks={b.isi[0]} /></p> : null
    ) : b.jenis === 'ul' ? (
      <ul key={i}>{b.isi.map((x, j) => <li key={j}><Tebal teks={x} /></li>)}</ul>
    ) : (
      <ol key={i}>{b.isi.map((x, j) => <li key={j}><Tebal teks={x} /></li>)}</ol>
    )
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
      setMessages(m => [...m, { role: 'assistant', text: r.message }]);
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
        <div className="ai-suggestions">{['Ringkas kondisi bisnis dari dashboard', 'Tampilkan leads yang perlu follow-up', 'Cek ringkasan rekrutmen dan karyawan'].map(t => <button key={t} onClick={() => setInput(t)}>{t}</button>)}</div></div>}
      {messages.map((m, i) => <article className={`ai-message ${m.role}`} key={i}><b>{m.role === 'user' ? 'Kamu' : 'Makalin AI'}</b><div className={m.role === 'user' ? '' : 'ai-teks'}>{m.role === 'user' ? m.text : <TeksAi teks={m.text} />}</div></article>)}
      {pending && <div className="ai-action"><h3>Tinjau tindakan</h3><p>{pending.ringkasan}</p><p className="adm-mono">{pending.method} {pending.path}</p><pre>{JSON.stringify(pending.body, null, 2)}</pre><p>Jalankan hanya jika target dan isi perubahan sudah sesuai.</p><div className="ai-actions"><button disabled={busy} onClick={() => decide(true)}>Jalankan tindakan</button><button disabled={busy} onClick={() => decide(false)}>Batalkan</button></div></div>}
      {busy && <p role="status">AI sedang memproses…</p>}<div ref={end} />
    </div>
    {error && <p className="mk-error" role="alert">{error}</p>}
    <form className="ai-composer" onSubmit={send}><label htmlFor="ai-message">Pesan untuk AI</label><textarea id="ai-message" maxLength={6000} rows={3} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} disabled={busy || Boolean(pending) || !status?.aktif} placeholder="Contoh: cari lead Warung Bu Siti dan catat hasil follow-up…" /><div><small>Enter kirim · Shift+Enter baris baru · percakapan hilang setelah 30 menit nggak aktif.</small><button type="submit" disabled={busy || Boolean(pending) || !status?.aktif || !input.trim()}>Kirim</button></div></form>
  </section>;
}
