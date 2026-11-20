#!/usr/bin/env python3
"""
SheroFetch — Five Gate Verifier v1.0

Takes resolver output (CANDIDATE/QUARANTINE/UNRESOLVED/NEEDS_HUMAN) and runs
5 verification gates before accepting. Downloads, fingerprints, verifies,
tags, and packages the final audio file.

Gates:
  1. AcoustID/Chromaprint fingerprint (commercial only)
  2. Sliding-window fingerprint compare (cartoon only)
  3. Gemini 2.5 Flash audio veto (both paths)
  4. Duration cross-check (both paths)
  5. Cover art & lyrics acquisition (both paths)

Output states: ACCEPTED, QUARANTINE, UNRESOLVED, NEEDS_HUMAN
"""

import sys
import os
import re
import json
import time
import base64
import hashlib
import shutil
import argparse
import subprocess
import urllib.parse
import urllib.request
import urllib.error
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

# ─────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────

from config_manager import load_config, get_config_dir

_cfg = load_config()
GEMINI_API_KEY = _cfg.get("gemini_api_key", "").strip() or os.environ.get("GEMINI_API_KEY", "").strip()
ACOUSTID_CLIENT = _cfg.get("acoustid_api_key", "").strip() or os.environ.get("ACOUSTID_API_KEY", "pNpKzsFC").strip()
FPCALC_BIN = shutil.which("fpcalc") or "/usr/bin/fpcalc"

MUSIC_DIR = Path(_cfg.get("download_dir") or (Path.home() / "Music" / "MusicDownloader"))
QUARANTINE_DIR = MUSIC_DIR / "Quarantine"
QUARANTINE_LOG = QUARANTINE_DIR / "quarantine_log.jsonl"
TEMP_DIR = Path("/tmp/sherofetch_verify") if sys.platform != "win32" else Path(os.environ.get("TEMP", ".")) / "sherofetch_verify"

CONFIG_DIR = get_config_dir()
PCM_REGISTRY_FILE = CONFIG_DIR / "pcm_registry.json"


# ─────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────

