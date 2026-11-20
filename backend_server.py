import os
import sys
import re
import subprocess
import shutil
import json
import hashlib
import ipaddress
import secrets
import urllib.parse
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple

from fastapi import FastAPI, HTTPException, Query, Body, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

import checkpoint4_pipeline
from path_manager import DEFAULT_INDEX_FILE, DEFAULT_BASE_DIR

app = FastAPI(title="SheroFetch Authoritative Music Server", version="1.0.3")

# Enable CORS for all origins (Crucial for mobile Capacitor webview & external network access)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEFAULT_VAULT_DIR = DEFAULT_BASE_DIR

# ── Access control ────────────────────────────────────────────────────────────
# Loopback clients (the app on the same device) are always trusted.
# LAN clients must send SHEROFETCH_TOKEN (header X-SheroFetch-Token or ?token=) when one is set.
# Public-internet clients are refused unless SHEROFETCH_ALLOW_PUBLIC=1 (e.g. a hosted gateway).
API_TOKEN = os.environ.get("SHEROFETCH_TOKEN", "").strip()
ALLOW_PUBLIC = os.environ.get("SHEROFETCH_ALLOW_PUBLIC", "") == "1"
PUBLIC_PATHS = {"/"}


def _client_ip(request: Request):
    try:
        ip = ipaddress.ip_address(request.client.host if request.client else "")
    except ValueError:
        return None
    return ip.ipv4_mapped if getattr(ip, "ipv4_mapped", None) else ip


def _is_loopback(request: Request) -> bool:
    ip = _client_ip(request)
    return bool(ip and ip.is_loopback)


@app.middleware("http")
async def access_guard(request: Request, call_next):
    if request.method == "OPTIONS" or _is_loopback(request):
        return await call_next(request)
    ip = _client_ip(request)
    if not ALLOW_PUBLIC and not (ip and (ip.is_private or ip.is_link_local)):
        return JSONResponse(status_code=403, content={"detail": "SheroFetch only serves the local network"})
    if API_TOKEN and request.url.path not in PUBLIC_PATHS:
        supplied = request.headers.get("x-sherofetch-token") or request.query_params.get("token") or ""
        if not secrets.compare_digest(supplied, API_TOKEN):
            return JSONResponse(status_code=401, content={"detail": "Missing or invalid SheroFetch token"})
    return await call_next(request)


def _library_path(path: str) -> Path:
    """Resolve a client-supplied path and refuse anything outside the music library."""
    p = Path(path).expanduser().resolve()
    root = Path(DEFAULT_VAULT_DIR).expanduser().resolve()
    if p != root and not p.is_relative_to(root):
        raise HTTPException(status_code=403, detail="Access denied: path is outside the music library")
    return p


def _media_url(request: Request, endpoint: str, path, absolute: bool = False) -> str:
    """Build a playable media URL; carries the token for LAN clients since <audio> cannot send headers."""
    url = f"/api/audio/{endpoint}?path={urllib.parse.quote(str(path))}"
    if API_TOKEN and not _is_loopback(request):
        url += f"&token={urllib.parse.quote(API_TOKEN)}"
    return (str(request.base_url).rstrip("/") + url) if absolute else url

_local_sockseek = Path(__file__).parent / "sockseek.exe"
_bin_sockseek = Path(__file__).parent / "bin" / "sockseek.exe"
SOCKSEEK_BIN = shutil.which("sockseek") or (str(_local_sockseek) if _local_sockseek.exists() else (str(_bin_sockseek) if _bin_sockseek.exists() else "sockseek"))

class LoginRequest(BaseModel):
    username: str
    password: str

class DownloadRequest(BaseModel):
    query: str
    preferred_format: str = "opus"
    override_album: Optional[str] = None
    selection_index: int = 0
    exact_url: Optional[str] = None
    exact_title: Optional[str] = None
    exact_artist: Optional[str] = None

class TitaniumVerifyRequest(BaseModel):
    query: str
    expected_duration: Optional[float] = None
    preferred_format: str = "opus"

@app.get("/")
def root():
    return {
        "service": "SheroFetch Backend Server",
        "version": "1.0.3",
        "status": "online",
        "vault_dir": str(DEFAULT_VAULT_DIR),
        "soulseek_bin": SOCKSEEK_BIN
    }

