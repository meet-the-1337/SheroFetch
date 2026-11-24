package com.sherofetch.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.media.MediaScannerConnection;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import com.getcapacitor.BridgeActivity;
import java.io.File;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SheroSavePlugin.class);
        super.onCreate(savedInstanceState);
        // Music access lets the app list songs other apps put in Music/SheroFetch
        // (for example the phone's own SheroFetch server). Asked once; saving works without it.
        String perm = Build.VERSION.SDK_INT >= 33 ? Manifest.permission.READ_MEDIA_AUDIO : Manifest.permission.READ_EXTERNAL_STORAGE;
        if (checkSelfPermission(perm) != PackageManager.PERMISSION_GRANTED) requestPermissions(new String[] { perm }, 7);
        scanMusicFolders();
    }

    @Override
    public void onResume() {
        super.onResume();
        scanMusicFolders();
    }

    private void scanMusicFolders() {
        new Thread(() -> {
            try {
                File musicDir = new File(Environment.getExternalStorageDirectory(), "Music/SheroFetch");
                File docsDir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS), "SheroFetch/Music");
                scanRecursive(musicDir);
                scanRecursive(docsDir);
            } catch (Exception e) {
                e.printStackTrace();
            }
        }).start();
    }

    private void scanRecursive(File dir) {
        if (dir == null || !dir.exists()) return;
        File[] files = dir.listFiles();
        if (files == null) return;
        for (File f : files) {
            if (f.isDirectory()) {
                scanRecursive(f);
            } else {
                String name = f.getName().toLowerCase();
                if (name.endsWith(".flac") || name.endsWith(".mp3") || name.endsWith(".m4a") || name.endsWith(".wav")) {
                    MediaScannerConnection.scanFile(this, new String[]{ f.getAbsolutePath() }, null, null);
                }
            }
        }
    }
}
