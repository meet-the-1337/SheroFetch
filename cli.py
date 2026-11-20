#!/usr/bin/env python3
"""
SheroFetch — Unified Cross-Platform Music CLI
Works on Linux, macOS, and Windows.
Deterministic 4-tier lossless acquisition + 5-gate ground-truth verification.
"""

import sys
import os
import re
import json
import shutil
import argparse
import subprocess
from pathlib import Path
from typing import Optional, List, Dict, Any

from config_manager import (
    load_config,
    save_config,
    is_configured,
    run_interactive_onboarding,
    test_soulseek_server,
)
from universal_resolver import resolve_track
from five_gate_verifier import verify_and_acquire

VERSION = "1.0.2"


def check_prerequisites(verbose: bool = True) -> bool:
    """Diagnose system tools (ffmpeg, yt-dlp, fpcalc, sockseek)."""
    tools = {
        "ffmpeg": shutil.which("ffmpeg"),
        "ffprobe": shutil.which("ffprobe"),
        "yt-dlp": shutil.which("yt-dlp"),
        "fpcalc": shutil.which("fpcalc"),
        "sockseek": shutil.which("sockseek") or str(Path.home() / ".local" / "bin" / "sockseek"),
    }

    all_critical_ok = bool(tools["ffmpeg"] and tools["ffprobe"] and tools["yt-dlp"])

    if verbose:
        print("\n" + "=" * 60)
        print(f"  🔍  SHEROFETCH PREREQUISITE DIAGNOSTIC (v{VERSION})")
        print("=" * 60)
        for name, path in tools.items():
            exists = bool(path and (shutil.which(name) or Path(path).exists()))
            mark = "✓" if exists else "✗"
            status = path if exists else "NOT FOUND"
            critical = " [REQUIRED]" if name in ("ffmpeg", "ffprobe", "yt-dlp") else " [OPTIONAL]"
            print(f"  {mark} {name:<10} : {status}{critical}")

        # Check Soulseek server connectivity
        slsk_ok = test_soulseek_server(timeout=1.5)
        print(f"  {'✓' if slsk_ok else '⚠'} Soulseek P2P: {'Server Online' if slsk_ok else 'Unreachable / Blocked'}")

        if not all_critical_ok:
            print("\n" + "!" * 60)
            print("  MISSING REQUIRED TOOLS!")
            print("  Please install missing tools using your system package manager:")
            if sys.platform == "darwin":
                print("    brew install ffmpeg yt-dlp chromaprint")
            elif sys.platform == "win32":
                print("    winget install Gyan.FFmpeg yt-dlp.yt-dlp")
            else:
                # Linux
                print("    Arch:   sudo pacman -S ffmpeg yt-dlp chromaprint")
                print("    Debian: sudo apt install ffmpeg yt-dlp libchromaprint-tools")
            print("!" * 60)
        print("=" * 60 + "\n")

    return all_critical_ok


def download_single(
    query: str,
    output_dir: Path,
    preferred_format: str = "opus",
    is_cartoon: bool = False,
    source_url: Optional[str] = None
) -> Dict[str, Any]:
    """Execute full resolver + verifier pipeline for a single track."""
    print(f"\n[SHEROFETCH] ── Resolving: '{query}' ──")
    res = resolve_track(
        query=query,
        is_cartoon=is_cartoon,
        source_url=source_url
    )

    state = res.get("state")
    if state != "CANDIDATE":
        print(f"[SHEROFETCH] ✗ Resolver State: {state} — {res.get('reason')}")
        return {
            "status": "failed",
            "state": state,
            "query": query,
            "reason": res.get("reason")
        }

    print(f"[SHEROFETCH] Candidate located: '{res.get('title')}' by '{res.get('uploader')}'")
    print(f"[SHEROFETCH] ── Entering 5-Gate Verifier (4-Tier Acquisition) ──")

    ver = verify_and_acquire(
        resolver_result=res,
        output_dir=output_dir,
        preferred_format=preferred_format
    )

    ver_state = ver.get("state")
    if ver_state == "ACCEPTED":
        print("\n" + "─" * 60)
        print(f"  ✓ ACCEPTED: {ver.get('title')} — {ver.get('artist')}")
        print(f"  📂 File:   {ver.get('file_path')}")
        print(f"  🎯 Tier:   {ver.get('source_tier')} ({preferred_format.upper()})")
        print(f"  🖼 Cover:  {'Embedded' if ver.get('has_cover') else 'None'}")
        print(f"  📝 Lyrics: {'Synced (.lrc)' if ver.get('has_lyrics') else 'None'}")
        print(f"  🛡 Gates:  {', '.join(ver.get('gates_passed', []))}")
        print("─" * 60 + "\n")
        return {"status": "success", "data": ver}
    else:
        print(f"[SHEROFETCH] ✗ Verification Failed: {ver_state} — {ver.get('reason')}")
        return {"status": "failed", "state": ver_state, "reason": ver.get("reason"), "data": ver}


