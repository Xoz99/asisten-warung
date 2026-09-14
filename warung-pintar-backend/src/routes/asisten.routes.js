import { Router } from 'express';
import { query } from '../db.js';
import { tanyaGemini } from '../services/gemini.service.js';
import { tanyaOpenRouter } from '../services/openrouter.service.js';

const router = Router();

const rp = (n) => `Rp ${Number(n).toLocaleString('id-ID')}`;

// Skor cocok sederhana (sama pola kayak cocokProduk di frontend voice.js) - dipakai buat nebak
// nama produk yang disebut user pas nggak ada kata kunci topik lain yang ke-trigger.
function cocokProdukTeks(rows, teks) {
  const kata = teks.split(/\s+/).filter(Boolean);
  let best = null,
    skor = 0;
  rows.forEach((p) => {
    const target = p.nama.toLowerCase();
    let s = 0;
    kata.forEach((k) => {
      if (k.length > 2 && target.includes(k)) s += k.length;
    });
    if (s > skor) {
      skor = s;
      best = p;
    }
  });
  return skor >= 3 ? best : null;
}

// --- Penjualan PER BARANG berdasarkan WAKTU ------------------------------------------------------
// Dulu konteks AI sama sekali nggak punya data barang yang kejual - cuma "laku per hari" rata-rata
// di daftar barang. Jadi "Aqua laku berapa minggu ini", "barang apa aja yang kejual kemarin", "jam
// berapa rokok paling rame" nggak mungkin kejawab, padahal itu yang paling sering pengen diketahui
// pemilik warung buat nentuin kulakan.
//
// HEMAT TOKEN: blok ini CUMA dibikin kalau pertanyaannya emang soal jualan. Pertanyaan lain nggak
// nambah satu token pun. Datanya juga udah diringkas di database (15 barang teratas / rincian satu
// barang), bukan daftar transaksi mentah.
//
// Batas hari & jam pakai jam SERVER - sama kayak "untung hari ini" & "penjualan hari ini" di atas,
// biar semua angka "hari ini" di satu jawaban nyambung satu sama lain.
const KATA_JUALAN = ['terjual', 'kejual', 'laku', 'laris', 'penjualan', 'jualan', 'keluar', 'dibeli', 'omzet', 'pemasukan'];
const KATA_WAKTU = ['hari ini', 'kemarin', 'minggu', '7 hari', 'bulan', '30 hari', 'jam', 'pagi', 'siang', 'sore', 'malam'];
const KATA_PER_BARANG = ['barang', 'apa aja', 'apa saja', 'laris', 'laku', 'terjual', 'kejual'];
const KATA_NGENDAP = ['ngendap', 'nggak laku', 'ga laku', 'tidak laku', 'mandek'];
// Kata yang PASTI bukan bagian nama barang - dibuang dulu sebelum nyocokin nama, biar "hari" /
// "penjualan" nggak kebetulan nyangkut ke nama produk.
const KATA_BUKAN_NAMA = new Set([
  'berapa', 'yang', 'hari', 'ini', 'kemarin', 'minggu', 'bulan', 'terjual', 'kejual', 'laku', 'laris',
  'penjualan', 'jualan', 'barang', 'apa', 'aja', 'saja', 'jam', 'pagi', 'siang', 'sore', 'malam', 'udah',
  'sudah', 'tadi', 'total', 'kita', 'warung', 'paling', 'banyak', 'dibeli', 'keluar', 'omzet', 'terakhir',
]);
const NAMA_HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const tglPendek = (d) => `${NAMA_HARI[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
const jamPendek = (d) => `${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;

function periodeDariTeks(teks) {
  const sekarang = new Date();
  const awalHari = (geser) => {
    const d = new Date(sekarang);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + geser);
    return d;
  };
  if (teks.includes('kemarin')) return { label: 'kemarin', dari: awalHari(-1), sampai: awalHari(0) };
  if (teks.includes('hari ini') || /\b(pagi|siang|sore|malam) ini\b/.test(teks)) return { label: 'hari ini', dari: awalHari(0), sampai: sekarang };
  if (teks.includes('bulan ini')) {
    const d = awalHari(0);
    d.setDate(1);
    return { label: 'bulan ini', dari: d, sampai: sekarang };
  }
  if (teks.includes('bulan') || teks.includes('30 hari')) return { label: '30 hari terakhir', dari: awalHari(-29), sampai: sekarang };
  // Default 7 hari: cukup panjang buat kelihatan polanya, cukup pendek biar datanya nggak kebanyakan.
  return { label: '7 hari terakhir', dari: awalHari(-6), sampai: sekarang };
}