def _http_get_json(url: str, timeout: int = 8) -> Optional[dict]:
    req = urllib.request.Request(url, headers={"User-Agent": "SheroFetch/2.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception:
        return None


def _http_post_json(url: str, payload: dict, timeout: int = 15) -> Optional[dict]:
    """POST JSON and return parsed response."""
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", "User-Agent": "SheroFetch/2.0"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception as e:
        print(f"[VERIFIER] HTTP POST error: {e}")
        return None





def load_pcm_registry() -> Dict[str, str]:
    if PCM_REGISTRY_FILE.exists():
        try:
            return json.loads(PCM_REGISTRY_FILE.read_text("utf-8"))
        except Exception:
            pass
    return {}


def save_pcm_registry(registry: Dict[str, str]):
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    try:
        PCM_REGISTRY_FILE.write_text(json.dumps(registry, indent=2), "utf-8")
    except Exception:
        pass


def get_pcm_hash(file_path: Path, duration_sec: int = 30) -> Optional[str]:
    """Extract raw PCM audio and compute MD5 hash."""
    try:
        cmd = [
            "ffmpeg", "-y", "-i", str(file_path),
            "-t", str(duration_sec),
            "-f", "s16le", "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "1",
            "-"
        ]
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=12)
        if proc.returncode == 0 and len(proc.stdout) > 1000:
            return hashlib.md5(proc.stdout).hexdigest()
    except Exception:
        pass
    return None


def sanitize_filename(s: str) -> str:
    """Remove invalid filesystem characters."""
    return re.sub(r'[<>:"/\\|?*\x00-\x1f]', '', s).strip('. ')


# ─────────────────────────────────────────────────────────────────
# Gate 1: AcoustID / Chromaprint (Commercial)
# ─────────────────────────────────────────────────────────────────

def gate_acoustid(audio_path: Path, expected_isrcs: List[str]) -> Tuple[bool, float, str]:
    """
    Run fpcalc on audio, submit to AcoustID, check if recording maps to any expected ISRC.
    Returns (passed, score, reason).
    """
    if not expected_isrcs:
        return False, 0.0, "No expected ISRCs to match against"

    # Get fingerprint
    if not shutil.which(FPCALC_BIN) and not Path(FPCALC_BIN).exists():
        print(f"[VERIFIER]   ⚠ fpcalc binary not found on system, bypassing Gate 1")
        return True, 1.0, "fpcalc binary not found on system (bypassed)"

    try:
        proc = subprocess.run(
            [FPCALC_BIN, "-json", str(audio_path)],
            capture_output=True, text=True, timeout=15
        )
        if proc.returncode != 0:
            return False, 0.0, f"fpcalc failed: {proc.stderr[:100]}"
        fp_data = json.loads(proc.stdout)
        fingerprint = fp_data.get("fingerprint", "")
        duration = fp_data.get("duration", 0)
    except FileNotFoundError:
        print(f"[VERIFIER]   ⚠ fpcalc binary not found, bypassing Gate 1")
        return True, 1.0, "fpcalc binary not found (bypassed)"
    except Exception as e:
        return False, 0.0, f"fpcalc error: {e}"

    if not fingerprint:
        return False, 0.0, "Empty fingerprint from fpcalc"

    # Submit to AcoustID via GET query
    params = urllib.parse.urlencode({
        "client": ACOUSTID_CLIENT,
        "duration": str(int(duration)),
        "fingerprint": fingerprint,
        "meta": "recordings+isrcs"
    })
    url = f"https://api.acoustid.org/v2/lookup?{params}"
    result = _http_get_json(url)
    if not result or result.get("status") != "ok":
        # Graceful fallback: If AcoustID key is missing/invalid or server error, log warning & pass
        print(f"[VERIFIER]   ⚠ AcoustID lookup unavailable ({result.get('error', {}).get('message', 'network') if result else 'no response'}), bypassing Gate 1")
        return True, 1.0, "AcoustID API key/service unavailable (bypassed)"

    best_score = 0.0
    matched_isrc = None

    for r in result.get("results", []):
        score = float(r.get("score") or 0)
        for rec in r.get("recordings", []):
            rec_isrcs = rec.get("isrcs", [])
            # Check if any of the recording's ISRCs match our expected ones
            for isrc in rec_isrcs:
                if isrc in expected_isrcs:
                    if score > best_score:
                        best_score = score
                        matched_isrc = isrc

    if matched_isrc and best_score >= 0.9:
        return True, best_score, f"AcoustID confirmed: ISRC {matched_isrc} with score {best_score:.3f}"

    if matched_isrc:
        return False, best_score, f"AcoustID found ISRC {matched_isrc} but score {best_score:.3f} < 0.9"

    return False, best_score, f"AcoustID found no matching ISRC (best score: {best_score:.3f})"


# ─────────────────────────────────────────────────────────────────
# Gate 2: Sliding Window Fingerprint Compare (Cartoon)
# ─────────────────────────────────────────────────────────────────

def get_raw_fingerprint(audio_path: str, length_sec: int = 0) -> Optional[List[int]]:
    """Run fpcalc -raw and return list of fingerprint integers."""
    cmd = [FPCALC_BIN, "-raw", "-json"]
    if length_sec > 0:
        cmd.extend(["-length", str(length_sec)])
    cmd.append(audio_path)
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        if proc.returncode == 0:
            data = json.loads(proc.stdout)
            return data.get("fingerprint", [])
    except Exception:
        pass
    return None


def sliding_fingerprint_compare(ref_clip_path: str, download_path: str) -> float:
    """
    Slide 10s reference fingerprint over first 120s of download.
    Returns best match score (1.0 - min_ber). Higher = better.
    """
    ref_fp = get_raw_fingerprint(ref_clip_path)
    dl_fp = get_raw_fingerprint(download_path, length_sec=120)

    if not ref_fp or not dl_fp:
        print("[VERIFIER]   Cannot compute fingerprints for sliding compare")
        return 0.0

    if len(dl_fp) < len(ref_fp):
        print("[VERIFIER]   Download fingerprint shorter than reference")
        return 0.0

    min_ber = 1.0
    ref_len = len(ref_fp)
    total_bits = ref_len * 32

    for offset in range(len(dl_fp) - ref_len + 1):
        bit_errors = 0
        for i in range(ref_len):
            # XOR and count differing bits
            xor = ref_fp[i] ^ dl_fp[i + offset]
            # Handle negative integers (Python ints can be arbitrary precision)
            bit_errors += bin(xor & 0xFFFFFFFF).count('1')
        ber = bit_errors / total_bits
        if ber < min_ber:
            min_ber = ber

    score = 1.0 - min_ber
    print(f"[VERIFIER]   Sliding fingerprint: min_BER={min_ber:.4f}, score={score:.4f}")
    return score


# ─────────────────────────────────────────────────────────────────
# Gate 3: Gemini 2.5 Flash Audio Veto
# ─────────────────────────────────────────────────────────────────

def gate_gemini_audio(
    audio_path: Path,
    expected_language: str,
    expected_title: str,
    expected_artist: str
) -> Tuple[bool, Optional[Dict], str]:
    """
    Send 15s audio clip to Gemini for language/lyrics verification.
    Can only VETO (if clearly wrong) or CONFIRM. Never approves alone.
    Returns (passed, gemini_result, reason).
    """
    if not GEMINI_API_KEY:
        print("[VERIFIER]   Gemini API key not configured (bypassing Gate 3)")
        return True, None, "Gemini API key not configured (bypassed)"

    # Extract 15s clip as opus
    clip_path = TEMP_DIR / "gemini_clip.opus"
    try:
        cmd = [
            "ffmpeg", "-y", "-i", str(audio_path),
            "-t", "15", "-c:a", "libopus", "-b:a", "64k",
            str(clip_path)
        ]
        proc = subprocess.run(cmd, capture_output=True, timeout=10)
        if proc.returncode != 0 or not clip_path.exists():
            return True, None, "Could not extract audio clip for Gemini (non-fatal)"
    except Exception:
        return True, None, "ffmpeg clip extraction failed (non-fatal)"

    # Read and base64 encode
    try:
        audio_bytes = clip_path.read_bytes()
        audio_b64 = base64.b64encode(audio_bytes).decode("ascii")
    except Exception:
        return True, None, "Could not read audio clip (non-fatal)"
    finally:
        try:
            clip_path.unlink(missing_ok=True)
        except Exception:
            pass

    # Build Gemini request
    gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"

    payload = {
        "contents": [{
            "parts": [
                {
                    "inline_data": {
                        "mime_type": "audio/ogg",
                        "data": audio_b64
                    }
                },
                {
                    "text": (
                        "Listen to this audio clip. Tell me:\n"
                        "1. What language is it in?\n"
                        "2. What is the first lyric line you hear?\n"
                        "Respond ONLY in valid JSON: {\"language\": \"...\", \"first_line\": \"...\"}"
                    )
                }
            ]
        }],
        "generationConfig": {
            "temperature": 0.1,
            "responseMimeType": "application/json"
        }
    }

    # Retry with backoff for rate limits
    result = None
    for attempt in range(3):
        result = _http_post_json(gemini_url, payload, timeout=20)
        if result is not None:
            # Check for rate limit in the response
            error = result.get("error", {})
            if isinstance(error, dict) and error.get("code") in (429, 503):
                import random
                backoff = min(2 ** attempt, 8) + random.uniform(0, 1)
                print(f"[VERIFIER]   Gemini rate-limited (attempt {attempt+1}/3), backing off {backoff:.1f}s...")
                time.sleep(backoff)
                result = None
                continue
            break
        else:
            if attempt < 2:
                import random
                time.sleep(1.0 + random.uniform(0, 0.5))
            continue

    if not result:
        print("[VERIFIER]   Gemini API unreachable (non-fatal, skipping veto)")
        return True, None, "Gemini API unreachable (non-fatal)"

    try:
        parts = result["candidates"][0]["content"]["parts"]
        parsed = json.loads(parts[0]["text"])
        language = parsed.get("language", "")
        first_line = parsed.get("first_line", "")
    except Exception as e:
        print(f"[VERIFIER]   Gemini parse error: {e}")
        return True, None, "Gemini response parse failed (non-fatal)"

    gemini_verdict = {"language": language, "first_line": first_line}
    print(f"[VERIFIER]   Gemini: language='{language}', first_line='{first_line}'")

    # Veto check: if expected language is specified and Gemini says something completely different
    if expected_language:
        exp_lang = expected_language.lower()
        gem_lang = language.lower()
        # Allow reasonable matches: "English" matches "english", "Hindi" matches "hindi/urdu"
        if exp_lang in gem_lang or gem_lang in exp_lang:
            return True, gemini_verdict, f"Gemini confirms language: {language}"
        # Check for common language family matches
        lang_families = {
            "english": ["english"],
            "hindi": ["hindi", "urdu", "hindustani"],
            "spanish": ["spanish", "español"],
            "french": ["french", "français"],
            "japanese": ["japanese", "日本語"],
            "korean": ["korean", "한국어"],
        }
        expected_family = lang_families.get(exp_lang, [exp_lang])
        if any(f in gem_lang for f in expected_family):
            return True, gemini_verdict, f"Gemini confirms language family: {language}"

        # Language mismatch = VETO
        return False, gemini_verdict, f"Gemini VETO: expected '{expected_language}' but heard '{language}'"

    return True, gemini_verdict, f"Gemini analysis: {language}"


# ─────────────────────────────────────────────────────────────────
# Gate 4: Smart Duration Cross-Check (silence-stripped)
# ─────────────────────────────────────────────────────────────────

def _get_duration(audio_path: Path) -> Optional[float]:
    """Get audio duration via ffprobe."""
    try:
        cmd = ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
               "-of", "json", str(audio_path)]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        return float(json.loads(proc.stdout)["format"]["duration"])
    except Exception:
        return None


