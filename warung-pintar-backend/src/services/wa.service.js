// Pengirim pesan WhatsApp buat kode OTP (lupa password & ganti PIN - lihat auth.routes.js).
//
// Sengaja dibikin ADAPTER tipis, bukan langsung nempel ke satu vendor: gateway WA lokal
// (Fonnte, Wablas, dst) API-nya mirip semua - POST form/JSON berisi {target, message} + token.
// Jadi ganti vendor cukup ganti isi .env, kode di bawah nggak perlu disentuh. Gaya fetch polos,
// nggak nambah dependency, sama kayak gemini.service.js & openrouter.service.js.
//
// ENV yang dipakai:
//   WA_PROVIDER   fonnte | wablas   (default fonnte)
//   WA_TOKEN      token dari dashboard vendor
// Kalau WA_TOKEN kosong, pengiriman DIANGGAP GAGAL secara terkendali dan kodenya cuma dicatat di
// LOG SERVER (lihat kirimOtpWa). Sengaja ke log, BUKAN dibalikin ke respons HTTP - kalau kodenya
// ikut nongol di respons/layar, siapa pun yang tau username orang lain bisa langsung ambil alih
// akunnya tanpa pernah pegang HP-nya, yang justru ngebatalin gunanya OTP.
const TIMEOUT_MS = 12000;

const VENDOR = {
  fonnte: {
    url: 'https://api.fonnte.com/send',
    // Fonnte: token ditaruh di header Authorization polos (tanpa "Bearer"), body form-urlencoded.
    headers: (token) => ({ Authorization: token, 'Content-Type': 'application/x-www-form-urlencoded' }),
    body: (target, message) => new URLSearchParams({ target, message }).toString(),
  },
  wablas: {
    url: 'https://console.wablas.com/api/send-message',
    headers: (token) => ({ Authorization: token, 'Content-Type': 'application/x-www-form-urlencoded' }),
    body: (target, message) => new URLSearchParams({ phone: target, message }).toString(),
  },
};

export function waAktif() {
  return !!process.env.WA_TOKEN;
}

// Kirim pesan. Balikin true kalau kemungkinan besar terkirim, false kalau nggak - SENGAJA nggak
// throw: gagal kirim jangan sampai bikin endpoint /otp/kirim ikut error 500, karena bedanya
// respons sukses vs error di situ justru ngebocorin username mana yang kedaftar (lihat komentar
// soal enumerasi di auth.routes.js).
export async function kirimWa(noHp, pesan) {
  const token = process.env.WA_TOKEN;
  const vendor = VENDOR[process.env.WA_PROVIDER || 'fonnte'];
  if (!token || !vendor) return false;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(vendor.url, {
      method: 'POST',
      headers: vendor.headers(token),
      body: vendor.body(noHp, pesan),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.error(`[wa] gagal kirim (HTTP ${res.status}) ke ${noHp}`);
      return false;
    }
    // Vendor-vendor ini balikin 200 walau sebenernya gagal (nomor nggak terdaftar WA, saldo abis),
    // bedanya cuma di field "status" di body - jadi jangan cuma percaya status code HTTP-nya.
    const data = await res.json().catch(() => null);
    if (data && data.status === false) {
      console.error(`[wa] ditolak vendor: ${data.reason || JSON.stringify(data)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[wa] error kirim: ${e.message}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Pesan OTP siap pakai. Teksnya ditulis buat pemilik warung (bahasa sehari-hari, bukan bahasa
// sistem), plus peringatan jangan kasih kodenya ke siapa pun - penipuan "halo saya dari admin,
// sebutkan kodenya" itu modus paling umum buat ngebobol OTP di Indonesia.
export async function kirimOtpWa(noHp, kode, tujuan) {
  const untuk = tujuan === 'pin' ? 'mengganti PIN' : 'mengatur ulang kata sandi';
  const pesan =
    `*${kode}* adalah kode verifikasi Warung Pintar Anda.\n\n` +
    `Kode ini dipakai untuk ${untuk} dan berlaku 10 menit.\n\n` +
    `JANGAN berikan kode ini ke siapa pun, termasuk yang mengaku admin Warung Pintar atau Konsulin.`;

  const terkirim = await kirimWa(noHp, pesan);
  if (!terkirim) {
    // Mode belum-ada-vendor: kode cuma nongol di terminal yang jalanin server, jadi developer
    // tetap bisa nyoba alurnya end-to-end tanpa langganan gateway WA dulu.
    console.warn(`[wa] TIDAK TERKIRIM. Kode OTP untuk ${noHp} (${tujuan}): ${kode}`);
  }
  return terkirim;
}
