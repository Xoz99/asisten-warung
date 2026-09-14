// Pengganti KOSONG buat '@tensorflow/tfjs-backend-wasm' - dipasang lewat alias di vite.config.js.
//
// Konteksnya: face-api dulu dipakai versi BUNDEL (face-api.esm.js, 1,3 MB) yang ngebawa
// TensorFlow.js LENGKAP sendiri - jadi aplikasi ini muat DUA mesin TensorFlow terpisah (satu buat
// scan barang/MobileNet, satu lagi di dalam face-api), masing-masing sama kernel WebGL-nya. Di HP,
// dua mesin itu rebutan memori GPU yang sama.
//
// Versi tanpa bundel (face-api.esm-nobundle.js, 83 KB) pakai TensorFlow.js punya kita sendiri -
// tapi dia juga import backend WASM, yang nggak terpasang di proyek ini. Isinya dicek: face-api
// CUMA ngekspor ulang namespace itu (`w(n, un)`), nggak pernah manggil satu fungsi pun dari
// situ. Jadi modul kosong udah cukup, nggak perlu nambah paket WASM yang nggak bakal dipakai.
export {};
