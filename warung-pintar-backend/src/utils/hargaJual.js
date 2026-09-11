// Tiga pilihan harga jual dari perkiraan KULAKAN & HARGA PASARAN.
//
// Kenapa nggak cukup satu angka (cara lama): AI cuma ngasih "hargaPerkiraan", pemilik warung
// nerima apa adanya atau nolak mentah-mentah - nggak ada ruang buat mutusin mau strategi apa.
// Padahal keputusan harga itu keputusan DAGANG: mau laku cepat, ikut tetangga, atau ambil untung
// lebih karena barangnya nggak ada di warung sebelah.
//
// Kenapa patokannya HARGA PASARAN, bukan margin dari modal: pembeli warung itu tetangga sendiri
// yang hafal harga. Barang yang dipasang jauh di atas warung sebelah nggak akan laku berapa pun
// marginnya "sehat" di atas kertas. Jadi pasaran yang jadi jangkar, modal yang jadi lantai.
// Kelipatan pembulatan IKUT BESARNYA HARGA. Dulu dipatok Rp500 dan itu kekasaran buat barang
// murah: Indomie modal 2.800 pasaran 3.500 bikin "Murah" & "Normal" jatuh ke angka yang SAMA
// (3.500) - tiga pilihan yang dua-duanya kembar kelihatan kayak rusak, bukan kayak pilihan.
function langkahBulat(harga) {
  if (harga < 5000) return 100;
  if (harga < 20000) return 500;
  return 1000;
}
const bulatkan = (n) => {
  const l = langkahBulat(n);
  return Math.max(l, Math.round(n / l) * l);
};

export function opsiHargaJual(modal, pasaran) {
  const m = Math.max(0, Number(modal) || 0);
  const p = Math.max(0, Number(pasaran) || 0);
  if (!p) return [];

  // Lantai: jangan pernah nyaranin harga yang untungnya tipis banget atau malah rugi. 8% di atas
  // modal itu batas bawah yang masih masuk akal buat barang cepat laku (rokok/sembako).
  const lantai = m ? m * 1.08 : 0;

  let murah = bulatkan(Math.max(p * 0.93, lantai));
  let normal = bulatkan(Math.max(p, lantai));
  let tebal = bulatkan(Math.max(p * 1.12, lantai));

  // Pastikan ketiganya BEDA. Pembulatan bisa bikin dua pilihan ketemu di angka yang sama; kalau
  // itu kejadian, yang digeser adalah yang pinggir (murah turun / tebal naik) - bukan yang
  // "Normal", karena Normal itu jangkarnya: dia harus tetap sama persis sama harga pasaran.
  const langkah = langkahBulat(normal);
  if (murah >= normal) murah = Math.max(bulatkan(lantai), normal - langkah);
  if (tebal <= normal) tebal = normal + langkah;
  // Kalau setelah digeser si "murah" jadi di bawah lantai (barang yang marginnya emang mepet
  // banget kayak rokok), dia disamain sama normal & nanti disaring di bawah - lebih baik
  // nampilin DUA pilihan yang jujur daripada tiga yang satunya bikin warung rugi.
  if (m && murah < lantai) murah = normal;

  // Keterangan tiap pilihan sengaja dipendekin (2-3 kata): di HP 360px, kartunya ngebagi baris
  // sama nominal harga di sebelah kanan - kalimat panjang bikin kartunya jadi 3 baris & nominalnya
  // kedesek, padahal nominal itu yang paling dicari mata.
  const kandidat = [
    { id: 'murah', label: 'Murah', sub: 'Biar laku cepat', harga: murah },
    { id: 'normal', label: 'Normal', sub: 'Ikut harga pasaran', harga: normal },
    { id: 'tebal', label: 'Untung tebal', sub: 'Kalau nggak ada saingan', harga: tebal },
  ];

  return kandidat
    // Buang pilihan kembar (lihat catatan lantai di atas). Yang DIPERTAHANKAN harus "Normal",
    // bukan sekadar yang muncul duluan: buat barang bermargin mepet (rokok), "murah" kepaksa naik
    // sampai nempel harga pasaran - kalau yang disimpen label "Murah", pemilik warung dikasih tau
    // harga pasaran tapi dibilang itu harga murah. Salah arah & bikin dia salah ambil keputusan.
    .filter((k, i, arr) => {
      const kembar = arr.filter((x) => x.harga === k.harga);
      if (kembar.length === 1) return true;
      const adaNormal = kembar.some((x) => x.id === 'normal');
      return adaNormal ? k.id === 'normal' : arr.findIndex((x) => x.harga === k.harga) === i;
    })
    .map((k) => ({
      ...k,
      // Untung per satuan & persennya ikut dikirim - ini yang bikin pemilik warung bisa MEMUTUSKAN,
      // bukan cuma milih angka. "Untung Rp 1.500 (23%)" jauh lebih kebayang daripada harga telanjang.
      untung: m ? k.harga - m : null,
      persen: m && k.harga ? Math.round(((k.harga - m) / k.harga) * 100) : null,
    }));
}