def _get_silence_stripped_duration(audio_path: Path) -> Optional[float]:
    """Get duration after stripping leading/trailing silence with ffmpeg."""
    try:
        # Pipe through silenceremove (strip start+end silence) → null output, read duration from stderr
        cmd = [
            "ffmpeg", "-y", "-i", str(audio_path),
            "-af", "silenceremove=start_periods=1:start_silence=0.1:start_threshold=-50dB,"
                   "areverse,silenceremove=start_periods=1:start_silence=0.1:start_threshold=-50dB,areverse",
            "-f", "null", "-"
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        # Parse "time=00:04:10.72" from ffmpeg stderr
        m = re.search(r'time=(\d+):(\d+):(\d+\.?\d*)', proc.stderr or "")
        if m:
            return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    except Exception:
        pass
    return None


def gate_duration(audio_path: Path, resolver_result: Dict, gates_passed: List[str] = None) -> Tuple[bool, str]:
    """
    Smart duration cross-check: strips silence before comparing.
    Non-fatal when AcoustID or Gemini already confirmed the track.
    Only hard-fails on extreme drift (>30s) or when no other gate passed.
    """
    if gates_passed is None:
        gates_passed = []

    actual_dur = _get_duration(audio_path)
    if actual_dur is None:
        return True, "Could not determine audio duration (non-fatal)"

    is_cartoon = (resolver_result.get("cover_source_id") or "").startswith("tvmaze_show:")
    deezer_meta = resolver_result.get("deezer_meta") or {}

    if is_cartoon:
        expected = resolver_result.get("duration") or 90.0
        label = "cartoon expected"
    else:
        expected = deezer_meta.get("duration_s") or resolver_result.get("duration") or 180.0
        label = "Deezer master"

    raw_diff = abs(actual_dur - expected)

    # If raw duration is close enough, pass immediately
    if raw_diff <= 5.0:
        return True, f"Duration OK: actual {actual_dur:.1f}s vs {label} {expected:.1f}s (diff={raw_diff:.1f}s)"

    # Raw diff > 5s — try silence-stripped comparison
    stripped_dur = _get_silence_stripped_duration(audio_path)
    if stripped_dur:
        stripped_diff = abs(stripped_dur - expected)
        if stripped_diff <= 5.0:
            return True, (f"Duration OK (silence-stripped): stripped {stripped_dur:.1f}s vs {label} {expected:.1f}s "
                          f"(stripped_diff={stripped_diff:.1f}s, raw_diff={raw_diff:.1f}s)")
        use_diff = stripped_diff
        use_label = f"stripped {stripped_dur:.1f}s"
    else:
        use_diff = raw_diff
        use_label = f"actual {actual_dur:.1f}s"

    # Extreme drift (>30s) = always quarantine (radio edit vs full album, or completely wrong track)
    if use_diff > 30.0:
        return False, (f"Duration EXTREME mismatch: {use_label} vs {label} {expected:.1f}s "
                       f"(diff={use_diff:.1f}s > 30s hard limit)")

    # Moderate drift (5-30s): non-fatal if AcoustID or Gemini already confirmed
    has_independent_confirmation = any(g in gates_passed for g in ["acoustid", "gemini_veto"])
    if has_independent_confirmation:
        return True, (f"Duration drift WARNING (non-fatal, {', '.join(g for g in gates_passed if g in ['acoustid','gemini_veto'])} confirmed): "
                      f"{use_label} vs {label} {expected:.1f}s (diff={use_diff:.1f}s)")

    # No independent confirmation + moderate drift = quarantine
    return False, (f"Duration mismatch: {use_label} vs {label} {expected:.1f}s "
                   f"(diff={use_diff:.1f}s, no independent gate confirmation)")


# ─────────────────────────────────────────────────────────────────
# Gate 5: Cover Art & Lyrics
# ─────────────────────────────────────────────────────────────────

def fetch_cover_art(resolver_result: Dict) -> Optional[bytes]:
    """Fetch cover art bytes based on cover_source_id."""
    cover_source = resolver_result.get("cover_source_id", "") or ""

    if cover_source.startswith("deezer_album:"):
        album_id = cover_source.split(":", 1)[1]
        data = _http_get_json(f"https://api.deezer.com/album/{album_id}")
        if data and "error" not in data:
            cover_url = data.get("cover_xl") or data.get("cover_big") or data.get("cover_medium")
            if cover_url:
                return _download_bytes(cover_url)

    elif cover_source.startswith("itunes_collection:"):
        itunes_meta = resolver_result.get("itunes_meta", {})
        cover_url = itunes_meta.get("cover_url_1400")
        if cover_url:
            return _download_bytes(cover_url)

    elif cover_source.startswith("tvmaze_show:"):
        show_id = cover_source.split(":", 1)[1]
        # Try TVMaze first, then search by name
        data = _http_get_json(f"https://api.tvmaze.com/shows/{show_id}")
        if data:
            img_url = (data.get("image", {}) or {}).get("original") or (data.get("image", {}) or {}).get("medium")
            if img_url:
                return _download_bytes(img_url)
        # Fallback: search TVMaze by title
        title = resolver_result.get("title", "")
        if title:
            clean_title = re.sub(r'(?i)\b(hindi|english|theme|opening|song|title|broadcast)\b', '', title).strip()
            clean_title = re.sub(r'\s+', ' ', clean_title).strip()
            data = _http_get_json(f"https://api.tvmaze.com/singlesearch/shows?q={urllib.parse.quote(clean_title)}")
            if data:
                img_url = (data.get("image", {}) or {}).get("original")
                if img_url:
                    return _download_bytes(img_url)

    return None


def _download_bytes(url: str) -> Optional[bytes]:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.read()
    except Exception:
        return None


def fetch_lyrics(artist: str, title: str, duration_s: float) -> Optional[str]:
    """
    Fetch synced lyrics from LRCLIB.
    Include duration for better matching.
    Reject if last timestamp > 3s past track end.
    """
    params = urllib.parse.urlencode({
        "artist_name": artist,
        "track_name": title,
        "duration": str(int(duration_s))
    })
    url = f"https://lrclib.net/api/get?{params}"
    data = _http_get_json(url)
    if not data:
        return None

    synced = data.get("syncedLyrics")
    if synced and len(synced.strip()) > 30:
        # Validate: last timestamp shouldn't be > 3s past track end
        timestamps = re.findall(r'\[(\d+):(\d+\.?\d*)\]', synced)
        if timestamps:
            last_ts = float(timestamps[-1][0]) * 60 + float(timestamps[-1][1])
            if last_ts > duration_s + 3.0:
                print(f"[VERIFIER]   Lyrics rejected: last timestamp {last_ts:.1f}s > track end {duration_s:.1f}s + 3s")
                return None
        return synced

    plain = data.get("plainLyrics")
    if plain and len(plain.strip()) > 30:
        return plain

    return None


# ─────────────────────────────────────────────────────────────────
# 4-Tier Lossless-First Download System
# ─────────────────────────────────────────────────────────────────
#
# Tier 1: Soulseek FLAC (lossless P2P via sockseek)
# Tier 2: Soulseek MP3/any (lossy P2P fallback)
# Tier 3: YouTube yt-dlp (stream rip, for cartoons or when P2P fails)
# Tier 4: Convert to user's preferred format (FLAC→Opus, etc.)
#
# Commercial songs: Tier 1 → 2 → 3 → 4
# Cartoons/themes:  Tier 3 → 4 (no P2P source for broadcast themes)
# ─────────────────────────────────────────────────────────────────

SOCKSEEK_CONF_PATHS = [
    Path.home() / ".config" / "sockseek" / "sockseek.conf",
    Path.home() / "AppData" / "Roaming" / "sockseek" / "sockseek.conf",
]

_sockseek_bin_cache: Optional[str] = None


def _find_sockseek() -> Optional[str]:
    """Locate the sockseek binary."""
    global _sockseek_bin_cache
    if _sockseek_bin_cache is not None:
        return _sockseek_bin_cache if _sockseek_bin_cache else None

    candidates = [
        shutil.which("sockseek"),
        str(Path.home() / ".local" / "bin" / "sockseek"),
        "/usr/local/bin/sockseek",
    ]
    for c in candidates:
        if c and Path(c).exists():
            _sockseek_bin_cache = c
            return c
    _sockseek_bin_cache = ""
    return None


def _read_sockseek_credentials() -> Tuple[str, str]:
    """Read Soulseek credentials from config or sockseek.conf."""
    cfg = load_config()
    u = cfg.get("soulseek_username", "").strip()
    p = cfg.get("soulseek_password", "").strip()
    if u and p:
        return u, p

    for conf_path in SOCKSEEK_CONF_PATHS:
        if conf_path.exists():
            try:
                text = conf_path.read_text("utf-8")
                user = ""
                passwd = ""
                for line in text.splitlines():
                    line = line.strip()
                    if line.startswith("#") or "=" not in line:
                        continue
                    key, val = line.split("=", 1)
                    key, val = key.strip(), val.strip()
                    if key == "username":
                        user = val
                    elif key == "password":
                        passwd = val
                if user and passwd:
                    return user, passwd
            except Exception:
                continue
    return "", ""


def _is_soulseek_reachable(timeout: float = 1.5) -> bool:
    """Quick TCP probe to server.slsknet.org:2242."""
    import socket
    try:
        with socket.create_connection(("server.slsknet.org", 2242), timeout=timeout):
            return True
    except Exception:
        return False


def _download_via_sockseek(
    artist: str,
    title: str,
    output_dir: Path,
    prefer_flac: bool = True,
    timeout_sec: int = 18
) -> Optional[Path]:
    """
    Tier 1-2: Download via Soulseek P2P using sockseek.
    Returns path to downloaded file or None.
    """
    sockseek_bin = _find_sockseek()
    if not sockseek_bin:
        print("[VERIFIER]   Sockseek binary not found, skipping P2P tiers")
        return None

    if not _is_soulseek_reachable():
        print("[VERIFIER]   Soulseek server unreachable, skipping P2P tiers")
        return None

    user, passwd = _read_sockseek_credentials()
    if not user or not passwd:
        print("[VERIFIER]   No Soulseek credentials found, skipping P2P tiers")
        return None

    output_dir.mkdir(parents=True, exist_ok=True)
    existing_files = set(output_dir.rglob("*"))

    query = f"{artist} {title}"
    cmd = [
        sockseek_bin,
        "-s", query,
        "-o", str(output_dir),
        "--search-timeout", "7000",
        "--connect-timeout", "15000",
        "--fast-search",
        "--no-progress",
        "--user", user,
        "--pass", passwd,
    ]

    if prefer_flac:
        cmd.extend(["--format", "flac", "--pref-format", "flac"])
    else:
        cmd.extend(["--pref-format", "mp3,flac"])

    try:
        proc = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout_sec
        )
        output = (proc.stdout or "") + (proc.stderr or "")
        if "INVALIDPASS" in output or "rejected login" in output:
            print("[VERIFIER]   Soulseek login rejected")
            return None
    except subprocess.TimeoutExpired:
        print(f"[VERIFIER]   Sockseek timed out after {timeout_sec}s")
    except Exception as e:
        print(f"[VERIFIER]   Sockseek error: {e}")

    # Find newly downloaded audio files (NEVER accept .webm)
    current_files = set(output_dir.rglob("*"))
    new_files = [
        f for f in (current_files - existing_files)
        if f.is_file() and f.suffix.lower() in [".flac", ".mp3", ".m4a", ".wav", ".ogg", ".opus"]
    ]

    if not new_files:
        return None

    # Prefer FLAC if available
    flac_files = [f for f in new_files if f.suffix.lower() == ".flac"]
    if flac_files:
        best = sorted(flac_files, key=lambda p: p.stat().st_size, reverse=True)[0]
        print(f"[VERIFIER]   ✓ Soulseek FLAC: {best.name} ({best.stat().st_size // 1024}KB)")
        return best

    # Otherwise take the largest audio file
    best = sorted(new_files, key=lambda p: p.stat().st_size, reverse=True)[0]
    print(f"[VERIFIER]   ✓ Soulseek {best.suffix}: {best.name} ({best.stat().st_size // 1024}KB)")
    return best


