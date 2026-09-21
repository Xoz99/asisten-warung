// Cadangan KEDUA di seluruh app (lihat asisten.routes.js, scan.routes.js, nota.routes.js,
// voice.routes.js, produk.routes.js) - kalau Gemini gagal, coba lewat OpenRouter dulu SEBELUM
// jatuh ke fallback terakhir masing-masing fitur (rule-based buat chat, Tesseract buat nota, atau
// gagal total buat scan/suara/referensi yang emang belum punya cadangan non-AI). OpenRouter itu
// gateway yang nyatuin banyak provider LLM (OpenAI/Anthropic/Meta/dst) di balik satu API gaya
// OpenAI - jadi walau Gemini lagi bermasalah, warung masih dapet jawaban dari AI beneran. Sengaja
// pakai model provider LAIN (bukan Gemini lewat OpenRouter) - kalau Gemini down gara-gara masalah
// di sisi Google (quota/rate-limit KESELURUHAN app kepake bareng semua warung - lihat komentar
// panjang di gemini.service.js), percuma cadangannya numpang lewat Google juga, sama-sama kena.
// Sama gayanya kayak gemini.service.js - fetch polos, nggak nambah dependency cuma buat ini.
//
// JATAH TOKEN HARIAN (lihat aiQuota.service.js): OpenRouter di sini "gantiin" Gemini pas dia gagal -
// jadi SATU TANGKI jatah yang SAMA dipakai bareng buat dua-duanya (bukan jatah terpisah per
// provider). Efeknya: pas Gemini abis jatah hariannya, OpenRouter OTOMATIS nerusin pake SISA jatah
// yang sama (user nggak kerasa "putus", cuma pindah mesin di belakang layar) - baru bener-bener
// keblokir (dikasih tau "jatah habis") kalau tangkinya beneran kosong buat DUA-duanya. Ini KENAPA
// fungsi scan/nota/suara/referensi di bawah SEMUA nerima `warungId` (chat/tanyaOpenRouter SENGAJA
// TIDAK - obrolan nggak kena batasan ini sama sekali, lihat komentar di aiQuota.service.js).
import { cekJatahAi, catatPemakaianAi } from './aiQuota.service.js';
import { ATURAN_MEMORI } from './memori.service.js';
import { ATURAN_KULAKAN } from './kulakan.service.js';
import { infoUsaha, panduanMarginReferensi } from './profilUsaha.service.js';

const MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
const TIMEOUT_MS = 12000;

