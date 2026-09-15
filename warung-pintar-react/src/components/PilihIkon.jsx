import { GRUP_IKON, IKON_PRODUK } from '../lib/ikonProduk';

// Satu tombol pilihan ikon. Kunci '' = Otomatis (gambarnya pakai ikon hasil tebakan).
function OpsiIkon({ kunci, label, pas, tebakan, onPilih }) {
  const gambar = IKON_PRODUK[kunci || tebakan]?.svg || IKON_PRODUK.default.svg;
  return (
    <button type="button" className={'ikon-opsi' + (pas ? ' pas' : '')} onClick={() => onPilih(kunci)} aria-pressed={pas}>
      <span className="ikon-svg" dangerouslySetInnerHTML={{ __html: gambar }} />
      <small>{label}</small>
    </button>
  );
}

// Pemilih ikon barang (dipakai di layar edit barang). nilai '' = Otomatis (ditebak dari nama barang).
export default function PilihIkon({ nilai, tebakan, onPilih }) {
  return (
    <div className="ikon-pilih">
      <div className="ikon-grid">
        <OpsiIkon kunci="" label="Otomatis" pas={!nilai} tebakan={tebakan} onPilih={onPilih} />
      </div>
      {GRUP_IKON.map((g) => (
        <div key={g.nama}>
          <div className="ikon-grup-judul">{g.nama}</div>
          <div className="ikon-grid">
            {g.kunci.map((k) => (
              <OpsiIkon key={k} kunci={k} label={IKON_PRODUK[k].label} pas={nilai === k} tebakan={tebakan} onPilih={onPilih} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