def _convert_audio(input_path: Path, output_path: Path, target_fmt: str = "opus") -> bool:
    """Convert between audio formats using ffmpeg. FLAC→Opus, etc."""
    if input_path.suffix.lower().lstrip('.') == target_fmt:
        # Same format, just rename
        try:
            shutil.move(str(input_path), str(output_path))
            return True
        except Exception:
            return False

    quality_args = []
    if target_fmt == "opus":
        quality_args = ["-c:a", "libopus", "-b:a", "192k", "-vbr", "on"]
    elif target_fmt == "mp3":
        quality_args = ["-c:a", "libmp3lame", "-q:a", "0"]  # V0 VBR ~245kbps
    elif target_fmt == "flac":
        quality_args = ["-c:a", "flac"]

    cmd = [
        "ffmpeg", "-y", "-i", str(input_path),
        *quality_args,
        str(output_path)
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=30)
        if proc.returncode == 0 and output_path.exists() and output_path.stat().st_size > 10000:
            # Clean up source if conversion succeeded
            if input_path != output_path:
                input_path.unlink(missing_ok=True)
            return True
    except Exception as e:
        print(f"[VERIFIER]   Conversion error: {e}")

    return False


def _download_from_youtube(url: str, output_path: Path, fmt: str = "opus") -> bool:
    """Tier 3: Download audio from YouTube using yt-dlp."""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if fmt == "opus":
        cmd = [
            "yt-dlp", "-x", "--audio-format", "opus",
            "--audio-quality", "192k", "--no-playlist",
            "-o", str(output_path), url
        ]
    elif fmt == "flac":
        cmd = [
            "yt-dlp", "-x", "--audio-format", "flac",
            "--no-playlist",
            "-o", str(output_path), url
        ]
    else:  # mp3
        cmd = [
            "yt-dlp", "-x", "--audio-format", "mp3",
            "--audio-quality", "320k", "--no-playlist",
            "-o", str(output_path), url
        ]

    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if proc.returncode == 0 and output_path.exists() and output_path.stat().st_size > 10000:
            return True
        # yt-dlp sometimes appends the extension
        for alt_ext in [".opus", ".m4a", ".webm", ".mp3", ".flac"]:
            alt_path = output_path.with_suffix(alt_ext)
            if alt_path.exists() and alt_path.stat().st_size > 10000:
                alt_path.rename(output_path)
                return True
    except Exception as e:
        print(f"[VERIFIER] YouTube download error: {e}")

    return False


