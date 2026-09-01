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

import sys
import re
import json
import subprocess
import requests

def extract_spotify_playlist(url: str):
    m = re.search(r"playlist[/:]([a-zA-Z0-9]+)", url)
    if not m:
        return []
    pid = m.group(1)
    embed_url = f"https://open.spotify.com/embed/playlist/{pid}"
    headers = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"}
    try:
        r = requests.get(embed_url, headers=headers, timeout=10)
        if r.status_code != 200:
            return []
        
        # Extract NEXT_DATA JSON
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
                    results.append({"title": title, "artist": artist, "query": f"{artist} - {title}"})
            if results:
                return results
    except Exception as e:
        pass
    return []

def extract_generic_playlist(url: str):
    cmd = ["yt-dlp", "--flat-playlist", "-J", "--no-warnings", url]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
        if p.returncode == 0 and p.stdout:
            data = json.loads(p.stdout)
            entries = data.get("entries", [])
            results = []
            for e in entries:
                t = e.get("title")
                uploader = e.get("uploader") or e.get("channel") or ""
                if t and t != "[Deleted video]" and t != "[Private video]":
                    results.append({"title": t, "artist": uploader, "query": f"{uploader} - {t}" if uploader else t})
            return results
    except Exception:
        pass
    return []

def resolve_playlist(url: str):
    if "spotify.com" in url:
        res = extract_spotify_playlist(url)
        if res:
            return {"status": "ok", "source": "spotify", "total": len(res), "tracks": res}
    
    # Generic (YouTube, SoundCloud, etc.)
    res = extract_generic_playlist(url)
    if res:
        return {"status": "ok", "source": "generic", "total": len(res), "tracks": res}

    return {"status": "error", "message": "Could not extract playlist tracks from URL", "tracks": []}

if __name__ == "__main__":
    if len(sys.argv) > 1:
        out = resolve_playlist(sys.argv[1])
        print(json.dumps(out))
    else:
        print(json.dumps({"status": "error", "message": "No URL provided"}))
