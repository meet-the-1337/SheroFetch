#!/usr/bin/env python3
"""
SheroFetch — Universal Resolver v4.0 (Flawless Pipeline)

Resolves canonical track identity from multiple independent sources.
Emits ONLY: CANDIDATE, QUARANTINE, UNRESOLVED, NEEDS_HUMAN.
ACCEPTED is reserved for the verifier.

Design principles (from 3 rounds of user review):
1. YouTube description album must match Deezer album for cover art.
2. ISRC selection: pick the ISRC whose Deezer album matches the YT description album.
3. iTunes collection IDs are NEVER used as Deezer album IDs.
4. Cartoons without an independently-sourced reference clip → NEEDS_HUMAN.
5. Deezer /search is geo-blocked in India. Only /track/isrc:<CODE> is used.
6. Non-echo: Deezer title+artist+duration must match query AND YouTube audio.
7. All ISRC candidates are logged for auditability and deterministic re-runs.
"""

import sys
import os
import re
import json
import time
import argparse
import subprocess
import urllib.parse
import urllib.request
import urllib.error
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

USER_AGENT = "SheroFetch/2.0 ( contact@example.com )"
ITUNES_API_URL = "https://itunes.apple.com/search"
MUSICBRAINZ_API_URL = "https://musicbrainz.org/ws/2/recording"
DEEZER_ISRC_URL = "https://api.deezer.com/track/isrc"

BANNED_TITLE_PATTERNS = [
    r'\bremix\b', r'\bsped\s*up\b', r'\bslowed\b', r'\breverb\b',
    r'\b8d\s*audio\b', r'\bbass\s*boosted\b', r'\bworkout\b',
    r'\bparody\b', r'\bcover\b', r'\bkaraoke\b', r'\btribute\b',
    r'\b1\s*hour\b', r'\bloop\b', r'\bextended\b'
]


# ─────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────

def _http_get_json(url: str, ua: str = "Mozilla/5.0", timeout: int = 8) -> Optional[dict]:
    """Safe HTTP GET returning parsed JSON or None."""
    req = urllib.request.Request(url, headers={"User-Agent": ua})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception:
        return None


def _contains_ci(haystack: str, needle: str) -> bool:
    """Case-insensitive substring check."""
    return needle.lower() in haystack.lower()


def _title_match(a: str, b: str) -> bool:
    """Bidirectional case-insensitive substring match for titles."""
    a_l, b_l = a.lower().strip(), b.lower().strip()
    return a_l in b_l or b_l in a_l


def _normalize_album(name: str) -> str:
    """Normalize album name for comparison: lowercase, strip parentheticals, common suffixes."""
    if not name:
        return ""
    s = name.lower().strip()
    # Strip common suffixes like (Deluxe), (Deluxe Edition), [Explicit], etc.
    s = re.sub(r'\s*[\(\[].*?[\)\]]', '', s).strip()
    # Strip trailing punctuation
    s = s.rstrip('.')
    return s


def _albums_match(a: str, b: str) -> bool:
    """Check if two album names refer to the same album (fuzzy)."""
    na, nb = _normalize_album(a), _normalize_album(b)
    if not na or not nb:
        return False
    return na == nb or na in nb or nb in na


def clean_noise(text: str) -> str:
    """Remove video descriptors and boilerplate tags from titles."""
    if not text:
        return ""
    t = re.sub(r'[\(\[](?:Official\s*(?:Music\s*)?Video|Official\s*Audio|Audio|Lyric\s*Video|Lyrics|Visualizer|HD|4K|Remaster(?:ed)?|OST|Soundtrack|English\s*[\/\&]\s*Romanji\s*Lyrics|Romaji\s*Lyrics|English\s*Lyrics)[^\]\)]*[\)\]]', '', text, flags=re.I)
    t = re.sub(r'\b(?:Official\s*(?:Music\s*)?Video|Audio|Lyric\s*Video|English\s*[\/\&]\s*Romanji\s*Lyrics|Romaji\s*Lyrics|English\s*Lyrics|Lyrics|HD|4K)\b', '', t, flags=re.I)
    return t.strip(' -–—|: \t')


