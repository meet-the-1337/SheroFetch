package com.sherofetch.app;

import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaMetadataRetriever;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Environment;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
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
import java.security.MessageDigest;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Saves songs into Music/SheroFetch/Artist/Album/ (the same layout the PC library uses) and asks
 * Android's media scanner to index each file at once, so Poweramp and other players see it
 * without a manual rescan. Downloads stream straight to disk, so a 40 MB FLAC never crosses the
 * JavaScript bridge.
 */
@CapacitorPlugin(name = "SheroSave")
public class SheroSavePlugin extends Plugin {
    private static final String[] AUDIO = { ".flac", ".mp3", ".opus", ".ogg", ".m4a", ".wav" };
    private static SheroSavePlugin current;
    private final ExecutorService artPool = Executors.newFixedThreadPool(2);

    @Override
    public void load() { current = this; }

    /** A button on the lock screen, notification or headset, passed on to the page's player. */
    static void media(String action, double position) {
        if (current == null) return;
        JSObject e = new JSObject();
        e.put("action", action);
        if (position >= 0) e.put("position", position);
        current.notifyListeners("media", e);
    }

    /* ---------------------------------------------------------------- lock-screen player */

    /** A new song in the player: title, artist, duration (s) and art (an https link or a song file). */
    @PluginMethod
    public void nowPlaying(PluginCall call) {
        PlaybackService.title = call.getString("title", "");
        PlaybackService.artist = call.getString("artist", "");
        PlaybackService.duration = (long) (call.getDouble("duration", 0.0) * 1000);
        PlaybackService.position = 0;
        PlaybackService.art = null;
        String art = call.getString("art");
        String file = call.getString("file");
        PlaybackService.update(getContext());
        call.resolve();
        if (art == null && file == null) return;
        artPool.execute(() -> {
            Bitmap b = null;
            try {
                if (file != null) b = embedded(file, 512);
                if (b == null && art != null && art.startsWith("https://")) {
                    HttpURLConnection c = (HttpURLConnection) new URL(art).openConnection();
                    c.setConnectTimeout(10000);
                    c.setReadTimeout(15000);
                    try (InputStream in = c.getInputStream()) { b = BitmapFactory.decodeStream(in); } finally { c.disconnect(); }
                }
            } catch (Exception ignored) { /* no art, the controls still work */ }
            if (b != null && PlaybackService.title.equals(call.getString("title", ""))) {
                PlaybackService.art = b;
                PlaybackService.update(getContext());
            }
        });
    }

    /** Playing or paused, and where in the song (s). */
    @PluginMethod
    public void mediaState(PluginCall call) {
        PlaybackService.playing = call.getBoolean("playing", false);
        PlaybackService.position = (long) (call.getDouble("position", 0.0) * 1000);
        Double d = call.getDouble("duration");
        if (d != null && d > 0) PlaybackService.duration = (long) (d * 1000);
        PlaybackService.update(getContext());
        call.resolve();
    }

    @PluginMethod
    public void mediaStop(PluginCall call) {
        PlaybackService.stop(getContext());
        call.resolve();
    }

    /* ---------------------------------------------------------------- covers from the song files */

    /** The art embedded in a song file, scaled down and cached, as a path the page can show. */
    @PluginMethod
    public void art(PluginCall call) {
        String path = call.getString("path");
        int size = call.getInt("size", 160);
        artPool.execute(() -> {
            try {
                File src = new File(path);
                File dir = new File(getContext().getCacheDir(), "art");
                dir.mkdirs();
                File out = new File(dir, sha1(path + "|" + src.lastModified() + "|" + size) + ".jpg");
                File none = new File(out.getPath() + ".none");
                JSObject r = new JSObject();
                if (!out.exists() && !none.exists()) {
                    Bitmap b = embedded(path, size);
                    if (b == null) none.createNewFile();
                    else try (OutputStream os = new FileOutputStream(out)) { b.compress(Bitmap.CompressFormat.JPEG, 82, os); }
                }
                if (out.exists()) r.put("path", out.getAbsolutePath());
                call.resolve(r);
            } catch (Exception e) {
                call.resolve(new JSObject());
            }
        });
    }

    private static Bitmap embedded(String path, int size) {
        MediaMetadataRetriever m = new MediaMetadataRetriever();
        try {
            m.setDataSource(path);
            byte[] pic = m.getEmbeddedPicture();
            if (pic == null) return null;
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(pic, 0, pic.length, o);
            o.inSampleSize = 1;
            while (Math.min(o.outWidth, o.outHeight) / (o.inSampleSize * 2) >= size) o.inSampleSize *= 2;
            o.inJustDecodeBounds = false;
            Bitmap b = BitmapFactory.decodeByteArray(pic, 0, pic.length, o);
            if (b == null) return null;
            int side = Math.min(b.getWidth(), b.getHeight());
            if (side > size) b = Bitmap.createScaledBitmap(b, b.getWidth() * size / side, b.getHeight() * size / side, true);
            return b;
        } catch (Exception e) {
            return null;
        } finally {
            try { m.release(); } catch (Exception ignored) { }
        }
    }

