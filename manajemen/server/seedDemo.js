import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { pool, query } from './db.js';

// Isi Makalin dengan data contoh (pelamar, lead CRM, karyawan, transaksi keuangan) buat nyoba AI Chat & Kantor Konsulin.
// Datanya dimasukin lewat API Makalin sendiri, jadi validasi & catatan aktivitasnya sama kayak input manual. Server harus
// lagi nyala (npm run dev:server) dan minimal udah ada satu admin.
//
// Penanda data demo, dipakai buat hapus: no HP pelamar 0899-0000-01xx, email @demo.makalin.test, deskripsi "[DEMO] ...".
// Aman dijalanin berkali-kali: data demo lama dihapus dulu.
//   npm run seed:demo            isi ulang data demo
//   npm run seed:demo -- --hapus cuma hapus data demo
const API = `http://127.0.0.1:${Number(process.env.PORT || 4100)}/api`;
const DOMAIN = 'demo.makalin.test';
const HP_DEMO = '62899000001';
const hariLalu = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

const PELAMAR = [
  { nama: 'Rina Marlina', domisili: 'Bandung', dropdown: 'Instagram', maju: 0, catatan: 'Pernah jaga toko kelontong orang tuanya 3 tahun.' },
  { nama: 'Dedi Kurniawan', domisili: 'Cimahi', dropdown: 'WhatsApp', maju: 0 },
  { nama: 'Yusuf Hidayat', domisili: 'Bandung', dropdown: 'Facebook', maju: 1, catatan: 'Punya motor, siap keliling Bandung timur.' },
  { nama: 'Sari Wulandari', domisili: 'Sumedang', dropdown: 'TikTok', maju: 1 },
  { nama: 'Agus Permana', domisili: 'Bandung', dropdown: 'Teman / keluarga', maju: 2, catatan: 'Kenal sekitar 40 warung di Antapani.' },
  { nama: 'Lestari Putri', domisili: 'Cimahi', dropdown: 'Poster', maju: 2 },
  { nama: 'Fajar Nugraha', domisili: 'Bandung', dropdown: 'Instagram', maju: 3, catatan: 'Mantan sales FMCG, komunikasinya bagus.' },
  { nama: 'Wawan Setiawan', domisili: 'Garut', dropdown: 'Facebook', maju: 0, keluar: 'Domisili terlalu jauh dari area garapan.' },
];

const LEADS = [
  { perusahaan: 'Warung Bu Imas', pic_nama: 'Imas Rohimah', jenis_usaha: 'Warung kelontong', sumber: 'Kunjungan sales', tahap: 'awareness', nilai: 99000 },
  { perusahaan: 'Toko Sembako Jaya Abadi', pic_nama: 'Hendra Gunawan', jenis_usaha: 'Toko sembako', sumber: 'Referral', tahap: 'trial', nilai: 149000 },
  { perusahaan: 'Warung Kopi Mang Ujang', pic_nama: 'Ujang Suryana', jenis_usaha: 'Warung kopi', sumber: 'Instagram', tahap: 'trial', nilai: 99000 },
  { perusahaan: 'Minimarket Berkah', pic_nama: 'Siti Aminah', jenis_usaha: 'Minimarket', sumber: 'Kunjungan sales', tahap: 'konversi', nilai: 249000 },
  { perusahaan: 'Toko Pak Darmo', pic_nama: 'Darmo Sutrisno', jenis_usaha: 'Warung kelontong', sumber: 'WhatsApp', tahap: 'repeat_order', nilai: 99000 },
  { perusahaan: 'Warung Nasi Teh Euis', pic_nama: 'Euis Komala', jenis_usaha: 'Warung makan', sumber: 'Kunjungan sales', tahap: 'stuck', nilai: 99000 },
];

