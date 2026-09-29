package com.konsulin.asistenwarung;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Warna ikon jam/baterai & tombol navigasi ngikut tema aplikasi: latar terang -> ikon gelap, latar gelap -> ikon
// terang. Dipanggil dari PhoneShell.jsx tiap tema berubah (lihat lib/tampilanNative.js).
@CapacitorPlugin(name = "TampilanSistem")
public class TampilanSistemPlugin extends Plugin {

    @PluginMethod
    public void aturIkon(PluginCall call) {
        final boolean latarTerang = Boolean.TRUE.equals(call.getBoolean("latarTerang", true));
        getActivity().runOnUiThread(() -> {
            WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getActivity().getWindow(), getActivity().getWindow().getDecorView());
            c.setAppearanceLightStatusBars(latarTerang);
            c.setAppearanceLightNavigationBars(latarTerang);
            call.resolve();
        });
    }
}