// Inti panggilan ke OpenRouter - dipakai bareng sama semua fungsi di file ini (chat/barcode/visual/
// nota/suara/referensi). `messages` format OpenAI-style (role: system/user/assistant, content bisa
// string ATAU array of parts kalau ada gambar - lihat pesanDenganFoto). Balikin teks jawaban mentah,
// atau throw kalau gagal (pemanggilnya yang tangani fallback berikutnya).
//
// `warungId` (opsional, SAMA perannya kayak di panggilGemini - lihat gemini.service.js): kalau
// dikasih, dicek DULU ke jatah harian (tangki yang SAMA dipakai Gemini) sebelum manggil API, dicatat
// SETELAH sukses pakai `usage.total_tokens` dari respons OpenRouter (field ini emang disediain
// OpenRouter/OpenAI-style API, isinya token beneran kepake - bukan estimasi kita sendiri).
async function panggilOpenRouter(messages, { maxTokens = 500, jsonMode = false, warungId } = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  // OpenRouter itu CADANGAN OPSIONAL - nggak diisi itu keadaan normal, bukan kerusakan.
  // `internal: true` bikin errorHandler nggak nampilin pesannya ke user (lihat errorHandler.js):
  // dulu pesan ini bocor ke layar sebagai "OPENROUTER_API_KEY belum diisi di .env" waktu pemilik
  // warung nekan "Cari referensi" - dia nggak ngerti itu apa, dan itu bukan urusan dia.
  if (!apiKey) throw Object.assign(new Error('OPENROUTER_API_KEY belum diisi di .env'), { status: 500, internal: true });

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
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        // 2 header ini direkomendasiin OpenRouter buat identifikasi app di dashboard mereka
        // (opsional, bukan syarat wajib) - bukan rahasia, aman ditulis apa adanya di sini.
        'HTTP-Referer': process.env.APP_BASE_URL || 'https://warungpintar.app',
        'X-Title': 'Warung Pintar',
      },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.2,
        max_tokens: maxTokens,
        // json_object (bukan json_schema ketat kayak Gemini responseSchema) - dipilih ini biar
        // kompatibel ke lebih banyak model OpenRouter (nggak semua provider dukung structured
        // output ketat). CATATAN: OpenAI json_object mode WAJIB root-nya OBJECT, nggak boleh ARRAY
        // langsung - fungsi yang butuh balikin daftar (nota/visual-banyak/suara) minta modelnya
        // bungkus jadi {"hasil":[...]} di prompt, bukan array telanjang.
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
  } catch (e) {
    throw Object.assign(new Error(e.name === 'AbortError' ? 'OpenRouter timeout' : 'Tidak bisa menghubungi OpenRouter'), { status: 502 });
  } finally {
    clearTimeout(timer);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // 429 = quota/rate-limit habis, 401/403 = key bermasalah - sama pola kayak gemini.service.js
    const pesan = data?.error?.message || `OpenRouter error ${res.status}`;
    throw Object.assign(new Error(pesan), { status: res.status });
  }

  const teks = data?.choices?.[0]?.message?.content || '';
  if (!teks.trim()) throw Object.assign(new Error('OpenRouter balikin jawaban kosong'), { status: 502 });
  // Dicatat SETELAH sukses, ke TANGKI YANG SAMA kayak Gemini (lihat komentar panjang di atas) -
  // nggak di-`await` (nyimpen usage nggak boleh bikin respons ke user ikut lambat/gagal).
  if (warungId) {
    const totalTokens = data?.usage?.total_tokens || 0;
    catatPemakaianAi(warungId, totalTokens).catch((e) => console.warn('[openrouter] gagal nyatet token usage:', e.message));
  }
  return teks.trim();
}

// Bungkus teks + (opsional) 1 foto jadi 1 `content` message OpenAI-style. fotoBase64 di sini format
// `data:image/xxx;base64,...` yang SAMA persis kayak yang dikirim client - OpenRouter/model vision-nya
// terima langsung data URL apa adanya, BEDA dari Gemini yang butuh dipisah mimeType+data mentah
// (lihat siapkanGambar di gemini.service.js) - nggak perlu preprocessing Jimp di sini.
function pesanDenganFoto(teks, fotoBase64) {
  if (!fotoBase64) return teks;
  return [
    { type: 'text', text: teks },
    { type: 'image_url', image_url: { url: fotoBase64 } },
  ];
}

function parseJson(teks, pesanError) {
  try {
    return JSON.parse(teks);
  } catch {
    throw Object.assign(new Error(pesanError), { status: 502 });
  }
}

