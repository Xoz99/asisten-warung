// Mesin halaman Kantor Konsulin: lantai kantor pixel art di <canvas>, karakter yang jalan, kerja, dan ngegosip.
// Teks (nama, balon obrolan, emote) ditaruh di lapisan HTML di atas canvas biar tetap tajam waktu canvas diperbesar.
import { ID_ROOM, ROOM_KANTOR, pilihRoom, promptTim } from '../../server/kantorRoom.js';
import { COLEK, COLEK_KERJA, GOSIP_KEJADIAN, PENONTON, PS, RIBUT, SERAH, SIFAT, SOAL_YANG_KERJA, TERIAK_RIBUT } from './kantorDialog.js';
import { obrolanData, ringkasFakta, rupiahPendek } from './kantorData.js';
// Lantai utama selalu 320x200. Room divisi (80x92, isi room digambar relatif ke pojok kiri atasnya) ditaruh beda
// tergantung layar:
// - lebar (desktop/tablet): room 2x2 di kanan lantai utama, tembok x 320-328, lorong di tengah (y 98-106) nyambung
//   ke lantai utama lewat bukaan tembok. Kantor jadi lebar & pendek, muat satu layar laptop.
// - tinggi (HP): tembok y 200-208, 4 room berjajar di bawah. Di HP lantainya digeser ke samping, jadi mending tinggi.
const LANTAI = { w: 320, h: 200 };
const RUANG = { w: 80, h: 92 };
const TATA = {
  lebar: {
    W: 488,
    H: 200,
    lorong: true,
    room: (i) => ({ x: 328 + (i % 2) * 80, y: i < 2 ? 4 : 108 }),
    // Jalan masuk room dari lantai utama: titik depan bukaan tembok, sepanjang lorong, lalu masuk pintu (kanan room).
    jalur: (o, i) => [{ x: 312, y: 102 }, { x: o.x + 66, y: 102 }, { x: o.x + 66, y: i < 2 ? o.y + 84 : o.y + 12 }],
    pintu: (o, i) => ({ x: o.x + 58, y: i < 2 ? 96 : 106, w: 16, h: 2 }),
    papanMaks: (i) => (i < 2 ? 52 : 74),
  },
  tinggi: {
    W: 320,
    H: 300,
    lorong: false,
    room: (i) => ({ x: i * 80, y: 208 }),
    jalur: (o) => [{ x: o.x + 40, y: 194 }, { x: o.x + 40, y: o.y + 8 }],
    pintu: (o) => ({ x: o.x + 32, y: 200, w: 16, h: 8 }),
    papanMaks: () => 74,
  },
};
// Lebar <= 700px (HP) pakai tata tinggi, sama kayak breakpoint CSS lantai yang digeser.
const MEDIA_HP = '(max-width: 700px)';
const tataLayar = () => (typeof matchMedia === 'function' && matchMedia(MEDIA_HP).matches ? 'tinggi' : 'lebar');
// Meja analis di dalam room-nya (relatif ke pojok room).
const MEJA_ROOM = { x: 44, y: 60 };

export const AGEN = [
  { id: 'bos', nama: 'Bos', warna: '#FACC15', teks: '#000', peran: 'Pemberi tugas (kamu)', meja: { x: 40, y: 124 }, kulit: '#e0ac69', rambut: '#3b2a1a', aksesori: 'dasi' },
  { id: 'planner', nama: 'Planner', warna: '#C4B5FD', teks: '#000', peran: 'Bikin rencana & milih room', meja: { x: 100, y: 62 }, kulit: '#f1c27d', rambut: '#2b1b10', aksesori: '' },
  { id: 'researcher', nama: 'Researcher', warna: '#4ADE80', teks: '#000', peran: 'Nyambungin temuan antar room', meja: { x: 220, y: 62 }, kulit: '#c68642', rambut: '#111', aksesori: 'kacamata' },
  { id: 'coder', nama: 'Coder', warna: '#1D4ED8', teks: '#fff', peran: 'Ngitung & bikin tabel', meja: { x: 280, y: 124 }, kulit: '#ffdbac', rambut: '#7a4b1e', aksesori: 'headphone' },
  { id: 'reviewer', nama: 'Reviewer', warna: '#FB923C', teks: '#000', peran: 'Ngecek angka', meja: { x: 220, y: 172 }, kulit: '#8d5524', rambut: '#222', aksesori: 'kacamata' },
  { id: 'writer', nama: 'Writer', warna: '#DC2626', teks: '#fff', peran: 'Nyusun laporan final', meja: { x: 100, y: 172 }, kulit: '#f1c27d', rambut: '#a0522d', aksesori: 'rambutPanjang' },
  { id: 'akuntan', nama: 'Akuntan', warna: '#15803D', teks: '#fff', peran: 'Analis Room Keuangan', meja: null, kulit: '#f1c27d', rambut: '#111', aksesori: 'kacamata', room: 'keuangan' },
  { id: 'sales', nama: 'Sales', warna: '#7DD3FC', teks: '#000', peran: 'Analis Room Sales & CRM', meja: null, kulit: '#c68642', rambut: '#3b2a1a', aksesori: 'dasi', room: 'sales' },
  { id: 'produk', nama: 'Produk', warna: '#A3E635', teks: '#000', peran: 'Analis Room Warung Pintar', meja: null, kulit: '#ffdbac', rambut: '#4a3426', aksesori: '', room: 'warung' },
  { id: 'hrd', nama: 'HRD', warna: '#F9A8D4', teks: '#000', peran: 'Analis Room Tim & Rekrutmen', meja: null, kulit: '#8d5524', rambut: '#2b1b10', aksesori: 'rambutPanjang', room: 'tim' },
];

// Room divisi (urutan kiri ke kanan). Data & prompt-nya di server/kantorRoom.js, di sini cuma tampilan.
const TAMPIL_ROOM = {
  keuangan: { label: 'Keuangan', satuan: 'masuk', lantai: '#5f7a5a', karpet: '#4d6a49', saran: ['Gimana arus kas bulan ini dibanding bulan lalu?', 'Tagihan mana yang paling perlu ditagih minggu ini?'] },
  sales: { label: 'Sales & CRM', satuan: 'lead', lantai: '#5a6d86', karpet: '#4a5c75', saran: ['Lead mana yang stuck paling lama dan harus diapain?', 'Sales siapa yang paling produktif bulan ini?'] },
  warung: { label: 'Warung Pintar', satuan: 'langganan', lantai: '#8a7550', karpet: '#7a6542', saran: ['Berapa konversi trial ke langganan sekarang?', 'Warung trial habis mana yang perlu di-follow-up?'] },
  tim: { label: 'Tim & Rekrutmen', satuan: 'pelamar', lantai: '#86607a', karpet: '#744f69', saran: ['Kandidat mana yang perlu di-follow-up minggu ini?', 'Gimana funnel rekrutmen Sales Partner sekarang?'] },
};
export const ROOM = ID_ROOM.map((id) => ({ id, ...ROOM_KANTOR[id], ...TAMPIL_ROOM[id] }));
// Angka live di papan room (dari ringkasan dashboard yang sama kayak obrolan karyawan). null = belum kemuat.
export function angkaRoom(id, f) {
  if (!f) return [];
  const ada = (v) => v != null;
  const daftar = {
    keuangan: [ada(f.pemasukanBulanIni) && ['Masuk bulan ini', rupiahPendek(f.pemasukanBulanIni)], ada(f.pengeluaranBulanIni) && ['Keluar bulan ini', rupiahPendek(f.pengeluaranBulanIni)], ada(f.saldo) && ['Saldo', rupiahPendek(f.saldo)], ada(f.tagihanN) && ['Tagihan pending', `${f.tagihanN} (${rupiahPendek(f.tagihanTotal)})`]],
    sales: [ada(f.leadAktif) && ['Lead jalan', f.leadAktif], ada(f.leadStuck) && ['Stuck', f.leadStuck], ada(f.leadKonversi) && ['Konversi', f.leadKonversi], ada(f.leadNilai) && ['Nilai pipeline', rupiahPendek(f.leadNilai)]],
    warung: [ada(f.warungLangganan) && ['Langganan', f.warungLangganan], ada(f.warungTrial) && ['Trial', f.warungTrial], ada(f.warungTrialHabis) && ['Trial habis', f.warungTrialHabis], ada(f.warungBaru30) && ['Baru 30 hari', f.warungBaru30]],
    tim: [ada(f.pelamarAktif) && ['Pelamar diproses', f.pelamarAktif], ada(f.pelamarMingguIni) && ['Masuk minggu ini', f.pelamarMingguIni], ada(f.pelamarFollowup) && ['Perlu follow-up', f.pelamarFollowup], ada(f.karyawanAktif) && ['Karyawan aktif', f.karyawanAktif]],
  };
  return (daftar[id] || []).filter(Boolean);
}

const ARTI_KEJADIAN = {
  task: 'Bos baru ngasih tugas ke Planner.',
  plan: 'Planner nyerahin rencana ke Researcher.',
  research: 'Researcher nyerahin hasil riset ke Coder.',
  code: 'Coder nyerahin kode ke Reviewer.',
  revise: 'Reviewer nolak kerjaan Coder dan minta revisi.',
  approved: 'Reviewer approve kerjaan Coder, lanjut ke Writer.',
  final: 'Writer nyerahin hasil akhir ke Bos, tugas selesai!',
  brief: 'Planner nganter brief ke room divisi di lantai bawah.',
  room: 'Analis room divisi nyerahin hasil analisa datanya.',
  tanyaRoom: 'Bos turun sendiri nanya langsung ke salah satu room divisi.',
};
const TEMPAT = [
  { x: 110, y: 40, arah: 'atas' }, { x: 210, y: 40, arah: 'atas' }, { x: 296, y: 50, arah: 'atas' },
  { x: 263, y: 48, arah: 'atas' }, { x: 160, y: 140 }, { x: 60, y: 185 }, { x: 250, y: 150 },
];

// Pojok PlayStation (kanan bawah): TV di atas rak, dua beanbag di depannya.
const PS_TV = { x: 290, y: 170 };
const BEANBAG = [
  { x: 278, y: 189, warna: '#7c3aed', gelap: '#5b21b6' },
  { x: 302, y: 189, warna: '#ea580c', gelap: '#c2410c' },
];

