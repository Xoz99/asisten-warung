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
  bulanan: 78000,
  triwulan: 210000, // 3 bulan - Rp 70.000/bulan
  tahunan: 684000, // Rp 57.000/bulan - setara 3 bulan lebih gratis dibanding bulanan
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
    throw Object.assign(new Error('MIDTRANS_SERVER_KEY belum diisi di .env - minta Server Key dari dashboard Midtrans dulu'), { status: 500 });
  }
  return 'Basic ' + Buffer.from(serverKey + ':').toString('base64');
}

// Bikin transaksi Snap baru — balikin { token, redirectUrl } buat dibuka di browser/WebView pelanggan.
const LABEL_PLAN = { bulanan: '1 Bulan', triwulan: '3 Bulan', tahunan: '1 Tahun', permanen: 'Permanen (Seumur Hidup)' };

// Katalog paket yang DITAMPILKAN ke pelanggan. Ditaruh di sini, sebelahan sama HARGA_PLAN, supaya
// harga yang dipajang & harga yang ditagih Midtrans NGGAK MUNGKIN beda.
//
// Dulu daftar ini ditulis ulang di frontend sebagai teks ('Rp 490.000'). Begitu harga backend
// dinaikin, yang di layar ketinggalan - pelanggan liat Rp 49.000 tapi ditagih Rp 50.000. Nggak ada
// error, nggak ada yang ngeh, cuma pelanggan yang ngerasa dikadalin.
export const KATALOG_PLAN = [
  {
    id: 'bulanan',
    label: 'Bulanan',
    sub: 'Cocok buat nyoba dulu',
    bulan: 1,
    // `manfaat` SENGAJA cuma nyebut yang BENERAN beda antar paket. Di aplikasi ini nggak ada satu
    // pun fitur yang dikunci per paket (middleware/lisensi.js cuma ngecek langganan masih aktif,
    // bukan paketnya apa) - yang beda CUMA jatah token AI harian & durasinya.
    //
    // Nulis daftar fitur yang beda-beda seolah paket mahal dapat fitur eksklusif itu janji palsu:
    // pelanggan bayar tahunan lalu sadar fiturnya sama persis sama bulanan. Lebih baik bedanya
    // jujur & sedikit daripada ramai tapi bohong.
    manfaat: ['Semua fitur kebuka penuh', 'Bisa berhenti kapan aja', 'Pas buat ngerasain dulu sebulan'],
  },
  {
    id: 'triwulan',
    label: '3 Bulan',
    sub: 'Sekali bayar buat 3 bulan',
    bulan: 3,
    manfaat: ['Semua fitur kebuka penuh', 'Jatah AI 1,5x lipat bulanan', 'Nggak perlu bayar tiap bulan'],
  },
  {
    id: 'tahunan',
    label: 'Tahunan',
    sub: 'Bayar setahun, hemat lebih dari 3 bulan',
    bulan: 12,
    badge: 'PALING HEMAT',
    manfaat: ['Semua fitur kebuka penuh', 'Jatah AI 2,4x lipat bulanan', 'Tenang setahun, nggak mikir perpanjang'],
  },
  {
    id: 'permanen',
    label: 'Permanen',
    sub: 'Sekali bayar, seumur hidup',
    bulan: null, // nggak ada padanan per-bulan; jangan dibagi-bagi
    manfaat: ['Semua fitur kebuka penuh', 'Jatah AI 5x lipat bulanan', 'Nggak pernah perpanjang lagi', 'Harga nggak ikut naik nanti'],
  },
];

export async function buatTransaksiSnap({ orderId, plan, jumlah, namaWarung, email, username, noHp, warungId, salesKode }) {
  const appUrl = process.env.APP_BASE_URL || 'http://localhost:5173';
  const body = {
    transaction_details: { order_id: orderId, gross_amount: jumlah },
    // Yang tampil di dashboard Midtrans (Transactions > detail): nama = nama warung, nama belakang = @username,
    // telepon = nomor WA akun. custom_field1-3 ikut kesimpen di detail transaksi & bisa dicari di dashboard.
    customer_details: {
      first_name: (namaWarung || 'Warung').slice(0, 50),
      last_name: username ? `(@${username})`.slice(0, 50) : undefined,
      phone: noHp ? '+' + noHp : undefined,
      email: email || undefined,
    },
    custom_field1: username ? `username: ${username}`.slice(0, 255) : undefined,
    custom_field2: warungId ? `warung_id: ${warungId}` : undefined,
    custom_field3: `sales: ${salesKode || '-'}`,
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
