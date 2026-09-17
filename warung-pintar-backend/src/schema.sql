-- Skema database Warung Pintar (PRD Fase 1 penuh + fondasi Fase 2/3)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1 baris = 1 akun warung (login bersama, dipakai di beberapa device — sesuai keputusan PRD #9: tanpa role rumit di MVP)
-- Lisensi/langganan (dijual lewat landing page Konsulin) nempel langsung di sini: plan lagi
-- aktif apa nggak, berlaku sampai kapan. Warung baru daftar otomatis dapat masa trial gratis.
CREATE TABLE IF NOT EXISTS warung (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  warna TEXT DEFAULT '#ffc001',
  tema TEXT DEFAULT 't-mono',
  font TEXT DEFAULT 'Inter',
  ukuran TEXT DEFAULT 'sedang',
  -- Nomor WhatsApp pemilik - SATU-SATUNYA jalan pulih kalau password kelupaan (lihat
  -- auth.routes.js /otp/*). Disimpan ternormalisasi ke format 62xxx tanpa +/spasi/strip biar
  -- pencarian pas login-lupa-password nggak meleset gara-gara beda gaya nulis (08xx vs +62 8xx).
  -- NULL diperbolehkan: akun yang lanjut dari sebelum fitur ini ada belum punya nomor - mereka
  -- nggak bisa pakai lupa-password sampai nomornya diisi dari menu Akun.
  no_hp TEXT,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  plan TEXT NOT NULL DEFAULT 'trial', -- trial | bulanan | tahunan
  lisensi_berlaku_sampai TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  -- Jatah token Gemini HARIAN buat fitur scan/nota/suara AI (lihat aiQuota.service.js) - CUMA
  -- counter + tanggal terakhir kepake, reset logic-nya (kalau ai_token_tanggal != hari ini, mulai
  -- dari 0 lagi) ditangani di kode, bukan cron job/scheduled reset terpisah.
  ai_token_hari_ini BIGINT NOT NULL DEFAULT 0,
  ai_token_tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- kalau tabel warung sudah ada duluan (migrasi sebelum fitur lisensi ini ditambahkan), tambahin kolomnya
ALTER TABLE warung ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'trial';
ALTER TABLE warung ADD COLUMN IF NOT EXISTS lisensi_berlaku_sampai TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days');
ALTER TABLE warung ADD COLUMN IF NOT EXISTS ai_token_hari_ini BIGINT NOT NULL DEFAULT 0;
ALTER TABLE warung ADD COLUMN IF NOT EXISTS ai_token_tanggal DATE NOT NULL DEFAULT CURRENT_DATE;
-- ADD COLUMN IF NOT EXISTS di atas cuma kepake kalau kolomnya belum ada sama sekali - database yang
-- kolomnya udah lama ada (dari waktu default-nya masih 14 hari) nggak ke-update lewat itu, makanya
-- default-nya di-set ulang eksplisit di sini biar akun baru berikutnya tetap dapet 7 hari, bukan 14.
ALTER TABLE warung ALTER COLUMN lisensi_berlaku_sampai SET DEFAULT (now() + INTERVAL '7 days');
ALTER TABLE warung ADD COLUMN IF NOT EXISTS no_hp TEXT;
-- PIN pemilik (buka detail modal & untung). Dulu disimpan LOKAL di tiap HP, jadi 1 akun bisa punya PIN beda-beda
-- per HP. Sekarang satu PIN per akun warung, disimpan hash bcrypt (sama kayak password). NULL = belum dibuat.
ALTER TABLE warung ADD COLUMN IF NOT EXISTS pin_hash TEXT;
-- UNIQUE-nya partial (WHERE no_hp IS NOT NULL) - biar banyak akun lama yang nomornya masih kosong
-- nggak saling bentrok, tapi begitu diisi tetap dijamin 1 nomor = 1 warung. Sifat unik ini yang
-- bikin "lupa password lewat nomor HP" nggak ambigu (nggak mungkin 1 nomor nunjuk 2 akun).
CREATE UNIQUE INDEX IF NOT EXISTS idx_warung_no_hp ON warung (no_hp) WHERE no_hp IS NOT NULL;

-- Riwayat setiap percobaan pembayaran lewat Midtrans Snap — 1 baris per order_id yang dibuat.
-- Webhook Midtrans nyari baris ini pakai order_id buat tau warung mana yang harus diperpanjang.
CREATE TABLE IF NOT EXISTS pembayaran (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warung_id UUID NOT NULL REFERENCES warung(id) ON DELETE CASCADE,
  order_id TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL, -- bulanan | tahunan
  jumlah NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | settlement | gagal | kedaluwarsa
  midtrans_transaction_id TEXT,
  raw_notifikasi JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pembayaran_warung ON pembayaran(warung_id, created_at DESC);

-- daftar orang yang bisa jaga warung (Pak Budi, Istri, Anak) — cuma label operasional, bukan akun terpisah
CREATE TABLE IF NOT EXISTS penjaga (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warung_id UUID NOT NULL REFERENCES warung(id) ON DELETE CASCADE,
  nama TEXT NOT NULL,
  aktif BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_penjaga_warung ON penjaga(warung_id);

-- stok selalu dalam satuan jual (pcs/butir/botol/dll — kolom "satuan"). isi_kemasan/nama_kemasan
-- cuma bantu pas STOK MASUK: kalau belanjanya per dus/karton (isi_kemasan > 1), user bisa masukin
-- jumlah dus + harga per dus, sistem yang ngonversi ke satuan jual otomatis (lihat masuk-stok).
CREATE TABLE IF NOT EXISTS produk (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warung_id UUID NOT NULL REFERENCES warung(id) ON DELETE CASCADE,
  nama TEXT NOT NULL,
  kategori TEXT DEFAULT 'sembako',
  barcode TEXT,
  harga NUMERIC NOT NULL DEFAULT 0,
  modal NUMERIC NOT NULL DEFAULT 0,
  stok INTEGER NOT NULL DEFAULT 0,
  laku_per_hari NUMERIC NOT NULL DEFAULT 0,
  satuan TEXT NOT NULL DEFAULT 'pcs',
  isi_kemasan INTEGER NOT NULL DEFAULT 1,
  nama_kemasan TEXT,
  grup TEXT, -- opsional: nama varian bareng (misal "Aqua") biar "Aqua 600ml"/"Aqua 1500ml" ditampilin sekelompok di Stok
  foto_url TEXT, -- foto tampilan barang (beda sama foto referensi visual scan di produk_referensi_visual)
  -- "Hapus barang" itu SOFT DELETE (aktif=false), bukan DELETE FROM beneran - transaksi_item.produk_id
  -- REFERENCES produk(id) TANPA ON DELETE CASCADE (lihat komentar di tabel transaksi_item), jadi
  -- hard-delete produk yang udah pernah kejual bakal GAGAL kena foreign key constraint (nolong,
  -- tapi jelek pesan errornya). Lebih penting lagi: hard-delete juga ngerusak laporan/histori
  -- transaksi lama yang masih nyantol ke produk itu. Query yang nampilin katalog AKTIF (Stok,
  -- Catat Penjualan, scan, Mang AI, dst) WAJIB tambahin `AND aktif` - laporan/riwayat transaksi
  -- SENGAJA nggak difilter (transaksi lama tetap harus ke-tampil apa adanya walau produknya udah dihapus).
  aktif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_produk_warung ON produk(warung_id);

-- kalau tabel produk sudah ada duluan (sebelum fitur kemasan/grup/foto ini ditambahkan), tambahin kolomnya
-- DULUAN sebelum index di bawah dibuat (index-nya butuh kolom grup udah ada)
ALTER TABLE produk ADD COLUMN IF NOT EXISTS satuan TEXT NOT NULL DEFAULT 'pcs';
ALTER TABLE produk ADD COLUMN IF NOT EXISTS isi_kemasan INTEGER NOT NULL DEFAULT 1;
ALTER TABLE produk ADD COLUMN IF NOT EXISTS nama_kemasan TEXT;
ALTER TABLE produk ADD COLUMN IF NOT EXISTS foto_url TEXT;
ALTER TABLE produk ADD COLUMN IF NOT EXISTS grup TEXT;
ALTER TABLE produk ADD COLUMN IF NOT EXISTS aktif BOOLEAN NOT NULL DEFAULT true;
-- Ikon pilihan pemilik buat barang tanpa foto (kunci dari src/lib/ikonProduk.js di frontend). NULL/'' = ditebak dari nama.
ALTER TABLE produk ADD COLUMN IF NOT EXISTS ikon TEXT;

CREATE INDEX IF NOT EXISTS idx_produk_grup ON produk(warung_id, grup);
CREATE INDEX IF NOT EXISTS idx_produk_barcode ON produk(barcode);

-- foto + vektor embedding MobileNet dihitung di CLIENT (TensorFlow.js), backend cuma nyimpen & nyocokin
-- (sesuai stack di PRD 10.1: TensorFlow.js + MobileNetV3 + Web Worker + IndexedDB jalan di HP)
CREATE TABLE IF NOT EXISTS produk_referensi_visual (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produk_id UUID NOT NULL REFERENCES produk(id) ON DELETE CASCADE,
  sudut TEXT, -- depan / miring / dekat
  foto_url TEXT,
  embedding JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_produk_ref_produk ON produk_referensi_visual(produk_id);

CREATE TABLE IF NOT EXISTS pelanggan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warung_id UUID NOT NULL REFERENCES warung(id) ON DELETE CASCADE,
  nama TEXT NOT NULL,
  wa TEXT,
  alamat TEXT,
  foto_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pelanggan_warung ON pelanggan(warung_id);

-- face descriptor juga dihitung di client (face-api.js / MobileNet ringan), backend cuma nyocokin cosine similarity
CREATE TABLE IF NOT EXISTS pelanggan_wajah (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pelanggan_id UUID NOT NULL REFERENCES pelanggan(id) ON DELETE CASCADE,
  embedding JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pelanggan_wajah_pelanggan ON pelanggan_wajah(pelanggan_id);

CREATE TABLE IF NOT EXISTS transaksi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT UNIQUE, -- id yang dibuat client saat offline, buat sinkronisasi idempotent
  warung_id UUID NOT NULL REFERENCES warung(id) ON DELETE CASCADE,
  penjaga_nama TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('bayar','kasbon')),
  metode TEXT, -- Tunai / QRIS / Transfer
  pembeli_id UUID REFERENCES pelanggan(id),
  pembeli_nama TEXT,
  total NUMERIC NOT NULL DEFAULT 0,
  laba NUMERIC NOT NULL DEFAULT 0,
  sumber_input TEXT DEFAULT 'manual', -- suara / visual / barcode / manual
  waktu TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_transaksi_warung_waktu ON transaksi(warung_id, waktu DESC);

CREATE TABLE IF NOT EXISTS transaksi_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaksi_id UUID NOT NULL REFERENCES transaksi(id) ON DELETE CASCADE,
  produk_id UUID REFERENCES produk(id),
  nama_produk TEXT NOT NULL,
  qty INTEGER NOT NULL,
  harga_satuan NUMERIC NOT NULL,
  modal_satuan NUMERIC NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_transaksi_item_transaksi ON transaksi_item(transaksi_id);
CREATE INDEX IF NOT EXISTS idx_transaksi_item_produk ON transaksi_item(produk_id);

CREATE TABLE IF NOT EXISTS kasbon (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warung_id UUID NOT NULL REFERENCES warung(id) ON DELETE CASCADE,
  transaksi_id UUID REFERENCES transaksi(id),
  pelanggan_id UUID REFERENCES pelanggan(id),
  nama TEXT NOT NULL,
  jumlah NUMERIC NOT NULL,
  lunas BOOLEAN NOT NULL DEFAULT false,
  metode_bayar TEXT,
  dibuat_pada TIMESTAMPTZ DEFAULT now(),
  lunas_pada TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_kasbon_warung ON kasbon(warung_id, lunas);
CREATE INDEX IF NOT EXISTS idx_kasbon_pelanggan ON kasbon(pelanggan_id);

CREATE TABLE IF NOT EXISTS riwayat_jaga (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warung_id UUID NOT NULL REFERENCES warung(id) ON DELETE CASCADE,
  dari TEXT,
  ke TEXT NOT NULL,
  uang_laci NUMERIC NOT NULL,
  penjualan_tunai NUMERIC NOT NULL DEFAULT 0,
  selisih NUMERIC NOT NULL DEFAULT 0,
  total_transaksi INTEGER NOT NULL DEFAULT 0,
  stok_habis JSONB,
  utang_baru JSONB,
  waktu TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_riwayat_jaga_warung ON riwayat_jaga(warung_id, waktu DESC);

CREATE TABLE IF NOT EXISTS masuk_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warung_id UUID NOT NULL REFERENCES warung(id) ON DELETE CASCADE,
  keterangan TEXT,
  jumlah NUMERIC NOT NULL,
  metode TEXT DEFAULT 'Tunai',
  waktu TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_masuk_log_warung ON masuk_log(warung_id, waktu DESC);

CREATE TABLE IF NOT EXISTS modal_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warung_id UUID NOT NULL REFERENCES warung(id) ON DELETE CASCADE,
  keterangan TEXT,
  jumlah NUMERIC NOT NULL,
  waktu TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_modal_log_warung ON modal_log(warung_id, waktu DESC);

-- ===== Fase 2/3 (fondasi skema + CRUD dasar, belum ada algoritma cerdas) =====

CREATE TABLE IF NOT EXISTS langganan_paket (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warung_id UUID NOT NULL REFERENCES warung(id) ON DELETE CASCADE,
  nama TEXT NOT NULL,
  item JSONB NOT NULL, -- [{produkId, qty}]
  harga NUMERIC NOT NULL,
  periode TEXT DEFAULT 'mingguan',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS langganan_pelanggan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paket_id UUID NOT NULL REFERENCES langganan_paket(id) ON DELETE CASCADE,
  pelanggan_id UUID NOT NULL REFERENCES pelanggan(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'aktif',
  mulai_pada TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS koperasi_grup (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama TEXT NOT NULL,
  lokasi TEXT,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  dibuat_oleh UUID REFERENCES warung(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS koperasi_pesanan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grup_id UUID NOT NULL REFERENCES koperasi_grup(id) ON DELETE CASCADE,
  warung_id UUID NOT NULL REFERENCES warung(id) ON DELETE CASCADE,
  nama_barang TEXT NOT NULL,
  qty INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tukar_stok_post (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warung_id UUID NOT NULL REFERENCES warung(id) ON DELETE CASCADE,
  kelebihan TEXT NOT NULL,
  butuh TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'terbuka',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Komunitas — feed nasional buat sesama warung berlangganan saling sharing harga jual & profit
-- (bukan cuma diskusi bebas). Ditampilin ATAS NAMA WARUNG (bukan anonim, sesuai keputusan produk) -
-- makanya nama_barang/harga_jual/profit boleh kosong (biar bisa juga dipakai buat obrolan bebas
-- doang), tapi minimal salah satu dari cerita/nama_barang WAJIB diisi (dicek di endpoint POST-nya,
-- bukan constraint DB - biar pesan errornya bisa lebih ramah).
CREATE TABLE IF NOT EXISTS komunitas_post (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warung_id UUID NOT NULL REFERENCES warung(id) ON DELETE CASCADE,
  nama_barang TEXT,
  harga_jual NUMERIC,
  profit NUMERIC,
  cerita TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_komunitas_post_created ON komunitas_post (created_at DESC);

-- Tag/topik postingan (Dagangan, Kasbon, Supplier, Lainnya) - opsional, postingan lama tanpa tag
-- tetap tampil (cuma nggak kena filter topik manapun).
ALTER TABLE komunitas_post ADD COLUMN IF NOT EXISTS tag TEXT;

-- 1 warung cuma bisa suka 1x per post (PRIMARY KEY komposit) - toggle suka/batal di endpoint-nya
-- tinggal INSERT kalau belum ada baris, DELETE kalau udah ada.
CREATE TABLE IF NOT EXISTS komunitas_suka (
  post_id UUID NOT NULL REFERENCES komunitas_post(id) ON DELETE CASCADE,
  warung_id UUID NOT NULL REFERENCES warung(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (post_id, warung_id)
);

CREATE TABLE IF NOT EXISTS komunitas_komentar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES komunitas_post(id) ON DELETE CASCADE,
  warung_id UUID NOT NULL REFERENCES warung(id) ON DELETE CASCADE,
  teks TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_komunitas_komentar_post ON komunitas_komentar (post_id, created_at);

-- Reply BERSARANG (balas ke komentar tertentu, bukan cuma komentar rata di postingan) - null berarti
-- komentar "biasa" langsung ke post (kayak sebelumnya), kalau diisi berarti ini balesan yang nempel
-- di BAWAH komentar lain. Sengaja cuma 1 tingkat kedalaman yang DITAMPILIN (dipaksa di produk.routes.js/
-- komunitas.routes.js: balas_ke SELALU disetel ke komentar ROOT-nya, bukan ke komentar lain yang
-- juga balesan) - biar UI-nya nggak jadi thread berlapis-lapis susah dibaca di layar HP kecil, sama
-- pola yang dipakai kebanyakan app sosial buat komentar (WA Channel, IG, dst - balesan ke balesan
-- tetep "nempel" ke komentar induk yang sama, bukan bikin cabang baru).
ALTER TABLE komunitas_komentar ADD COLUMN IF NOT EXISTS balas_ke UUID REFERENCES komunitas_komentar(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_komunitas_komentar_balas_ke ON komunitas_komentar (balas_ke);

-- Perbaikan data lama: sebelum endpoint /bayar & /kasbon dibenerin buat nerima pembeliId, kasbon
-- & transaksi cuma nyambung ke pelanggan lewat NAMA (teks), bukan ID. Akibatnya Kenal Wajah (yang
-- nyari utang berdasarkan ID) nggak nemu utang yang sebenarnya ada (kelihatan kok di halaman
-- Pelanggan, yang emang cocokin by nama). Backfill ini nyambungin ulang baris LAMA yang masih
-- kosong ID-nya, asal namanya persis sama (case/spasi diabaikan) sama 1 pelanggan yang terdaftar
-- di warung yang sama — aman dijalanin berkali-kali (cuma nyentuh baris yang belum ke-link).
UPDATE kasbon k
SET pelanggan_id = p.id
FROM pelanggan p
WHERE k.pelanggan_id IS NULL
  AND k.warung_id = p.warung_id
  AND lower(trim(k.nama)) = lower(trim(p.nama));

UPDATE transaksi t
SET pembeli_id = p.id
FROM pelanggan p
WHERE t.pembeli_id IS NULL
  AND t.pembeli_nama IS NOT NULL
  AND t.warung_id = p.warung_id
  AND lower(trim(t.pembeli_nama)) = lower(trim(p.nama));

-- Kode OTP buat pulih akun: "lupa password" (belum login) & "ganti PIN" (sudah login), dua-duanya
-- lewat WhatsApp ke no_hp warung. Sengaja tabel sendiri, bukan kolom nempel di warung, supaya
-- percobaan yang gagal/kedaluwarsa ninggalin jejak yang bisa diaudit kalau ada yang nyoba jebol.
--
-- Yang disimpan kode_hash (bcrypt), BUKAN kodenya. Alasannya sama kayak password: kalau isi
-- database bocor, kode yang masih hidup nggak bisa langsung dipakai buat ambil alih akun.
CREATE TABLE IF NOT EXISTS kode_otp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warung_id UUID NOT NULL REFERENCES warung(id) ON DELETE CASCADE,
  kode_hash TEXT NOT NULL,
  -- 'reset' = lupa password (hasil verifikasinya token buat ganti password tanpa login),
  -- 'pin'   = ganti PIN dari menu Lainnya (sudah login, hasilnya cuma izin buka form PIN baru).
  tujuan TEXT NOT NULL DEFAULT 'reset',
  kedaluwarsa TIMESTAMPTZ NOT NULL,
  -- Dihitung naik tiap kode salah dimasukkan. Dibatasi di kode (auth.routes.js) supaya 6 digit
  -- nggak bisa ditebak brute-force - tanpa ini, 1 juta kemungkinan itu kecil buat script.
  percobaan INT NOT NULL DEFAULT 0,
  dipakai BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kode_otp_warung ON kode_otp (warung_id, tujuan, dipakai);

-- Pencatatan penerimaan BERSIH per pembayaran. Sebelum ini tabel pembayaran cuma nyimpen `jumlah`
-- (yang DITAGIH ke pelanggan) - nggak ada catatan berapa yang beneran masuk ke rekening setelah
-- dipotong MDR Midtrans. Akibatnya laporan pendapatan kebaca lebih besar dari kenyataan, dan
-- nggak ada dasar buat mutusin harga paket berikutnya.
ALTER TABLE pembayaran ADD COLUMN IF NOT EXISTS payment_type TEXT;
-- Diisi pas pembayaran diaktifkan (webhook / sinkron), dihitung dari MDR metode yang BENERAN
-- dipakai pelanggan - bukan asumsi di depan, karena metodenya baru ketahuan setelah dia bayar.
ALTER TABLE pembayaran ADD COLUMN IF NOT EXISTS jumlah_bersih NUMERIC;

-- Target setoran HARIAN yang dipasang pemilik warung (lihat layar Catat jualan + grafik di
-- Laporan). Dulu cuma angka sementara di memori buat bantu nyocokin isi laci; begitu dipakai
-- sebagai pembanding di laporan, dia harus nempel ke TANGGAL & kesimpen - kalau nggak, grafiknya
-- nggak punya riwayat buat dibandingin.
--
-- Primary key gabungan (warung_id, tanggal): satu warung punya PALING BANYAK satu target per hari.
-- Pasang ulang di hari yang sama = menimpa, bukan bikin baris baru (lihat ON CONFLICT di
-- laporan.routes.js) - biar riwayatnya bersih & grafiknya nggak dobel batang.
CREATE TABLE IF NOT EXISTS target_harian (
  warung_id UUID NOT NULL REFERENCES warung(id) ON DELETE CASCADE,
  tanggal DATE NOT NULL,
  jumlah NUMERIC NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (warung_id, tanggal)
);

-- Memori jangka panjang Mang AI per akun warung (lihat services/memori.service.js - tabel ini juga dibikin otomatis
-- di sana kalau belum ada). Isinya fakta pendek dari obrolan (nama panggilan, supplier langganan, dst).
CREATE TABLE IF NOT EXISTS ai_memori (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warung_id UUID NOT NULL REFERENCES warung(id) ON DELETE CASCADE,
  isi TEXT NOT NULL,
  sumber TEXT NOT NULL DEFAULT 'ai', -- ai | perintah | manual
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_memori_warung ON ai_memori (warung_id, created_at DESC);

-- Foto lampiran di Komunitas (data URL gambar yang udah dikecilin di HP). Juga ditambah otomatis di komunitas.routes.js.
ALTER TABLE komunitas_post ADD COLUMN IF NOT EXISTS foto_url TEXT;
ALTER TABLE komunitas_komentar ADD COLUMN IF NOT EXISTS foto_url TEXT;

-- Notifikasi Komunitas: komentar di postingan sendiri ("komentar") & balasan ke komentar sendiri ("balasan").
-- Juga dibikin otomatis di komunitas.routes.js kalau belum ada.
CREATE TABLE IF NOT EXISTS komunitas_notif (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warung_id UUID NOT NULL REFERENCES warung(id) ON DELETE CASCADE, -- penerima
  dari_warung_id UUID NOT NULL REFERENCES warung(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES komunitas_post(id) ON DELETE CASCADE,
  komentar_id UUID REFERENCES komunitas_komentar(id) ON DELETE CASCADE,
  jenis TEXT NOT NULL,
  dibaca BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_komunitas_notif_penerima ON komunitas_notif (warung_id, dibaca, created_at DESC);

-- Profil usaha dari layar "kenalan dulu" (jenis usaha, penjaga, kebutuhan, barcode, nama panggilan) - lihat
-- services/profilUsaha.service.js. NULL = belum diisi. Juga ditambah otomatis di sana kalau belum ada.
ALTER TABLE warung ADD COLUMN IF NOT EXISTS profil_usaha JSONB;

-- Ikuti antar warung di Komunitas (followers/following). Juga dibikin otomatis di komunitas.routes.js.
CREATE TABLE IF NOT EXISTS komunitas_ikuti (
  pengikut_id UUID NOT NULL REFERENCES warung(id) ON DELETE CASCADE,
  diikuti_id UUID NOT NULL REFERENCES warung(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (pengikut_id, diikuti_id),
  CHECK (pengikut_id <> diikuti_id)
);
CREATE INDEX IF NOT EXISTS idx_komunitas_ikuti_diikuti ON komunitas_ikuti (diikuti_id);
-- notif "mulai mengikuti kamu" nggak nyangkut postingan mana pun
ALTER TABLE komunitas_notif ALTER COLUMN post_id DROP NOT NULL;

-- Pendaftaran yang nunggu verifikasi kode WhatsApp (lihat /register/kirim-kode & /register/verifikasi di
-- auth.routes.js). Akun warung baru dibuat SETELAH kodenya cocok. Juga dibikin otomatis di sana kalau belum ada.
CREATE TABLE IF NOT EXISTS pendaftaran_otp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama TEXT NOT NULL,
  username TEXT NOT NULL,
  no_hp TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  kode_hash TEXT NOT NULL,
  kedaluwarsa TIMESTAMPTZ NOT NULL,
  percobaan INT NOT NULL DEFAULT 0,
  dipakai BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pendaftaran_otp_hp ON pendaftaran_otp (no_hp, created_at DESC);
