import { useEffect, useState } from 'react';
import { panggil } from '../lib/api.js';

// Form daftar calon Sales Partner - publik, tanpa login (makalin.konsulin.com/daftar?s=KODE).
// ?s= = kode titik sebar (sumber keyakinan tinggi). Tanpa kode, "tahu dari mana" wajib dipilih (§7.3).
export default function DaftarPublik() {
  const params = new URLSearchParams(window.location.search);
  const s = (params.get('s') || '').trim().toUpperCase();
  const [info, setInfo] = useState(null);
  const [isi, setIsi] = useState({ nama: '', noHp: '', domisili: '', dropdown: '', referral: params.get('ref') || '' });
  const [error, setError] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [selesai, setSelesai] = useState(false);

  useEffect(() => {
    panggil(null, 'GET', `/publik/daftar/info?s=${encodeURIComponent(s)}`)
      .then(setInfo)
      .catch((e) => setError(e.message));
  }, [s]);

  const ubah = (k) => (e) => setIsi((x) => ({ ...x, [k]: e.target.value }));
  const perluDropdown = !s && !isi.referral.trim();

  return (
    <div className="adm-tengah">
      <div className="adm-kartu adm-masuk" style={{ boxShadow: '8px 8px 0 #000', maxWidth: 480 }}>
        <div className="adm-kartu-kepala hitam">
          <h1 style={{ fontSize: 18, margin: 0 }}>Daftar Sales Partner Konsulin</h1>
        </div>
        {selesai ? (
          <>
            <h2 style={{ marginTop: 0 }}>Pendaftaran masuk</h2>
            <p>Makasih, {isi.nama.split(' ')[0]}. Tim Konsulin bakal ngehubungin kamu lewat WhatsApp {isi.noHp} buat tahap berikutnya.</p>
          </>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError('');
              setSibuk(true);
              try {
                await panggil(null, 'POST', '/publik/daftar', { ...isi, s });
                setSelesai(true);
              } catch (err) {
                setError(err.message);
              } finally {
                setSibuk(false);
              }
            }}
          >
            <p className="adm-sub" style={{ marginTop: 0 }}>
              Jual aplikasi Asisten Warung ke pemilik warung di sekitarmu dan dapat komisi dari tiap langganan.
              {info?.kampanye ? ` (${info.kampanye.nama}${info.kampanye.area ? `, ${info.kampanye.area}` : ''})` : ''}
            </p>
            <div className="field">
              <label htmlFor="d-nama">Nama lengkap</label>
              <input id="d-nama" value={isi.nama} onChange={ubah('nama')} autoComplete="name" required />
            </div>
            <div className="field">
              <label htmlFor="d-hp">Nomor WhatsApp</label>
              <input id="d-hp" value={isi.noHp} onChange={ubah('noHp')} inputMode="tel" autoComplete="tel" placeholder="0812-3456-7890" required />
            </div>
            <div className="field">
              <label htmlFor="d-dom">Domisili (kota / kecamatan)</label>
              <input id="d-dom" value={isi.domisili} onChange={ubah('domisili')} />
            </div>
            <div className="field">
              <label htmlFor="d-ref">Kode referral (kalau diajak teman)</label>
              <input id="d-ref" value={isi.referral} onChange={ubah('referral')} placeholder="REF-A1B2C3" />
            </div>
            {perluDropdown && (
              <div className="field">
                <label htmlFor="d-dari">Tahu Konsulin dari mana?</label>
                <select id="d-dari" value={isi.dropdown} onChange={ubah('dropdown')} required style={{ maxWidth: 'none', width: '100%', minHeight: 44 }}>
                  <option value="">Pilih salah satu</option>
                  {(info?.pilihanSumber || []).map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </div>
            )}
            {error && (
              <p className="adm-error" role="alert">
                {error}
              </p>
            )}
            <button className="btn utama" style={{ width: '100%', marginTop: 18 }} type="submit" disabled={sibuk}>
              {sibuk ? 'Mengirim…' : 'Kirim pendaftaran'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
