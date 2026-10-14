// Room divisi Kantor Konsulin. Tiap room punya analis sendiri dan daftar data WAJIB yang dibaca server sebelum
// analisnya mikir, jadi analisa nggak bolong cuma karena model males manggil alat. Modul ini murni (tanpa Node API),
// dipakai server (jadwal otomatis) DAN layar Kantor di browser, biar alur & prompt antar perannya selalu sama.

const WIB = 7 * 3600000;
// Kunci bulan YYYY-MM (WIB) buat query /keuangan?bulan= & /komisi?periode=.
export function bulanKunci(dari = new Date()) {
  const d = new Date(dari.getTime() + WIB);
  const kunci = (geser) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + geser, 1)).toISOString().slice(0, 7);
  return { ini: kunci(0), lalu: kunci(-1) };
}

export const ROOM_KANTOR = {
  keuangan: {
    karakter: 'akuntan',
    nama: 'Room Keuangan',
    analis: 'Akuntan',
    fokus: 'arus kas (pemasukan, pengeluaran, selisih, saldo, kategori terbesar), bandingin bulan ini vs bulan lalu, tagihan/pembayaran Warung Pintar yang pending, dan bagi hasil sales',
    kata: /keuangan|kas|pemasukan|pengeluaran|saldo|tagihan|bayar|pembayaran|komisi|bagi hasil|omzet|untung|rugi|biaya|duit|uang|investor/i,
    sumber: (b) => [
      ['/keuangan', { bulan: b.ini }],
      ['/keuangan', { bulan: b.lalu }],
      ['/warung-pintar/pembayaran', {}],
      ['/komisi', { periode: b.ini }],
    ],
  },
  sales: {
    karakter: 'sales',
    nama: 'Room Sales & CRM',
    analis: 'Sales',
    fokus: 'pipeline CRM per tahap (jumlah & nilai), lead yang stuck/paling lama, lead menang/gagal, insight & keberatan dari sales lapangan, dan performa tiap sales',
    kata: /sales(?! partner)|crm|lead|pipeline|closing|prospek|lapangan|kunjungan|keberatan|stuck|konversi|investor/i,
    sumber: () => [
      ['/dashboard', {}],
      ['/leads', { semua: 1 }],
      ['/lapangan/insight', {}],
      ['/tim-sales', {}],
    ],
  },
  warung: {
    karakter: 'produk',
    nama: 'Room Warung Pintar',
    analis: 'Produk',
    fokus: 'langganan Warung Pintar: jumlah langganan, trial, trial habis belum bayar, berhenti, warung baru, rasio konversi trial ke langganan, warung yang perlu di-follow-up, dan sales per warung',
    kata: /warung|langganan|trial|berhenti|churn|pelanggan|subscribe|konversi|produk|investor/i,
    sumber: () => [
      ['/dashboard', {}],
      ['/warung-pintar/ringkasan', {}],
      ['/warung-pintar/leads-warung', {}],
    ],
  },
  tim: {
    karakter: 'hrd',
    nama: 'Room Tim & Rekrutmen',
    analis: 'HRD',
    fokus: 'funnel rekrutmen Sales Partner (pelamar per tahap, masuk minggu ini, hired, ditolak, yang perlu follow-up), jumlah karyawan aktif, kehadiran bulan ini, dan cuti',
    kata: /rekrut|pelamar|kandidat|hire|hiring|karyawan|tim|hrd|cuti|absen|hadir|kehadiran|sales partner|gaji|payroll/i,
    sumber: (b) => [
      ['/rekrutmen/ringkasan', {}],
      ['/rekrutmen/board', {}],
      ['/karyawan/ringkasan', {}],
      ['/karyawan-kehadiran/rekap', { bulan: b.ini }],
    ],
  },
};
export const ID_ROOM = Object.keys(ROOM_KANTOR);

// Room yang dikerjain: baris "ROOM: keuangan, warung" dari Planner. Kalau Planner lupa/ngaco, ditebak dari kata di
// tugas; kalau tetap nggak ketemu, semua room (laporan umum).
export function pilihRoom(teksPlanner, tugas = '') {
  const baris = String(teksPlanner || '').match(/^[\s*_>-]*ROOM\s*:\s*(.+)$/im)?.[1] || '';
  const dariPlanner = ID_ROOM.filter((id) => new RegExp(`\\b${id}\\b`, 'i').test(baris));
  if (dariPlanner.length) return dariPlanner;
  const dariTugas = ID_ROOM.filter((id) => ROOM_KANTOR[id].kata.test(tugas));
  return dariTugas.length ? dariTugas : [...ID_ROOM];
}

