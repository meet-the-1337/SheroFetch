#!/usr/bin/env python3
# SheroFetch — resolve and manage your music library
# Copyright (C) 2026 meet-the-1337
# Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0)
"""
Universal Song & Playlist Resolver:
Extracts track names, artists, durations, direct URLs, and assigns unique deterministic
tracking codes for:
- Single song links (Spotify, YouTube, YouTube Music, Apple Music, JioSaavn, SoundCloud)
- Playlists & Albums (Spotify, YouTube, YouTube Music, Apple Music, JioSaavn)
- Fallback generic audio links
"""

import os
import sys
import re
import json
import hashlib
import subprocess
import requests

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

def generate_song_code(prefix: str, identifier: str, artist: str, title: str) -> str:
    """Generates a deterministic unique tracking code for each song (e.g. #SP-02HyFY, #YT-dQw4w9, #SF-a1b2c3d4)."""
    if prefix and identifier:
        clean_id = re.sub(r'[^a-zA-Z0-9_-]', '', identifier)
        short_id = clean_id[:8] if len(clean_id) >= 8 else clean_id
        return f"#{prefix.upper()}-{short_id}"
    
    # Hash-based deterministic fallback code
    raw_key = f"{artist.strip().lower()}:{title.strip().lower()}"
    h = hashlib.sha256(raw_key.encode('utf-8')).hexdigest()[:8]
    return f"#SF-{h}"

