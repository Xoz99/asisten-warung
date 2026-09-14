// Rekam suara dari mikrofon -> WAV 16 kHz mono, siap dikirim ke server buat ditranskrip AI.
//
// KENAPA ADA: "Sebut barang" selama ini pakai SpeechRecognition (pengenal suara bawaan browser).
// Itu API yang BEDA dari izin mikrofon biasa, dan di iPhone yang aplikasinya dibuka dari IKON
// LAYAR HP, WebKit nggak ngasih dia jalan sama sekali - izin mikrofon udah dikasih pun tetep
// ditolak. Jadi pemilik warung yang masang aplikasinya di layar HP (justru cara pakai yang kita
// saranin) malah kehilangan fitur nyebut barang, dan nggak ada satu setelan pun yang bisa dia
// ubah buat benerin itu.
//
// getUserMedia (ngambil suara mentah) JALAN NORMAL di situ. Jadi jalan keluarnya: rekam sendiri,
// terus suaranya dikirim ke AI buat ditulis jadi teks - sama persis polanya kayak foto nota yang
// udah dikirim ke Gemini selama ini.
//
// Kenapa WAV, bukan format asli rekamannya: MediaRecorder ngasih format yang beda-beda per HP
// (iPhone audio/mp4, Android audio/webm), dan nggak semuanya diterima Gemini. Daripada nebak-nebak
// per perangkat, hasil rekamannya dibongkar ulang lewat AudioContext terus ditulis jadi WAV -
// satu format yang sama buat semua HP. 16 kHz mono dipilih karena itu yang dipakai model suara
// (lebih dari itu cuma nambah ukuran kiriman tanpa nambah ketelitian) dan bikin paketnya jauh
// lebih kecil buat sinyal warung yang pas-pasan.
const LAJU_CONTOH = 16000;
const MAKS_DETIK = 20; // rem darurat: sekali rekam nggak boleh jadi kiriman raksasa

export function rekamanDidukung() {
  return (
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    Boolean(window.AudioContext || window.webkitAudioContext)
  );
}

// Tipe rekaman yang didukung HP ini. Nggak dipaksa satu nilai - Safari cuma punya audio/mp4,
// Chrome Android cuma audio/webm; kalau dipaksa ke salah satunya, yang satunya lagi langsung
// gagal di MediaRecorder sebelum sempet ngerekam apa-apa. Isinya bakal dibongkar ulang jadi WAV,
// jadi format aslinya nggak penting - yang penting HP-nya SANGGUP ngerekam.
function tipeRekaman() {
  const kandidat = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  return kandidat.find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
}

function wavDariPcm(pcm, laju) {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const dv = new DataView(buf);
  const tulisTeks = (pos, teks) => teks.split('').forEach((c, i) => dv.setUint8(pos + i, c.charCodeAt(0)));
  tulisTeks(0, 'RIFF');
  dv.setUint32(4, 36 + pcm.length * 2, true);
  tulisTeks(8, 'WAVEfmt ');
  dv.setUint32(16, 16, true); // panjang blok fmt
  dv.setUint16(20, 1, true); // PCM tanpa kompresi
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, laju, true);
  dv.setUint32(28, laju * 2, true); // byte per detik
  dv.setUint16(32, 2, true); // byte per contoh
  dv.setUint16(34, 16, true); // bit per contoh
  tulisTeks(36, 'data');
  dv.setUint32(40, pcm.length * 2, true);
  // float -1..1 dari AudioBuffer jadi bilangan bulat 16-bit. Dijepit dulu di -1..1: hasil
  // decode bisa lewat dikit dari rentang itu, dan kalau nggak dijepit, angkanya "muter" jadi
  // nilai berlawanan - kedengeran kayak suara pecah/kresek yang bikin transkripnya ngawur.
  let pos = 44;
  for (let i = 0; i < pcm.length; i++, pos += 2) {
    const n = Math.max(-1, Math.min(1, pcm[i]));
    dv.setInt16(pos, n < 0 ? n * 0x8000 : n * 0x7fff, true);
  }
  return buf;
}

