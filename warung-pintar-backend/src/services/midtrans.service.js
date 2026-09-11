import crypto from 'crypto';

// Harga plan — satuan Rupiah, harus bilangan bulat (Midtrans nggak terima desimal).
//
// Angkanya SENGAJA dinaikin ke bilangan bulat dari harga lama (49rb/490rb/3,62jt) supaya setelah
// dipotong MDR QRIS ~0,7% yang masuk ke rekening tetap di atas target itu:
//   50.000    - fee    350 = 49.650 bersih
//   500.000   - fee  3.500 = 496.500 bersih
//   3.650.000 - fee 25.550 = 3.624.450 bersih
//
// Ini PENETAPAN HARGA, bukan "biaya admin" yang ditambahin di kasir - dan bedanya penting:
// aturan QRIS Bank Indonesia melarang pedagang membebankan MDR ke pembeli, jadi nampilin
// "Rp 49.000 + admin Rp 345" itu berisiko. Naikin harga jual nggak kena larangan itu, dan
// angkanya juga lebih enak diucapkan ke pemilik warung.
export const HARGA_PLAN = {
  bulanan: 50000,
  tahunan: 500000, // setara 2 bulan gratis dibanding bulanan
  permanen: 3650000, // sekali bayar, seumur hidup - lihat lisensiWebhook.routes.js (direpresentasiin sebagai "berlaku 100 tahun", bukan expiry beneran)
};

// MDR per metode bayar, dalam {persen, flat}. Dipakai buat NGITUNG penerimaan bersih SETELAH
// pelanggan bayar - bukan buat nambahin biaya di depan.
//
// ⚠️ Angka di bawah tarif UMUM Midtrans, BUKAN kontrak Anda. Tiap merchant bisa beda (apalagi
// setelah nego volume). Cek di dashboard Midtrans > Settings > Fee, lalu sesuaikan di sini -
// kalau meleset, kolom `jumlah_bersih` di tabel pembayaran ikut meleset dan laporan pendapatan
// Anda salah tanpa ketahuan.
export const MDR = {
  qris: { persen: 0.007, flat: 0 },
  gopay: { persen: 0.02, flat: 0 },
  shopeepay: { persen: 0.02, flat: 0 },
  bank_transfer: { persen: 0, flat: 4000 },
  echannel: { persen: 0, flat: 4000 },
  permata: { persen: 0, flat: 4000 },
  bca_klikpay: { persen: 0, flat: 4000 },
  cstore: { persen: 0, flat: 5000 },
  credit_card: { persen: 0.029, flat: 2000 },
};

// Berapa yang BENERAN masuk rekening. `paymentType` dari notifikasi Midtrans (field payment_type).
// Metode yang nggak dikenal dibalikin null - SENGAJA, bukan diisi 0 atau ditebak pakai tarif
// rata-rata: angka karangan di kolom pendapatan lebih berbahaya daripada kolom kosong yang
// kelihatan jelas perlu diisi manual.
export function hitungBersih(jumlah, paymentType) {
  const m = MDR[paymentType];
  if (!m) return null;
  const bruto = Number(jumlah);
  if (!Number.isFinite(bruto)) return null;
  return Math.round(bruto - (bruto * m.persen + m.flat));
}

const isProd = process.env.MIDTRANS_IS_PRODUCTION === 'true';
const BASE_URL = isProd ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com';

function authHeader() {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) {
    throw Object.assign(new Error('MIDTRANS_SERVER_KEY belum diisi di .env — minta Server Key dari dashboard Midtrans dulu'), { status: 500 });
  }
  return 'Basic ' + Buffer.from(serverKey + ':').toString('base64');
}

// Bikin transaksi Snap baru — balikin { token, redirectUrl } buat dibuka di browser/WebView pelanggan.
const LABEL_PLAN = { bulanan: '1 Bulan', tahunan: '1 Tahun', permanen: 'Permanen (Seumur Hidup)' };

export async function buatTransaksiSnap({ orderId, plan, jumlah, namaWarung, email }) {
  const appUrl = process.env.APP_BASE_URL || 'http://localhost:5173';
  const body = {
    transaction_details: { order_id: orderId, gross_amount: jumlah },
    customer_details: { first_name: namaWarung || 'Warung', email: email || undefined },
    item_details: [{ id: plan, price: jumlah, quantity: 1, name: `Langganan Warung Pintar - ${LABEL_PLAN[plan] || plan}` }],
    callbacks: { finish: `${appUrl}/?lisensi=selesai` },
  };


  let res;
  try {
    res = await fetch(`${BASE_URL}/snap/v1/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: authHeader() },
      body: JSON.stringify(body),
    });
  } catch {
    throw Object.assign(new Error('Tidak bisa menghubungi Midtrans'), { status: 502 });
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw Object.assign(new Error((data && data.error_messages && data.error_messages.join(', ')) || 'Gagal membuat transaksi Midtrans'), {
      status: 502,
    });
  }
  return { token: data.token, redirectUrl: data.redirect_url };
}

// Verifikasi signature notifikasi webhook dari Midtrans, biar nggak ada yang bisa palsuin "sudah bayar".
// Rumusnya baku dari dokumentasi Midtrans: sha512(order_id + status_code + gross_amount + ServerKey)
export function verifikasiSignature({ order_id, status_code, gross_amount, signature_key }) {
  const serverKey = process.env.MIDTRANS_SERVER_KEY || '';
  const expected = crypto.createHash('sha512').update(order_id + status_code + gross_amount + serverKey).digest('hex');
  return expected === signature_key;
}

// Tanya status transaksi LANGSUNG ke Midtrans, tanpa nunggu webhook.
//
// Kenapa perlu padahal udah ada webhook: webhook itu Midtrans yang NEMBAK KE server kita, jadi dia
// gagal tiap kali server kita nggak bisa dijangkau dari internet - pas development di localhost
// (nggak akan pernah nyampe sama sekali), pas server lagi restart/deploy, atau pas jaringannya
// lagi bermasalah. Kalau cuma ngandelin webhook, pelanggan yang UDAH BAYAR bisa nyangkut selamanya
// di status "trial" tanpa ada cara pulih selain diperbaiki manual di database.
//
// Ini arahnya KEBALIKAN: kita yang nanya ke Midtrans, jadi jalan selama server kita punya internet
// keluar - nggak peduli kita bisa dijangkau dari luar apa nggak.
export async function cekStatusTransaksi(orderId) {
  const apiBase = isProd ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';
  const res = await fetch(`${apiBase}/v2/${encodeURIComponent(orderId)}/status`, {
    headers: { Authorization: authHeader(), Accept: 'application/json' },
  });
  const data = await res.json().catch(() => null);
  // 404 = order_id belum dikenal Midtrans (user bikin checkout tapi belum pernah buka halaman
  // bayarnya) - itu bukan error, cuma "belum ada apa-apa", jadi dibalikin null bukan dilempar.
  if (res.status === 404) return null;
  if (!res.ok) throw Object.assign(new Error(data?.status_message || `Midtrans error ${res.status}`), { status: 502 });
  return data;
}
