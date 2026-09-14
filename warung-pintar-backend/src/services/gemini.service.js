import { Jimp, JimpMime } from 'jimp';
import { cekJatahAi, catatPemakaianAi } from './aiQuota.service.js';

// Panggilan ke Gemini API (Google) buat jawaban "Mang Warung" yang lebih natural/luwes dari
// rule-based. Sengaja pakai fetch polos (bukan SDK) - sama gayanya kayak midtrans.service.js -
// biar nggak nambah dependency cuma buat 1 endpoint.
// "gemini-3.6-flash" (dipakai sebelumnya) ternyata defaultnya "mikir" (thinking) dulu sebelum
// nulis jawaban - boros token/kuota (pernah kepantau ratusan token cuma buat "mikir", belum
// termasuk jawabannya) dan lambat (>10 detik). "-lite" ini nggak ada acara mikir tersembunyi
// sama sekali (dicek: nggak ada thoughtsTokenCount di usageMetadata-nya), lebih hemat & cepet,
// dan pakai "-latest" biar otomatis ngikutin versi terbaru tanpa perlu gonta-ganti nama tiap
// Google update/deprecate model (kejadian pas 2.0-flash tiba-tiba di-retire).
const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
const TIMEOUT_MS = 12000;

// Inti panggilan ke Gemini - dipakai bareng sama tanyaGemini (teks) & bacaNotaGemini (gambar).
// Balikin teks jawaban mentah, atau throw kalau gagal (pemanggilnya yang tangani fallback).
//
// `warungId` (opsional): kalau dikasih, panggilan ini ikut kena JATAH TOKEN HARIAN (lihat
// aiQuota.service.js) - dicek DULU sebelum manggil API (kalau abis, Gemini nggak jadi dipanggil sama
// sekali, hemat biaya beneran), dicatat SETELAH sukses. Cuma fungsi scan/nota/suara (barcode-ai,
// visual-ai, cari-referensi, nota, parse-ai) yang ngasih ini - tanyaGemini (chat Mang AI) SENGAJA
// nggak ngasih, jadi otomatis nggak kena batasan (lihat komentar lengkap kenapa di aiQuota.service.js).
// `timeoutMs` (opsional): default 12 detik cukup buat panggilan pendek (barcode/visual/parse suara),
// TAPI kependekan buat yang keluarannya panjang - chat Mang AI yang lagi nyusun daftar belanja bisa
// ngeluarin 25 barang x 6 field sekaligus, nulisnya aja udah lebih lama dari 12 detik. Timeout di
// tengah jalan bikin jatuh ke OpenRouter padahal Gemini-nya sehat, dan hasil OpenRouter buat kasus
// ini kualitasnya lebih jelek (skema JSON-nya nggak dipaksa ketat kayak Gemini).
async function panggilGemini(body, warungId, timeoutMs = TIMEOUT_MS) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw Object.assign(new Error('GEMINI_API_KEY belum diisi di .env'), { status: 500 });

  if (warungId) {
    const jatah = await cekJatahAi(warungId);
    if (!jatah.boleh) {
      throw Object.assign(
        new Error(
          `Jatah AI harian warung ini udah habis (${jatah.jatah.toLocaleString('id-ID')} token/hari untuk plan ${jatah.plan}). Reset otomatis besok jam 00:00, atau upgrade plan buat jatah lebih besar.`
        ),
        { status: 402, jatahAiHabis: true }
      );
    }
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw Object.assign(new Error(e.name === 'AbortError' ? 'Gemini timeout' : 'Tidak bisa menghubungi Gemini'), { status: 502 });
  } finally {
    clearTimeout(timer);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // 429 = quota/rate-limit habis, 403 = key invalid/belum verifikasi billing - dua-duanya sering
    // kejadian di free tier, makanya pemanggil selalu punya fallback buat kasus ini
    const pesan = data?.error?.message || `Gemini error ${res.status}`;
    throw Object.assign(new Error(pesan), { status: res.status });
  }

  const teks = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  if (!teks.trim()) throw Object.assign(new Error('Gemini balikin jawaban kosong'), { status: 502 });
  // Dicatat SETELAH sukses (bukan sebelum) - kalau requestnya gagal duluan (timeout/network/dst),
  // nggak fair nyatet token seolah kepake padahal jawabannya nggak pernah kedapetan user. Sengaja
  // nggak di-`await` (nyimpen usage nggak boleh bikin respons ke user ikut lambat/gagal) - kegagalan
  // nyatet usage cuma bikin angkanya nggak 100% akurat, bukan hal fatal.
  if (warungId) {
    const totalTokens = data?.usageMetadata?.totalTokenCount || 0;
    catatPemakaianAi(warungId, totalTokens).catch((e) => console.warn('[gemini] gagal nyatet token usage:', e.message));
  }
  return teks.trim();
}