def get_soulseek_credentials() -> Tuple[Optional[str], Optional[str]]:
    u = os.environ.get("SOULSEEK_USERNAME")
    p = os.environ.get("SOULSEEK_PASSWORD")
    if u and p:
        return u, p
    appdata = os.environ.get("APPDATA")
    conf_dir = (Path(appdata) / "sockseek") if appdata else (Path.home() / ".config" / "sockseek")
    conf_file = conf_dir / "sockseek.conf"
    if conf_file.exists():
        try:
            content = conf_file.read_text(encoding="utf-8")
            u_match = re.search(r"username\s*=\s*(.+)", content)
            p_match = re.search(r"password\s*=\s*(.+)", content)
            if u_match and p_match:
                u_found = u_match.group(1).strip()
                p_found = p_match.group(1).strip()
                os.environ["SOULSEEK_USERNAME"] = u_found
                os.environ["SOULSEEK_PASSWORD"] = p_found
                return u_found, p_found
        except Exception:
            pass
    return None, None

@app.get("/api/status")
def get_status():
    user, _ = get_soulseek_credentials()
    return {
        "status": "online",
        "soulseek_user": user or "",
        "soulseek_connected": bool(user),
        "mesh_status": f"P2P Ready (server.slsknet.org:2242) as {user}" if user else "P2P Guest Mode"
    }

@app.post("/api/soulseek/login")
def soulseek_login(req: LoginRequest):
    u = req.username.strip()
    p = req.password.strip()
    if not u or not p:
        raise HTTPException(status_code=400, detail="Username and password are required")

    # Run authentic test against Soulseek server directly
    is_valid, reason = checkpoint4_pipeline.verify_soulseek_credentials(u, p, timeout_sec=3.5)
    if not is_valid:
        if reason == "INVALIDPASS":
            return JSONResponse(
                status_code=401,
                content={
                    "success": False,
                    "error": f"The Soulseek server (server.slsknet.org) rejected login: INVALID PASSWORD for user '{u}'.",
                    "status": "Authentication Failed"
                }
            )
        else:
            return JSONResponse(
                status_code=503,
                content={
                    "success": False,
                    "error": f"Soulseek network authentication failed: {reason}",
                    "status": "Network Error"
                }
            )

    # Success: Save credentials in environment and sockseek.conf
    os.environ["SOULSEEK_USERNAME"] = u
    os.environ["SOULSEEK_PASSWORD"] = p

    appdata = os.environ.get("APPDATA")
    conf_dir = (Path(appdata) / "sockseek") if appdata else (Path.home() / ".config" / "sockseek")
    conf_dir.mkdir(parents=True, exist_ok=True)
    conf_file = conf_dir / "sockseek.conf"
    try:
        conf_file.write_text(f"[soulseek]\nusername = {u}\npassword = {p}\n", encoding="utf-8")
    except Exception:
        pass

    return {
        "success": True,
        "username": u,
        "status": f"Connected to Soulseek P2P Network (server.slsknet.org:2242) as {u}",
        "logged_in": True,
        "config_path": str(conf_file)
    }

@app.post("/api/soulseek/logout")
def soulseek_logout():
    os.environ.pop("SOULSEEK_USERNAME", None)
    os.environ.pop("SOULSEEK_PASSWORD", None)
    appdata = os.environ.get("APPDATA")
    conf_dir = (Path(appdata) / "sockseek") if appdata else (Path.home() / ".config" / "sockseek")
    conf_file = conf_dir / "sockseek.conf"
    if conf_file.exists():
        try:
            conf_file.unlink(missing_ok=True)
        except Exception:
            pass
    return {
        "success": True,
        "logged_in": False,
        "username": "",
        "status": "Signed out from Soulseek P2P Network"
    }