// Balikin { jawaban, aksi } - SAMA bentuknya kayak tanyaGemini (lihat komentar lengkap soal prinsip
// "aksi cuma usulan, human-in-the-loop" di sana), biar CRUD lewat obrolan (tambah/ubah/hapus barang)
// TETAP jalan pas lagi fallback ke sini, bukan cuma jawab teks doang. `fotoBase64` (opsional) - model
// OpenRouter (openai/gpt-4o-mini) SANGGUP vision, sama kayak fungsi lain di file ini (bacaBarcodeOpenRouter
// dst) - jadi kalau user lampirin foto pas Gemini lagi down, tetap kebaca, nggak "buta" kayak versi
// sebelumnya. Struktur JSON-nya nggak dijamin ketat kayak Gemini responseSchema - makanya pemanggil
// (asisten.routes.js) WAJIB tetap nge-sanitasi produkId lewat validasiAksi sebelum dipakai, jangan
// percaya mentah dari sumber manapun.
export async function tanyaOpenRouter({ pertanyaan, konteks, riwayat = [], fotoBase64 = null, warungId = null }) {
  const systemInstruction = `Kamu adalah "Mang Warung", asisten AI yang PUNYA WEWENANG ngurus usaha
ini (jenis usahanya lihat "Profil usaha" di data di bawah - warung, toko bangunan, konter HP, dst) langsung dari obrolan - bukan cuma jawab pertanyaan doang. Yang bisa kamu kerjain:
(a) ngatur katalog barang (tambah/ubah/hapus barang), (b) NYATET DUIT MODAL yang disetor pemilik ke
warung, (c) NYUSUN DAFTAR BELANJA borongan pas pemilik nyerahin pilihan barangnya ke kamu.
Warung yang KATALOGNYA MASIH KOSONG tetap bisa dibantu buat (b) dan (c) - jangan nolak/ngalihin ke
"isi barang dulu" cuma gara-gara belum ada barang.

GAYA JAWAB: kayak lagi chat WA sama tetangga - bahasa Indonesia santai/akrab, jangan formal/kaku,
dan SINGKAT (paling banyak ~6 baris). Biar gampang dibaca sekilas di HP:
- angka penting & nama yang ditanya (rupiah, jumlah, nama barang/orang) ditebalin pakai **dua bintang**
- kalau nyebut 2 hal atau lebih, pecah jadi daftar: satu hal per baris, diawali "- ". Buka dengan
  1 kalimat pendek sebelum daftarnya.
- JANGAN pakai heading (#), tabel, atau garis pemisah - ini balesan chat, bukan laporan.

RUMUS HARGA JUAL (aturan warung ini - dipakai juga di layar detail stok, jadi angkamu HARUS
nyambung sama yang user udah biasa liat di sana): harga jual = modal / (1 - margin/100), dibulatin
KE ATAS ke kelipatan Rp100. Margin sehat & angka default-nya IKUT "Profil usaha" di data di bawah (belum diisi = 25%-40%, pakai 30%) kalau user nggak nyebut
maunya berapa. Ini MARGIN (dihitung dari harga jual), BUKAN markup dari modal - jadi modal 8.000
margin 30% itu 8.000/0,7 = 11.500, BUKAN 8.000x1,3 = 10.400. Salah pakai markup bikin untung
warung ketipisan dari yang dikira.
Tiap kali kamu ngusulin barang (tipe "tambah" MAUPUN "belanja_banyak"), "harga" WAJIB diisi pakai
rumus ini kalau user nggak nyebut harga jual sendiri - JANGAN dikosongin atau diisi 0, barang
berharga 0 kalau kejual bikin warung rugi total.
Field "stok" WAJIB BILANGAN BULAT - jangan pernah ngirim pecahan kayak 526.3157894736842 (itu
kejadian pas kamu ngebagi budget sama modal terus hasilnya dikirim mentah); bulatin ke bawah dulu.

JAWAB PERTANYAAN: berdasarkan data warung yang dikasih di bawah - JANGAN ngarang ANGKA/DATA BISNIS
(harga/stok/untung/dst) yang nggak ada di data. Kalau datanya nggak cukup, bilang terus terang,
jangan menebak-nebak. Aturan ini KHUSUS buat data bisnis - KALAU user kirim FOTO, itu beda cerita:
foto itu bukti visual LANGSUNG yang beneran kamu liat (bukan "data" yang mungkin nggak lengkap),
JADI kamu WAJIB deskripsiin/baca apa yang kelihatan di foto itu kalau ditanya - itu BUKAN
"menebak-nebak", itu ngejawab dari apa yang beneran ada di gambar.

${ATURAN_KULAKAN}

USUL AKSI (null kalau obrolannya BUKAN minta tambah/ubah/hapus barang, catat modal, atau bikin
daftar belanja - contoh nanya info/ngobrol
biasa): kalau user KELIHATAN JELAS minta salah satu dari itu, isi "aksi" - kamu cuma USULIN, BELUM
eksekusi apapun (user MASIH wajib tap konfirmasi "Setuju" dulu sebelum beneran kesimpen), jadi wajar
& aman ngusulin walau belum 100% yakin soal detail kecilnya - user yang mutusin akhir. TAPI soal
MENENTUKAN BARANG MANA yang dimaksud (produkId) kamu WAJIB yakin dulu, jangan asal tebak.
- "data" WAJIB SELALU DIISI (walau tipenya "hapus" - boleh cuma {} kosong) - setiap detail
  (harga/modal/stok/nama/dst) yang DISEBUT ANGKANYA sama user WAJIB masuk ke "data".
- tipe "tambah": "produkId" null. "data.nama" WAJIB diisi jelas, field lain isi yang masuk akal dari
  obrolan (kalau nggak disebut boleh dikosongin - defaultnya kategori yang cocok sama jenis usaha di "Profil usaha" (kelontong/belum diisi: "sembako"), satuan "pcs",
  isiKemasan 1, harga/modal/stok 0).
- tipe "ubah" ATAU "hapus": "produkId" WAJIB diisi, disalin PERSIS APA ADANYA (karakter demi
  karakter, JANGAN diketik ulang manual) dari salah satu "id" di "Daftar barang" di bawah - cocokkan
  dulu nama barang yang disebut user ke daftar itu, BARU salin id-nya. Kalau nama yang disebut user
  AMBIGU (cocok ke lebih dari 1 barang) atau NGGAK ketemu sama sekali, JANGAN asal comot/ngarang id -
  biarin "aksi" null, dan di "jawaban" tanya balik user maksudnya barang yang mana. "data" tipe
  "ubah" isi CUMA field yang BENERAN disebut mau diubah user.
- tipe "ubah_nota": dipakai kalau di riwayat ada hasil baca FOTO NOTA yang statusnya "menunggu dikonfirmasi user"
  (ditulis "(Mang AI membaca nota, kebaca: 1. ... - status: ...)") dan user minta BENERIN ISI NOTA ITU - ganti nama
  barang, jumlah, harga, atau hapus/tambah baris ("itu bukan modem tapi modul", "yang kabel jumlahnya 2", "hapus yang
  elektronik"). Ini BUKAN ngubah katalog - JANGAN pakai tipe "ubah" & JANGAN minta produkId. Isi "data.barang" =
  SELURUH daftar nota SETELAH dibenerin, urutannya sama kayak di riwayat: baris yang nggak diubah DISALIN PERSIS
  (nama, jumlah, harga), "nama" = nama barang, "stok" = JUMLAH di nota, "modal" = HARGA SATUAN di nota, "harga" isi
  sama kayak "modal". Kalau yang disebut user cocok ke beberapa baris (mis. dua baris "MODEM-MODEM"), ubah semuanya.
  Di "jawaban" bilang singkat apa yang diubah & suruh cek kartu notanya lalu tap "Terapkan ke stok". Kalau notanya
  udah diterapkan/dibatalkan, "aksi" null & bilang nota itu udah nggak bisa diubah (foto ulang aja).
- tipe "catat_modal": dipakai kalau user mau NYATET DUIT MODAL yang dia setor ke warung ("mau
  nambah modal", "catat modal 5 juta"). Ini BUKAN nambah barang - jangan pernah dijawab pakai tipe
  "tambah". Isi "data.jumlah" (angka rupiah polos, "100jt" = 100000000) & "data.keterangan" singkat.
  Kalau nominalnya belum disebut user, biarin aksi null dan tanya angkanya dulu di "jawaban".
- tipe "target_penjualan": dipakai kalau user mau NYATET PENJUALAN yang udah kejadian tapi belum
  kecatat satu-satu ("catat penjualan hari ini 900rb", "hari ini laku 500 ribu", "setoran hari ini
  2 juta"). Isi "data.jumlah" (angka rupiah polos, "900k"/"900rb" = 900000).
  PENTING - JANGAN pernah nebak-nebak barang apa aja yang kejual buat nyampe angka itu, dan JANGAN
  pakai tipe "belanja_banyak" buat ini. Kamu nggak punya cara tau barang mana yang beneran laku;
  ngarang isinya bikin stok barang yang nggak kejual ikut kepotong dan untungnya jadi bohong.
  Yang kejadian pas user setuju: dia dibawa ke layar Catat jualan dengan TARGET keisi segitu, terus
  dia sendiri yang nyentang barangnya sampai totalnya pas. Bilang gitu aja di "jawaban" - singkat,
  jangan kepanjangan.
- tipe "belanja_banyak": KHUSUS buat nambahin barang BARU yang BELUM ADA di "Daftar barang" (warung baru, mau
  nambah jenis dagangan) - BUKAN buat kulakan/nyetok ulang barang yang udah ada (itu aturan KULAKAN di atas).
  Dipakai kalau user minta DIBIKININ daftar belanja / mau borong banyak
  barang sekaligus dan NYERAHIN pilihan barangnya ke kamu ("modal 100jt belanjain apa aja", "bebas
  kamu aja yang tentuin"). Isi "data.barang" = daftar barang wajar buat JENIS USAHA di "Profil usaha" (belum diisi = warung kelontong Indonesia)
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
Balas SATU objek JSON PERSIS bentuk ini, JANGAN ada teks lain di luar JSON-nya:
{"jawaban": "<balasan chat kamu di sini>", "ingat": [], "lupakan": [], "aksi": null ATAU {"tipe": "tambah"|"ubah"|"hapus"|"catat_modal"|"belanja_banyak"|"target_penjualan"|"ubah_nota", "produkId": "<id atau null>", "data": {"nama":"...", "kategori":"...", "barcode":"...", "harga":0, "modal":0, "stok":0, "satuan":"...", "isiKemasan":1, "namaKemasan":"...", "grup":"...", "jumlah":0, "keterangan":"...", "barang":[{"nama":"...","kategori":"...","harga":0,"modal":0,"stok":0,"satuan":"..."}]}}}
Field "jumlah"/"keterangan" CUMA buat "catat_modal", field "barang" CUMA buat "belanja_banyak" & "ubah_nota" - tipe lain kosongin.
(field di "data" yang nggak relevan boleh diilangin/dikosongin, nggak wajib semua ke-isi)

${ATURAN_MEMORI}

Data warung saat ini (real-time - "id" di daftar barang di bawah itu yang WAJIB disalin persis buat produkId di atas):
${konteks}`;

  // Format OpenAI-style (role: system/user/assistant) - beda dari Gemini yang pakai
  // systemInstruction terpisah + role user/model, lihat gemini.service.js.
  const messages = [
    { role: 'system', content: systemInstruction },
    ...riwayat.filter((r) => r?.teks).map((r) => ({ role: r.peran === 'user' ? 'user' : 'assistant', content: r.teks })),
    { role: 'user', content: pesanDenganFoto(pertanyaan, fotoBase64) },
  ];

  // 2500, samain sama Gemini (lihat alasan panjangnya di gemini.service.js) - daftar belanja
  // "belanja_banyak" bisa 25 barang dan kepotong kalau cuma 800. Di sini efeknya lebih parah:
  // kalau JSON-nya kepotong, nggak ada cadangan lagi di belakang, langsung jatuh ke rule-based.
  const teks = await panggilOpenRouter(messages, { maxTokens: 2500, jsonMode: true, warungId });

  let hasil;
  try {
    hasil = JSON.parse(teks);
  } catch {
    // Model di baliknya nggak selalu patuh json_object mode (terutama model murah/gratis) - daripada
    // gagal total, anggap teks mentahnya sebagai jawaban chat biasa tanpa aksi. Lebih baik user tetap
    // dapet jawaban (walau CRUD-nya nggak jalan turn ini) daripada error nyangkut.
    return { jawaban: teks, aksi: null };
  }
  if (!hasil?.jawaban) throw Object.assign(new Error('OpenRouter balikin jawaban kosong'), { status: 502 });
  const tanpaProdukId = ['tambah', 'catat_modal', 'belanja_banyak', 'target_penjualan', 'ubah_nota'];
  const aksi = hasil.aksi?.tipe
    ? { ...hasil.aksi, produkId: tanpaProdukId.includes(hasil.aksi.tipe) ? null : hasil.aksi.produkId || null }
    : null;
  const daftarTeks = (x) => (Array.isArray(x) ? x.filter((v) => typeof v === 'string') : []);
  return { jawaban: String(hasil.jawaban).trim(), aksi, ingat: daftarTeks(hasil.ingat), lupakan: daftarTeks(hasil.lupakan) };
}

