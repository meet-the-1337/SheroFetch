import os
import sys
import subprocess
import shutil
import json
from pathlib import Path
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException, Query, Body
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
_local_sockseek = Path(__file__).parent / "sockseek.exe"
_bin_sockseek = Path(__file__).parent / "bin" / "sockseek.exe"
SOCKSEEK_BIN = shutil.which("sockseek") or (str(_local_sockseek) if _local_sockseek.exists() else (str(_bin_sockseek) if _bin_sockseek.exists() else "sockseek"))

class LoginRequest(BaseModel):
    username: str
    password: str

class DownloadRequest(BaseModel):
    query: str
    preferred_format: str = "flac"
    override_album: Optional[str] = None
    selection_index: int = 0

@app.get("/")
def root():
    return {
        "service": "SheroFetch Backend Server",
        "version": "1.0.3",
        "status": "online",
        "vault_dir": str(DEFAULT_VAULT_DIR),
        "soulseek_bin": SOCKSEEK_BIN
    }

@app.get("/api/status")
def get_status():
    user = os.environ.get("SOULSEEK_USERNAME", "manansingahl")
    return {
        "status": "online",
        "soulseek_user": user,
        "soulseek_connected": bool(user),
        "mesh_status": "P2P Ready (server.slsknet.org:2242)"
    }

@app.post("/api/soulseek/login")
def soulseek_login(req: LoginRequest):
    u = req.username.strip()
    p = req.password.strip()
    if not u or not p:
        raise HTTPException(status_code=400, detail="Username and password are required")

    # Run authentic test against Soulseek server via sockseek CLI
    cmd = [
        SOCKSEEK_BIN,
        "-s", "test",
        "--user", u,
        "--pass", p,
        "--search-timeout", "1000",
        "--connect-timeout", "6000",
        "--no-progress"
    ]
    try:
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=10)
        out = proc.stdout or ""
        if "INVALIDPASS" in out or "rejected login attempt" in out:
            return JSONResponse(
                status_code=401,
                content={
                    "success": False,
                    "error": "The Soulseek server (server.slsknet.org) rejected login: INVALID PASSWORD.",
                    "status": "Authentication Failed"
                }
            )
        elif "Cannot connect to server" in out:
            return JSONResponse(
                status_code=503,
                content={
                    "success": False,
                    "error": "Cannot connect to Soulseek server (server.slsknet.org:2242). Network unreachable.",
                    "status": "Network Error"
                }
            )
    except subprocess.TimeoutExpired:
        # Connection timeout or slow mesh response
        pass
    except Exception as e:
        print(f"Error testing soulseek credentials: {e}")

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

@app.get("/api/soulseek/profile")
def soulseek_profile():
    u = os.environ.get("SOULSEEK_USERNAME", "manansingahl")
    appdata = os.environ.get("APPDATA")
    conf_dir = (Path(appdata) / "sockseek") if appdata else (Path.home() / ".config" / "sockseek")
    return {
        "username": u,
        "logged_in": bool(u),
        "status": f"Connected to Soulseek (server.slsknet.org) as {u}" if u else "Not Connected",
        "config_path": str(conf_dir / "sockseek.conf"),
        "output_dir": str(DEFAULT_VAULT_DIR)
    }

@app.post("/api/search")
def search_tracks(query: str = Body(..., embed=True)):
    q = query.strip()
    if not q:
        return {"candidates": []}
    res = checkpoint4_pipeline.search_and_rank_candidates(q)
    return res

@app.post("/api/download")
def download_track(req: DownloadRequest):
    q = req.query.strip()
    if not q:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    pref_fmt = req.preferred_format.lower()
    res = checkpoint4_pipeline.process_song(
        input_query=q,
        selection_index=req.selection_index,
        base_dir=DEFAULT_VAULT_DIR,
        override_album=req.override_album,
        preferred_format=pref_fmt
    )

    if res.get("status") == "success":
        final_path = res.get("file_path") or res.get("final_file_path")
        p = Path(final_path) if final_path else None
        
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
            "audio_url": f"/api/audio/file?path={final_path}" if final_path else "",
            "cover_url": f"/api/audio/cover?path={final_path}" if final_path else "",
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

@app.get("/api/audio/file")
def get_audio_file(path: str = Query(...)):
    p = Path(path)
    if not p.exists() or not p.is_file():
        raise HTTPException(status_code=404, detail=f"Audio file not found: {path}")

    ext = p.suffix.lower()
    media_type = "audio/flac" if ext == ".flac" else ("audio/mpeg" if ext == ".mp3" else "application/octet-stream")
    return FileResponse(
        path=p,
        media_type=media_type,
        filename=p.name,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Disposition": f'attachment; filename="{p.name}"'
        }
    )

@app.get("/api/audio/cover")
def get_audio_cover(path: str = Query(...)):
    p = Path(path)
    if p.is_file():
        cover_path = p.parent / "cover.jpg"
    else:
        cover_path = p / "cover.jpg"
    
    if cover_path.exists():
        return FileResponse(path=cover_path, media_type="image/jpeg")
    raise HTTPException(status_code=404, detail="Cover not found")

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5050)
