package com.konsulin.asistenwarung;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

// HTTP kecil buat kerja latar (SinkronWorker, NotifWorker). status -1 = gagal jaringan (belum ada internet dsb.).
final class HttpLatar {

    static final class Hasil {
        final int status;
        final String isi;

        Hasil(int status, String isi) {
            this.status = status;
            this.isi = isi;
        }
    }

    private HttpLatar() {}

    static Hasil kirim(String metode, String url, String token, String body) {
        HttpURLConnection k = null;
        try {
            k = (HttpURLConnection) new URL(url).openConnection();
            k.setRequestMethod(metode);
            k.setConnectTimeout(15000);
            k.setReadTimeout(20000);
            k.setRequestProperty("Authorization", "Bearer " + token);
            k.setRequestProperty("Accept", "application/json");
            if (body != null) {
                k.setDoOutput(true);
                k.setRequestProperty("Content-Type", "application/json");
                try (OutputStream o = k.getOutputStream()) {
                    o.write(body.getBytes(StandardCharsets.UTF_8));
                }
            }
            int status = k.getResponseCode();
            InputStream in = status >= 400 ? k.getErrorStream() : k.getInputStream();
            String isi = "";
            if (in != null) {
                ByteArrayOutputStream buf = new ByteArrayOutputStream();
                byte[] b = new byte[4096];
                int n;
                while ((n = in.read(b)) > 0) buf.write(b, 0, n);
                in.close();
                isi = buf.toString(StandardCharsets.UTF_8.name());
            }
            return new Hasil(status, isi);
        } catch (Exception e) {
            return new Hasil(-1, "");
        } finally {
            if (k != null) k.disconnect();
        }
    }
}