// Tanya Gemini dengan konteks bisnis warung ini. Balikin { jawaban, aksi }, atau throw kalau gagal
// (pemanggilnya - asisten.routes.js - yang tangani fallback ke OpenRouter/rule-based, dua-duanya
// TIDAK bisa ngusulin `aksi` - CRUD lewat obrolan cuma jalan pas Mang Warung dijawab Gemini).
//
// `aksi` (null kalau obrolannya bukan minta tambah/ubah/hapus barang) itu USULAN doang, BUKAN udah
// dieksekusi - backend di sini SAMA SEKALI nggak nulis apa-apa ke database sendiri. Frontend
// (Chat.jsx) nampilin usulan ini sebagai kartu konfirmasi ("Setuju"/"Batal"), eksekusi beneran cuma
// kejadian kalau user tap Setuju (lewat endpoint produk.routes.js yang udah ada - api.produk.tambah/
// ubah/hapus, PERSIS sama kayak nambah/ubah/hapus barang manual lewat menu Stok, cuma jalur
// masuknya beda). Ini prinsip "human-in-the-loop" yang sama dipakai fitur AI lain di app ini (scan
// visual banyak sekaligus, dst) - AI USUL, MANUSIA yang mutusin final buat aksi yang susah dibalikin.
//
// `riwayat`: beberapa turn obrolan terakhir ([{peran:'user'|'model', teks}], sudah dibersihkan &
// dibatasin di asisten.routes.js) - diselipin sebagai turn-turn SEBELUM pertanyaan sekarang di
// `contents`, biar Gemini beneran "inget" konteks percakapan (dulu tiap pertanyaan dikirim
// sendirian, jadi kalau user ngomong sesuatu yang nyambung ke pesan sebelumnya - "maksudnya X",
// "iya" doang - Gemini nggak ngerti itu nyambung ke apa). System instruction & konteks data warung
// TETAP dibangun fresh tiap kali (lihat bangunKonteks di asisten.routes.js) - yang "diinget" cuma
// ALUR OBROLANNYA, bukan data warungnya (itu harus selalu real-time, bukan snapshot lama).
//
// `fotoBase64` (opsional): user bisa kirim 1 foto bareng pesannya (misal foto barang yang mau
// didaftarin) - dibaca Gemini Vision, boleh dipakai buat nentuin detail barang di usulan "tambah".
export async function tanyaGemini({ pertanyaan, konteks, riwayat = [], fotoBase64 = null, warungId = null }) {
  const systemInstruction = `Kamu adalah "Mang Warung", asisten AI yang PUNYA WEWENANG ngurus warung
kelontong ini langsung dari obrolan - bukan cuma jawab pertanyaan doang. Yang bisa kamu kerjain:
(a) ngatur katalog barang (tambah/ubah/hapus barang), (b) NYATET DUIT MODAL yang disetor pemilik ke
warung, (c) NYUSUN DAFTAR BELANJA borongan pas pemilik nyerahin pilihan barangnya ke kamu.
Warung yang KATALOGNYA MASIH KOSONG tetap bisa dibantu buat (b) dan (c) - jangan nolak/ngalihin ke
"isi barang dulu" cuma gara-gara belum ada barang, karena nyatet modal & nyusun belanjaan justru
yang dibutuhin duluan sama warung baru.

GAYA JAWAB (field "jawaban"): kayak lagi chat WA sama tetangga - bahasa Indonesia santai/akrab,
jangan formal/kaku, dan SINGKAT (paling banyak ~6 baris). Biar gampang dibaca sekilas di HP:
- angka penting & nama yang ditanya (rupiah, jumlah, nama barang/orang) ditebalin pakai **dua bintang**
- kalau nyebut 2 hal atau lebih (beberapa orang yang ngutang, beberapa barang), pecah jadi daftar:
  satu hal per baris, diawali "- ". Buka dengan 1 kalimat pendek sebelum daftarnya.
- JANGAN pakai heading (#), tabel, atau garis pemisah - ini balesan chat, bukan laporan.

RUMUS HARGA JUAL (aturan warung ini - dipakai juga di layar detail stok, jadi angkamu HARUS
nyambung sama yang user udah biasa liat di sana): harga jual = modal / (1 - margin/100), dibulatin
KE ATAS ke kelipatan Rp100. Margin sehat buat warung 25%-40%, pakai 30% kalau user nggak nyebut
maunya berapa. Ini MARGIN (dihitung dari harga jual), BUKAN markup dari modal - jadi modal 8.000
margin 30% itu 8.000/0,7 = 11.500, BUKAN 8.000x1,3 = 10.400. Salah pakai markup bikin untung
warung ketipisan dari yang dikira.
Tiap kali kamu ngusulin barang (tipe "tambah" MAUPUN "belanja_banyak"), "harga" WAJIB diisi pakai
rumus ini kalau user nggak nyebut harga jual sendiri - JANGAN dikosongin atau diisi 0, barang
berharga 0 kalau kejual bikin warung rugi total.
Field "stok" WAJIB BILANGAN BULAT - jangan pernah ngirim pecahan kayak 526.3157894736842 (itu
kejadian pas kamu ngebagi budget sama modal terus hasilnya dikirim mentah); bulatin ke bawah dulu.

JAWAB PERTANYAAN: berdasarkan data warung yang dikasih di bawah - JANGAN ngarang angka yang nggak
ada di data. Kalau datanya nggak cukup, bilang terus terang, jangan menebak-nebak.

USUL AKSI (field "aksi", null kalau obrolannya BUKAN minta tambah/ubah/hapus barang, catat modal,
atau bikin daftar belanja - contoh nanya
info/ngobrol biasa): kalau user KELIHATAN JELAS minta salah satu dari itu, isi "aksi" - kamu cuma
USULIN, BELUM eksekusi apapun (user MASIH wajib tap konfirmasi "Setuju" dulu sebelum beneran
kesimpen), jadi wajar & aman ngusulin walau belum 100% yakin soal detail kecilnya - user yang mutusin
akhir. TAPI soal MENENTUKAN BARANG MANA yang dimaksud (produkId) kamu WAJIB yakin dulu, jangan asal
tebak (lihat aturan tiap tipe di bawah).
- "data" WAJIB SELALU DIISI (walau tipenya "hapus" - boleh cuma {} kosong buat itu), JANGAN
  dikosongin/dihilangin - setiap detail (harga/modal/stok/nama/dst) yang DISEBUT ANGKANYA sama user
  di pesan ini WAJIB masuk ke "data", jangan sampai kelewat cuma karena ngerasa "user pasti udah
  liat sendiri di chat".
- tipe "tambah": produkId dikosongin (null/""). "data.nama" WAJIB diisi jelas, field lain isi yang
  masuk akal dari obrolan/foto (kalau nggak disebut boleh dikosongin - defaultnya kategori "sembako",
  satuan "pcs", isiKemasan 1, harga/modal/stok 0).
- tipe "ubah": WAJIB isi produkId, HARUS disalin PERSIS APA ADANYA (karakter demi karakter, JANGAN
  diketik ulang manual/diringkas/ditambah embel-embel apapun) dari salah satu "id" di "Daftar barang"
  di bawah - cocokkan dulu nama barang yang disebut user ke daftar itu, BARU salin id-nya. Kalau nama
  yang disebut user AMBIGU (cocok ke lebih dari 1 barang) atau NGGAK ketemu sama sekali di daftar,
  JANGAN asal comot/ngarang id - biarin "aksi" null, dan di "jawaban" tanya balik user maksudnya
  barang yang mana / bilang barangnya belum ketemu di katalog. "data" isi CUMA field yang BENERAN
  disebut mau diubah user (field lain di "data" boleh dikosongin - jangan isi cuma buat
  "lengkap-lengkapin", itu bisa keubah nggak sengaja pas dieksekusi).
- tipe "hapus": produkId sama aturannya kayak "ubah" (salin PERSIS dari daftar, jangan asal tebak
  kalau ambigu/nggak ketemu).
- tipe "catat_modal": dipakai kalau user mau NYATET DUIT MODAL yang dia setor ke warung ("mau
  nambah modal", "catat modal 5 juta", "saya suntik modal"). Ini BUKAN nambah barang - jangan
  pernah dijawab pakai tipe "tambah". Isi "data.jumlah" (angka rupiah polos, "100jt" = 100000000,
  "5rb" = 5000) dan "data.keterangan" singkat. Kalau user nyebut mau modal TAPI belum nyebut
  angkanya, biarin aksi null dan tanya nominalnya dulu di "jawaban".
- tipe "target_penjualan": dipakai kalau user mau NYATET PENJUALAN yang udah kejadian tapi belum
  kecatat satu-satu ("catat penjualan hari ini 900rb", "hari ini laku 500 ribu", "setoran hari ini
  2 juta"). Isi "data.jumlah" (angka rupiah polos, "900k"/"900rb" = 900000).
  PENTING - JANGAN pernah nebak-nebak barang apa aja yang kejual buat nyampe angka itu, dan JANGAN
  pakai tipe "belanja_banyak" buat ini. Kamu nggak punya cara tau barang mana yang beneran laku;
  ngarang isinya bikin stok barang yang nggak kejual ikut kepotong dan untungnya jadi bohong.
  Yang kejadian pas user setuju: dia dibawa ke layar Catat jualan dengan TARGET keisi segitu, terus
  dia sendiri yang nyentang barangnya sampai totalnya pas. Bilang gitu aja di "jawaban" - singkat,
  jangan kepanjangan.
- tipe "belanja_banyak": dipakai kalau user minta DIBIKININ daftar belanja / mau borong banyak
  barang sekaligus dan NYERAHIN pilihan barangnya ke kamu ("modal 100jt belanjain apa aja",
  "bebas kamu aja yang tentuin", "isiin warung saya"). Isi "data.barang" berupa daftar barang
  yang masuk akal buat warung kelontong Indonesia, LENGKAP dengan perkiraan harga jual, modal,
  dan stok yang wajar - TOTAL (modal x stok) diusahakan mendekati budget yang disebut user.
  Maksimal 25 barang biar masih enak dicek satu-satu.
  WAJIB HITUNG DULU sebelum jawab: total = jumlah dari (modal x stok) SEMUA barang di daftar.
  Kalau totalnya masih jauh DI BAWAH budget yang disebut user, BESARIN "stok"-nya (bukan nambah
  jenis barang terus) sampai totalnya mendekati budget - warung bermodal besar emang kulakan per
  dus/karung/slop, jadi stok ratusan sampai ribuan pcs itu WAJAR, bukan kebanyakan. Daftar yang
  totalnya cuma sepersekian budget itu SALAH & bikin user harus ngitung ulang sendiri.
  TAPI JANGAN nyebut angka TOTAL-nya di "jawaban" - hitungan penjumlahan kamu sering meleset jauh
  (pernah kejadian: bilang "sekitar 99 juta" padahal daftarnya 161 juta), dan user bakal percaya
  angka yang kamu sebut. Totalnya dihitung otomatis dari daftarnya & dipajang di kartu usulan,
  ikut berubah pas user nyentang/ngelepas barang - jadi biarin kartu yang ngomong soal angka.
  Ini USULAN: user bakal nyentang sendiri mana yang dipakai, jadi nggak apa-apa ngasih tebakan
  angka yang wajar - TAPI di "jawaban" kasih tau terus terang kalau harga/stoknya masih perkiraan
  dan perlu disesuaikan sama harga kulakan dia.
${fotoBase64 ? '- User ngirim FOTO bareng pesan ini (dilampirkan di bawah) - kalau dia minta nambahin barang dari foto ini, baca detailnya dari foto (merek/kemasan/perkiraan isi/kategori), dan set "fotoDipakai": true di "aksi" biar foto itu ikut kesimpen jadi foto barangnya.\n' : ''}
Data warung saat ini (real-time - "id" di daftar barang di bawah itu yang WAJIB disalin persis buat produkId di atas):
${konteks}`;

  const turnRiwayat = riwayat
    .filter((r) => r?.teks)
    .map((r) => ({ role: r.peran === 'user' ? 'user' : 'model', parts: [{ text: r.teks }] }));

  const partsSekarang = [{ text: pertanyaan }];
  if (fotoBase64) {
    const { mimeType, data } = await siapkanGambar(fotoBase64);
    partsSekarang.push({ inlineData: { mimeType, data } });
  }

  const teks = await panggilGemini({
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [...turnRiwayat, { role: 'user', parts: partsSekarang }],
    generationConfig: {
      temperature: 0.4,
      // Foto + kemungkinan usulan "aksi" butuh buffer lebih dari chat teks polos dulu (500) - JSON
      // terstruktur (jawaban+aksi+data) makan lebih banyak token keluaran dibanding kalimat bebas.
      //
      // Dinaikin dari 800 waktu tipe "belanja_banyak" ditambahin: satu daftar belanja isinya bisa
      // 25 barang x 6 field, gampang nembus 1000 token sendirian. Pas masih 800, JSON-nya kepotong
      // di tengah -> JSON.parse gagal -> kebaca "Gemini balikin format JSON tidak valid" dan
      // jatuh ke OpenRouter, padahal Gemini-nya sehat, cuma kehabisan ruang nulis.
      // Angka ini BATAS ATAS, bukan target - jawaban chat biasa tetap kepake beberapa puluh token
      // doang, jadi naikin batasnya nggak bikin pemakaian token harian ikut naik.
      maxOutputTokens: 2500,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          jawaban: { type: 'STRING' },
          aksi: {
            type: 'OBJECT',
            nullable: true,
            properties: {
              tipe: { type: 'STRING', enum: ['tambah', 'ubah', 'hapus', 'catat_modal', 'belanja_banyak', 'target_penjualan'] },
              // "data" ditaruh SEBELUM produkId (urutan properties kepake Gemini sebagai urutan
              // "mikir" pas ngisi field-nya) - biar dia mikirin detail barangnya duluan, baru nyalin
              // id dari daftar - dulu urutannya kebalik & sering data-nya keskip kosong.
              data: {
                type: 'OBJECT',
                properties: {
                  nama: { type: 'STRING' },
                  kategori: { type: 'STRING' },
                  barcode: { type: 'STRING' },
                  harga: { type: 'NUMBER' },
                  modal: { type: 'NUMBER' },
                  stok: { type: 'NUMBER' },
                  satuan: { type: 'STRING' },
                  isiKemasan: { type: 'INTEGER' },
                  namaKemasan: { type: 'STRING' },
                  grup: { type: 'STRING' },
                  // CATATAN: field di bawah ini WAJIB tetap di dalam "data", bukan sejajar sama
                  // produkId/fotoDipakai di level "aksi". Gemini nurut persis sama tempat field
                  // dideklarasiin di skema ini, sementara prompt di atas & frontend sama-sama baca
                  // dari "data.*" - pernah kejadian ketuker, hasilnya aksi selalu kebuang validator
                  // padahal modelnya udah bener ngisi angkanya.
                  // Dipakai tipe "catat_modal" doang - duit yang disetor pemilik ke warung.
                  jumlah: { type: 'NUMBER' },
                  keterangan: { type: 'STRING' },
                  // Dipakai tipe "belanja_banyak" doang - daftar usulan barang sekali borong.
                  barang: {
                    type: 'ARRAY',
                    items: {
                      type: 'OBJECT',
                      properties: {
                        nama: { type: 'STRING' },
                        kategori: { type: 'STRING' },
                        harga: { type: 'NUMBER' },
                        modal: { type: 'NUMBER' },
                        stok: { type: 'NUMBER' },
                        satuan: { type: 'STRING' },
                      },
                      // modal/harga/stok ikut DIWAJIBIN, bukan cuma nama: field opsional di
                      // structured output gampang dilewat model, dan pernah kejadian - semua
                      // "harga" balik 0 padahal prompt udah nyuruh ngisi pakai rumus margin.
                      // Aturan di prompt kalah sama skema; yang beneran maksa ya required ini.
                      required: ['nama', 'modal', 'harga', 'stok'],
                    },
                  },
                },
              },
              produkId: { type: 'STRING' },
              fotoDipakai: { type: 'BOOLEAN' },
            },
            required: ['tipe', 'data'],
          },
        },
        required: ['jawaban'],
      },
    },
    // 30 detik, bukan 12 detik default: chat ini satu-satunya panggilan Gemini yang keluarannya
    // bisa sepanjang daftar belanja 25 barang (lihat maxOutputTokens di atas).
    //
    // `warungId` DIKASIH (dulu sengaja nggak) - lihat alasannya di aiQuota.service.js: chat dulu
    // dianggap murah karena balesannya cuma beberapa kalimat, tapi sejak ada usul daftar belanja
    // satu pesan bisa ngeluarin 2.500 token. Jalur tak-terhitung sebesar itu nggak kelihatan di
    // angka manapun - padahal justru itu yang paling gampang bikin jatah atas kekuras.
  }, warungId, 30000);

  let hasil;
  try {
    hasil = JSON.parse(teks);
  } catch {
    throw Object.assign(new Error('Gemini balikin format JSON tidak valid'), { status: 502 });
  }
  if (!hasil?.jawaban) throw Object.assign(new Error('Gemini balikin jawaban kosong'), { status: 502 });
  // tipe "tambah" logisnya nggak punya produkId (barangnya belum ada) - jaga-jaga Gemini ngarang
  // ID buat tipe ini, dibuang paksa di sini daripada dipercaya mentah.
  // Tipe yang logisnya nggak nunjuk barang yang sudah ada - produkId-nya dibuang paksa di sini
  // daripada dipercaya mentah kalau model ngarang id.
  const tanpaProdukId = ['tambah', 'catat_modal', 'belanja_banyak', 'target_penjualan'];
  const aksi = hasil.aksi?.tipe
    ? { ...hasil.aksi, produkId: tanpaProdukId.includes(hasil.aksi.tipe) ? null : hasil.aksi.produkId || null }
    : null;
  return { jawaban: String(hasil.jawaban).trim(), aksi };
}

