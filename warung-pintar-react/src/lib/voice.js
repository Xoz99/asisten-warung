const angkaKata = {
  satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10, se: 1,
};
const keAngka = (t) => (angkaKata[t] !== undefined ? angkaKata[t] : parseInt(t, 10));
const isAngka = (t) => angkaKata[t] !== undefined || /^\d+$/.test(t);

// Kata pengisi/penghubung yang sering nyempil pas orang ngedikte belanjaan ("tambah lagi",
// "sekalian", dst) — dibuang duluan biar nggak numpang jadi bagian nama barang.
const KATA_PENGISI = new Set([
  'tambah', 'tambahin', 'lagi', 'terus', 'trus', 'dong', 'deh', 'aja', 'ya', 'yah',
  'juga', 'dan', 'nih', 'tuh', 'eh', 'oh', 'sekalian', 'tolong', 'minta', 'mau', 'beli', 'pesan', 'sama',
  // "nya" kepisah ("beras mentari NYA 5 kilo") itu partikel, bukan nama barang.
  'nya',
]);

// Akhiran "-nya" yang NEMPEL ke kata ("merahnya", "berasnya") - dirontokin biar tetap kena ke nama
// produk ("Beras Merah"). Tanpa ini "merahnya" nggak match apa-apa: pencocokan pakai
// target.includes(kata), dan "beras merah 5 kg" jelas nggak ngandung "merahnya".
// Cuma dirontokin kalau sisanya masih >= 3 huruf, biar kata pendek yang kebetulan berakhiran
// "nya" (mis. "punya" -> "pu") nggak jadi potongan ngawur.
function luruhkanNya(kata) {
  if (kata.length > 5 && kata.endsWith('nya')) return kata.slice(0, -3);
  return kata;
}

// Kata satuan UKURAN (volume/berat) yang sering kepisah dari angkanya pas ngomong (mis. "lima
// ratus mili" / "500 mili" alih-alih "500ml" nempel) — kalau dibiarin, "500"-nya ketangkep sebagai
// JUMLAH BELI (500 biji!) bukan bagian UKURAN/nama barang. Ditangani di gabungAngkaSatuan() di bawah.
//
// ⚠️ SENGAJA cuma satuan ukuran (ml/kg/liter/gram/dst) - BUKAN satuan HITUNGAN (pcs/butir/batang/
// lembar/sachet). Bedanya penting: "aqua 500 mili" itu "500"-nya bagian NAMA/ukuran produk (varian
// tetap, orang jarang bilang "aqua 3 mili" maksudnya beli 3 satuan 1ml-an) - tapi "gudang garam 3
// batang" itu "3"-nya beneran JUMLAH BELI (3 batang rokok), bukan bagian nama. Kalau satuan
// hitungan ikut digabung ke sini, "3 batang" pun ikut ke-treat kayak bagian nama, "3"-nya nggak
// pernah kebaca jadi angka qty sama sekali - qty-nya nyasar jadi default 1 (pernah kejadian pas
// dites pakai kasus rokok ketengan, makanya sekarang dipisah tegas).
const KATA_SATUAN = new Set(['ml', 'mili', 'mililiter', 'mil', 'cc', 'l', 'liter', 'kg', 'kilo', 'kilogram', 'gram', 'gr', 'g', 'ons']);

// Ubah token ANGKA yang langsung diikuti kata satuan (mis. {angka:500} lalu {kata:'mili'}) jadi 2
// token TEKS biasa ("500", "mili") SEBELUM logic deteksi qty di bawah jalan - biar dibaca sebagai
// bagian NAMA/ukuran barang (kayak nyebut "aqua 500ml"), bukan angkanya ditangkep sebagai jumlah
// beli. Tanpa ini, "aqua 500 mili" kebaca "500 Aqua" (mau beli 500 biji!), bukan "1 Aqua ukuran
// 500ml" — angkanya kepisah dari satuannya gara-gara STT/pengetikan taruh spasi di antara.
// SENGAJA dipisah jadi 2 token (bukan digabung "500mili" jadi 1 kata) - cocokSemua nyocokin per
// KATA ke nama produk ("Aqua 500ml"), dan "500mili" gabungan nggak bakal ketemu di situ (nama
// produknya nulis "500ml", bukan "500mili") - "500" doang tetep kena, cukup buat mbedain
// 500ml/50ml, "mili"-nya sendiri nggak match apa-apa tapi juga nggak ngerusak (skor 0, netral).
function gabungAngkaSatuan(token) {
  const hasil = [];
  for (let i = 0; i < token.length; i++) {
    const t = token[i];
    const next = token[i + 1];
    if (t.angka !== undefined && next?.kata && KATA_SATUAN.has(next.kata)) {
      hasil.push({ kata: String(t.angka) }, { kata: next.kata });
      i++; // lompatin token satuan-nya, udah ikut kepakai di atas
    } else {
      hasil.push(t);
    }
  }
  return hasil;
}

