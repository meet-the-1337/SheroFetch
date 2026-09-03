package com.sherofetch.app;

import android.media.MediaScannerConnection;
import android.os.Bundle;
import android.os.Environment;
import com.getcapacitor.BridgeActivity;
import java.io.File;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
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
