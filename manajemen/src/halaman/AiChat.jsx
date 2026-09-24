import { useCallback, useEffect, useRef, useState } from 'react';
import { bacaSesi, bukaFile } from '../lib/api.js';
import TeksAi from '../komponen/TeksMarkdown.jsx';

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

const jamTeks = (t) => (t ? new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '');
function waktuRelatif(t) {
  const d = new Date(t);
  const hariIni = new Date();
  const selisih = Math.floor((new Date(hariIni.toDateString()) - new Date(d.toDateString())) / 86400000);
  if (selisih <= 0) return jamTeks(t);
  if (selisih === 1) return 'Kemarin';
  if (selisih < 7) return d.toLocaleDateString('id-ID', { weekday: 'long' });
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: d.getFullYear() === hariIni.getFullYear() ? undefined : 'numeric' });
}
function grupWaktu(t) {
  const selisih = Math.floor((new Date(new Date().toDateString()) - new Date(new Date(t).toDateString())) / 86400000);
  return selisih <= 0 ? 'Hari ini' : selisih === 1 ? 'Kemarin' : selisih < 7 ? '7 hari terakhir' : selisih < 30 ? '30 hari terakhir' : 'Lebih lama';
}

function Salin({ teks }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className="ai-mini"
      onClick={() => navigator.clipboard?.writeText(teks).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); }, () => {})}
    >
      {ok ? 'Tersalin' : 'Salin'}
    </button>
  );
}

