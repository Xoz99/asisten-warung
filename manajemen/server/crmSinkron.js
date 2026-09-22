import { query, pool } from './db.js';
import { pastikanTabelOps } from './ops.routes.js';
import { pastikanTabelSales, query as queryWp } from './produk/warung-pintar/db.js';

// Warung yang daftar Asisten Warung lewat link/QR/kode sales otomatis jadi kartu CRM (mj_lead) milik akun sales itu.
// Dua database beda (Warung Pintar vs Makalin), jadi nggak bisa pakai trigger - disinkron pas halaman CRM / Toko
// dibuka (paling sering sekali per JEDA). Kartunya ditandai warung_id biar nggak dobel.
//   - Kartu yang udah ada dari kunjungan (nama toko / nomor HP sama, sales sama) disambungin, bukan dibikin baru.
//   - Tahap ikut status toko, tapi cuma NAIK (Awareness → Trial → Konversi → Repeat order); Trial yang habis tanpa
//     bayar jadi Stuck. Tahap yang diubah manual ke atas nggak diturunin.
//   - Toko pindah sales → kartu ikut pindah pemilik. Kartu otomatis yang dihapus admin nggak dibikin ulang.
// Toko tanpa sales (daftar sendiri / house account) nggak dibikinin kartu.
const JEDA_MS = 60 * 1000;
const URUTAN = { awareness: 0, stuck: 0, trial: 1, konversi: 2, repeat_order: 3 };
const NAMA_TAHAP = { awareness: 'Awareness', trial: 'Trial 7 hari', konversi: 'Konversi', repeat_order: 'Repeat order', stuck: 'Stuck' };
const SUMBER = { link: 'Daftar lewat link/QR sales', kode: 'Daftar pakai kode sales' };
const angkaHp = (h) => (h || '').replace(/\D/g, '').replace(/^0/, '62');

let siap = null;
function pastikanKolom() {
  if (!siap) {
    siap = (async () => {
      await pastikanTabelOps();
      await pastikanTabelSales();
      await query('ALTER TABLE mj_lead ADD COLUMN IF NOT EXISTS warung_id UUID');
      await query('CREATE UNIQUE INDEX IF NOT EXISTS idx_mj_lead_warung ON mj_lead (warung_id) WHERE warung_id IS NOT NULL');
      // Kartu otomatis yang dihapus admin nggak dibikin ulang.
      await query('CREATE TABLE IF NOT EXISTS mj_crm_abaikan (warung_id UUID PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT now())');
    })().catch((e) => {
      siap = null;
      throw e;
    });
  }
  return siap;
}

export function tahapDariWarung(w) {
  if (w.jumlah_bayar >= 2) return 'repeat_order';
  if (w.jumlah_bayar === 1 || w.plan !== 'trial') return 'konversi';
  return w.trial_aktif ? 'trial' : 'stuck';
}
// Tahap baru buat kartu yang udah ada: cuma naik, kecuali Trial habis → Stuck.
function tahapBaru(lama, dariToko) {
  if (dariToko === 'stuck') return lama === 'trial' ? 'stuck' : null;
  return URUTAN[dariToko] > (URUTAN[lama] ?? 0) ? dariToko : null;
}

let terakhir = 0;
let jalan = null;
// `paksa` = abaikan jeda (dipakai tes). Gagal sinkron nggak boleh ngegagalin halaman yang manggil.
export function sinkronWarungKeCrm({ paksa = false } = {}) {
  if (jalan) return jalan;
  if (!paksa && Date.now() - terakhir < JEDA_MS) return Promise.resolve(null);
  jalan = sinkron()
    .catch((e) => {
      console.error('Sinkron warung ke CRM gagal:', e.message);
      return null;
    })
    .finally(() => {
      terakhir = Date.now();
      jalan = null;
    });
  return jalan;
}

