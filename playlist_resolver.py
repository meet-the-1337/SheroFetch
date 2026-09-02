#!/usr/bin/env python3
# SheroFetch — resolve and manage your music library
# Copyright (C) 2026 meet-the-1337
# Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0)
"""
Universal Playlist Resolver:
Extracts track names and artists from:
- YouTube / YouTube Music playlists
- Spotify playlists (via embed extraction)
- Apple Music / SoundCloud
- Raw URLs
"""

import os
import sys
import re
import json
import subprocess
import requests

def clean_track_entry(raw_title: str, raw_artist: str) -> dict:
    t = re.sub(r'[\xa0\u200b\u200c\u200d]+', ' ', raw_title or '').strip()
    a = re.sub(r'[\xa0\u200b\u200c\u200d]+', ' ', raw_artist or '').strip()

    # Clean out video baggage
    t = re.sub(r'(?i)\s*[\(\[](official\s*(music\s*)?(video|audio|hd\s*video|lyric\s*video)|lyric\s*video|visualizer|audio|hd|4k|explicit|lyrics)[\)\]]', '', t).strip()

    # If title looks like "Artist - Title"
    if " - " in t:
        parts = t.split(" - ", 1)
        p_art = parts[0].strip()
        p_tit = parts[1].strip()
        if not a or a.lower() in p_art.lower() or p_art.lower() in a.lower():
            a = p_art
            t = p_tit

    # Strip duplicate artist prefixes
    if a and t.lower().startswith(a.lower() + " - "):
        t = t[len(a) + 3:].strip()

    query = f"{a} - {t}" if a and a.lower() not in t.lower() else t
    return {
        "title": t,
        "artist": a if a else "Unknown Artist",
        "query": query.strip(" -")
    }

def extract_spotify_playlist(url: str):
    m = re.search(r"(?:playlist|album)[/:]([a-zA-Z0-9]+)", url)
    if not m:
        return []
    pid = m.group(1)
    is_album = "album" in url
    embed_url = f"https://open.spotify.com/embed/{'album' if is_album else 'playlist'}/{pid}"
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    try:
        r = requests.get(embed_url, headers=headers, timeout=12)
        if r.status_code == 200:
            match = re.search(r'<script id="__NEXT_DATA__" type="application/json">([^<]+)</script>', r.text)
            if match:
                data = json.loads(match.group(1))
                track_list = data.get("props", {}).get("pageProps", {}).get("state", {}).get("data", {}).get("entity", {}).get("trackList", [])
                results = []
                for item in track_list:
                    title = item.get("title") or item.get("name")
                    subtitle = item.get("subtitle") or item.get("artists")
                    if title:
                        artist = subtitle if isinstance(subtitle, str) else "Unknown Artist"
                        results.append(clean_track_entry(title, artist))
                if results:
                    return results
    except Exception:
        pass
    return []

def extract_generic_playlist(url: str):
    import shutil
    ytdlp_cmd = ["yt-dlp"] if shutil.which("yt-dlp") else [sys.executable, "-m", "yt_dlp"]
    cmd = [*ytdlp_cmd, "--flat-playlist", "-J", "--no-warnings", url]
    kwargs = {"capture_output": True, "text": True, "timeout": 90}
    if os.name == "nt":
        kwargs["creationflags"] = 0x08000000
    try:
        p = subprocess.run(cmd, **kwargs)
        if p.returncode == 0 and p.stdout:
            data = json.loads(p.stdout)
            entries = data.get("entries", [])
            results = []
            for e in entries:
                t = e.get("title")
                uploader = e.get("artist") or e.get("uploader") or e.get("channel") or ""
                if t and t != "[Deleted video]" and t != "[Private video]":
                    results.append(clean_track_entry(t, uploader))
            return results
    except Exception:
        pass
    return []

def resolve_playlist(url: str):
    clean_url = url.strip()
    if "spotify.com" in clean_url:
        res = extract_spotify_playlist(clean_url)
        if res:
            return {"status": "ok", "source": "spotify", "total": len(res), "tracks": res}

    # Generic (YouTube, SoundCloud, Bandcamp, or Spotify yt-dlp fallback)
    res = extract_generic_playlist(clean_url)
    if res:
        return {"status": "ok", "source": "generic", "total": len(res), "tracks": res}

    return {"status": "error", "message": "Could not extract playlist tracks from URL. Ensure the playlist is public.", "tracks": []}

if __name__ == "__main__":
    if len(sys.argv) > 1:
        out = resolve_playlist(sys.argv[1])
        print(json.dumps(out))
    else:
        print(json.dumps({"status": "error", "message": "No URL provided"}))