// Nama reaksi -> ekspresi muka (+ benda di tangan / gerakan). Semua digambar pixel di karakternya, bukan ikon tempelan.
const REAKSI = {
  kopi: { muka: 'senang', pegang: 'kopi' },
  hp: { muka: 'licik', pegang: 'hp' },
  makan: { muka: 'senang', pegang: 'makan' },
  buku: { muka: 'fokus', pegang: 'buku' },
  dokumen: { muka: 'senang', pegang: 'dokumen' },
  musik: { muka: 'senang', gaya: 'goyang' },
  tidur: { muka: 'tidur' },
  seru: { muka: 'teriak', gaya: 'lambai' },
  tanya: { muka: 'mikir' },
  cari: { muka: 'mikir' },
  data: { muka: 'mikir' },
  jam: { muka: 'mikir' },
  marah: { muka: 'marah' },
  petir: { muka: 'teriak' },
  kaget: { muka: 'kaget' },
  mata: { muka: 'kaget' },
  tawa: { muka: 'tawa', gaya: 'goyang' },
  sebel: { muka: 'sebel' },
  sedih: { muka: 'sedih' },
  hati: { muka: 'cinta' },
  centang: { muka: 'senang' },
  ide: { muka: 'kaget', gaya: 'lambai' },
  pesta: { muka: 'tawa', gaya: 'angkat' },
  bintang: { muka: 'pusing' },
  keringat: { muka: 'keringat' },
  halo: { muka: 'senang', gaya: 'lambai' },
  bisik: { muka: 'licik' },
  pegel: { muka: 'tidur', gaya: 'angkat' },
  senang: { muka: 'senang' },
  mikir: { muka: 'mikir' },
};

const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
const pilih = (a) => a[Math.floor(Math.random() * a.length)];
const acak = (a, b) => a + Math.random() * (b - a);
const jarak = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const isi = (s, m) => s.replace(/\{(\w)\}/g, (_, k) => m[k] ?? '');
// Reaksi pakai ikon, bukan emoji; teks dari AI pun dibersihin dari emoji.
const tanpaEmoji = (s) => String(s).replace(/\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]|[\u{1F3FB}-\u{1F3FF}]|️|‍|⃣/gu, '').replace(/\s{2,}/g, ' ').trim();
const ucapan = (o, jenis) => SIFAT[o.id]?.[jenis] || SIFAT.planner[jenis];
function pilihBerbobot(daftar) {
  let r = Math.random() * daftar.reduce((s, [w]) => s + w, 0);
  for (const [w, f] of daftar) if ((r -= w) < 0) return f;
  return daftar[0][1];
}
const kotak = (g, warna, x, y, w, h) => {
  g.fillStyle = warna;
  g.fillRect(x, y, w, h);
};

function gambarRuang(T) {
  const c = document.createElement('canvas');
  c.width = T.W;
  c.height = T.H;
  const g = c.getContext('2d');
  // dasar tembok (keliatan di sela room & lorong), lalu lantai utama 320x200
  kotak(g, '#46557a', 0, 0, T.W, T.H);
  kotak(g, '#a87c4f', 0, 0, LANTAI.w, LANTAI.h);
  for (let y = 28; y < LANTAI.h; y += 8) {
    kotak(g, '#9a6f44', 0, y, LANTAI.w, 1);
    for (let x = (y / 8) % 2 ? 0 : 16; x < LANTAI.w; x += 32) kotak(g, '#9a6f44', x, y, 1, 8);
  }
  kotak(g, '#46557a', 0, 0, LANTAI.w, 28);
  for (let x = 0; x < LANTAI.w; x += 8) kotak(g, '#3e4c6e', x, 0, 1, 26);
  kotak(g, '#2c3550', 0, 26, LANTAI.w, 3);
  for (const wx of [84, 196]) {
    kotak(g, '#e8e8e8', wx, 5, 40, 17);
    kotak(g, '#8fd3ff', wx + 2, 7, 36, 13);
    kotak(g, '#fff', wx + 5, 9, 7, 2);
    kotak(g, '#fff', wx + 25, 13, 8, 2);
    kotak(g, '#e8e8e8', wx + 19, 7, 2, 13);
    kotak(g, '#e8e8e8', wx + 2, 13, 36, 1);
  }
  kotak(g, '#222', 64, 6, 12, 12);
  kotak(g, '#fff', 65, 7, 10, 10);
  kotak(g, '#222', 69, 9, 1, 4);
  kotak(g, '#222', 70, 12, 3, 1);
  // pantry + mesin kopi
  kotak(g, '#8a613a', 22, 28, 34, 3);
  kotak(g, '#6b4a2b', 22, 31, 34, 10);
  kotak(g, '#333', 28, 15, 13, 13);
  kotak(g, '#c33', 30, 17, 2, 2);
  kotak(g, '#3c3', 33, 17, 2, 2);
  kotak(g, '#888', 32, 22, 5, 3);
  kotak(g, '#fff', 45, 24, 4, 4);
  kotak(g, '#fff', 50, 24, 4, 4);
  // rak buku
  kotak(g, '#6b4428', 248, 6, 30, 34);
  for (let s = 0; s < 3; s++) {
    kotak(g, '#4a2e1a', 248, 15 + s * 10, 30, 1);
    for (let i = 0; i < 6; i++) kotak(g, ['#c0392b', '#2980b9', '#27ae60', '#f1c40f', '#8e44ad', '#e67e22'][(i + s) % 6], 250 + i * 4, 8 + s * 10, 3, 7);
  }
  kotak(g, '#b5532e', 292, 32, 11, 9);
  kotak(g, '#2e8b57', 290, 20, 5, 10);
  kotak(g, '#3cb371', 295, 16, 5, 16);
  kotak(g, '#2e8b57', 300, 21, 5, 10);
  // karpet + dispenser: tempat ngegosip
  kotak(g, '#7a3b5c', 128, 98, 64, 32);
  kotak(g, '#9c5079', 131, 101, 58, 26);
  kotak(g, '#b8678f', 134, 104, 52, 1);
  kotak(g, '#ddd', 155, 96, 10, 13);
  kotak(g, '#999', 158, 101, 4, 2);
  kotak(g, '#6cc3ff', 156, 85, 8, 11);
  kotak(g, '#a8e0ff', 157, 86, 2, 9);
  // karpet & beanbag pojok PS
  kotak(g, '#1e3a5f', 262, 172, 54, 26);
  kotak(g, '#27507f', 264, 174, 50, 22);
  for (const b of BEANBAG) {
    kotak(g, b.gelap, b.x - 8, b.y - 7, 16, 8);
    kotak(g, b.warna, b.x - 7, b.y - 8, 14, 6);
    kotak(g, 'rgba(255,255,255,.25)', b.x - 5, b.y - 7, 4, 1);
  }
  gambarRoom(g, T);
  return c;
}

// Room divisi: lantai beda warna per room, tembok & pintu sesuai tata, perabot sesuai bidangnya.
function gambarRoom(g, T) {
  if (T.lorong) {
    // lorong di antara dua baris room, nyambung ke lantai utama lewat bukaan tembok x 320-328
    kotak(g, '#8c7a62', LANTAI.w, 98, T.W - LANTAI.w, 8);
    for (let x = LANTAI.w + 4; x < T.W; x += 12) kotak(g, '#7d6c55', x, 98, 1, 8);
    kotak(g, '#5b6b93', LANTAI.w, 0, 1, 98);
    kotak(g, '#5b6b93', LANTAI.w, 106, 1, 94);
  } else {
    kotak(g, '#5b6b93', 0, LANTAI.h, T.W, 1);
    kotak(g, '#2c3550', 0, LANTAI.h + 7, T.W, 1);
  }
  ROOM.forEach((r, i) => {
    const o = T.room(i);
    const t = (warna, x, y, w, h) => kotak(g, warna, o.x + x, o.y + y, w, h);
    t(r.lantai, 0, 0, RUANG.w, RUANG.h);
    for (let y = 8; y < RUANG.h; y += 8) t(r.karpet, 0, y, RUANG.w, 1);
    t(r.karpet, 16, 44, 48, 40);
    t('rgba(255,255,255,.08)', 18, 46, 44, 36);
    t('rgba(0,0,0,.18)', 0, 0, RUANG.w, 3);
    // sekat ke room sebelah (kiri), pintu dicat warna lantai room
    if (o.x > LANTAI.w + 8 || (!T.lorong && o.x > 0)) {
      t('#2c3550', -1, 0, 2, RUANG.h);
      t('#46557a', -1, 0, 1, RUANG.h);
    }
    const p = T.pintu(o, i);
    kotak(g, r.lantai, p.x, p.y, p.w, p.h);
    kotak(g, '#2c3550', p.x - 1, p.y, 1, p.h);
    kotak(g, '#2c3550', p.x + p.w, p.y, 1, p.h);
    t('#b5532e', 5, 74, 7, 5);
    t('#2e8b57', 4, 68, 4, 7);
    t('#3cb371', 7, 66, 4, 9);
    t('#2e8b57', 10, 69, 3, 6);
    PERABOT[r.id](t);
  });
}

// Perabot tiap room, koordinat relatif ke pojok kiri atas room (80x92). Meja analis di (44, 60).
const PERABOT = {
  keuangan(t) {
    // brankas, papan grafik, lemari arsip
    t('#4b5563', 6, 6, 16, 19);
    t('#6b7280', 8, 8, 12, 15);
    t('#d1d5db', 12, 12, 4, 4);
    t('#111', 13, 13, 2, 2);
    t('#9ca3af', 18, 14, 1, 4);
    t('#57534e', 28, 3, 26, 18);
    t('#f5f5f4', 29, 4, 24, 16);
    t('#16a34a', 32, 14, 3, 5);
    t('#16a34a', 37, 11, 3, 8);
    t('#16a34a', 42, 8, 3, 11);
    t('#dc2626', 47, 12, 3, 7);
    t('#57534e', 33, 21, 1, 6);
    t('#57534e', 48, 21, 1, 6);
    t('#78716c', 60, 5, 14, 21);
    for (const y of [11, 18]) t('#57534e', 60, y, 14, 1);
    for (const y of [8, 14, 21]) t('#d6d3d1', 66, y, 2, 1);
  },
  sales(t) {
    // whiteboard pipeline + sticky note, papan dart, tumpukan brosur
    t('#475569', 6, 3, 42, 22);
    t('#f8fafc', 7, 4, 40, 20);
    ['#fde047', '#f9a8d4', '#86efac', '#93c5fd'].forEach((w, i) => {
      t('#cbd5e1', 9 + i * 10, 6, 7, 1);
      for (let j = 0; j < 3 - (i % 2); j++) t(w, 9 + i * 10, 9 + j * 5, 6, 4);
    });
    t('#475569', 12, 25, 1, 5);
    t('#475569', 42, 25, 1, 5);
    t('#dc2626', 56, 5, 11, 11);
    t('#f8fafc', 58, 7, 7, 7);
    t('#dc2626', 60, 9, 3, 3);
    t('#a16207', 58, 28, 13, 8);
    t('#fef3c7', 59, 27, 11, 2);
  },
  warung(t) {
    // etalase warung, kulkas minuman, banner
    t('#92400e', 6, 3, 32, 27);
    for (let s = 0; s < 3; s++) {
      t('#78350f', 6, 11 + s * 8, 32, 1);
      for (let i = 0; i < 7; i++) t(['#ef4444', '#facc15', '#22c55e', '#3b82f6', '#f97316', '#a855f7', '#f5f5f4'][(i + s * 2) % 7], 8 + i * 4, 5 + s * 8, 3, 5);
    }
    t('#e5e7eb', 44, 3, 15, 26);
    t('#bae6fd', 46, 5, 11, 15);
    for (let i = 0; i < 3; i++) {
      t(['#dc2626', '#16a34a', '#f59e0b'][i], 47 + i * 3, 7, 2, 5);
      t(['#2563eb', '#dc2626', '#16a34a'][i], 47 + i * 3, 13, 2, 5);
    }
    t('#dc2626', 44, 22, 15, 2);
    t('#f59e0b', 64, 4, 13, 9);
    t('#fff', 66, 7, 2, 2);
    t('#fff', 70, 7, 5, 2);
  },
  tim(t) {
    // papan kandidat, kalender, kursi interview
    t('#b45309', 6, 3, 30, 21);
    t('#d6a35c', 7, 4, 28, 19);
    for (let i = 0; i < 4; i++) {
      const x = 9 + i * 7;
      const y = 6 + (i % 2) * 7;
      t('#fff', x, y, 5, 6);
      t(['#f1c27d', '#c68642', '#8d5524', '#ffdbac'][i], x + 1, y + 1, 3, 3);
      t('#dc2626', x + 2, y - 1, 1, 1);
    }
    t('#fff', 40, 4, 9, 9);
    t('#dc2626', 40, 4, 9, 2);
    for (let i = 0; i < 3; i++) t('#9ca3af', 41 + i * 3, 8, 1, 1);
    t('#4b4b63', 52, 16, 7, 7);
    t('#4b4b63', 68, 16, 7, 7);
    t('#c48a52', 60, 18, 7, 4);
  },
};

