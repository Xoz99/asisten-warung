// Semua foto yang diupload dikecilin & diubah ke WEBP di browser dulu (sama kayak lib/kamera.js di Warung Pintar).
//
// canvas.toDataURL() yang diminta format yang nggak didukung DIAM-DIAM balikin PNG (perilaku resmi spesifikasi HTML),
// dan Safari lama nggak bisa bikin WEBP. PNG itu lossless jadi fotonya malah gede. Makanya dicek sekali: kalau WEBP
// nggak bisa, pakai JPEG.
let format = null;
export function formatGambar() {
  if (format) return format;
  try {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    format = c.toDataURL('image/webp').startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg';
  } catch {
    format = 'image/jpeg';
  }
  return format;
}

// File gambar -> { data (data URL WEBP/JPEG), ukuran (byte), nama }. Sisi terpanjang dibatasi `maks` px.
export async function keWebp(file, maks = 1600, kualitas = 0.82) {
  if (!file.type.startsWith('image/')) throw new Error('File bukan gambar');
  const bmp = await createImageBitmap(file);
  const skala = Math.min(1, maks / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * skala);
  c.height = Math.round(bmp.height * skala);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  const f = formatGambar();
  const data = c.toDataURL(f, kualitas);
  const ext = f === 'image/webp' ? 'webp' : 'jpg';
  return { data, ukuran: Math.round((data.length - data.indexOf(',') - 1) * 0.75), nama: file.name.replace(/\.[^.]+$/, '') + '.' + ext };
}
