import { useCallback, useEffect, useRef, useState } from 'react';
import { Konfirmasi, Modal } from '../komponen/Ui.jsx';
import { TEMPLATE_ANALISA } from '../lib/kantorTemplate.js';

const HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const jamTeks = (j) => `${String(j).padStart(2, '0')}.00 WIB`;
const waktuWib = (t) => new Date(t).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const frekuensiTeks = (j) =>
  j.frekuensi === 'harian' ? `Tiap hari, ${jamTeks(j.jam)}` : j.frekuensi === 'mingguan' ? `Tiap ${HARI[j.hari - 1]}, ${jamTeks(j.jam)}` : `Tiap tanggal ${j.tanggal}, ${jamTeks(j.jam)}`;
const KOSONG = { nama: '', template: '', tugas: '', frekuensi: 'mingguan', jam: 8, hari: 1, tanggal: 1, revisi: true, aktif: true };

// Laporan otomatis Kantor Konsulin: jadwal yang dijalanin server (browser boleh ditutup), hasilnya masuk riwayat &
// notifikasi. onBuka(id laporan) buat buka laporan terakhirnya, onSelesai dipanggil waktu ada laporan terjadwal yang baru jadi.
export default function KantorJadwal({ api, aktif, onBuka, onSelesai }) {
  const [daftar, setDaftar] = useState(null);
  const [form, setForm] = useState(null);
  const [hapus, setHapus] = useState(null);
  const [sibuk, setSibuk] = useState('');
  const [galat, setGalat] = useState('');
  const statusLama = useRef({});

  const muat = useCallback(async () => {
    try {
      const r = await api('GET', '/ai/kantor/jadwal');
      if (r.some((j) => statusLama.current[j.id] === 'jalan' && j.status_terakhir !== 'jalan')) onSelesai?.();
      statusLama.current = Object.fromEntries(r.map((j) => [j.id, j.status_terakhir]));
      setDaftar(r);
    } catch (e) {
      setGalat(e.message);
      setDaftar((d) => d || []);
    }
  }, [api, onSelesai]);
  useEffect(() => {
    muat();
  }, [muat]);
  // Selama ada jadwal yang lagi jalan, statusnya dicek ulang tiap 15 detik.
  const adaJalan = daftar?.some((j) => j.status_terakhir === 'jalan');
  useEffect(() => {
    if (!adaJalan) return;
    const t = setInterval(muat, 15000);
    return () => clearInterval(t);
  }, [adaJalan, muat]);

  const kerjakan = async (kunci, fn) => {
    setSibuk(kunci);
    setGalat('');
    try {
      await fn();
      await muat();
    } catch (e) {
      setGalat(e.message);
    } finally {
      setSibuk('');
    }
  };
  const isiForm = (j) => ({ nama: j.nama, template: j.template || '', tugas: j.tugas, frekuensi: j.frekuensi, jam: j.jam, hari: j.hari || 1, tanggal: j.tanggal || 1, revisi: j.revisi, aktif: j.aktif });
  const simpan = (e) => {
    e.preventDefault();
    const { id, ...isi } = form;
    kerjakan('simpan', async () => {
      await api(id ? 'PATCH' : 'POST', id ? `/ai/kantor/jadwal/${id}` : '/ai/kantor/jadwal', { ...isi, jam: Number(isi.jam), hari: Number(isi.hari), tanggal: Number(isi.tanggal) });
      setForm(null);
    });
  };
  const tutupForm = useCallback(() => setForm(null), []);
  const ubah = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const pilihTemplate = (e) => {
    const t = TEMPLATE_ANALISA.find((x) => x.id === e.target.value);
    setForm((f) => ({ ...f, template: e.target.value, tugas: t ? t.teks : f.tugas, nama: f.nama || (t ? t.label : '') }));
  };

  return (
    <section className="adm-kartu kantor-jadwal">
      <div className="adm-kartu-kepala">
        <h2>Laporan otomatis</h2>
        <button type="button" className="btn kecil aksen" onClick={() => setForm({ ...KOSONG })}>
          + Jadwal
        </button>
      </div>
      {!aktif && <p className="adm-redup">Laporan otomatis butuh AI aktif (GROQ_API_KEY di server).</p>}
      {galat && (
        <p className="adm-error" role="alert">
          {galat}
        </p>
      )}
      {daftar === null ? (
        <p className="adm-redup">Memuat…</p>
      ) : daftar.length === 0 ? (
        <p className="adm-redup">Belum ada jadwal. Misal: laporan bulanan tiap tanggal 1 jam 07.00, atau evaluasi trial tiap Senin. Dikerjain server walau browser ditutup.</p>
      ) : (
        <ul>
          {daftar.map((j) => (
            <li key={j.id} className={j.aktif ? '' : 'mati'}>
              <div className="kantor-jadwal-isi">
                <b>{j.nama}</b>
                <small>{frekuensiTeks(j)}</small>
                <small>
                  {j.status_terakhir === 'jalan' ? 'Lagi dibikin tim sekarang…' : j.aktif && j.berikutnya ? `Berikutnya ${waktuWib(j.berikutnya)}` : 'Nonaktif'}
                  {j.admin_nama && ` · atas nama ${j.admin_nama}`}
                </small>
                <span className="kantor-riwayat-chip">
                  {j.status_terakhir === 'jalan' && <span className="adm-chip kuning">Jalan</span>}
                  {j.status_terakhir === 'berhasil' && <span className="adm-chip hijau">Terakhir berhasil · {waktuWib(j.terakhir_jalan)}</span>}
                  {j.status_terakhir === 'gagal' && <span className="adm-chip merah">Terakhir gagal</span>}
                </span>
                {j.status_terakhir === 'gagal' && j.error_terakhir && <small className="adm-error">{j.error_terakhir}</small>}
                {j.laporan_terakhir && (
                  <button type="button" className="adm-link" onClick={() => onBuka(j.laporan_terakhir)}>
                    Buka laporan terakhir
                  </button>
                )}
              </div>
              <span className="kantor-riwayat-aksi">
                <button type="button" className="btn kecil" onClick={() => kerjakan('jalan' + j.id, () => api('POST', `/ai/kantor/jadwal/${j.id}/jalankan`))} disabled={!aktif || j.status_terakhir === 'jalan' || sibuk === 'jalan' + j.id}>
                  Jalankan
                </button>
                <button type="button" className="btn kecil" onClick={() => setForm({ id: j.id, ...isiForm(j) })}>
                  Edit
                </button>
                <button type="button" className="btn kecil" onClick={() => kerjakan('aktif' + j.id, () => api('PATCH', `/ai/kantor/jadwal/${j.id}`, { ...isiForm(j), aktif: !j.aktif }))} disabled={sibuk === 'aktif' + j.id}>
                  {j.aktif ? 'Matikan' : 'Aktifkan'}
                </button>
                <button type="button" className="btn kecil bahaya" onClick={() => setHapus(j)}>
                  Hapus
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {form && (
        <Modal judul={form.id ? 'Edit laporan otomatis' : 'Laporan otomatis baru'} onTutup={tutupForm} lebar={560}>
          <form onSubmit={simpan}>
            <div className="field">
              <label htmlFor="jadwal-template">Analisa</label>
              <select id="jadwal-template" value={form.template} onChange={pilihTemplate}>
                <option value="">Tulis sendiri</option>
                {TEMPLATE_ANALISA.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="jadwal-nama">Nama jadwal</label>
              <input id="jadwal-nama" value={form.nama} onChange={ubah('nama')} maxLength={80} placeholder="Misal: Laporan bulanan buat Bos" />
            </div>
            <div className="field">
              <label htmlFor="jadwal-tugas">Tugas analisa</label>
              <textarea id="jadwal-tugas" value={form.tugas} onChange={ubah('tugas')} maxLength={4000} />
              <small className="adm-redup">Tulis {'{bulan_ini}'} atau {'{bulan_lalu}'}, nanti otomatis diganti nama bulan waktu laporannya dibikin.</small>
            </div>
            <div className="kantor-jadwal-waktu">
              <div className="field">
                <label htmlFor="jadwal-frekuensi">Ulangi</label>
                <select id="jadwal-frekuensi" value={form.frekuensi} onChange={ubah('frekuensi')}>
                  <option value="harian">Tiap hari</option>
                  <option value="mingguan">Tiap minggu</option>
                  <option value="bulanan">Tiap bulan</option>
                </select>
              </div>
              {form.frekuensi === 'mingguan' && (
                <div className="field">
                  <label htmlFor="jadwal-hari">Hari</label>
                  <select id="jadwal-hari" value={form.hari} onChange={ubah('hari')}>
                    {HARI.map((h, i) => (
                      <option key={h} value={i + 1}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {form.frekuensi === 'bulanan' && (
                <div className="field">
                  <label htmlFor="jadwal-tanggal">Tanggal</label>
                  <select id="jadwal-tanggal" value={form.tanggal} onChange={ubah('tanggal')}>
                    {Array.from({ length: 28 }, (_, i) => (
                      <option key={i} value={i + 1}>
                        {i + 1}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="field">
                <label htmlFor="jadwal-jam">Jam</label>
                <select id="jadwal-jam" value={form.jam} onChange={ubah('jam')}>
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>
                      {jamTeks(i)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="kantor-opsi" style={{ marginTop: 14 }}>
              <label>
                <input type="checkbox" checked={form.revisi} onChange={ubah('revisi')} /> Reviewer boleh minta revisi
              </label>
              <label>
                <input type="checkbox" checked={form.aktif} onChange={ubah('aktif')} /> Aktif
              </label>
            </div>
            <p className="adm-redup" style={{ marginTop: 12 }}>
              Jalan di server atas nama kamu (data dibaca pakai hak aksesmu), tiap laporan makan 1 pesan dari jatah AI harianmu. Hasilnya masuk Riwayat laporan & Notifikasi.
            </p>
            <div className="adm-tombol">
              <button className="btn utama" type="submit" disabled={sibuk === 'simpan' || !form.nama.trim() || !form.tugas.trim()}>
                {sibuk === 'simpan' ? 'Nyimpen…' : 'Simpan jadwal'}
              </button>
              <button className="btn" type="button" onClick={tutupForm}>
                Batal
              </button>
            </div>
          </form>
        </Modal>
      )}
      {hapus && (
        <Konfirmasi
          judul="Hapus jadwal?"
          pesan={`Jadwal "${hapus.nama}" berhenti dan dihapus. Laporan yang udah jadi tetap ada di riwayat.`}
          onYa={() => {
            const j = hapus;
            setHapus(null);
            kerjakan('hapus' + j.id, () => api('DELETE', `/ai/kantor/jadwal/${j.id}`));
          }}
          onBatal={() => setHapus(null)}
        />
      )}
    </section>
  );
}