// Angka yang diikuti kata dan frasanya PERSIS ada di nama barang di katalog ("1 batang" di varian
// "Rokok Magnum 1 Batang" / "1 Batang") diubah jadi teks - bagian NAMA, bukan jumlah beli.
//
// Dulu "magnum nya 1 batang 5" kebaca: "1" = jumlah buat "magnum", terus "batang 5" jadi barang
// kedua yang nyangkut ke varian "batang" siapa aja (Magnum, Surya, sabun batang) - hasilnya dua baris
// keranjang yang dua-duanya salah. Beda sama gabungAngkaSatuan() di atas yang bekerja berdasar DAFTAR
// SATUAN tetap: ini berdasar KATALOG warung itu sendiri, jadi "gudang garam filter 3 batang" (nggak ada
// barang bernama "3 batang") tetap kebaca 3 batang.
function gabungAngkaNama(token, produk) {
  const namaKatalog = produk.map((p) => ` ${p.nama} `.toLowerCase().replace(/\s+/g, ' '));
  const hasil = [];
  for (let i = 0; i < token.length; i++) {
    const t = token[i];
    const next = token[i + 1];
    if (t.angka !== undefined && next?.kata && namaKatalog.some((n) => n.includes(` ${t.angka} ${next.kata} `))) {
      hasil.push({ kata: String(t.angka) }, { kata: next.kata });
      i++;
    } else {
      hasil.push(t);
    }
  }
  return hasil;
}

// Barang yang harganya belum diatur (baru diambil dari katalog) belum dijual - bukan "hampir habis".
export const kritisQ = (p) => p.harga > 0 && p.stok <= Math.max(3, Math.ceil(p.laku / 4));

// Balikin SEMUA produk yang skor cocoknya SAMA TINGGI dengan yang terbaik (bukan cuma 1
// pemenang) — dipakai buat deteksi ambigu: kalau beberapa varian ukuran/kemasan (satu "grup",
// lihat Stok.jsx) sama-sama cocok skornya, artinya ucapan/ketikan user nggak nyebutin ciri yang
// bedain variannya (misal cuma "aqua" tanpa nyebut 600ml/1500ml).
//
// `p.satuan` ikut dimasukkan ke target pencocokan (bukan cuma nama+id) - kepake khusus buat kasus
// 1 grup isinya varian beda SATUAN JUAL, bukan beda ukuran (misal rokok: "Gudang Garam Filter"
// dijual per bungkus VS "Gudang Garam Filter Ketengan" dijual per batang). Nyebut satuannya doang
// ("gudang garam filter 3 batang") udah cukup nunjuk ke varian yang tepat tanpa perlu nanya balik
// "yang mana" - kata "batang" match ke p.satuan="batang" punya si varian ketengan, menangin skor.
//
// `p.grup` juga ikut. Varian sering dinamai PENDEK di dalam grupnya (grup "Rokok Magnum", nama varian
// "1 Batang") - tanpa grup, kata "magnum" cuma nyangkut ke produk induknya, dan varian "1 Batang"
// punya Magnum nggak bisa dibedain dari "1 Batang" punya Surya.
//
// Angka di nama barang ("1 batang", "600 ml") nggak kena pencocokan per kata (kata <= 2 huruf
// dilewati), jadi dikasih bonus per FRASA angka+kata yang persis ada di nama - itu yang bikin
// "magnum 1 batang" menang atas "Rokok Magnum" polos.
function cocokSemua(produk, teks) {
  const kata = teks
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((k) => (angkaKata[k] !== undefined ? String(angkaKata[k]) : k));
  const skorProduk = produk.map((p) => {
    const target = ` ${p.nama} ${p.grup || ''} ${p.id} ${p.satuan || ''} `.toLowerCase().replace(/\s+/g, ' ');
    let s = 0;
    kata.forEach((k) => {
      if (k.length > 2 && target.includes(k)) s += k.length;
    });
    for (let i = 0; i < kata.length - 1; i++) {
      if (/^\d+$/.test(kata[i]) && target.includes(` ${kata[i]} ${kata[i + 1]} `)) s += kata[i].length + kata[i + 1].length;
    }
    return { p, s };
  });
  const terbaik = skorProduk.reduce((a, b) => (b.s > a.s ? b : a), { p: null, s: 0 });
  if (terbaik.s < 3) return [];
  return skorProduk.filter((x) => x.s === terbaik.s).map((x) => x.p);
}