const KARYAWAN = [
  { nama: 'Rizky Pratama', jabatan: 'Sales Lead', departemen: 'Sales', tipe: 'tetap', tanggal_masuk: hariLalu(540), gaji_pokok: 6500000, tunjangan_transport: 600000, tunjangan_makan: 500000, lokasi: 'Bandung' },
  { nama: 'Nadia Safitri', jabatan: 'Customer Success', departemen: 'Operasional', tipe: 'tetap', tanggal_masuk: hariLalu(400), gaji_pokok: 5200000, tunjangan_transport: 400000, tunjangan_makan: 500000, lokasi: 'Bandung' },
  { nama: 'Bagas Saputra', jabatan: 'Frontend Developer', departemen: 'Engineering', tipe: 'kontrak', tanggal_masuk: hariLalu(200), kontrak_selesai: hariLalu(-165), gaji_pokok: 8000000, tunjangan_makan: 500000, lokasi: 'Remote' },
  { nama: 'Melati Anggraini', jabatan: 'Admin Keuangan', departemen: 'Keuangan', tipe: 'probation', tanggal_masuk: hariLalu(45), gaji_pokok: 4800000, tunjangan_makan: 400000, lokasi: 'Bandung' },
  { nama: 'Ilham Ramadhan', jabatan: 'Sales Lapangan', departemen: 'Sales', tipe: 'magang', tanggal_masuk: hariLalu(20), gaji_pokok: 2000000, tunjangan_transport: 500000, lokasi: 'Cimahi' },
];

const TRANSAKSI = [
  { jenis: 'masuk', deskripsi: 'Pembayaran langganan tahunan Minimarket Berkah', jumlah: 2490000, tanggal: hariLalu(3), pihak: 'Minimarket Berkah' },
  { jenis: 'masuk', deskripsi: 'Langganan bulanan Toko Pak Darmo', jumlah: 99000, tanggal: hariLalu(6), pihak: 'Toko Pak Darmo' },
  { jenis: 'keluar', deskripsi: 'Cetak poster rekrutmen Sales Partner', jumlah: 350000, tanggal: hariLalu(10), pihak: 'Percetakan Mulya' },
  { jenis: 'keluar', deskripsi: 'Iklan Instagram rekrutmen', jumlah: 500000, tanggal: hariLalu(12), pihak: 'Meta' },
  { jenis: 'keluar', deskripsi: 'Bensin & parkir kunjungan sales', jumlah: 275000, tanggal: hariLalu(2), pihak: 'Tim sales' },
  { jenis: 'keluar', deskripsi: 'Server & domain bulan ini', jumlah: 420000, tanggal: hariLalu(1), pihak: 'Penyedia cloud' },
];

const ada = async (tabel) => (await query('SELECT to_regclass($1) IS NOT NULL AS ada', [tabel])).rows[0].ada;

async function hapusDemo() {
  const hasil = {};
  const hapus = async (tabel, sql, params) => {
    if (await ada(tabel)) hasil[tabel] = (await query(sql, params)).rowCount;
  };
  await hapus('mj_karyawan', 'DELETE FROM mj_karyawan WHERE email LIKE $1', [`%@${DOMAIN}`]);
  await hapus('mj_lamaran', 'DELETE FROM mj_lamaran WHERE orang_id IN (SELECT id FROM mj_orang WHERE no_hp LIKE $1)', [HP_DEMO + '%']);
  await hapus('mj_orang', 'DELETE FROM mj_orang WHERE no_hp LIKE $1', [HP_DEMO + '%']);
  await hapus('mj_lead', 'DELETE FROM mj_lead WHERE email LIKE $1', [`%@${DOMAIN}`]);
  await hapus('mj_transaksi', 'DELETE FROM mj_transaksi WHERE deskripsi LIKE $1', ['[DEMO]%']);
  return hasil;
}