function ItemRiwayat({ c, aktif, onBuka, onGanti, onHapus, kunci }) {
  const [edit, setEdit] = useState(false);
  const [judul, setJudul] = useState(c.judul);
  const [yakin, setYakin] = useState(false);
  if (edit)
    return (
      <form
        className="ai-riwayat-item edit"
        onSubmit={async (e) => {
          e.preventDefault();
          if (judul.trim() && judul.trim() !== c.judul) await onGanti(c.id, judul.trim());
          setEdit(false);
        }}
      >
        <input autoFocus value={judul} maxLength={80} onChange={(e) => setJudul(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && (setJudul(c.judul), setEdit(false))} aria-label="Nama chat" />
        <button type="submit" className="ai-mini">Simpan</button>
      </form>
    );
  return (
    <div className={`ai-riwayat-item${aktif ? ' aktif' : ''}`}>
      <button type="button" className="ai-riwayat-buka" onClick={() => onBuka(c.id)} disabled={kunci} aria-current={aktif ? 'true' : undefined}>
        <b>{c.judul}</b>
        <small>{waktuRelatif(c.diubah)} · {c.jumlah} pesan</small>
      </button>
      {yakin ? (
        <span className="ai-riwayat-aksi tampil">
          <button type="button" className="ai-mini bahaya" onClick={() => onHapus(c.id)} disabled={kunci}>Hapus</button>
          <button type="button" className="ai-mini" onClick={() => setYakin(false)}>Batal</button>
        </span>
      ) : (
        <span className="ai-riwayat-aksi">
          <button type="button" className="ai-mini" onClick={() => { setJudul(c.judul); setEdit(true); }} aria-label={`Ganti nama ${c.judul}`}>Ubah</button>
          <button type="button" className="ai-mini" onClick={() => setYakin(true)} aria-label={`Hapus ${c.judul}`} disabled={kunci}>Hapus</button>
        </span>
      )}
    </div>
  );
}

const SARAN = [
  ['Ringkas bisnis', 'Ringkas kondisi bisnis dari dashboard'],
  ['Follow-up leads', 'Tampilkan leads yang perlu follow-up'],
  ['Rekrutmen', 'Siapa aja kandidat rekrutmen yang perlu aksi aku?'],
  ['Kirim file', 'Kirimin CV kandidat terbaru'],
];

export default function AiChat({ api }) {
  const [status, setStatus] = useState(null);
  const [riwayat, setRiwayat] = useState([]);
  const [cari, setCari] = useState('');
  const [laci, setLaci] = useState(false);
  const [messages, setMessages] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [judul, setJudul] = useState('');
  const [pending, setPending] = useState(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [memuat, setMemuat] = useState(false);
  const [error, setError] = useState('');
  const kotak = useRef(null);
  const teks = useRef(null);
  const lock = useRef(false);
  const [versiStatus, setVersiStatus] = useState(0);

  useEffect(() => {
    let active = true;
    api('GET', '/ai/status').then((r) => active && setStatus(r)).catch((e) => active && setError(e.message));
    return () => { active = false; };
  }, [api, versiStatus]);
  const muatRiwayat = useCallback(
    (q = '') => api('GET', `/ai/riwayat${q ? `?q=${encodeURIComponent(q)}` : ''}`).then(setRiwayat).catch(() => {}),
    [api]
  );
  useEffect(() => {
    const t = setTimeout(() => muatRiwayat(cari.trim()), cari ? 250 : 0);
    return () => clearTimeout(t);
  }, [cari, muatRiwayat]);
  useEffect(() => {
    const el = kotak.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, pending, busy]);
  useEffect(() => {
    const el = teks.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [input]);

  function chatBaru() {
    if (lock.current) return;
    setMessages([]); setSessionId(null); setJudul(''); setPending(null); setError(''); setLaci(false);
    teks.current?.focus();
  }
  async function bukaChat(id) {
    if (lock.current) return;
    setLaci(false);
    if (id === sessionId) return;
    setMemuat(true); setError(''); setPending(null);
    try {
      const r = await api('GET', `/ai/riwayat/${id}`);
      setSessionId(r.id); setJudul(r.judul);
      setMessages(r.pesan.map((m) => ({ role: m.peran === 'user' ? 'user' : 'assistant', text: m.isi || '', lampiran: m.lampiran || [], waktu: m.created_at })));
    } catch (e) {
      setError(e.message);
    } finally {
      setMemuat(false);
    }
  }
  async function gantiNama(id, j) {
    try {
      await api('PATCH', `/ai/riwayat/${id}`, { judul: j });
      if (id === sessionId) setJudul(j);
      muatRiwayat(cari.trim());
    } catch (e) {
      setError(e.message);
    }
  }
  async function hapus(id) {
    try {
      await api('DELETE', `/ai/riwayat/${id}`);
      if (id === sessionId) chatBaru();
      setRiwayat((x) => x.filter((c) => c.id !== id));
    } catch (e) {
      setError(e.message);
    }
  }

  async function kirim(text) {
    if (lock.current || pending || !text.trim()) return;
    text = text.trim();
    lock.current = true; setBusy(true); setError(''); setInput('');
    setMessages((m) => [...m, { role: 'user', text, waktu: new Date().toISOString() }]);
    try {
      const r = await api('POST', '/ai/chat', { sessionId, message: text });
      if (!sessionId) setJudul(text.replace(/\s+/g, ' ').slice(0, 60));
      setSessionId(r.sessionId); setPending(r.pending || null);
      setMessages((m) => [...m, { role: 'assistant', text: r.message, lampiran: r.lampiran || [], waktu: new Date().toISOString() }]);
    } catch (e) {
      setError(e.message); setInput(text);
      setMessages((m) => (m[m.length - 1]?.text === text ? m.slice(0, -1) : m));
    } finally {
      lock.current = false; setBusy(false); setVersiStatus((v) => v + 1); muatRiwayat(cari.trim());
    }
  }
  async function decide(approve) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const r = await api('POST', '/ai/action', { sessionId, actionId: pending.id, approve });
      setPending(null);
      setMessages((m) => [...m, { role: 'assistant', text: r.message, waktu: new Date().toISOString() }]);
    } catch (e) {
      setError(e.message);
      if ([404, 409].includes(e.status)) setPending(null);
    } finally {
      lock.current = false; setBusy(false); muatRiwayat(cari.trim());
    }
  }

  const sisa = status?.jatah?.batasPesan > 0 ? Math.max(0, status.jatah.batasPesan - status.jatah.pesan) : null;
  const kunci = busy || memuat;
  const grup = [];
  for (const c of riwayat) {
    const g = grupWaktu(c.diubah);
    if (grup[grup.length - 1]?.g !== g) grup.push({ g, isi: [] });
    grup[grup.length - 1].isi.push(c);
  }

  return (
    <section className="ai-chat">
      {laci && <div className="ai-latar" onClick={() => setLaci(false)} aria-hidden="true" />}
      <aside className={`ai-samping${laci ? ' buka' : ''}`} aria-label="Riwayat chat">
        <button type="button" className="ai-baru" onClick={chatBaru} disabled={kunci}>+ Chat baru</button>
        <input className="ai-cari" type="search" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari riwayat…" aria-label="Cari riwayat chat" />
        <div className="ai-riwayat">
          {!riwayat.length && <p className="ai-kosong">{cari ? 'Nggak ada chat yang cocok.' : 'Belum ada riwayat. Chat yang kamu mulai bakal tersimpan di sini.'}</p>}
          {grup.map((g) => (
            <div key={g.g} className="ai-riwayat-grup">
              <p className="ai-grup-label">{g.g}</p>
              {g.isi.map((c) => (
                <ItemRiwayat key={c.id + c.judul} c={c} aktif={c.id === sessionId} onBuka={bukaChat} onGanti={gantiNama} onHapus={hapus} kunci={kunci} />
              ))}
            </div>
          ))}
        </div>
        <p className="ai-samping-kaki">Riwayat cuma kelihatan buat akunmu · disimpan 180 hari</p>
      </aside>

      <div className="ai-panel">
        <header className="ai-kepala">
          <button type="button" className="ai-tombol-riwayat" onClick={() => setLaci(true)} aria-label="Buka riwayat chat">Riwayat</button>
          <div className="ai-kepala-judul">
            <span className="adm-mono">MAKALIN AI</span>
            <h1>{judul || 'Chat baru'}</h1>
          </div>
          <div className="ai-kepala-status">
            <span className={`ai-titik${status?.aktif ? ' on' : ''}`} aria-hidden="true" />
            <span className="ai-model" title={status?.cadangan?.length ? `Cadangan: ${status.cadangan.join(', ')}` : undefined}>
              {status ? (status.aktif ? `${status.model.replace(/:free$/, '')}${status.cadangan?.length ? ` +${status.cadangan.length}` : ''}` : 'AI belum aktif') : 'Memeriksa…'}
            </span>
            {sisa !== null && <span className={`ai-sisa${sisa <= 5 ? ' tipis' : ''}`}>{sisa}/{status.jatah.batasPesan} pesan</span>}
          </div>
        </header>

        <div className="ai-pesan" ref={kotak} role="log" aria-label="Percakapan AI" aria-live="polite" aria-busy={busy || memuat}>
          {memuat ? (
            <p className="ai-kosong tengah">Memuat percakapan…</p>
          ) : !messages.length ? (
            <div className="ai-sambutan">
              <div className="ai-logo" aria-hidden="true">AI</div>
              <h2>Mau dibantu apa hari ini?</h2>
              <p>Tanya data leads, rekrutmen, karyawan, bagi hasil, atau minta file. Perubahan data selalu ditampilkan dulu buat kamu setujui.</p>
              <div className="ai-saran">
                {SARAN.map(([j, t]) => (
                  <button key={t} type="button" onClick={() => kirim(t)} disabled={kunci || !status?.aktif}>
                    <b>{j}</b>
                    <span>{t}</span>
                  </button>
                ))}
              </div>
              {status && !status.aktif && <p className="adm-error">AI belum aktif. Isi OPENROUTER_API_KEY di konfigurasi server.</p>}
            </div>
          ) : (
            messages.map((m, i) => (
              <article className={`ai-bubble-baris ${m.role}`} key={i}>
                {m.role !== 'user' && <div className="ai-avatar" aria-hidden="true">AI</div>}
                <div className="ai-bubble">
                  <div className="ai-bubble-isi">{m.role === 'user' ? <p className="ai-teks-user">{m.text}</p> : <div className="ai-teks"><TeksAi teks={m.text} /></div>}</div>
                  {m.lampiran?.length > 0 && (
                    <div className="ai-lampiran-daftar">{m.lampiran.map((l) => <Lampiran key={l.path} api={api} l={l} onError={setError} />)}</div>
                  )}
                  <div className="ai-bubble-kaki">
                    <span>{m.role === 'user' ? 'Kamu' : 'Makalin AI'}{m.waktu ? ` · ${jamTeks(m.waktu)}` : ''}</span>
                    {m.role !== 'user' && m.text && <Salin teks={m.text} />}
                  </div>
                </div>
              </article>
            ))
          )}
          {pending && (
            <div className="ai-tindakan">
              <p className="ai-tindakan-label">PERLU PERSETUJUAN</p>
              <p className="ai-tindakan-ringkas">{pending.ringkasan}</p>
              <p className="adm-mono">{pending.method} {pending.path}</p>
              {pending.body && Object.keys(pending.body).length > 0 && (
                <details>
                  <summary>Lihat isi perubahan</summary>
                  <pre>{JSON.stringify(pending.body, null, 2)}</pre>
                </details>
              )}
              <div className="ai-tindakan-tombol">
                <button type="button" className="utama" disabled={busy} onClick={() => decide(true)}>Jalankan</button>
                <button type="button" disabled={busy} onClick={() => decide(false)}>Batalkan</button>
              </div>
            </div>
          )}
          {busy && (
            <div className="ai-bubble-baris assistant" role="status">
              <div className="ai-avatar" aria-hidden="true">AI</div>
              <div className="ai-bubble ai-mengetik"><span /><span /><span /><em>Lagi mikir…</em></div>
            </div>
          )}
        </div>

        {error && <p className="ai-galat" role="alert">{error}<button type="button" className="ai-mini" onClick={() => setError('')}>Tutup</button></p>}
        <form className="ai-tulis" onSubmit={(e) => { e.preventDefault(); kirim(input); }}>
          <label htmlFor="ai-message" className="sr-only">Pesan untuk AI</label>
          <textarea
            id="ai-message"
            ref={teks}
            maxLength={6000}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
            disabled={kunci || Boolean(pending) || !status?.aktif}
            placeholder={pending ? 'Setujui atau batalkan tindakan dulu…' : 'Tanya soal data Makalin…'}
          />
          <button type="submit" disabled={kunci || Boolean(pending) || !status?.aktif || !input.trim()} aria-label="Kirim">Kirim</button>
        </form>
        <p className="ai-catatan">Enter kirim · Shift+Enter baris baru · data yang diperlukan dikirim ke OpenRouter (data pribadi disaring)</p>
      </div>
    </section>
  );
}