// null kalau pertanyaannya bukan soal jualan. Kalau iya: { rentang, top, barang, detail }.
async function dataPenjualanBarang(wid, teks) {
  const tentangJualan = KATA_JUALAN.some((k) => teks.includes(k));
  const adaWaktu = KATA_WAKTU.some((k) => teks.includes(k));
  const { rows: produk } = await query('SELECT id, nama, satuan FROM produk WHERE warung_id=$1 AND aktif', [wid]);
  const teksNama = teks
    .split(/\s+/)
    .filter((k) => !KATA_BUKAN_NAMA.has(k))
    .join(' ');
  const barang = cocokProdukTeks(produk, teksNama);
  // Nama barang + kata waktu tanpa kata "laku" ("aqua minggu ini gimana") juga dianggap nanya jualan.
  if (!tentangJualan && !(barang && adaWaktu)) return null;

  const p = periodeDariTeks(teks);
  const rentang = `${p.label} (${tglPendek(p.dari)} - ${tglPendek(new Date(p.sampai.getTime() - 1))})`;
  const params = [wid, p.dari.toISOString(), p.sampai.toISOString()];

  // Dikelompokin per produk_id (nama lama di transaksi_item ikut kebawa kalau barangnya diganti nama),
  // jatuh ke nama kalau produknya udah dihapus.
  const { rows: top } = await query(
    `SELECT MAX(ti.nama_produk) AS nama, SUM(ti.qty)::int AS qty, SUM(ti.qty * ti.harga_satuan) AS nilai,
            COALESCE(SUM(ti.qty) FILTER (WHERE t.mode='kasbon'),0)::int AS qty_kasbon
     FROM transaksi_item ti JOIN transaksi t ON t.id = ti.transaksi_id
     WHERE t.warung_id=$1 AND t.waktu >= $2 AND t.waktu < $3
     GROUP BY COALESCE(ti.produk_id::text, ti.nama_produk)
     ORDER BY qty DESC LIMIT 15`,
    params
  );

  let detail = null;
  if (barang) {
    const { rows } = await query(
      `SELECT t.waktu, ti.qty, ti.harga_satuan, t.mode
       FROM transaksi_item ti JOIN transaksi t ON t.id = ti.transaksi_id
       WHERE t.warung_id=$1 AND t.waktu >= $2 AND t.waktu < $3 AND ti.produk_id = $4
       ORDER BY t.waktu`,
      [...params, barang.id]
    );
    const perHari = [];
    for (let d = new Date(p.dari); d < p.sampai; d.setDate(d.getDate() + 1)) {
      perHari.push({ kunci: d.toDateString(), label: tglPendek(d), qty: 0 });
    }
    const perJam = new Map();
    let qty = 0;
    let nilai = 0;
    let qtyKasbon = 0;
    for (const r of rows) {
      const w = new Date(r.waktu);
      const q = Number(r.qty);
      qty += q;
      nilai += q * Number(r.harga_satuan);
      if (r.mode === 'kasbon') qtyKasbon += q;
      const hari = perHari.find((h) => h.kunci === w.toDateString());
      if (hari) hari.qty += q;
      perJam.set(w.getHours(), (perJam.get(w.getHours()) || 0) + q);
    }
    // Terakhir kejual dicari TANPA batas periode: "aqua minggu ini nggak laku" jauh lebih berguna
    // kalau dilengkapin "terakhir laku 12 hari lalu" ketimbang cuma "0".
    const { rows: akhir } = await query(
      `SELECT t.waktu, ti.qty FROM transaksi_item ti JOIN transaksi t ON t.id = ti.transaksi_id
       WHERE t.warung_id=$1 AND ti.produk_id=$2 ORDER BY t.waktu DESC LIMIT 1`,
      [wid, barang.id]
    );
    detail = {
      qty,
      nilai,
      qtyKasbon,
      trx: rows.length,
      perHari,
      jamRamai: [...perJam.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([jam, q]) => ({ jam, qty: q })),
      terakhir: akhir[0] ? { waktu: new Date(akhir[0].waktu), qty: Number(akhir[0].qty) } : null,
    };
  }
  return { rentang, top, barang, detail };
}

const labelJam = (j) => `${String(j).padStart(2, '0')}.00-${String((j + 1) % 24).padStart(2, '0')}.00`;

// Buat konteks AI: ringkas, angka polos, kolom dijelasin sekali di header.
function penjualanBarangUntukAI(d) {
  const baris = [];
  baris.push(
    d.top.length
      ? `Penjualan per barang ${d.rentang}, urut terbanyak (nama | qty terjual termasuk kasbon | nilai rupiah polos), ${d.top.length} teratas:\n` +
          d.top.map((r) => `- ${r.nama} | ${r.qty}${r.qty_kasbon ? ` (${r.qty_kasbon} lewat kasbon)` : ''} | ${Math.round(Number(r.nilai))}`).join('\n')
      : `Penjualan per barang ${d.rentang}: belum ada barang yang kejual.`
  );
  if (d.barang && d.detail) {
    const x = d.detail;
    const sat = d.barang.satuan || 'pcs';
    baris.push(
      `Rincian "${d.barang.nama}" ${d.rentang}: total ${x.qty} ${sat}, nilai ${Math.round(x.nilai)}${x.qtyKasbon ? `, ${x.qtyKasbon} ${sat} lewat kasbon` : ''}, dari ${x.trx} transaksi.\n` +
        `Per hari: ${x.perHari.map((h) => `${h.label}: ${h.qty}`).join(' | ')}\n` +
        (x.jamRamai.length ? `Jam paling ramai: ${x.jamRamai.map((j) => `${labelJam(j.jam)} (${j.qty})`).join(', ')}\n` : '') +
        (x.terakhir ? `Terakhir kejual: ${tglPendek(x.terakhir.waktu)} jam ${jamPendek(x.terakhir.waktu)}, ${x.terakhir.qty} ${sat}.` : 'Barang ini belum pernah kejual sama sekali.')
    );
  }
  baris.push('(Data penjualan per barang di atas dihitung dari transaksi asli. Kalau user nanya periode lain yang nggak ada di sini, bilang terus terang & sebut periode yang tersedia.)');
  return baris.join('\n');
}