// Ringkas respons API biar muat di batas token model gratis: daftar panjang jadi jumlah + rekap per kolom status/tahap
// + beberapa contoh, teks panjang dipotong, ID internal dibuang (model nggak boleh nampilin UUID).
const KOLOM_REKAP = /^(status|tahap|kolom|hasil|kategori|jenis|tipe|sumber|departemen|keadaan|aktif|langganan)$/i;
const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function ringkasData(v, { contoh = 12, dalam = 0 } = {}) {
  if (v == null || typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'string') return POLA_UUID.test(v) ? undefined : v.length > 160 ? v.slice(0, 160) + '…' : v;
  if (dalam > 5) return '…';
  if (Array.isArray(v)) {
    const isi = v.map((x) => ringkasData(x, { contoh: Math.max(4, contoh - 6), dalam: dalam + 1 }));
    if (v.length <= contoh) return isi;
    const rekap = {};
    for (const x of v) {
      if (!x || typeof x !== 'object') continue;
      for (const [k, nilai] of Object.entries(x)) {
        if (!KOLOM_REKAP.test(k) || (typeof nilai !== 'string' && typeof nilai !== 'boolean' && typeof nilai !== 'number')) continue;
        rekap[k] ??= {};
        rekap[k][nilai] = (rekap[k][nilai] || 0) + 1;
      }
    }
    return { jumlah: v.length, ...(Object.keys(rekap).length ? { rekap } : {}), [`contoh_${contoh}_pertama`]: isi.slice(0, contoh) };
  }
  const hasil = {};
  for (const [k, nilai] of Object.entries(v)) {
    if (/^(id|.*_id)$/i.test(k) && (typeof nilai === 'string' || typeof nilai === 'number')) continue;
    const r = ringkasData(nilai, { contoh, dalam: dalam + 1 });
    if (r !== undefined) hasil[k] = r;
  }
  return hasil;
}

// Data room jadi teks buat model, maksimal `batas` huruf (dibagi rata per sumber).
export function teksDataRoom(hasil, batas = 14000) {
  const jatah = Math.floor(batas / Math.max(1, hasil.length));
  return hasil
    .map(({ sumber, ok, status, data }) => {
      let isi = ok ? JSON.stringify(ringkasData(data)) : `GAGAL dibaca (status ${status}): ${JSON.stringify(data?.error || data).slice(0, 200)}`;
      if (isi.length > jatah) isi = isi.slice(0, jatah) + ' …[DIPOTONG]';
      return `### ${sumber}\n${isi}`;
    })
    .join('\n\n');
}

export const sistemRoom = (id) => {
  const r = ROOM_KANTOR[id];
  return `Kamu analis ${r.analis} di ${r.nama}, Kantor Konsulin. Bidangmu: ${r.fokus}. Data wajib room ini UDAH dibaca dari Makalin dan dilampirkan di pesan (bagian DATA ROOM) - itu data asli, pakai itu dulu. Kalau butuh data tambahan di bidangmu, baru pakai alat fitur/baca. Tulis analisa room-mu buat tim, Bahasa Indonesia, ringkas, poin-poin: "## ${r.nama}", lalu "Angka kunci" (angka persis dari data, sebut periodenya, bandingin bulan lalu kalau ada datanya), "Temuan" (2-4 poin, tiap poin ada angkanya), "Perlu ditindaklanjuti" (nama warung/lead/kandidat konkret kalau ada di data). Data yang kosong atau gagal dibaca disebut terus terang ("data kosong" / "gagal dibaca"), jangan ditebak. Jangan pakai emoji.`;
};

// Hasil antar peran dipotong biar satu permintaan muat di batas token per menit akun gratis Groq.
const potong = (t, n) => (String(t).length > n ? String(t).slice(0, n) + '\n…[dipotong]' : String(t));
const bagian = (judul, isi, n) => (isi ? `\n\n${judul}:\n${potong(isi, n)}` : '');

// Pesan buat tiap langkah tim. Alur lengkap: Planner -> room divisi -> Researcher (lintas room) -> Coder ->
// Reviewer [-> revisi Coder] -> Writer. Alur "tanya room": Bos -> satu room -> Writer.
export const promptTim = {
  rencana: (tugas) => `Tugas dari Bos:\n${tugas}`,
  room: (tugas, rencana) => `Tugas dari Bos:\n${tugas}` + bagian('Brief dari Planner', rencana, 2500),
  riset: (tugas, rencana, room) => 'Tugas: ' + tugas + bagian('Rencana', rencana, 2000) + bagian('Hasil room divisi', room, 9000),
  kode: (tugas, rencana, room, riset) =>
    'Tugas: ' + tugas + bagian('Rencana', rencana, 1500) + bagian('Hasil room divisi', room, 8000) + bagian('Riset lintas room', riset, 3000),
  review: (tugas, room, kode) => 'Tugas: ' + tugas + bagian('Hasil room divisi (angka dari data asli)', room, 8000) + bagian('Hasil Coder', kode, 4000),
  revisi: (tugas, kode, review) => 'Tugas: ' + tugas + bagian('Hasil sebelumnya', kode, 5000) + bagian('Feedback Reviewer', review, 2500) + '\n\nPerbaiki.',
  akhir: (tugas, room, riset, kode, review) =>
    'Tugas: ' + tugas + bagian('Hasil room divisi', room, 7000) + bagian('Riset lintas room', riset, 2500) + bagian('Implementasi', kode, 4000) + bagian('Review', review, 1500),
};