export function cocokProduk(produk, teks) {
  return cocokSemua(produk, teks)[0] || null;
}

// Pecah kalimat TANPA angka jumlah jadi beberapa barang, pakai "kata pembeda" sebagai penanda
// batas. Kata pembeda = kata di nama produk yang cuma dimiliki SATU produk (mis. "rojolele",
// "mentari") - lawannya kata umum kayak "beras" yang dipunyai banyak produk sekaligus.
//
// Kenapa nggak pakai cara "ambil potongan terpanjang yang cocok": cocokSemua() ngejumlahin skor
// semua kata, jadi potongan panjang yang kebetulan ngandung DUA nama barang selalu menang atas
// potongan pendek yang cuma satu - hasilnya malah balik ke masalah semula (satu barang nelen yang
// lain). Kata pembeda nunjuk ke barang SPESIFIK, jadi nggak bisa ketelen tetangganya.
//
// Qty-nya 1 per barang: kalimat ini emang nggak nyebut jumlah (semua angkanya kepakai jadi nama),
// dan 1 itu tebakan paling aman - user tinggal ngedit di layar konfirmasi, bukan ditebak gede-gede.
function segmentasiTanpaQty(produk, token) {
  const petaKata = new Map(); // kata -> Set(id produk yang namanya ngandung kata itu)
  produk.forEach((p) => {
    new Set(
      String(p.nama || '')
        .toLowerCase()
        .split(/\s+/)
        .filter((k) => k.length > 2)
    ).forEach((k) => {
      if (!petaKata.has(k)) petaKata.set(k, new Set());
      petaKata.get(k).add(p.id);
    });
  });

  const urut = [];
  const sudah = new Set();
  token.forEach((t) => {
    if (t.angka !== undefined || !t.kata) return;
    const pemilik = petaKata.get(t.kata);
    // Cuma kata yang nunjuk PERSIS 1 produk yang dianggap pembeda. Kata umum ("beras") nunjuk ke
    // banyak produk - kalau dipakai sebagai penanda, tiap kata "beras" bakal bikin barang baru.
    if (!pemilik || pemilik.size !== 1) return;
    const id = [...pemilik][0];
    if (sudah.has(id)) return; // barang yang sama disebut 2x (mis. "hit aerosol lily") - cukup 1
    sudah.add(id);
    urut.push(id);
  });

  // Cuma dianggap "daftar banyak barang" kalau kepecah jadi LEBIH DARI SATU. Kalau cuma satu,
  // biarin cadangan lama yang nangani - dia lebih pinter soal ambigu antar-varian segrup.
  if (urut.length < 2) return [];
  return urut.map((id) => ({ p: produk.find((x) => x.id === id), q: 1 }));
}