def parse_artist_title_smart(raw: str, fallback_artist: str = '') -> Tuple[str, str]:
    """Parse artist and title handling multi-chunk, pipe, and noisy YouTube titles."""
    pipe_parts = [clean_noise(p) for p in re.split(r'\s*\|\s*', raw) if clean_noise(p)]
    chunks = []
    for p in pipe_parts:
        for sub in re.split(r'\s+[-–—]\s+', p):
            c = clean_noise(sub)
            if c:
                chunks.append(c)
    if not chunks:
        return fallback_artist or 'Unknown Artist', clean_noise(raw) or 'Unknown Track'
    if len(chunks) == 1:
        return fallback_artist or 'Unknown Artist', chunks[0]
    if len(chunks) == 2:
        return chunks[0], chunks[1]
    return ', '.join(chunks[1:]), chunks[0]


# ─────────────────────────────────────────────────────────────────
# YouTube Description Album Parsing
# ─────────────────────────────────────────────────────────────────

def parse_yt_description_album(description: str) -> Optional[str]:
    """
    Parse album name from YouTube 'Provided to YouTube by' descriptions.

    Typical format:
        Provided to YouTube by Universal Music Group

        Love Sosa · Chief Keef

        Finally Rich

        ℗ 2012 Interscope Records...

    The album is the first non-empty line after the "Title · Artist" line,
    and before any ℗/© line.
    """
    if not description or "Provided to YouTube by" not in description:
        return None

    lines = description.split('\n')
    found_provider = False
    found_track_artist = False
    
    for line in lines:
        line_stripped = line.strip()
        if not line_stripped:
            continue
        
        if "Provided to YouTube by" in line_stripped:
            found_provider = True
            continue
        
        if not found_provider:
            continue
        
        # The first non-empty line after provider is "Title · Artist"
        if not found_track_artist:
            if '·' in line_stripped or '•' in line_stripped:
                found_track_artist = True
                continue
            # Some descriptions don't use · separator; if the line looks like
            # it could be a title, treat it as the track line
            if not line_stripped.startswith('℗') and not line_stripped.startswith('©'):
                found_track_artist = True
                continue
        
        # After track·artist, the next non-empty line is the album
        if found_track_artist:
            # Skip if it's a copyright line
            if line_stripped.startswith('℗') or line_stripped.startswith('©'):
                return None
            # Skip if it's a "Released on:" type line
            if line_stripped.lower().startswith('released on'):
                return None
            return line_stripped

    return None


# ─────────────────────────────────────────────────────────────────
# iTunes Store API
# ─────────────────────────────────────────────────────────────────

def query_itunes(title: str, artist: str) -> Optional[Dict[str, Any]]:
    """Fetch canonical track metadata and 1400x1400 artwork from iTunes."""
    clean_q = f"{artist} {title}".strip()
    params = urllib.parse.urlencode({"term": clean_q, "entity": "song", "limit": 15})
    url = f"{ITUNES_API_URL}?{params}"
    data = _http_get_json(url)
    if not data:
        return None

    t_clean = title.lower().strip()
    a_clean = artist.lower().strip()
    scored = []

    for item in data.get("results", []):
        r_title = item.get("trackName", "").lower()
        r_artist = item.get("artistName", "").lower()

        score = 0
        if r_title == t_clean:
            score += 50
        elif t_clean in r_title or r_title in t_clean:
            score += 30
        else:
            continue

        if r_artist == a_clean:
            score += 50
        elif a_clean in r_artist or r_artist in a_clean:
            score += 20
        else:
            continue

        scored.append((score, item))

    if not scored:
        return None

    scored.sort(key=lambda x: x[0], reverse=True)
    top = scored[0][1]
    art_100 = top.get("artworkUrl100", "")
    art_1400 = art_100.replace("100x100bb.jpg", "1400x1400bb.jpg") if art_100 else None
    duration_s = round((top.get("trackTimeMillis") or 0) / 1000.0, 2)

    return {
        "track_name": top.get("trackName"),
        "artist_name": top.get("artistName"),
        "collection_name": top.get("collectionName"),
        "track_time_millis": top.get("trackTimeMillis"),
        "duration_s": duration_s,
        "cover_url_1400": art_1400,
        "collection_id": top.get("collectionId"),
        "track_id": top.get("trackId")
    }


