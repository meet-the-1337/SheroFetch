#!/usr/bin/env python3
"""SheroFetch worker.

Takes songs from the Supabase queue, fetches them with the local pipeline (one subprocess per
song, so progress streams and a cancel can stop it), and serves finished files through a tiny
file-only HTTP server. Only that server is exposed to the internet, through a Cloudflare tunnel
whose address is published with every heartbeat: a named tunnel (CLOUDFLARE_TUNNEL_TOKEN plus
TUNNEL_PUBLIC_URL, a fixed address) when configured, otherwise a quick tunnel whose address
changes on every restart and is pushed to Supabase straight away.

Config: ~/.config/sherofetch/worker.env (KEY=VALUE lines), overridden by the environment.
First run: python -m worker.sherofetch_worker --setup  (asks for a worker invite code).
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
import platform
import re
import shutil
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path

import httpx
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

VERSION = "1.0.0"
ROOT = Path(__file__).resolve().parent.parent
HOME = Path.home()
CONF_DIR = HOME / ".config" / "sherofetch"
STATE_DIR = HOME / ".local" / "share" / "sherofetch"


def load_config() -> dict:
    conf: dict[str, str] = {}
    for name in ("supabase.env", "worker.env"):
        p = CONF_DIR / name
        if p.exists():
            for line in p.read_text().splitlines():
                if "=" in line and not line.lstrip().startswith("#"):
                    k, v = line.split("=", 1)
                    conf[k.strip()] = v.strip()
    conf.update({k: v for k, v in os.environ.items() if k.startswith(("SUPABASE_", "WORKER_", "SHEROFETCH_", "FILE_", "GUEST_", "ALLOWED_", "TUNNEL", "CLOUDFLARED", "CLOUDFLARE_", "LOW_BATTERY", "IDLE_POLL", "OFF_CHECK"))})
    return conf


C = load_config()
WORKER_ID = C.get("WORKER_ID", "worker_pc")
WORKER_NAME = C.get("WORKER_NAME", "PC")
WORKER_KIND = C.get("WORKER_KIND", "pc")
CAPACITY = int(C.get("WORKER_CAPACITY", "1"))
FILE_PORT = int(C.get("FILE_PORT", "5051"))
FILE_SECRET = C.get("FILE_SECRET", "")
OWNER_DIR = Path(os.path.expanduser(C.get("SHEROFETCH_MUSIC_DIR", str(HOME / "Music" / "MusicDownloader"))))
GUEST_DIR = Path(os.path.expanduser(C.get("GUEST_DIR", str(HOME / ".cache" / "sherofetch" / "guests"))))
GUEST_CAP = float(C.get("GUEST_CACHE_GB", "4")) * 1e9
ORIGINS = [o for o in C.get("ALLOWED_ORIGINS", "https://sherofetch.vercel.app,http://127.0.0.1:5173,http://localhost:5173,https://localhost,capacitor://localhost").split(",") if o]
TUNNEL = C.get("TUNNEL", "cloudflared")
CLOUDFLARED = C.get("CLOUDFLARED", shutil.which("cloudflared") or "cloudflared")
TUNNEL_TOKEN = C.get("CLOUDFLARE_TUNNEL_TOKEN", "")
TUNNEL_PUBLIC_URL = C.get("TUNNEL_PUBLIC_URL", "").rstrip("/")
PROGRESS_EVERY = 1.5  # seconds between progress RPCs, unless the stage changes
PYTHON = C.get("WORKER_PYTHON", sys.executable)
JOB_TIMEOUT = 15 * 60
LOW_BATTERY = int(C.get("LOW_BATTERY", "20"))
IDLE_POLL_BATTERY = int(C.get("IDLE_POLL_BATTERY", "30"))
OFF_CHECK = int(C.get("OFF_CHECK", "60"))  # seconds between "still off?" checks when plugged in
OFF_CHECK_BATTERY = int(C.get("OFF_CHECK_BATTERY", "300"))  # ... and on battery
LINK_DAYS = 30
IS_TERMUX = "com.termux" in os.environ.get("PREFIX", "")

STATE_DIR.mkdir(parents=True, exist_ok=True)
GUEST_DIR.mkdir(parents=True, exist_ok=True)


def log(*a) -> None:
    print(time.strftime("%H:%M:%S"), *a, flush=True)


# ----------------------------------------------------------------------------- Supabase


class Supa:
    """Supabase RPCs over one shared async HTTP client, signed in as the worker account."""

    def __init__(self) -> None:
        self.url = C.get("SUPABASE_URL", "").rstrip("/")
        self.key = C.get("SUPABASE_KEY", "")
        self._client: httpx.AsyncClient | None = None
        self.lock: asyncio.Lock | None = None
        self.token = ""
        self.refresh = ""
        self.expires = 0.0
        self.latency_ms = None

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=30, headers={"apikey": self.key})
            self.lock = asyncio.Lock()
        return self._client

    async def _auth(self, force: bool = False) -> str:
        client = self.client
        assert self.lock
        async with self.lock:
            if self.token and not force and time.time() < self.expires - 120:
                return self.token
            r = None
            if self.refresh and not force:
                r = await client.post(f"{self.url}/auth/v1/token?grant_type=refresh_token", json={"refresh_token": self.refresh}, timeout=20)
            if r is None or r.status_code >= 400:
                r = await client.post(f"{self.url}/auth/v1/token?grant_type=password", json={"email": C["WORKER_EMAIL"], "password": C["WORKER_PASSWORD"]}, timeout=20)
            r.raise_for_status()
            d = r.json()
            self.token, self.refresh = d["access_token"], d.get("refresh_token", "")
            self.expires = time.time() + float(d.get("expires_in", 3600))
            return self.token

    async def rpc(self, fn: str, **args):
        for attempt in (0, 1):
            token = await self._auth(force=attempt == 1)
            t0 = time.monotonic()
            r = await self.client.post(f"{self.url}/rest/v1/rpc/{fn}", json=args, headers={"Authorization": f"Bearer {token}"})
            self.latency_ms = round((time.monotonic() - t0) * 1000)
            if r.status_code == 401 and attempt == 0:
                continue
            if r.status_code >= 400:
                raise RuntimeError(f"{fn}: {r.status_code} {r.text[:200]}")
            return r.json() if r.content else None

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()


SUPA = Supa()
_last_logged: dict[str, float] = {}


LOOP: asyncio.AbstractEventLoop | None = None


async def _event(level: str, message: str, detail: dict | None) -> None:
    try:
        await SUPA.rpc("worker_log", p_id=WORKER_ID, p_level=level, p_message=message, p_detail=detail)
    except Exception as e:  # noqa: BLE001
        log("could not log event:", e)


def event(level: str, message: str, detail: dict | None = None) -> None:
    """Log an event to Supabase. Safe to call from the loop or from the tunnel thread."""
    key = f"{level}:{message[:80]}"
    if time.time() - _last_logged.get(key, 0) < 600:
        return
    _last_logged[key] = time.time()
    if LOOP is None:
        return
    coro = _event(level, message, detail)
    try:
        running = asyncio.get_running_loop()
    except RuntimeError:
        running = None
    if running is LOOP:
        LOOP.create_task(coro)
    else:
        asyncio.run_coroutine_threadsafe(coro, LOOP)


# ----------------------------------------------------------------------------- served files


class Served:
    """job id -> file on disk, persisted so links survive a restart."""

    def __init__(self) -> None:
        self.path = STATE_DIR / f"served-{WORKER_ID}.json"
        self.lock = threading.Lock()
        try:
            self.items: dict = json.loads(self.path.read_text())
        except Exception:  # noqa: BLE001
            self.items = {}

    def put(self, job_id: str, entry: dict) -> None:
        with self.lock:
            self.items[job_id] = entry
            self._save()

    def get(self, job_id: str):
        return self.items.get(job_id)

    def drop_missing(self) -> None:
        with self.lock:
            self.items = {k: v for k, v in self.items.items() if Path(v["path"]).exists()}
            self._save()

    def _save(self) -> None:
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.items))
        tmp.replace(self.path)


SERVED = Served()
BYTES_SERVED = [0]


def sign(kind: str, job_id: str, exp: int) -> str:
    return hmac.new(FILE_SECRET.encode(), f"{kind}.{job_id}.{exp}".encode(), hashlib.sha256).hexdigest()[:32]


def link(kind: str, job_id: str) -> str:
    exp = int(time.time()) + LINK_DAYS * 86400
    return f"/{kind}/{job_id}?e={exp}&s={sign(kind, job_id, exp)}"


AUDIO_TYPES = {".mp3": "audio/mpeg", ".flac": "audio/flac", ".opus": "audio/ogg", ".ogg": "audio/ogg", ".m4a": "audio/mp4", ".webm": "audio/webm"}
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["GET", "HEAD"], allow_headers=["Range"],
                   expose_headers=["Content-Length", "Content-Range", "Accept-Ranges", "Content-Disposition"])


@app.get("/health")
def health():
    return {"ok": True, "worker": WORKER_ID, "version": VERSION}


def _check(kind: str, job_id: str, e: int, s: str) -> dict:
    if e < time.time() or not hmac.compare_digest(sign(kind, job_id, e), s):
        raise HTTPException(403, "This link has expired or is not valid.")
    entry = SERVED.get(job_id)
    if not entry:
        raise HTTPException(404, "This machine no longer has that song.")
    return entry


@app.get("/f/{job_id}")
def serve_file(job_id: str, e: int, s: str, dl: int = 0):
    entry = _check("f", job_id, e, s)
    p = Path(entry["path"])
    if not p.exists():
        raise HTTPException(404, "This machine no longer has that song.")
    BYTES_SERVED[0] += p.stat().st_size if dl else 0
    return FileResponse(p, media_type=AUDIO_TYPES.get(p.suffix.lower(), "application/octet-stream"),
                        filename=entry.get("name") or p.name, content_disposition_type="attachment" if dl else "inline")


def cover_thumb(cover: Path, w: int) -> Path:
    """A small copy of the album art for lists (the original is often 1-2 MB). Made once, kept
    in the state folder, rebuilt if the cover changes."""
    thumbs = STATE_DIR / "thumbs"
    thumbs.mkdir(exist_ok=True)
    key = hashlib.sha1(f"{cover}|{cover.stat().st_mtime_ns}|{w}".encode()).hexdigest()[:20]
    out = thumbs / f"{key}.jpg"
    if not out.exists():
        from PIL import Image

        with Image.open(cover) as im:
            im = im.convert("RGB")
            im.thumbnail((w, w))
            tmp = out.with_suffix(".tmp")
            im.save(tmp, "JPEG", quality=82, optimize=True)
            tmp.replace(out)
    return out


@app.get("/c/{job_id}")
def serve_cover(job_id: str, e: int, s: str, w: int = 0):
    entry = _check("c", job_id, e, s)
    cover = entry.get("cover")
    if not cover or not Path(cover).exists():
        raise HTTPException(404, "No cover art for this song.")
    path = Path(cover)
    if w:
        try:
            path = cover_thumb(path, max(64, min(800, w)))
        except Exception as ex:  # noqa: BLE001  (no Pillow, or a broken image: send the original)
            log("thumbnail failed:", ex)
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=604800"})


# ----------------------------------------------------------------------------- tunnel


class Tunnel(threading.Thread):
    """Keeps cloudflared running. Named tunnel when a token is set (fixed address), else a quick
    tunnel; every new quick-tunnel address wakes the heartbeat so Supabase has it within seconds."""

    def __init__(self) -> None:
        super().__init__(daemon=True)
        self.named = bool(TUNNEL_TOKEN)
        self.url: str | None = None
        self.proc: subprocess.Popen | None = None
        self.stopping = False
        self.restarts = 0
        self.paused = threading.Event()  # set while the machine is switched off
        self.changed: asyncio.Event | None = None  # set by main() on the loop

    def _announce(self, url: str | None) -> None:
        self.url = url
        if self.changed is not None and LOOP is not None:
            LOOP.call_soon_threadsafe(self.changed.set)

    def _cmd(self) -> list[str]:
        if self.named:
            return [CLOUDFLARED, "tunnel", "--no-autoupdate", "run", "--token", TUNNEL_TOKEN]
        return [CLOUDFLARED, "tunnel", "--no-autoupdate", "--url", f"http://127.0.0.1:{FILE_PORT}"]

    def run(self) -> None:
        backoff = 3
        while not self.stopping:
            if self.paused.is_set():
                time.sleep(2)
                continue
            try:
                self.proc = subprocess.Popen(self._cmd(), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
                started = time.time()
                for line in self.proc.stdout:  # type: ignore[union-attr]
                    if self.named:
                        if self.url is None and "Registered tunnel connection" in line:
                            self._announce(TUNNEL_PUBLIC_URL)
                            log("named tunnel up:", TUNNEL_PUBLIC_URL)
                        continue
                    m = re.search(r"https://[a-z0-9-]+\.trycloudflare\.com", line)
                    # cloudflared also prints its own API address when it cannot reach it (no signal);
                    # that is not this machine's tunnel.
                    if m and m.group(0) != self.url and m.group(0) != "https://api.trycloudflare.com":
                        self._announce(m.group(0))
                        log("tunnel up:", self.url)
                self.proc.wait()
                if time.time() - started > 300:
                    backoff = 3
            except FileNotFoundError:
                event("error", "cloudflared is not installed, so songs cannot be streamed from this machine.")
                self.stopping = True
                return
            except Exception as e:  # noqa: BLE001
                log("tunnel error:", e)
            self._announce(None)
            if not self.stopping and not self.paused.is_set():
                self.restarts += 1
                event("warn", "The tunnel dropped and is restarting.")
                time.sleep(backoff)
                backoff = min(120, backoff * 2)

    def restart(self) -> None:
        if self.proc and self.proc.poll() is None:
            self.proc.terminate()

    def stop(self) -> None:
        self.stopping = True
        self.restart()

    def pause(self) -> None:
        self.paused.set()
        self.restart()

    def resume(self) -> None:
        self.paused.clear()


TUN = Tunnel() if TUNNEL == "cloudflared" else None


# ----------------------------------------------------------------------------- machine vitals


class Vitals:
    def __init__(self) -> None:
        self.prev_cpu = None
        self.prev_net = None
        self.battery_cache = (0.0, None)
        self.started = time.time()
        self.ytdlp = self._ytdlp_version()

    @staticmethod
    def _ytdlp_version():
        try:
            return subprocess.run([shutil.which("yt-dlp") or "yt-dlp", "--version"], capture_output=True, text=True, timeout=20).stdout.strip() or None
        except Exception:  # noqa: BLE001
            return None

    def cpu(self):
        try:
            vals = list(map(int, Path("/proc/stat").read_text().splitlines()[0].split()[1:]))
            idle, total = vals[3] + (vals[4] if len(vals) > 4 else 0), sum(vals)
            pct = None
            if self.prev_cpu and total > self.prev_cpu[1]:
                pct = round(100 * (1 - (idle - self.prev_cpu[0]) / (total - self.prev_cpu[1])), 1)
            self.prev_cpu = (idle, total)
            return pct
        except Exception:  # noqa: BLE001
            return None

    @staticmethod
    def load1():
        try:
            return round(os.getloadavg()[0], 2)
        except Exception:  # noqa: BLE001
            return None

    @staticmethod
    def mem():
        try:
            info = {l.split(":")[0]: int(l.split()[1]) for l in Path("/proc/meminfo").read_text().splitlines() if ":" in l}
            return round(100 * (1 - info["MemAvailable"] / info["MemTotal"]), 1)
        except Exception:  # noqa: BLE001
            return None

    def net(self):
        try:
            rx = tx = 0
            for line in Path("/proc/net/dev").read_text().splitlines()[2:]:
                name, data = line.split(":", 1)
                if name.strip() == "lo":
                    continue
                f = data.split()
                rx, tx = rx + int(f[0]), tx + int(f[8])
            now = time.time()
            out = (None, None)
            if self.prev_net:
                dt = now - self.prev_net[0]
                out = (round((rx - self.prev_net[1]) / dt), round((tx - self.prev_net[2]) / dt))
            self.prev_net = (now, rx, tx)
            return out
        except Exception:  # noqa: BLE001
            return (None, None)

    def battery(self):
        if time.time() - self.battery_cache[0] < 55:
            return self.battery_cache[1]
        result = None
        try:
            if IS_TERMUX and shutil.which("termux-battery-status"):
                d = json.loads(subprocess.run(["termux-battery-status"], capture_output=True, text=True, timeout=15).stdout)
                result = {"pct": d.get("percentage"), "charging": d.get("status") in ("CHARGING", "FULL") or d.get("plugged") not in (None, "UNPLUGGED"), "temp": d.get("temperature")}
            else:
                for b in Path("/sys/class/power_supply").glob("BAT*"):
                    result = {"pct": int((b / "capacity").read_text()), "charging": (b / "status").read_text().strip() in ("Charging", "Full", "Not charging"), "temp": None}
                    break
        except Exception:  # noqa: BLE001
            result = None
        self.battery_cache = (time.time(), result)
        return result

    def temp(self, battery):
        if battery and battery.get("temp") is not None:
            return round(float(battery["temp"]), 1)
        best = None
        for z in list(Path("/sys/class/thermal").glob("thermal_zone*/temp")) + list(Path("/sys/class/hwmon").glob("hwmon*/temp1_input")):
            try:
                v = int(z.read_text()) / 1000
                if 0 < v < 125:
                    best = max(best or 0, v)
            except Exception:  # noqa: BLE001
                continue
        return round(best, 1) if best else None

    @staticmethod
    def disk_free_gb(path: Path):
        try:
            return round(shutil.disk_usage(path).free / 1e9, 1)
        except Exception:  # noqa: BLE001
            return None


VITALS = Vitals()


async def local_backend_up() -> bool:
    try:
        async with httpx.AsyncClient(timeout=2) as c:
            return (await c.get("http://127.0.0.1:5050/")).is_success
    except Exception:  # noqa: BLE001
        return False


# ----------------------------------------------------------------------------- the jobs

STAGES = [
    (re.compile(r"\[(SEARCH|EXACT MATCH|URL RESOLVED|PICK)\]"), "Sniffing out the right version", 0.1),
    (re.compile(r"\[SELECT\]"), "Found the right version", 0.16),
    (re.compile(r"\[PATH\]"), "Making room in the library", 0.2),
    (re.compile(r"\[SKIP\]"), "Already had this one", 0.9),
    (re.compile(r"\[DOWNLOAD\] Initiating"), "Fetching", 0.24),
    (re.compile(r"\[TIER 1"), "Asking Soulseek for a clean rip", 0.3),
    (re.compile(r"\[TIER 2"), "Converting YouTube audio to FLAC", 0.5),
    (re.compile(r"\[TIER 3"), "Pulling the audio from YouTube", 0.5),
    (re.compile(r"\[TIER 4"), "Trying a backup audio stream", 0.6),
    (re.compile(r"\[TITANIUM|\[VALIDATE\]"), "Checking it is the right song", 0.75),
    (re.compile(r"Retrying from the picked upload"), "Wrong length, trying the official upload", 0.4),
    (re.compile(r"\[TAG\]"), "Adding tags, cover art and lyrics", 0.88),
    (re.compile(r"\[COMPLETE\]"), "Almost there", 0.95),
]
ACTIVE: dict[str, dict] = {}
COUNTS = {"done": 0, "failed": 0}
STOP = asyncio.Event()


def guest_cache_trim() -> None:
    files = [p for p in GUEST_DIR.rglob("*") if p.is_file()]
    total = sum(p.stat().st_size for p in files)
    if total <= GUEST_CAP:
        return
    for p in sorted(files, key=lambda p: p.stat().st_mtime):
        if total <= GUEST_CAP * 0.85:
            break
        total -= p.stat().st_size
        p.unlink(missing_ok=True)
    SERVED.drop_missing()


async def run_job(job: dict) -> None:
    jid = job["id"]
    # A person's own device keeps every song it fetches in its music folder; shared machines keep
    # only the owner's songs and hold everyone else's in a cache.
    owner = job.get("requester_role") == "owner" or bool(job.get("personal"))
    base = OWNER_DIR if owner else GUEST_DIR
    playlist = job["kind"] == "playlist"
    cmd = [PYTHON, "-u", str(ROOT / "worker" / "run_job.py"), "--mode", "playlist" if playlist else "track",
           "--query", job["query"], "--format", job["format"], "--base-dir", str(base)]
    for flag, key in (("--artist", "artist"), ("--title", "title"), ("--album", "album"), ("--url", "url")):
        if job.get(key):
            cmd += [flag, job[key]]
    if job.get("duration"):
        cmd += ["--duration", str(job["duration"])]
    env = dict(os.environ, PYTHONUNBUFFERED="1", SHEROFETCH_MUSIC_DIR=str(base))
    ACTIVE[jid] = {"query": job["query"], "started": time.time()}
    log("fetching", jid[:8], job["query"])
    proc = await asyncio.create_subprocess_exec(*cmd, cwd=str(ROOT), env=env, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
    result, tail, last_push, pushed_stage, stage, progress, cancelled = None, [], 0.0, None, "Fetching", 0.05, False

    async def push():
        # At most one progress RPC every PROGRESS_EVERY seconds; a new stage may go out at once.
        nonlocal last_push, pushed_stage, cancelled
        if stage == pushed_stage and time.time() - last_push < PROGRESS_EVERY:
            return
        last_push, pushed_stage = time.time(), stage
        try:
            status = await SUPA.rpc("worker_progress", p_id=WORKER_ID, p_job=jid, p_stage=stage, p_progress=progress)
            if status in ("cancelled", "gone"):
                cancelled = True
                proc.kill()
        except Exception as e:  # noqa: BLE001
            log("progress push failed:", e)

    async def read():
        nonlocal result, stage, progress
        assert proc.stdout
        async for raw in proc.stdout:
            line = raw.decode(errors="replace").rstrip()
            if line.startswith("@@RESULT "):
                result = json.loads(line[9:])
                continue
            tail.append(line)
            del tail[:-30]
            for rx, label, p in STAGES:
                if rx.search(line) and p >= progress:
                    stage, progress = label, p
                    await push()
                    break
            m = re.search(r"\[download\]\s+([\d.]+)%", line)
            if m:
                progress = max(progress, min(0.85, 0.5 + float(m.group(1)) / 100 * 0.35))
                await push()

    try:
        await asyncio.wait_for(asyncio.gather(read(), proc.wait()), timeout=JOB_TIMEOUT)
    except asyncio.TimeoutError:
        proc.kill()
        await finish(jid, False, None, None, "Took longer than 15 minutes, so Shero gave up on this one.")
        return
    finally:
        ACTIVE.pop(jid, None)
    if cancelled:
        log("cancelled", jid[:8])
        return

    if playlist:
        tracks = (result or {}).get("tracks") or []
        if not tracks:
            await finish(jid, False, None, None, (result or {}).get("message") or "No songs found at that link.")
            return
        rows = [{"query": t.get("query") or f"{t.get('artist', '')} - {t.get('title', '')}", "artist": t.get("artist"), "title": t.get("title"),
                 "album": None if t.get("album") == "Official Studio Release" else t.get("album"), "duration": t.get("duration") or None} for t in tracks]
        rows = [r for r in rows if (r["query"] or "").strip(" -")]
        n = await SUPA.rpc("worker_add_children", p_id=WORKER_ID, p_parent=jid, p_tracks=rows) or 0
        # Songs past today's limit wait on the playlist itself; the app adds them with queue_more.
        await finish(jid, True, {"tracks": n, "found": len(rows), "pending": rows[n:],
                                 "name": (result or {}).get("playlist_name") or (result or {}).get("name")}, None, None)
        return

    if not result or result.get("status") != "success":
        reason = (result or {}).get("reason") or next((l for l in reversed(tail) if l.strip()), "The pipeline stopped without a reason.")
        # The uploads Shero found go back with the failure, so the person can pick the right one.
        detail = {"code": (result or {}).get("code"), "candidates": (result or {}).get("candidates") or []}
        await finish(jid, False, detail, None, reason[:400])
        return


    path = Path(result.get("file_path") or result.get("final_file_path") or "")
    if not path.exists():
        await finish(jid, False, None, None, "The song was fetched but the file is missing.")
        return
    cover = path.parent / "cover.jpg"
    lrc_file = path.with_suffix(".lrc")
    lrc = lrc_file.read_text(encoding="utf-8", errors="replace") if lrc_file.exists() else None
    artist, track = result.get("artist") or job.get("artist") or "", result.get("track") or job.get("title") or path.stem
    name = f"{artist} - {track}{path.suffix}" if artist else path.name
    SERVED.put(jid, {"path": str(path), "cover": str(cover) if cover.exists() else None, "name": name, "owner": owner, "at": time.time()})
    if owner and IS_TERMUX and shutil.which("termux-media-scan"):
        subprocess.Popen(["termux-media-scan", str(path)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    source = str(result.get("source_used") or "")
    payload = {
        "artist": artist, "track": track, "album": result.get("album"), "year": result.get("year"),
        "duration": result.get("duration"), "size_mb": result.get("file_size_mb") or round(path.stat().st_size / 1048576, 1),
        "ext": path.suffix.lstrip("."), "source": source, "lossless_source": "soulseek" in source.lower() and path.suffix.lower() == ".flac",
        "file": link("f", jid), "cover": link("c", jid) if cover.exists() else None, "name": name,
        "saved_to": "library" if owner else "cache",
    }
    await finish(jid, True, payload, lrc, None)
    if not owner:
        await asyncio.to_thread(guest_cache_trim)


async def finish(jid, ok, result, lrc, error) -> None:
    COUNTS["done" if ok else "failed"] += 1
    if not ok:
        event("warn", f"A fetch failed: {str(error)[:200]}", {"job": jid})
    log("finished" if ok else "failed", jid[:8], "" if ok else error)
    for attempt in range(5):
        try:
            await SUPA.rpc("worker_finish", p_id=WORKER_ID, p_job=jid, p_ok=ok, p_result=result, p_lrc=lrc, p_error=error)
            return
        except Exception as e:  # noqa: BLE001
            log("finish failed, retrying:", e)
            await asyncio.sleep(3 * (attempt + 1))


def on_battery() -> bool:
    bat = VITALS.battery()
    return bool(bat) and not bat.get("charging")


def accepting() -> bool:
    """A phone running on its own battery stops taking new songs below LOW_BATTERY percent, so it
    never drains itself flat; it starts again once it is charging or back above the line."""
    bat = VITALS.battery()
    if not bat or bat.get("charging") or bat.get("pct") is None:
        return True
    return bat["pct"] > LOW_BATTERY


async def slot(n: int) -> None:
    idle = 0
    while not STOP.is_set():
        if POWER[0] == "off" or not accepting():
            try:
                await asyncio.wait_for(STOP.wait(), timeout=30)
            except asyncio.TimeoutError:
                pass
            continue
        try:
            job = await SUPA.rpc("worker_claim", p_id=WORKER_ID)
        except Exception as e:  # noqa: BLE001
            log(f"slot {n}: claim failed:", e)
            job = None
            await asyncio.sleep(10)
        if job:
            idle = 0
            try:
                await run_job(job)
            except Exception as e:  # noqa: BLE001
                event("error", f"Worker error while fetching: {e}")
                await finish(job["id"], False, None, None, f"Worker error: {e}")
            continue
        idle += 1
        # Polling is the main idle cost. Ask often right after work; on battery, back off to 30 s
        # once the queue has been empty for a couple of minutes.
        wait = 4 if idle < 15 else (IDLE_POLL_BATTERY if on_battery() and idle > 30 else 9)
        try:
            await asyncio.wait_for(STOP.wait(), timeout=wait)
        except asyncio.TimeoutError:
            pass


POWER = ["on"]  # "off" = switched off from the app: no fetching, no tunnel, no wake lock


def wake_lock(hold: bool) -> None:
    """On a phone, hold the CPU awake only while switched on, so Android can deep-sleep when off."""
    cmd = "termux-wake-lock" if hold else "termux-wake-unlock"
    if IS_TERMUX and shutil.which(cmd):
        subprocess.Popen([cmd], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def sleep_check_every() -> int:
    """How often a switched-off machine asks whether it was switched back on."""
    return OFF_CHECK_BATTERY if on_battery() else OFF_CHECK


async def asleep_beat() -> None:
    bat = VITALS.battery()
    await SUPA.rpc("worker_heartbeat", p_id=WORKER_ID, p_name=WORKER_NAME, p_kind=WORKER_KIND, p_public_url=None,
                   p_version=VERSION, p_capacity=CAPACITY, p_accepting=False,
                   p_stats={"asleep": True, "power": "off", "battery": bat, "done": COUNTS["done"], "failed": COUNTS["failed"],
                            "soulseek_account": (HOME / ".config" / "sockseek" / "sockseek.conf").exists(), "active": [{"id": k, **v} for k, v in ACTIVE.items()]},
                   p_sample=None)


def go_to_sleep() -> None:
    POWER[0] = "off"
    if TUN:
        TUN.pause()
    wake_lock(False)
    log("switched off from the app: sleeping")
    event("info", f"{WORKER_NAME} was switched off and is sleeping.")


def wake_up() -> None:
    POWER[0] = "on"
    wake_lock(True)
    if TUN:
        TUN.resume()
    log("switched on from the app")
    event("info", f"{WORKER_NAME} was switched on.")


async def heartbeat() -> None:
    last_sample = 0.0
    last_requeue = 0.0
    tunnel_fail = 0
    while not STOP.is_set():
        try:
            power = await SUPA.rpc("worker_power", p_id=WORKER_ID)
        except Exception as e:  # noqa: BLE001
            log("power check failed:", e)
            power = POWER[0]
        if power == "off":
            if POWER[0] != "off":
                go_to_sleep()
            try:
                await asleep_beat()
            except Exception as e:  # noqa: BLE001
                log("asleep heartbeat failed:", e)
            try:
                await asyncio.wait_for(STOP.wait(), timeout=sleep_check_every())
            except asyncio.TimeoutError:
                pass
            continue
        if POWER[0] == "off":
            wake_up()
        try:
            bat = VITALS.battery()
            rx, tx = VITALS.net()
            cpu = VITALS.cpu()
            sample = None
            if time.time() - last_sample > 55:
                last_sample = time.time()
                sample = {"cpu": cpu, "load1": VITALS.load1(), "mem_pct": VITALS.mem(), "disk_free_gb": VITALS.disk_free_gb(OWNER_DIR if OWNER_DIR.exists() else HOME),
                          "temp_c": VITALS.temp(bat), "battery_pct": bat and bat.get("pct"), "charging": bat and bat.get("charging"),
                          "rx_bps": rx, "tx_bps": tx, "active_jobs": len(ACTIVE), "latency_ms": SUPA.latency_ms}
            url = TUN.url if TUN else None
            tunnel_ok = None
            if url:
                try:
                    async with httpx.AsyncClient(timeout=8) as c:
                        tunnel_ok = (await c.get(f"{url}/health")).is_success
                except Exception:  # noqa: BLE001
                    tunnel_ok = False
                tunnel_fail = 0 if tunnel_ok else tunnel_fail + 1
                if tunnel_fail >= 4 and TUN:
                    tunnel_fail = 0
                    TUN.restart()
            stats = {
                "started_at": VITALS.started, "uptime_s": round(time.time() - VITALS.started), "host": platform.node(),
                "os": "Android (Termux)" if IS_TERMUX else f"{platform.system()} {platform.release()}", "python": platform.python_version(),
                "ytdlp": VITALS.ytdlp, "sockseek": bool(shutil.which("sockseek")), "soulseek_account": (HOME / ".config" / "sockseek" / "sockseek.conf").exists(),
                "tunnel_mode": "named" if TUN and TUN.named else ("quick" if TUN else "off"),
                "tunnel": "off" if not TUN else ("up" if tunnel_ok else ("checking" if url and tunnel_ok is None else "down")), "tunnel_restarts": TUN.restarts if TUN else 0,
                "backend_5050": await local_backend_up(), "active": [{"id": k, **v} for k, v in ACTIVE.items()],
                "done": COUNTS["done"], "failed": COUNTS["failed"], "bytes_served": BYTES_SERVED[0],
                "cpu": cpu, "load1": VITALS.load1(), "mem_pct": VITALS.mem(), "rx_bps": rx, "tx_bps": tx,
                "battery": bat, "temp_c": VITALS.temp(bat), "disk_free_gb": VITALS.disk_free_gb(OWNER_DIR if OWNER_DIR.exists() else HOME),
                "music_dir": str(OWNER_DIR), "capacity": CAPACITY, "latency_ms": SUPA.latency_ms,
            }
            await SUPA.rpc("worker_heartbeat", p_id=WORKER_ID, p_name=WORKER_NAME, p_kind=WORKER_KIND,
                           p_public_url=url if tunnel_ok else None, p_version=VERSION, p_capacity=CAPACITY,
                           p_accepting=accepting(), p_stats=stats, p_sample=sample)
            if time.time() - last_requeue > 60:
                last_requeue = time.time()
                n = await SUPA.rpc("worker_requeue_stale")
                if n:
                    event("info", f"Put {n} stalled song(s) back in the queue.")
        except Exception as e:  # noqa: BLE001
            log("heartbeat failed:", e)
        # Sleep 15 s, or wake early when the tunnel address changes so the new URL is live in ~2 s.
        waits = [asyncio.create_task(STOP.wait())]
        if TUN and TUN.changed:
            waits.append(asyncio.create_task(TUN.changed.wait()))
        _, pending = await asyncio.wait(waits, timeout=15, return_when=asyncio.FIRST_COMPLETED)
        for t in pending:
            t.cancel()
        if TUN and TUN.changed and TUN.changed.is_set():
            TUN.changed.clear()
            await asyncio.sleep(1)  # give the fresh tunnel a moment to accept /health


def serve_files() -> uvicorn.Server:
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=FILE_PORT, log_level="warning", access_log=False))
    server.install_signal_handlers = lambda: None  # type: ignore[method-assign]
    threading.Thread(target=server.run, daemon=True).start()
    return server


async def main() -> None:
    missing = [k for k in ("SUPABASE_URL", "SUPABASE_KEY", "WORKER_EMAIL", "WORKER_PASSWORD", "FILE_SECRET") if not C.get(k)]
    if missing:
        sys.exit(f"Missing config: {', '.join(missing)} (see ~/.config/sherofetch/worker.env)")
    global LOOP
    loop = LOOP = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            loop.add_signal_handler(sig, STOP.set)
        except (NotImplementedError, RuntimeError):  # Windows: Ctrl+C still ends the process
            pass
    server = serve_files()
    if TUN:
        if TUN.named and not TUNNEL_PUBLIC_URL:
            sys.exit("CLOUDFLARE_TUNNEL_TOKEN is set, so TUNNEL_PUBLIC_URL (the tunnel's fixed https address) is needed too.")
        TUN.changed = asyncio.Event()
        TUN.start()
    await SUPA.rpc("worker_heartbeat", p_id=WORKER_ID, p_name=WORKER_NAME, p_kind=WORKER_KIND, p_public_url=None,
                   p_version=VERSION, p_capacity=CAPACITY, p_accepting=True, p_stats={"starting": True}, p_sample=None)
    released = await SUPA.rpc("worker_release", p_id=WORKER_ID)
    event("info", f"{WORKER_NAME} worker {VERSION} started" + (f", handed back {released} unfinished song(s)" if released else ""))
    log(f"{WORKER_NAME} worker up: capacity {CAPACITY}, files on :{FILE_PORT}, owner songs to {OWNER_DIR}")
    wake_lock(True)
    tasks = [asyncio.create_task(heartbeat())] + [asyncio.create_task(slot(i)) for i in range(CAPACITY)]
    await STOP.wait()
    log("stopping")
    try:
        await SUPA.rpc("worker_release", p_id=WORKER_ID)
    except Exception:  # noqa: BLE001
        pass
    await SUPA.close()
    for t in tasks:
        t.cancel()
    if TUN:
        TUN.stop()
    wake_lock(False)
    server.should_exit = True


# ----------------------------------------------------------------------------- first-time setup


def arg(flag: str) -> str | None:
    a = sys.argv[1:]
    return a[a.index(flag) + 1] if flag in a and a.index(flag) + 1 < len(a) else None


def soulseek_login() -> None:
    """Ask for this person's own Soulseek account and keep it only on this device."""
    import getpass

    conf = HOME / ".config" / "sockseek" / "sockseek.conf"
    if conf.exists() and conf.read_text(errors="ignore").strip():
        print(f"Soulseek is already set up on this device ({conf}).")
        return
    print("\nSoulseek gives real FLAC and 320 kbps rips. It is optional: without it, songs come from YouTube.")
    print("No account yet? Just choose a new username and password; Soulseek makes the account on first login.")
    user = input("Soulseek username (Enter to skip): ").strip()
    if not user:
        print("Skipped. Add it later by running --setup again.")
        return
    password = getpass.getpass("Soulseek password (stays on this device): ")
    if not password:
        print("No password, so Soulseek was skipped.")
        return
    conf.parent.mkdir(parents=True, exist_ok=True)
    conf.write_text(f"username = {user}\npassword = {password}\n", encoding="utf-8")
    try:
        os.chmod(conf, 0o600)
    except OSError:
        pass
    print(f"Saved to {conf}.")


