import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool, query } from './db.js';

// Bikin SATU akun demo berisi warung yang "hidup" - buat ditunjukin ke calon pelanggan.
//
// Kenapa nggak cukup bikin akun permanen kosong: warung tanpa data bikin SEMUA layar jualannya
// kelihatan mati - Laporan untung rugi nol, grafiknya garis datar, Pelanggan kosong, dan Mang AI
// jawabnya "warung kita masih kosong melompong" (kejadian beneran waktu dites). Calon pelanggan
// nggak bisa ngebayangin gunanya dari layar kosong.
//
// Aman dijalanin BERKALI-KALI: akun demo lama dihapus dulu (ON DELETE CASCADE ngebersihin semua
// tabel anaknya), jadi hasilnya selalu segar & nggak numpuk. Dipakai juga buat "nyetel ulang"
// demo yang udah keburu diacak-acak waktu dipamerin.
//
// Jalanin:  npm run seed:demo
// Ke database lain: DATABASE_URL="postgres://..." npm run seed:demo

const USERNAME = process.env.DEMO_USERNAME || 'demo';
const PASSWORD = process.env.DEMO_PASSWORD || 'demo123456';
const NAMA_WARUNG = process.env.DEMO_NAMA || 'Warung Berkah Jaya';
const NO_HP = process.env.DEMO_NO_HP || '628111000001';

// Harga kulakan & jual yang wajar buat warung kelontong Indonesia. Marginnya sengaja dibikin
// macem-macem (bukan rata 30%) biar layar "untung per barang" keliatan realistis, bukan hasil
// generate seragam yang langsung ketahuan palsu.
const PRODUK = [
  ['Indomie Goreng',            'sembako',  3500,  2800, 240, 'pcs',  40, 'dus'],
  ['Indomie Soto',              'sembako',  3500,  2800, 180, 'pcs',  40, 'dus'],
  ['Beras Ramos 5 kg',          'sembako', 68000, 58000,  24, 'karung', 1, null],
  ['Minyak Goreng 1 L',         'sembako', 18500, 15500,  60, 'pcs',  12, 'dus'],
  ['Gula Pasir 1 kg',           'sembako', 17500, 14500,  45, 'pcs',  25, 'sak'],
  ['Telur Ayam 1 kg',           'sembako', 29000, 25000,  30, 'kg',    1, null],
  ['Tepung Terigu 1 kg',        'sembako', 13000, 10500,  36, 'pcs',  25, 'sak'],
  ['Kopi Kapal Api 165 g',      'minuman', 16000, 12500,  48, 'pcs',  10, 'pack'],
  ['Teh Celup Sosro 25s',       'minuman',  9500,  7500,  40, 'pcs',  12, 'dus'],
  ['Susu Kental Manis',         'minuman', 12500, 10000,  52, 'kaleng', 24, 'dus'],
  ['Aqua 600 ml',               'minuman',  4000,  2900, 120, 'pcs',  24, 'dus'],
  ['Teh Pucuk 350 ml',          'minuman',  4500,  3300,  96, 'pcs',  24, 'dus'],
  ['Gudang Garam Surya 12',     'rokok',   32000, 29500,  40, 'bungkus', 10, 'slop'],
  ['Sampoerna Mild 16',         'rokok',   38000, 35000,  32, 'bungkus', 10, 'slop'],
  ['Sabun Lifebuoy Batang',     'lainnya',  5000,  3800,  60, 'pcs',  12, 'pack'],
  ['Rinso Bubuk 800 g',         'lainnya', 22000, 18500,  28, 'pcs',   6, 'dus'],
  ['Shampo Sachet Renceng',     'lainnya', 12000,  9500,  35, 'renceng', 1, null],
  ['Pasta Gigi Pepsodent 150 g','lainnya', 16500, 13500,  26, 'pcs',  12, 'dus'],
  ['Chitato 68 g',              'snack',   11000,  8800,  44, 'pcs',  10, 'pack'],
  ['Roma Kelapa',               'snack',    9500,  7500,  38, 'pcs',  12, 'pack'],
];

const PELANGGAN = [
  ['Bu Siti Rahayu',    '6281234500011', 'Gang Melati no. 4'],
  ['Pak Budi Santoso',  '6281234500012', 'Jl. Mawar no. 12'],
  ['Mbak Ani',          '6281234500013', 'Gang Melati no. 9'],
  ['Pak Joko',          '6281234500014', 'Jl. Anggrek no. 3'],
  ['Bu Ratna',          '6281234500015', 'Gang Kenanga no. 7'],
  ['Mas Dedi',          '6281234500016', 'Jl. Mawar no. 20'],
];