// Buat jawaban cadangan tanpa AI: langsung dibaca user.
function penjualanBarangUntukUser(d) {
  if (d.barang && d.detail) {
    const x = d.detail;
    const sat = d.barang.satuan || 'pcs';
    const hariLaku = x.perHari.filter((h) => h.qty > 0);
    return [
      `**${d.barang.nama}** ${d.rentang} kejual **${x.qty} ${sat}** (${rp(x.nilai)}).`,
      ...(hariLaku.length ? [`- Per hari: ${hariLaku.map((h) => `${h.label} ${h.qty}`).join(', ')}`] : []),
      ...(x.jamRamai.length ? [`- Jam paling ramai: ${x.jamRamai.map((j) => labelJam(j.jam)).join(', ')}`] : []),
      x.terakhir ? `- Terakhir kejual: ${tglPendek(x.terakhir.waktu)} jam ${jamPendek(x.terakhir.waktu)}` : '- Belum pernah kejual',
    ].join('\n');
  }
  if (!d.top.length) return `Belum ada barang yang kejual ${d.rentang}.`;
  return [`Barang paling banyak kejual ${d.rentang}:`, ...d.top.slice(0, 8).map((r) => `- **${r.nama}**: ${r.qty}`)].join('\n');
}

// Rule-based keyword matching di atas data asli - jalan gratis & instan tanpa API luar. Ini
// FALLBACK: dipanggil kalau Gemini gagal (down/quota abis/key belum diisi), jadi "Mang Warung"
// nggak pernah mati total, walau jawabannya jadi kaku lagi pas lagi fallback.
async function jawabRuleBased(teks, wid) {
  if (/\b(halo|hai|hei|pagi|siang|sore|malam)\b/.test(teks) && teks.length < 20) {
    return 'Halo! Mau tanya soal apa - untung, kasbon, stok, atau barang paling laris?';
  }
  if (teks.includes('makasih') || teks.includes('terima kasih')) {
    return 'Sama-sama, semangat jualan! 🙂';
  }
  if (teks.includes('siapa kamu') || teks.includes('kamu siapa')) {
    return 'Aku Mang Warung, bantu ngecek untung, stok, kasbon, sampai barang paling laris di warungmu.';
  }

  // Penjualan per barang (dari transaksi asli) - dicek SEBELUM "laris" di bawah, yang cuma baca
  // rata-rata "laku per hari" di data barang. Pertanyaan soal barang ngendap tetap ke cabangnya
  // sendiri, walau ada kata "laku"-nya.
  if (!KATA_NGENDAP.some((k) => teks.includes(k))) {
    const jb = await dataPenjualanBarang(wid, teks);
    if (jb && (jb.barang || KATA_PER_BARANG.some((k) => teks.includes(k)))) return penjualanBarangUntukUser(jb);
  }

  // barang yang lagi ngendap - dicek SEBELUM "barang laris" biar "nggak laku" nggak ketangkep salah
  if (teks.includes('ngendap') || teks.includes('nggak laku') || teks.includes('ga laku') || teks.includes('tidak laku') || teks.includes('mandek')) {
    const { rows } = await query(
      `SELECT nama, stok, laku_per_hari FROM produk WHERE warung_id=$1 AND aktif AND stok > 0
       ORDER BY laku_per_hari ASC, stok DESC LIMIT 5`,
      [wid]
    );
    if (!rows.length) return 'Belum ada data barang buat dicek.';
    return (
      'Yang paling jarang laku: ' +
      rows.map((r) => `${r.nama} (sisa ${r.stok}, laku ${Number(r.laku_per_hari).toFixed(1)}/hari)`).join(', ') +
      '. Coba diskon/dibundling biar cepet muter.'
    );
  }

  // margin/untung per produk - dicek SEBELUM "untung hari ini"
  if (teks.includes('margin') || teks.includes('marjin') || teks.includes('paling untung') || teks.includes('untung paling')) {
    const { rows } = await query(
      `SELECT nama, harga, modal, (harga - modal) AS untung_satuan FROM produk WHERE warung_id=$1 AND aktif AND harga > 0
       ORDER BY untung_satuan DESC LIMIT 5`,
      [wid]
    );
    if (!rows.length) return 'Belum ada produk buat dicek marginnya.';
    return 'Margin paling gede per satuan: ' + rows.map((r) => `${r.nama} untung ${rp(r.untung_satuan)}/pcs`).join(', ') + '.';
  }

  // nilai modal ketanam di stok - dicek SEBELUM "stok/belanja"
  if (teks.includes('modal') || teks.includes('nilai stok') || teks.includes('aset')) {
    const { rows } = await query('SELECT COALESCE(SUM(stok * modal), 0) AS total, COUNT(*) AS jenis FROM produk WHERE warung_id=$1 AND aktif', [wid]);
    return `Modal yang lagi ketanam di stok sekitar ${rp(rows[0].total)}, tersebar di ${rows[0].jenis} jenis barang.`;
  }

  if (teks.includes('laris') || teks.includes('paling laku') || teks.includes('terlaris')) {
    const { rows } = await query('SELECT nama, laku_per_hari, stok FROM produk WHERE warung_id=$1 AND aktif ORDER BY laku_per_hari DESC LIMIT 5', [wid]);
    if (!rows.length || !Number(rows[0].laku_per_hari)) return 'Belum cukup data penjualan buat nentuin yang paling laris.';
    return 'Paling laris: ' + rows.map((r) => `${r.nama} (${Number(r.laku_per_hari).toFixed(1)}/hari, sisa ${r.stok})`).join(', ') + '.';
  }

  // Dicek SEBELUM "untung": dulu "omzet" ikut nyangkut ke cabang untung di bawah, jadi pertanyaan
  // soal penjualan dijawab pakai angka laba.
  if (['penjualan', 'jualan', 'omzet', 'pemasukan', 'pendapatan', 'uang masuk'].some((k) => teks.includes(k))) {
    const awal = new Date();
    awal.setHours(0, 0, 0, 0);
    const { rows } = await query(
      `SELECT COALESCE(SUM(total) FILTER (WHERE mode='bayar'),0) AS omzet,
              COALESCE(SUM(total) FILTER (WHERE mode='bayar' AND COALESCE(metode,'Tunai')='Tunai'),0) AS tunai,
              COUNT(*) FILTER (WHERE mode='bayar') AS trx
       FROM transaksi WHERE warung_id=$1 AND waktu >= $2`,
      [wid, awal.toISOString()]
    );
    const r = rows[0];
    return `Penjualan hari ini **${rp(r.omzet)}** dari ${r.trx} transaksi:\n- Tunai: ${rp(r.tunai)}\n- QRIS/transfer: ${rp(Number(r.omzet) - Number(r.tunai))}`;
  }

  if (teks.includes('untung') || teks.includes('laba')) {
    const awal = new Date();
    awal.setHours(0, 0, 0, 0);
    const { rows } = await query('SELECT COALESCE(SUM(laba),0) AS untung, COUNT(*) AS trx FROM transaksi WHERE warung_id=$1 AND waktu >= $2', [
      wid,
      awal.toISOString(),
    ]);
    return `Hari ini untung ${rp(rows[0].untung)} dari ${rows[0].trx} transaksi.`;
  }

  if (teks.includes('utang') || teks.includes('kasbon') || teks.includes('ngutang')) {
    const { rows } = await query('SELECT nama, jumlah FROM kasbon WHERE warung_id=$1 AND NOT lunas ORDER BY jumlah DESC', [wid]);
    if (!rows.length) return 'Tidak ada. Semua kasbon sudah lunas.';
    const total = rows.reduce((a, r) => a + Number(r.jumlah), 0);
    return rows.map((r) => `${r.nama} ${rp(r.jumlah)}`).join(', ') + `. Total ${rp(total)}.`;
  }

  if (teks.includes('stok') || teks.includes('belanja') || teks.includes('habis') || teks.includes('pasar')) {
    const { rows } = await query(
      `SELECT nama, stok FROM produk WHERE warung_id=$1 AND aktif
       ORDER BY (CASE WHEN laku_per_hari > 0 THEN stok / laku_per_hari ELSE 999 END) ASC LIMIT 5`,
      [wid]
    );
    return rows.length ? rows.map((r) => `${r.nama} sisa ${r.stok}`).join(', ') : 'Stok masih aman semua.';
  }

  if (teks.includes('jaga') || teks.includes('shift') || teks.includes('giliran')) {
    const { rows } = await query('SELECT * FROM riwayat_jaga WHERE warung_id=$1 ORDER BY waktu DESC LIMIT 1', [wid]);
    if (!rows.length) return 'Belum ada serah terima tercatat hari ini.';
    const r = rows[0];
    return `Terakhir ${r.dari || '-'} menyerahkan ke ${r.ke}, uang laci ${rp(r.uang_laci)}.`;
  }

  // fallback terakhir: coba tebak nama produk yang disebut (mis. "harga indomie berapa")
  const { rows: semuaProduk } = await query('SELECT nama, harga, stok FROM produk WHERE warung_id=$1 AND aktif', [wid]);
  const p = cocokProdukTeks(semuaProduk, teks);
  if (p) return `${p.nama} harganya ${rp(p.harga)}, sisa stok ${p.stok}.`;

  return 'Maaf, aku belum paham. Coba tanya soal stok, untung, margin, kasbon, jaga, barang paling laris/ngendap, atau nama barang tertentu ya.';
}