// Cadangan buat bacaNotaGemini (lihat komentar lengkap di gemini.service.js/nota.routes.js) - baca
// foto nota belanja, balikin array {nama, qty, harga}. Dicoba SEBELUM jatuh ke Tesseract (yang
// jalan lokal gratis tapi lebih lemah ke tulisan tangan/foto dunia nyata) - jadi urutannya sekarang
// Gemini -> OpenRouter -> Tesseract, bukan langsung Gemini -> Tesseract kayak dulu.
export async function bacaNotaOpenRouter(fotoBase64, warungId) {
  const prompt = `Ini foto nota/struk belanja dari pasar atau toko grosir. Baca semua baris barang yang dibeli.
Setiap barang: nama persis seperti tertulis di nota, qty (jumlah dibeli, angka bulat - kalau nggak disebut eksplisit anggap 1), harga (harga PER SATUAN dalam Rupiah, angka bulat, BUKAN subtotal/total baris).
Abaikan baris total/subtotal/bayar/tunai/kembalian/diskon/pajak/PPN - itu bukan barang.
Kalau tulisannya kurang jelas, tetap tebak sebaik mungkin daripada dilewatin.
Balas SATU objek JSON PERSIS: {"hasil": [{"nama":"...", "qty":1, "harga":0}, ...]} - JANGAN ada teks lain di luar JSON.`;

  const teks = await panggilOpenRouter([{ role: 'user', content: pesanDenganFoto(prompt, fotoBase64) }], { maxTokens: 1500, jsonMode: true, warungId });
  const hasil = parseJson(teks, 'OpenRouter balikin format JSON tidak valid');
  const baris = hasil?.hasil;
  if (!Array.isArray(baris)) throw Object.assign(new Error('OpenRouter balikin format tidak sesuai (bukan array)'), { status: 502 });
  return baris.filter((b) => b?.nama && +b.qty > 0 && +b.harga > 0).map((b) => ({ nama: String(b.nama).trim(), qty: +b.qty, harga: +b.harga }));
}