// Parse data URL base64 + kecilin ke maks `maxSisi` px di sisi terpanjang - dipakai bareng sama
// semua fungsi Vision di bawah (nota/barcode/cari-barang). Foto dari kamera HP bisa 1920x1080+ -
// jauh lebih gede dari yang beneran perlu (token gambar dihitung dari resolusi, makin gede foto
// makin boros token/biaya). Kalau resize gagal (format aneh dll), kirim aja foto aslinya apa
// adanya - jangan sampai gagal scan gara-gara langkah hemat ini.
async function siapkanGambar(fotoBase64, maxSisi = 1024) {
  const match = /^data:(image\/\w+);base64,(.+)$/.exec(fotoBase64 || '');
  if (!match) throw Object.assign(new Error('Format fotoBase64 tidak valid'), { status: 400 });
  const [, mimeType, rawData] = match;

  try {
    const img = await Jimp.read(Buffer.from(rawData, 'base64'));
    if (img.width > maxSisi || img.height > maxSisi) img.scaleToFit({ w: maxSisi, h: maxSisi });
    const outBuffer = await img.getBuffer(JimpMime.jpeg, { quality: 82 });
    return { mimeType: 'image/jpeg', data: outBuffer.toString('base64') };
  } catch {
    return { mimeType, data: rawData }; // biarin apa adanya
  }
}

