#!/usr/bin/env python3
"""Runs one fetch in its own process, so the worker can read its progress line by line and stop it.

Before the pipeline runs, it picks the exact YouTube upload itself: official "Topic" or VEVO
channels first, titles and artists that match, a length within seconds of the real song, and no
covers, remixes or sped-up edits. After the pipeline runs it measures the file; a wrong length is
retried once on YouTube, then reported as a failure instead of being kept as the wrong song.

Soulseek is always asked first (inside the pipeline). When no trustworthy YouTube upload exists the
job still runs, so a P2P rip can be found; only the YouTube tiers then have nothing exact to use.

Prints the pipeline's own log lines, then one final line: @@RESULT <json>.
"""
import argparse
import json
import math
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

DERIVATIVE = re.compile(
    r"\b(cover|karaoke|instrumental|remix|re-?mix|sped ?up|slowed|reverb|nightcore|8d|lo-?fi|live|acoustic|"
    r"piano|guitar|tutorial|lesson|reaction|mashup|medley|1 hour|10 hours|extended|bass ?boosted|chipmunk|"
    r"teaser|trailer|shorts?|status|ringtone|parody|dance ?mix|unplugged|rehearsal|fan ?made|tik ?tok|experience|version|edit|loop)\b", re.I)
YT_VIDEO = re.compile(r"(youtube\.com/watch\?v=|youtu\.be/)")
FEAT = re.compile(r"\s*[\(\[]?\b(feat\.?|ft\.?|featuring|with)\b.*$", re.I)


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9 ]+", " ", s.lower()).strip()


def tokens(s: str) -> set:
    return {t for t in norm(s).split() if t not in {"the", "a", "an", "of", "and", "official", "video", "audio", "song", "music", "lyrics", "lyric", "hd", "4k", "full"}}


def score(entry: dict, artist: str, title: str, duration: float) -> float:
    vt = entry.get("title") or ""
    ch = entry.get("channel") or entry.get("uploader") or ""
    want = tokens(FEAT.sub("", title)) or tokens(title)
    have = tokens(vt) | tokens(ch)
    s = 0.0
    if not want or not want <= tokens(vt):
        missing = len(want - tokens(vt)) / max(1, len(want))
        s -= 8 * missing
    first_artist = re.split(r",|&| x | and |feat", artist, flags=re.I)[0]
    if tokens(first_artist) and tokens(first_artist) <= have:
        s += 3
    nch = norm(ch)
    if nch.endswith(" topic") and tokens(first_artist) <= tokens(ch):
        s += 5
    if "vevo" in nch or "official" in vt.lower():
        s += 1.5
    extra = DERIVATIVE.findall(vt)
    if extra and not DERIVATIVE.search(title):
        s -= 7
    if FEAT.search(vt) and not FEAT.search(title) and not re.search(r"\b(feat|ft)\b", artist, re.I):
        s -= 4
    d = entry.get("duration")
    if duration and d:
        gap = abs(float(d) - duration)
        s += 5 if gap <= 3 else 3 if gap <= 8 else 1 if gap <= 25 else -4 if gap <= 60 else -12
    views = entry.get("view_count") or 0
    s += min(2.5, math.log10(views + 1) / 3)
    return s


def pick_upload(artist: str, title: str, duration: float):
    """Best YouTube upload for this exact song (or None when nothing is close enough), and the top
    uploads found, so a person can pick one themselves if the fetch fails."""
    import yt_dlp

    queries = [f"{artist} {FEAT.sub('', title)} topic", f"{artist} {title} official audio", f"{artist} {title}"]
    seen, ranked = set(), []
    opts = {"quiet": True, "no_warnings": True, "extract_flat": "in_playlist", "skip_download": True}
    with yt_dlp.YoutubeDL(opts) as ydl:
        for q in queries:
            try:
                info = ydl.extract_info(f"ytsearch8:{q}", download=False)
            except Exception as e:  # noqa: BLE001
                print(f"[PICK] search failed for '{q}': {e}", flush=True)
                continue
            for e in info.get("entries") or []:
                vid = e.get("id")
                if not vid or vid in seen:
                    continue
                seen.add(vid)
                ranked.append((score(e, artist, title, duration), e))
            if ranked and max(r[0] for r in ranked) >= 11:
                break
    ranked.sort(key=lambda r: r[0], reverse=True)
    for sc, e in ranked[:3]:
        print(f"[PICK] {sc:5.1f}  {e.get('duration')}s  {e.get('channel')}  {e.get('title')}", flush=True)
    candidates = [{"url": f"https://www.youtube.com/watch?v={e['id']}", "title": e.get("title"), "channel": e.get("channel") or e.get("uploader"),
                   "duration": e.get("duration"), "score": round(sc, 1)} for sc, e in ranked[:5] if sc > -6]
    if not ranked or ranked[0][0] < 2:
        return None, candidates
    return f"https://www.youtube.com/watch?v={ranked[0][1]['id']}", candidates