def clean_track_entry(
    raw_title: str,
    raw_artist: str,
    code: str = None,
    direct_url: str = None,
    duration: float = None,
    album: str = None,
    cover_url: str = None,
    source: str = "generic"
) -> dict:
    t = re.sub(r'[\xa0\u200b\u200c\u200d]+', ' ', raw_title or '').strip()
    a = re.sub(r'[\xa0\u200b\u200c\u200d]+', ' ', raw_artist or '').strip()
    alb = re.sub(r'[\xa0\u200b\u200c\u200d]+', ' ', album or '').strip()

    # 1. Clean file extensions and platform suffixes
    t = re.sub(r'(?i)\s*-\s*youtube(?:\.[a-z0-9]+)?$', '', t).strip()
    t = re.sub(r'(?i)\.(?:flv|mp4|mp3|m4a|webm|avi)$', '', t).strip()

    # 2. Clean out video and promotional baggage
    junk_patterns = [
        r'\[\s*(?:full\s*(?:audio\s*)?song|video\s*song|official\s*(?:video|audio|music\s*video|track|lyric\s*video|hd|hq|4k)|hq|hd|4k|lyrics?|eng\s*sub|remaster(?:ed)?|audio|full\s*album)\s*\]',
        r'\(\s*(?:full\s*(?:audio\s*)?song|video\s*song|official\s*(?:video|audio|music\s*video|track|lyric\s*video|hd|hq|4k)|hq|hd|4k|lyrics?|eng\s*sub|remaster(?:ed)?|audio|full\s*album)\s*\)',
        r'(?i)\bwith\s+(?:english\s+)?lyrics\b',
        r'(?i)\blyrical\s*:\s*',
        r'(?i)\b(?:full\s*(?:audio\s*)?song|video\s*song|official\s*(?:music\s*)?video)\b',
        r'(?i)\s*\|\s*(?:full\s*song|official|lyrics|audio|video).*$',
    ]
    for p in junk_patterns:
        t = re.sub(p, '', t, flags=re.IGNORECASE)
    t = re.sub(r'\s{2,}', ' ', t).strip(' -')

    # 3. Strip leading track numbers: e.g. '01 - ', '01. ', '01 ', '1. ', '[01] '
    t = re.sub(r'^\s*(?:\[\s*\d{1,3}\s*\]|\d{1,3}\s*[-.:)]|\d{1,3}\s+)\s*', '', t).strip()

    # 4. Handle Pipe '|' (e.g. Song Title | Movie | Cast | Singer)
    if '|' in t:
        parts = [p.strip() for p in t.split('|') if p.strip()]
        if parts:
            t = parts[0]
            if len(parts) > 1 and not alb:
                alb = parts[1]
            if len(parts) > 2 and (not a or a == "Unknown Artist" or re.search(r'(?i)\b(t-series|sony|zee|tips|yrf|records|vevo|channel|topic)\b', a)):
                a = parts[-1]

    # 5. Handle " - " (Artist - Title, Title - Artist, TrackNo - Title - Artist, Uploader - TrackNo - Title - Artist)
    if " - " in t:
        parts = [p.strip() for p in t.split(" - ") if p.strip()]
        
        # Filter out standalone track number tokens (e.g. '01', '1', '02', etc.)
        non_num_parts = [p for p in parts if not re.match(r'^\d{1,3}$', p)]
        
        # If uploader is prepended as first part and we have more parts
        if len(non_num_parts) >= 3 and a and (a.lower() in non_num_parts[0].lower() or non_num_parts[0].lower() in a.lower()):
            non_num_parts = non_num_parts[1:]
            
        if len(non_num_parts) >= 2:
            p1 = non_num_parts[0]
            p2 = " - ".join(non_num_parts[1:]) if len(non_num_parts) > 2 else non_num_parts[1]

            alb_clean = alb.lower() if alb else ""
            pos1 = alb_clean.find(p1.lower()) if len(p1) > 2 else -1
            pos2 = alb_clean.find(p2.lower()) if len(p2) > 2 else -1

            is_vevo_or_topic = bool(re.search(r'(?i)\b(vevo|topic|official|records|channel)\b', a))
            uploader_matches_p1 = bool(a and (a.lower() in p1.lower() or p1.lower() in a.lower()))
            uploader_matches_p2 = bool(a and (a.lower() in p2.lower() or p2.lower() in a.lower()))

            if pos2 != -1 and (pos1 == -1 or pos2 < pos1):
                # p2 comes first in album title or is the artist token in album title (e.g. Born To Die - Lana Del Rey)
                a = p2
                t = p1
            elif pos1 != -1 and (pos2 == -1 or pos1 < pos2):
                # p1 comes first in album title (e.g. Lana Del Rey - Born To Die)
                a = p1
                t = p2
            elif uploader_matches_p1 and not is_vevo_or_topic:
                a = p1
                t = p2
            elif uploader_matches_p2 and not is_vevo_or_topic:
                a = p2
                t = p1
            elif not a or a == "Unknown Artist" or not is_vevo_or_topic:
                # Default: Standard "Artist - Title"
                a = p1
                t = p2
            elif is_vevo_or_topic:
                a = re.sub(r'(?i)\s*(vevo|official|channel|music|topic)$', '', a).strip()
                t = p2 if a.lower() in p1.lower() else t

    # 6. Clean uploader channel suffixes
    if a:
        a = re.sub(r'(?i)\s*-\s*topic$', '', a).strip()
        a = re.sub(r'(?i)\s*vevo$', '', a).strip()
        a = re.sub(r'(?i)\s*official(?:\s*channel)?$', '', a).strip()

    # 7. Strip duplicate artist prefixes from title
    if a and t.lower().startswith(a.lower() + " - "):
        t = t[len(a) + 3:].strip()
    if a and t.lower().startswith(a.lower() + " : "):
        t = t[len(a) + 3:].strip()

    # Strip any remaining leading numbers or dangling punctuation
    t = re.sub(r'^\s*(?:\[\s*\d{1,3}\s*\]|\d{1,3}\s*[-.:)]|\d{1,3}\s+)\s*', '', t).strip()
    a = a.strip(" -:–—|/\\")
    t = t.strip(" -:–—|/\\")

    if not code:
        code = generate_song_code("SF", "", a, t)

    query = f"{a} - {t}" if a and a.lower() not in t.lower() else t
    return {
        "code": code,
        "title": t if t else "Unknown Track",
        "artist": a if a else "Unknown Artist",
        "album": alb or "Official Studio Release",
        "duration": round(float(duration), 1) if duration else 0.0,
        "direct_url": direct_url or "",
        "cover_url": cover_url or "",
        "query": query.strip(" -"),
        "source": source
    }