// Baca foto nota belanja langsung pakai Gemini Vision (bukan OCR baris-per-baris kayak Tesseract)
// - jauh lebih toleran ke foto miring/kusut/pudar/tulisan tangan, sesuai teknologi yang beneran
// dipakai app-app scan struk modern. Minta output JSON terstruktur langsung (responseSchema) biar
// nggak perlu parsing teks bebas lagi. Balikin array {nama, qty, harga}, atau throw kalau gagal
// (pemanggilnya - nota.routes.js - yang tangani fallback ke Tesseract).
export async function bacaNotaGemini(fotoBase64, warungId) {
  const { mimeType: mimeType2, data } = await siapkanGambar(fotoBase64);

  const prompt = `Ini foto nota/struk belanja dari pasar atau toko grosir. Baca semua baris barang yang dibeli.
Setiap barang: nama persis seperti tertulis di nota, qty (jumlah dibeli, angka bulat - kalau nggak disebut eksplisit anggap 1), harga (harga PER SATUAN dalam Rupiah, angka bulat, BUKAN subtotal/total baris).
Abaikan baris total/subtotal/bayar/tunai/kembalian/diskon/pajak/PPN - itu bukan barang.
Kalau tulisannya kurang jelas, tetap tebak sebaik mungkin daripada dilewatin.`;

  const teks = await panggilGemini(
    {
      contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: mimeType2, data } }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1500,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: { nama: { type: 'STRING' }, qty: { type: 'INTEGER' }, harga: { type: 'INTEGER' } },
            required: ['nama', 'qty', 'harga'],
          },
        },
      },
    },
    warungId
  );

  let baris;
  try {
    baris = JSON.parse(teks);
  } catch {
    throw Object.assign(new Error('Gemini balikin format JSON tidak valid'), { status: 502 });
  }
  if (!Array.isArray(baris)) throw Object.assign(new Error('Gemini balikin format tidak sesuai (bukan array)'), { status: 502 });
  return baris.filter((b) => b?.nama && +b.qty > 0 && +b.harga > 0).map((b) => ({ nama: String(b.nama).trim(), qty: +b.qty, harga: +b.harga }));
}