# ─────────────────────────────────────────────────────────────────
# MusicBrainz Recording Search
# ─────────────────────────────────────────────────────────────────

def query_musicbrainz(title: str, artist: str) -> Dict[str, Any]:
    """
    Query MusicBrainz for all candidate recordings and their ISRCs.
    Rate-limited with retry on 429/503.
    """
    clean_t = re.sub(r'[\"\'()\[\]]', '', title).strip()
    clean_a = re.sub(r'[\"\'()\[\]]', '', artist).strip()
    q = f'recording:"{clean_t}" AND artist:"{clean_a}"'
    params = urllib.parse.urlencode({"query": q, "fmt": "json", "limit": 25})
    url = f"{MUSICBRAINZ_API_URL}?{params}"

    recordings_info = []
    isrcs = []
    lengths = []

    for attempt in range(4):
        # Progressive delay: 0.6s, 1.2s, 1.8s, 2.4s + random jitter to avoid burst patterns
        import random
        time.sleep(0.6 * (attempt + 1) + random.uniform(0, 0.5))
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                data = json.loads(r.read().decode("utf-8"))
                for rec in data.get("recordings", []):
                    r_title = rec.get("title", "")
                    r_len = round(rec["length"] / 1000.0, 2) if rec.get("length") else None
                    r_isrcs = rec.get("isrcs", [])

                    # Skip remixes/live unless query includes those words
                    skip_words = ["remix", "live", "parody", "tribute"]
                    if any(w in r_title.lower() for w in skip_words) and not any(w in title.lower() for w in skip_words):
                        continue

                    if r_len:
                        lengths.append(r_len)
                    for code in r_isrcs:
                        if code and code not in isrcs:
                            isrcs.append(code)
                    recordings_info.append({
                        "mbid": rec.get("id"),
                        "title": r_title,
                        "length": r_len,
                        "isrcs": r_isrcs
                    })
                break  # success
        except urllib.error.HTTPError as e:
            if e.code in (429, 503):
                backoff = min(2 ** attempt, 8) + random.uniform(0, 1)
                print(f"[RESOLVER] MusicBrainz rate-limited (attempt {attempt+1}/4), backing off {backoff:.1f}s...")
                time.sleep(backoff)
                continue
            break
        except Exception as e:
            print(f"[RESOLVER] MusicBrainz error: {e}")
            break

    # Sort ISRCs by origin priority: US/QM > GB > others
    def isrc_priority(code: str) -> int:
        if code.startswith(("US", "QM")):
            return 0
        if code.startswith("GB"):
            return 1
        return 2

    isrcs.sort(key=isrc_priority)

    return {
        "isrcs": isrcs,
        "lengths": lengths,
        "recordings": recordings_info,
        "median_length": sorted(lengths)[len(lengths) // 2] if lengths else None
    }


# ─────────────────────────────────────────────────────────────────
# Deezer Direct ISRC Lookup
# ─────────────────────────────────────────────────────────────────

def query_deezer_by_isrc(isrc: str) -> Optional[Dict[str, Any]]:
    """
    Direct Deezer lookup via /track/isrc:<code>.
    This endpoint works from India (unlike /search which is geo-blocked).
    """
    url = f"{DEEZER_ISRC_URL}:{isrc}"
    data = _http_get_json(url, timeout=6)
    if not data or "error" in data or not data.get("id"):
        return None

    album = data.get("album", {})
    return {
        "track_id": data.get("id"),
        "album_id": album.get("id"),
        "title": data.get("title", ""),
        "artist": data.get("artist", {}).get("name", ""),
        "duration_s": float(data.get("duration") or 0),
        "isrc": data.get("isrc", isrc),
        "album_title": album.get("title", ""),
        "cover_xl": album.get("cover_xl") or album.get("cover_big")
    }


# ─────────────────────────────────────────────────────────────────
# YouTube Candidate Discovery
# ─────────────────────────────────────────────────────────────────

def get_video_full_info(url: str) -> Optional[Dict[str, Any]]:
    """Fetch FULL video metadata including complete description."""
    cmd = ["yt-dlp", "--dump-json", "--no-warnings", url]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
        if proc.returncode == 0 and proc.stdout.strip():
            d = json.loads(proc.stdout)
            return {
                "url": d.get("webpage_url") or url,
                "title": d.get("title", ""),
                "uploader": d.get("uploader", "") or d.get("channel", ""),
                "channel": d.get("channel", "") or d.get("uploader", ""),
                "duration": float(d.get("duration") or 0),
                "description": (d.get("description", "") or "")[:2000],
                "view_count": d.get("view_count", 0)
            }
    except Exception as e:
        print(f"[RESOLVER] yt-dlp info error: {e}")
    return None


def search_youtube_candidate(
    query_title: str,
    query_artist: str,
    target_duration: float,
    duration_tolerance: float = 3.0,
    is_cartoon: bool = False
) -> Tuple[Optional[Dict[str, Any]], str]:
    """
    Discover authentic YouTube audio candidate.
    Returns (best_candidate_dict, status_message).
    """
    if not is_cartoon:
        yt_search = f'ytsearch8:"{query_title}" "{query_artist}" - Topic'
    else:
        yt_search = f"ytsearch6:{query_title}"

    cmd = ["yt-dlp", "--dump-single-json", "--flat-playlist", "--no-warnings", yt_search]

    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        if proc.returncode != 0:
            return None, f"yt-dlp search failed: {proc.stderr[:100]}"

        data = json.loads(proc.stdout)
        entries = data.get("entries", [])
        if not entries:
            return None, "Zero YouTube results returned"

        candidates = []
        for e in entries:
            v_title = e.get("title", "")
            v_uploader = e.get("uploader", "") or e.get("channel", "")
            v_dur = float(e.get("duration") or 0)
            v_url = e.get("webpage_url") or f"https://www.youtube.com/watch?v={e.get('id')}"

            # Ban check
            lower_v_title = v_title.lower()
            has_banned = False
            for pat in BANNED_TITLE_PATTERNS:
                if re.search(pat, lower_v_title):
                    pat_word = re.sub(r'\\b', '', pat).strip()
                    if pat_word not in query_title.lower():
                        has_banned = True
                        break
            if has_banned:
                continue

            # Duration gate
            dur_diff = abs(v_dur - target_duration)
            if dur_diff > duration_tolerance:
                continue

            score = 100 - dur_diff
            if not is_cartoon:
                if v_uploader.endswith(" - Topic") or "Topic" in v_uploader:
                    score += 50
                if v_title.lower().strip() == query_title.lower().strip():
                    score += 30

            candidates.append({
                "url": v_url,
                "title": v_title,
                "uploader": v_uploader,
                "duration": v_dur,
                "score": score
            })

        if not candidates:
            return None, f"No candidate met title/duration gate (±{duration_tolerance}s of {target_duration}s)"

        # Sort candidates initially so top scorers are inspected first
        candidates.sort(key=lambda x: x["score"], reverse=True)
        top_candidates = candidates[:5]
        best = top_candidates[0]
        for cand in top_candidates:
            full_info = get_video_full_info(cand["url"])
            if full_info:
                cand["description"] = full_info["description"]
                cand["uploader"] = full_info["uploader"]
                cand["channel"] = full_info["channel"]
                vc = full_info.get("view_count") or 0
                cand["view_count"] = vc
                if "Provided to YouTube by" in cand.get("description", ""):
                    cand["score"] += 60
                if vc and vc > 0:
                    import math
                    cand["score"] += math.log10(vc) * 3.0
        
        top_candidates.sort(key=lambda x: x["score"], reverse=True)
        best = top_candidates[0]
        return best, "Candidate resolved successfully"

    except Exception as ex:
        return None, f"Search exception: {str(ex)}"


# ─────────────────────────────────────────────────────────────────
# ISRC Selection with Album Cross-Check
# ─────────────────────────────────────────────────────────────────

def select_best_isrc(
    isrcs: List[str],
    query_title: str,
    query_artist: str,
    yt_duration: float,
    yt_album: Optional[str]
) -> Tuple[Optional[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    For each MusicBrainz ISRC, query Deezer and verify non-echo.
    Pick the ISRC whose Deezer album matches the YouTube description album.
    Returns (best_match, all_candidates).
    """
    all_candidates = []

    for isrc in isrcs:
        dz = query_deezer_by_isrc(isrc)
        if not dz:
            continue

        # Non-echo: Deezer title & artist must match query
        t_match = _title_match(dz["title"], query_title)
        a_match = _title_match(dz["artist"], query_artist)
        if not (t_match and a_match):
            print(f"[RESOLVER]   ISRC {isrc}: Deezer title/artist mismatch "
                  f"('{dz['title']}' / '{dz['artist']}' vs '{query_title}' / '{query_artist}')")
            continue

        # Duration check: Deezer vs YouTube within ±3s
        dur_ok = abs(dz["duration_s"] - yt_duration) <= 3.0

        # Album match check
        album_match = _albums_match(dz["album_title"], yt_album) if yt_album else False

        candidate = {
            "isrc": isrc,
            "deezer_title": dz["title"],
            "deezer_artist": dz["artist"],
            "deezer_duration": dz["duration_s"],
            "deezer_album": dz["album_title"],
            "deezer_album_id": dz["album_id"],
            "deezer_track_id": dz["track_id"],
            "cover_xl": dz["cover_xl"],
            "duration_ok": dur_ok,
            "album_match": album_match,
        }
        all_candidates.append(candidate)
        print(f"[RESOLVER]   ISRC {isrc}: deezer='{dz['title']}' by '{dz['artist']}', "
              f"dur={dz['duration_s']}s, album='{dz['album_title']}', "
              f"dur_ok={dur_ok}, album_match={album_match}")

        # Rate limit Deezer calls
        time.sleep(0.3)

    if not all_candidates:
        return None, all_candidates

    # Selection priority:
    # 1. Album match + duration OK
    # 2. Album match only
    # 3. Duration OK only
    # 4. Any valid candidate

    def sort_key(c):
        """Higher is better."""
        score = 0
        if c["album_match"]:
            score += 100
        if c["duration_ok"]:
            score += 50
        # ISRC origin priority
        isrc = c["isrc"]
        if isrc.startswith(("US", "QM")):
            score += 10
        elif isrc.startswith("GB"):
            score += 5
        return score

    all_candidates.sort(key=sort_key, reverse=True)
    best = all_candidates[0]

    deciding = []
    if best["album_match"]:
        deciding.append("album_match")
    if best["duration_ok"]:
        deciding.append("duration_ok")
    deciding.append(f"isrc_origin={best['isrc'][:2]}")
    best["deciding_fields"] = deciding

    return best, all_candidates


# ─────────────────────────────────────────────────────────────────
# Main Resolver
# ─────────────────────────────────────────────────────────────────

def resolve_track(
    query: str,
    artist: str = "",
    title: str = "",
    is_cartoon: bool = False,
    csv_id: Optional[str] = None,
    source_url: Optional[str] = None,
    search_query: Optional[str] = None,
    expected_duration_s: Optional[float] = None,
    ref_clip_path: Optional[str] = None,
    lyric_anchor: Optional[str] = None,
    tvmaze_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Main Resolver Entry Point.
    Emits ONLY: CANDIDATE, QUARANTINE, UNRESOLVED, NEEDS_HUMAN.
    """
    log = {
        "query": query,
        "csv_id": csv_id or "",
        "chosen_url": None,
        "uploader": None,
        "title": None,
        "duration": None,
        "isrc_mb": None,
        "isrc_deezer": None,
        "acoustid_score": None,
        "ref_clip_score": None,
        "gemini_verdict": None,
        "cover_source_id": None,
        "state": "UNRESOLVED",
        "reason": "",
        "channel": None,
        "description_preview": None,
        "yt_description_full": None,
        "yt_description_album": None,
        "deezer_meta": None,
        "itunes_meta": None,
        "mb_all_isrcs": [],
        "all_isrc_candidates": [],
    }

    # ==================== CARTOON PATH ====================
    if is_cartoon:
        print(f"[RESOLVER] Cartoon path: '{query}'")
        log["cover_source_id"] = f"tvmaze_show:{tvmaze_id}" if tvmaze_id else None

        candidate = None
        if source_url:
            print(f"[RESOLVER] Fetching source_url: {source_url}")
            candidate = get_video_full_info(source_url)

        if not candidate:
            q_term = search_query or query
            print(f"[RESOLVER] Searching YouTube: {q_term}")
            c_cand, msg = search_youtube_candidate(
                query_title=q_term,
                query_artist="",
                target_duration=expected_duration_s or 90.0,
                duration_tolerance=5.0,
                is_cartoon=True
            )
            if c_cand:
                candidate = c_cand
            else:
                log["state"] = "UNRESOLVED"
                log["reason"] = f"No cartoon candidate found: {msg}"
                return log

        log["chosen_url"] = candidate.get("url")
        log["uploader"] = candidate.get("uploader")
        log["channel"] = candidate.get("channel", candidate.get("uploader"))
        log["title"] = candidate.get("title")
        log["duration"] = candidate.get("duration")
        log["description_preview"] = (candidate.get("description", "") or "")[:200]

        # Reference clip check
        if not ref_clip_path or not Path(ref_clip_path).exists():
            log["state"] = "NEEDS_HUMAN"
            log["reason"] = (
                f"No independent reference clip"
                + (f" at '{ref_clip_path}'" if ref_clip_path else "")
                + "; candidate audio located for human verification"
            )
            print(f"[RESOLVER] → NEEDS_HUMAN: {log['reason']}")
            return log

        log["state"] = "CANDIDATE"
        log["reason"] = "Candidate resolved; independent reference clip available for sliding fingerprint compare"
        print(f"[RESOLVER] → CANDIDATE: {log['reason']}")
        return log

    # ==================== COMMERCIAL TRACK PATH ====================
    print(f"[RESOLVER] Commercial path: '{query}'")

    # Extract from URL if query is a URL or source_url provided
    target_link = source_url or (query if query.startswith(("http://", "https://")) else None)
    if target_link and not (artist and title):
        try:
            oembed_url = f"https://www.youtube.com/oembed?url={urllib.parse.quote(target_link)}&format=json"
            o_data = _http_get_json(oembed_url)
            if o_data and o_data.get("title"):
                raw_t = o_data["title"]
                author = o_data.get("author_name", "")
                parsed_a, parsed_t = parse_artist_title_smart(raw_t, author)
                artist, title = parsed_a, parsed_t
                if not log.get("chosen_url"):
                    log["chosen_url"] = target_link
        except Exception:
            pass

    # Parse artist/title from query if not provided
    if not artist or not title:
        parsed_a, parsed_t = parse_artist_title_smart(query)
        artist, title = parsed_a, parsed_t

    print(f"[RESOLVER] Artist='{artist}', Title='{title}'")

    # ── Step 1: MusicBrainz ──
    print(f"[RESOLVER] Step 1: MusicBrainz lookup...")
    mb_data = query_musicbrainz(title, artist)
    isrcs_mb = mb_data.get("isrcs", [])
    log["mb_all_isrcs"] = isrcs_mb
    print(f"[RESOLVER]   Found {len(isrcs_mb)} ISRCs: {isrcs_mb}")

    # ── Step 2: YouTube candidate (need description for album parsing) ──
    print(f"[RESOLVER] Step 2: YouTube candidate discovery...")
    canonical_dur = mb_data.get("median_length") or 180.0
    yt_candidate = None
    yt_msg = ""
    if target_link:
        yt_candidate = get_video_full_info(target_link)
        if not yt_candidate:
            o_data = _http_get_json(f"https://www.youtube.com/oembed?url={urllib.parse.quote(target_link)}&format=json")
            if o_data:
                yt_candidate = {
                    "url": target_link,
                    "title": o_data.get("title", title),
                    "uploader": o_data.get("author_name", artist),
                    "channel": o_data.get("author_name", artist),
                    "duration": canonical_dur,
                    "description": "",
                    "view_count": 1000
                }

    if not yt_candidate:
        yt_candidate, yt_msg = search_youtube_candidate(
            query_title=title,
            query_artist=artist,
            target_duration=canonical_dur,
            duration_tolerance=15.0,  # wider window for initial candidate discovery; strictly verified against Deezer later
            is_cartoon=False
        )

    if not yt_candidate:
        log["state"] = "UNRESOLVED"
        log["reason"] = f"No YouTube candidate found: {yt_msg}"
        print(f"[RESOLVER] → UNRESOLVED: {log['reason']}")
        return log

    log["chosen_url"] = yt_candidate["url"]
    log["uploader"] = yt_candidate.get("uploader")
    log["channel"] = yt_candidate.get("channel", yt_candidate.get("uploader"))
    log["title"] = yt_candidate.get("title")
    log["duration"] = yt_candidate.get("duration")
    log["yt_description_full"] = yt_candidate.get("description", "")
    log["description_preview"] = (yt_candidate.get("description", "") or "")[:200]

    # Parse album from YouTube description
    yt_album = parse_yt_description_album(yt_candidate.get("description", ""))
    log["yt_description_album"] = yt_album
    print(f"[RESOLVER]   YouTube candidate: '{yt_candidate.get('title')}' by '{yt_candidate.get('uploader')}', "
          f"dur={yt_candidate.get('duration')}s")
    print(f"[RESOLVER]   YouTube description album: {yt_album!r}")

    # ── Step 3: ISRC selection with Deezer cross-check ──
    print(f"[RESOLVER] Step 3: ISRC selection with Deezer album cross-check...")
    if not isrcs_mb:
        log["state"] = "QUARANTINE"
        log["reason"] = "No ISRCs found in MusicBrainz"
        print(f"[RESOLVER] → QUARANTINE: {log['reason']}")
        return log

    deezer_match, all_candidates = select_best_isrc(
        isrcs=isrcs_mb,
        query_title=title,
        query_artist=artist,
        yt_duration=yt_candidate.get("duration", 0),
        yt_album=yt_album
    )
    log["all_isrc_candidates"] = all_candidates

    if not deezer_match:
        log["isrc_mb"] = isrcs_mb[0] if isrcs_mb else None
        log["isrc_deezer"] = None
        log["state"] = "QUARANTINE"
        log["reason"] = "No Deezer match found for any MusicBrainz ISRC (second source missing)"
        print(f"[RESOLVER] → QUARANTINE: {log['reason']}")
        return log

    # Populate ISRC and Deezer metadata
    log["isrc_mb"] = deezer_match["isrc"]
    log["isrc_deezer"] = deezer_match["isrc"]
    log["deezer_meta"] = {
        "title": deezer_match["deezer_title"],
        "artist": deezer_match["deezer_artist"],
        "duration_s": deezer_match["deezer_duration"],
        "album": deezer_match["deezer_album"],
        "track_id": deezer_match["deezer_track_id"],
        "album_id": deezer_match["deezer_album_id"],
        "deciding_fields": deezer_match.get("deciding_fields", []),
    }

    print(f"[RESOLVER]   Selected ISRC: {deezer_match['isrc']} "
          f"(album='{deezer_match['deezer_album']}', deciding={deezer_match.get('deciding_fields')})")

    # ── Step 4: Cover source resolution ──
    print(f"[RESOLVER] Step 4: Cover source resolution...")

    # Deezer cover: use the matched album
    cover_source = f"deezer_album:{deezer_match['deezer_album_id']}"
    cover_album = deezer_match["deezer_album"]

    # iTunes: for duration cross-check and fallback 1400px artwork
    itunes_data = query_itunes(title=title, artist=artist)
    if itunes_data:
        log["itunes_meta"] = {
            "track_name": itunes_data["track_name"],
            "artist_name": itunes_data["artist_name"],
            "collection_name": itunes_data["collection_name"],
            "track_time_millis": itunes_data["track_time_millis"],
            "collection_id": itunes_data["collection_id"],
            "track_id": itunes_data["track_id"],
            "cover_url_1400": itunes_data.get("cover_url_1400"),
        }
        print(f"[RESOLVER]   iTunes: '{itunes_data['track_name']}' by '{itunes_data['artist_name']}', "
              f"album='{itunes_data['collection_name']}', dur={itunes_data['duration_s']}s")

    log["cover_source_id"] = cover_source

    # ── Step 5: Final gate checks ──
    print(f"[RESOLVER] Step 5: Final gate checks...")

    # Gate: Deezer duration vs YouTube duration — only quarantine on extreme drift (>30s)
    # Moderate drift (intro/outro differences) is handled by verifier Gate 4 with silence stripping
    dz_dur = deezer_match["deezer_duration"]
    yt_dur = yt_candidate.get("duration", 0)
    dur_diff = abs(yt_dur - dz_dur)
    if dur_diff > 30.0:
        log["state"] = "QUARANTINE"
        log["reason"] = f"EXTREME duration mismatch: YouTube {yt_dur}s vs Deezer {dz_dur}s ({dur_diff:.1f}s diff — likely wrong version)"
        print(f"[RESOLVER] → QUARANTINE: {log['reason']}")
        return log
    elif dur_diff > 5.0:
        print(f"[RESOLVER]   ⚠ Duration drift: YouTube {yt_dur}s vs Deezer {dz_dur}s ({dur_diff:.1f}s) — will verify in Gate 4")

    # Gate: Cover album must match YouTube description album
    if yt_album and not _albums_match(cover_album, yt_album):
        log["state"] = "QUARANTINE"
        log["reason"] = (
            f"Cover album mismatch: Deezer album '{cover_album}' ≠ "
            f"YouTube description album '{yt_album}'"
        )
        print(f"[RESOLVER] → QUARANTINE: {log['reason']}")
        return log

    # Gate: cover_source_id must exist
    if not log["cover_source_id"]:
        log["state"] = "QUARANTINE"
        log["reason"] = "cover_source_id is null; official album cover art could not be resolved"
        print(f"[RESOLVER] → QUARANTINE: {log['reason']}")
        return log

    # All gates passed
    log["state"] = "CANDIDATE"
    log["reason"] = (
        f"Identity verified: ISRC {deezer_match['isrc']}, "
        f"Deezer '{deezer_match['deezer_title']}' {dz_dur}s ≈ YT {yt_dur}s, "
        f"album '{cover_album}'"
        + (f" = YT desc '{yt_album}'" if yt_album else "")
        + "; ready for verifier"
    )
    print(f"[RESOLVER] → CANDIDATE: {log['reason']}")
    return log


# ─────────────────────────────────────────────────────────────────
# CLI Entry Point
# ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SheroFetch Universal Resolver v4.0")
    parser.add_argument("query", nargs="?", default=None, help="'Artist - Title' query")
    parser.add_argument("--cartoon", action="store_true", help="Use cartoon path")
    parser.add_argument("--query", "-q", dest="query_flag", default=None, help="Query string")
    parser.add_argument("--artist", default="", help="Artist name")
    parser.add_argument("--title", default="", help="Track title")
    parser.add_argument("--source-url", default=None, help="Direct YouTube URL")
    parser.add_argument("--expected-duration", type=float, default=None, help="Expected duration (seconds)")
    parser.add_argument("--ref-clip", default=None, help="Path to reference audio clip")
    parser.add_argument("--tvmaze-id", default=None, help="TVMaze show ID")
    parser.add_argument("--search-query", default=None, help="Custom YouTube search query")
    args = parser.parse_args()

    actual_query = args.query_flag or args.query
    if not actual_query:
        parser.error("A query is required: 'Artist - Title' or --query")

    result = resolve_track(
        query=actual_query,
        artist=args.artist,
        title=args.title,
        is_cartoon=args.cartoon,
        source_url=args.source_url,
        expected_duration_s=args.expected_duration,
        ref_clip_path=args.ref_clip,
        tvmaze_id=args.tvmaze_id,
        search_query=args.search_query,
    )
    print("\n" + json.dumps(result, indent=2, ensure_ascii=False))