def extract_spotify(url: str):
    """Handles Spotify single tracks and full playlists/albums."""
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}

    # 1. Single Spotify Track
    m_track = re.search(r"track[/:]([a-zA-Z0-9]+)", url)
    if m_track:
        tid = m_track.group(1)
        code = generate_song_code("SP", tid, "", "")
        
        # Try embed page for clean JSON
        try:
            r = requests.get(f"https://open.spotify.com/embed/track/{tid}", headers=headers, timeout=8)
            if r.status_code == 200:
                match = re.search(r'<script id="__NEXT_DATA__" type="application/json">([^<]+)</script>', r.text)
                if match:
                    data = json.loads(match.group(1))
                    entity = data.get("props", {}).get("pageProps", {}).get("state", {}).get("data", {}).get("entity", {})
                    title = entity.get("name") or entity.get("title") or ""
                    artists = entity.get("artists") or []
                    artist = ", ".join(art.get("name", "") for art in artists if art.get("name")) if artists else "Unknown Artist"
                    dur_sec = (entity.get("duration") or 0) / 1000.0
                    album = entity.get("album", {}).get("name") or ""
                    cover = ""
                    if entity.get("coverArt", {}).get("sources"):
                        cover = entity["coverArt"]["sources"][0].get("url", "")

                    if title:
                        track = clean_track_entry(
                            raw_title=title,
                            raw_artist=artist,
                            code=code,
                            direct_url=f"https://open.spotify.com/track/{tid}",
                            duration=dur_sec,
                            album=album,
                            cover_url=cover,
                            source="spotify"
                        )
                        return {"type": "song", "status": "ok", "source": "spotify", "title": track["title"], "artist": track["artist"], "total": 1, "tracks": [track]}
        except Exception:
            pass

        # Fallback to OpenGraph scraper
        try:
            r = requests.get(f"https://open.spotify.com/track/{tid}", headers={"User-Agent": "facebookexternalhit/1.1"}, timeout=8)
            if r.status_code == 200:
                t_match = re.search(r'<meta property="og:title" content="([^"]+)"', r.text)
                d_match = re.search(r'<meta property="og:description" content="([^"]+)"', r.text)
                title = t_match.group(1) if t_match else ""
                artist = "Unknown Artist"
                album = ""
                if d_match:
                    desc = d_match.group(1)
                    parts = desc.split("·")
                    if parts:
                        artist = parts[0].strip()
                    if len(parts) >= 2:
                        album = parts[1].strip()
                if title:
                    track = clean_track_entry(
                        raw_title=title,
                        raw_artist=artist,
                        code=code,
                        direct_url=f"https://open.spotify.com/track/{tid}",
                        album=album,
                        source="spotify"
                    )
                    return {"type": "song", "status": "ok", "source": "spotify", "title": track["title"], "artist": track["artist"], "total": 1, "tracks": [track]}
        except Exception:
            pass

    # 2. Spotify Playlist or Album
    m_pl = re.search(r"(?:playlist|album)[/:]([a-zA-Z0-9]+)", url)
    if m_pl:
        pid = m_pl.group(1)
        is_album = "album" in url
        embed_url = f"https://open.spotify.com/embed/{'album' if is_album else 'playlist'}/{pid}"
        try:
            r = requests.get(embed_url, headers=headers, timeout=12)
            if r.status_code == 200:
                match = re.search(r'<script id="__NEXT_DATA__" type="application/json">([^<]+)</script>', r.text)
                if match:
                    data = json.loads(match.group(1))
                    entity = data.get("props", {}).get("pageProps", {}).get("state", {}).get("data", {}).get("entity", {})
                    playlist_title = entity.get("title") or entity.get("name") or "Spotify Playlist"
                    track_list = entity.get("trackList", [])
                    results = []
                    for idx, item in enumerate(track_list, start=1):
                        title = item.get("title") or item.get("name")
                        subtitle = item.get("subtitle") or item.get("artists")
                        artist = subtitle if isinstance(subtitle, str) else "Unknown Artist"
                        uri = item.get("uri") or ""
                        track_id = uri.split(":")[-1] if ":" in uri else f"{pid}_{idx}"
                        code = generate_song_code("SP", track_id, artist, title or "")
                        dur_sec = (item.get("duration") or 0) / 1000.0

                        if title:
                            results.append(clean_track_entry(
                                raw_title=title,
                                raw_artist=artist,
                                code=code,
                                direct_url=f"https://open.spotify.com/track/{track_id}" if "spotify:track:" in uri else "",
                                duration=dur_sec,
                                album=playlist_title,
                                source="spotify"
                            ))
                    if results:
                        return {
                            "type": "playlist",
                            "status": "ok",
                            "source": "spotify",
                            "playlist_title": playlist_title,
                            "total": len(results),
                            "tracks": results
                        }
        except Exception:
            pass

    return None