// Cadangan TERAKHIR buat scan barcode (lihat scan.routes.js /barcode-ai) - dipanggil cuma kalau
// BarcodeDetector native & ZXing (lib/barcodeScan.js, gratis+instan+jalan di client) udah dicoba
// berkali-kali & tetap gagal. PENTING: ini BUKAN nyuruh Gemini "mendekode" garis-garis barcode -
// itu bukan kerjaan LLM/vision-model, itu kerjaan image-processing yang udah dikerjain ZXing.
// Yang diminta di sini beda: baca ANGKA yang TERCETAK sebagai teks di bawah/dekat barcode-nya
// (hampir semua barcode retail nyantumin representasi angkanya buat dibaca manusia/kasir manual)
// - itu OCR biasa, sama jenis kerjaannya kayak bacaNotaGemini di atas, cuma promptnya beda.
// Balikin string digit, atau throw kalau nggak nemu angka yang jelas.
export async function bacaBarcodeGemini(fotoBase64, warungId) {
  const { mimeType, data } = await siapkanGambar(fotoBase64);

  const prompt = `Ini foto kemasan produk yang ada barcode-nya (garis-garis vertikal hitam-putih).
JANGAN coba "membaca"/mendekode garis-garis barcode itu sendiri - kamu bukan alat pemindai barcode.
Tugasmu: baca ANGKA yang TERCETAK SEBAGAI TEKS di bawah atau di dekat garis-garis barcode itu
(barcode retail hampir selalu nyantumin representasi angkanya buat dibaca manusia, biasanya 8, 12,
atau 13 digit). Kalau nggak ada angka yang kebaca jelas di foto ini, balikin kode kosong ("") -
JANGAN ngarang angka.`;

  const teks = await panggilGemini(
    {
      contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType, data } }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 200,
        responseMimeType: 'application/json',
        responseSchema: { type: 'OBJECT', properties: { kode: { type: 'STRING' } }, required: ['kode'] },
      },
    },
    warungId
  );

  let hasil;
  try {
    hasil = JSON.parse(teks);
  } catch {
    throw Object.assign(new Error('Gemini balikin format JSON tidak valid'), { status: 502 });
  }
  const kode = String(hasil?.kode || '').replace(/\D/g, ''); // buang semua yang bukan digit, jaga-jaga Gemini nyelipin spasi/tanda baca
  if (!kode || kode.length < 6) throw Object.assign(new Error('Nggak nemu angka barcode yang jelas di foto ini'), { status: 502 });
  return kode;
}

