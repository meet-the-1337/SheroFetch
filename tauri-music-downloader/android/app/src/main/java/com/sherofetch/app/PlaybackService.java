package com.sherofetch.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.IBinder;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.media.app.NotificationCompat.MediaStyle;
import androidx.media.session.MediaButtonReceiver;

/**
 * The lock-screen and notification player. The song itself plays in the WebView; this service
 * only mirrors what it plays into an Android media session, so the lock screen, the notification
 * shade, Bluetooth buttons and watches can show and control it. Buttons pressed there are sent
 * back to the page through SheroSavePlugin.
 */
public class PlaybackService extends Service {
    static final String CHANNEL = "playback";
    static final int ID = 7;
    static MediaSessionCompat session;
    static String title = "", artist = "";
    static long duration = 0, position = 0;
    static boolean playing = false;
    static Bitmap art;

    /** Called by the plugin whenever the page's player changes. */
    static void update(Context ctx) {
        Intent i = new Intent(ctx, PlaybackService.class);
        if (!playing && session == null) return;
        try {
            if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i);
            else ctx.startService(i);
        } catch (Exception e) {
            // Android refuses a foreground start while the app is in the background; the page
            // only plays after a tap, so the next update from the foreground goes through.
        }
    }

    static void stop(Context ctx) {
        playing = false;
        ctx.stopService(new Intent(ctx, PlaybackService.class));
    }

    static MediaSessionCompat session(Context ctx) {
        if (session == null) {
            session = new MediaSessionCompat(ctx.getApplicationContext(), "SheroFetch");
            session.setCallback(new MediaSessionCompat.Callback() {
                @Override public void onPlay() { SheroSavePlugin.media("play", -1); }
                @Override public void onPause() { SheroSavePlugin.media("pause", -1); }
                @Override public void onStop() { SheroSavePlugin.media("stop", -1); }
                @Override public void onSeekTo(long pos) { SheroSavePlugin.media("seek", pos / 1000.0); }
                @Override public void onSkipToNext() { SheroSavePlugin.media("next", -1); }
                @Override public void onSkipToPrevious() { SheroSavePlugin.media("previous", -1); }
            });
            Intent open = new Intent(ctx, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
            session.setSessionActivity(PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_IMMUTABLE));
        }
        return session;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        MediaSessionCompat s = session(this);
        if (intent != null) MediaButtonReceiver.handleIntent(s, intent);
        MediaMetadataCompat.Builder meta = new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, duration);
        if (art != null) meta.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, art);
        s.setMetadata(meta.build());
        s.setPlaybackState(new PlaybackStateCompat.Builder()
            .setActions(PlaybackStateCompat.ACTION_PLAY | PlaybackStateCompat.ACTION_PAUSE | PlaybackStateCompat.ACTION_PLAY_PAUSE
                | PlaybackStateCompat.ACTION_SEEK_TO | PlaybackStateCompat.ACTION_STOP)
            .setState(playing ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED, position, playing ? 1f : 0f)
            .build());
        s.setActive(true);

        Notification n = build(s);
        // Always enter the foreground first: a button pressed on the lock screen starts this
        // service as a foreground service, and Android stops the app if it never says so.
        ServiceCompat.startForeground(this, ID, n, Build.VERSION.SDK_INT >= 29 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK : 0);
        if (!playing) {
            // Paused: keep the controls showing, but let the person swipe them away.
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_DETACH);
            getSystemService(NotificationManager.class).notify(ID, n);
        }
        return START_NOT_STICKY;
    }

    private Notification build(MediaSessionCompat s) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel c = new NotificationChannel(CHANNEL, "Now playing", NotificationManager.IMPORTANCE_LOW);
            c.setShowBadge(false);
            nm.createNotificationChannel(c);
        }
        NotificationCompat.Action toggle = playing
            ? new NotificationCompat.Action(android.R.drawable.ic_media_pause, "Pause", MediaButtonReceiver.buildMediaButtonPendingIntent(this, PlaybackStateCompat.ACTION_PAUSE))
            : new NotificationCompat.Action(android.R.drawable.ic_media_play, "Play", MediaButtonReceiver.buildMediaButtonPendingIntent(this, PlaybackStateCompat.ACTION_PLAY));
        return new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_shero)
            .setContentTitle(title)
            .setContentText(artist)
            .setLargeIcon(art)
            .setContentIntent(s.getController().getSessionActivity())
            .setDeleteIntent(MediaButtonReceiver.buildMediaButtonPendingIntent(this, PlaybackStateCompat.ACTION_STOP))
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .addAction(toggle)
            .setStyle(new MediaStyle().setMediaSession(s.getSessionToken()).setShowActionsInCompactView(0))
            .build();
    }

    @Override
    public void onDestroy() {
        if (session != null) { session.setActive(false); session.release(); session = null; }
        getSystemService(NotificationManager.class).cancel(ID);
        super.onDestroy();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        stopSelf(); // the app was swiped away, so the WebView playing the song is gone too
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
