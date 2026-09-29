import { query } from '../db.js';

// Notifikasi ke HP warung (APK Asisten Warung) TANPA Firebase: backend nyimpen notifikasinya di tabel ini, APK
// ngecek sendiri tiap ±15 menit (WorkManager Android, lihat NotifWorker.java) lewat GET /api/notif-hp/baru, lalu
// nampilin yang baru sebagai notifikasi sistem - walau aplikasinya lagi ditutup.
//
// Semua pemicu notifikasi cukup manggil kirimNotifHp(). `kunci` (opsional) = penanda biar notifikasi yang sama
// nggak kekirim dobel (mis. "lisensi-3hari-2026-09-29").
let siap = null;
function pastikanTabel() {
  if (!siap) {
    siap = (async () => {
      await query(`CREATE TABLE IF NOT EXISTS notif_hp (
        id BIGSERIAL PRIMARY KEY,
        warung_id UUID NOT NULL REFERENCES warung(id) ON DELETE CASCADE,
        judul TEXT NOT NULL,
        isi TEXT NOT NULL,
        layar TEXT,
        kunci TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      )`);
      await query('CREATE INDEX IF NOT EXISTS idx_notif_hp_warung ON notif_hp (warung_id, id)');
      await query('CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_hp_kunci ON notif_hp (warung_id, kunci) WHERE kunci IS NOT NULL');
      // Notif yang udah lewat sebulan nggak ada gunanya disimpen lagi.
      await query("DELETE FROM notif_hp WHERE created_at < now() - interval '30 days'");
    })().catch((e) => {
      siap = null;
      throw e;
    });
  }
  return siap;
}

export async function kirimNotifHp(warungId, { judul, isi, layar = null, kunci = null }) {
  if (!warungId || !judul) return;
  try {
    await pastikanTabel();
    await query(
      'INSERT INTO notif_hp (warung_id, judul, isi, layar, kunci) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (warung_id, kunci) WHERE kunci IS NOT NULL DO NOTHING',
      [warungId, String(judul).slice(0, 120), String(isi || '').slice(0, 300), layar, kunci]
    );
  } catch (e) {
    // Notifikasi gagal dicatat nggak boleh bikin aksi utamanya (komentar, pembayaran, dst) ikut gagal.
    console.warn('[notif-hp] gagal nyimpen:', e.message);
  }
}

// Pengingat yang dihitung pas HP ngecek (bukan dari event): langganan mau habis <= 3 hari lagi, sekali sehari.
async function pengingatLangganan(warungId) {
  const { rows } = await query('SELECT lisensi_berlaku_sampai, COALESCE((to_jsonb(w) ->> \'demo\')::boolean, false) AS demo FROM warung w WHERE id=$1', [warungId]);
  const w = rows[0];
  if (!w || w.demo || !w.lisensi_berlaku_sampai) return;
  const sisaHari = Math.ceil((new Date(w.lisensi_berlaku_sampai).getTime() - Date.now()) / 86400000);
  if (sisaHari < 0 || sisaHari > 3) return;
  const hariIni = new Date().toISOString().slice(0, 10);
  await kirimNotifHp(warungId, {
    judul: sisaHari === 0 ? 'Langganan habis hari ini' : `Langganan habis ${sisaHari} hari lagi`,
    isi: 'Perpanjang sekarang biar catatan jualan, stok & Mang AI tetap jalan tanpa putus.',
    layar: 's-lainnya',
    kunci: `langganan-${hariIni}`,
  });
}

// Notif yang lebih baru dari `sejak`. `sejak` kosong (HP baru pertama kali ngecek) = cuma balikin id terakhir,
// biar HP nggak kebanjiran notif lama.
export async function ambilNotifBaru(warungId, sejak) {
  await pastikanTabel();
  await pengingatLangganan(warungId).catch((e) => console.warn('[notif-hp] pengingat langganan:', e.message));
  if (!sejak) {
    const { rows } = await query('SELECT COALESCE(max(id), 0)::text AS id FROM notif_hp WHERE warung_id=$1', [warungId]);
    // Pengingat langganan yang barusan dibikin tetap dikirim walau ini pengecekan pertama.
    const { rows: hariIni } = await query(
      "SELECT id::text, judul, isi, layar FROM notif_hp WHERE warung_id=$1 AND kunci LIKE 'langganan-%' AND created_at > now() - interval '1 day' ORDER BY id",
      [warungId]
    );
    return { terakhir: rows[0].id, notif: hariIni };
  }
  const { rows } = await query('SELECT id::text, judul, isi, layar FROM notif_hp WHERE warung_id=$1 AND id > $2 ORDER BY id LIMIT 20', [warungId, sejak]);
  return { terakhir: rows.length ? rows[rows.length - 1].id : String(sejak), notif: rows };
}