const PENJAGA = ['Ibu (pemilik)', 'Rina', 'Agus'];

// Acak tapi BISA DIULANG (seed tetap) - biar tiap kali di-reset, demonya nampilin angka yang sama.
// Penting waktu dipamerin: kamu udah hafal cerita di balik angkanya, jangan berubah tiap reset.
let benih = 20260911;
const acak = () => {
  benih = (benih * 1103515245 + 12345) % 2147483648;
  return benih / 2147483648;
};
const pilih = (arr) => arr[Math.floor(acak() * arr.length)];
const antara = (a, b) => a + Math.floor(acak() * (b - a + 1));

async function seed() {
  console.log(`Menyiapkan akun demo "${USERNAME}"...`);

  // Hapus akun demo lama - ON DELETE CASCADE ngurus produk/transaksi/pelanggan/kasbon-nya.
  const { rowCount } = await query('DELETE FROM warung WHERE username=$1', [USERNAME]);
  if (rowCount) console.log('  akun demo lama dihapus (biar datanya nggak numpuk)');

  const hash = await bcrypt.hash(PASSWORD, 10);
  // plan 'permanen' + berlaku 100 tahun: sama persis kayak yang dikasih webhook Midtrans buat
  // pembeli paket permanen (lihat DURASI_HARI_PLAN), jadi akun ini nggak akan pernah kedaluwarsa
  // di tengah demo.
  const { rows: wr } = await query(
    `INSERT INTO warung (nama, username, password_hash, no_hp, plan, lisensi_berlaku_sampai)
     VALUES ($1,$2,$3,$4,'permanen', now() + INTERVAL '36500 days') RETURNING id`,
    [NAMA_WARUNG, USERNAME, hash, NO_HP]
  );
  const wid = wr[0].id;

  for (const n of PENJAGA) {
    await query('INSERT INTO penjaga (warung_id, nama, aktif) VALUES ($1,$2,$3)', [wid, n, n === PENJAGA[0]]);
  }

  const produkIds = [];
  for (const [nama, kat, harga, modal, stok, satuan, isi, kemasan] of PRODUK) {
    const { rows } = await query(
      `INSERT INTO produk (warung_id, nama, kategori, harga, modal, stok, satuan, isi_kemasan, nama_kemasan, laku_per_hari)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, harga, modal, nama`,
      [wid, nama, kat, harga, modal, stok, satuan, isi, kemasan, 0]
    );
    produkIds.push(rows[0]);
  }

  const pelangganIds = [];
  for (const [nama, wa, alamat] of PELANGGAN) {
    const { rows } = await query(
      'INSERT INTO pelanggan (warung_id, nama, wa, alamat) VALUES ($1,$2,$3,$4) RETURNING id, nama',
      [wid, nama, wa, alamat]
    );
    pelangganIds.push(rows[0]);
  }

  // Transaksi 30 hari ke belakang. Sengaja dibikin berpola, bukan rata: akhir pekan lebih ramai,
  // dan jam pagi (05-11) lebih padat daripada sore. Itu yang bikin grafik Laporan ada bentuknya &
  // fitur "Sering dibeli pagi" (/api/produk/sering-pagi) punya isi buat ditunjukin.
  let totalTrx = 0;
  let totalOmzet = 0;
  for (let hariLalu = 29; hariLalu >= 0; hariLalu--) {
    const tgl = new Date();
    tgl.setDate(tgl.getDate() - hariLalu);
    const akhirPekan = [0, 6].includes(tgl.getDay());
    const jumlahTrx = akhirPekan ? antara(14, 22) : antara(8, 15);

    for (let i = 0; i < jumlahTrx; i++) {
      // 60% transaksi jatuh di jam pagi
      const jam = acak() < 0.6 ? antara(5, 10) : antara(11, 20);
      const waktu = new Date(tgl);
      waktu.setHours(jam, antara(0, 59), 0, 0);

      const nItem = antara(1, 3);
      const dipakai = [];
      let total = 0;
      let laba = 0;
      for (let k = 0; k < nItem; k++) {
        const p = pilih(produkIds);
        if (dipakai.find((x) => x.id === p.id)) continue;
        const qty = antara(1, 3);
        dipakai.push({ ...p, qty });
        total += Number(p.harga) * qty;
        laba += (Number(p.harga) - Number(p.modal)) * qty;
      }
      if (!dipakai.length) continue;

      // ~12% transaksi jadi kasbon (ngutang) - labanya 0, sama kayak logika simpanTransaksi()
      const kasbon = acak() < 0.12;
      const pel = kasbon || acak() < 0.3 ? pilih(pelangganIds) : null;
      const metode = kasbon ? null : acak() < 0.75 ? 'Tunai' : 'QRIS';

      const { rows: tr } = await query(
        `INSERT INTO transaksi (warung_id, penjaga_nama, mode, metode, pembeli_id, pembeli_nama, total, laba, sumber_input, waktu)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [wid, pilih(PENJAGA), kasbon ? 'kasbon' : 'bayar', metode, pel?.id || null, pel?.nama || null,
         total, kasbon ? 0 : laba, pilih(['manual', 'suara', 'barcode', 'visual']), waktu.toISOString()]
      );
      for (const d of dipakai) {
        await query(
          'INSERT INTO transaksi_item (transaksi_id, produk_id, nama_produk, qty, harga_satuan, modal_satuan) VALUES ($1,$2,$3,$4,$5,$6)',
          [tr[0].id, d.id, d.nama, d.qty, d.harga, d.modal]
        );
      }
      if (kasbon) {
        await query(
          'INSERT INTO kasbon (warung_id, transaksi_id, pelanggan_id, nama, jumlah, lunas, dibuat_pada) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [wid, tr[0].id, pel.id, pel.nama, total, hariLalu > 7, waktu.toISOString()]
        );
      } else {
        await query(
          'INSERT INTO masuk_log (warung_id, keterangan, jumlah, metode, waktu) VALUES ($1,$2,$3,$4,$5)',
          [wid, dipakai.map((d) => `${d.qty}x ${d.nama}`).join(', '), total, metode, waktu.toISOString()]
        );
        totalOmzet += total;
      }
      totalTrx++;
    }
  }

  // laku_per_hari dihitung dari transaksi yang barusan dibikin, bukan diisi angka karangan -
  // supaya saran kulakan & daftar "barang laris" nyambung sama histori yang kelihatan di layar.
  await query(
    `UPDATE produk p SET laku_per_hari = COALESCE(s.total, 0) / 30.0
     FROM (SELECT ti.produk_id, SUM(ti.qty) AS total FROM transaksi_item ti
           JOIN transaksi t ON t.id = ti.transaksi_id WHERE t.warung_id = $1 GROUP BY ti.produk_id) s
     WHERE p.id = s.produk_id AND p.warung_id = $1`,
    [wid]
  );

  await query(
    `INSERT INTO modal_log (warung_id, keterangan, jumlah, waktu)
     VALUES ($1,'Modal awal warung',15000000, now() - INTERVAL '30 days')`,
    [wid]
  );

  await query(
    `INSERT INTO riwayat_jaga (warung_id, dari, ke, uang_laci, penjualan_tunai, total_transaksi, waktu)
     VALUES ($1,$2,$3,$4,$5,$6, now() - INTERVAL '6 hours')`,
    [wid, PENJAGA[1], PENJAGA[0], 850000, 742000, 11]
  );

  const { rows: cek } = await query(
    `SELECT (SELECT count(*) FROM produk WHERE warung_id=$1) AS produk,
            (SELECT count(*) FROM transaksi WHERE warung_id=$1) AS trx,
            (SELECT count(*) FROM pelanggan WHERE warung_id=$1) AS pelanggan,
            (SELECT count(*) FROM kasbon WHERE warung_id=$1 AND NOT lunas) AS utang`,
    [wid]
  );
  const c = cek[0];
  console.log('\nAkun demo siap:');
  console.log(`  username : ${USERNAME}`);
  console.log(`  password : ${PASSWORD}`);
  console.log(`  warung   : ${NAMA_WARUNG} (plan permanen, nggak akan kedaluwarsa)`);
  console.log(`  isi      : ${c.produk} barang, ${c.trx} transaksi 30 hari, ${c.pelanggan} pelanggan, ${c.utang} kasbon belum lunas`);
  console.log(`  omzet    : Rp ${Math.round(totalOmzet).toLocaleString('id-ID')} (dari transaksi tunai/QRIS)`);
  await pool.end();
}

seed().catch((e) => {
  console.error('Seed gagal:', e.message);
  process.exit(1);
});