// Kata kunci yang bikin DAFTAR RINCI pelanggan & kasbon ikut dikirim ke AI. Sengaja dibikin
// LONGGAR (lebih baik kelebihan ngirim daripada AI-nya jawab ngawur gara-gara datanya nggak ada):
// ongkos salah-kirim cuma token, ongkos salah-JAWAB itu kepercayaan pemilik warung.
const KATA_KUNCI_ORANG = [
  'pelanggan', 'langganan', 'pembeli', 'pembelinya', 'orang', 'siapa', 'nama',
  'utang', 'hutang', 'ngutang', 'kasbon', 'bon', 'lunas', 'lunasi', 'nyicil', 'cicil', 'nyaur',
  'bayar', 'nagih', 'tagih', 'piutang',
];

// Kumpulin data warung ini jadi 1 blok teks ringkas buat "dibaca" Gemini sebagai konteks -
// biar jawabannya berdasarkan angka ASLI (bukan ngarang), dan bisa jawab pertanyaan bebas di
// luar topik yang di-hardcode di jawabRuleBased.
//
// `pertanyaan` (huruf kecil semua) dipakai buat MILIH seberapa rinci konteksnya. Dulu SEMUA data
// (60 produk + 60 pelanggan + 15 kasbon) dikirim tiap pesan, bahkan pas user cuma nanya "untung
// hari ini berapa" - itu ~4.800 token input SEBELUM user ngetik apa-apa, dan daftar pelanggan
// (nama + no HP tetangga) ikut kekirim ke pihak ketiga tanpa ada yang butuh. Sekarang daftar
// rincinya cuma ikut kalau pertanyaannya emang nyangkut orang; selain itu cukup RINGKASAN angka.
async function bangunKonteks(wid, pertanyaan = '') {
  const perluRinciOrang = KATA_KUNCI_ORANG.some((k) => pertanyaan.includes(k));
  const awal = new Date();
  awal.setHours(0, 0, 0, 0);

  const [untungR, kasbonR, produkR, jagaR, pelangganR] = await Promise.all([
    query(
      `SELECT COALESCE(SUM(total) FILTER (WHERE mode='bayar'),0) AS omzet,
              COALESCE(SUM(total) FILTER (WHERE mode='bayar' AND COALESCE(metode,'Tunai')='Tunai'),0) AS tunai,
              COALESCE(SUM(total) FILTER (WHERE mode='kasbon'),0) AS kasbon,
              COALESCE(SUM(laba),0) AS untung, COUNT(*) AS trx
       FROM transaksi WHERE warung_id=$1 AND waktu >= $2`,
      [wid, awal.toISOString()]
    ),
    query('SELECT id, nama, jumlah FROM kasbon WHERE warung_id=$1 AND NOT lunas ORDER BY jumlah DESC LIMIT 15', [wid]),
    query('SELECT id, nama, harga, modal, stok, laku_per_hari, satuan, isi_kemasan, nama_kemasan FROM produk WHERE warung_id=$1 AND aktif ORDER BY nama LIMIT 60', [wid]),
    query('SELECT dari, ke, uang_laci, waktu FROM riwayat_jaga WHERE warung_id=$1 ORDER BY waktu DESC LIMIT 1', [wid]),
    // Kolom "wa" SENGAJA nggak diambil: nggak ada satu pun aturan prompt atau tipe aksi yang
    // makai nomor HP pelanggan - AI cuma butuh id + nama buat ngenalin orangnya. Ngirim nomor
    // tetangga ke Gemini/OpenRouter tanpa ada yang makai itu paparan data cuma-cuma.
    query('SELECT id, nama FROM pelanggan WHERE warung_id=$1 ORDER BY nama LIMIT 60', [wid]),
  ]);

  const kasbonRows = kasbonR.rows;
  const totalUtang = kasbonRows.reduce((a, r) => a + Number(r.jumlah), 0);
  const produkRows = produkR.rows;
  const modalStok = produkRows.reduce((a, p) => a + Number(p.stok) * Number(p.modal), 0);
  const jaga = jagaR.rows[0];
  const pelangganRows = pelangganR.rows;

  const baris = [];
  // Penjualan & untung DIPISAH dan dikasih nama tegas. Dulu konteks cuma berisi "Untung hari ini",
  // jadi pas user nanya "berapa penjualan hari ini", satu-satunya angka yang dipegang AI ya untung
  // - dan itu yang dia jawab (kejadian beneran: penjualan dijawab "untung bersih Rp34.000").
  const h = untungR.rows[0];
  baris.push(
    `Penjualan hari ini (uang yang masuk, di luar kasbon): ${rp(h.omzet)} - tunai ${rp(h.tunai)}, non-tunai/QRIS/transfer ${rp(Number(h.omzet) - Number(h.tunai))}. ` +
      `Barang keluar lewat kasbon hari ini: ${rp(h.kasbon)}. Untung bersih hari ini: ${rp(h.untung)}. Jumlah transaksi: ${h.trx}. ` +
      `(Penjualan/omzet/pemasukan BEDA dengan untung - jawab pakai angka yang ditanya.)`
  );
  const jualBarang = await dataPenjualanBarang(wid, pertanyaan);
  if (jualBarang) baris.push(penjualanBarangUntukAI(jualBarang));
  baris.push(
    // "id" disertain (dulu nggak, jadi AI cuma bisa NYEBUT kasbon siapa, nggak bisa ngusulin
    // lunasi/bayar - lihat aksi "lunasi_kasbon"/"bayar_kasbon" di tanyaGemini) - kasbonId ini yang
    // dipakai buat nentuin baris kasbon MANA yang dimaksud, BUKAN pelangganId (1 pelanggan bisa
    // punya beberapa baris kasbon kalau ngutang beberapa kali).
    //
    // Kalau pertanyaannya nggak nyangkut orang, yang dikirim CUMA angka ringkasannya - itu udah
    // cukup buat mayoritas pertanyaan ("total utang berapa"), tanpa ngirim daftar nama satu-satu.
    !kasbonRows.length
      ? 'Kasbon: tidak ada yang berutang, semua lunas.'
      : perluRinciOrang
        ? `Kasbon belum lunas (id | nama | jumlah), ${kasbonRows.length} baris total ${rp(totalUtang)}:\n` +
            kasbonRows.map((r) => `- ${r.id} | ${r.nama} | ${rp(r.jumlah)}`).join('\n')
        : `Kasbon belum lunas: ${kasbonRows.length} baris, total ${rp(totalUtang)}. (Daftar nama & id-nya TIDAK disertakan di pesan ini karena pertanyaannya nggak nyangkut utang/pelanggan - jangan bilang datanya nggak ada, minta user nyebut nama orangnya kalau mau diproses.)`
  );
  baris.push(`Total modal yang ketanam di stok: ${rp(modalStok)}, dari ${produkRows.length} jenis barang.`);
  baris.push(
    // "id" disertain di sini (bukan cuma buat manusia baca) - dipakai Gemini nentuin produkId pas
    // ngusulin "aksi" ubah/hapus/masuk-stok barang (lihat tanyaGemini). Bukan data rahasia (UUID
    // internal doang), aman ditaruh di konteks yang dikirim ke Gemini.
    // Angkanya ditulis POLOS (3500, bukan "Rp 3.500"; 120, bukan "stok 120") - nama kolomnya udah
    // dijelasin di header, jadi label yang diulang tiap baris itu cuma token kebuang. Di 60 barang
    // bedanya ratusan token per pesan. Kolomnya TETAP lengkap: "laku per hari" kepake buat saran
    // kulakan, "isi kemasan" kepake buat masuk-stok per dus - dibuang malah ngilangin fitur.
    'Daftar barang (id | nama | harga jual | modal | sisa stok | laku per hari | satuan | isi per kemasan besar | nama kemasan besar), semua angka rupiah polos tanpa titik:\n' +
      produkRows
        .map(
          (p) =>
            `- ${p.id} | ${p.nama} | ${p.harga} | ${p.modal} | ${p.stok} | ${Number(p.laku_per_hari).toFixed(1)} | ${p.satuan || 'pcs'} | ${p.isi_kemasan || 1} | ${p.nama_kemasan || '-'}`
        )
        .join('\n')
  );
  baris.push(
    // Dipakai buat aksi "tambah_pelanggan" (cek dulu nama yang disebut udah ada apa belum, biar
    // nggak dobel-daftarin orang yang sama) & buat nentuin pelangganId kalau nanti kasbon-nya
    // ditambahin lewat pelanggan (bukan langsung kasbonId).
    //
    // Blok INI yang paling boros: 60 pelanggan ~1.000 token, dikirim tiap pesan walau user cuma
    // nanya untung. Kalau nggak nyangkut orang, diganti hitungannya doang. Kalimat "jangan bilang
    // belum ada" itu PENTING - tanpa itu AI bakal ngira warungnya belum punya pelanggan sama
    // sekali dan jawab salah dengan yakin.
    !pelangganRows.length
      ? 'Belum ada pelanggan terdaftar.'
      : perluRinciOrang
        ? `Daftar pelanggan (id | nama):\n` + pelangganRows.map((p) => `- ${p.id} | ${p.nama}`).join('\n')
        : `Pelanggan terdaftar: ${pelangganRows.length} orang. (Daftar nama & id-nya TIDAK disertakan di pesan ini karena pertanyaannya nggak nyangkut pelanggan - JANGAN bilang belum ada pelanggan; kalau butuh, minta user nyebut namanya.)`
  );
  baris.push(
    jaga
      ? `Serah terima jaga terakhir: dari ${jaga.dari || '-'} ke ${jaga.ke}, uang laci ${rp(jaga.uang_laci)}.`
      : 'Belum ada riwayat serah terima jaga.'
  );

  // ID-set per domain ikut dibalikin (bukan cuma teks-nya) - dipakai router buat SANITASI id yang
  // diusulin AI (lihat validasiAksi) sebelum diteruskan ke frontend. Baik Gemini (schema ketat) atau
  // OpenRouter (cuma json_object mode, lebih longgar) sama-sama BISA ngarang/nyalah-ketik id - jangan
  // dipercaya mentah, apapun sumbernya/tipe aksinya.
  return {
    teks: baris.join('\n\n'),
    produkIds: new Set(produkRows.map((p) => p.id)),
    kasbonIds: new Set(kasbonRows.map((r) => r.id)),
    pelangganIds: new Set(pelangganRows.map((r) => r.id)),
  };
}