@app.get("/api/soulseek/profile")
def soulseek_profile():
    u, _ = get_soulseek_credentials()
    appdata = os.environ.get("APPDATA")
    conf_dir = (Path(appdata) / "sockseek") if appdata else (Path.home() / ".config" / "sockseek")
    return {
        "username": u or "",
        "logged_in": bool(u),
        "status": f"Connected to Soulseek P2P Mesh (server.slsknet.org:2242) as {u}" if u else "Guest Mode (Studio Engine)",
        "server": "server.slsknet.org:2242",
        "protocol": "Soulseek P2P / Slsk Protocol v160",
        "config_path": str(conf_dir / "sockseek.conf"),
        "output_dir": str(DEFAULT_VAULT_DIR),
        "open_source": [
            {
                "name": "Soulseek P2P Mesh",
                "role": "Decentralized Audiophile Network",
                "description": "True lossless 16-bit / 24-bit studio CD and vinyl FLAC rips directly from global audiophile peers."
            },
            {
                "name": "MusicBrainz",
                "role": "Canonical Music Encyclopedia",
                "description": "Open-source ontology providing authoritative metadata, Release Groups, and MBIDs."
            },
            {
                "name": "LRCLIB",
                "role": "Synced Lyrics Repository",
                "description": "Crowdsourced open-source synchronized and line-timed lyrics engine."
            },
            {
                "name": "yt-dlp",
                "role": "Studio Audio Engine",
                "description": "High-fidelity stream extraction and fallback audio stream pipeline."
            },
            {
                "name": "Capacitor & Android Native",
                "role": "Native Hardware Runtime",
                "description": "Hardware-accelerated audio pipelines, low-latency playback, and private sandbox storage."
            }
        ]
    }

@app.post("/api/search")
def search_tracks(query: str = Body(..., embed=True)):
    q = query.strip()
    if not q:
        return {"candidates": []}
    try:
        import match_song
        res = match_song.match_song(q)
        return res
    except Exception as e:
        return {"status": "error", "reason": str(e), "candidates": []}