def setup() -> None:
    """Make a machine account from a machine invite (owner) or a device code (any member, for their
    own device) and write worker.env."""
    import getpass
    import secrets

    target = CONF_DIR / "worker.env"
    if target.exists() and input(f"{target} already exists. Replace it? [y/N] ").strip().lower() != "y":
        sys.exit("Left the existing worker.env alone.")
    url, key = C.get("SUPABASE_URL"), C.get("SUPABASE_KEY")
    site = arg("--site")
    if site and not (url and key):
        try:
            d = httpx.get(f"{site.rstrip('/')}/device.json", timeout=20).json()
            url, key = d.get("url"), d.get("key")
        except Exception as e:  # noqa: BLE001
            print(f"Could not read {site}/device.json: {e}")
    url = (url or input("Supabase project URL (https://....supabase.co): ")).strip().rstrip("/")
    key = (key or input("Supabase publishable (anon) key: ")).strip()
    if not re.match(r"^https://[a-z0-9-]+\.supabase\.co$", url) or not key:
        sys.exit("That Supabase URL or key does not look right.")
    code = (arg("--code") or getpass.getpass("Device or machine code: ")).strip().lower()
    personal = code.startswith("device-")
    host = re.sub(r"[^a-z0-9]", "", platform.node().lower())[:8] or "device"
    default_id = f"dev_{host}_{secrets.token_hex(2)}" if personal else re.sub(r"[^a-z0-9_]", "_", f"worker_{platform.node().lower()}")[:20]
    default_kind = "phone" if IS_TERMUX else "pc"
    if personal:
        # A person's own device: no questions beyond a name; the id only has to be unique.
        wid, kind = default_id, default_kind
        name = (arg("--name") or input(f"Name for this device [My {default_kind.upper() if default_kind == 'pc' else 'phone'}]: ").strip()[:40]
                or f"My {default_kind.upper() if default_kind == 'pc' else 'phone'}")
    else:
        wid = (input(f"Machine id [{default_id}]: ").strip().lower() or default_id)
        if not re.match(r"^[a-z0-9_]{3,20}$", wid):
            sys.exit("The machine id must be 3 to 20 letters, digits or underscores.")
        kind = (input(f"Kind, pc / phone / server [{default_kind}]: ").strip().lower() or default_kind)
        if kind not in ("pc", "phone", "server"):
            sys.exit("Kind must be pc, phone or server.")
        name = input(f"Display name [{kind.upper() if kind == 'pc' else kind.title()}]: ").strip()[:40] or (kind.upper() if kind == "pc" else kind.title())

    h = {"apikey": key, "Content-Type": "application/json"}
    with httpx.Client(timeout=30, headers=h) as c:
        ok = c.post(f"{url}/rest/v1/rpc/check_invite", json={"p_code": code, "p_role": "worker"})
        if ok.status_code >= 400 or ok.json() is not True:
            sys.exit("That code is not valid, used up or expired. Make a new one in the app (or the Control Room).")
        email, password = f"{wid}@users.example.com", secrets.token_urlsafe(24)
        r = c.post(f"{url}/auth/v1/signup", json={"email": email, "password": password, "data": {"username": wid, "invite_code": code}})
        if r.status_code >= 400:
            msg = r.json().get("msg") or r.json().get("message") or r.text[:200]
            sys.exit(f"Sign-up failed: {msg}")
        t = c.post(f"{url}/auth/v1/token?grant_type=password", json={"email": email, "password": password})
        if t.status_code >= 400:
            sys.exit("The account was made but cannot sign in yet (email confirmation may be on in Supabase Auth).")

    CONF_DIR.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Written by sherofetch_worker --setup. Keep this file private.",
        f"SUPABASE_URL={url}", f"SUPABASE_KEY={key}",
        f"WORKER_ID={wid}", f"WORKER_NAME={name}", f"WORKER_KIND={kind}", "WORKER_CAPACITY=1",
        f"WORKER_EMAIL={email}", f"WORKER_PASSWORD={password}", f"FILE_SECRET={secrets.token_hex(32)}",
        f"FILE_PORT={FILE_PORT}",
        "# Optional fixed address: a Cloudflare named tunnel's token and its public https URL.",
        "# CLOUDFLARE_TUNNEL_TOKEN=", "# TUNNEL_PUBLIC_URL=https://worker.example.com",
    ]
    if personal:
        music = Path.home() / "Music" / "SheroFetch" if not IS_TERMUX else Path("/sdcard/Music/SheroFetch")
        lines += [f"SHEROFETCH_MUSIC_DIR={music}", "WORKER_PERSONAL=1"]
    tmp = target.with_suffix(".tmp")
    tmp.write_text("\n".join(lines) + "\n")
    os.chmod(tmp, 0o600)
    tmp.replace(target)
    print(f"Device '{name}' is linked. Settings written to {target}.")
    soulseek_login()
    print("Start it with: python -u worker/sherofetch_worker.py")


if __name__ == "__main__":
    if "--setup" in sys.argv[1:]:
        setup()
    else:
        asyncio.run(main())