// Cadangan buat bacaBarcodeGemini - baca ANGKA tercetak di bawah/dekat barcode (OCR, BUKAN
// mendekode garis barcode-nya - lihat komentar lengkap kenapa di gemini.service.js).
export async function bacaBarcodeOpenRouter(fotoBase64, warungId) {
  const prompt = `Ini foto kemasan produk yang ada barcode-nya (garis-garis vertikal hitam-putih).
JANGAN coba "membaca"/mendekode garis-garis barcode itu sendiri - kamu bukan alat pemindai barcode.
Tugasmu: baca ANGKA yang TERCETAK SEBAGAI TEKS di bawah atau di dekat garis-garis barcode itu
(barcode retail hampir selalu nyantumin representasi angkanya buat dibaca manusia, biasanya 8, 12,
atau 13 digit). Kalau nggak ada angka yang kebaca jelas di foto ini, balikin kode kosong ("") -
JANGAN ngarang angka.
Balas SATU objek JSON PERSIS: {"kode": "..."} - JANGAN ada teks lain di luar JSON.`;

  const teks = await panggilOpenRouter([{ role: 'user', content: pesanDenganFoto(prompt, fotoBase64) }], { maxTokens: 200, jsonMode: true, warungId });
  const hasil = parseJson(teks, 'OpenRouter balikin format JSON tidak valid');
  const kode = String(hasil?.kode || '').replace(/\D/g, '');
  if (!kode || kode.length < 6) throw Object.assign(new Error('Nggak nemu angka barcode yang jelas di foto ini'), { status: 502 });
  return kode;
}

