// Cache lokal (IndexedDB via `idb`) buat data warung - biar app tetap kepake baca & catat
// transaksi walau internet putus sebentar. Server (Postgres) tetap source of truth permanen;
// ini cuma cache/antrean, BUKAN pengganti backend (lihat dataCache.js & outbox.js buat pemakaiannya).
//
// Yang disimpan di tiap store adalah RAW ROW dari backend (snake_case asli), bukan hasil yang
// udah dinormalisasi di AppContext.jsx - biar fungsi norm* (normProduk, normKasbon, dst) bisa
// dipanggil ulang dari cache persis kayak dari API asli, termasuk field turunan yang dihitung
// ulang tiap kali (misal normKasbon.hari dihitung dari dibuat_pada mentah).
import { openDB } from 'idb';

const DB_NAME = 'warungpintar_db';
const DB_VERSION = 1;

let dbPromise = null;

function bukaDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Semua tabel sumbernya (lihat schema.sql) pakai `id UUID PRIMARY KEY`, termasuk
        // riwayat_jaga/masuk_log/modal_log - jadi raw row-nya SELALU punya `id` asli, dipakai
        // langsung sebagai keyPath (bukan autoIncrement, biar sinkron ulang nggak numpuk baris lama).
        db.createObjectStore('produk', { keyPath: 'id' });
        db.createObjectStore('kasbon', { keyPath: 'id' });
        db.createObjectStore('pelanggan', { keyPath: 'id' });
        db.createObjectStore('transaksi', { keyPath: 'id' });
        db.createObjectStore('riwayatJaga', { keyPath: 'id' });
        db.createObjectStore('masukLog', { keyPath: 'id' });
        db.createObjectStore('modalLog', { keyPath: 'id' });
        db.createObjectStore('meta'); // key-value bebas: lastSync, lisensi, penjagaRows, terjual, ngendap
        db.createObjectStore('outbox', { keyPath: 'clientId' }); // antrean aksi Tingkat A (SELESAI_BAYAR/CATAT_KASBON)
      },
    });
  }
  return dbPromise;
}

// Semua fungsi di sini "selalu resolve, nggak pernah throw" (kecuali dibilang lain) - sama
// kontraknya kayak ambilCuaca() di weather.js - biar pemanggil di AppContext nggak perlu
// try/catch di tiap pemanggilan, dan gagal buka IndexedDB (mode privat/kuota abis/dll) nggak
// bikin seluruh app crash, cuma berarti cache-nya nggak jalan.

export async function getAll(store) {
  try {
    const db = await bukaDb();
    return await db.getAll(store);
  } catch {
    return [];
  }
}

export async function putAll(store, rows) {
  if (!rows?.length) return;
  try {
    const db = await bukaDb();
    const tx = db.transaction(store, 'readwrite');
    await Promise.all(rows.map((r) => tx.store.put(r)));
    await tx.done;
  } catch {
    /* gagal nulis cache (kuota/privat mode/dll) - bukan alasan gagalin alur utama */
  }
}

// Ganti SELURUH isi store dengan rows baru (clear dulu baru put) - dipakai buat sinkronisasi
// penuh dari refreshData() yang emang selalu replace state, bukan merge/patch.
export async function gantiSemua(store, rows) {
  try {
    const db = await bukaDb();
    const tx = db.transaction(store, 'readwrite');
    await tx.store.clear();
    await Promise.all((rows || []).map((r) => tx.store.put(r)));
    await tx.done;
  } catch {
    /* sama kayak putAll - gagal cache bukan alasan gagalin alur utama */
  }
}

export async function getMeta(key) {
  try {
    const db = await bukaDb();
    return await db.get('meta', key);
  } catch {
    return undefined;
  }
}

export async function setMeta(key, value) {
  try {
    const db = await bukaDb();
    await db.put('meta', value, key);
  } catch {
    /* abaikan */
  }
}

// --- outbox: dipakai khusus src/lib/outbox.js, diekspos di sini biar 1 tempat akses IndexedDB ---

export async function outboxTambah(entry) {
  try {
    const db = await bukaDb();
    await db.put('outbox', entry);
  } catch {
    /* kalau ini gagal, aksi Tingkat A jadi nggak ke-queue - ditangani di pemanggil (outbox.js) */
  }
}

export async function outboxSemua() {
  return getAll('outbox');
}

export async function outboxHapus(clientId) {
  try {
    const db = await bukaDb();
    await db.delete('outbox', clientId);
  } catch {
    /* abaikan */
  }
}

export async function outboxUpdate(entry) {
  return outboxTambah(entry); // put() = upsert, sama aja
}

// Bersihin SEMUA cache lokal. Dipanggil waktu warung yang login BERGANTI (lihat AppContext).
//
// Kenapa perlu: DB_NAME-nya satu buat seluruh app, nggak dipisah per warung. Tanpa ini, produk /
// kasbon / pelanggan warung SEBELUMNYA masih nongkrong di IndexedDB, terus ke-load lagi lewat
// muatDariCache() pas akun LAIN login - jadi pemilik warung B bisa ngeliat data warung A di
// HP yang sama. Kejadian beneran waktu login akun demo setelah akun lain: datanya ikut kebawa.
//
// `outbox` SENGAJA NGGAK ikut dihapus: isinya transaksi yang udah dicatat pemilik warung tapi
// belum kekirim ke server (lihat outbox.js). Ngehapusnya = ngilangin jualan orang yang belum
// sempet nyampe server - jauh lebih merusak daripada kebocoran cache yang lagi diberesin di sini.
// Baris outbox tetap nempel ke warung asalnya lewat token waktu dikirim, bukan lewat cache ini.
export async function hapusCacheWarung() {
  const stores = ['produk', 'kasbon', 'pelanggan', 'transaksi', 'riwayatJaga', 'masukLog', 'modalLog', 'meta'];
  try {
    const db = await bukaDb();
    await Promise.all(
      stores.map(async (s) => {
        const tx = db.transaction(s, 'readwrite');
        await tx.store.clear();
        await tx.done;
      })
    );
  } catch {
    /* gagal bersihin cache - sama kontraknya kayak fungsi lain di file ini, jangan bikin app crash */
  }
}
