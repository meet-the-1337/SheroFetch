#!/usr/bin/env python3
"""SheroFetch worker.

Takes songs from the Supabase queue, fetches them with the local pipeline (one subprocess per
song, so progress streams and a cancel can stop it), and serves finished files through a tiny
file-only HTTP server. Only that server is exposed to the internet, through a Cloudflare quick
tunnel whose address is published with every heartbeat.

Config: ~/.config/sherofetch/worker.env (KEY=VALUE lines), overridden by the environment.
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

import requests
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
    conf.update({k: v for k, v in os.environ.items() if k.startswith(("SUPABASE_", "WORKER_", "SHEROFETCH_", "FILE_", "GUEST_", "ALLOWED_", "TUNNEL", "CLOUDFLARED"))})
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
PYTHON = C.get("WORKER_PYTHON", sys.executable)
JOB_TIMEOUT = 15 * 60
LINK_DAYS = 30
IS_TERMUX = "com.termux" in os.environ.get("PREFIX", "")

STATE_DIR.mkdir(parents=True, exist_ok=True)
GUEST_DIR.mkdir(parents=True, exist_ok=True)


def log(*a) -> None:
    print(time.strftime("%H:%M:%S"), *a, flush=True)


# ----------------------------------------------------------------------------- Supabase


class Supa:
    def __init__(self) -> None:
        self.url = C["SUPABASE_URL"].rstrip("/")
        self.key = C["SUPABASE_KEY"]
        self.s = requests.Session()
        self.lock = threading.RLock()
        self.token = ""
        self.refresh = ""
        self.expires = 0.0
        self.latency_ms = None

    def _auth(self, force: bool = False) -> str:
        with self.lock:
            if self.token and not force and time.time() < self.expires - 120:
                return self.token
            if self.refresh and not force:
                r = self.s.post(f"{self.url}/auth/v1/token?grant_type=refresh_token", json={"refresh_token": self.refresh}, headers={"apikey": self.key}, timeout=20)
            else:
                r = None
            if r is None or r.status_code >= 400:
                r = self.s.post(f"{self.url}/auth/v1/token?grant_type=password", json={"email": C["WORKER_EMAIL"], "password": C["WORKER_PASSWORD"]}, headers={"apikey": self.key}, timeout=20)
            r.raise_for_status()
            d = r.json()
            self.token, self.refresh = d["access_token"], d.get("refresh_token", "")
            self.expires = time.time() + float(d.get("expires_in", 3600))
            return self.token

    def rpc(self, fn: str, **args):
        for attempt in (0, 1):
            t0 = time.monotonic()
            r = self.s.post(f"{self.url}/rest/v1/rpc/{fn}", json=args, headers={"apikey": self.key, "Authorization": f"Bearer {self._auth(force=attempt == 1)}"}, timeout=30)
            self.latency_ms = round((time.monotonic() - t0) * 1000)
            if r.status_code == 401 and attempt == 0:
                continue
            if r.status_code >= 400:
                raise RuntimeError(f"{fn}: {r.status_code} {r.text[:200]}")
            return r.json() if r.content else None


SUPA = Supa()
_last_logged: dict[str, float] = {}


def event(level: str, message: str, detail: dict | None = None) -> None:
    key = f"{level}:{message[:80]}"
    if time.time() - _last_logged.get(key, 0) < 600:
        return
    _last_logged[key] = time.time()
    try:
        SUPA.rpc("worker_log", p_id=WORKER_ID, p_level=level, p_message=message, p_detail=detail)
    except Exception as e:  # noqa: BLE001
        log("could not log event:", e)


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


@app.get("/c/{job_id}")
def serve_cover(job_id: str, e: int, s: str):
    entry = _check("c", job_id, e, s)
    cover = entry.get("cover")
    if not cover or not Path(cover).exists():
        raise HTTPException(404, "No cover art for this song.")
    return FileResponse(cover, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})


# ----------------------------------------------------------------------------- tunnel


class Tunnel(threading.Thread):
    def __init__(self) -> None:
        super().__init__(daemon=True)
        self.url: str | None = None
        self.proc: subprocess.Popen | None = None
        self.stopping = False
        self.restarts = 0

    def run(self) -> None:
        backoff = 3
        while not self.stopping:
            try:
                self.proc = subprocess.Popen([CLOUDFLARED, "tunnel", "--no-autoupdate", "--url", f"http://127.0.0.1:{FILE_PORT}"],
                                             stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
                started = time.time()
                for line in self.proc.stdout:  # type: ignore[union-attr]
                    m = re.search(r"https://[a-z0-9-]+\.trycloudflare\.com", line)
                    if m and m.group(0) != self.url:
                        self.url = m.group(0)
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
            self.url = None
            if not self.stopping:
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


def local_backend_up() -> bool:
    try:
        return requests.get("http://127.0.0.1:5050/", timeout=2).ok
    except Exception:  # noqa: BLE001
        return False


# ----------------------------------------------------------------------------- the jobs

STAGES = [
    (re.compile(r"\[(SEARCH|EXACT MATCH|URL RESOLVED)\]"), "Sniffing out the right version", 0.1),
    (re.compile(r"\[SELECT\]"), "Found the right version", 0.16),
    (re.compile(r"\[PATH\]"), "Making room in the library", 0.2),
    (re.compile(r"\[SKIP\]"), "Already had this one", 0.9),
    (re.compile(r"\[DOWNLOAD\] Initiating"), "Fetching", 0.24),
    (re.compile(r"\[TIER 1"), "Asking Soulseek for a lossless copy", 0.3),
    (re.compile(r"\[TIER 2"), "Converting YouTube audio to FLAC", 0.5),
    (re.compile(r"\[TIER 3"), "Pulling the audio from YouTube", 0.5),
    (re.compile(r"\[TIER 4"), "Trying a backup audio stream", 0.6),
    (re.compile(r"\[TITANIUM|\[VALIDATE\]"), "Checking it is the right song", 0.75),
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
    owner = job.get("requester_role") == "owner"
    base = OWNER_DIR if owner else GUEST_DIR
    playlist = job["kind"] == "playlist"
    cmd = [PYTHON, "-u", str(ROOT / "worker" / "run_job.py"), "--mode", "playlist" if playlist else "track",
           "--query", job["query"], "--format", job["format"], "--base-dir", str(base)]
    for flag, key in (("--artist", "artist"), ("--title", "title"), ("--url", "url")):
        if job.get(key):
            cmd += [flag, job[key]]
    env = dict(os.environ, PYTHONUNBUFFERED="1", SHEROFETCH_MUSIC_DIR=str(base))
    ACTIVE[jid] = {"query": job["query"], "started": time.time()}
    log("fetching", jid[:8], job["query"])
    proc = await asyncio.create_subprocess_exec(*cmd, cwd=str(ROOT), env=env, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
    result, tail, last_push, stage, progress, cancelled = None, [], 0.0, "Fetching", 0.05, False

    async def push(force=False):
        nonlocal last_push, cancelled
        if not force and time.time() - last_push < 2:
            return
        last_push = time.time()
        try:
            status = await asyncio.to_thread(SUPA.rpc, "worker_progress", p_id=WORKER_ID, p_job=jid, p_stage=stage, p_progress=progress)
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
                    await push(force=True)
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
        rows = [{"query": t.get("query") or f"{t.get('artist', '')} - {t.get('title', '')}", "artist": t.get("artist"), "title": t.get("title"), "album": t.get("album")} for t in tracks]
        n = await asyncio.to_thread(SUPA.rpc, "worker_add_children", p_id=WORKER_ID, p_parent=jid, p_tracks=rows)
        await finish(jid, True, {"tracks": n, "found": len(tracks), "name": (result or {}).get("playlist_name") or (result or {}).get("name")}, None, None)
        return

    if not result or result.get("status") != "success":
        reason = (result or {}).get("reason") or next((l for l in reversed(tail) if l.strip()), "The pipeline stopped without a reason.")
        await finish(jid, False, None, None, reason[:400])
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
            await asyncio.to_thread(SUPA.rpc, "worker_finish", p_id=WORKER_ID, p_job=jid, p_ok=ok, p_result=result, p_lrc=lrc, p_error=error)
            return
        except Exception as e:  # noqa: BLE001
            log("finish failed, retrying:", e)
            await asyncio.sleep(3 * (attempt + 1))


async def slot(n: int) -> None:
    idle = 0
    while not STOP.is_set():
        try:
            job = await asyncio.to_thread(SUPA.rpc, "worker_claim", p_id=WORKER_ID)
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
        try:
            await asyncio.wait_for(STOP.wait(), timeout=4 if idle < 15 else 9)
        except asyncio.TimeoutError:
            pass


async def heartbeat() -> None:
    last_sample = 0.0
    last_requeue = 0.0
    tunnel_fail = 0
    while not STOP.is_set():
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
                    tunnel_ok = (await asyncio.to_thread(requests.get, f"{url}/health", timeout=8)).ok
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
                "tunnel": "off" if not TUN else ("up" if tunnel_ok else ("checking" if url and tunnel_ok is None else "down")), "tunnel_restarts": TUN.restarts if TUN else 0,
                "backend_5050": await asyncio.to_thread(local_backend_up), "active": [{"id": k, **v} for k, v in ACTIVE.items()],
                "done": COUNTS["done"], "failed": COUNTS["failed"], "bytes_served": BYTES_SERVED[0],
                "cpu": cpu, "load1": VITALS.load1(), "mem_pct": VITALS.mem(), "rx_bps": rx, "tx_bps": tx,
                "battery": bat, "temp_c": VITALS.temp(bat), "disk_free_gb": VITALS.disk_free_gb(OWNER_DIR if OWNER_DIR.exists() else HOME),
                "music_dir": str(OWNER_DIR), "capacity": CAPACITY, "latency_ms": SUPA.latency_ms,
            }
            await asyncio.to_thread(SUPA.rpc, "worker_heartbeat", p_id=WORKER_ID, p_name=WORKER_NAME, p_kind=WORKER_KIND,
                                    p_public_url=url if tunnel_ok else None, p_version=VERSION, p_capacity=CAPACITY,
                                    p_accepting=True, p_stats=stats, p_sample=sample)
            if time.time() - last_requeue > 60:
                last_requeue = time.time()
                n = await asyncio.to_thread(SUPA.rpc, "worker_requeue_stale")
                if n:
                    event("info", f"Put {n} stalled song(s) back in the queue.")
        except Exception as e:  # noqa: BLE001
            log("heartbeat failed:", e)
        try:
            await asyncio.wait_for(STOP.wait(), timeout=15)
        except asyncio.TimeoutError:
            pass


def serve_files() -> uvicorn.Server:
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=FILE_PORT, log_level="warning", access_log=False))
    server.install_signal_handlers = lambda: None  # type: ignore[method-assign]
    threading.Thread(target=server.run, daemon=True).start()
    return server


async def main() -> None:
    missing = [k for k in ("SUPABASE_URL", "SUPABASE_KEY", "WORKER_EMAIL", "WORKER_PASSWORD", "FILE_SECRET") if not C.get(k)]
    if missing:
        sys.exit(f"Missing config: {', '.join(missing)} (see ~/.config/sherofetch/worker.env)")
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, STOP.set)
    server = serve_files()
    if TUN:
        TUN.start()
    await asyncio.to_thread(SUPA.rpc, "worker_heartbeat", p_id=WORKER_ID, p_name=WORKER_NAME, p_kind=WORKER_KIND, p_public_url=None,
                            p_version=VERSION, p_capacity=CAPACITY, p_accepting=True, p_stats={"starting": True}, p_sample=None)
    released = await asyncio.to_thread(SUPA.rpc, "worker_release", p_id=WORKER_ID)
    event("info", f"{WORKER_NAME} worker {VERSION} started" + (f", handed back {released} unfinished song(s)" if released else ""))
    log(f"{WORKER_NAME} worker up: capacity {CAPACITY}, files on :{FILE_PORT}, owner songs to {OWNER_DIR}")
    tasks = [asyncio.create_task(heartbeat())] + [asyncio.create_task(slot(i)) for i in range(CAPACITY)]
    await STOP.wait()
    log("stopping")
    try:
        await asyncio.to_thread(SUPA.rpc, "worker_release", p_id=WORKER_ID)
    except Exception:  # noqa: BLE001
        pass
    for t in tasks:
        t.cancel()
    if TUN:
        TUN.stop()
    server.should_exit = True


if __name__ == "__main__":
    asyncio.run(main())