// Cadangan buat cariBarangGemini - foto 1 barang, cocokin ke id produk yang UDAH terdaftar di
// warung ini (nama doang di daftar, bukan foto - hemat token, sama pola kayak versi Gemini-nya).
export async function cariBarangOpenRouter({ fotoBase64, produkList, warungId }) {
  const daftarTeks = produkList.map((p) => `- id: ${p.id} | nama: ${p.nama}`).join('\n');
  const { label } = await infoUsaha(warungId);
  const prompt = `Ini foto barang yang difoto pakai kamera di sebuah ${label}. Berikut daftar produk yang SUDAH TERDAFTAR di warung ini:
${daftarTeks}

Kalau barang di foto ini KELIHATAN JELAS sama persis dengan salah satu produk di daftar (merek &
kemasan yang sama - bukan cuma kategori/jenis barang yang mirip), balikin id produk itu. Kalau
nggak ada yang cocok, atau kamu nggak cukup yakin, balikin id kosong ("") - JANGAN asal pilih yang
paling mendekati kalau sebenarnya nggak yakin, itu lebih berbahaya daripada bilang nggak ketemu.
Balas SATU objek JSON PERSIS: {"id": "..."} - JANGAN ada teks lain di luar JSON.`;

  const teks = await panggilOpenRouter([{ role: 'user', content: pesanDenganFoto(prompt, fotoBase64) }], { maxTokens: 200, jsonMode: true, warungId });
  const hasil = parseJson(teks, 'OpenRouter balikin format JSON tidak valid');
  return hasil?.id || null;
}