const keBase64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let biner = '';
  // Dipotong per 8k, bukan sekali apply buat semua: String.fromCharCode(...array) dengan puluhan
  // ribu argumen sekaligus bisa bikin "Maximum call stack size exceeded" di HP kentang.
  for (let i = 0; i < bytes.length; i += 8192) biner += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(biner);
};

// Rekaman asli (mp4/webm/ogg) -> WAV 16 kHz mono. OfflineAudioContext dipakai buat nurunin laju
// contohnya sekalian: dia yang ngurus penyaringan biar suaranya nggak jadi "berdengung" kayak
// kalau contohnya dibuang begitu aja tiap sekian langkah.
async function keWavMono(blob) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  let asli;
  try {
    asli = await ctx.decodeAudioData(await blob.arrayBuffer());
  } finally {
    ctx.close?.();
  }
  const panjang = Math.ceil((asli.duration * LAJU_CONTOH) / 1) || 1;
  const off = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, panjang, LAJU_CONTOH);
  const sumber = off.createBufferSource();
  sumber.buffer = asli;
  sumber.connect(off.destination);
  sumber.start();
  const hasil = await off.startRendering();
  return wavDariPcm(hasil.getChannelData(0), LAJU_CONTOH);
}

// Mulai merekam. Balikin { selesai, batal, stream }:
//   selesai() -> dataURL WAV (atau null kalau nggak ada suara kerekam)
//   batal()   -> berhenti & buang, mikrofon dilepas
//
// getUserMedia SENGAJA dipanggil di sini (bukan belakangan): pemanggilnya WAJIB manggil ini
// langsung dari dalam event tap, biar dialog izinnya kehitung sebagai permintaan dari user.
export async function mulaiRekam({ onOtomatisBerhenti } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const tipe = tipeRekaman();
  const rec = new MediaRecorder(stream, tipe ? { mimeType: tipe } : undefined);
  const potongan = [];
  rec.ondataavailable = (e) => e.data?.size && potongan.push(e.data);
  // Janji "rekamannya udah beneran ditutup", dipasang SEKALI di sini - bukan pas mau berhenti.
  // Bedanya penting: rem darurat 20 detik di bawah manggil rec.stop() sendiri, dan sesudah itu
  // rec.state langsung jadi 'inactive' padahal potongan suara TERAKHIR belum dikirim lewat
  // ondataavailable. Kalau nunggunya baru dipasang belakangan sambil ngecek state, penungguan itu
  // kelewat - hasilnya rekaman kepotong di ujung, atau malah kosong sama sekali.
  let tandaiBeres;
  const sudahDitutup = new Promise((res) => {
    tandaiBeres = res;
  });
  rec.onstop = () => tandaiBeres();
  rec.start();

  const lepas = () => stream.getTracks().forEach((t) => t.stop());
  let sudahBeres = false;

  // Rem darurat kalau tombol berhentinya nggak pernah ditekan (HP ketaruh di meja, user keburu
  // ngelayanin pembeli) - tanpa ini mikrofonnya nyala terus dan rekamannya numpuk tanpa batas.
  const pemutus = setTimeout(() => {
    if (rec.state === 'recording') {
      rec.stop();
      onOtomatisBerhenti?.();
    }
  }, MAKS_DETIK * 1000);

  const tungguBerhenti = () => {
    if (rec.state !== 'inactive') rec.stop();
    return sudahDitutup;
  };

  return {
    stream,
    async selesai() {
      if (sudahBeres) return null;
      sudahBeres = true;
      clearTimeout(pemutus);
      await tungguBerhenti();
      lepas();
      if (!potongan.length) return null;
      const blob = new Blob(potongan, { type: potongan[0].type || tipe || 'audio/webm' });
      if (blob.size < 1200) return null; // kependekan/senyap - nggak usah dikirim, buang jatah AI doang
      const wav = await keWavMono(blob);
      return `data:audio/wav;base64,${keBase64(wav)}`;
    },
    batal() {
      if (sudahBeres) return;
      sudahBeres = true;
      clearTimeout(pemutus);
      try {
        if (rec.state !== 'inactive') rec.stop();
      } catch {
        /* abaikan */
      }
      lepas();
    },
  };
}
