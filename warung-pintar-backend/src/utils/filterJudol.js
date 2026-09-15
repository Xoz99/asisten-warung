// Filter promosi judi online ("judol") di Komunitas - postingan & komentar dari warung lain dicek di server
// sebelum disimpan, dan yang udah terlanjur masuk disembunyiin dari feed.
//
// Spam judol biasanya ngakalin filter kata: huruf diganti angka (g4c0r, t0g3l), dikasih spasi/titik di antara
// huruf (s l o t, s.l.o.t), atau huruf diulang (gacooor). Makanya teks dinormalisasi dulu, dan istilah KUAT dicek
// juga di versi "rapat" (semua spasi & tanda baca dibuang).
//
// Sengaja pakai SKOR, bukan satu kata langsung blokir: kata kayak "gacor" (dagangan gacor), "bonus" (bonus dari
// supplier), "depo" (depo air), "slot" (slot parkir) itu wajar di obrolan warung. Kata umum gitu baru ngeblokir
// kalau muncul barengan beberapa, atau barengan link.

// Istilah yang praktis cuma dipakai promosi judi - satu aja udah cukup buat blokir. Ditulis tanpa spasi karena
// dicocokin ke teks versi rapat.
const ISTILAH_KUAT = [
  'judionline', 'judol', 'slotgacor', 'situsslot', 'slotonline', 'agenslot', 'bandarslot', 'bandartogel', 'togel',
  'totomacau', 'totosgp', 'totohk', 'sbobet', 'maxwin', 'rtplive', 'rtpslot', 'bocoranrtp', 'bocoranslot', 'polagacor',
  'polaslot', 'scatterhitam', 'mahjongways', 'gatesofolympus', 'sweetbonanza', 'pragmaticplay', 'bonusnewmember',
  'depositpulsa', 'depopulsa', 'antirungkad', 'jpparah', 'jppaus', 'slotdana', 'slotpulsa', 'casinoonline', 'kasinoonline',
  'pokeronline', 'dominoqq', 'bandarq', 'linkalternatif', 'situsgacor', 'akunpro', 'slotthailand', 'slotkamboja',
  'wdberapapun', 'depo10k', 'depo5k', 'depo20k', 'depo25k', 'depo50k', 'freespin', 'buyspin',
];
// slot88, gacor77, dst - merek situs slot hampir selalu kata + angka
const POLA_KUAT = [/(slot|gacor|toto|togel|maxwin|hoki|cuan|jp)\d{2,}/, /\d{2,}(slot|gacor|toto|togel|bet)/];

// Kata yang wajar di obrolan biasa, tapi sering nongol bareng di promosi judol - dihitung skornya.
const KATA_LEMAH = [
  'gacor', 'slot', 'jackpot', 'jp', 'depo', 'deposit', 'wd', 'withdraw', 'bonus', 'daftar', 'link', 'rtp', 'zeus',
  'pragmatic', 'casino', 'kasino', 'poker', 'taruhan', 'bandar', 'cuan', 'scatter', 'spin', 'freebet', 'hoki', 'menang',
  'jutaan', 'modal receh', 'bet', 'situs', 'rungkad', 'member', 'olympus', 'mahjong', 'pola', 'dijamin',
];
// Domain link yang namanya bau situs judi
const POLA_DOMAIN_JUDI = /(slot|toto|togel|gacor|judi|casino|kasino|poker|sbobet|maxwin|bet\d|\dbet|qq|jp\d|hoki\d|win\d{2})/;

const PETA_ANGKA = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's' };

function normalisasi(teks) {
  return String(teks || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // huruf beraksen/fancy unicode -> huruf biasa
    .toLowerCase();
}

// Versi "rapat": angka pengganti huruf dibalikin, semua selain huruf/angka dibuang, huruf yang diulang
// (gacooor) diringkas. Angka yang BENERAN angka ("depo 10k", "slot88") tetap dicek di versi tanpa ganti angka.
function rapatkan(teks, gantiAngka) {
  let t = teks;
  if (gantiAngka) t = t.replace(/[013457@$8]/g, (c) => PETA_ANGKA[c]);
  return t.replace(/[^a-z0-9]/g, '').replace(/([a-z])\1{2,}/g, '$1');
}

export function nilaiJudol(...potongan) {
  const asli = normalisasi(potongan.filter(Boolean).join(' '));
  if (!asli.trim()) return { blokir: false, skor: 0, alasan: [] };
  const rapatHuruf = rapatkan(asli, true);
  const rapatAngka = rapatkan(asli, false);
  const alasan = [];

  for (const istilah of ISTILAH_KUAT) {
    if (rapatHuruf.includes(istilah) || rapatAngka.includes(istilah)) alasan.push(istilah);
  }
  for (const pola of POLA_KUAT) {
    const m = rapatAngka.match(pola);
    if (m) alasan.push(m[0]);
  }
  if (alasan.length) return { blokir: true, skor: 10, alasan };

  // Kata lemah dihitung per kata utuh (teks dengan angka pengganti dibalikin tapi spasi dipertahankan)
  const berkata = asli.replace(/[013457@$8]/g, (c) => PETA_ANGKA[c]).replace(/([a-z])\1{2,}/g, '$1');
  let skor = 0;
  for (const kata of KATA_LEMAH) {
    const pola = new RegExp(`(^|[^a-z])${kata.replace(' ', '\\s+')}([^a-z]|$)`);
    if (pola.test(berkata)) {
      skor += 1;
      alasan.push(kata);
    }
  }
  const link = asli.match(/(?:https?:\/\/|www\.)[^\s]+|\b[a-z0-9-]+\.(?:com|net|org|xyz|site|online|top|vip|live|club|id|me|io|link|pro|bet|win|asia|cc)\b/g) || [];
  if (link.some((l) => POLA_DOMAIN_JUDI.test(l))) {
    skor += 3;
    alasan.push('domain judi');
  } else if (link.length) {
    skor += 1;
    alasan.push('link');
  }
  return { blokir: skor >= 3, skor, alasan };
}

export const PESAN_DIBLOKIR = 'Postingan ini kedeteksi promosi judi online, jadi nggak bisa dikirim. Komunitas ini khusus buat obrolan dagangan warung.';
