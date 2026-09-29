package com.konsulin.asistenwarung;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin buatan sendiri (bukan dari npm) wajib didaftarin sebelum super.onCreate.
        registerPlugin(PrinterBluetoothPlugin.class);
        registerPlugin(SinkronLatarPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