// Cadangan buat cariBanyakBarangGemini - foto BEBERAPA barang sekaligus pas checkout, balikin
// [{id, qty}]. Taruhannya lebih tinggi (checkout beneran, bukan daftar barang) - prompt-nya sama
// tegasnya kayak versi Gemini soal "mending kelewat daripada salah tagih".
export async function cariBanyakBarangOpenRouter({ fotoBase64, produkList, warungId }) {
  const daftarTeks = produkList.map((p) => `- id: ${p.id} | nama: ${p.nama}`).join('\n');
  const { label } = await infoUsaha(warungId);
  const prompt = `Ini foto BEBERAPA barang sekaligus yang mau di-checkout di sebuah ${label}
(customer taruh beberapa barang buat dibayar bareng). Berikut daftar produk yang SUDAH TERDAFTAR di
warung ini:
${daftarTeks}

Identifikasi SEMUA barang yang KELIHATAN JELAS di foto ini DAN ada di daftar (merek & kemasan yang
sama - bukan cuma kategori/jenis yang mirip). Kalau barang yang sama muncul lebih dari 1 di foto
(misal 2 botol Aqua yang identik), hitung sebagai qty buat item itu, jangan ditulis 2 baris terpisah.
Barang yang keliatan di foto tapi TIDAK ADA di daftar, atau kamu nggak cukup yakin, JANGAN
dimasukkan - lebih baik kelewat daripada salah tagih.
Balas SATU objek JSON PERSIS: {"hasil": [{"id":"...", "qty":1}, ...]} (array kosong kalau nggak ada
satupun yang yakin dikenali) - JANGAN ada teks lain di luar JSON.`;

  const teks = await panggilOpenRouter([{ role: 'user', content: pesanDenganFoto(prompt, fotoBase64) }], { maxTokens: 500, jsonMode: true, warungId });
  const hasil = parseJson(teks, 'OpenRouter balikin format JSON tidak valid');
  const baris = hasil?.hasil;
  if (!Array.isArray(baris)) throw Object.assign(new Error('OpenRouter balikin format tidak sesuai (bukan array)'), { status: 502 });
  return baris.filter((h) => h?.id && +h.qty > 0).map((h) => ({ id: String(h.id), qty: +h.qty }));
}

