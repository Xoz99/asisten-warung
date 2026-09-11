import { query } from '../db.js';
import { HARGA_PLAN } from './midtrans.service.js';

// Berapa hari lisensi diperpanjang per paket. DULU ditulis sebagai ternary di webhook:
//   p.plan === 'permanen' ? 36500 : p.plan === 'tahunan' ? 365 : 30
// Bahayanya: ujung ternary itu 30 hari buat plan APA PUN yang nggak dikenal. Begitu ada paket baru
// (misal 3 bulan) yang lupa ditambahin di situ, pelanggan bayar 3 bulan dapet 30 hari - DIAM-DIAM,
// tanpa error di mana pun, dan ketauannya cuma dari komplain. Dibikin tabel biar nambah paket =
// ngisi DUA tempat yang dua-duanya wajib (HARGA_PLAN + sini), dan plan tak dikenal DITOLAK keras.
//
// "permanen" direpresentasiin sebagai 100 tahun (bukan expiry beneran) - reuse logic
// GREATEST+interval yang sama, nggak perlu cabang query terpisah buat "nggak pernah expired".
export const DURASI_HARI_PLAN = {
  bulanan: 30,
  tahunan: 365,
  permanen: 36500,
};

// Dipanggil bareng sama webhook Midtrans DAN sinkronisasi manual (lihat lisensi.routes.js
// /sinkron). Ditaruh di satu tempat biar dua jalur itu NGGAK MUNGKIN beda perilaku - kalau
// logikanya disalin dua kali, cepat atau lambat yang satu keupdate & yang lain ketinggalan.
//
// Balikin true kalau baris ini BARU aktif gara-gara panggilan ini (dipakai buat mutusin perlu
// nampilin "berhasil upgrade" apa nggak), false kalau sebelumnya emang udah settlement.
export async function aktifkanPembayaran(p, notifikasi = null, transactionId = null) {
  if (p.status === 'settlement') return false; // udah pernah diproses - jangan perpanjang dobel

  const tambahHari = DURASI_HARI_PLAN[p.plan];
  if (!tambahHari) {
    // Sengaja DILEMPAR, bukan diam-diam dikasih durasi default. Pelanggan udah bayar; ngasih
    // durasi tebakan itu lebih buruk daripada gagal berisik yang langsung kelihatan di log.
    throw Object.assign(
      new Error(`Plan "${p.plan}" nggak punya durasi di DURASI_HARI_PLAN - lisensi TIDAK diperpanjang, harap dicek manual`),
      { status: 500 }
    );
  }

  await query(
    "UPDATE pembayaran SET status='settlement', midtrans_transaction_id=$1, raw_notifikasi=$2, updated_at=now() WHERE id=$3",
    [transactionId || null, notifikasi ? JSON.stringify(notifikasi) : null, p.id]
  );
  // perpanjang dari tanggal expired sekarang kalau masih aktif, atau dari sekarang kalau sudah lewat
  await query(
    `UPDATE warung SET plan=$1,
       lisensi_berlaku_sampai = GREATEST(lisensi_berlaku_sampai, now()) + ($2 || ' days')::interval
     WHERE id=$3`,
    [p.plan, tambahHari, p.warung_id]
  );
  return true;
}

// Jaring pengaman kalau paket ditambah di HARGA_PLAN tapi lupa di DURASI_HARI_PLAN. Dicek pas
// server nyala, BUKAN pas ada yang bayar - lebih baik ketauan di terminal developer daripada pas
// duit pelanggan udah masuk.
export function cekKonsistensiPlan() {
  const kurang = Object.keys(HARGA_PLAN).filter((p) => !DURASI_HARI_PLAN[p]);
  if (kurang.length) {
    console.error(
      `[lisensi] ⚠️  Plan dijual tapi durasinya belum diisi: ${kurang.join(', ')}. ` +
        `Tambahin ke DURASI_HARI_PLAN di services/lisensi.service.js, kalau nggak pembayarannya bakal GAGAL diproses.`
    );
  }
}