// Cadangan TERAKHIR buat scan barang visual (lihat scan.routes.js /visual-ai) - dipanggil kalau
// pencocokan MobileNet+cosine similarity (client, gratis) nggak nemu kandidat yang cukup mirip.
// Beda dari embedding matching yang cuma ngukur "seberapa mirip vektornya", ini beneran nanya
// Gemini "barang ini SAMA PERSIS produk mana dari daftar ini?" - dikasih daftar produk yang UDAH
// terdaftar di warung ini (nama doang, bukan foto - biar hemat token, embedding matching yang di
// client udah nyaring sisi visualnya duluan, di sini tinggal jadi tebakan kedua kalau itu nggak
// yakin). Balikin id produk yang cocok, atau null kalau nggak ada/nggak yakin - SENGAJA dibilangin
// jangan asal nebak di prompt-nya, salah pilih produk lebih parah daripada bilang "nggak ketemu".
export async function cariBarangGemini({ fotoBase64, produkList, warungId }) {
  const { mimeType, data } = await siapkanGambar(fotoBase64);

  const daftarTeks = produkList.map((p) => `- id: ${p.id} | nama: ${p.nama}`).join('\n');
  const prompt = `Ini foto barang yang difoto pakai kamera di sebuah warung kelontong. Berikut daftar produk yang SUDAH TERDAFTAR di warung ini:
${daftarTeks}

Kalau barang di foto ini KELIHATAN JELAS sama persis dengan salah satu produk di daftar (merek &
kemasan yang sama - bukan cuma kategori/jenis barang yang mirip), balikin id produk itu. Kalau
nggak ada yang cocok, atau kamu nggak cukup yakin, balikin id kosong ("") - JANGAN asal pilih yang
paling mendekati kalau sebenarnya nggak yakin, itu lebih berbahaya daripada bilang nggak ketemu.`;

  const teks = await panggilGemini(
    {
      contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType, data } }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 200,
        responseMimeType: 'application/json',
        responseSchema: { type: 'OBJECT', properties: { id: { type: 'STRING' } } },
      },
    },
    warungId
  );

  let hasil;
  try {
    hasil = JSON.parse(teks);
  } catch {
    throw Object.assign(new Error('Gemini balikin format JSON tidak valid'), { status: 502 });
  }
  return hasil?.id || null;
}

// Versi "banyak sekaligus" dari cariBarangGemini di atas - dipakai dari Catat Penjualan (lihat
// scan.routes.js /visual-ai-banyak) buat kondisi customer bawa BEBERAPA barang beda ke kasir dalam
// 1 foto, bukan 1 barang per foto. Beda taruhannya dari cariBarangGemini biasa: itu dipanggil pas
// DAFTAR barang baru (salah kenal cuma bikin data referensi ngaco, gampang dibenerin), ini dipanggil
// pas CHECKOUT beneran (salah kenal = salah tagih customer) - makanya prompt-nya lebih tegas soal
// "mending kelewat daripada salah", dan pemanggilnya (Catat.jsx) WAJIB nampilin daftar buat
// dikonfirmasi/dikoreksi dulu sebelum masuk keranjang, bukan auto-tambah.
export async function cariBanyakBarangGemini({ fotoBase64, produkList, warungId }) {
  const { mimeType, data } = await siapkanGambar(fotoBase64);

  const daftarTeks = produkList.map((p) => `- id: ${p.id} | nama: ${p.nama}`).join('\n');
  const prompt = `Ini foto BEBERAPA barang sekaligus yang mau di-checkout di sebuah warung kelontong
(customer taruh beberapa barang buat dibayar bareng). Berikut daftar produk yang SUDAH TERDAFTAR di
warung ini:
${daftarTeks}

Identifikasi SEMUA barang yang KELIHATAN JELAS di foto ini DAN ada di daftar (merek & kemasan yang
sama - bukan cuma kategori/jenis yang mirip). Kalau barang yang sama muncul lebih dari 1 di foto
(misal 2 botol Aqua yang identik), hitung sebagai qty buat item itu, jangan ditulis 2 baris terpisah.
Barang yang keliatan di foto tapi TIDAK ADA di daftar, atau kamu nggak cukup yakin, JANGAN
dimasukkan - lebih baik kelewat daripada salah tagih. Balikin array kosong kalau nggak ada satupun
yang yakin dikenali.`;

  const teks = await panggilGemini(
    {
      contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType, data } }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 500,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: { id: { type: 'STRING' }, qty: { type: 'INTEGER' } },
            required: ['id', 'qty'],
          },
        },
      },
    },
    warungId
  );

  let hasil;
  try {
    hasil = JSON.parse(teks);
  } catch {
    throw Object.assign(new Error('Gemini balikin format JSON tidak valid'), { status: 502 });
  }
  if (!Array.isArray(hasil)) throw Object.assign(new Error('Gemini balikin format tidak sesuai (bukan array)'), { status: 502 });
  return hasil.filter((h) => h?.id && +h.qty > 0).map((h) => ({ id: String(h.id), qty: +h.qty }));
}

