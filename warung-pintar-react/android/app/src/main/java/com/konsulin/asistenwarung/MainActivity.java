package com.konsulin.asistenwarung;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import java.util.Locale;

public class MainActivity extends BridgeActivity {

    // Tinggi area jam/baterai & tombol navigasi (dp) terakhir - dikirim ulang tiap halaman selesai dimuat.
    private float amanAtas = 0;
    private float amanBawah = 0;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin buatan sendiri (bukan dari npm) wajib didaftarin sebelum super.onCreate.
        registerPlugin(PrinterBluetoothPlugin.class);
        registerPlugin(SinkronLatarPlugin.class);
        registerPlugin(TampilanSistemPlugin.class);
        super.onCreate(savedInstanceState);
        tampilanPenuh();
    }

    // Edge-to-edge: latar aplikasi nyambung sampai ke belakang jam/baterai & tombol navigasi. Supaya isinya nggak
    // ketimpa, tinggi dua area itu dikirim ke CSS sebagai --aman-atas / --aman-bawah (index.css). env(safe-area-*)
    // nggak bisa diandelin di WebView Android - di banyak HP nilainya 0.
    private void tampilanPenuh() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getWindow().setNavigationBarContrastEnforced(false);
            getWindow().setStatusBarContrastEnforced(false);
        }
        final WebView web = getBridge().getWebView();
        final float kepadatan = getResources().getDisplayMetrics().density;
        ViewCompat.setOnApplyWindowInsetsListener(web, (v, insets) -> {
            Insets bar = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets keyboard = insets.getInsets(WindowInsetsCompat.Type.ime());
            boolean adaKeyboard = insets.isVisible(WindowInsetsCompat.Type.ime());
            // Keyboard kebuka: tampilan dipendekin setinggi keyboard (edge-to-edge bikin Android nggak ngelakuin ini
            // sendiri - tanpa ini kolom isian ketutup keyboard). Area navigasi bawah jadi 0 karena ketutup keyboard.
            ViewGroup.MarginLayoutParams lp = (ViewGroup.MarginLayoutParams) v.getLayoutParams();
            int margin = adaKeyboard ? keyboard.bottom : 0;
            if (lp.bottomMargin != margin) {
                lp.bottomMargin = margin;
                v.setLayoutParams(lp);
            }
            amanAtas = bar.top / kepadatan;
            amanBawah = adaKeyboard ? 0 : bar.bottom / kepadatan;
            kirimKeHalaman(web);
            return WindowInsetsCompat.CONSUMED;
        });
        getBridge().addWebViewListener(
            new WebViewListener() {
                @Override
                public void onPageLoaded(WebView webView) {
                    kirimKeHalaman(webView);
                }
            }
        );
    }

    private void kirimKeHalaman(WebView web) {
        String js = String.format(
            Locale.US,
            "(function(){var s=document.documentElement.style;s.setProperty('--aman-atas','%.1fpx');s.setProperty('--aman-bawah','%.1fpx');" +
            "try{localStorage.setItem('aw_inset','%.1f,%.1f')}catch(e){}})();",
            amanAtas,
            amanBawah,
            amanAtas,
            amanBawah
        );
        web.post(() -> web.evaluateJavascript(js, null));
    }
}