def resolve_single_youtube_video(vid: str):
    direct_url = f"https://www.youtube.com/watch?v={vid}"
    code = generate_song_code("YT", vid, "", "")

    # Fast oEmbed API (sub-500ms)
    try:
        oembed_url = f"https://www.youtube.com/oembed?url={direct_url}&format=json"
        r = requests.get(oembed_url, timeout=4)
        if r.status_code == 200:
            data = r.json()
            raw_title = data.get("title", "")
            author = data.get("author_name", "")
            author = re.sub(r'(?i)\s*(vevo|official|channel|music|topic)$', '', author).strip()
            thumb = data.get("thumbnail_url", "")

            track = clean_track_entry(
                raw_title=raw_title,
                raw_artist=author,
                code=code,
                direct_url=direct_url,
                cover_url=thumb,
                source="youtube"
            )
            return {
                "type": "song",
                "status": "ok",
                "source": "youtube",
                "title": track["title"],
                "artist": track["artist"],
                "total": 1,
                "tracks": [track]
            }
    except Exception:
        pass

    return extract_generic_ytdlp(direct_url)

def extract_youtube(url: str):
    """Handles YouTube & YouTube Music single videos and playlists with zero lag."""
    m_pl = re.search(r'[?&]list=([a-zA-Z0-9_-]+)', url)
    m_vid = re.search(r'(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})', url)

    # 1. Check if playlist parameter present
    if m_pl:
        pl_id = m_pl.group(1)
        is_radio_or_mix = pl_id.startswith("RD") or pl_id.startswith("UL") or "start_radio=1" in url
        if not is_radio_or_mix:
            pl_res = extract_generic_ytdlp(f"https://www.youtube.com/playlist?list={pl_id}")
            if pl_res and pl_res.get("type") == "playlist" and len(pl_res.get("tracks", [])) > 0:
                return pl_res
        
        # If playlist failed or was a mix, but a video ID exists, resolve the single video!
        if m_vid:
            vid = m_vid.group(1)
            return resolve_single_youtube_video(vid)

    # 2. Single Video / Music Track
    if m_vid:
        vid = m_vid.group(1)
        return resolve_single_youtube_video(vid)

    if "playlist?list=" in url:
        return extract_generic_ytdlp(url)

    return None