// Cadangan buat "Sebut barang" (voice, lihat voice.routes.js /parse-ai) - dipanggil OTOMATIS dari
// Catat.jsx pas parseUcapan (client, gratis, keyword matching - lib/voice.js) sama sekali nggak
// nemu apa-apa dari transkrip. Bisa jadi ucapannya emang di luar pola yang parseUcapan kenali, ATAU
// speech-to-text browser salah denger (misal "satu" ketranskrip jadi kata lain yang kebetulan ada
// di daftar kata pengisi/filler-nya parseUcapan, jadi kebuang tanpa sempet kebaca sebagai angka).
// Ini TEKS doang (bukan foto) - jauh lebih murah dari fallback AI lain di file ini (nota/barcode/
// visual), makanya dipanggil OTOMATIS tanpa perlu user tap tombol dulu, beda dari yang lain.
export async function parseUcapanGemini({ transkrip, produkList, warungId }) {
  const daftarTeks = produkList.map((p) => `- id: ${p.id} | nama: ${p.nama}`).join('\n');
  const prompt = `Ini transkrip ucapan kasir warung yang lagi nyebutin barang belanjaan customer
(hasil speech-to-text otomatis, kadang ada salah dengar/kata kepotong). Transkripnya:
"${transkrip}"

Berikut daftar produk yang SUDAH TERDAFTAR di warung ini:
${daftarTeks}

Identifikasi barang apa aja yang disebut beserta jumlahnya (qty - angka bulat, kalau nggak
disebutin jumlahnya anggap 1). Cocokkan ke id produk yang PALING SESUAI dari daftar meski
ucapannya nggak persis sama (typo/singkatan/salah dengar STT itu wajar, tetap coba cocokkan kalau
maksudnya jelas). Barang yang disebut tapi TIDAK ADA di daftar, atau kamu nggak cukup yakin, JANGAN
dimasukkan - lebih baik kelewat daripada salah masukin barang. Balikin array kosong kalau nggak ada
satupun yang yakin dikenali.`;

  const teks = await panggilGemini(
    {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 400,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: { id: { type: 'STRING' }, qty: { type: 'INTEGER' } },
            required: ['id', 'qty'],
          },
        },
      },
    },
    warungId
  );

  let hasil;
  try {
    hasil = JSON.parse(teks);
  } catch {
    throw Object.assign(new Error('Gemini balikin format JSON tidak valid'), { status: 502 });
  }
  if (!Array.isArray(hasil)) throw Object.assign(new Error('Gemini balikin format tidak sesuai (bukan array)'), { status: 502 });
  return hasil.filter((h) => h?.id && +h.qty > 0).map((h) => ({ id: String(h.id), qty: +h.qty }));
}

// "Cari referensi" pas nambah barang baru (Stok.jsx) - user ketik nama umum (misal "gudang garam"
// atau "indomie goreng"), dikasih daftar varian yang Gemini KENAL dari pengetahuan umumnya
// (BUKAN dari database/scraping live - nggak ada sumber data real-time yang kepasang di sini),
// lengkap sama isi kemasan & KISARAN harga jual pasaran. Ini PERKIRAAN kasar buat mempercepat
// ngisi form doang (biar nggak input satu-satu dari nol) - bukan harga pasti hari itu, makanya
// SEMUA hasilnya harus tetep bisa/wajib dicek-edit user sebelum disimpen (frontend nggak boleh
// nyimpen langsung tanpa lewat form yang bisa diedit). Prompt-nya SENGAJA nyuruh Gemini jujur
// balikin array kosong kalau nggak yakin/nggak kenal, daripada ngarang varian yang nggak ada.
export async function cariReferensiProdukGemini(query, warungId) {
  const prompt = `User pemilik warung kelontong di Indonesia lagi mau nambahin barang baru ke
katalog, ketik nama umum: "${query}"

Dari pengetahuan umummu soal produk retail Indonesia, kasih daftar varian produk yang PALING
MUNGKIN dimaksud (maks 5). Buat tiap varian, isi:
- nama: nama produk spesifik & jelas (contoh: "Gudang Garam Filter International 12" bukan cuma "Gudang Garam")
- satuan: satuan jual satuan KECIL/eceran yang paling umum dipakai orang beli di warung (contoh: "bungkus" buat rokok yang dijual utuh, "botol" buat minuman, "pcs" buat snack)
- isiKemasan: kalau satuan kecilnya sendiri berisi beberapa unit lebih kecil lagi yang biasa dijual ketengan (contoh: 1 bungkus rokok isi 12/16/20 batang), isi jumlahnya di sini. Kalau nggak ada pemecahan lebih lanjut yang lazim, isi 1.
- namaKemasan: nama satuan yang lebih kecil itu (contoh: "batang" buat rokok). Isi null kalau isiKemasan cuma 1.
- hargaModal: perkiraan harga KULAKAN/grosir per satuan jual di atas, dalam Rupiah (angka bulat).
  Ini yang dibayar pemilik warung ke agen/grosir, BUKAN harga jual ke pembeli.
- hargaPasaran: perkiraan harga JUAL ECERAN yang UMUM dipasang warung kelontong lain buat barang
  ini, dalam Rupiah (angka bulat). Ini patokan pasar - harga yang bikin pembeli nggak kaget.

PENTING soal dua angka itu: hargaPasaran HARUS lebih besar dari hargaModal (warung nggak jualan
rugi), dan selisihnya wajar buat barang kelontong - biasanya 10%-30% dari harga jual, tergantung
jenis barang. Rokok & sembako pokok marginnya TIPIS (sekitar 5%-12%); snack, minuman, sabun,
kosmetik marginnya LEBIH TEBAL (20%-35%). Jangan pukul rata.

Dua-duanya PERKIRAAN pasaran umum, bukan harga pasti - user bakal ngedit sendiri sesuai agen dia.

Kalau nama yang diketik nggak cukup jelas/nggak kamu kenal produknya sama sekali, balikin array
kosong - JANGAN ngarang varian yang kamu nggak yakin beneran ada.`;

  const teks = await panggilGemini(
    {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 800,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              nama: { type: 'STRING' },
              satuan: { type: 'STRING' },
              isiKemasan: { type: 'INTEGER' },
              namaKemasan: { type: 'STRING' },
              hargaModal: { type: 'INTEGER' },
              hargaPasaran: { type: 'INTEGER' },
            },
            required: ['nama', 'satuan', 'isiKemasan', 'hargaModal', 'hargaPasaran'],
          },
        },
      },
    },
    warungId
  );

  let hasil;
  try {
    hasil = JSON.parse(teks);
  } catch {
    throw Object.assign(new Error('Gemini balikin format JSON tidak valid'), { status: 502 });
  }
  if (!Array.isArray(hasil)) throw Object.assign(new Error('Gemini balikin format tidak sesuai (bukan array)'), { status: 502 });
  return hasil
    .filter((h) => h?.nama && h?.satuan)
    .slice(0, 5)
    .map((h) => ({
      nama: String(h.nama).trim(),
      satuan: String(h.satuan).trim() || 'pcs',
      isiKemasan: Math.max(1, +h.isiKemasan || 1),
      namaKemasan: h.namaKemasan ? String(h.namaKemasan).trim() : null,
      hargaModal: Math.max(0, +h.hargaModal || 0),
      hargaPasaran: Math.max(0, +h.hargaPasaran || 0),
      // Dipertahankan supaya sisi frontend yang belum ikut berubah nggak langsung pecah -
      // isinya sama sama hargaPasaran (harga jual, bukan modal).
      hargaPerkiraan: Math.max(0, +h.hargaPasaran || 0),
    }));
}