// Pertahanan lapis kedua di LUAR prompt/schema - kalau aksi nunjuk id (produk/kasbon/pelanggan) yang
// TERNYATA nggak ada di data warung ini (AI ngarang/nyalin id salah, kejadian pernah kepantau pas
// testing, terutama pas jalur OpenRouter yang skema JSON-nya nggak seketat Gemini), aksi-nya
// DIBUANG di sini - amannya nggak percaya validasi dari model manapun secara mentah, model APAPUN
// bisa halusinasi id yang nggak beneran ada. `data` dibiarin (frontend tetap bisa isi ulang manual).
function validasiAksi(aksi, { produkIds, kasbonIds }) {
  if (!aksi) return null;
  // Nama tipe LAMA ('ubah'/'hapus') MASIH diterima bareng nama baru ('ubah_produk' dst) - prompt AI
  // (gemini.service.js/openrouter.service.js) belum ikut diganti ke penamaan baru, jadi yang beneran
  // keluar dari model sekarang masih yang lama. Kalau di sini cuma ngecek nama baru, aksi bernama
  // lama bakal LOLOS TANPA DICEK id-nya sama sekali (pengaman ini mati diam-diam) - makanya dua-duanya
  // dicek sampai migrasi penamaannya kelar.
  const perluCekProduk = ['ubah', 'hapus', 'ubah_produk', 'hapus_produk', 'masuk_stok'];
  const perluCekKasbon = ['lunasi_kasbon', 'bayar_kasbon'];
  if (perluCekProduk.includes(aksi.tipe) && !produkIds.has(aksi.produkId)) return null;
  if (perluCekKasbon.includes(aksi.tipe) && !kasbonIds.has(aksi.kasbonId)) return null;

  // "catat_modal" tanpa nominal yang masuk akal nggak ada gunanya - malah bikin sheet kosong yang
  // bikin bingung. Prompt sudah nyuruh nanya dulu kalau angkanya belum disebut; ini jaring
  // pengamannya kalau model tetap ngirim aksi kosong.
  // Dua-duanya cuma berguna kalau nominalnya masuk akal - aksi tanpa angka bikin kartu kosong
  // yang bikin user bingung. Prompt udah nyuruh nanya dulu kalau angkanya belum disebut; ini
  // jaring pengamannya kalau model tetap ngirim aksi kosong.
  if (aksi.tipe === 'catat_modal' || aksi.tipe === 'target_penjualan') {
    const jumlah = Number(aksi.data?.jumlah);
    if (!Number.isFinite(jumlah) || jumlah <= 0) return null;
  }
  // "belanja_banyak" dipangkas di sini, BUKAN cuma diandelin ke prompt: batas 25 nahan sheet yang
  // kepanjangan, dan barang tanpa nama nggak mungkin dieksekusi jadi dibuang duluan.
  if (aksi.tipe === 'belanja_banyak') {
    const barang = Array.isArray(aksi.data?.barang)
      ? aksi.data.barang.filter((b) => b && String(b.nama || '').trim()).slice(0, 25)
      : [];
    if (!barang.length) return null;
    return { ...aksi, data: { ...aksi.data, barang } };
  }
  return aksi;
}

