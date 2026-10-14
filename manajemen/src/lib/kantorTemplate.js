// Template "Analisa siap pakai" di Kantor Konsulin: tugas analisa data yang sering dibutuhin, tinggal klik lalu boleh diedit.
const namaBulan = (geser = 0) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + geser);
  return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
};

// {bulan_ini}/{bulan_lalu} diganti nama bulan pas dijalanin (di layar langsung, di jadwal otomatis oleh server).
export const isiBulan = (s) => s.replaceAll('{bulan_ini}', namaBulan()).replaceAll('{bulan_lalu}', namaBulan(-1));

export const TEMPLATE_ANALISA = [
  {
    id: 'laporan-bulanan',
    label: 'Laporan bulan ini',
    ket: 'Langganan, kas, CRM, rekrutmen, tim',
    teks: 'Bikin laporan bulanan Konsulin buat bulan {bulan_ini}: kondisi langganan Warung Pintar (langganan, trial, trial habis, berhenti, warung baru), pemasukan vs pengeluaran dan saldo, tagihan yang masih pending, pipeline CRM per tahap, rekrutmen Sales Partner, dan kondisi tim. Bandingin sama {bulan_lalu} kalau datanya ada. Kasih 3 temuan paling penting dan 3 rekomendasi tindakan.',
  },
  {
    id: 'konversi-trial',
    label: 'Evaluasi trial ke langganan',
    ket: 'Konversi & warung yang perlu di-follow-up',
    teks:
      'Analisa konversi warung Warung Pintar dari trial ke langganan: berapa yang masih trial, yang trial-nya udah habis tapi belum bayar, dan yang udah langganan. Hitung rasio konversinya. Daftar warung trial habis yang paling perlu di-follow-up (sertakan sales-nya kalau ada), lalu kasih rekomendasi cara naikin konversi.',
  },
  {
    id: 'pipeline-crm',
    label: 'Kesehatan pipeline CRM',
    ket: 'Lead per tahap, yang macet, nilai',
    teks:
      'Analisa kesehatan pipeline CRM: jumlah dan nilai lead per tahap (awareness, trial, konversi, repeat order, stuck), lead yang nyangkut paling lama di tahapnya, dan sumber lead yang paling banyak jadi. Kasih rencana follow-up konkret buat lead yang stuck.',
  },
  {
    id: 'arus-kas',
    label: 'Analisa arus kas',
    ket: 'Pemasukan, pengeluaran, saldo, tren',
    teks:
      'Analisa arus kas Konsulin 6 bulan terakhir: pemasukan (Midtrans dan manual) vs pengeluaran per bulan, tren naik/turun, kategori pengeluaran terbesar, saldo sekarang, dan tagihan yang masih pending. Kasih proyeksi singkat bulan depan dan rekomendasi hemat/naikin pemasukan.',
  },
  {
    id: 'rekrutmen',
    label: 'Funnel rekrutmen Sales Partner',
    ket: 'Pelamar per tahap, sumber, follow-up',
    teks:
      'Analisa funnel rekrutmen Sales Partner: jumlah pelamar per tahap, pelamar masuk minggu ini, yang udah di-hire, yang ditolak dan alasannya, sumber pelamar yang paling efektif, dan pelamar yang perlu di-follow-up. Kasih rekomendasi biar funnel-nya lebih lancar.',
  },
  {
    id: 'sales',
    label: 'Performa sales lapangan',
    ket: 'Sales terbaik, warung, kunjungan',
    teks:
      'Analisa performa tim sales: siapa sales paling produktif (jumlah warung, yang udah bayar, omzet bulan ini), aktivitas kunjungan lapangan, dan keberatan pelanggan yang paling sering muncul. Kasih rekomendasi buat sales yang performanya masih rendah.',
  },
  {
    id: 'investor',
    label: 'Ringkasan buat investor',
    ket: 'KPI utama dalam satu halaman',
    teks:
      'Bikin ringkasan satu halaman buat investor: KPI utama Konsulin (warung langganan dan pertumbuhannya, pemasukan bulan ini, saldo, pipeline CRM, ukuran tim sales), 3 pencapaian, 3 tantangan, dan rencana bulan depan. Pakai angka persis, bahasa singkat dan meyakinkan.',
  },
].map((t) => ({ ...t, tugas: () => isiBulan(t.teks) }));
