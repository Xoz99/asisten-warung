import { useEffect, useRef, useState } from 'react';
import { panggil } from '../lib/api.js';
import { keWebp } from '../lib/gambar.js';

// Form lamaran calon Sales Partner bawaan Makalin (/daftar). Di produksi form publiknya di konsulin.com/karir
// (repo konsulin-landing-page) dan /daftar dialihin ke sana - form ini dipakai kalau DAFTAR_URL kosong (mis. lokal).
// 3 langkah biar nggak kerasa panjang: data diri -> pengalaman & kesiapan -> dokumen & persetujuan.
// ?s= = kode titik sebar (sumber keyakinan tinggi). Tanpa kode & tanpa referral, "tahu dari mana" wajib (§7.3).
const LANGKAH = ['Data diri', 'Pengalaman & kesiapan', 'Dokumen & persetujuan'];
const MAKS_FILE = 3 * 1024 * 1024;
const AWAL = {
  nama: '', noHp: '', email: '', tanggalLahir: '', jenisKelamin: '', kota: '', kecamatan: '', pendidikan: '',
  pekerjaan: '', pengalamanSales: '', bidangPengalaman: '', waktuKerja: '', ketersediaan: '', kendaraan: '', hpAndroid: null,
  area: '', kenalWarung: '', alasan: '', sosmed: '', referral: '', dropdown: '', setujuData: false, setujuWa: true,
  skemaKerja: '', waktuHubungi: '', tempatProspek: [], tempatProspekLain: '',
};
const PROSPEK_LAIN = 'Saya memiliki ide lain';