@app.get("/api/stream/resolve")
def resolve_stream(url: Optional[str] = Query(None), videoId: Optional[str] = Query(None)):
    """Resolve direct playable audio stream URL using yt-dlp on the PC node."""
    target = url or (f"https://www.youtube.com/watch?v={videoId}" if videoId else None)
    if not target:
        raise HTTPException(status_code=400, detail="Missing url or videoId parameter")

    try:
        cmd = [
            "yt-dlp",
            "-j",
            "-f", "bestaudio/best",
            "--no-playlist",
            target
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        if proc.returncode != 0:
            raise HTTPException(status_code=502, detail=f"Stream extraction error: {proc.stderr[:200]}")

        data = json.loads(proc.stdout)
        stream_url = data.get("url")
        if not stream_url:
            raise HTTPException(status_code=404, detail="No direct audio stream URL extracted")

        return {
            "streamUrl": stream_url,
            "title": data.get("title", ""),
            "artist": data.get("uploader", "") or data.get("channel", ""),
            "duration": int(data.get("duration") or 210),
            "coverUrl": data.get("thumbnail") or (f"https://i.ytimg.com/vi/{videoId}/hqdefault.jpg" if videoId else "")
        }
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Stream resolution timed out")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/download")
def download_track(req: DownloadRequest, request: Request):
    q = (req.query or "").strip()
    direct_link = (req.exact_url or "").strip()
    if not q and not direct_link:
        raise HTTPException(status_code=400, detail="Query or exact_url cannot be empty")

    effective_query = direct_link if (direct_link and (direct_link.startswith("http") or "youtu" in direct_link)) else q

    try:
        pref_fmt = req.preferred_format.lower()
        res = checkpoint4_pipeline.process_song(
            input_query=effective_query,
            selection_index=req.selection_index,
            base_dir=DEFAULT_VAULT_DIR,
            override_album=req.override_album,
            preferred_format=pref_fmt,
            exact_url=direct_link or None,
            exact_title=req.exact_title,
            exact_artist=req.exact_artist
        )

        if res.get("status") == "success":
            final_path = res.get("file_path") or res.get("final_file_path")
            p = Path(final_path) if final_path else None
            
            # On Android/Termux, register the new file with MediaStore so players see it immediately
            if p and shutil.which("termux-media-scan"):
                try:
                    subprocess.Popen(["termux-media-scan", str(p)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                except Exception:
                    pass

            # Read synced lyrics if generated
            lrc_text = ""
            if p:
                lrc_file = p.with_suffix(".lrc")
                if lrc_file.exists():
                    try:
                        lrc_text = lrc_file.read_text(encoding="utf-8")
                    except Exception:
                        pass

            return {
                "status": "success",
                "artist": res.get("artist"),
                "track": res.get("track"),
                "album": res.get("album"),
                "year": res.get("year"),
                "file_path": str(p) if p else "",
                "file_size_mb": res.get("file_size_mb", 0.0),
                "duration": res.get("duration", 0.0),
                "source_used": res.get("source_used", "engine"),
                "audio_url": _media_url(request, "file", final_path) if final_path else "",
                "cover_url": _media_url(request, "cover", final_path) if final_path else "",
                "lrc_content": lrc_text,
                "has_lrc": bool(lrc_text),
                "has_cover": True
            }
        else:
            return {
                "status": "failed",
                "reason": res.get("reason", "Download failed"),
                "input": q
            }
    except Exception as e:
        return {
            "status": "failed",
            "reason": str(e),
            "input": q
        }

@app.post("/api/titanium/verify")
def titanium_verify(req: TitaniumVerifyRequest):
    """Pre-verify ground-truth audio candidates with Gemini and TV/Music catalog."""
    q = req.query.strip()
    if not q:
        raise HTTPException(status_code=400, detail="Query cannot be empty")
    try:
        import titanium_verifier
        is_cartoon = titanium_verifier.is_cartoon_or_tv(q)
        target_type = "Cartoon / TV Broadcast Theme" if is_cartoon else "Commercial Music Single"
        language = "Hindi / English" if is_cartoon else "English"
        candidates = titanium_verifier.search_youtube_candidates(q, max_results=6, is_cartoon=is_cartoon)
        best_id, conf, reason = titanium_verifier.gemini_verify_candidates(
            target_name=q,
            target_type=target_type,
            language=language,
            candidates=candidates
        )
        return {
            "query": q,
            "is_cartoon": is_cartoon,
            "target_type": target_type,
            "candidates_found": len(candidates),
            "best_youtube_id": best_id,
            "confidence": conf,
            "verified": conf >= 80.0 and bool(best_id),
            "reason": reason
        }
    except Exception as e:
        return {
            "query": q,
            "is_cartoon": False,
            "target_type": "Unknown",
            "candidates_found": 0,
            "best_youtube_id": None,
            "confidence": 0.0,
            "verified": False,
            "reason": f"Verification error: {str(e)}"
        }

@app.get("/api/audio/file")
def get_audio_file(path: str = Query(...)):
    try:
        p = _library_path(path)
        if not p.exists() or not p.is_file():
            raise HTTPException(status_code=404, detail=f"Audio file not found: {path}")

        # Ensure requested path is an audio file
        ext = p.suffix.lower()
        if ext not in (".flac", ".mp3", ".opus", ".m4a", ".wav", ".ogg", ".aac"):
            raise HTTPException(status_code=403, detail="Access denied: file is not an audio format")

        if ext == ".flac":
            media_type = "audio/flac"
        elif ext == ".mp3":
            media_type = "audio/mpeg"
        elif ext == ".opus":
            media_type = "audio/ogg; codecs=opus"
        elif ext == ".m4a":
            media_type = "audio/mp4"
        elif ext == ".wav":
            media_type = "audio/wav"
        else:
            media_type = "application/octet-stream"
        return FileResponse(
            path=p,
            media_type=media_type,
            filename=p.name,
            headers={
                "Accept-Ranges": "bytes",
                "Content-Disposition": f'attachment; filename="{p.name}"'
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/audio/cover")
def get_audio_cover(path: str = Query(...)):
    try:
        p = _library_path(path)
        cover_path = None
        if p.is_file():
            cp = p.parent / "cover.jpg"
            if cp.exists() and cp.is_file():
                cover_path = cp
            else:
                try:
                    covers = [p.parent / x for x in os.listdir(p.parent) if x.lower().endswith((".jpg", ".png", ".jpeg", ".webp"))]
                    if covers:
                        cover_path = covers[0]
                except Exception:
                    pass
        elif p.is_dir():
            cp = p / "cover.jpg"
            if cp.exists() and cp.is_file():
                cover_path = cp
        
        if cover_path and cover_path.exists() and cover_path.is_file():
            return FileResponse(path=cover_path, media_type="image/jpeg")

        # Extract embedded artwork from audio file (Opus/FLAC/MP3)
        if p.is_file() and p.suffix.lower() in (".opus", ".flac", ".mp3", ".m4a", ".ogg", ".wav"):
            cache_dir = Path.home() / ".cache" / "sherofetch" / "covers"
            cache_dir.mkdir(parents=True, exist_ok=True)
            path_hash = hashlib.md5(str(p).encode("utf-8")).hexdigest()
            cached_cover = cache_dir / f"{path_hash}.jpg"
            if cached_cover.exists() and cached_cover.stat().st_size > 500:
                return FileResponse(path=cached_cover, media_type="image/jpeg")
            
            cmd = ["ffmpeg", "-y", "-i", str(p), "-an", "-vcodec", "copy", "-f", "image2", str(cached_cover)]
            res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=4)
            if res.returncode == 0 and cached_cover.exists() and cached_cover.stat().st_size > 500:
                return FileResponse(path=cached_cover, media_type="image/jpeg")

        raise HTTPException(status_code=404, detail="Cover not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/library")
def get_library():
    index_file = DEFAULT_INDEX_FILE
    if index_file.exists():
        try:
            data = json.loads(index_file.read_text(encoding="utf-8"))
            return {"library": data, "vault_dir": str(DEFAULT_VAULT_DIR)}
        except Exception:
            pass
    return {"library": [], "vault_dir": str(DEFAULT_VAULT_DIR)}

@app.get("/api/vault/tracks")
def get_vault_tracks(request: Request):
    base = Path(DEFAULT_VAULT_DIR)
    if not base.exists():
        return {"tracks": [], "count": 0}
    
    tracks = []
    for root, _, files in os.walk(base):
        for f in files:
            if f.lower().endswith((".opus", ".flac", ".mp3", ".m4a", ".wav")):
                path = Path(root) / f
                base_name = path.stem
                lrc_file = path.with_suffix(".lrc")
                
                parts = base_name.split(" - ", 1)
                artist = parts[0].strip() if len(parts) > 1 else "Unknown Artist"
                title = parts[1].strip() if len(parts) > 1 else base_name
                try:
                    rel_dir = path.parent.relative_to(base)
                    dir_parts = rel_dir.parts
                    genre = dir_parts[0] if len(dir_parts) > 0 else "Various"
                    album = dir_parts[-1] if len(dir_parts) > 1 else "Single"
                except Exception:
                    genre = "Various"
                    album = "Single"

                tracks.append({
                    "title": title,
                    "artist": artist,
                    "album": album,
                    "genre": genre,
                    "path": str(path),
                    "filename": f,
                    "has_lrc": lrc_file.exists(),
                    "audio_url": _media_url(request, "file", path, absolute=True),
                    "cover_url": _media_url(request, "cover", path, absolute=True),
                    "format": path.suffix[1:].upper(),
                    "size_mb": round(path.stat().st_size / (1024 * 1024), 2)
                })
    return {"tracks": tracks, "count": len(tracks)}

@app.get("/api/vault/lyrics")
def get_vault_lyrics(path: str = Query(...)):
    p = _library_path(path)
    lrc_file = p.with_suffix(".lrc")
    if lrc_file.exists() and lrc_file.is_file():
        try:
            return {"lrc": lrc_file.read_text(encoding="utf-8", errors="ignore")}
        except Exception as e:
            return {"lrc": "", "error": str(e)}
    return {"lrc": ""}

@app.post("/api/vault/open-folder")
def open_vault_folder():
    base = Path(DEFAULT_VAULT_DIR)
    base.mkdir(parents=True, exist_ok=True)
    try:
        opener = shutil.which("xdg-open") or shutil.which("termux-open")
        if not opener:
            return {"success": False, "path": str(base), "error": "No folder opener available"}
        subprocess.Popen([opener, str(base)])
        return {"success": True, "path": str(base)}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.get("/apk")
@app.get("/SheroFetch-debug.apk")
def download_apk():
    apk_file = Path(__file__).parent / "apk-server" / "SheroFetch-debug.apk"
    if not apk_file.exists():
        apk_file = Path(__file__).parent / "SheroFetch-debug.apk"
    if not apk_file.exists():
        raise HTTPException(status_code=404, detail="APK not found")
    return FileResponse(
        path=apk_file,
        media_type="application/vnd.android.package-archive",
        filename="SheroFetch-debug.apk"
    )

@app.get("/download")
def download_page():
    html_file = Path(__file__).parent / "apk-server" / "index.html"
    if html_file.exists():
        return FileResponse(path=html_file, media_type="text/html")
    return {"message": "Visit /apk to download the latest SheroFetch Android APK."}

def main():
    import argparse
    import uvicorn
    ap = argparse.ArgumentParser(description="SheroFetch backend API server")
    ap.add_argument("--host", default=os.environ.get("SHEROFETCH_HOST", "127.0.0.1"))
    ap.add_argument("--port", type=int, default=int(os.environ.get("SHEROFETCH_PORT", "5050")))
    a = ap.parse_args()
    uvicorn.run(app, host=a.host, port=a.port)


if __name__ == "__main__":
    main()