def download_playlist(
    playlist_url: str,
    output_dir: Path,
    preferred_format: str = "opus"
):
    """Download an entire YouTube playlist with progress tracking."""
    print(f"\n[SHEROFETCH] Fetching playlist metadata: {playlist_url}")
    cmd = ["yt-dlp", "--flat-playlist", "--dump-single-json", "--no-warnings", playlist_url]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if proc.returncode != 0:
            print(f"[SHEROFETCH] Error fetching playlist: {proc.stderr[:200]}")
            return
        data = json.loads(proc.stdout)
    except Exception as e:
        print(f"[SHEROFETCH] Playlist fetch error: {e}")
        return

    entries = data.get("entries", [])
    title = data.get("title", "Playlist")
    total = len(entries)
    print(f"[SHEROFETCH] Playlist '{title}': {total} tracks found.\n")

    accepted = 0
    quarantined = 0
    unresolved = 0

    for idx, entry in enumerate(entries, start=1):
        track_title = entry.get("title", "")
        track_url = entry.get("url") or entry.get("webpage_url") or f"https://www.youtube.com/watch?v={entry.get('id')}"
        uploader = entry.get("uploader", "")
        query = f"{track_title}"

        print(f"\n[{idx}/{total}] Processing: '{track_title}'")
        res = download_single(
            query=query,
            output_dir=output_dir,
            preferred_format=preferred_format,
            source_url=track_url
        )

        st = res.get("status")
        if st == "success":
            accepted += 1
        elif res.get("state") == "QUARANTINE":
            quarantined += 1
        else:
            unresolved += 1

    print("\n" + "=" * 60)
    print(f"  🏁 PLAYLIST COMPLETE: '{title}'")
    print(f"  Total: {total} | Accepted: {accepted} | Quarantined: {quarantined} | Unresolved: {unresolved}")
    print(f"  Output folder: {output_dir}")
    print("=" * 60 + "\n")


def main():
    parser = argparse.ArgumentParser(
        description="SheroFetch — Lossless 4-Tier Music Acquisition & Verification Engine",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""Examples:
  sherofetch "Avicii - Waiting For Love"
  sherofetch "https://www.youtube.com/watch?v=2vjPBrBU-TM"
  sherofetch --playlist "https://youtube.com/playlist?list=PLVKEMUjc4y4R6_OTans-PEc3ksEYU71ep"
  sherofetch --format flac "Drake - Passionfruit"
  sherofetch --config
  sherofetch --check
"""
    )
    parser.add_argument("query", nargs="?", default=None, help="Song query 'Artist - Title' or YouTube URL")
    parser.add_argument("--playlist", "-p", default=None, help="YouTube playlist URL")
    parser.add_argument("--format", "-f", choices=["opus", "flac", "mp3"], default=None, help="Preferred audio format")
    parser.add_argument("--output-dir", "-o", default=None, help="Destination directory for downloads")
    parser.add_argument("--cartoon", action="store_true", help="Use cartoon / anime broadcast theme engine")
    parser.add_argument("--config", action="store_true", help="Launch interactive credential & preference onboarding")
    parser.add_argument("--check", action="store_true", help="Diagnose system tools (ffmpeg, yt-dlp, fpcalc, soulseek)")
    parser.add_argument("--version", "-v", action="version", version=f"SheroFetch {VERSION}")

    args = parser.parse_args()

    # Diagnostic check
    if args.check:
        check_prerequisites(verbose=True)
        return

    # Configuration command
    if args.config:
        run_interactive_onboarding(force=True)
        return

    # First-run onboarding check
    if not is_configured():
        # Only run interactive onboarding if connected to a TTY terminal
        if sys.stdin.isatty():
            run_interactive_onboarding(force=False)
        else:
            # Running headless: create default config
            save_config(load_config())

    cfg = load_config()
    out_dir = Path(args.output_dir).expanduser() if args.output_dir else Path(cfg.get("download_dir"))
    fmt = args.format or cfg.get("preferred_format", "opus")

    # Playlist download
    if args.playlist:
        check_prerequisites(verbose=False)
        download_playlist(args.playlist, output_dir=out_dir, preferred_format=fmt)
        return

    # Single track or URL
    if args.query:
        # Check if query is a playlist URL
        if "playlist?list=" in args.query:
            check_prerequisites(verbose=False)
            download_playlist(args.query, output_dir=out_dir, preferred_format=fmt)
            return

        source_url = None
        query = args.query
        if query.startswith("http://") or query.startswith("https://"):
            source_url = query

        check_prerequisites(verbose=False)
        download_single(
            query=query,
            output_dir=out_dir,
            preferred_format=fmt,
            is_cartoon=args.cartoon,
            source_url=source_url
        )
        return

    # No arguments given
    parser.print_help()


if __name__ == "__main__":
    main()