// Cadangan buat parseUcapanGemini - TEKS doang (transkrip suara), nggak butuh vision. Balikin
// [{id, qty}].
export async function parseUcapanOpenRouter({ transkrip, produkList, warungId }) {
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
dimasukkan - lebih baik kelewat daripada salah masukin barang.
Balas SATU objek JSON PERSIS: {"hasil": [{"id":"...", "qty":1}, ...]} (array kosong kalau nggak ada
satupun yang yakin dikenali) - JANGAN ada teks lain di luar JSON.`;

  const teks = await panggilOpenRouter([{ role: 'user', content: prompt }], { maxTokens: 400, jsonMode: true, warungId });
  const hasil = parseJson(teks, 'OpenRouter balikin format JSON tidak valid');
  const baris = hasil?.hasil;
  if (!Array.isArray(baris)) throw Object.assign(new Error('OpenRouter balikin format tidak sesuai (bukan array)'), { status: 502 });
  return baris.filter((h) => h?.id && +h.qty > 0).map((h) => ({ id: String(h.id), qty: +h.qty }));
}

// Cadangan buat cariReferensiProdukGemini - TEKS doang, saran nama/satuan/isi kemasan/kisaran harga
// dari pengetahuan umum model (BUKAN data live) buat ngisi form tambah barang baru.
export async function cariReferensiProdukOpenRouter(query, warungId) {
  const u = await infoUsaha(warungId);
  const prompt = `User pemilik ${u.label} di Indonesia lagi mau nambahin barang baru ke
katalog, ketik nama umum: "${query}"

Dari pengetahuan umummu soal produk retail Indonesia, kasih daftar varian produk yang PALING
MUNGKIN dimaksud (maks 5). Buat tiap varian, isi:
- nama: nama produk spesifik & jelas (contoh: "Gudang Garam Filter International 12" bukan cuma "Gudang Garam")
- satuan: satuan jual satuan KECIL/eceran yang paling umum dipakai orang beli di ${u.label} (contoh: "bungkus" buat rokok yang dijual utuh, "botol" buat minuman, "pcs" buat snack, "sak" buat semen, "meter" buat kabel)
- isiKemasan: kalau satuan kecilnya sendiri berisi beberapa unit lebih kecil lagi yang biasa dijual ketengan (contoh: 1 bungkus rokok isi 12/16/20 batang), isi jumlahnya di sini. Kalau nggak ada pemecahan lebih lanjut yang lazim, isi 1.
- namaKemasan: nama satuan yang lebih kecil itu (contoh: "batang" buat rokok). Isi null kalau isiKemasan cuma 1.
- hargaModal: perkiraan harga KULAKAN/grosir per satuan jual di atas, dalam Rupiah (angka bulat).
  Ini yang dibayar pemilik warung ke agen, BUKAN harga jual ke pembeli.
- hargaPasaran: perkiraan harga JUAL ECERAN yang UMUM dipasang ${u.label} lain, dalam Rupiah.

hargaPasaran HARUS lebih besar dari hargaModal, dan ${panduanMarginReferensi(u)}

Kalau nama yang diketik nggak cukup jelas/nggak kamu kenal produknya sama sekali, balikin array
kosong - JANGAN ngarang varian yang kamu nggak yakin beneran ada.
Balas SATU objek JSON PERSIS: {"hasil": [{"nama":"...", "satuan":"...", "isiKemasan":1, "namaKemasan":null, "hargaModal":0, "hargaPasaran":0}, ...]} - JANGAN ada teks lain di luar JSON.`;

  const teks = await panggilOpenRouter([{ role: 'user', content: prompt }], { maxTokens: 800, jsonMode: true, warungId });
  const hasil = parseJson(teks, 'OpenRouter balikin format JSON tidak valid');
  const baris = hasil?.hasil;
  if (!Array.isArray(baris)) throw Object.assign(new Error('OpenRouter balikin format tidak sesuai (bukan array)'), { status: 502 });
  return baris
    .filter((h) => h?.nama && h?.satuan)
    .slice(0, 5)
    .map((h) => ({
      nama: String(h.nama).trim(),
      satuan: String(h.satuan).trim() || 'pcs',
      isiKemasan: Math.max(1, +h.isiKemasan || 1),
      namaKemasan: h.namaKemasan ? String(h.namaKemasan).trim() : null,
      hargaModal: Math.max(0, +h.hargaModal || 0),
      hargaPasaran: Math.max(0, +h.hargaPasaran || 0),
      // Disamain bentuknya sama jalur Gemini (lihat cariReferensiProdukGemini) - dua jalur ini
      // dipakai bergantian oleh route yang SAMA, jadi bentuk keluarannya nggak boleh beda. Dulu
      // beda & akibatnya diam-diam: pas Gemini gagal, opsiHarga balik kosong tanpa error apa pun.
      hargaPerkiraan: Math.max(0, +h.hargaPasaran || 0),
    }));
}