async function tokenAdmin() {
  if (!process.env.MANAJEMEN_JWT_SECRET) throw new Error('MANAJEMEN_JWT_SECRET belum diisi di .env');
  if (!(await ada('mj_admin'))) throw new Error('Belum ada admin. Bikin admin pertama dulu (buka Makalin atau npm run buat-admin).');
  const { rows } = await query("SELECT id, nama, versi_sesi FROM mj_admin WHERE aktif AND peran <> 'sales' ORDER BY created_at LIMIT 1");
  if (!rows.length) throw new Error('Belum ada admin aktif. Bikin admin pertama dulu.');
  return { nama: rows[0].nama, token: jwt.sign({ adminId: rows[0].id, v: rows[0].versi_sesi }, process.env.MANAJEMEN_JWT_SECRET, { expiresIn: '10m' }) };
}

async function kirim(token, path, body) {
  let res;
  try {
    res = await fetch(API + path, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new Error(`Server Makalin nggak bisa dihubungi di ${API}. Nyalain dulu: npm run dev:server`);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${path}: ${data?.error || res.status}`);
  return data;
}

async function isiDemo() {
  const { token, nama } = await tokenAdmin();
  const lama = await hapusDemo();
  if (Object.values(lama).some(Boolean)) console.log('Data demo lama dihapus:', lama);
  console.log(`Ngisi data demo atas nama admin "${nama}"...`);
  const gagal = [];
  const coba = async (label, fn) => {
    try {
      return await fn();
    } catch (e) {
      gagal.push(`${label}: ${e.message}`);
      return null;
    }
  };

  for (const [i, p] of PELAMAR.entries()) {
    const noHp = '0899-0000-01' + String(i + 1).padStart(2, '0');
    const email = p.nama.toLowerCase().replace(/\s+/g, '.') + '@' + DOMAIN;
    const l = await coba(`pelamar ${p.nama}`, () => kirim(token, '/rekrutmen/lamaran', { nama: p.nama, noHp, email, domisili: p.domisili, dropdown: p.dropdown }));
    if (!l) continue;
    if (p.catatan) await coba(`catatan ${p.nama}`, () => kirim(token, `/rekrutmen/lamaran/${l.id}/catatan`, { isi: p.catatan }));
    for (let n = 0; n < p.maju; n++) await coba(`maju ${p.nama}`, () => kirim(token, `/rekrutmen/lamaran/${l.id}/maju`, {}));
    if (p.keluar) await coba(`tolak ${p.nama}`, () => kirim(token, `/rekrutmen/lamaran/${l.id}/keluar`, { status: 'rejected', alasan: p.keluar }));
  }
  for (const d of LEADS) {
    const email = d.pic_nama.toLowerCase().replace(/\s+/g, '.') + '@' + DOMAIN;
    await coba(`lead ${d.perusahaan}`, () => kirim(token, '/leads', { ...d, email }));
  }
  for (const k of KARYAWAN) {
    const email = k.nama.toLowerCase().replace(/\s+/g, '.') + '@' + DOMAIN;
    await coba(`karyawan ${k.nama}`, () => kirim(token, '/karyawan', { ...k, email }));
  }
  for (const t of TRANSAKSI) await coba(`transaksi ${t.deskripsi}`, () => kirim(token, '/keuangan/transaksi', { ...t, deskripsi: '[DEMO] ' + t.deskripsi }));

  console.log(`\nData demo Makalin siap: ${PELAMAR.length} pelamar, ${LEADS.length} lead CRM, ${KARYAWAN.length} karyawan, ${TRANSAKSI.length} transaksi keuangan.`);
  if (gagal.length) {
    console.log(`\n${gagal.length} langkah gagal (data lainnya tetap masuk):`);
    for (const g of gagal) console.log('  - ' + g);
  }
  console.log('Hapus lagi kapan aja: npm run seed:demo -- --hapus');
}

const jalan = process.argv.includes('--hapus') ? hapusDemo().then((h) => console.log('Data demo Makalin dihapus:', h)) : isiDemo();
jalan
  .catch((e) => {
    console.error('Gagal:', e.message);
    process.exitCode = 1;
  })
  .finally(() => pool?.end());