const jam = () => new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const JUDUL_LANGKAH = { planner: 'Rencana', researcher: 'Riset lintas room', coder: 'Implementasi', reviewer: 'Review', writer: 'Hasil akhir' };

// Satu kantor per sesi login, hidup di level aplikasi: karakter tetap jalan & tugas tetap dikerjain walau halaman
// Kantor ditutup. Halaman cuma nempelin `elemen` (canvas + lapisan teks) dan baca `keadaan` lewat langganan.
function buatKantor(namaBos) {
  const elemen = Object.assign(document.createElement('div'), { className: 'kantor-ruang' });
  const kanvas = document.createElement('canvas');
  kanvas.setAttribute('role', 'img');
  kanvas.setAttribute('aria-label', 'Animasi kantor: karakter AI kerja dan ngobrol');
  const lapisan = Object.assign(document.createElement('div'), { className: 'kantor-lapisan' });
  lapisan.setAttribute('aria-hidden', 'true');
  elemen.append(kanvas, lapisan);
  const ctx = kanvas.getContext('2d');
  // Tata letak aktif (lihat TATA); diganti pasangTata() waktu layar nyebrang breakpoint HP.
  let T = TATA[tataLayar()];
  let latar = null;
  const batasX = (v) => Math.max(8, Math.min(T.W - 8, v));
  const mejaRoom = (roomId) => {
    const o = T.room(ROOM.findIndex((r) => r.id === roomId));
    return { x: o.x + MEJA_ROOM.x, y: o.y + MEJA_ROOM.y };
  };
  // Zona: -1 = lantai utama, 0..3 = room divisi, -2 = lorong/tembok di blok room (tata lebar).
  const zonaDi = (x, y) => {
    const i = ROOM.findIndex((_, j) => {
      const o = T.room(j);
      return x >= o.x && x < o.x + RUANG.w && y >= o.y - 2 && y <= o.y + RUANG.h + 2;
    });
    if (i >= 0) return i;
    return x < LANTAI.w && y < LANTAI.h ? -1 : -2;
  };
  // Titik-titik jalan dari zona ke zona: keluar room asal lewat pintunya, masuk room tujuan lewat pintunya. Di tata
  // lebar, antar room cukup lewat lorong (nggak perlu mampir lantai utama).
  function ruteZona(dari, ke) {
    if (dari === ke) return [];
    const depan = T.lorong ? T.jalur(T.room(0), 0)[0] : null;
    let p = [];
    if (dari >= 0) p.push(...[...T.jalur(T.room(dari), dari)].reverse());
    if (depan && ((dari === -2 && ke === -1) || (dari === -1 && ke === -2))) p.push(depan);
    if (ke >= 0) p.push(...T.jalur(T.room(ke), ke));
    if (depan && dari !== -1 && ke !== -1) p = p.filter((q) => q.x !== depan.x || q.y !== depan.y);
    return p;
  }
  const setelan = { ai: null, gosipAi: false, terlihat: false };
  const dunia = { jalan: false, tugas: '', kerja: null, kejadian: null };
  const terakhir = [];
  const orang = {};
  const semua = () => Object.values(orang);
  let mati = false;
  let raf = 0;
  let putaranReview = 0;

  let keadaan = {
    status: null,
    tugas: '',
    jalan: false,
    mulai: null,
    selesai: null,
    tahap: 'Santai',
    agen: Object.fromEntries(AGEN.map((a) => [a.id, { st: 'santai', selesai: 0, kegiatan: 'Di meja' }])),
    obrolan: [],
    langkah: [],
    hasil: '',
    judul: '',
    template: null,
    laporanId: null,
    errorSimpan: '',
    versiRiwayat: 0,
    error: '',
    // mode tugas: 'tim' (alur lengkap) atau 'room' (Bos nanya langsung satu room); room = id room-nya.
    mode: 'tim',
    room: null,
    roomKerja: null,
    roomDipilih: null,
    fakta: null,
  };
  const pendengar = new Set();
  const ubah = (fn) => {
    if (mati) return;
    keadaan = { ...keadaan, ...fn(keadaan) };
    pendengar.forEach((f) => f());
  };
  const ubahAgen = (id, isi) => ubah((k) => ({ agen: { ...k.agen, [id]: { ...k.agen[id], ...isi } } }));
  const kegiatan = (o, teks) => keadaan.agen[o.id]?.kegiatan !== teks && ubahAgen(o.id, { kegiatan: teks });

  class Orang {
    constructor(a, nama) {
      Object.assign(this, { id: a.id, nama, warna: a.warna, kulit: a.kulit, rambut: a.rambut, aksesori: a.aksesori, room: a.room || null });
      this.meja = a.room ? mejaRoom(a.room) : a.meja;
      this.kursi = { x: this.meja.x, y: this.meja.y + 12 };
      this.x = this.kursi.x;
      this.y = this.kursi.y;
      this.keadaan = 'duduk';
      this.arah = 'atas';
      this.sibuk = false;
      this.nongkrong = false;
      this.tok = {};
      this.kerja = false;
      this.bawa = false;
      this.ngomong = false;
      this.santaiLagi = performance.now() + 1500 + Math.random() * 5000;
      this.kedip = Math.random() * 3000;
      this.tag = Object.assign(document.createElement('div'), { className: 'kantor-tag', textContent: nama });
      this.tag.style.background = a.warna;
      this.tag.style.color = a.teks;
      this.balon = Object.assign(document.createElement('div'), { className: 'kantor-balon' });
      lapisan.append(this.tag, this.balon);
    }
    // Pindah zona (lantai utama <-> room, atau antar room) lewat pintu: keluar pintu room asal, masuk pintu room tujuan.
    jalanKe(x, y, duduk = false) {
      if (this._sampai) this._sampai(false);
      const rute = [...ruteZona(zonaDi(this.x, this.y), zonaDi(x, y)), { x, y }];
      const [awal, ...sisa] = rute;
      Object.assign(this, { tx: awal.x, ty: awal.y, rute: sisa, dudukNanti: duduk, keadaan: 'jalan', diBeanbag: false, mainPS: false });
      return new Promise((r) => (this._sampai = r));
    }
    berhenti() {
      this.rute = [];
      if (this._sampai) {
        const r = this._sampai;
        this._sampai = null;
        r(false);
      }
      if (this.keadaan === 'jalan') Object.assign(this, { keadaan: 'berdiri', arah: 'bawah' });
    }
    gerak(dt) {
      if (this.keadaan !== 'jalan') return;
      const dx = this.tx - this.x;
      const dy = this.ty - this.y;
      const d = Math.hypot(dx, dy);
      const s = 55 * dt;
      if (Math.abs(dx) > Math.abs(dy)) this.arah = dx < 0 ? 'kiri' : 'kanan';
      else this.arah = dy < 0 ? 'atas' : 'bawah';
      if (d <= s && this.rute?.length) {
        this.x = this.tx;
        this.y = this.ty;
        const p = this.rute.shift();
        Object.assign(this, { tx: p.x, ty: p.y });
      } else if (d <= s) {
        this.x = this.tx;
        this.y = this.ty;
        this.keadaan = this.dudukNanti ? 'duduk' : 'berdiri';
        this.arah = this.keadaan === 'duduk' ? 'atas' : 'bawah';
        const r = this._sampai;
        this._sampai = null;
        r?.(true);
      } else {
        this.x += (dx / d) * s;
        this.y += (dy / d) * s;
      }
    }
    bilang(teks, ms) {
      teks = tanpaEmoji(teks);
      if (!teks) return Promise.resolve();
      ms = ms || Math.min(6000, 1500 + teks.length * 45);
      this._selesaiBilang?.();
      this.balon.textContent = teks;
      this.balon.classList.add('tampil');
      this.ngomong = true;
      ubah((k) => ({ obrolan: [...k.obrolan.slice(-119), { id: this.id, nama: this.nama, warna: this.warna, teks, jam: jam() }] }));
      terakhir.push(`${this.nama}: ${teks}`);
      if (terakhir.length > 10) terakhir.shift();
      clearTimeout(this._tb);
      return new Promise((r) => {
        this._selesaiBilang = r;
        this._tb = setTimeout(() => {
          this.balon.classList.remove('tampil');
          this.ngomong = false;
          this._selesaiBilang = null;
          r();
        }, ms);
      });
    }
    // Reaksi digambar langsung di karakter: ekspresi muka, benda yang dipegang, dan gerakan tangan.
    emote(nama, ms = 1800) {
      const r = REAKSI[nama];
      if (!r) return;
      Object.assign(this, { ekspresi: r.muka, pegang: r.pegang || null, gaya: r.gaya || null, reaksiSampai: performance.now() + ms });
    }
    tempatkan() {
      const px = (v) => (v / T.W) * 100 + '%';
      const py = (v) => (v / T.H) * 100 + '%';
      this.tag.style.left = px(this.x);
      this.tag.style.top = py(this.y + 1);
      this.balon.style.top = py(this.y - 21);
      // Balon yang lagi tampil dijaga tetap di dalam kotak kantor (di layar sempit balonnya lebih lebar dari jarak ke tepi).
      if (this.ngomong) {
        const lebar = lapisan.clientWidth;
        const setengah = this.balon.offsetWidth / 2 + 4;
        this.balon.style.left = Math.min(Math.max((this.x / T.W) * lebar, setengah), lebar - setengah) + 'px';
      } else this.balon.style.left = px(this.x);
      const v = this.sembunyi ? 'hidden' : '';
      if (this.tag.style.visibility !== v) this.tag.style.visibility = v;
    }
  }

  function gambarMeja(o, t) {
    const { x, y } = o.meja;
    kotak(ctx, '#c48a52', x - 14, y - 12, 28, 7);
    kotak(ctx, '#8a5a30', x - 14, y - 5, 28, 5);
    kotak(ctx, '#6b4428', x - 13, y, 2, 2);
    kotak(ctx, '#6b4428', x + 11, y, 2, 2);
    kotak(ctx, '#2b2b2b', x - 6, y - 21, 12, 9);
    kotak(ctx, '#2b2b2b', x - 1, y - 12, 2, 1);
    kotak(ctx, o.kerja ? o.warna : '#1e2a38', x - 5, y - 20, 10, 7);
    if (o.kerja) {
      const s = Math.floor(t / 150);
      for (let i = 0; i < 3; i++) kotak(ctx, 'rgba(255,255,255,.85)', x - 4, y - 19 + i * 2, 2 + ((s * 7 + i * 13) % 6), 1);
    }
    kotak(ctx, '#ddd', x - 5, y - 10, 10, 2);
    kotak(ctx, '#fff', x + 8, y - 11, 3, 3);
    kotak(ctx, '#f5f5f5', x - 12, y - 11, 4, 3);
  }

  // Muka 8x7 pixel: mata di baris ke-3, mulut di baris ke-5/6. e0/e1 = posisi dua mata (ikut arah hadap).
  function gambarMuka(o, x, hy, t, muka) {
    const D = '#222';
    const M = '#7a3b2e';
    const [e0, e1] = o.arah === 'kiri' ? [x - 3, x - 1] : o.arah === 'kanan' ? [x, x + 2] : [x - 2, x + 1];
    const ey = hy + 3;
    const lebarMulut = Math.max(1, e1 - e0 - 1);
    const mataTitik = (dy = 0) => {
      kotak(ctx, D, e0, ey + dy, 1, 1);
      kotak(ctx, D, e1, ey + dy, 1, 1);
    };
    const mataGaris = (dy = 0) => {
      kotak(ctx, D, e0 - 1, ey + dy, 2, 1);
      kotak(ctx, D, e1, ey + dy, 2, 1);
    };
    const senyum = () => {
      kotak(ctx, M, e0, hy + 5, 1, 1);
      kotak(ctx, M, e1, hy + 5, 1, 1);
      kotak(ctx, M, e0 + 1, hy + 6, lebarMulut, 1);
    };
    const cemberut = () => {
      kotak(ctx, M, e0 + 1, hy + 5, lebarMulut, 1);
      kotak(ctx, M, e0, hy + 6, 1, 1);
      kotak(ctx, M, e1, hy + 6, 1, 1);
    };
    const alisMarah = () => {
      kotak(ctx, D, e0 - 1, ey - 1, 1, 1);
      kotak(ctx, D, e1 + 1, ey - 1, 1, 1);
    };
    const pipi = (warna) => {
      kotak(ctx, warna, x - 4, hy + 4, 1, 1);
      kotak(ctx, warna, x + 3, hy + 4, 1, 1);
    };
    const merem = (t + o.kedip) % 3500 < 130;
    if (o.aksesori === 'kacamata') kotak(ctx, '#111', e0 - 1, ey, e1 - e0 + 3, 1);
    switch (muka) {
      case 'senang':
        mataTitik();
        senyum();
        break;
      case 'tawa':
        mataGaris(-1);
        kotak(ctx, D, e0, hy + 5, e1 - e0 + 1, 2);
        kotak(ctx, '#e74c3c', e0 + 1, hy + 6, lebarMulut, 1);
        pipi('#f5a3a3');
        break;
      case 'marah':
        kotak(ctx, 'rgba(220,38,38,.28)', x - 4, hy, 8, 7);
        alisMarah();
        mataTitik();
        cemberut();
        pipi('#e74c3c');
        break;
      case 'teriak':
        kotak(ctx, 'rgba(220,38,38,.28)', x - 4, hy, 8, 7);
        alisMarah();
        mataTitik();
        kotak(ctx, D, e0, hy + 4, e1 - e0 + 1, 3);
        break;
      case 'sedih': {
        mataTitik();
        cemberut();
        const tetes = Math.floor(t / 160) % 3;
        kotak(ctx, '#5dade2', e0, ey + 1 + tetes, 1, 1);
        break;
      }
      case 'kaget':
        kotak(ctx, D, e0, ey - 1, 1, 2);
        kotak(ctx, D, e1, ey - 1, 1, 2);
        kotak(ctx, D, e0 + 1, hy + 5, lebarMulut, 2);
        break;
      case 'sebel':
        mataGaris();
        kotak(ctx, M, e0 + 1, hy + 5, lebarMulut + 1, 1);
        break;
      case 'tidur':
        mataGaris();
        kotak(ctx, M, e0 + 1, hy + 5, 1, 1);
        break;
      case 'mikir':
        kotak(ctx, D, e0 + 1, ey - 1, 1, 1);
        kotak(ctx, D, e1 + (o.arah === 'kiri' ? 0 : 1), ey - 1, 1, 1);
        kotak(ctx, M, e1, hy + 5, 1, 1);
        break;
      case 'licik':
        mataGaris();
        kotak(ctx, M, e0 + 1, hy + 5, lebarMulut, 1);
        kotak(ctx, M, e1, hy + 4, 1, 1);
        break;
      case 'cinta':
        kotak(ctx, '#e74c3c', e0, ey, 1, 1);
        kotak(ctx, '#e74c3c', e1, ey, 1, 1);
        senyum();
        pipi('#f5a3a3');
        break;
      case 'pusing': {
        const f = Math.floor(t / 100) % 2;
        kotak(ctx, D, e0 + f, ey, 1, 1);
        kotak(ctx, D, e1 - f, ey, 1, 1);
        kotak(ctx, M, e0 + 1, hy + 5, lebarMulut, 1);
        break;
      }
      case 'keringat':
        mataTitik();
        kotak(ctx, M, e0 + 1, hy + 5, lebarMulut, 1);
        kotak(ctx, '#5dade2', o.arah === 'kanan' ? x - 5 : x + 4, hy + 1 + (Math.floor(t / 200) % 3), 1, 2);
        break;
      case 'fokus':
        mataTitik();
        kotak(ctx, M, e0 + 1, hy + 5, lebarMulut, 1);
        break;
      default:
        if (!merem) mataTitik();
        if (o.ngomong && Math.floor(t / 150) % 2) kotak(ctx, M, e0 + 1, hy + 5, 2, 1);
    }
    if (muka && muka !== 'teriak' && muka !== 'tawa' && o.ngomong && Math.floor(t / 150) % 2) kotak(ctx, D, e0 + 1, hy + 5, lebarMulut, 1);
  }

  // Efek di atas kepala yang tetap keliatan walau karakternya hadap belakang: "Z" pas tidur, bintang muter pas pusing.
  function gambarEfekKepala(x, hy, t, muka) {
    if (muka === 'tidur') {
      const naik = Math.floor(t / 250) % 6;
      const zx = x + 5 + (naik % 2);
      const zy = hy - 2 - naik;
      kotak(ctx, '#fff', zx, zy, 3, 1);
      kotak(ctx, '#fff', zx + 1, zy + 1, 1, 1);
      kotak(ctx, '#fff', zx, zy + 2, 3, 1);
    } else if (muka === 'pusing') {
      for (let i = 0; i < 3; i++) {
        const s = t / 180 + (i * Math.PI * 2) / 3;
        kotak(ctx, '#FACC15', Math.round(x + Math.cos(s) * 6) - 1, Math.round(hy - 2 + Math.sin(s) * 2), 2, 2);
      }
    }
  }

  function gambarPegangan(o, x, by, t) {
    const hx = o.arah === 'kanan' ? x + 4 : o.arah === 'kiri' ? x - 6 : x + 4;
    const hy = by + 2;
    if (o.pegang === 'kopi') {
      kotak(ctx, '#fff', hx, hy, 3, 3);
      kotak(ctx, '#6b4428', hx, hy, 3, 1);
      if (Math.floor(t / 300) % 2) kotak(ctx, 'rgba(255,255,255,.7)', hx + 1, hy - 2, 1, 1);
    } else if (o.pegang === 'hp') {
      kotak(ctx, '#222', hx, hy - 1, 2, 4);
      kotak(ctx, '#58a6ff', hx, hy, 2, 2);
    } else if (o.pegang === 'dokumen') {
      kotak(ctx, '#fff', hx - 1, hy - 1, 4, 5);
      kotak(ctx, '#999', hx, hy, 2, 1);
      kotak(ctx, '#999', hx, hy + 2, 2, 1);
    } else if (o.pegang === 'buku') {
      kotak(ctx, '#c0392b', hx - 1, hy, 4, 3);
      kotak(ctx, '#fff', hx, hy, 2, 3);
    } else if (o.pegang === 'makan') {
      kotak(ctx, '#fff', hx - 1, hy + 1, 4, 2);
      kotak(ctx, '#f1c40f', hx - 1, hy, 4, 1);
    }
  }

  function gambarOrang(o, t) {
    if (o.sembunyi) return;
    const marah = o.marahSampai > performance.now();
    const x = Math.round(o.x) + (marah ? (Math.floor(t / 60) % 2 ? 1 : -1) : 0);
    const y = Math.round(o.y);
    const duduk = o.keadaan === 'duduk';
    const jalan = o.keadaan === 'jalan';
    const langkah = jalan ? Math.floor(t / 140) % 2 : 0;
    kotak(ctx, 'rgba(0,0,0,.25)', x - 5, y - 1, 10, 2);
    if (duduk) kotak(ctx, '#3b3b4f', x - 5, y - 5, 10, 3);
    else {
      kotak(ctx, '#2d3142', x - 3, y - 4, 2, langkah ? 3 : 4);
      kotak(ctx, '#2d3142', x + 1, y - 4, 2, langkah ? 4 : 3);
    }
    const by = duduk ? y - 11 : y - 10;
    const adaReaksi = o.reaksiSampai > performance.now();
    const muka = adaReaksi ? o.ekspresi : marah ? 'marah' : null;
    const gaya = adaReaksi ? o.gaya : null;
    kotak(ctx, o.warna, x - 4, by, 8, 6);
    if (o.aksesori === 'dasi' && o.arah !== 'atas') kotak(ctx, '#c0392b', x, by + 1, 1, 4);
    if (gaya === 'angkat' || gaya === 'lambai') {
      const goyang = Math.floor(t / 150) % 2;
      kotak(ctx, o.warna, x + 4, by - 4, 1, 5);
      kotak(ctx, o.kulit, x + 4 + (gaya === 'lambai' ? goyang : 0), by - 5, 1, 1);
      if (gaya === 'angkat') {
        kotak(ctx, o.warna, x - 5, by - 4, 1, 5);
        kotak(ctx, o.kulit, x - 5, by - 5 - goyang, 1, 1);
      } else {
        kotak(ctx, o.warna, x - 5, by + 1, 1, 4);
        kotak(ctx, o.kulit, x - 5, by + 5, 1, 1);
      }
    } else if (duduk && (o.kerja || o.mainPS)) {
      const k = Math.floor(t / (o.mainPS ? 70 : 110)) % 2;
      kotak(ctx, o.warna, x - 5, by, 1, 3);
      kotak(ctx, o.warna, x + 4, by, 1, 3);
      kotak(ctx, o.kulit, x - 5, by - 1 - k, 1, 1);
      kotak(ctx, o.kulit, x + 4, by - 2 + k, 1, 1);
    } else {
      const ayun = jalan ? (langkah ? 1 : -1) : 0;
      kotak(ctx, o.warna, x - 5, by + 1 + ayun, 1, 4);
      kotak(ctx, o.warna, x + 4, by + 1 - ayun, 1, 4);
      kotak(ctx, o.kulit, x - 5, by + 5 + ayun, 1, 1);
      kotak(ctx, o.kulit, x + 4, by + 5 - ayun, 1, 1);
    }
    if (o.bawa) {
      kotak(ctx, '#fff', x - 3, by + 2, 6, 5);
      kotak(ctx, '#999', x - 2, by + 3, 4, 1);
      kotak(ctx, '#999', x - 2, by + 5, 3, 1);
    }
    if (adaReaksi && o.pegang && !o.bawa) gambarPegangan(o, x, by, t);
    const hy = by - 7 + ((o.kerja && Math.floor(t / 400) % 2) || (gaya === 'goyang' && Math.floor(t / 180) % 2) ? 1 : 0);
    kotak(ctx, o.kulit, x - 4, hy, 8, 7);
    if (o.arah === 'atas') kotak(ctx, o.rambut, x - 4, hy - 1, 8, 7);
    else {
      kotak(ctx, o.rambut, x - 4, hy - 1, 8, 3);
      if (o.arah === 'kiri') kotak(ctx, o.rambut, x + 2, hy, 2, 4);
      else if (o.arah === 'kanan') kotak(ctx, o.rambut, x - 4, hy, 2, 4);
      else {
        kotak(ctx, o.rambut, x - 4, hy, 1, 3);
        kotak(ctx, o.rambut, x + 3, hy, 1, 3);
      }
    }
    if (o.aksesori === 'rambutPanjang') {
      kotak(ctx, o.rambut, x - 5, hy, 1, 8);
      kotak(ctx, o.rambut, x + 4, hy, 1, 8);
    }
    if (o.aksesori === 'headphone') {
      kotak(ctx, '#222', x - 4, hy - 2, 8, 1);
      kotak(ctx, '#e74c3c', x - 5, hy + 1, 1, 3);
      kotak(ctx, '#e74c3c', x + 4, hy + 1, 1, 3);
    }
    if (o.arah !== 'atas') gambarMuka(o, x, hy, t, muka);
    gambarEfekKepala(x, hy, t, muka);
    if (marah) {
      const naik = Math.floor(t / 120) % 4;
      kotak(ctx, 'rgba(255,255,255,.85)', x - 6, hy - 2 - naik, 2, 2);
      kotak(ctx, 'rgba(255,255,255,.85)', x + 5, hy - 3 - ((naik + 2) % 4), 2, 2);
    }
    if (duduk && !o.diBeanbag) kotak(ctx, '#4b4b63', x - 5, y - 8, 10, 4);
  }

  const ps = { nyala: false, pemain: [] };
  function gambarPS(t) {
    const { x, y } = PS_TV;
    kotak(ctx, '#6b4428', x - 22, y - 7, 44, 1);
    kotak(ctx, '#4a2e1a', x - 22, y - 6, 44, 6);
    kotak(ctx, '#111', x - 18, y - 26, 36, 19);
    kotak(ctx, '#333', x - 3, y - 7, 6, 1);
    if (ps.nyala) {
      const s = Math.floor(t / 120);
      kotak(ctx, ['#1d4ed8', '#16a34a', '#dc2626', '#9333ea'][Math.floor(s / 6) % 4], x - 16, y - 24, 32, 15);
      for (let i = 0; i < 4; i++) kotak(ctx, 'rgba(255,255,255,.85)', x - 16 + ((s * 5 + i * 9) % 29), y - 23 + ((s * 3 + i * 7) % 12), 3, 2);
    } else {
      kotak(ctx, '#1e293b', x - 16, y - 24, 32, 15);
      kotak(ctx, 'rgba(255,255,255,.15)', x - 14, y - 22, 6, 2);
    }
    kotak(ctx, '#e5e7eb', x + 8, y - 5, 10, 4);
    kotak(ctx, ps.nyala ? '#3b82f6' : '#64748b', x + 9, y - 4, 1, 1);
  }

  // Awan debu ala kartun waktu dua karakter "berantem": gumpalan abu-abu, bintang, dan tangan/kaki yang nongol.
  let awan = null;
  function gambarAwan(t) {
    if (!awan || performance.now() > awan.sampai) return;
    const f = Math.floor(t / 90);
    const { x, y, kulit } = awan;
    for (let i = 0; i < 9; i++) {
      const s = (f * 7 + i * 13) % 11;
      const ox = Math.round(Math.cos(i * 0.7 + f * 0.9) * (6 + (s % 5)));
      const oy = Math.round(Math.sin(i * 1.1 + f * 0.7) * (4 + (s % 3)));
      const u = 6 + (s % 4);
      kotak(ctx, i % 3 ? '#d4d4d8' : '#a1a1aa', x + ox - u / 2, y + oy - 10 - u / 2, u, u);
    }
    for (let i = 0; i < 3; i++) {
      const s = (f + i * 5) % 8;
      const sx = x - 12 + ((s * 7 + i * 9) % 24);
      const sy = y - 22 + ((s * 5 + i * 3) % 10);
      kotak(ctx, '#FACC15', sx, sy - 1, 1, 3);
      kotak(ctx, '#FACC15', sx - 1, sy, 3, 1);
    }
    const a = f % 4;
    kotak(ctx, kulit[0], x - 12 - (a === 0 ? 2 : 0), y - 12, 4, 2);
    kotak(ctx, kulit[1], x + 9 + (a === 2 ? 2 : 0), y - 8, 4, 2);
    if (a % 2) kotak(ctx, '#2d3142', x - 3, y - 2, 2, 4);
    else kotak(ctx, '#2d3142', x + 2, y - 3, 2, 4);
  }

  // Gerak pakai interval (tetap jalan walau tab di belakang, cuma lebih jarang); gambar cuma kalau canvas lagi tampil.
  let tLalu = performance.now();
  const detakGerak = setInterval(() => {
    const t = performance.now();
    const dt = Math.min(1, (t - tLalu) / 1000);
    tLalu = t;
    semua().forEach((o) => o.gerak(dt));
  }, 40);
  function bingkai(t) {
    if (mati) return;
    if (elemen.isConnected) {
      ctx.drawImage(latar, 0, 0);
      const antre = [{ y: PS_TV.y, f: () => gambarPS(t) }];
      for (const o of semua()) {
        antre.push({ y: o.meja.y, f: () => gambarMeja(o, t) });
        antre.push({ y: o.y + 0.5, f: () => gambarOrang(o, t) });
      }
      antre.sort((a, b) => a.y - b.y).forEach((i) => i.f());
      gambarAwan(t);
      semua().forEach((o) => o.tempatkan());
    }
    raf = requestAnimationFrame(bingkai);
  }

  const dataKantor = () => (setelan.fakta ? ` Data asli Konsulin saat ini (kalau ngomongin angka, pakai ini persis): ${ringkasFakta(setelan.fakta)}.` : '');
  function situasi() {
    if (!dunia.jalan) return (dunia.kejadian?.jenis === 'final' ? 'Tim barusan selesai ngerjain tugas dari Bos, sekarang lagi santai.' : 'Lagi santai, belum ada tugas dari Bos.') + dataKantor();
    let s = `Tim lagi ngerjain tugas dari Bos: "${dunia.tugas.slice(0, 150)}".`;
    if (dunia.kerja) s += ` Yang lagi sibuk kerja sekarang: ${orang[dunia.kerja].nama}.`;
    if (dunia.kejadian) s += ` Kejadian terakhir: ${ARTI_KEJADIAN[dunia.kejadian.jenis]}`;
    return s + dataKantor();
  }

  let gosipSibuk = false;
  let gosipTerakhir = 0;
  async function ambilObrolan(a, b) {
    // Gosip AI cuma waktu halaman Kantor lagi dilihat, biar nggak ngabisin jatah token tim di belakang layar.
    const dilihat = setelan.terlihat && document.visibilityState === 'visible';
    if (setelan.ai && setelan.gosipAi && dilihat && !gosipSibuk && performance.now() - gosipTerakhir > 120000) {
      gosipSibuk = true;
      gosipTerakhir = performance.now();
      a.emote('halo', 2500);
      try {
        const baris = await setelan.ai.gosip(a.id, b.id, situasi(), terakhir.slice(-6));
        if (baris?.length) return baris.map((l) => ({ siapa: l.who === 'B' ? b : a, teks: l.text }));
      } catch {
        // jatah/limit/model gratis lagi penuh: pakai dialog bawaan
      } finally {
        gosipSibuk = false;
      }
    }
    return obrolanBawaan(a, b);
  }

  function obrolanBawaan(a, b) {
    // Separuh obrolan santai jadi obrolan kerjaan soal angka asli Konsulin (kalau datanya udah kemuat).
    if (setelan.fakta && Math.random() < 0.5) {
      const d = obrolanData(a, b, setelan.fakta);
      if (d) return d.map((l) => ({ siapa: l.siapa === 'a' ? a : b, teks: l.teks, muka: l.muka }));
    }
    const lain = semua().filter((o) => o !== a && o !== b);
    const w = dunia.kerja && orang[dunia.kerja];
    const sasaran = w && w !== a && w !== b ? w : pilih(lain);
    const ev = dunia.kejadian;
    const r = Math.random();
    let pembuka;
    if (ev && r < 0.35 && ![ev.dari, ev.ke].includes(a.id) && ![ev.dari, ev.ke].includes(b.id)) {
      pembuka = isi(pilih(GOSIP_KEJADIAN[ev.jenis]), { c: orang[ev.jenis === 'revise' ? ev.ke : ev.dari].nama });
    } else if (w && w !== a && w !== b && r < 0.55) pembuka = isi(pilih(SOAL_YANG_KERJA), { c: w.nama });
    else pembuka = isi(pilih(ucapan(a, 'gosip')), { b: b.nama, c: sasaran.nama });
    const baris = [{ siapa: a, teks: pembuka }, { siapa: b, teks: pilih(ucapan(b, 'balas')) }];
    if (Math.random() < 0.65) baris.push({ siapa: a, teks: pilih(ucapan(a, 'lanjut')) });
    if (Math.random() < 0.4) baris.push({ siapa: b, teks: pilih(ucapan(b, 'balas')) });
    const penutup = pilih([a, b]);
    if (Math.random() < 0.6) baris.push({ siapa: penutup, teks: pilih(ucapan(penutup, 'penutup')) });
    return baris;
  }

  // Kehidupan kantor: karakter yang lagi nggak dipakai kerja milih kegiatan sendiri. Tiap kegiatan pegang "tok";
  // kalau karakternya dipanggil kerja (tok diganti), kegiatannya berhenti sendiri.
  const bebas = (o) => !o.sibuk && !o.nongkrong;
  const ambilSantai = (o) => {
    o.nongkrong = true;
    o.tok = {};
    return o.tok;
  };
  const lepasSantai = (o, tok) => {
    if (o.tok !== tok) return;
    o.nongkrong = false;
    o.santaiLagi = performance.now() + 3000 + Math.random() * 6000;
    kegiatan(o, o.keadaan === 'duduk' ? 'Di meja' : 'Nongkrong');
  };
  const ambilKerja = (o) => {
    const tadinyaPergi = o.nongkrong || o.keadaan !== 'duduk';
    Object.assign(o, { sibuk: true, nongkrong: false, tok: {} });
    o.berhenti();
    return tadinyaPergi;
  };
  const lepasKerja = (o) => {
    o.sibuk = false;
    o.santaiLagi = performance.now() + 2500 + Math.random() * 4000;
    kegiatan(o, 'Di meja');
  };
  const pulang = (o) => o.jalanKe(o.kursi.x, o.kursi.y, true);

  async function diMeja(o) {
    if (!(await pulang(o))) return;
    const r = Math.random();
    const santaiDiMeja = pilih([['hp', 'Main HP'], ['musik', 'Dengerin musik'], ['tidur', 'Ketiduran'], ['makan', 'Ngemil'], ['buku', 'Baca-baca']]);
    kegiatan(o, r < 0.4 ? santaiDiMeja[1] : 'Di meja');
    if (r < 0.4) o.emote(santaiDiMeja[0], 3500);
    else if (r < 0.75) await o.bilang(pilih(ucapan(o, 'sendiri')));
    await tunggu(3000 + Math.random() * 4000);
  }
  async function ngopi(o, masih) {
    kegiatan(o, 'Ngopi di pantry');
    if (!(await o.jalanKe(acak(30, 50), 48))) return;
    o.arah = 'atas';
    await tunggu(800);
    if (!masih()) return;
    o.emote('kopi', 3000);
    if (Math.random() < 0.6) await o.bilang(pilih(ucapan(o, 'kopi')));
    else await tunggu(2500);
    if (masih()) await pulang(o);
  }
  async function jalanJalan(o) {
    const p = pilih(TEMPAT);
    kegiatan(o, 'Keliling kantor');
    if (!(await o.jalanKe(batasX(p.x + acak(-8, 8)), p.y + acak(-3, 3)))) return;
    o.arah = p.arah || 'bawah';
    o.emote(pilih(['musik', 'ide', 'tanya', 'hp', 'mata', 'jam']), 2500);
    await tunggu(2500 + Math.random() * 3000);
  }
  async function pegel(o) {
    kegiatan(o, 'Peregangan');
    o.emote('pegel', 2500);
    if (Math.random() < 0.6) await o.bilang(pilih(ucapan(o, 'pegel')));
    else await tunggu(2000);
  }
  async function kepoin(o, masih) {
    const w = dunia.kerja && orang[dunia.kerja];
    if (!w || w === o) return ngobrol(o, masih);
    const sisi = o.x < w.x ? -1 : 1;
    kegiatan(o, `Kepoin ${w.nama}`);
    if (!(await o.jalanKe(batasX(w.kursi.x + sisi * 18), w.kursi.y))) return;
    o.arah = sisi < 0 ? 'kanan' : 'kiri';
    o.emote('mata', 1500);
    await o.bilang(isi(pilih(ucapan(o, 'kepo')), { c: w.nama }));
    if (!masih()) return;
    if (Math.random() < 0.65) await w.bilang(pilih(ucapan(w, 'jawabKepo')));
    else w.emote('sebel', 1800);
    if (masih()) {
      await tunggu(500);
      await pulang(o);
    }
  }
  function nguping(a, b) {
    const calon = semua().filter((o) => o !== a && o !== b && bebas(o));
    if (!calon.length) return;
    const e = pilih(calon);
    if (Math.random() < 0.5) e.bilang(pilih(['Ngomongin apa tuh? Ikutan dong', 'Gw denger loh', 'Gosip mulu kalian', 'Ehem. Ada yang nyebut nama gw?']));
    else e.emote('mata', 2000);
  }
  async function ngobrol(a, masih) {
    const calon = semua().filter((o) => o !== a && bebas(o));
    if (!calon.length) return diMeja(a, masih);
    const b = pilih(calon);
    const tb = ambilSantai(b);
    const hidup = () => masih() && b.tok === tb;
    kegiatan(a, `Ngobrol sama ${b.nama}`);
    kegiatan(b, `Ngobrol sama ${a.nama}`);
    try {
      a.emote('halo', 1200);
      if (Math.random() < 0.5) {
        await Promise.all([a.jalanKe(150, 117), b.jalanKe(170, 117)]);
        a.arah = 'kanan';
        b.arah = 'kiri';
      } else {
        const sisi = a.x < b.x ? -1 : 1;
        await a.jalanKe(batasX(b.x + sisi * 16), b.y);
        a.arah = sisi < 0 ? 'kanan' : 'kiri';
        if (b.keadaan !== 'duduk') b.arah = sisi < 0 ? 'kiri' : 'kanan';
      }
      if (!hidup()) {
        if (masih()) a.bilang(pilih(ucapan(a, 'ditinggal')));
        return;
      }
      for (const l of await ambilObrolan(a, b)) {
        if (!hidup()) break;
        if (l.muka) {
          l.siapa.emote(l.muka, 3000);
          if (l.muka === 'marah') l.siapa.marahSampai = performance.now() + 2500;
        }
        await l.siapa.bilang(l.teks);
        await tunggu(200);
      }
      if (!hidup()) {
        if (masih()) a.bilang(pilih(ucapan(a, 'ditinggal')));
        return;
      }
      if (Math.random() < 0.3) nguping(a, b);
      a.emote(pilih(['tawa', 'bisik', 'mata', 'ide']), 1500);
      b.emote(pilih(['tawa', 'kaget', 'sebel', 'tanya']), 1500);
      await tunggu(800);
    } finally {
      if (b.tok === tb) pulang(b).then(() => lepasSantai(b, tb));
    }
    if (masih() && Math.random() < 0.6) await pulang(a);
  }

  // Adegan ribut: pasangan yang emang sering bentrok (lihat RIBUT) adu mulut sambil gemeteran kesel, kadang sampe jadi
  // awan debu kartun, lalu ada yang misahin (Bos/Planner duluan) dan dua-duanya pulang ngambek.
  function penontonRibut(a, b) {
    const calon = semua().filter((o) => o !== a && o !== b && bebas(o));
    calon.forEach((o) => o.emote('kaget', 2000));
    if (calon.length) {
      const o = pilih(calon);
      o.bilang(Math.random() < 0.5 ? pilih(TERIAK_RIBUT) : pilih(ucapan(o, 'nonton')));
    }
  }
  function pilihPenengah(a, b) {
    const calon = semua().filter((o) => o !== a && o !== b && bebas(o));
    return calon.find((o) => o.id === 'bos') || calon.find((o) => o.id === 'planner') || pilih(calon) || null;
  }
  async function ribut(a, masih) {
    const naskah = RIBUT.filter((n) => n.a === a.id && bebas(orang[n.b]));
    if (!naskah.length) return ngobrol(a, masih);
    const n = pilih(naskah);
    const b = orang[n.b];
    const tb = ambilSantai(b);
    const hidup = () => masih() && b.tok === tb;
    const panas = (ms = 4500) => (a.marahSampai = b.marahSampai = performance.now() + ms);
    try {
      kegiatan(a, `Nyamperin ${b.nama}`);
      a.emote('sebel', 1500);
      const sisi = a.x < b.x ? -1 : 1;
      if (!(await a.jalanKe(batasX(b.x + sisi * 14), b.y)) || !hidup()) return;
      if (b.keadaan === 'duduk') b.keadaan = 'berdiri';
      a.arah = sisi < 0 ? 'kanan' : 'kiri';
      b.arah = sisi < 0 ? 'kiri' : 'kanan';
      kegiatan(a, `Ribut sama ${b.nama}`);
      kegiatan(b, `Ribut sama ${a.nama}`);
      for (const [i, [siapa, teks]] of n.baris.entries()) {
        if (!hidup()) break;
        const o = siapa === 'a' ? a : b;
        if (i >= 2) {
          panas();
          o.emote(i === 2 ? 'marah' : pilih(['marah', 'petir', 'sebel']), 2000);
        }
        await o.bilang(teks, Math.min(4000, 1300 + teks.length * 40));
        if (i === 2) penontonRibut(a, b);
      }
      if (!hidup()) return;
      const tengah = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (Math.random() < 0.55) {
        a.sembunyi = b.sembunyi = true;
        awan = { ...tengah, sampai: performance.now() + 3200, kulit: [a.kulit, b.kulit] };
        await tunggu(3200);
        a.sembunyi = b.sembunyi = false;
        a.x = batasX(tengah.x + sisi * 10);
        b.x = batasX(tengah.x - sisi * 10);
        a.emote('keringat', 2000);
        b.emote('bintang', 2000);
      }
      const penengah = pilihPenengah(a, b);
      if (penengah) {
        const tp = ambilSantai(penengah);
        try {
          kegiatan(penengah, `Misahin ${a.nama} sama ${b.nama}`);
          penengah.emote('seru', 1500);
          if (await penengah.jalanKe(batasX(tengah.x), Math.min(T.H - 6, tengah.y + 12))) {
            penengah.arah = 'atas';
            await penengah.bilang(pilih(ucapan(penengah, 'lerai')));
          }
        } finally {
          if (penengah.tok === tp) pulang(penengah).then(() => lepasSantai(penengah, tp));
        }
      }
      if (!hidup()) return;
      a.marahSampai = b.marahSampai = 0;
      kegiatan(a, 'Ngambek');
      kegiatan(b, 'Ngambek');
      a.emote('sedih', 2500);
      await a.bilang(pilih(ucapan(a, 'ngambek')));
      b.emote('sebel', 2500);
      if (Math.random() < 0.6) await b.bilang(pilih(ucapan(b, 'ngambek')));
    } finally {
      a.sembunyi = b.sembunyi = false;
      a.marahSampai = b.marahSampai = 0;
      awan = null;
      if (b.tok === tb) pulang(b).then(() => lepasSantai(b, tb));
    }
    if (masih()) await pulang(a);
  }

  // Main PS di pojok: sendirian atau ngajak satu temen, trash talk sesuai sifat, lalu ada yang menang & yang ngambek.
  async function mainPS(a, masih) {
    if (ps.pemain.length) return diMeja(a, masih);
    const calon = semua().filter((o) => o !== a && bebas(o));
    const b = calon.length && Math.random() < 0.6 ? pilih(calon) : null;
    const tb = b ? ambilSantai(b) : null;
    const hidup = () => masih() && (!b || b.tok === tb);
    const keBeanbag = async (o, i) => {
      if (!(await o.jalanKe(BEANBAG[i].x, BEANBAG[i].y))) return false;
      Object.assign(o, { keadaan: 'duduk', arah: 'atas', diBeanbag: true, mainPS: true });
      return true;
    };
    ps.pemain = b ? [a, b] : [a];
    try {
      if (b) {
        kegiatan(a, `Main PS sama ${b.nama}`);
        kegiatan(b, `Main PS sama ${a.nama}`);
        a.emote('halo', 1500);
        await a.bilang(isi(pilih(PS[a.id].ajak), { b: b.nama }));
        if (!hidup()) return;
        b.emote('senang', 1500);
      } else kegiatan(a, 'Main PS sendirian');
      const [okA, okB] = await Promise.all([keBeanbag(a, 0), b ? keBeanbag(b, 1) : true]);
      if (!okA || !okB || !hidup()) return;
      ps.nyala = true;
      const ronde = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < ronde && hidup(); i++) {
        await tunggu(1500 + Math.random() * 1500);
        if (!hidup()) break;
        const o = b ? pilih([a, b]) : a;
        o.emote(pilih(['kaget', 'senang', 'marah', 'mikir']), 1500);
        await o.bilang(pilih(b ? PS[o.id].main : [...PS[o.id].main, ...PS[o.id].sendiri]));
      }
      if (!hidup()) {
        if (b && masih()) a.bilang('Yah, ditinggal pas lagi seru');
        else if (b && b.tok === tb) b.bilang('Yah, ditinggal pas lagi seru');
        return;
      }
      if (b) {
        const [menang, kalah] = Math.random() < 0.5 ? [a, b] : [b, a];
        menang.emote('pesta', 2500);
        await menang.bilang(pilih(PS[menang.id].menang));
        kalah.emote(pilih(['marah', 'sedih']), 2500);
        kalah.marahSampai = performance.now() + 2000;
        await kalah.bilang(pilih(PS[kalah.id].kalah));
      } else {
        a.emote(Math.random() < 0.5 ? 'pesta' : 'sedih', 2000);
        await tunggu(1500);
      }
    } finally {
      ps.nyala = false;
      ps.pemain = [];
      a.mainPS = false;
      if (b) b.mainPS = false;
      if (b && b.tok === tb) pulang(b).then(() => lepasSantai(b, tb));
    }
    if (masih()) await pulang(a);
  }

  const KEGIATAN = [[26, ngobrol], [12, ngopi], [10, jalanJalan], [20, diMeja], [10, kepoin], [6, pegel], [8, ribut], [8, mainPS]];
  async function santai(o) {
    const tok = ambilSantai(o);
    try {
      await pilihBerbobot(KEGIATAN)(o, () => o.tok === tok);
    } finally {
      lepasSantai(o, tok);
    }
  }
  const detak = setInterval(() => {
    const kini = performance.now();
    for (const o of semua()) {
      if (!bebas(o) || kini < o.santaiLagi) continue;
      o.santaiLagi = Infinity;
      santai(o).catch(() => {});
    }
  }, 500);

  // Mode demo (tanpa GROQ_API_KEY): contoh laporan analisa pakai angka ringkasan asli kalau udah kemuat.
  function jawabDemo(id, tugas) {
    const f = setelan.fakta || {};
    const ada = (v) => v != null;
    const room = ROOM.find((r) => r.karakter === id);
    if (room) {
      const angka = angkaRoom(room.id, setelan.fakta);
      return `## ${room.nama}\nAngka kunci (ringkasan dashboard):\n${angka.map(([k, v]) => `- ${k}: ${v}`).join('\n') || '- data belum kemuat'}\n\nMode demo: analisa room lengkap butuh AI aktif.`;
    }
    if (id === 'planner') return `Pertanyaan analisa buat: "${tugas.slice(0, 80)}"\n1. Berapa warung langganan, trial, dan trial habis?\n2. Gimana arus kas bulan ini?\n3. Gimana kondisi pipeline CRM?\n4. Gimana funnel rekrutmen Sales Partner?\n5. Apa 3 tindakan paling penting minggu ini?`;
    if (id === 'researcher') return `Data yang kebaca (ringkasan dashboard):\n- ${ringkasFakta(setelan.fakta) || 'data belum kemuat'}`;
    if (id === 'coder') {
      const baris = [
        ada(f.warungLangganan) && `| Warung langganan | ${f.warungLangganan} |`,
        ada(f.warungTrial) && `| Warung trial | ${f.warungTrial} |`,
        ada(f.warungTrialHabis) && `| Trial habis belum bayar | ${f.warungTrialHabis} |`,
        ada(f.pemasukanBulanIni) && `| Pemasukan bulan ini | ${rupiahPendek(f.pemasukanBulanIni)} |`,
        ada(f.pengeluaranBulanIni) && `| Pengeluaran bulan ini | ${rupiahPendek(f.pengeluaranBulanIni)} |`,
        ada(f.leadAktif) && `| Lead CRM jalan | ${f.leadAktif} (stuck ${f.leadStuck}) |`,
        ada(f.pelamarAktif) && `| Pelamar diproses | ${f.pelamarAktif} |`,
      ].filter(Boolean);
      return `| Indikator | Nilai |\n|---|---|\n${baris.join('\n') || '| Data | belum kemuat |'}${putaranReview ? '\n\nUdah ditambah selisih kas: ' + (ada(f.pemasukanBulanIni) ? rupiahPendek(f.pemasukanBulanIni - f.pengeluaranBulanIni) : '-') : ''}`;
    }
    if (id === 'reviewer') return putaranReview++ === 0 ? 'REVISE\n- Selisih pemasukan dan pengeluaran belum dihitung' : 'APPROVED\n- Angka cocok sama ringkasan dashboard';
    const angka = jawabDemo('coder', tugas);
    return `# Laporan analisa Konsulin\n\n## Ringkasan eksekutif\nIni contoh laporan dari mode demo, disusun dari ringkasan dashboard Makalin. Analisa mendalam per data butuh AI aktif.\n\n## Angka kunci\n${angka}\n\n## Temuan\n- ${ada(f.warungLangganan) ? `Baru ${f.warungLangganan} warung yang langganan.` : 'Data warung belum kemuat.'}\n- ${ada(f.leadStuck) ? `${f.leadStuck} lead CRM nyangkut di tahap stuck.` : 'Data CRM belum kemuat.'}\n\n## Rekomendasi\n1. Follow-up warung yang trial-nya habis.\n2. Tindak lanjuti lead yang stuck minggu ini.\n\n## Catatan data\nMode demo: belum dianalisa AI. Isi GROQ_API_KEY buat laporan lengkap.`;
  }

  // room: id room kalau yang kerja analis room divisi (datanya dibaca server lewat /ai/kantor/room/:id);
  // langsung: Bos nanya langsung ke room itu (langkah pertama tugas, dihitung jatah harian).
  async function kerjakan(id, prompt, judul = JUDUL_LANGKAH[id], { room = null, langsung = false } = {}) {
    const o = orang[id];
    const tadinyaPergi = ambilKerja(o);
    if (jarak(o, o.kursi) > 1) {
      kegiatan(o, 'Dipanggil kerja');
      if (tadinyaPergi) o.bilang(pilih(ucapan(o, 'dipanggil')));
      await pulang(o);
    }
    Object.assign(o, { keadaan: 'duduk', arah: 'atas', kerja: true });
    dunia.kerja = id;
    ubahAgen(id, { st: 'kerja', kegiatan: `Ngerjain: ${judul}` });
    ubah(() => ({ tahap: `${o.nama}: ${judul}`, roomKerja: room }));
    const mulai = Date.now();
    let hasil;
    let dibaca = [];
    try {
      if (setelan.ai) {
        const r = room ? await setelan.ai.room(room, prompt, langsung) : await setelan.ai.kerja(id, prompt);
        hasil = r.teks;
        dibaca = r.dibaca || [];
        if (dibaca.length) {
          o.emote('data', 2500);
          o.bilang(`Udah gw cek ke ${dibaca.length} data asli`);
        }
      } else {
        await tunggu(2500 + Math.random() * 2500);
        hasil = jawabDemo(id, dunia.tugas);
      }
    } finally {
      o.kerja = false;
      dunia.kerja = null;
      if (room) ubah(() => ({ roomKerja: null }));
    }
    const putusan = id === 'reviewer' ? (/^\s*APPROVED/i.test(hasil) ? 'APPROVED' : 'REVISE') : null;
    ubah((k) => ({
      agen: { ...k.agen, [id]: { ...k.agen[id], st: 'selesai', selesai: k.agen[id].selesai + 1, kegiatan: 'Beres, nyerahin hasil' } },
      langkah: [...k.langkah, { peran: id, judul, teks: hasil, dibaca, putusan, durasi: Math.round((Date.now() - mulai) / 1000), jam: jam() }],
    }));
    o.emote(putusan === 'REVISE' ? 'marah' : 'centang', 2000);
    return hasil;
  }

  // Yang ngasih jalan kaki bawa dokumen ke meja penerima, ngomong pas serah terima, lalu balik ke mejanya.
  async function serahkan(dari, ke, teks, jenis) {
    dunia.kejadian = { jenis, dari, ke };
    const a = orang[dari];
    const b = orang[ke];
    ambilKerja(a);
    kegiatan(a, `Nganter dokumen ke ${b.nama}`);
    a.bawa = true;
    const sisi = a.kursi.x <= b.kursi.x ? -1 : 1;
    await a.jalanKe(batasX(b.kursi.x + sisi * 18), b.kursi.y);
    a.arah = sisi < 0 ? 'kanan' : 'kiri';
    a.bawa = false;
    const kalimat = SERAH[jenis];
    a.emote('dokumen', 1800);
    await a.bilang(pilih(kalimat.kasih));
    if (jarak(b, b.kursi) < 20) {
      if (b.keadaan !== 'duduk') b.arah = sisi < 0 ? 'kiri' : 'kanan';
      if (jenis === 'revise') {
        b.emote('sebel', 2000);
        b.marahSampai = performance.now() + 2500;
      } else b.emote(jenis === 'final' ? 'bintang' : 'centang', 1800);
      await b.bilang(pilih(kalimat.terima));
    } else await a.bilang(isi(pilih(ucapan(a, 'gakAda')), { c: b.nama }));
    const penonton = PENONTON[jenis];
    const calon = semua().filter((o) => bebas(o) && o !== b);
    if (penonton && calon.length && Math.random() < 0.6) pilih(calon).bilang(pilih(penonton));
    const tok = a.tok;
    pulang(a).then(() => a.tok === tok && lepasKerja(a));
  }

  function rayakan() {
    semua().forEach((o, i) => setTimeout(() => o.emote(pilih(['pesta', 'bintang', 'hati', 'tawa']), 2500), i * 150));
    const calon = semua().filter((o) => o.id !== 'bos' && bebas(o));
    if (calon.length) {
      const o = pilih(calon);
      setTimeout(() => o.bilang(Math.random() < 0.4 ? pilih(['Traktir dong Bos!', 'Pulang cepet nggak nih hari ini?', 'Bos, janji traktirnya kapan?']) : pilih(ucapan(o, 'rayakan'))), 1500);
    }
  }

  // Alur sama kayak timKantor di server (prompt dari promptTim). room diisi = Bos nanya langsung satu room:
  // Bos -> analis room -> Writer -> Bos, cuma 2 panggilan AI.
  async function jalankan(tugas, { revisi = true, room: tanyaRoom = null } = {}) {
    if (dunia.jalan) throw new Error('Tim masih ngerjain tugas sebelumnya.');
    Object.assign(dunia, { jalan: true, tugas, kejadian: null });
    putaranReview = 0;
    try {
      let akhir;
      if (tanyaRoom) {
        const r = ROOM.find((x) => x.id === tanyaRoom);
        await serahkan('bos', r.karakter, tugas, 'tanyaRoom');
        const hasilRoom = await kerjakan(r.karakter, promptTim.room(tugas), r.nama, { room: r.id, langsung: true });
        await serahkan(r.karakter, 'writer', hasilRoom, 'room');
        akhir = await kerjakan('writer', promptTim.akhir(tugas, hasilRoom));
      } else {
        await serahkan('bos', 'planner', tugas, 'task');
        const rencana = await kerjakan('planner', promptTim.rencana(tugas));
        const hasilRoom = [];
        for (const id of pilihRoom(rencana, tugas)) {
          const r = ROOM.find((x) => x.id === id);
          await serahkan('planner', r.karakter, rencana, 'brief');
          const h = await kerjakan(r.karakter, promptTim.room(tugas, rencana), r.nama, { room: id });
          hasilRoom.push(h);
          await serahkan(r.karakter, 'researcher', h, 'room');
        }
        const room = hasilRoom.join('\n\n');
        const riset = await kerjakan('researcher', promptTim.riset(tugas, rencana, room));
        await serahkan('researcher', 'coder', riset, 'research');
        let kode = await kerjakan('coder', promptTim.kode(tugas, rencana, room, riset));
        let review;
        let putaran = 0;
        for (;;) {
          await serahkan('coder', 'reviewer', kode, 'code');
          review = await kerjakan('reviewer', promptTim.review(tugas, room, kode));
          if (/^\s*APPROVED/i.test(review) || !revisi || ++putaran >= 2) break;
          await serahkan('reviewer', 'coder', review, 'revise');
          kode = await kerjakan('coder', promptTim.revisi(tugas, kode, review), 'Revisi implementasi');
        }
        await serahkan('reviewer', 'writer', review, 'approved');
        akhir = await kerjakan('writer', promptTim.akhir(tugas, room, riset, kode, review));
      }
      ambilKerja(orang.bos);
      pulang(orang.bos);
      await serahkan('writer', 'bos', akhir, 'final');
      dunia.jalan = false;
      rayakan();
      return akhir;
    } finally {
      Object.assign(dunia, { jalan: false, kerja: null });
      for (const o of semua()) {
        o.kerja = false;
        o.bawa = false;
        if (o.sibuk) {
          const tok = o.tok;
          pulang(o).then(() => o.tok === tok && lepasKerja(o));
        }
      }
    }
  }

  // opsi: { revisi, template, judul, room } - template & judul dari tombol "Analisa siap pakai", room dari "Tanya room".
  async function kasihTugas(tugas, opsi = {}) {
    if (keadaan.jalan) return;
    ubah((k) => ({
      tugas,
      mode: opsi.room ? 'room' : 'tim',
      room: opsi.room || null,
      jalan: true,
      mulai: Date.now(),
      selesai: null,
      hasil: '',
      judul: '',
      template: opsi.template || (opsi.room ? `room-${opsi.room}` : null),
      laporanId: null,
      errorSimpan: '',
      error: '',
      tahap: 'Bos nganter tugas',
      langkah: [{ peran: 'bos', judul: 'Tugas dari Bos', teks: tugas, dibaca: [], putusan: null, durasi: null, jam: jam() }],
      agen: Object.fromEntries(Object.entries(k.agen).map(([id, a]) => [id, { ...a, st: 'santai', selesai: 0 }])),
    }));
    let akhir;
    try {
      akhir = await jalankan(tugas, opsi);
      const judul = (akhir.match(/^\s*#\s+(.+)$/m)?.[1] || opsi.judul || tugas).replace(/[*_`#]/g, '').trim().slice(0, 120);
      ubah(() => ({ hasil: akhir, judul, tahap: 'Selesai' }));
    } catch (e) {
      ubah(() => ({ error: e.message, tahap: 'Gagal' }));
    } finally {
      ubah(() => ({ jalan: false, selesai: Date.now() }));
    }
    if (!akhir || !setelan.simpanLaporan) return;
    const k = keadaan;
    try {
      const r = await setelan.simpanLaporan({
        judul: k.judul,
        tugas,
        template: k.template,
        hasil: akhir,
        langkah: k.langkah,
        meta: {
          durasi: Math.round((k.selesai - k.mulai) / 1000),
          dibaca: k.langkah.reduce((s, l) => s + (l.dibaca?.length || 0), 0),
          revisi: k.langkah.filter((l) => l.putusan === 'REVISE').length,
          demo: !setelan.ai,
        },
      });
      ubah((x) => ({ laporanId: r.id, versiRiwayat: x.versiRiwayat + 1 }));
    } catch (e) {
      ubah(() => ({ errorSimpan: `Laporan belum kesimpen ke riwayat: ${e.message}` }));
    }
  }

  for (const a of AGEN) orang[a.id] = new Orang(a, a.id === 'bos' ? namaBos : a.nama);
  const papan = Object.assign(document.createElement('div'), { className: 'kantor-papan', textContent: 'KONSULIN' });
  lapisan.append(papan);

  // Papan nama tiap room + satu angka live; nyala kedip waktu analisnya lagi kerja, ditandain waktu room dipilih.
  const papanRoom = Object.fromEntries(
    ROOM.map((r) => {
      const el = Object.assign(document.createElement('div'), { className: 'kantor-papan-room' });
      el.style.setProperty('--warna', AGEN.find((a) => a.id === r.karakter).warna);
      el.append(Object.assign(document.createElement('b'), { textContent: r.label }), document.createElement('span'));
      el.addEventListener('click', () => ubah(() => ({ roomDipilih: r.id })));
      lapisan.append(el);
      return [r.id, el];
    })
  );
  let papanTerakhir = '';
  function sinkronPapan() {
    const kunci = JSON.stringify([keadaan.fakta, keadaan.roomKerja, keadaan.roomDipilih]);
    if (kunci === papanTerakhir) return;
    papanTerakhir = kunci;
    for (const r of ROOM) {
      const el = papanRoom[r.id];
      const [label, nilai] = angkaRoom(r.id, keadaan.fakta)[0] || [];
      el.lastChild.textContent = keadaan.roomKerja === r.id ? 'analisa…' : label ? `${nilai} ${r.satuan}` : '';
      el.title = label ? `${label}: ${nilai}` : '';
      el.classList.toggle('kerja', keadaan.roomKerja === r.id);
      el.classList.toggle('dipilih', keadaan.roomDipilih === r.id);
    }
  }
  pendengar.add(sinkronPapan);
  sinkronPapan();

  // Pasang tata letak: ukuran canvas, latar, meja analis room, papan. Waktu ganti tata (layar nyebrang breakpoint HP),
  // yang lagi di room/lorong atau lagi jalan dipindah langsung ke kursinya biar nggak nyangkut di tembok.
  function pasangTata(nama) {
    const ganti = latar !== null;
    T = TATA[nama];
    kanvas.width = T.W;
    kanvas.height = T.H;
    latar = gambarRuang(T);
    elemen.dataset.tata = nama;
    elemen.style.setProperty('--rasio', T.W / T.H);
    papan.style.left = (LANTAI.w / 2 / T.W) * 100 + '%';
    papan.style.top = (5 / T.H) * 100 + '%';
    ROOM.forEach((r, i) => {
      const o = T.room(i);
      const el = papanRoom[r.id];
      el.style.left = ((o.x + 3) / T.W) * 100 + '%';
      el.style.top = ((o.y + 82) / T.H) * 100 + '%';
      el.style.maxWidth = (T.papanMaks(i) / T.W) * 100 + '%';
    });
    for (const o of semua()) {
      if (o.room) {
        o.meja = mejaRoom(o.room);
        o.kursi = { x: o.meja.x, y: o.meja.y + 12 };
      }
      if (ganti && (o.keadaan === 'jalan' || o.room || o.x >= LANTAI.w || o.y >= LANTAI.h)) {
        o.berhenti();
        Object.assign(o, { x: o.kursi.x, y: o.kursi.y, keadaan: 'duduk', arah: 'atas', diBeanbag: false, mainPS: false });
      }
    }
  }
  pasangTata(tataLayar());
  const mediaHp = typeof matchMedia === 'function' ? matchMedia(MEDIA_HP) : null;
  const gantiTata = () => pasangTata(tataLayar());
  mediaHp?.addEventListener('change', gantiTata);

  // Klik di lantai: karakter dicolek (ngomong sesuai sifatnya), klik di room = milih room itu buat ditanya.
  function colek(o) {
    if (o.kerja || (o.sibuk && dunia.jalan)) {
      o.emote('sebel', 1500);
      o.bilang(pilih(COLEK_KERJA));
      return;
    }
    if (o.id === 'bos') o.marahSampai = performance.now() + 2000;
    o.emote(o.id === 'bos' ? 'marah' : pilih(['kaget', 'halo', 'senang']), 2000);
    o.bilang(pilih(COLEK[o.id] || COLEK.planner));
  }
  kanvas.addEventListener('click', (e) => {
    const kotakKanvas = kanvas.getBoundingClientRect();
    const x = ((e.clientX - kotakKanvas.left) / kotakKanvas.width) * T.W;
    const y = ((e.clientY - kotakKanvas.top) / kotakKanvas.height) * T.H;
    const kena = semua()
      .filter((o) => !o.sembunyi && Math.abs(o.x - x) <= 6 && y >= o.y - 21 && y <= o.y + 3)
      .sort((a, b) => b.y - a.y)[0];
    if (kena) return colek(kena);
    const z = zonaDi(x, y);
    if (z >= 0) ubah(() => ({ roomDipilih: ROOM[z].id }));
  });
  raf = requestAnimationFrame(bingkai);

  return {
    elemen,
    kasihTugas,
    baca: () => keadaan,
    dengar: (f) => {
      pendengar.add(f);
      return () => pendengar.delete(f);
    },
    atur: (s) => {
      Object.assign(setelan, s);
      if ('status' in s) ubah(() => ({ status: s.status }));
      if ('fakta' in s) ubah(() => ({ fakta: s.fakta }));
    },
    pilihRoom: (id) => ubah(() => ({ roomDipilih: id })),
    gantiNamaBos: (nama) => {
      orang.bos.nama = nama;
      orang.bos.tag.textContent = nama;
    },
    hapus() {
      mati = true;
      mediaHp?.removeEventListener('change', gantiTata);
      cancelAnimationFrame(raf);
      clearInterval(detak);
      clearInterval(detakGerak);
      pendengar.clear();
      elemen.remove();
    },
  };
}

export const namaPendek = (nama) => (nama || 'Bos').split(' ')[0].slice(0, 12);
export { buatKantor };
