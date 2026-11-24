# The phone as a permanent SheroFetch server (no PC needed)

The phone runs two things:

- **The SheroFetch app (APK)**: search, queue, library and player. It opens with no signal and plays what is in `Music/SheroFetch`.
- **The server in Termux**: Soulseek, yt-dlp and ffmpeg fetch the songs, and a Cloudflare tunnel streams them.

An APK cannot run Python, ffmpeg or Soulseek by itself, so the server has to live in Termux. Once set up it starts on boot and restarts itself. Jobs set to "Whichever is awake" go to the phone when the PC is off.

## One-time setup

1. Install **Termux**, **Termux:API** and **Termux:Boot** from F-Droid. The Play Store builds are outdated. Open Termux:Boot once.
2. In Termux, run:
   ```sh
   bash termux/setup.sh
   ```
   Then register the phone as a worker:
   ```sh
   python worker/sherofetch_worker.py --setup
   ```
   Use a machine invite code made in the Control Room.
3. Make it start by itself:
   ```sh
   termux/sherofetch-server.sh install-boot
   ```
   Then start it now:
   ```sh
   termux/sherofetch-server.sh start
   ```
4. Stop Android from killing the server. On ColorOS/OxygenOS, for Termux, Termux:API and Termux:Boot:
   - Settings → Apps → Battery → **Allow background activity**, and set it to **Don't optimise**.
   - Settings → Apps → **Auto launch: on**.
   - Lock Termux in the recent-apps screen (pull the card down, then tap the lock).
5. Optional: a fixed address instead of a new tunnel URL on every restart. Put `CLOUDFLARE_TUNNEL_TOKEN` and `TUNNEL_PUBLIC_URL` in `~/.config/sherofetch/worker.env`.

## Battery

These numbers are rough. Actual drain depends on the phone, signal and screen-off rules.

| State | What runs | Drain |
|---|---|---|
| Idle, on battery | Wake lock, a queue check every 30 s, heartbeat every 15 s, tunnel keep-alive | about 1–2 % an hour, 25–45 % a day |
| Idle, plugged in | Same, with a check every 4–9 s | none (charging) |
| Fetching one song | Soulseek or YouTube download, ffmpeg tagging or converting | about 0.2–0.5 % per song (MP3 is cheaper, FLAC conversion costs more) |
| A 200-song playlist | Mostly download time on Wi-Fi | about 40–80 % if unplugged, so keep it on the charger |

Built-in protections:

- **Low battery:** when unplugged, the worker stops taking new songs at 20 % (`LOW_BATTERY=20` in `worker.env`). It starts again when charging. Songs already started finish.
- **Idle back-off:** when unplugged and idle for about two minutes, it checks the queue every 30 s instead of every 9 s (`IDLE_POLL_BATTERY=30`).

As a permanent server, keep the phone on a charger. If the phone has a charge limit, turn it on. On ColorOS this is Settings → Battery → More → **Smart charging / Charge limit 80 %**. Holding the battery around 80 % instead of 100 % is what keeps it healthy for years of 24/7 use. Keep the phone somewhere cool; the worker reports its temperature to the Control Room.

## The PC as a server

An idle worker costs the PC almost nothing, well under 1 % CPU. The real cost is keeping the laptop awake, about 8–15 W, which is 5–7 hours on battery. A laptop server should stay plugged in.