// Batas ukuran audio yang boleh masuk (base64). Rekaman dari lib/rekam.js udah WAV 16 kHz mono
// dan dibatasi 20 detik (~850 KB base64), jadi ini pagar buat kiriman yang nggak wajar. Ditaruh
// DI BAWAH batas body Express (2mb di index.js) biar yang kegedean kena pesan kita yang jelas,
// bukan error mentah dari pengurai body.
const MAKS_AUDIO_B64 = 1_500_000;

// Ubah rekaman suara jadi teks pakai Gemini.
//
// Dipakai sebagai PENGGANTI SpeechRecognition di perangkat yang nggak ngasih API itu jalan -
// paling sering iPhone yang aplikasinya dibuka dari ikon layar HP (lihat lib/rekam.js buat
// duduk perkaranya). Hasilnya masuk ke alur yang sama persis kayak hasil SpeechRecognition:
// ditaruh di kotak teks yang bisa dikoreksi user dulu, BUKAN langsung dieksekusi.
//
// Sengaja cuma disuruh NULIS ULANG, nggak disuruh sekalian ngerti "2 indomie" itu barang apa.
// Pemisahan barang & jumlahnya udah punya jalurnya sendiri (parseUcapan / parseUcapanGemini) yang
// tau daftar barang warung ini - kalau transkripnya sekalian ditebak-tebak di sini, hasilnya jadi
// dua lapis tebakan yang susah dilacak waktu salah.
export async function transkripSuaraGemini(audioBase64, warungId) {
  const match = /^data:(audio\/[\w.+-]+);base64,(.+)$/.exec(audioBase64 || '');
  if (!match) throw Object.assign(new Error('Format audio tidak valid'), { status: 400 });
  const [, mimeType, data] = match;
  if (data.length > MAKS_AUDIO_B64) throw Object.assign(new Error('Rekamannya kepanjangan'), { status: 413 });

  const prompt = `Kamu alat tulis-ulang suara buat aplikasi warung kelontong Indonesia.

Tulis ULANG PERSIS apa yang diucapkan di rekaman ini. Aturannya:
- Bahasa Indonesia sehari-hari, termasuk logat/campuran bahasa daerah kalau ada.
- JANGAN dirapikan, JANGAN diringkas, JANGAN dijawab. Cuma ditulis ulang.
- Angka ditulis pakai ANGKA (2, bukan "dua") - ini dipakai buat ngitung jumlah barang.
- Nama merek ditulis sesuai yang kedengeran (Indomie, Teh Botol, Gudang Garam, Aqua, dst).
- Kalau nggak ada suara omongan yang kedengeran jelas, balas string kosong.

Balas HANYA teksnya, tanpa tanda kutip dan tanpa penjelasan apa pun.`;

  const data2 = await panggilGemini(
    {
      contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType, data } }] }],
      // Nulis ulang itu tugas yang nggak butuh kreativitas - suhunya dinolin biar dia nulis apa
      // yang kedengeran, bukan nebak kalimat yang "lebih masuk akal".
      generationConfig: { temperature: 0, maxOutputTokens: 400 },
    },
    warungId,
    30000
  );

  const teks = (data2.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
  // Model kadang tetep ngasih tanda kutip walau udah dilarang - dibuang di sini biar hasilnya
  // nggak kebawa ke kotak teks yang dibaca pemisah barang.
  return teks.replace(/^["'`]+|["'`]+$/g, '').trim();
}