    private static String sha1(String s) throws Exception {
        byte[] h = MessageDigest.getInstance("SHA-1").digest(s.getBytes(StandardCharsets.UTF_8));
        StringBuilder b = new StringBuilder();
        for (byte x : h) b.append(String.format("%02x", x));
        return b.toString();
    }

    /** Dark icons on the light Crayon look, light icons on the dark Stage look. */
    @PluginMethod
    public void setBars(PluginCall call) {
        boolean lightPage = call.getBoolean("light", true);
        getActivity().runOnUiThread(() -> {
            Window w = getActivity().getWindow();
            WindowInsetsControllerCompat c = WindowCompat.getInsetsController(w, w.getDecorView());
            c.setAppearanceLightStatusBars(lightPage);
            c.setAppearanceLightNavigationBars(lightPage);
            call.resolve();
        });
    }

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
                // Keep the audio extension on the temp file: without all-files access, Android only lets
                // an app create audio files in Music/, so "song.flac.part" would be refused.
                String op = out.getPath();
                int dot = op.lastIndexOf('.');
                part = new File(dot > op.lastIndexOf('/') ? op.substring(0, dot) + ".part" + op.substring(dot) : op + ".part");
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
            // A playlist is indexed at once, so Poweramp and other players list it without a rescan.
            if (out.getName().toLowerCase().matches(".*\\.m3u8?$")) scan(out);
            JSObject r = new JSObject();
            r.put("path", out.getAbsolutePath());
            call.resolve(r);
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? "Writing failed" : e.getMessage());
        }
    }

    /**
     * Opens a song or playlist from the vault in another music app (Poweramp, the phone's own
     * player...). Android asks which one, unless the person has picked a default.
     */
    @PluginMethod
    public void open(PluginCall call) {
        try {
            File f = new File(call.getString("path", "")).getCanonicalFile();
            File root = root().getCanonicalFile();
            if (!f.getPath().startsWith(root.getPath() + File.separator) || !f.exists()) { call.reject("That file is not in Music/SheroFetch"); return; }
            String name = f.getName().toLowerCase();
            String type = name.matches(".*\\.m3u8?$") ? "audio/x-mpegurl" : "audio/*";
            MediaScannerConnection.scanFile(getContext(), new String[] { f.getAbsolutePath() }, null, (p, uri) -> {
                if (uri == null) { call.reject("Android has not indexed that file yet"); return; }
                Intent view = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, type)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                try {
                    getContext().startActivity(Intent.createChooser(view, "Open with").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                    call.resolve();
                } catch (Exception e) {
                    call.reject("No music app on this phone can open it");
                }
            });
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? "Could not open it" : e.getMessage());
        }
    }

    /** Every song already in the vault, for the offline library. */
    @PluginMethod
    public void list(PluginCall call) {
        // Runs on its own thread: a big music folder takes seconds to walk, and plugin calls share
        // one thread, so a save tapped meanwhile would otherwise wait behind it.
        new Thread(() -> {
            JSArray items = new JSArray();
            walk(root(), items, 0);
            JSObject r = new JSObject();
            r.put("songs", items);
            call.resolve(r);
        }).start();
    }

    private void walk(File dir, JSArray items, int depth) {
        File[] files = dir.listFiles();
        if (files == null || depth > 4) return;
        // One directory listing answers "is there a cover / lyrics file?" without a disk call per song.
        java.util.Set<String> names = new java.util.HashSet<>();
        for (File f : files) names.add(f.getName());
        for (File f : files) {
            if (f.isDirectory()) { walk(f, items, depth + 1); continue; }
            if (!isAudio(f.getName())) continue;
            JSObject o = new JSObject();
            o.put("path", f.getAbsolutePath());
            o.put("name", f.getName());
            o.put("album", dir.getName());
            String lrcName = f.getName().replaceAll("\\.[^.]+$", ".lrc");
            if (names.contains(lrcName)) o.put("lrc", new File(dir, lrcName).getAbsolutePath());
            if (names.contains("cover.jpg")) o.put("cover", new File(dir, "cover.jpg").getAbsolutePath());
            o.put("bytes", f.length());
            o.put("modified", f.lastModified());
            items.put(o);
        }
    }

    private static boolean isAudio(String name) {
        String n = name.toLowerCase();
        if (n.contains(".part.")) return false; // a download still in progress
        for (String ext : AUDIO) if (n.endsWith(ext)) return true;
        return false;
    }
}
