// Obrolan kerjaan di Kantor Konsulin pakai angka ASLI Makalin (dashboard, rekrutmen, karyawan), bukan karangan.
// Pola: A nanya (gaya A) -> B jawab angkanya (gaya B) -> A nanggepin (bagus/jelek, gaya A) -> kalau jelek, B ngeles.

const angka = (n) => Number(n || 0).toLocaleString('id-ID');
export function rupiahPendek(n) {
  const v = Math.abs(Number(n) || 0);
  const tanda = n < 0 ? 'minus ' : '';
  if (v >= 1e9) return `${tanda}Rp ${(v / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 1 })} M`;
  if (v >= 1e6) return `${tanda}Rp ${(v / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
  if (v >= 1e3) return `${tanda}Rp ${Math.round(v / 1e3)} rb`;
  return `${tanda}Rp ${angka(v)}`;
}

// Ringkas respons /dashboard, /rekrutmen/ringkasan, /karyawan/ringkasan jadi angka-angka yang dipakai ngobrol.
// Bagian yang gagal diambil (null) dilewati, topiknya nggak dibahas.
export function susunFakta(dash, rek, kry) {
  const f = {};
  if (dash) {
    const t = dash.warung?.tahap || {};
    if (dash.produkAktif) {
      Object.assign(f, {
        warungLangganan: t.langganan || 0,
        warungTrial: t.trial || 0,
        warungTrialHabis: t.trial_habis || 0,
        warungBerhenti: t.berhenti || 0,
        warungBaru30: dash.warung?.baru30 || 0,
        tagihanN: dash.tagihan?.n || 0,
        tagihanTotal: dash.tagihan?.total || 0,
        trialHabisNama: (dash.trialHabis || []).map((w) => w.nama).filter(Boolean).slice(0, 3),
        salesTop: dash.sales?.[0]?.nama ? { nama: dash.sales[0].nama, warung: dash.sales[0].warung || 0 } : null,
      });
    }
    const bulanIni = dash.kas?.at(-1);
    if (bulanIni) Object.assign(f, { pemasukanBulanIni: bulanIni.masuk || 0, pengeluaranBulanIni: bulanIni.keluar || 0 });
    if (typeof dash.saldo === 'number') f.saldo = dash.saldo;
    if (Array.isArray(dash.crm)) {
      const per = Object.fromEntries(dash.crm.map((c) => [c.tahap, c.n]));
      Object.assign(f, {
        leadAktif: dash.crm.reduce((a, c) => a + c.n, 0),
        leadStuck: per.stuck || 0,
        leadTrial: per.trial || 0,
        leadKonversi: (per.konversi || 0) + (per.repeat_order || 0),
        leadNilai: dash.crm.reduce((a, c) => a + (c.nilai || 0), 0),
      });
    }
  }
  if (rek) Object.assign(f, { pelamarAktif: rek.aktif || 0, pelamarMingguIni: rek.mingguIni || 0, pelamarHired: rek.jumlahHired || 0, pelamarFollowup: rek.perluFollowup || 0 });
  if (kry) f.karyawanAktif = kry.aktif || 0;
  return Object.keys(f).length ? f : null;
}

// Buat prompt gosip AI: daftar angka asli, biar AI ngobrolin data yang bener.
export function ringkasFakta(f) {
  if (!f) return '';
  const b = [];
  if (f.warungLangganan != null) b.push(`warung Warung Pintar yang langganan ${f.warungLangganan}, masih trial ${f.warungTrial}, trial habis belum bayar ${f.warungTrialHabis}, berhenti ${f.warungBerhenti}, warung baru 30 hari ${f.warungBaru30}`);
  if (f.trialHabisNama?.length) b.push(`contoh warung trial habis: ${f.trialHabisNama.join(', ')}`);
  if (f.tagihanN != null) b.push(`tagihan pending ${f.tagihanN} (${rupiahPendek(f.tagihanTotal)})`);
  if (f.salesTop) b.push(`sales paling jago: ${f.salesTop.nama} (${f.salesTop.warung} warung)`);
  if (f.pemasukanBulanIni != null) b.push(`pemasukan bulan ini ${rupiahPendek(f.pemasukanBulanIni)}, pengeluaran ${rupiahPendek(f.pengeluaranBulanIni)}`);
  if (f.saldo != null) b.push(`saldo total ${rupiahPendek(f.saldo)}`);
  if (f.leadAktif != null) b.push(`lead CRM jalan ${f.leadAktif} (stuck ${f.leadStuck}, trial ${f.leadTrial}, konversi/repeat ${f.leadKonversi}), nilai pipeline ${rupiahPendek(f.leadNilai)}`);
  if (f.pelamarAktif != null) b.push(`pelamar Sales Partner lagi diproses ${f.pelamarAktif}, masuk minggu ini ${f.pelamarMingguIni}, udah di-hire ${f.pelamarHired}, perlu follow-up ${f.pelamarFollowup}`);
  if (f.karyawanAktif != null) b.push(`karyawan aktif ${f.karyawanAktif}`);
  return b.join('; ');
}

const GAYA_JAWAB = { bos: 'Hmm, setau gw ', planner: 'Per hari ini, ', researcher: 'Menurut data, ', coder: 'Bentar gw cek... oke, ', reviewer: 'Tepatnya, ', writer: 'Ah... ', akuntan: 'Sesuai pembukuan, ', sales: 'Dari lapangan nih, ', produk: 'Kalo liat datanya, ', hrd: 'Gini sayang, ' };

const NANYA = {
  langganan: {
    bos: '{b}, laporan dong. Warung yang langganan udah berapa?',
    planner: '{b}, update angka langganan dong, buat sheet gw',
    researcher: '{b}, lo udah liat angka langganan terbaru belum?',
    coder: 'Eh {b}, udah banyak belom yang subscribe?',
    reviewer: '{b}, jumlah warung langganan sekarang berapa? Yang akurat',
    writer: '{b}, udah berapa warung yang jatuh hati sama kita?',
  },
  trialHabis: {
    bos: '{b}, kok gw denger banyak warung trial-nya habis?',
    planner: '{b}, trial yang habis udah ada yang follow-up belum?',
    researcher: '{b}, lo tau berapa warung yang trial-nya kelar tapi nggak lanjut?',
    coder: '{b}, aplikasinya udah dipake, terus kenapa nggak pada bayar?',
    reviewer: '{b}, data trial habis udah dicek belum?',
    writer: '{b}, ada warung yang pergi tanpa pamit ya?',
  },
  tagihan: {
    bos: '{b}, tagihan yang belum dibayar ada berapa?',
    planner: '{b}, tagihan pending udah masuk daftar follow-up?',
    researcher: '{b}, gw penasaran, tagihan pending sekarang berapa?',
    coder: '{b}, payment gateway aman kan? Kok kayaknya banyak yang pending',
    reviewer: '{b}, tagihan pending totalnya berapa? Jangan dibulatin',
    writer: '{b}, ada janji bayar yang belum ditepati?',
  },
  kas: {
    bos: '{b}, bulan ini kita untung nggak sih?',
    planner: '{b}, arus kas bulan ini gimana? Buat rencana bulan depan',
    researcher: '{b}, pemasukan bulan ini udah lo cek?',
    coder: '{b}, gaji gw aman kan bulan ini? Duit masuknya berapa?',
    reviewer: '{b}, laporan pemasukan pengeluaran bulan ini udah bener?',
    writer: '{b}, bagaimana nasib dompet perusahaan kita bulan ini?',
  },
  lead: {
    bos: '{b}, pipeline CRM gimana? Banyak yang mau closing?',
    planner: '{b}, lead yang stuck udah ada rencana tindak lanjutnya?',
    researcher: '{b}, lo tau nggak berapa lead yang lagi jalan?',
    coder: '{b}, CRM-nya dipake beneran nggak sih? Lead-nya ada berapa?',
    reviewer: '{b}, data lead di CRM udah rapi belum?',
    writer: '{b}, ada calon pelanggan yang lagi digantung?',
  },
  rekrutmen: {
    bos: '{b}, rekrutmen Sales Partner gimana? Udah banyak yang daftar?',
    planner: '{b}, pelamar minggu ini udah sesuai target belum?',
    researcher: '{b}, sumber pelamar paling banyak dari mana ya? Eh, jumlahnya berapa dulu',
    coder: '{b}, form lamaran yang gw bikin dipake nggak? Pelamarnya berapa?',
    reviewer: '{b}, pelamar yang perlu di-follow-up udah ditanganin?',
    writer: '{b}, berapa jiwa yang ingin bergabung dengan kita?',
  },
  salesTop: {
    bos: '{b}, siapa sales paling jago kita sekarang?',
    planner: '{b}, sales mana yang paling sesuai target?',
    researcher: '{b}, lo tau sales paling produktif siapa?',
    coder: '{b}, sales siapa yang paling rajin bikin akun warung?',
    reviewer: '{b}, sales terbaik bulan ini siapa? Datanya valid?',
    writer: '{b}, siapa pahlawan lapangan kita bulan ini?',
  },
  saldo: {
    bos: '{b}, saldo kita sekarang berapa?',
    planner: '{b}, saldo cukup buat rencana Q depan nggak?',
    researcher: '{b}, total saldo kita udah lo itung?',
    coder: '{b}, kantor masih bisa beli kopi nggak? Saldo berapa?',
    reviewer: '{b}, saldo total udah direkonsiliasi?',
    writer: '{b}, berapa sisa harapan di rekening kita?',
  },
};

// Kalimat jawaban berisi angka asli.
const gabung = (bagian) => bagian.filter(Boolean).join(', ');
const FAKTA = {
  langganan: (f) =>
    gabung([
      f.warungLangganan ? `baru ${f.warungLangganan} warung yang langganan` : 'belum ada satu pun warung yang langganan',
      f.warungTrial && `${f.warungTrial} masih trial`,
      f.warungBaru30 && `${f.warungBaru30} daftar 30 hari terakhir`,
    ]),
  trialHabis: (f) => `ada ${f.warungTrialHabis} warung yang trial-nya habis tapi belum bayar${f.trialHabisNama?.length ? `, kayak ${f.trialHabisNama.join(', ')}` : ''}`,
  tagihan: (f) => `${f.tagihanN} tagihan masih pending, totalnya ${rupiahPendek(f.tagihanTotal)}`,
  kas: (f) => `pemasukan bulan ini ${rupiahPendek(f.pemasukanBulanIni)}, pengeluarannya ${f.pengeluaranBulanIni ? rupiahPendek(f.pengeluaranBulanIni) : 'nol'}`,
  lead: (f) => gabung([`${f.leadAktif} lead masih jalan`, f.leadStuck ? `${f.leadStuck} nyangkut di stuck` : 'nggak ada yang stuck', f.leadKonversi && `${f.leadKonversi} udah konversi`]),
  rekrutmen: (f) =>
    gabung([
      `${f.pelamarAktif} pelamar lagi diproses`,
      f.pelamarMingguIni && `${f.pelamarMingguIni} masuk minggu ini`,
      f.pelamarHired ? `${f.pelamarHired} udah di-hire` : 'tapi belum ada yang di-hire',
      f.pelamarFollowup && `${f.pelamarFollowup} nunggu di-follow-up`,
    ]),
  salesTop: (f) => `${f.salesTop.nama}, dia pegang ${f.salesTop.warung} warung`,
  saldo: (f) => `saldo total kita ${rupiahPendek(f.saldo)}`,
};

// Kapan topiknya bisa dibahas, dan kapan angkanya dianggap bagus.
const TOPIK = {
  langganan: { ada: (f) => f.warungLangganan != null, bagus: (f) => f.warungLangganan >= 20 },
  trialHabis: { ada: (f) => f.warungTrialHabis > 0, bagus: () => false },
  tagihan: { ada: (f) => f.tagihanN > 0, bagus: (f) => f.tagihanN <= 2 },
  kas: { ada: (f) => f.pemasukanBulanIni != null, bagus: (f) => f.pemasukanBulanIni > f.pengeluaranBulanIni },
  lead: { ada: (f) => f.leadAktif != null, bagus: (f) => f.leadStuck === 0 && f.leadAktif >= 5 },
  rekrutmen: { ada: (f) => f.pelamarAktif != null, bagus: (f) => f.pelamarMingguIni >= 5 },
  salesTop: { ada: (f) => Boolean(f.salesTop), bagus: () => true },
  saldo: { ada: (f) => f.saldo != null, bagus: (f) => f.saldo >= 50e6 },
};

const JELEK = {
  bos: ['Cuma segitu?! Kita harus lebih agresif, guys!', 'Ini nggak sesuai visi gw. Meeting sore ini, semua wajib dateng', 'Investor bisa kabur kalo angkanya begini'],
  planner: ['Jauh dari target. Timeline gw harus direvisi lagi', 'Oke, ini masuk prioritas merah di sheet', 'Kalo begini terus, rencana Q depan berantakan'],
  researcher: ['Hmm, ada yang bocor di funnel. Gw mau gali datanya', 'Trennya kurang bagus. Perlu riset kenapa', 'Menurut pola, ini bakal makin turun kalo didiemin'],
  coder: ['Yah payah. Lo kan {peran}, masa gini aja nggak bisa? Nanti Bos ngamuk tau', 'Segitu doang? Server kita lebih rame sama bot', 'Gw udah lembur bikin fiturnya, hasilnya segini?'],
  reviewer: ['Angka segini nggak layak dilaporin ke Bos', 'Ini harus dievaluasi. Serius', 'Gw nggak suka angka ini. Sama sekali'],
  writer: ['Angka ini bikin hati gw mendung', 'Sedikit... tapi tiap awal itu kecil, kan?', 'Ini kayak bab paling sedih di novel kita'],
};
const BAGUS = {
  bos: ['Mantap! Ini yang gw mau! Nanti gw traktir', 'Nah gitu dong! Gw bangga sama tim ini', 'Ini bisa gw pamerin ke investor'],
  planner: ['Sesuai target. Gw centang hijau', 'Bagus, timeline aman', 'Oke, rencana kita jalan'],
  researcher: ['Trennya naik. Gw suka grafik ini', 'Datanya bagus. Gw mau bikin laporannya', 'Persis kayak prediksi gw'],
  coder: ['Lumayan. Server gw nggak sia-sia', 'Oke, berarti gw nggak lembur sia-sia', 'Hmm. Nggak buruk'],
  reviewer: ['Hmm. Oke, ini bagus. Jarang-jarang', 'Angkanya rapi. Gw terima', 'Lumayan. Pertahanin'],
  writer: ['Indah banget, kayak matahari terbit', 'Gw terharu. Ini kerja keras kita', 'Ini layak jadi cerita sukses'],
};
const NGELES = {
  bos: ['Ya makanya kalian kerja lebih keras dong', 'Gw udah kasih arahan, eksekusinya di kalian'],
  planner: ['Eh jangan nyalahin gw, sales-nya juga belum gerak', 'Rencana gw udah bener, eksekusinya yang molor'],
  researcher: ['Gw cuma nyampein data, jangan nyalahin pembawa pesan', 'Datanya emang begitu, mau gimana lagi'],
  coder: ['Ya jangan nyalahin gw, fiturnya kan udah jalan', 'Aplikasinya aman kok. Jualannya yang kurang'],
  reviewer: ['Gw cuma ngecek, bukan yang jualan', 'Gw udah ngingetin dari awal. Nggak ada yang dengerin'],
  writer: ['Gw udah nulis copy paling menyentuh, loh', 'Kata-kata gw udah maksimal, sumpah'],
};
const PENUTUP = {
  bos: 'Pokoknya minggu depan angkanya harus naik!',
  planner: 'Oke, ini gw bawa ke meeting besok',
  researcher: 'Nanti gw bikinin analisisnya',
  coder: 'Udahlah, gw balik ngoding aja',
  reviewer: 'Gw catet. Minggu depan gw cek lagi',
  writer: 'Semoga bab berikutnya lebih indah',
};

const pilih = (a) => a[Math.floor(Math.random() * a.length)];
const kecilAwal = (s) => s.charAt(0).toLowerCase() + s.slice(1);

// Satu obrolan kerjaan antara a & b soal angka asli. null kalau belum ada data yang bisa diobrolin.
export function obrolanData(a, b, f) {
  if (!f) return null;
  const topik = Object.keys(TOPIK).filter((k) => TOPIK[k].ada(f));
  if (!topik.length) return null;
  const k = pilih(topik);
  const ganti = (s) => s.replaceAll('{b}', b.nama).replaceAll('{peran}', b.nama);
  const bagus = TOPIK[k].bagus(f);
  const baris = [
    { siapa: 'a', teks: ganti(NANYA[k][a.id] || NANYA[k].planner), muka: 'mikir' },
    { siapa: 'b', teks: (GAYA_JAWAB[b.id] || '') + kecilAwal(FAKTA[k](f)), muka: bagus ? 'senang' : 'keringat' },
    { siapa: 'a', teks: ganti(pilih((bagus ? BAGUS : JELEK)[a.id] || JELEK.planner)), muka: bagus ? 'senang' : a.id === 'writer' ? 'sedih' : 'marah' },
  ];
  if (!bagus) {
    baris.push({ siapa: 'b', teks: pilih(NGELES[b.id] || NGELES.planner), muka: 'sebel' });
    if (Math.random() < 0.6) baris.push({ siapa: 'a', teks: PENUTUP[a.id] || PENUTUP.planner, muka: 'sebel' });
  }
  return baris;
}

// Angka jelek yang bikin Bos ngamuk, plus siapa yang pertama disemprot (yang pegang angka itu).
const PEMILIK_TOPIK = { langganan: 'produk', trialHabis: 'produk', tagihan: 'akuntan', kas: 'akuntan', lead: 'sales', rekrutmen: 'hrd', saldo: 'akuntan' };
export function topikMarah(f) {
  if (!f) return [];
  return Object.keys(PEMILIK_TOPIK)
    .filter((k) => TOPIK[k].ada(f) && !TOPIK[k].bagus(f))
    .map((k) => ({ kunci: k, pemilik: PEMILIK_TOPIK[k], angka: FAKTA[k](f) }));
}