def extract_apple_music(url: str):
    """Handles Apple Music tracks, albums, and playlists via iTunes Lookup & serialized page data."""
    headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}

    # 1. Single Apple Music Track
    m_track = re.search(r'[?&]i=(\d+)', url) or re.search(r'/song/[^/]+/(\d+)', url)
    if m_track:
        tid = m_track.group(1)
        try:
            r = requests.get(f"https://itunes.apple.com/lookup?id={tid}", headers=headers, timeout=6)
            if r.status_code == 200:
                data = r.json()
                if data.get("results") and len(data["results"]) > 0:
                    item = data["results"][0]
                    code = generate_song_code("AM", tid, item.get("artistName", ""), item.get("trackName", ""))
                    dur = (item.get("trackTimeMillis") or 0) / 1000.0
                    art = (item.get("artworkUrl100") or "").replace("100x100bb.jpg", "1000x1000bb.jpg")
                    track = clean_track_entry(
                        raw_title=item.get("trackName", ""),
                        raw_artist=item.get("artistName", ""),
                        code=code,
                        direct_url=item.get("trackViewUrl") or url,
                        duration=dur,
                        album=item.get("collectionName"),
                        cover_url=art,
                        source="apple"
                    )
                    return {"type": "song", "status": "ok", "source": "apple", "title": track["title"], "artist": track["artist"], "total": 1, "tracks": [track]}
        except Exception:
            pass

    # 2. Apple Music Album
    m_album = re.search(r'/album/[^/]+/(\d+)', url)
    if m_album:
        aid = m_album.group(1)
        try:
            r = requests.get(f"https://itunes.apple.com/lookup?id={aid}&entity=song", headers=headers, timeout=8)
            if r.status_code == 200:
                data = r.json()
                raw_items = [x for x in data.get("results", []) if x.get("wrapperType") == "track"]
                if raw_items:
                    album_name = raw_items[0].get("collectionName") or "Apple Music Album"
                    results = []
                    for item in raw_items:
                        item_id = str(item.get("trackId", ""))
                        code = generate_song_code("AM", item_id, item.get("artistName", ""), item.get("trackName", ""))
                        dur = (item.get("trackTimeMillis") or 0) / 1000.0
                        art = (item.get("artworkUrl100") or "").replace("100x100bb.jpg", "1000x1000bb.jpg")
                        results.append(clean_track_entry(
                            raw_title=item.get("trackName", ""),
                            raw_artist=item.get("artistName", ""),
                            code=code,
                            direct_url=item.get("trackViewUrl") or "",
                            duration=dur,
                            album=album_name,
                            cover_url=art,
                            source="apple"
                        ))
                    return {
                        "type": "playlist",
                        "status": "ok",
                        "source": "apple",
                        "playlist_title": album_name,
                        "total": len(results),
                        "tracks": results
                    }
        except Exception:
            pass

    # 3. Apple Music Playlist
    if "/playlist/" in url:
        try:
            r = requests.get(url, headers=headers, timeout=12)
            if r.status_code == 200:
                # Primary: serialized-server-data (full track info with artist names and durations)
                m_ser = re.search(r'<script[^>]*id=[\"\']serialized-server-data[\"\'][^>]*>(.*?)</script>', r.text, re.DOTALL)
                if m_ser:
                    d = json.loads(m_ser.group(1))
                    sections = d.get('data', [{}])[0].get('data', {}).get('sections', [])
                    pl_title = 'Apple Music Playlist'
                    results = []
                    for s in sections:
                        if s.get('itemKind') == 'containerDetailHeaderLockup' and s.get('items'):
                            pl_title = s['items'][0].get('title') or pl_title
                        elif s.get('itemKind') == 'trackLockup':
                            for it in s.get('items', []):
                                title = it.get('title')
                                artist = it.get('artistName') or 'Unknown Artist'
                                tid_raw = str(it.get('id', ''))
                                tid = tid_raw.split(' - ')[-1] if ' - ' in tid_raw else tid_raw
                                dur = float(it.get('duration') or 0.0)
                                if dur > 1000:
                                    dur = dur / 1000.0
                                art = ''
                                if it.get('artwork', {}).get('dictionary', {}).get('url'):
                                    art = it['artwork']['dictionary']['url'].replace('{w}', '1000').replace('{h}', '1000').replace('{f}', 'jpg')
                                elif it.get('artwork', {}).get('url'):
                                    art = it['artwork']['url'].replace('{w}', '1000').replace('{h}', '1000').replace('{f}', 'jpg')
                                code = generate_song_code("AM", tid, artist, title or "")
                                if title:
                                    results.append(clean_track_entry(
                                        raw_title=title,
                                        raw_artist=artist,
                                        code=code,
                                        direct_url=f"https://music.apple.com/us/song/{tid}" if tid else "",
                                        duration=dur,
                                        album=pl_title,
                                        cover_url=art,
                                        source="apple"
                                    ))
                    if results:
                        return {
                            "type": "playlist",
                            "status": "ok",
                            "source": "apple",
                            "playlist_title": pl_title,
                            "total": len(results),
                            "tracks": results
                        }
        except Exception:
            pass

    return None


