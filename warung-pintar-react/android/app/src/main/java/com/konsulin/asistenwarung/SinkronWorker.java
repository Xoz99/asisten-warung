package com.konsulin.asistenwarung;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

// Kirim transaksi & kasbon yang dicatat pas offline, walau aplikasinya ditutup. Aman diulang: tiap item punya
// clientId dan backend nolak dobel (balikin data lama, nggak motong stok lagi) - lihat transaksi.routes.js.
public class SinkronWorker extends Worker {

    public SinkronWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context c = getApplicationContext();
        SharedPreferences p = SinkronLatarPlugin.pref(c);
        String base = p.getString(SinkronLatarPlugin.K_BASE, "");
        String token = p.getString(SinkronLatarPlugin.K_TOKEN, null);
        if (token == null || base.isEmpty()) return Result.success();
        JSONArray antrean;
        synchronized (SinkronLatarPlugin.KUNCI_ANTREAN) {
            try {
                antrean = new JSONArray(p.getString(SinkronLatarPlugin.K_ANTREAN, "[]"));
            } catch (Exception e) {
                return Result.success();
            }
        }
        Set<String> beres = new HashSet<>();
        boolean masihOffline = false;
        for (int i = 0; i < antrean.length(); i++) {
            JSONObject item = antrean.optJSONObject(i);
            if (item == null) continue;
            HttpLatar.Hasil h = HttpLatar.kirim("POST", base + item.optString("path"), token, item.optJSONObject("body") != null ? item.optJSONObject("body").toString() : "{}");
            if (h.status == -1 || h.status >= 500 || h.status == 408 || h.status == 429) {
                // Jaringan/server lagi bermasalah: berhenti, coba lagi nanti (urutan transaksi tetap terjaga).
                masihOffline = true;
                break;
            }
            if (h.status == 401 || h.status == 402 || h.status == 403) {
                // Token kedaluwarsa / langganan habis: JANGAN dibuang di latar (data jualan bisa ilang). Disimpen
                // sampai aplikasinya dibuka - di situ pemilik bisa login ulang / perpanjang, lalu kekirim.
                break;
            }
            // 2xx = masuk; 4xx lain (data ditolak server) = nggak ada gunanya diulang - sama kayak aturan outbox di
            // aplikasi, dibuang dan aplikasi yang nunjukin kondisi aslinya.
            beres.add(item.optString("clientId"));
        }
        JSONArray sisa = SinkronLatarPlugin.selesaikan(c, beres);
        return masihOffline && sisa.length() > 0 ? Result.retry() : Result.success();
    }
}
