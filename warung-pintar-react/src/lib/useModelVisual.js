import { useCallback, useEffect, useState } from 'react';
import { muatModelVisual } from './visualScan';
import { lengkapiReferensiKatalog } from './referensiKatalog';

// Status model pengenal foto barang (MobileNet), dimuat DI BELAKANG - nggak nahan kamera.
//
// Dulu kamera & model ditunggu barengan lewat Promise.all. Kalau modelnya gagal/kelamaan dimuat
// (sinyal warung lelet), Promise.all ikut gagal dan stream kamera yang UDAH kebuka nggak pernah
// sempat disimpen - pas sheet ditutup nggak ada yang bisa dimatiin, kamera nyala terus di
// belakang sampai aplikasinya dimatiin paksa. Kebukti waktu dites: model diblokir, sheet ditutup,
// track kamera tetap 'live'. Makanya sekarang dua-duanya jalan sendiri-sendiri: kamera & scan
// barcode (yang nggak butuh model sama sekali) langsung bisa dipakai, model nyusul.
//
// `aktif` false = nggak usah dimuat (mis. menu Scan Barcode di Stok, yang nggak jepret foto).
// Balikin { keadaan: 'memuat' | 'siap' | 'gagal', pesan, cobaLagi }.
export function useModelVisual(aktif = true) {
  const [keadaan, setKeadaan] = useState('memuat');
  const [pesan, setPesan] = useState('');

  // Nggak nyetel 'memuat' di sini: nilai awalnya udah 'memuat', dan nyetel state langsung di dalam
  // efek bikin render dobel yang nggak perlu. Balik ke 'memuat' cuma pas user minta coba lagi.
  const muat = useCallback(() => {
    let batal = false;
    muatModelVisual()
      .then(() => {
        if (!batal) setKeadaan('siap');
        // Barang dari katalog yang punya foto tapi belum punya referensi scan -> dibikinin di belakang.
        lengkapiReferensiKatalog();
      })
      .catch((e) => {
        if (batal) return;
        setPesan(e?.message || 'Gagal memuat pengenal barang');
        setKeadaan('gagal');
      });
    return () => {
      batal = true;
    };
  }, []);

  useEffect(() => (aktif ? muat() : undefined), [aktif, muat]);

  const cobaLagi = useCallback(() => {
    setKeadaan('memuat');
    muat();
  }, [muat]);

  return { keadaan, pesan, cobaLagi };
}