def extract_jiosaavn(url: str):
    """Handles JioSaavn single song URLs."""
    m = re.search(r'/song/[^/]+/([a-zA-Z0-9_-]+)', url)
    if m:
        token = m.group(1)
        try:
            api_url = f"https://www.jiosaavn.com/api.php?__call=webapi.get&token={token}&type=song&_format=json"
            r = requests.get(api_url, timeout=6)
            if r.status_code == 200:
                data = r.json()
                song = data.get("songs", [{}])[0] if data.get("songs") else data
                if song.get("song"):
                    title = song.get("song", "")
                    artist = song.get("primary_artists", "") or song.get("more_info", {}).get("primary_artists", "")
                    album = song.get("album", "")
                    dur = float(song.get("duration", 0))
                    sid = song.get("id", token)
                    code = generate_song_code("JS", sid, artist, title)
                    track = clean_track_entry(
                        raw_title=title,
                        raw_artist=artist,
                        code=code,
                        direct_url=url,
                        duration=dur,
                        album=album,
                        cover_url=(song.get("image") or "").replace("150x150", "500x500"),
                        source="saavn"
                    )
                    return {"type": "song", "status": "ok", "source": "saavn", "title": track["title"], "artist": track["artist"], "total": 1, "tracks": [track]}
        except Exception:
            pass
    return None