// AI Asisten "Mang Warung" (PRD 10.9, Fase 2). 3 lapis, dicoba berurutan sampai ada yang berhasil,
// biar fiturnya nggak pernah mati total: (1) Gemini - utama, natural & ngerti pertanyaan bebas,
// dikasih konteks data warung asli; (2) OpenRouter - cadangan, provider LAIN (lihat komentar di
// openrouter.service.js), dicoba kalau Gemini gagal/kena quota; (3) rule-based di atas - jawaban
// kaku dari keyword matching, jalan gratis & instan tanpa API luar sama sekali, dipanggil kalau
// dua-duanya gagal (atau belum diisi key-nya).
// Riwayat obrolan yang dikirim client dibatasi lagi di sini (bukan cuma percaya batasan yang
// udah dilakuin di frontend, lihat RIWAYAT_MAKS_TURN di Chat.jsx) - jaga-jaga client dimodif/
// dipanggil langsung nggak lewat app, jangan sampai bisa ngirim riwayat gede-gedean yang
// nge-bengkakin token/biaya panggilan Gemini.
const RIWAYAT_MAKS_TURN = 8;
const TEKS_RIWAYAT_MAKS_PANJANG = 800;

function bersihkanRiwayat(riwayat) {
  if (!Array.isArray(riwayat)) return [];
  return riwayat
    .slice(-RIWAYAT_MAKS_TURN * 2)
    .filter((r) => r && typeof r.teks === 'string' && r.teks.trim())
    .map((r) => ({ peran: r.peran === 'user' ? 'user' : 'model', teks: r.teks.trim().slice(0, TEKS_RIWAYAT_MAKS_PANJANG) }));
}

