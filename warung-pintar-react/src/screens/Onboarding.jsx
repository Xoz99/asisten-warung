import { useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { escapeHtml } from '../lib/format';
import { BARCODE, JENIS_USAHA, KEBUTUHAN, PENJAGA } from '../lib/profilUsaha';

// "Kenalan dulu" - muncul SEKALI pas akun baru (atau akun lama yang belum pernah ngisi) masuk, sebelum halaman
// utama. 5 pertanyaan pilihan, tanpa AI (nggak makan token). Jawabannya dipakai buat: saran Mang AI (margin &
// contoh barang sesuai jenis usaha), nama panggilan di memori Mang AI, dan kartu "Langkah awal" di Beranda.
// Juga dipakai buat ngubah jawaban dari Lainnya > Profil usaha (modeUbah).
const TOTAL = 5;

function Pilihan({ opsi, nilai, onPilih, multi = false }) {
  return (
    <div className="kenalan-opsi">
      {opsi.map((o) => {
        const pas = multi ? nilai.includes(o.k) : nilai === o.k;
        return (
          <button key={o.k} type="button" className={pas ? 'pas' : ''} aria-pressed={pas} onClick={() => onPilih(o.k)}>
            <span>
              <b>{o.label}</b>
              {o.ket && <small>{o.ket}</small>}
            </span>
            <span className="cek">{pas ? '✓' : ''}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function Onboarding({ modeUbah = false, onTutup }) {
  const { profilUsaha, simpanProfilUsaha, authWarung, toast } = useApp();
  const awal = profilUsaha?.data && !profilUsaha.data.dilewati ? profilUsaha.data : null;
  const [langkah, setLangkah] = useState(modeUbah ? 1 : 0);
  const [jenis, setJenis] = useState(awal?.jenis || '');
  const [jenisLain, setJenisLain] = useState(awal?.jenisLain || '');
  const [penjaga, setPenjaga] = useState(awal?.penjaga || '');
  const [kebutuhan, setKebutuhan] = useState(awal?.kebutuhan || []);
  const [barcode, setBarcode] = useState(awal?.barcode || '');
  const [panggilan, setPanggilan] = useState(awal?.namaPanggilan || '');
  const [sibuk, setSibuk] = useState(false);

  const simpan = async (profil) => {
    setSibuk(true);
    try {
      await simpanProfilUsaha(profil);
      if (modeUbah) {
        toast('Profil usaha disimpan');
        onTutup?.();
      }
    } catch (e) {
      toast(escapeHtml(e.message || 'Gagal nyimpen, coba lagi'));
      setSibuk(false);
    }
  };

  const toggleKebutuhan = (k) => setKebutuhan((d) => (d.includes(k) ? d.filter((x) => x !== k) : [...d, k]));

  const bisaLanjut =
    langkah === 1
      ? jenis && (jenis !== 'lainnya' || jenisLain.trim())
      : langkah === 2
        ? !!penjaga
        : langkah === 3
          ? kebutuhan.length > 0
          : langkah === 4
            ? !!barcode
            : true;

  const lanjut = () => {
    if (langkah < TOTAL) return setLangkah((l) => l + 1);
    simpan({ jenis, jenisLain, penjaga, kebutuhan, barcode, namaPanggilan: panggilan });
  };

  if (langkah === 0) {
    return (
      <div className="kenalan-isi">
        <div className="kenalan-judul">Halo{authWarung?.nama ? `, ${authWarung.nama}` : ''}!</div>
        <div className="kenalan-sub">
          Sebelum mulai, kenalan dulu yuk - {TOTAL} pertanyaan singkat, tinggal pilih. Jawabannya dipakai buat nyesuain saran
          Mang AI & langkah awal di aplikasi sama usahamu.
        </div>
        <div className="kenalan-aksi satu">
          <button className="btn utama" onClick={() => setLangkah(1)}>
            Mulai
          </button>
        </div>
        <button className="linkkecil" style={{ marginTop: 14 }} disabled={sibuk} onClick={() => simpan({ dilewati: true })}>
          Lewati dulu, isi nanti di Lainnya
        </button>
      </div>
    );
  }

  return (
    <div className="kenalan-isi">
      <div className="kenalan-progres">
        <i style={{ width: `${(langkah / TOTAL) * 100}%` }} />
      </div>
      <div className="kenalan-langkah">
        Pertanyaan {langkah} dari {TOTAL}
      </div>

      {langkah === 1 && (
        <>
          <div className="kenalan-judul">Usahamu jualan apa?</div>
          <Pilihan opsi={JENIS_USAHA} nilai={jenis} onPilih={setJenis} />
          {jenis === 'lainnya' && (
            <div className="field">
              <label>Jenis usahanya</label>
              <input value={jenisLain} onChange={(e) => setJenisLain(e.target.value)} maxLength={40} placeholder="Misal: toko alat tulis" autoFocus />
            </div>
          )}
        </>
      )}
      {langkah === 2 && (
        <>
          <div className="kenalan-judul">Siapa yang biasa jaga?</div>
          <Pilihan opsi={PENJAGA} nilai={penjaga} onPilih={setPenjaga} />
        </>
      )}
      {langkah === 3 && (
        <>
          <div className="kenalan-judul">Paling butuh bantuan buat apa?</div>
          <div className="kenalan-sub">Boleh pilih lebih dari satu.</div>
          <Pilihan opsi={KEBUTUHAN} nilai={kebutuhan} onPilih={toggleKebutuhan} multi />
        </>
      )}
      {langkah === 4 && (
        <>
          <div className="kenalan-judul">Barang daganganmu kebanyakan ada barcode-nya?</div>
          <Pilihan opsi={BARCODE} nilai={barcode} onPilih={setBarcode} />
        </>
      )}
      {langkah === 5 && (
        <>
          <div className="kenalan-judul">Mang AI enaknya manggil kamu apa?</div>
          <div className="kenalan-sub">Boleh dikosongin.</div>
          <div className="field">
            <label>Nama panggilan</label>
            <input value={panggilan} onChange={(e) => setPanggilan(e.target.value)} maxLength={40} placeholder="Misal: Bu Idah, Bang Joko" />
          </div>
        </>
      )}

      <div className="kenalan-aksi">
        {langkah > 1 || !modeUbah ? (
          <button className="btn" disabled={sibuk} onClick={() => setLangkah((l) => l - 1)}>
            Kembali
          </button>
        ) : (
          <button className="btn" disabled={sibuk} onClick={onTutup}>
            Batal
          </button>
        )}
        <button className="btn utama" disabled={!bisaLanjut || sibuk} onClick={lanjut}>
          {langkah < TOTAL ? 'Lanjut' : sibuk ? 'Menyimpan…' : 'Selesai'}
        </button>
      </div>
    </div>
  );
}