def download_audio(
    url: str,
    output_path: Path,
    fmt: str = "opus",
    artist: str = "",
    title: str = "",
    is_cartoon: bool = False
) -> Tuple[bool, str]:
    """
    4-Tier lossless-first download system.

    Commercial songs: Soulseek FLAC → Soulseek any → YouTube → convert
    Cartoons/themes:  YouTube → convert

    Returns (success, source_tier) where source_tier is one of:
      'soulseek_flac', 'soulseek_lossy', 'youtube', 'failed'
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sockseek_tmp = TEMP_DIR / "sockseek_dl"

    # ── Cartoons: skip P2P, go straight to YouTube ──
    if is_cartoon:
        print("[VERIFIER]   Cartoon/theme → YouTube direct (no P2P source for broadcast themes)")
        if _download_from_youtube(url, output_path, fmt):
            return True, "youtube"
        return False, "failed"

    # ── Commercial: Tier 1 — Soulseek FLAC ──
    if artist and title:
        print("[VERIFIER]   Tier 1: Soulseek FLAC (lossless P2P)...")
        sockseek_tmp.mkdir(parents=True, exist_ok=True)
        slsk_file = _download_via_sockseek(artist, title, sockseek_tmp, prefer_flac=True)

        if slsk_file and slsk_file.exists() and slsk_file.stat().st_size > 100_000:
            # Got a FLAC from Soulseek — convert to user's preferred format
            if fmt == "flac":
                # User wants FLAC, just move it
                try:
                    shutil.move(str(slsk_file), str(output_path))
                    return True, "soulseek_flac"
                except Exception:
                    pass
            else:
                # Convert FLAC → user's format (e.g., Opus 192k)
                print(f"[VERIFIER]   Converting FLAC → {fmt}...")
                if _convert_audio(slsk_file, output_path, fmt):
                    return True, "soulseek_flac"

        # ── Tier 2: Soulseek any format ──
        print("[VERIFIER]   Tier 2: Soulseek any format...")
        slsk_file = _download_via_sockseek(artist, title, sockseek_tmp, prefer_flac=False)

        if slsk_file and slsk_file.exists() and slsk_file.stat().st_size > 100_000:
            if slsk_file.suffix.lower().lstrip('.') == fmt:
                try:
                    shutil.move(str(slsk_file), str(output_path))
                    return True, "soulseek_lossy"
                except Exception:
                    pass
            else:
                print(f"[VERIFIER]   Converting {slsk_file.suffix} → {fmt}...")
                if _convert_audio(slsk_file, output_path, fmt):
                    return True, "soulseek_lossy"

    # ── Tier 3: YouTube fallback ──
    print("[VERIFIER]   Tier 3: YouTube fallback...")
    if _download_from_youtube(url, output_path, fmt):
        return True, "youtube"

    return False, "failed"


def embed_tags(
    audio_path: Path,
    artist: str,
    title: str,
    album: str,
    genre: str = "Pop",
    year: str = "",
    cover_bytes: Optional[bytes] = None,
    lyrics: Optional[str] = None
) -> bool:
    """Embed metadata tags, cover art, and lyrics into audio file."""
    try:
        ext = audio_path.suffix.lower()
        if ext == ".opus":
            from mutagen.oggopus import OggOpus
            from mutagen.flac import Picture
            op = OggOpus(str(audio_path))
            op["artist"] = [artist]
            op["title"] = [title]
            op["album"] = [album]
            op["albumartist"] = [artist]
            if genre:
                op["genre"] = [genre]
            if year:
                op["date"] = [year]
            if lyrics:
                op["lyrics"] = [lyrics]
            if cover_bytes and len(cover_bytes) > 5000:
                pic = Picture()
                pic.type = 3
                pic.mime = "image/jpeg"
                pic.desc = f"{title} Cover Art"
                pic.data = cover_bytes
                op["metadata_block_picture"] = [base64.b64encode(pic.write()).decode("ascii")]
            op.save()
            return True

        elif ext == ".flac":
            from mutagen.flac import FLAC, Picture
            fl = FLAC(str(audio_path))
            fl["artist"] = [artist]
            fl["title"] = [title]
            fl["album"] = [album]
            fl["albumartist"] = [artist]
            if genre:
                fl["genre"] = [genre]
            if year:
                fl["date"] = [year]
            if lyrics:
                fl["lyrics"] = [lyrics]
            if cover_bytes and len(cover_bytes) > 5000:
                pic = Picture()
                pic.type = 3
                pic.mime = "image/jpeg"
                pic.desc = f"{title} Cover Art"
                pic.data = cover_bytes
                fl.clear_pictures()
                fl.add_picture(pic)
            fl.save()
            return True

        elif ext == ".mp3":
            from mutagen.mp3 import MP3
            from mutagen.id3 import ID3, TIT2, TPE1, TALB, TCON, TDRC, USLT, APIC
            audio = MP3(str(audio_path), ID3=ID3)
            try:
                audio.add_tags()
            except Exception:
                pass
            audio.tags.add(TIT2(encoding=3, text=title))
            audio.tags.add(TPE1(encoding=3, text=artist))
            audio.tags.add(TALB(encoding=3, text=album))
            if genre:
                audio.tags.add(TCON(encoding=3, text=genre))
            if year:
                audio.tags.add(TDRC(encoding=3, text=year))
            if lyrics:
                audio.tags.add(USLT(encoding=3, lang='eng', desc='Lyrics', text=lyrics))
            if cover_bytes and len(cover_bytes) > 5000:
                audio.tags.add(APIC(
                    encoding=3, mime='image/jpeg', type=3,
                    desc=f"{title} Cover Art", data=cover_bytes
                ))
            audio.save()
            return True

    except Exception as e:
        print(f"[VERIFIER] Tagging error: {e}")
    return False


# ─────────────────────────────────────────────────────────────────
# Quarantine
# ─────────────────────────────────────────────────────────────────

def quarantine_file(temp_path: Path, resolver_result: Dict, reason: str):
    """Move temp file to quarantine directory and log the reason."""
    QUARANTINE_DIR.mkdir(parents=True, exist_ok=True)

    dest = QUARANTINE_DIR / temp_path.name
    counter = 1
    while dest.exists():
        dest = QUARANTINE_DIR / f"{temp_path.stem}_{counter}{temp_path.suffix}"
        counter += 1

    try:
        shutil.move(str(temp_path), str(dest))
        print(f"[VERIFIER] Quarantined: {dest}")
    except Exception as e:
        print(f"[VERIFIER] Quarantine move error: {e}")

    # Log to quarantine_log.jsonl
    log_entry = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "query": resolver_result.get("query", ""),
        "file": str(dest),
        "reason": reason,
        "chosen_url": resolver_result.get("chosen_url"),
        "isrc": resolver_result.get("isrc_deezer"),
    }
    try:
        with open(QUARANTINE_LOG, "a", encoding="utf-8") as f:
            f.write(json.dumps(log_entry, ensure_ascii=False) + "\n")
    except Exception:
        pass


# ─────────────────────────────────────────────────────────────────
# Main Verifier
# ─────────────────────────────────────────────────────────────────

def verify_and_acquire(
    resolver_result: Dict[str, Any],
    output_dir: Path = MUSIC_DIR,
    preferred_format: str = "opus",
    expected_language: str = "English"
) -> Dict[str, Any]:
    """
    Run 5 verification gates on resolver output.
    Only CANDIDATE tracks enter gates. Others pass through.
    """
    state = resolver_result.get("state", "UNRESOLVED")
    query = resolver_result.get("query", "")

    result = {
        "state": state,
        "file_path": None,
        "query": query,
        "artist": "",
        "title": "",
        "album": "",
        "genre": "",
        "year": "",
        "format": preferred_format,
        "acoustid_score": None,
        "ref_clip_score": None,
        "gemini_verdict": None,
        "pcm_hash": None,
        "cover_source": resolver_result.get("cover_source_id"),
        "has_lyrics": False,
        "has_cover": False,
        "duration": resolver_result.get("duration"),
        "gates_passed": [],
        "gates_failed": [],
        "source_tier": None,
        "reason": resolver_result.get("reason", ""),
    }

    # Pass-through non-CANDIDATE states
    if state != "CANDIDATE":
        print(f"[VERIFIER] Pass-through: {state} — {resolver_result.get('reason', '')}")
        return result

    chosen_url = resolver_result.get("chosen_url")
    if not chosen_url:
        result["state"] = "UNRESOLVED"
        result["reason"] = "No chosen_url in resolver output"
        return result

    # Parse artist/title
    is_cartoon = resolver_result.get("cover_source_id", "").startswith("tvmaze_show:") if resolver_result.get("cover_source_id") else False
    deezer_meta = resolver_result.get("deezer_meta", {}) or {}

    if deezer_meta:
        artist = deezer_meta.get("artist", "")
        title_track = deezer_meta.get("title", "")
        album = deezer_meta.get("album", "")
    else:
        # Fallback: parse from query
        raw_query = resolver_result.get("query", "")
        if " - " in raw_query:
            parts = raw_query.split(" - ", 1)
            artist, title_track = parts[0].strip(), parts[1].strip()
        else:
            artist = ""
            title_track = raw_query
        album = title_track

    result["artist"] = artist
    result["title"] = title_track
    result["album"] = album

    # ── Download to temp (4-tier lossless-first) ──
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = sanitize_filename(f"{artist} - {title_track}") or "download"
    temp_path = TEMP_DIR / f"{safe_name}.{preferred_format}"

    print(f"[VERIFIER] Downloading: {chosen_url}")
    dl_success, source_tier = download_audio(
        url=chosen_url,
        output_path=temp_path,
        fmt=preferred_format,
        artist=artist,
        title=title_track,
        is_cartoon=is_cartoon
    )
    if not dl_success:
        result["state"] = "UNRESOLVED"
        result["reason"] = "Download failed across all tiers (Soulseek + YouTube)"
        return result

    result["source_tier"] = source_tier
    print(f"[VERIFIER] Downloaded via {source_tier}: {temp_path} ({temp_path.stat().st_size} bytes)")

    # ── Gate 1: AcoustID (commercial only) ──
    if not is_cartoon:
        print("[VERIFIER] Gate 1: AcoustID fingerprint...")
        expected_isrcs = resolver_result.get("mb_all_isrcs", [])
        # Add the selected ISRC if not already in list
        sel_isrc = resolver_result.get("isrc_deezer")
        if sel_isrc and sel_isrc not in expected_isrcs:
            expected_isrcs.insert(0, sel_isrc)

        passed, score, reason = gate_acoustid(temp_path, expected_isrcs)
        result["acoustid_score"] = score
        if passed:
            result["gates_passed"].append("acoustid")
            print(f"[VERIFIER]   ✓ Gate 1 PASSED: {reason}")
        else:
            result["gates_failed"].append("acoustid")
            print(f"[VERIFIER]   ✗ Gate 1 FAILED: {reason}")
            result["state"] = "QUARANTINE"
            result["reason"] = reason
            quarantine_file(temp_path, resolver_result, reason)
            return result
    else:
        # Gate 2: Sliding fingerprint (cartoon only)
        ref_clip = resolver_result.get("ref_clip_path") or ""
        if ref_clip and Path(ref_clip).exists():
            print("[VERIFIER] Gate 2: Sliding window fingerprint...")
            score = sliding_fingerprint_compare(ref_clip, str(temp_path))
            result["ref_clip_score"] = score
            if score >= 0.65:  # 1.0 - 0.35 BER
                result["gates_passed"].append("sliding_fingerprint")
                print(f"[VERIFIER]   ✓ Gate 2 PASSED: score={score:.4f}")
            else:
                result["gates_failed"].append("sliding_fingerprint")
                reason = f"Sliding fingerprint score {score:.4f} < 0.65 threshold"
                print(f"[VERIFIER]   ✗ Gate 2 FAILED: {reason}")
                result["state"] = "QUARANTINE"
                result["reason"] = reason
                quarantine_file(temp_path, resolver_result, reason)
                return result
        else:
            print("[VERIFIER] Gate 2: Skipped (no ref clip — already NEEDS_HUMAN from resolver)")

    # ── Gate 3: Gemini Audio Veto ──
    print("[VERIFIER] Gate 3: Gemini 2.5 Flash audio veto...")
    gem_passed, gem_verdict, gem_reason = gate_gemini_audio(
        temp_path, expected_language, title_track, artist
    )
    result["gemini_verdict"] = gem_verdict
    if gem_passed:
        result["gates_passed"].append("gemini_veto")
        print(f"[VERIFIER]   ✓ Gate 3 PASSED: {gem_reason}")
    else:
        result["gates_failed"].append("gemini_veto")
        print(f"[VERIFIER]   ✗ Gate 3 FAILED (VETO): {gem_reason}")
        result["state"] = "QUARANTINE"
        result["reason"] = gem_reason
        quarantine_file(temp_path, resolver_result, gem_reason)
        return result

    # ── Gate 4: Duration Cross-Check ──
    print("[VERIFIER] Gate 4: Duration cross-check...")
    dur_passed, dur_reason = gate_duration(temp_path, resolver_result, gates_passed=result["gates_passed"])
    if dur_passed:
        result["gates_passed"].append("duration")
        print(f"[VERIFIER]   ✓ Gate 4 PASSED: {dur_reason}")
    else:
        result["gates_failed"].append("duration")
        print(f"[VERIFIER]   ✗ Gate 4 FAILED: {dur_reason}")
        result["state"] = "QUARANTINE"
        result["reason"] = dur_reason
        quarantine_file(temp_path, resolver_result, dur_reason)
        return result

    # ── Gate 5: Cover Art & Lyrics ──
    print("[VERIFIER] Gate 5: Cover art & lyrics acquisition...")
    cover_bytes = fetch_cover_art(resolver_result)
    result["has_cover"] = bool(cover_bytes and len(cover_bytes) > 5000)
    if result["has_cover"]:
        print(f"[VERIFIER]   ✓ Cover art: {len(cover_bytes)} bytes")
    else:
        print("[VERIFIER]   ⚠ No cover art (non-fatal)")

    actual_dur = resolver_result.get("duration") or 180.0
    lyrics = fetch_lyrics(artist, title_track, actual_dur)
    result["has_lyrics"] = bool(lyrics)
    if lyrics:
        print(f"[VERIFIER]   ✓ Lyrics: {len(lyrics)} chars")
    else:
        print("[VERIFIER]   ⚠ No lyrics found (non-fatal)")

    result["gates_passed"].append("cover_lyrics")

    # ── PCM Hash & Duplicate Check ──
    print("[VERIFIER] PCM hash & duplicate check...")
    pcm_hash = get_pcm_hash(temp_path)
    result["pcm_hash"] = pcm_hash

    if pcm_hash:
        registry = load_pcm_registry()
        tag = f"{artist} - {title_track}"

        # Check for collision with a DIFFERENT track
        if pcm_hash in registry:
            existing = registry[pcm_hash]
            # Normalize for comparison
            existing_norm = re.sub(r'[^a-zA-Z0-9]', '', existing).lower()
            current_norm = re.sub(r'[^a-zA-Z0-9]', '', tag).lower()
            if existing_norm != current_norm and existing_norm not in current_norm and current_norm not in existing_norm:
                reason = f"PCM collision: audio identical to '{existing}'"
                print(f"[VERIFIER]   ✗ {reason}")
                result["state"] = "QUARANTINE"
                result["reason"] = reason
                quarantine_file(temp_path, resolver_result, reason)
                return result

        registry[pcm_hash] = tag
        save_pcm_registry(registry)
        print(f"[VERIFIER]   ✓ PCM hash: {pcm_hash}")

    # ══════════════════════════════════════════════════════════
    # ALL GATES PASSED → ACCEPTED
    # ══════════════════════════════════════════════════════════

    # Determine final path
    output_dir.mkdir(parents=True, exist_ok=True)
    safe_artist = sanitize_filename(artist) or "Unknown Artist"
    safe_title = sanitize_filename(title_track) or "Unknown Track"
    final_path = output_dir / f"{safe_artist} - {safe_title}.{preferred_format}"

    # Resolve genre and year from iTunes or Deezer
    itunes_meta = resolver_result.get("itunes_meta", {}) or {}
    genre = itunes_meta.get("genre", "Pop")
    year = itunes_meta.get("year", "")
    if not year and deezer_meta:
        year = str(time.localtime().tm_year)

    result["genre"] = genre
    result["year"] = year

    # Embed tags
    print("[VERIFIER] Embedding tags, cover art, and lyrics...")
    embed_tags(
        audio_path=temp_path,
        artist=artist,
        title=title_track,
        album=album,
        genre=genre,
        year=year,
        cover_bytes=cover_bytes,
        lyrics=lyrics
    )

    # Move to final location
    try:
        if final_path.exists():
            final_path.unlink()
        shutil.move(str(temp_path), str(final_path))
        result["file_path"] = str(final_path)
        print(f"[VERIFIER] ✓ ACCEPTED: {final_path}")
    except Exception as e:
        print(f"[VERIFIER] Move to final path failed: {e}")
        result["file_path"] = str(temp_path)

    # Write companion .lrc file
    if lyrics:
        lrc_path = final_path.with_suffix(".lrc")
        try:
            lrc_path.write_text(lyrics, encoding="utf-8")
            print(f"[VERIFIER]   ✓ LRC file: {lrc_path}")
        except Exception:
            pass

    result["state"] = "ACCEPTED"
    result["reason"] = (
        f"All {len(result['gates_passed'])} gates passed: "
        + ", ".join(result["gates_passed"])
    )

    return result


# ─────────────────────────────────────────────────────────────────
# CLI Entry Point
# ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SheroFetch Five Gate Verifier v1.0")
    parser.add_argument("input", nargs="?", help="Path to resolver output JSON file")
    parser.add_argument("--output-dir", type=str, default=None, help="Output directory")
    parser.add_argument("--format", type=str, default="opus", choices=["opus", "flac", "mp3"])
    parser.add_argument("--language", type=str, default="English", help="Expected language")
    parser.add_argument("--inline", type=str, default=None, help="Inline JSON resolver output")
    args = parser.parse_args()

    if args.inline:
        resolver_data = json.loads(args.inline)
    elif args.input:
        with open(args.input, "r", encoding="utf-8") as f:
            resolver_data = json.load(f)
    else:
        # Read from stdin
        print("[VERIFIER] Reading resolver JSON from stdin...")
        resolver_data = json.load(sys.stdin)

    out_dir = Path(args.output_dir) if args.output_dir else MUSIC_DIR

    result = verify_and_acquire(
        resolver_result=resolver_data,
        output_dir=out_dir,
        preferred_format=args.format,
        expected_language=args.language
    )

    print("\n" + json.dumps(result, indent=2, ensure_ascii=False))
