// Dekoder barcode ZXing di thread terpisah (Web Worker). Di thread tampilan, satu dekode makan ~250ms di HP kelas
// menengah, jadi dulu sengaja dijeda lama (scan kerasa lambat). Di sini dia boleh jalan terus tanpa bikin layar
// macet. Dipakai mulaiScanBarcode() di barcodeScan.js.
import { buatDekoderZxing } from './barcodeScan';

let dekoder = null;
self.onmessage = async (e) => {
  const { id, data, w, h, putar } = e.data;
  try {
    if (!dekoder) dekoder = await buatDekoderZxing();
    self.postMessage({ id, kode: dekoder.dekodePiksel(new Uint8ClampedArray(data), w, h, putar) });
  } catch {
    self.postMessage({ id, kode: null });
  }
};