def extract_generic_ytdlp(url: str):
    """Full-featured yt-dlp extractor capturing all playlist items, titles, video IDs, and durations."""
    import shutil
    ytdlp_cmd = ["yt-dlp"] if shutil.which("yt-dlp") else [sys.executable, "-m", "yt_dlp"]
    cmd = [
        *ytdlp_cmd,
        "--flat-playlist",
        "--dump-single-json",
        "--ignore-errors",
        "--no-warnings",
        url
    ]
    kwargs = {"capture_output": True, "text": True, "timeout": 90}
    if os.name == "nt":
        kwargs["creationflags"] = 0x08000000

    try:
        p = subprocess.run(cmd, **kwargs)
        if p.returncode == 0 and p.stdout:
            data = json.loads(p.stdout)
            playlist_title = data.get("title") or "Playlist"
            entries = data.get("entries")

            if entries and len(entries) > 0:
                # 1. Clean album / playlist title
                clean_alb_title = re.sub(r'(?i)\s*[\(\[]\s*(?:full\s*album|deluxe\s*edition|official\s*playlist|playlist|album)\s*[\)\]]', '', playlist_title).strip()
                clean_alb_title = re.sub(r'(?i)\s*-\s*full\s*album\s*$', '', clean_alb_title).strip()

                # 2. Check for common artist across all playlist entries
                artist_candidates = {}
                for e in entries:
                    if not e or not isinstance(e, dict): continue
                    raw_t = e.get("title", "")
                    if " - " in raw_t:
                        parts = [p.strip() for p in raw_t.split(" - ") if p.strip()]
                        if len(parts) >= 2:
                            cand1 = parts[0] if not parts[0].isdigit() else (parts[1] if len(parts) > 2 else "")
                            cand2 = parts[-1]
                            for c in [cand1, cand2]:
                                if c and len(c) > 2 and not c.isdigit() and not re.search(r'(?i)\b(official|video|audio|lyrics?|full)\b', c):
                                    artist_candidates[c] = artist_candidates.get(c, 0) + 1

                common_artist = None
                if artist_candidates:
                    top_cand, top_cnt = max(artist_candidates.items(), key=lambda x: x[1])
                    if top_cnt >= max(2, len(entries) // 3):
                        common_artist = top_cand

                results = []
                for idx, e in enumerate(entries, start=1):
                    if not e or not isinstance(e, dict):
                        continue
                    t = e.get("title")
                    if not t or t in ["[Deleted video]", "[Private video]"]:
                        continue
                    uploader = e.get("artist") or e.get("uploader") or e.get("channel") or ""
                    effective_artist = common_artist if common_artist else uploader
                    vid = e.get("id") or str(idx)
                    code = generate_song_code("YT", vid, effective_artist, t)
                    direct_url = f"https://www.youtube.com/watch?v={vid}" if len(vid) == 11 else (e.get("url") or "")
                    dur = float(e.get("duration") or 0.0)

                    results.append(clean_track_entry(
                        raw_title=t,
                        raw_artist=effective_artist,
                        code=code,
                        direct_url=direct_url,
                        duration=dur,
                        album=clean_alb_title or playlist_title,
                        source="youtube"
                    ))

                if results:
                    return {
                        "type": "playlist",
                        "status": "ok",
                        "source": "youtube",
                        "playlist_title": clean_alb_title or playlist_title,
                        "title": clean_alb_title or playlist_title,
                        "total": len(results),
                        "tracks": results
                    }

            if data.get("title"):
                t = data.get("title")
                uploader = data.get("artist") or data.get("uploader") or data.get("channel") or ""
                vid = data.get("id") or ""
                code = generate_song_code("YT", vid, uploader, t)
                direct_url = f"https://www.youtube.com/watch?v={vid}" if vid else url
                dur = float(data.get("duration") or 0.0)

                track = clean_track_entry(
                    raw_title=t,
                    raw_artist=uploader,
                    code=code,
                    direct_url=direct_url,
                    duration=dur,
                    source="youtube"
                )
                return {
                    "type": "song",
                    "status": "ok",
                    "source": "youtube",
                    "title": track["title"],
                    "artist": track["artist"],
                    "total": 1,
                    "tracks": [track]
                }
    except Exception:
        pass

    return None

def resolve_playlist(url: str):
    """Main entry point: Resolves any single song URL or playlist URL into structured track data with codes."""
    clean_url = (url or "").strip()
    if not clean_url:
        return {"status": "error", "message": "No URL provided", "tracks": []}

    # 1. Spotify
    if "spotify.com" in clean_url or clean_url.startswith("spotify:"):
        res = extract_spotify(clean_url)
        if res:
            return res

    # 2. YouTube & YouTube Music
    if any(k in clean_url for k in ["youtube.com", "youtu.be", "music.youtube.com"]):
        res = extract_youtube(clean_url)
        if res:
            return res

    # 3. Apple Music
    if "music.apple.com" in clean_url:
        res = extract_apple_music(clean_url)
        if res:
            return res

    # 4. JioSaavn
    if "jiosaavn.com" in clean_url:
        res = extract_jiosaavn(clean_url)
        if res:
            return res

    # 5. Generic yt-dlp fallback
    res = extract_generic_ytdlp(clean_url)
    if res:
        return res

    # 6. Basic HTML OpenGraph fallback (real tracks only)
    try:
        r = requests.get(clean_url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}, timeout=6)
        if r.status_code == 200:
            m_title = re.search(r'<meta property="og:title" content="([^"]+)"', r.text)
            m_raw = m_title.group(1) if m_title else ""
            if not m_raw:
                t_match = re.search(r'<title>([^<]+)</title>', r.text)
                m_raw = t_match.group(1) if t_match else ""
            cleaned_raw = m_raw.strip()
            if cleaned_raw and cleaned_raw not in ["- YouTube", "YouTube", "undefined"] and "error" not in cleaned_raw.lower():
                track = clean_track_entry(raw_title=cleaned_raw, raw_artist="Unknown Artist", direct_url=clean_url)
                if track["title"] not in ["- YouTube", "YouTube", "undefined", ""]:
                    return {
                        "type": "song",
                        "status": "ok",
                        "source": "generic",
                        "title": track["title"],
                        "artist": track["artist"],
                        "total": 1,
                        "tracks": [track]
                    }
    except Exception:
        pass


    return {
        "status": "error",
        "message": "Could not extract tracks from provided URL. Please verify the link or enter track name manually.",
        "tracks": []
    }

if __name__ == "__main__":
    if len(sys.argv) > 1:
        out = resolve_playlist(sys.argv[1])
        print(json.dumps(out, indent=2))
    else:
        print(json.dumps({"status": "error", "message": "No URL provided"}))