async function sinkron() {
  await pastikanKolom();
  const [{ rows: warung }, { rows: akun }, { rows: kartu }] = await Promise.all([
    queryWp(
      `SELECT w.id, w.nama, w.username, w.no_hp, w.plan, w.created_at, (w.lisensi_berlaku_sampai > now()) AS trial_aktif,
              k.sales_id, a.sumber AS sumber_daftar,
              (SELECT count(*)::int FROM pembayaran p WHERE p.warung_id = w.id AND p.status = 'settlement') AS jumlah_bayar
       FROM warung w
       JOIN kepemilikan_warung k ON k.warung_id = w.id AND k.valid_to IS NULL AND k.sales_id IS NOT NULL
       LEFT JOIN atribusi_warung a ON a.warung_id = w.id
       WHERE NOT COALESCE(w.demo, false)`
    ),
    query(`SELECT DISTINCT ON (wp_sales_id) id, nama, wp_sales_id FROM mj_admin WHERE peran = 'sales' AND wp_sales_id IS NOT NULL ORDER BY wp_sales_id, aktif DESC, created_at`),
    query(`SELECT id, perusahaan, telepon, tahap, pemilik_id, warung_id, hasil FROM mj_lead`),
  ]);
  const { rows: abaikan } = await query('SELECT warung_id FROM mj_crm_abaikan');
  const diabaikan = new Set(abaikan.map((r) => r.warung_id));
  const akunPerSales = Object.fromEntries(akun.map((a) => [a.wp_sales_id, a]));
  const perWarung = new Map(kartu.filter((k) => k.warung_id).map((k) => [k.warung_id, k]));
  const bebas = kartu.filter((k) => !k.warung_id);
  const hasil = { baru: 0, disambung: 0, naik: 0, pindah: 0 };

  for (const w of warung) {
    const a = akunPerSales[w.sales_id];
    if (!a) continue; // sales ini belum punya akun Makalin - kartunya nyusul begitu akunnya disambungin
    if (diabaikan.has(w.id) && !perWarung.has(w.id)) continue;
    const tahapToko = tahapDariWarung(w);
    const ada = perWarung.get(w.id);
    if (ada && ada.pemilik_id === a.id && (ada.hasil || !tahapBaru(ada.tahap, tahapToko))) continue; // nggak ada yang berubah
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const catat = (id, jenis, isi) => c.query("INSERT INTO mj_lead_aktivitas (lead_id, admin_nama, jenis, isi) VALUES ($1,'(otomatis)',$2,$3)", [id, jenis, isi]);
      let k = perWarung.get(w.id);
      if (!k) {
        // Kartu dari kunjungan sebelum toko ini daftar: nomor HP atau nama toko sama, pemiliknya sales yang sama.
        const i = bebas.findIndex(
          (x) => x.pemilik_id === a.id && ((w.no_hp && angkaHp(x.telepon) === angkaHp(w.no_hp)) || (x.perusahaan || '').trim().toLowerCase() === (w.nama || '').trim().toLowerCase())
        );
        if (i >= 0) {
          k = bebas.splice(i, 1)[0];
          const { rowCount } = await c.query('UPDATE mj_lead SET warung_id=$2, telepon=COALESCE(telepon,$3), updated_at=now() WHERE id=$1 AND warung_id IS NULL', [k.id, w.id, w.no_hp]);
          if (rowCount) {
            await catat(k.id, 'tahap', `Toko ini udah daftar Asisten Warung (@${w.username}) lewat ${a.nama}`);
            hasil.disambung++;
          }
        } else {
          const { rows } = await c.query(
            `INSERT INTO mj_lead (perusahaan, telepon, sumber, tahap, pemilik_id, warung_id, created_at, tahap_sejak)
             VALUES ($1,$2,$3,$4,$5,$6,$7,now()) ON CONFLICT (warung_id) WHERE warung_id IS NOT NULL DO NOTHING RETURNING *`,
            [w.nama, w.no_hp, SUMBER[w.sumber_daftar] || 'Toko dari sales', tahapToko, a.id, w.id, w.created_at]
          );
          if (rows.length) {
            await catat(rows[0].id, 'tahap', `Kartu dibuat otomatis: toko daftar Asisten Warung (@${w.username}) lewat ${a.nama}, tahap ${NAMA_TAHAP[tahapToko]}`);
            hasil.baru++;
          }
          await c.query('COMMIT');
          continue;
        }
      }
      if (k.pemilik_id !== a.id) {
        await c.query('UPDATE mj_lead SET pemilik_id=$2, updated_at=now() WHERE id=$1', [k.id, a.id]);
        await catat(k.id, 'tahap', `Toko pindah ke sales ${a.nama}`);
        hasil.pindah++;
      }
      const naik = k.hasil ? null : tahapBaru(k.tahap, tahapToko);
      if (naik) {
        await c.query('UPDATE mj_lead SET tahap=$2, tahap_sejak=now(), updated_at=now() WHERE id=$1', [k.id, naik]);
        await catat(k.id, 'tahap', `Tahap otomatis: ${NAMA_TAHAP[k.tahap] || k.tahap} → ${NAMA_TAHAP[naik]} (${naik === 'stuck' ? 'trial habis, belum bayar' : naik === 'trial' ? 'mulai trial' : naik === 'konversi' ? 'bayar pertama' : 'bayar lagi'})`);
        hasil.naik++;
      }
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
  return hasil;
}
