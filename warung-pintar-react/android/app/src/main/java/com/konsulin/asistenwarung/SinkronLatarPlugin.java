package com.konsulin.asistenwarung;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;

// Kerja di latar belakang (aplikasi boleh ditutup), lewat WorkManager Android:
// 1. SinkronWorker - kirim transaksi & kasbon yang dicatat pas offline begitu ada internet.
// 2. NotifWorker   - tiap ±15 menit ngecek notifikasi baru di backend (GET /api/notif-hp/baru) & nampilinnya.
// JS nitip data lewat plugin ini (alamat server, token login, antrean); yang udah kekirim dilaporin balik lewat
// ambilTerkirim() biar antrean di aplikasi ikut dibersihin.
@CapacitorPlugin(name = "SinkronLatar")
public class SinkronLatarPlugin extends Plugin {

    static final String PREF = "aw_latar";
    static final String K_BASE = "baseUrl";
    static final String K_TOKEN = "token";
    static final String K_ANTREAN = "antrean";
    static final String K_TERKIRIM = "terkirim";
    static final String K_NOTIF_TERAKHIR = "notifTerakhir";
    static final String KERJA_SINKRON = "aw-sinkron";
    static final String KERJA_NOTIF = "aw-notif";
    static final String EXTRA_LAYAR = "aw_layar";
    // Antrean bisa diubah JS & SinkronWorker barengan - baca-ubah-tulisnya lewat kunci ini.
    static final Object KUNCI_ANTREAN = new Object();

    static SharedPreferences pref(Context c) {
        return c.getSharedPreferences(PREF, Context.MODE_PRIVATE);
    }

    private static Constraints butuhInternet() {
        return new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
    }

    static void jadwalkanSinkron(Context c) {
        OneTimeWorkRequest kerja = new OneTimeWorkRequest.Builder(SinkronWorker.class)
            .setConstraints(butuhInternet())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build();
        WorkManager.getInstance(c).enqueueUniqueWork(KERJA_SINKRON, ExistingWorkPolicy.APPEND_OR_REPLACE, kerja);
    }

    // Alamat server + token login. token kosong (logout) = semua kerja latar dimatiin & datanya dihapus.
    @PluginMethod
    public void atur(PluginCall call) {
        Context c = getContext();
        String token = call.getString("token");
        if (token == null || token.isEmpty()) {
            pref(c).edit().clear().apply();
            WorkManager.getInstance(c).cancelUniqueWork(KERJA_SINKRON);
            WorkManager.getInstance(c).cancelUniqueWork(KERJA_NOTIF);
            call.resolve();
            return;
        }
        SharedPreferences.Editor e = pref(c).edit();
        String tokenLama = pref(c).getString(K_TOKEN, null);
        // Ganti akun = mulai lagi dari notifikasi terbaru akun itu, bukan lanjutin nomor punya akun lama.
        if (tokenLama != null && !tokenLama.equals(token)) e.remove(K_NOTIF_TERAKHIR);
        e.putString(K_BASE, call.getString("baseUrl", "")).putString(K_TOKEN, token).apply();
        PeriodicWorkRequest notif = new PeriodicWorkRequest.Builder(NotifWorker.class, 15, TimeUnit.MINUTES)
            .setConstraints(butuhInternet())
            .build();
        WorkManager.getInstance(c).enqueueUniquePeriodicWork(KERJA_NOTIF, ExistingPeriodicWorkPolicy.KEEP, notif);
        call.resolve();
    }

    // Antrean lengkap yang belum terkirim: [{ clientId, path, body }]. Menimpa titipan sebelumnya.
    @PluginMethod
    public void simpanAntrean(PluginCall call) {
        JSArray antrean = call.getArray("antrean", new JSArray());
        synchronized (KUNCI_ANTREAN) {
            pref(getContext()).edit().putString(K_ANTREAN, antrean.toString()).commit();
        }
        if (antrean.length() > 0) jadwalkanSinkron(getContext());
        else WorkManager.getInstance(getContext()).cancelUniqueWork(KERJA_SINKRON);
        call.resolve();
    }

    // clientId yang udah beres dikirim (atau ditolak server) dari latar - JS hapus dari antreannya sendiri.
    @PluginMethod
    public void ambilTerkirim(PluginCall call) {
        JSObject hasil = new JSObject();
        synchronized (KUNCI_ANTREAN) {
            try {
                hasil.put("clientId", new JSArray(pref(getContext()).getString(K_TERKIRIM, "[]")));
            } catch (Exception ex) {
                hasil.put("clientId", new JSArray());
            }
            pref(getContext()).edit().remove(K_TERKIRIM).commit();
        }
        call.resolve(hasil);
    }

    // Notifikasi yang diketuk waktu aplikasi masih ketutup: layarnya dibaca JS pas aplikasi siap.
    @PluginMethod
    public void ambilLayarAwal(PluginCall call) {
        JSObject hasil = new JSObject();
        Intent i = getActivity() != null ? getActivity().getIntent() : null;
        String layar = i != null ? i.getStringExtra(EXTRA_LAYAR) : null;
        if (i != null) i.removeExtra(EXTRA_LAYAR);
        hasil.put("layar", layar);
        call.resolve(hasil);
    }

    // Notifikasi diketuk pas aplikasi lagi kebuka di belakang.
    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        String layar = intent != null ? intent.getStringExtra(EXTRA_LAYAR) : null;
        if (layar != null) {
            JSObject data = new JSObject();
            data.put("layar", layar);
            notifyListeners("bukaLayar", data);
            intent.removeExtra(EXTRA_LAYAR);
        }
    }

    // Dipanggil SinkronWorker: item yang udah beres dibuang dari antrean TERBARU (bukan ditimpa - JS mungkin baru
    // nambahin item selagi worker jalan) & dicatat buat dibersihin JS. Balikin sisa antrean.
    static JSONArray selesaikan(Context c, java.util.Set<String> beres) {
        synchronized (KUNCI_ANTREAN) {
            JSONArray sisa = new JSONArray();
            try {
                JSONArray antrean = new JSONArray(pref(c).getString(K_ANTREAN, "[]"));
                for (int i = 0; i < antrean.length(); i++) {
                    org.json.JSONObject item = antrean.getJSONObject(i);
                    if (!beres.contains(item.optString("clientId"))) sisa.put(item);
                }
                JSONArray terkirim = new JSONArray(pref(c).getString(K_TERKIRIM, "[]"));
                for (String id : beres) terkirim.put(id);
                pref(c).edit().putString(K_ANTREAN, sisa.toString()).putString(K_TERKIRIM, terkirim.toString()).commit();
            } catch (Exception ignored) {}
            return sisa;
        }
    }
}
