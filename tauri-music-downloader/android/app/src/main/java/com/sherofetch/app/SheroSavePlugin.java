package com.sherofetch.app;

import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Environment;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Saves songs into Music/SheroFetch/Artist/Album/ (the same layout the PC library uses) and asks
 * Android's media scanner to index each file at once, so Poweramp and other players see it
 * without a manual rescan. Downloads stream straight to disk, so a 40 MB FLAC never crosses the
 * JavaScript bridge.
 */
@CapacitorPlugin(name = "SheroSave")
public class SheroSavePlugin extends Plugin {
    private static final String[] AUDIO = { ".flac", ".mp3", ".opus", ".ogg", ".m4a", ".wav" };

    private File root() {
        return new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC), "SheroFetch");
    }

    /** Resolves a path under the vault and refuses anything that climbs out of it. */
    private File target(String rel) throws Exception {
        if (rel == null || rel.isEmpty()) throw new Exception("No path given");
        File root = root().getCanonicalFile();
        File f = new File(root, rel).getCanonicalFile();
        if (!f.getPath().startsWith(root.getPath() + File.separator)) throw new Exception("Path leaves the music folder");
        return f;
    }

    private void scan(File f) {
        MediaScannerConnection.scanFile(getContext(), new String[] { f.getAbsolutePath() }, null, null);
    }

    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        String rel = call.getString("path");
        if (url == null || !url.startsWith("https://")) { call.reject("Only https links can be saved"); return; }
        new Thread(() -> {
            File out = null;
            File part = null;
            try {
                out = target(rel);
                File parent = out.getParentFile();
                if (parent != null && !parent.exists() && !parent.mkdirs()) throw new Exception("Could not make " + parent);
                part = new File(out.getPath() + ".part");
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(20000);
                c.setReadTimeout(60000);
                c.setInstanceFollowRedirects(true);
                int code = c.getResponseCode();
                if (code != 200) throw new Exception("The machine answered " + code);
                long total = c.getContentLengthLong();
                long got = 0;
                long lastNote = 0;
                try (InputStream in = c.getInputStream(); OutputStream os = new FileOutputStream(part)) {
                    byte[] buf = new byte[65536];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        os.write(buf, 0, n);
                        got += n;
                        long now = System.currentTimeMillis();
                        if (total > 0 && now - lastNote > 400) {
                            lastNote = now;
                            JSObject p = new JSObject();
                            p.put("url", url);
                            p.put("progress", (double) got / total);
                            notifyListeners("progress", p);
                        }
                    }
                } finally {
                    c.disconnect();
                }
                if (total > 0 && got != total) throw new Exception("The download stopped early");
                if (out.exists() && !out.delete()) throw new Exception("Could not replace the old file");
                if (!part.renameTo(out)) throw new Exception("Could not finish the file");
                if (isAudio(out.getName())) scan(out);
                JSObject r = new JSObject();
                r.put("path", out.getAbsolutePath());
                r.put("uri", Uri.fromFile(out).toString());
                r.put("bytes", got);
                call.resolve(r);
            } catch (Exception e) {
                if (part != null) part.delete();
                call.reject(e.getMessage() == null ? "Saving failed" : e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void writeText(PluginCall call) {
        try {
            File out = target(call.getString("path"));
            File parent = out.getParentFile();
            if (parent != null) parent.mkdirs();
            try (OutputStream os = new FileOutputStream(out)) {
                os.write(call.getString("text", "").getBytes(StandardCharsets.UTF_8));
            }
            JSObject r = new JSObject();
            r.put("path", out.getAbsolutePath());
            call.resolve(r);
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? "Writing failed" : e.getMessage());
        }
    }

    /** Every song already in the vault, for the offline library. */
    @PluginMethod
    public void list(PluginCall call) {
        JSArray items = new JSArray();
        walk(root(), items, 0);
        JSObject r = new JSObject();
        r.put("songs", items);
        call.resolve(r);
    }

    private void walk(File dir, JSArray items, int depth) {
        File[] files = dir.listFiles();
        if (files == null || depth > 4) return;
        for (File f : files) {
            if (f.isDirectory()) { walk(f, items, depth + 1); continue; }
            if (!isAudio(f.getName())) continue;
            JSObject o = new JSObject();
            o.put("path", f.getAbsolutePath());
            o.put("name", f.getName());
            o.put("album", f.getParentFile() != null ? f.getParentFile().getName() : "");
            File lrc = new File(f.getPath().replaceAll("\\.[^.]+$", ".lrc"));
            if (lrc.exists()) o.put("lrc", lrc.getAbsolutePath());
            File cover = new File(f.getParentFile(), "cover.jpg");
            if (cover.exists()) o.put("cover", cover.getAbsolutePath());
            o.put("bytes", f.length());
            o.put("modified", f.lastModified());
            items.put(o);
        }
    }

    private static boolean isAudio(String name) {
        String n = name.toLowerCase();
        for (String ext : AUDIO) if (n.endsWith(ext)) return true;
        return false;
    }
}