export function parseUcapan(produk, teks) {
  const kataMentah = teks.toLowerCase().replace(/[.,]/g, ' ').split(/\s+/).filter(Boolean);
  const tokenMentah = kataMentah
    .filter((k) => !KATA_PENGISI.has(k))
    .map((k) => (isAngka(k) ? { angka: keAngka(k) } : { kata: luruhkanNya(k) }));
  const token = gabungAngkaNama(gabungAngkaSatuan(tokenMentah), produk);
  if (!token.length) return [];

  // Urutan dominan dideteksi dari token PERTAMA: kalau kalimat dibuka pakai nama barang dulu
  // baru angka (mis. "mainan 1"), seluruh kalimat dibaca pola "barang lalu angka". Kalau dibuka
  // angka duluan (mis. "tiga mie goreng"), dibaca pola "angka lalu barang" (pola default/contoh
  // di UI). Ini nyelesain kasus kayak "mainan 1 penghapus 1 penghapus 3" yang sebelumnya salah
  // baca gara-gara regex cuma ngerti pola angka-dulu.
  const anganDuluan = token[0].angka !== undefined;

  // Barang cocok tapi ambigu (beberapa varian dalam 1 grup skornya sama) -> jangan asal nebak,
  // tandain sebagai entri "ambigu" biar UI-nya bisa nanya balik ke user mau yang mana.
  const grupSamaSemua = (list) =>
    list.length > 1 && list[0].grup && list.every((x) => x.grup?.trim().toLowerCase() === list[0].grup.trim().toLowerCase());

  const hasil = [];
  const commit = (kataArr, q) => {
    if (!kataArr.length || !q) return;
    const kandidat = cocokSemua(produk, kataArr.join(' '));
    if (!kandidat.length) return;
    if (grupSamaSemua(kandidat)) hasil.push({ ambigu: true, grup: kandidat[0].grup, kandidat, q });
    else hasil.push({ p: kandidat[0], q });
  };

  let bufferKata = [];
  if (anganDuluan) {
    let qAktif = null;
    for (const t of token) {
      if (t.angka !== undefined) {
        commit(bufferKata, qAktif);
        bufferKata = [];
        qAktif = t.angka;
      } else {
        bufferKata.push(t.kata);
      }
    }
    commit(bufferKata, qAktif);
  } else {
    for (const t of token) {
      if (t.angka !== undefined) {
        commit(bufferKata, t.angka);
        bufferKata = [];
      } else {
        bufferKata.push(t.kata);
      }
    }
    // sisa kata di buffer tanpa angka susulan (nggak ada qty-nya) — diabaikan
  }

  // Barang yang sama disebut berkali-kali dalam satu kalimat -> pakai sebutan TERAKHIR aja.
  // Biasanya itu koreksi ucapan (mis. "penghapus 1 eh penghapus 3" maksudnya total 3, bukan 1+3).
  const gabung = new Map();
  hasil.forEach((h) => gabung.set(h.ambigu ? `grup:${h.grup.trim().toLowerCase()}` : h.p.id, h));
  const final = [...gabung.values()];

  if (!final.length) {
    // Nggak ada satu pun angka JUMLAH di kalimat ini. Paling sering kejadian pas semua angkanya
    // ternyata bagian NAMA barang - "beras mentari 5 kilo beras rojolele 50 kilo beras merah 5
    // kilo": tiap angka diikuti "kilo", jadi kena gabungAngkaSatuan() dan berubah jadi teks.
    //
    // DULU di sini langsung cocokSemua(teks PENUH) - yaitu nyocokin SELURUH kalimat sebagai SATU
    // nama barang, terus ambil skor tertinggi. Akibatnya kalimat yang nyebut TIGA barang cuma
    // kebaca SATU (yang namanya kebetulan paling banyak nyumbang skor), dua sisanya hilang tanpa
    // jejak. Sekarang dipecah dulu per kata-pembeda; cocokSemua(teks penuh) tetap dipakai, tapi
    // cuma sebagai cadangan terakhir kalau nggak ada pembeda sama sekali.
    const dariSegmen = segmentasiTanpaQty(produk, token);
    if (dariSegmen.length) {
      dariSegmen.forEach((h) => final.push(h));
    } else {
      const kandidat = cocokSemua(produk, teks);
      if (kandidat.length) {
        if (grupSamaSemua(kandidat)) final.push({ ambigu: true, grup: kandidat[0].grup, kandidat, q: 1 });
        else final.push({ p: kandidat[0], q: 1 });
      }
    }
  }

  // Terakhir: kalau masih ada entri ambigu, coba selesaiin pakai kata SATUAN yang disebut di
  // kalimat (misal "batang" buat milih varian ketengan rokok). Dicek ULANG terhadap teks PENUH di
  // sini (bukan cuma buffer kata yang sempet ke-commit di atas) - soalnya kata satuan kayak
  // "batang" posisinya sering SETELAH angka ("gudang garam filter 3 batang"), jadi udah kelewat
  // waktu commit() ke-panggil duluan pas ketemu angkanya (lihat loop di atas, buffer di-reset
  // begitu commit jalan). Cuma nge-resolve kalau PERSIS 1 kandidat yang satuannya kesebut -
  // kalau 0 atau lebih dari 1 yang cocok, tetap dibiarin ambigu (mending nanya daripada nebak).
  const kataTeksPenuh = new Set(teks.toLowerCase().split(/\s+/).filter(Boolean));
  return final.map((h) => {
    if (!h.ambigu) return h;
    const cocokSatuan = h.kandidat.filter((p) => p.satuan && kataTeksPenuh.has(p.satuan.toLowerCase()));
    return cocokSatuan.length === 1 ? { p: cocokSatuan[0], q: h.q } : h;
  });
}

// HPP rata-rata tertimbang: stok lama + stok baru masuk
export function hppRata(p, qtyBaru, hargaBeliBaru) {
  const stokLama = Math.max(0, p.stok);
  const modalLama = p.modal || hargaBeliBaru;
  const total = stokLama + qtyBaru;
  return total ? Math.round((stokLama * modalLama + qtyBaru * hargaBeliBaru) / total) : hargaBeliBaru;
}

export function produkSetelahMasuk(p, qty, hargaBeli) {
  const modalBaru = hppRata(p, qty, hargaBeli);
  return { ...p, modal: modalBaru, stok: p.stok + qty, untung: Math.max(0, p.harga - modalBaru) };
}
