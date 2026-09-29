package com.konsulin.asistenwarung;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.os.Build;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.OutputStream;
import java.util.Set;
import java.util.UUID;

// Cetak struk ke printer thermal Bluetooth "klasik" (58mm/80mm, perintah ESC/POS) - jenis yang umum dipakai
// warung. Printer kayak gini nggak bisa diakses dari browser (Web Bluetooth cuma buat BLE), makanya lewat
// plugin native ini. Printer harus udah dipasangkan (pairing) dulu di pengaturan Bluetooth HP.
//
// JS: daftar() -> { printer: [{ nama, alamat }] }, cetak({ alamat, data }) dengan `data` = byte ESC/POS base64.
@CapacitorPlugin(
    name = "PrinterBluetooth",
    permissions = {
        @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT }),
        @Permission(alias = "bluetoothLama", strings = { Manifest.permission.BLUETOOTH, Manifest.permission.BLUETOOTH_ADMIN })
    }
)
public class PrinterBluetoothPlugin extends Plugin {

    // Serial Port Profile - dipakai hampir semua printer thermal Bluetooth.
    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    private String aliasIzin() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? "bluetooth" : "bluetoothLama";
    }

    private BluetoothAdapter adapter() {
        BluetoothManager m = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return m != null ? m.getAdapter() : null;
    }

    // Balikin true kalau izin udah ada; kalau belum, minta dulu lalu lanjut ke `callback` setelah dijawab.
    private boolean pastikanIzin(PluginCall call, String callback) {
        if (getPermissionState(aliasIzin()) == PermissionState.GRANTED) return true;
        requestPermissionForAlias(aliasIzin(), call, callback);
        return false;
    }

    @PluginMethod
    public void daftar(PluginCall call) {
        if (pastikanIzin(call, "izinDaftar")) jalankanDaftar(call);
    }

    @PermissionCallback
    private void izinDaftar(PluginCall call) {
        if (getPermissionState(aliasIzin()) == PermissionState.GRANTED) jalankanDaftar(call);
        else call.reject("Izin Bluetooth ditolak. Buka Pengaturan HP > Aplikasi > Asisten Warung > Izin.", "IZIN_DITOLAK");
    }

    @SuppressLint("MissingPermission")
    private void jalankanDaftar(PluginCall call) {
        BluetoothAdapter a = adapter();
        if (a == null) {
            call.reject("HP ini nggak punya Bluetooth.", "TANPA_BLUETOOTH");
            return;
        }
        if (!a.isEnabled()) {
            call.reject("Bluetooth HP masih mati. Nyalain dulu ya.", "BLUETOOTH_MATI");
            return;
        }
        JSArray daftar = new JSArray();
        Set<BluetoothDevice> terpasang = a.getBondedDevices();
        if (terpasang != null) {
            for (BluetoothDevice d : terpasang) {
                JSObject o = new JSObject();
                o.put("nama", d.getName() != null ? d.getName() : d.getAddress());
                o.put("alamat", d.getAddress());
                daftar.put(o);
            }
        }
        JSObject hasil = new JSObject();
        hasil.put("printer", daftar);
        call.resolve(hasil);
    }

    @PluginMethod
    public void cetak(PluginCall call) {
        if (pastikanIzin(call, "izinCetak")) jalankanCetak(call);
    }

    @PermissionCallback
    private void izinCetak(PluginCall call) {
        if (getPermissionState(aliasIzin()) == PermissionState.GRANTED) jalankanCetak(call);
        else call.reject("Izin Bluetooth ditolak. Buka Pengaturan HP > Aplikasi > Asisten Warung > Izin.", "IZIN_DITOLAK");
    }

    @SuppressLint("MissingPermission")
    private void jalankanCetak(PluginCall call) {
        String alamat = call.getString("alamat");
        String data = call.getString("data");
        if (alamat == null || data == null) {
            call.reject("Printer atau isi struk kosong.");
            return;
        }
        BluetoothAdapter a = adapter();
        if (a == null || !a.isEnabled()) {
            call.reject("Bluetooth HP masih mati. Nyalain dulu ya.", "BLUETOOTH_MATI");
            return;
        }
        final byte[] isi;
        try {
            isi = Base64.decode(data, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            call.reject("Isi struk rusak.");
            return;
        }
        // Nyambung ke printer bisa makan beberapa detik - jangan di thread UI.
        new Thread(() -> {
            BluetoothSocket soket = null;
            try {
                BluetoothDevice printer = a.getRemoteDevice(alamat);
                a.cancelDiscovery();
                soket = printer.createRfcommSocketToServiceRecord(SPP);
                soket.connect();
                OutputStream keluar = soket.getOutputStream();
                keluar.write(isi);
                keluar.flush();
                // Kasih waktu printer narik semua datanya sebelum koneksi diputus (kalau langsung ditutup,
                // printer murah kadang motong baris terakhir).
                Thread.sleep(600);
                call.resolve();
            } catch (Exception e) {
                call.reject("Gagal nyambung ke printer. Pastikan printernya nyala, dekat, dan nggak lagi dipakai HP lain.", "GAGAL_SAMBUNG", e);
            } finally {
                if (soket != null) {
                    try {
                        soket.close();
                    } catch (Exception ignored) {}
                }
            }
        }).start();
    }
}