router.post('/tanya', async (req, res, next) => {
  try {
    const teksAsli = req.body.teks || '';
    const teks = teksAsli.toLowerCase();
    const riwayat = bersihkanRiwayat(req.body.riwayat);
    // Foto opsional (user kirim bareng pesan chat, misal foto barang yang mau didaftarin) - CUMA
    // dipakai Gemini (lihat tanyaGemini), OpenRouter/rule-based di bawah nggak baca gambar sama
    // sekali. Foto yang kegedean udah ketolak duluan di level express.json({limit:'2mb'}) (lihat
    // index.js) sebelum sempet nyampe ke sini - nggak perlu dicek ukurannya lagi manual.
    const fotoBase64 = typeof req.body.fotoBase64 === 'string' ? req.body.fotoBase64 : null;
    const wid = req.warungId;

    // `teks` = pertanyaan huruf kecil - dipakai bangunKonteks buat mutusin daftar rinci
    // pelanggan/kasbon perlu ikut apa nggak (lihat KATA_KUNCI_ORANG di sana).
    const { teks: konteks, ...idSet } = await bangunKonteks(wid, teks); // idSet = {produkIds, kasbonIds, pelangganIds} buat validasiAksi
    let jatahHabis = false;

    try {
      const { jawaban, aksi } = await tanyaGemini({ pertanyaan: teksAsli, konteks, riwayat, fotoBase64, warungId: wid });
      return res.json({ jawaban, aksi: validasiAksi(aksi, idSet), sumber: 'gemini' });
    } catch (e) {
      // gagal manggil Gemini (bukan error server kita) - log biar ketauan pas debug (status HTTP
      // ikut dicatat: 429=kena quota/rate-limit, 403=key bermasalah, 502=timeout/nggak nyambung).
      // Sebelum jatuh ke rule-based, coba dulu lewat OpenRouter (provider LAIN, lihat komentar di
      // openrouter.service.js) - biar user tetap dapet jawaban natural dari AI beneran, bukan
      // langsung ke jawaban kaku rule-based cuma gara-gara Gemini spesifik lagi bermasalah.
      console.warn(`[asisten] Gemini gagal (status ${e.status || '?'}), coba OpenRouter:`, e.message);
      // Dicatat kenapanya, BUKAN cuma kalau gagal. Jatuh ke rule-based gara-gara JATAH HABIS itu
      // beda arti sama gara-gara Gemini lagi down: yang pertama user bisa tindak-lanjutin (nunggu
      // reset / upgrade), yang kedua cuma bisa nunggu. Tanpa dibedain, dua-duanya keluar sebagai
      // jawaban kaku yang sama dan user ngiranya AI-nya tiba-tiba bego.
      if (e.jatahAiHabis) jatahHabis = true;
    }

    try {
      // OpenRouter juga bisa ngusulin `aksi` (tambah/ubah/hapus barang) DAN baca foto (fotoBase64
      // ikut dikirim, model OpenRouter-nya vision-capable - lihat openrouter.service.js) - jadi
      // kalau user lampirin foto pas Gemini lagi down, tetap kebaca, nggak "buta".
      const { jawaban, aksi } = await tanyaOpenRouter({ pertanyaan: teksAsli, konteks, riwayat, fotoBase64, warungId: wid });
      return res.json({ jawaban, aksi: validasiAksi(aksi, idSet), sumber: 'openrouter' });
    } catch (e) {
      // OpenRouter juga gagal (atau belum diisi key-nya - itu normal/opsional, bukan error harus
      // dikhawatirin) - baru jatuh ke rule-based, biar fiturnya nggak pernah mati total.
      console.warn(`[asisten] OpenRouter gagal (status ${e.status || '?'}), fallback ke rule-based:`, e.message);
      if (e.jatahAiHabis) jatahHabis = true;
      const jawaban = await jawabRuleBased(teks, wid);
      // `jatahAiHabis` di sini BUKAN error (statusnya tetap 200 & user tetap dapet jawaban) -
      // cuma penanda buat frontend nampilin keterangan "lagi mode hemat", biar user ngerti
      // kenapa jawabannya mendadak kaku dan tau apa yang bisa dia lakuin.
      return res.json({ jawaban, aksi: null, sumber: 'rule-based', jatahAiHabis: jatahHabis });
    }
  } catch (e) {
    next(e);
  }
});

// Diekspor terpisah buat diuji langsung ke database, tanpa lewat HTTP & AI.
export { bangunKonteks, dataPenjualanBarang, penjualanBarangUntukUser };
export default router;
