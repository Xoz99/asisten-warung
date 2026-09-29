// Pengenal suara bawaan Android, dipakai kalau Asisten Warung jalan sebagai APK (Capacitor). Di dalam APK,
// SpeechRecognition versi browser nggak jalan (WebView Android nggak nyediain layanan suaranya), jadi
// "Sebut barang" & dikte chat pindah ke plugin native ini.
//
// Bentuknya SENGAJA disamain sama SpeechRecognition browser (start/stop/abort + onresult/onerror/onend/
// onspeechstart/onspeechend) - Catat & Chat tinggal ganti konstruktornya, logika sheet-nya nggak perlu dibongkar.
// Di browser biasa modul ini nggak kepakai sama sekali (pakaiSuaraNative() = false).
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';

export const pakaiSuaraNative = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('SpeechRecognition');

// Minta izin mic + layanan suara Android. Balikin true kalau diizinin.
export async function izinSuaraNative() {
  try {
    const cek = await SpeechRecognition.checkPermissions();
    if (cek.speechRecognition === 'granted') return true;
    const minta = await SpeechRecognition.requestPermissions();
    return minta.speechRecognition === 'granted';
  } catch {
    return false;
  }
}

export class SuaraNative {
  constructor() {
    this.lang = 'id-ID';
    this.interimResults = false;
    this.maxAlternatives = 1;
    this.continuous = false;
    this.onresult = null;
    this.onerror = null;
    this.onend = null;
    this.onstart = null;
    this.onspeechstart = null;
    this.onspeechend = null;
    this._batal = false;
    this._jalan = false;
  }

  // Sama kayak versi browser: start() balik langsung, hasilnya nyusul lewat onresult/onerror/onend.
  start() {
    if (this._jalan) throw new Error('recognition already started');
    this._jalan = true;
    this._batal = false;
    this._mulai();
  }

  async _mulai() {
    try {
      if (!(await izinSuaraNative())) {
        this._panggil('onerror', { error: 'not-allowed' });
        return;
      }
      const ada = await SpeechRecognition.available().catch(() => ({ available: false }));
      if (!ada.available) {
        this._panggil('onerror', { error: 'service-not-allowed' });
        return;
      }
      this._panggil('onstart');
      this._panggil('onspeechstart');
      // popup:false = tanpa dialog Google, suaranya didengerin di belakang layar sheet kita sendiri.
      const r = await SpeechRecognition.start({ language: this.lang, maxResults: this.maxAlternatives || 1, partialResults: false, popup: false });
      if (this._batal) return;
      this._panggil('onspeechend');
      const teks = r?.matches?.[0];
      if (!teks) {
        this._panggil('onerror', { error: 'no-speech' });
        return;
      }
      const hasil = [{ transcript: teks, confidence: 1 }];
      hasil.isFinal = true;
      this._panggil('onresult', { resultIndex: 0, results: [hasil] });
    } catch (e) {
      if (this._batal) return;
      const pesan = String(e?.message || e || '');
      // Plugin ngelempar "No match" / "Didn't understand" kalau nggak ada suara yang kedengeran.
      this._panggil('onerror', { error: /permission/i.test(pesan) ? 'not-allowed' : /match|understand|speech/i.test(pesan) ? 'no-speech' : 'network' });
    } finally {
      this._jalan = false;
      if (!this._batal) this._panggil('onend');
    }
  }

  stop() {
    SpeechRecognition.stop().catch(() => {});
  }

  abort() {
    this._batal = true;
    SpeechRecognition.stop().catch(() => {});
    if (this._jalan) {
      this._jalan = false;
      this._panggil('onerror', { error: 'aborted' });
      this._panggil('onend');
    }
  }

  _panggil(nama, arg) {
    try {
      this[nama]?.(arg);
    } catch {
      /* handler layar yang error nggak boleh bikin sesi suara nyangkut */
    }
  }
}