def audio_length(path: str):
    try:
        import mutagen

        f = mutagen.File(path)
        return float(f.info.length) if f and f.info else None
    except Exception:  # noqa: BLE001
        return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["track", "playlist"], default="track")
    ap.add_argument("--query", required=True)
    ap.add_argument("--artist")
    ap.add_argument("--title")
    ap.add_argument("--album")
    ap.add_argument("--duration", type=float, default=0.0)
    ap.add_argument("--url")
    ap.add_argument("--format", default="mp3", choices=["mp3", "flac", "opus"])
    ap.add_argument("--base-dir", required=True)
    a = ap.parse_args()

    if a.mode == "playlist":
        import playlist_resolver

        print("@@RESULT " + json.dumps(playlist_resolver.resolve_playlist(a.url or a.query), default=str), flush=True)
        return

    import checkpoint4_pipeline as pipeline

    artist, title = (a.artist or "").strip(), (a.title or "").strip()
    if not (artist and title) and " - " in a.query and not a.url:
        artist, title = [p.strip() for p in a.query.split(" - ", 1)]
    album = re.sub(r"\s*-\s*(single|ep)$", "", (a.album or "").strip(), flags=re.I) or None

    url, candidates = a.url, []
    # A YouTube video the person chose (pasted, or picked after a failure) is the song they want,
    # so it is fetched from that upload directly instead of asking Soulseek for something else.
    chosen = bool(url and YT_VIDEO.search(url))
    if not url and artist and title:
        print("[SEARCH] Picking the exact upload on YouTube...", flush=True)
        try:
            url, candidates = pick_upload(artist, title, a.duration)
        except Exception as e:  # noqa: BLE001
            print(f"[PICK] YouTube search failed: {e}", flush=True)
        if not url:
            print("[PICK] No trustworthy YouTube upload. Asking Soulseek anyway...", flush=True)

    def done(res: dict) -> None:
        if res.get("status") != "success":
            res = {**res, "candidates": candidates}
        print("@@RESULT " + json.dumps(res, default=str), flush=True)

    def run(force_no_p2p: bool):
        return pipeline.process_song(
            input_query=a.query, base_dir=a.base_dir, preferred_format=a.format,
            exact_url=url, exact_title=title or None, exact_artist=artist or None,
            expected_duration=a.duration or None, override_album=album, force_sockseek_fail=force_no_p2p,
        )

    from path_manager import cleanup_failed_track

    res = run(chosen) or {}
    path = (res or {}).get("file_path") or (res or {}).get("final_file_path")
    if res.get("status") == "success" and a.duration and path:
        got = audio_length(path)
        tolerance = max(12.0, a.duration * 0.06)
        if got and abs(got - a.duration) > tolerance:
            print(f"[VALIDATE] Length {got:.0f}s does not match the real song ({a.duration:.0f}s). Retrying from the picked upload...", flush=True)
            cleanup_failed_track(Path(path))
            if not url:
                done({"status": "failed", "code": "length", "reason": f"The only copy found was {got:.0f}s long, but the song is {a.duration:.0f}s, and there is no exact upload to retry from."})
                return
            res = run(True) or {}
            path = (res or {}).get("file_path") or (res or {}).get("final_file_path")
            got = audio_length(path) if path else None
            if res.get("status") == "success" and got and abs(got - a.duration) > max(25.0, a.duration * 0.12):
                cleanup_failed_track(Path(path))
                res = {"status": "failed", "code": "length", "reason": f"Every copy found was {got:.0f}s long, but the song is {a.duration:.0f}s. Not keeping a wrong version."}
    done(res)


if __name__ == "__main__":
    main()