export default function DaftarPublik() {
  const params = new URLSearchParams(window.location.search);
  const s = (params.get('s') || '').trim().toUpperCase();
  const [info, setInfo] = useState(null);
  const [isi, setIsi] = useState(() => ({ ...AWAL, referral: params.get('ref') || '' }));
  const [cv, setCv] = useState(null);
  const [foto, setFoto] = useState(null);
  const [langkah, setLangkah] = useState(0);
  const [error, setError] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [selesai, setSelesai] = useState(false);
  const atasRef = useRef(null);

  useEffect(() => {
    panggil(null, 'GET', `/publik/daftar/info?s=${encodeURIComponent(s)}`)
      .then(setInfo)
      .catch((e) => setError(e.message));
  }, [s]);

  const P = info?.pilihan || {};
  const ubah = (k) => (e) => setIsi((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  // Kode ?s= yang nggak dikenal (link salah ketik / titiknya dihapus) dianggap nggak ada kode.
  const kodeDikenal = !!(s && info?.kampanye);
  const perluDropdown = !kodeDikenal && !isi.referral.trim();

  // Validasi per langkah biar salahnya ketauan sebelum pindah, bukan pas kirim di akhir.
  const cekLangkah = (i) => {
    const kosong = (k, label) => (!String(isi[k] ?? '').trim() ? `${label} wajib diisi` : null);
    const cek = {
      0: [
        kosong('nama', 'Nama lengkap'),
        isi.noHp.replace(/\D/g, '').length < 10 ? 'Nomor WhatsApp belum benar' : null,
        kosong('tanggalLahir', 'Tanggal lahir'),
        kosong('jenisKelamin', 'Jenis kelamin'),
        kosong('kota', 'Kota / kabupaten'),
        kosong('kecamatan', 'Kecamatan'),
        kosong('pendidikan', 'Pendidikan terakhir'),
      ],
      1: [
        kosong('pekerjaan', 'Pekerjaan sekarang'),
        kosong('pengalamanSales', 'Pengalaman jualan'),
        kosong('waktuKerja', 'Waktu kerja'),
        kosong('ketersediaan', 'Hari & jam tersedia'),
        kosong('kendaraan', 'Kendaraan'),
        isi.hpAndroid === null ? 'Jawab soal HP Android' : null,
        kosong('area', 'Area yang mau digarap'),
        kosong('kenalWarung', 'Jumlah warung yang dikenal'),
        isi.alasan.trim().length < 20 ? 'Ceritain alasanmu minimal 20 huruf' : null,
        !isi.skemaKerja ? 'Pilih skema kerja yang paling nyaman buat kamu' : null,
        !isi.tempatProspek.length ? 'Pilih tempat terbaik buat nemuin pemilik usaha' : null,
        isi.tempatProspek.includes(PROSPEK_LAIN) && isi.tempatProspekLain.trim().length < 5 ? 'Tulis ide tempatmu (minimal 5 huruf)' : null,
      ],
      2: [
        !cv ? 'Upload CV kamu dulu' : null,
        !isi.waktuHubungi ? 'Pilih waktu terbaik buat dihubungi' : null,perluDropdown && !isi.dropdown ? 'Pilih tahu Konsulin dari mana' : null, !isi.setujuData ? 'Centang persetujuan pemakaian data' : null],
    }[i];
    return cek.find(Boolean) || '';
  };

  const lanjut = () => {
    const e = cekLangkah(langkah);
    setError(e);
    if (!e) {
      setLangkah((x) => x + 1);
      atasRef.current?.scrollIntoView({ block: 'start' });
    }
  };

  // Gambar (foto & CV berupa foto) diubah ke WEBP + dikecilin di HP dulu, jadi foto kamera 5-10 MB tetap bisa dikirim.
  // PDF dikirim apa adanya (maks 3 MB).
  const pilihFile = (set, jenis) => async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    setError('');
    if (!f) return;
    const gambar = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(f.type);
    if (jenis === 'foto' && !gambar) return setError('Foto harus berupa gambar (JPG, PNG, WEBP)');
    if (jenis === 'cv' && !gambar && f.type !== 'application/pdf') return setError('CV harus PDF atau gambar (JPG, PNG, WEBP)');
    if (gambar) {
      try {
        const h = await keWebp(f, jenis === 'foto' ? 1200 : 2000);
        if (h.ukuran > MAKS_FILE) return setError(`${jenis === 'cv' ? 'CV' : 'Foto'} masih lebih dari 3 MB setelah dikecilin`);
        return set(h);
      } catch {
        return setError('Gambar nggak kebaca. Coba pilih ulang atau pakai JPG.');
      }
    }
    if (f.size > MAKS_FILE) return setError('CV PDF maksimal 3 MB');
    const r = new FileReader();
    r.onload = () => set({ nama: f.name, ukuran: f.size, data: r.result });
    r.readAsDataURL(f);
  };

  const kirim = async (e) => {
    e.preventDefault();
    const salah = cekLangkah(0) || cekLangkah(1) || cekLangkah(2);
    if (salah) return setError(salah);
    setError('');
    setSibuk(true);
    try {
      await panggil(null, 'POST', '/publik/daftar', { ...isi, s, cv, foto });
      setSelesai(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSibuk(false);
    }
  };

  const f = (k, label, props = {}, bantu) => (
    <div className="field">
      <label htmlFor={`d-${k}`}>{label}</label>
      <input id={`d-${k}`} value={isi[k]} onChange={ubah(k)} {...props} />
      {bantu && <span className="adm-redup">{bantu}</span>}
    </div>
  );
  const pilih = (k, label, opsi) => (
    <div className="field">
      <label htmlFor={`d-${k}`}>{label}</label>
      <select id={`d-${k}`} value={isi[k]} onChange={ubah(k)} style={{ maxWidth: 'none', width: '100%', minHeight: 44 }}>
        <option value="">Pilih</option>
        {(opsi || []).map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </div>
  );
  // Pilihan berbentuk daftar (radio / centang) - buat pertanyaan yang opsinya panjang.
  const opsi = (k, label, daftar, maks) => {
    const banyak = Array.isArray(isi[k]);
    const penuh = banyak && maks && isi[k].length >= maks;
    return (
      <fieldset className="field adm-pilihan">
        <legend className="adm-label">
          {label}
          {maks ? <span className="adm-redup"> (pilih maksimal {maks})</span> : null}
        </legend>
        {(daftar || []).map((o) => {
          const dipilih = banyak ? isi[k].includes(o) : isi[k] === o;
          return (
            <label key={o} className={dipilih ? 'on' : ''}>
              <input
                type={banyak ? 'checkbox' : 'radio'}
                name={`d-${k}`}
                className="adm-centang"
                checked={dipilih}
                disabled={!dipilih && penuh}
                onChange={() => setError('') || setIsi((x) => ({ ...x, [k]: banyak ? (dipilih ? x[k].filter((y) => y !== o) : [...x[k], o]) : o }))}
              />
              <span>{o === PROSPEK_LAIN ? 'Saya memiliki ide lain (tulis di bawah)' : o}</span>
            </label>
          );
        })}
      </fieldset>
    );
  };
  const berkas = (label, nilai, set, jenis, accept) => (
    <div className="field">
      <span className="adm-label" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>
        {label}
      </span>
      {nilai ? (
        <div className="adm-kartu" style={{ boxShadow: 'none', padding: 10, display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
          <span style={{ overflowWrap: 'anywhere' }}>
            {nilai.nama} <span className="adm-redup">({nilai.ukuran < 1024 ? `${nilai.ukuran} B` : `${Math.round(nilai.ukuran / 1024)} KB`})</span>
          </span>
          <button type="button" className="btn kecil" onClick={() => set(null)}>
            Hapus
          </button>
        </div>
      ) : (
        <label className="adm-unggah" style={{ marginTop: 0 }}>
          <input type="file" accept={accept} onChange={pilihFile(set, jenis)} />
          <b>Pilih file</b>
          <span className="adm-redup">{jenis === 'cv' ? 'PDF (maks 3 MB) atau foto dokumen' : 'Foto dari kamera atau galeri'}</span>
        </label>
      )}
    </div>
  );

  return (
    <div className="adm-tengah" style={{ alignItems: 'flex-start', padding: '32px 16px' }}>
      <div className="adm-kartu" style={{ boxShadow: '8px 8px 0 #000', width: '100%', maxWidth: 620 }} ref={atasRef}>
        <div className="adm-kartu-kepala hitam">
          <h1 style={{ fontSize: 18, margin: 0 }}>Lamaran Sales Partner Konsulin</h1>
        </div>

        {selesai ? (
          <>
            <h2 style={{ marginTop: 0 }}>Lamaran kamu udah masuk</h2>
            <p>
              Makasih, {isi.nama.split(' ')[0]}. Tim Konsulin bakal ngecek lamaranmu dan ngehubungin lewat WhatsApp <b>{isi.noHp}</b> buat tahap berikutnya (tes produk
              singkat, lalu interview).
            </p>
          </>
        ) : (
          <form onSubmit={kirim} noValidate>
            <p className="adm-sub" style={{ marginTop: 0 }}>
              Sales Partner nawarin aplikasi Asisten Warung ke pemilik warung di area kamu dan dapat komisi dari tiap langganan. Isi lamaran ini sekitar 5 menit.
              {info?.kampanye ? ` Program: ${info.kampanye.nama}${info.kampanye.area ? `, ${info.kampanye.area}` : ''}.` : ''}
            </p>

            <ol className="adm-langkah" aria-label="Langkah pengisian">
              {LANGKAH.map((l, i) => (
                <li key={l} className={i === langkah ? 'on' : i < langkah ? 'lewat' : ''} aria-current={i === langkah ? 'step' : undefined}>
                  <span>{i < langkah ? '✓' : i + 1}</span>
                  {l}
                </li>
              ))}
            </ol>

            {langkah === 0 && (
              <>
                {f('nama', 'Nama lengkap (sesuai KTP)', { autoComplete: 'name' })}
                <div className="adm-baris" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                  {f('noHp', 'Nomor WhatsApp', { inputMode: 'tel', autoComplete: 'tel', placeholder: '0812-3456-7890' })}
                  {f('email', 'Email (opsional)', { type: 'email', autoComplete: 'email', placeholder: 'nama@email.com' })}
                  {f('tanggalLahir', 'Tanggal lahir', { type: 'date' })}
                  {pilih('jenisKelamin', 'Jenis kelamin', P.jenisKelamin)}
                  {f('kota', 'Kota / kabupaten domisili', { placeholder: 'Karawang' })}
                  {f('kecamatan', 'Kecamatan', { placeholder: 'Telukjambe' })}
                </div>
                {pilih('pendidikan', 'Pendidikan terakhir', P.pendidikan)}
              </>
            )}

            {langkah === 1 && (
              <>
                <div className="adm-baris" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                  {pilih('pekerjaan', 'Pekerjaan sekarang', P.pekerjaan)}
                  {pilih('pengalamanSales', 'Pengalaman jualan / sales', P.pengalamanSales)}
                </div>
                {f('bidangPengalaman', 'Pernah jualan apa? (opsional)', { placeholder: 'Misal: sales FMCG, jualan pulsa, reseller online' })}
                <div className="adm-baris" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                  {pilih('waktuKerja', 'Bisa kerja', P.waktuKerja)}
                  {f('ketersediaan', 'Hari & jam tersedia', { placeholder: 'Senin-Sabtu, 09.00-16.00' })}
                  {pilih('kendaraan', 'Kendaraan buat keliling', P.kendaraan)}
                  <fieldset className="field" style={{ border: 0, padding: 0, margin: '12px 0 0' }}>
                    <legend className="adm-label" style={{ fontSize: 11, marginBottom: 6 }}>
                      Punya HP Android + kuota internet?
                    </legend>
                    <div className="adm-toggle" style={{ gridTemplateColumns: '1fr 1fr' }}>
                      <button type="button" className={isi.hpAndroid === true ? 'on' : ''} onClick={() => setIsi((x) => ({ ...x, hpAndroid: true }))} aria-pressed={isi.hpAndroid === true}>
                        Punya
                      </button>
                      <button type="button" className={isi.hpAndroid === false ? 'on keluar' : ''} onClick={() => setIsi((x) => ({ ...x, hpAndroid: false }))} aria-pressed={isi.hpAndroid === false}>
                        Belum
                      </button>
                    </div>
                  </fieldset>
                </div>
                {f('area', 'Area yang mau kamu garap', { placeholder: 'Kecamatan / kelurahan sekitar rumah' })}
                {pilih('kenalWarung', 'Kira-kira kenal berapa pemilik warung di sekitarmu?', P.kenalWarung)}
                <div className="field">
                  <label htmlFor="d-alasan">Kenapa tertarik jadi Sales Partner?</label>
                  <textarea id="d-alasan" value={isi.alasan} onChange={ubah('alasan')} placeholder="Ceritain singkat: pengalamanmu, target penghasilan, atau kenapa cocok" />
                  <span className="adm-redup">{isi.alasan.trim().length}/20 huruf minimal</span>
                </div>
                {opsi('skemaKerja', 'Skema kerja mana yang paling bikin kamu nyaman?', P.skemaKerja)}
                {opsi('tempatProspek', 'Menurut kamu, di mana tempat terbaik buat nemuin pemilik usaha / UMKM yang butuh solusi software?', P.tempatProspek, 2)}
                {isi.tempatProspek.includes(PROSPEK_LAIN) && f('tempatProspekLain', 'Ide tempat lainnya', { placeholder: 'Misal: pasar tradisional, grup WA RT', maxLength: 200 })}
              </>
            )}

            {langkah === 2 && (
              <>
                {berkas('CV / riwayat hidup', cv, setCv, 'cv', 'application/pdf,image/*')}
                {berkas('Foto diri (opsional)', foto, setFoto, 'foto', 'image/*')}
                {f('sosmed', 'Link Instagram / Facebook / LinkedIn (opsional)', { placeholder: 'https://' })}
                {f('referral', 'Kode referral (kalau diajak teman)', { placeholder: 'REF-A1B2C3', autoCapitalize: 'characters' })}
                {perluDropdown && pilih('dropdown', 'Tahu Konsulin dari mana?', info?.pilihanSumber)}
                {opsi('waktuHubungi', 'Kalau kamu terpilih, kapan waktu terbaik tim kami ngehubungin lewat WhatsApp?', P.waktuHubungi)}
                <label className="adm-setuju">
                  <input type="checkbox" className="adm-centang" checked={isi.setujuData} onChange={ubah('setujuData')} />
                  <span>Saya setuju data di lamaran ini dipakai Konsulin buat proses seleksi Sales Partner. Data pelamar yang nggak lolos dihapus setelah 2 tahun.</span>
                </label>
                <label className="adm-setuju">
                  <input type="checkbox" className="adm-centang" checked={isi.setujuWa} onChange={ubah('setujuWa')} />
                  <span>Boleh dihubungi lewat WhatsApp soal lamaran ini.</span>
                </label>
              </>
            )}

            {error && (
              <p className="adm-error" role="alert">
                {error}
              </p>
            )}

            <div className="adm-tombol" style={{ justifyContent: 'space-between', marginTop: 20 }}>
              {langkah > 0 ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setError('');
                    setLangkah((x) => x - 1);
                  }}
                >
                  Kembali
                </button>
              ) : (
                <span />
              )}
              {langkah < LANGKAH.length - 1 ? (
                <button type="button" className="btn utama" onClick={lanjut}>
                  Lanjut
                </button>
              ) : (
                <button type="submit" className="btn utama" disabled={sibuk}>
                  {sibuk ? 'Mengirim…' : 'Kirim lamaran'}
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
