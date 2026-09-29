package com.konsulin.asistenwarung;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import org.json.JSONArray;
import org.json.JSONObject;

// Tiap ±15 menit (WorkManager, butuh internet) ngecek notifikasi baru di backend - GET /api/notif-hp/baru?sejak=<id>
// - lalu nampilinnya sebagai notifikasi sistem, walau aplikasinya ditutup. Pengganti push Firebase: notifikasinya
// bisa telat sampai ±15-30 menit, dan di HP yang agresif hemat baterai bisa lebih lama.
public class NotifWorker extends Worker {

    static final String KANAL = "aw_umum";

    public NotifWorker(@NonNull Context context, @NonNull WorkerParameters params) {
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
        // Sekalian: antrean transaksi offline yang masih nyangkut ikut dicoba kirim.
        try {
            if (new JSONArray(p.getString(SinkronLatarPlugin.K_ANTREAN, "[]")).length() > 0) SinkronLatarPlugin.jadwalkanSinkron(c);
        } catch (Exception ignored) {}

        String sejak = p.getString(SinkronLatarPlugin.K_NOTIF_TERAKHIR, "");
        HttpLatar.Hasil h = HttpLatar.kirim("GET", base + "/api/notif-hp/baru" + (sejak.isEmpty() ? "" : "?sejak=" + sejak), token, null);
        if (h.status == -1 || h.status >= 500) return Result.retry();
        if (h.status != 200) return Result.success(); // token kedaluwarsa dsb. - dicoba lagi di putaran berikutnya
        try {
            JSONObject data = new JSONObject(h.isi);
            JSONArray notif = data.optJSONArray("notif");
            if (notif != null) for (int i = 0; i < notif.length(); i++) tampilkan(c, notif.getJSONObject(i));
            p.edit().putString(SinkronLatarPlugin.K_NOTIF_TERAKHIR, data.optString("terakhir", sejak)).apply();
        } catch (Exception ignored) {}
        return Result.success();
    }

    private static void tampilkan(Context c, JSONObject n) {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = c.getSystemService(NotificationManager.class);
            if (nm != null && nm.getNotificationChannel(KANAL) == null) {
                nm.createNotificationChannel(new NotificationChannel(KANAL, "Info Asisten Warung", NotificationManager.IMPORTANCE_DEFAULT));
            }
        }
        int id = (int) (Long.parseLong(n.optString("id", "0")) % Integer.MAX_VALUE);
        Intent buka = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        String layar = n.optString("layar", "");
        if (!layar.isEmpty()) buka.putExtra(SinkronLatarPlugin.EXTRA_LAYAR, layar);
        PendingIntent ketuk = PendingIntent.getActivity(c, id, buka, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String isi = n.optString("isi", "");
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, KANAL)
            .setSmallIcon(R.drawable.ic_notif)
            .setContentTitle(n.optString("judul", "Asisten Warung"))
            .setContentText(isi)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(isi))
            .setContentIntent(ketuk)
            .setAutoCancel(true);
        try {
            NotificationManagerCompat.from(c).notify(id, b.build());
        } catch (SecurityException ignored) {}
    }
}
