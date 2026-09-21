import { query } from '../db.js';

// Daftar kulakan (belanja ulang stok) DIHITUNG DARI DATA ASLI - bukan ditebak AI. Dulu Mang AI disuruh "nyusun daftar
// belanja" tanpa dikasih tau barang mana yang tipis, jadi dia ngarang barang umum (Indomie, minyak, kopi...) yang
// bahkan nggak ada di katalog warungnya, lengkap sama harga & stok karangan.
//
// Laju jual dihitung dari transaksi 30 hari terakhir, BUKAN kolom produk.laku_per_hari (kolom itu cuma diisi data demo
// & nggak pernah di-update pas ada penjualan, jadi di warung beneran isinya 0 terus).
const JENDELA_HARI = 30;
export const BATAS_HARI_TIPIS = 7; // stok yang cuma cukup < 7 hari dianggap tipis
export const TARGET_HARI = 14; // usul beli sampai stok cukup ~2 minggu
const STOK_HAMPIR_HABIS = 2; // barang yang belum pernah kejual: dianggap perlu dikulak kalau sisa segini atau kurang

export async function hitungKulakan(wid) {
  const { rows } = await query(
    `WITH data AS (
       SELECT GREATEST(1, LEAST($2::int, CEIL(EXTRACT(EPOCH FROM now() - MIN(t.waktu)) / 86400)))::int AS hari
       FROM transaksi t WHERE t.warung_id=$1 AND t.waktu >= now() - ($2 || ' days')::interval
     ), jual AS (
       SELECT ti.produk_id, SUM(ti.qty)::float AS qty
       FROM transaksi_item ti JOIN transaksi t ON t.id = ti.transaksi_id
       WHERE t.warung_id=$1 AND t.waktu >= now() - ($2 || ' days')::interval AND ti.produk_id IS NOT NULL
       GROUP BY ti.produk_id
     )
     SELECT p.id, p.nama, p.stok, p.modal::float AS modal, p.satuan, p.isi_kemasan, p.nama_kemasan,
            COALESCE(j.qty, 0) AS terjual, COALESCE((SELECT hari FROM data), 1) AS hari
     FROM produk p LEFT JOIN jual j ON j.produk_id = p.id
     WHERE p.warung_id=$1 AND p.aktif`,
    [wid, JENDELA_HARI]
  );

  const semua = rows.map((p) => {
    const laku = p.terjual / p.hari;
    const stok = Number(p.stok);
    const sisaHari = laku > 0 ? stok / laku : null;
    let usulBeli = null;
    if (laku > 0) {
      usulBeli = Math.max(0, Math.ceil(laku * TARGET_HARI - stok));
      // Kulakan per dus/karton: dibulatin ke atas ke kelipatan isi kemasan.
      const isi = Number(p.isi_kemasan) || 1;
      if (isi > 1 && usulBeli > 0) usulBeli = Math.ceil(usulBeli / isi) * isi;
    }
    const tipis = laku > 0 ? sisaHari < BATAS_HARI_TIPIS : stok <= STOK_HAMPIR_HABIS;
    return { ...p, stok, laku, sisaHari, usulBeli, tipis };
  });

  const urut = (a, b) => (a.sisaHari ?? (a.stok > 0 ? 999 : -1)) - (b.sisaHari ?? (b.stok > 0 ? 999 : -1));
  const tipis = semua.filter((p) => p.tipis).sort(urut);
  // Buat jawaban "stok masih aman": barang laku yang paling cepet abis berikutnya.
  const berikutnya = semua.filter((p) => !p.tipis && p.laku > 0).sort(urut).slice(0, 5);
  const laku = new Map(semua.map((p) => [p.id, p.laku]));
  return { tipis, berikutnya, laku, hariData: rows[0]?.hari || 0, adaPenjualan: semua.some((p) => p.laku > 0) };
}

const angka = (n) => Number(n.toFixed(1)).toString();

export function usulBeliTeks(p) {
  if (p.usulBeli == null) return 'belum ada data penjualan - tentuin sendiri';
  const sat = p.satuan || 'pcs';
  const isi = Number(p.isi_kemasan) || 1;
  if (isi > 1 && p.usulBeli >= isi) return `${p.usulBeli} ${sat} (${p.usulBeli / isi} ${p.nama_kemasan || 'dus'})`;
  return `${p.usulBeli} ${sat}`;
}

// Blok konteks buat Mang AI.
export function kulakanUntukAI(k) {
  const kepala =
    `Barang yang PERLU DIKULAK (dihitung sistem dari stok & penjualan asli ${k.hariData || 0} hari terakhir; ` +
    `"tipis" = stok cuma cukup < ${BATAS_HARI_TIPIS} hari, atau belum pernah kejual & sisa <= ${STOK_HAMPIR_HABIS}; ` +
    `usul beli = biar cukup ~${TARGET_HARI} hari):`;
  if (!k.tipis.length) {
    return (
      `${kepala} TIDAK ADA - stok masih aman semua.` +
      (k.berikutnya.length
        ? ` Yang paling cepet abis berikutnya (kalau user tetap mau belanja sekarang):\n` +
          k.berikutnya.map((p) => `- ${p.nama} | sisa ${p.stok} ${p.satuan || 'pcs'} | cukup ~${Math.floor(p.sisaHari)} hari | usul beli ${usulBeliTeks(p)} | modal ${p.modal}`).join('\n')
        : '')
    );
  }
  return (
    `${kepala}\n(id | nama | sisa stok | laku per hari | cukup buat berapa hari | usul beli | modal satuan)\n` +
    k.tipis
      .slice(0, 25)
      .map(
        (p) =>
          `- ${p.id} | ${p.nama} | ${p.stok} ${p.satuan || 'pcs'} | ${angka(p.laku)} | ${p.sisaHari == null ? '-' : Math.floor(p.sisaHari)} | ${usulBeliTeks(p)} | ${p.modal}`
      )
      .join('\n')
  );
}

// Aturan prompt (Gemini & OpenRouter) buat pertanyaan kulakan. Ditaruh di sini biar dua prompt itu nggak beda aturan.
export const ATURAN_KULAKAN = `KULAKAN / BELANJA STOK (user nanya mau belanja/kulakan/nyetok apa, barang apa yang tipis/habis/harus dibeli,
mau ke grosir/pasar beli apa): jawab CUMA dari blok "Barang yang PERLU DIKULAK" di data di bawah - itu dihitung
sistem dari stok & penjualan asli. Sebut tiap barang: nama, sisa stok, dan usul belinya (angka & satuannya disalin
dari blok itu, jangan dihitung ulang). DILARANG nyebut barang yang nggak ada di blok itu (apalagi yang nggak ada di
"Daftar barang" - itu barang karangan), DILARANG ngarang harga/stok, dan "aksi" WAJIB null (JANGAN pakai
"belanja_banyak" - itu buat nambah barang BARU ke katalog, bukan kulakan barang yang udah ada; kalau dipakai, pas
disetujui malah jadi barang dobel). Kalau bloknya bilang TIDAK ADA, bilang terus terang belum ada yang tipis (stok masih aman),
terus kalau dia tetap mau belanja, sebut yang paling cepet abis berikutnya + usul belinya dari blok itu. Kalau usul belinya "belum ada data penjualan", bilang jumlahnya dia tentuin sendiri.
Boleh sebut perkiraan modal kalau ditanya: usul beli x modal satuan dari blok itu.`;
