#!/usr/bin/env python3
# SheroFetch — resolve and manage your music library
# Copyright (C) 2026 meet-the-1337
# Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0)
"""
CLI entry point for Tauri native desktop app integration.
Executes process_song and outputs structured JSON to stdout.
"""

import sys
import json
import argparse
from pathlib import Path

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

from checkpoint4_pipeline import process_song, audit_album_folder
from path_manager import DEFAULT_BASE_DIR

def main():
    parser = argparse.ArgumentParser(description="Download music track with authoritative path hierarchy")
    parser.add_argument("query", nargs="?", default=None, help="Song search query")
    parser.add_argument("--query", "-q", dest="query_flag", default=None, help="Song search query flag")
    parser.add_argument("--base-dir", type=str, default=None, help="Base directory for music library")
    parser.add_argument("--index", type=int, default=0, help="Selection index for ambiguous mode")
    parser.add_argument("--override-album", type=str, default=None, help="Override album name for testing fallback")
    parser.add_argument("--format", type=str, default="flac", choices=["mp3", "flac"], help="Preferred audio format: flac or mp3")
    parser.add_argument("--playlist-name", type=str, default=None, help="Playlist or bunch folder name in parent directory")
    parser.add_argument("--code", type=str, default=None, help="Unique track code (e.g. #SP-02Hy, #YT-dQw4)")
    parser.add_argument("--exact-title", type=str, default=None, help="Exact track title to lock down")
    parser.add_argument("--exact-artist", type=str, default=None, help="Exact track artist to lock down")
    parser.add_argument("--exact-url", type=str, default=None, help="Direct source URL or video URL")
    parser.add_argument("--expected-duration", type=float, default=None, help="Expected duration in seconds")
    parser.add_argument("--acq-mode", type=str, default=None, help="Acquisition mode: hybrid, strict_lossless, instant_studio")
    parser.add_argument("--upgrade-mode", action="store_true", help="Upgrade mode: re-attempt higher tier download and replace if superior")
    parser.add_argument("--audit", type=str, default=None, help="Audit a specific album/playlist folder and generate reports")
    parser.add_argument("--audit-all", action="store_true", help="Audit all album and playlist folders in library")
    args = parser.parse_args()

    # On-demand Album / Library Audit
    if args.audit:
        target_folder = Path(args.audit)
        if not target_folder.is_absolute():
            base = Path(args.base_dir) if args.base_dir else DEFAULT_BASE_DIR
            target_folder = base / args.audit
        res = audit_album_folder(target_folder, auto_repair=True, write_reports=True)
        print(json.dumps(res, indent=2))
        return

    if args.audit_all:
        base = Path(args.base_dir) if args.base_dir else DEFAULT_BASE_DIR
        results = []
        if base.exists() and base.is_dir():
            for child in sorted(base.iterdir()):
                if child.is_dir() and not child.name.startswith("."):
                    audit_res = audit_album_folder(child, auto_repair=True, write_reports=True)
                    results.append({
                        "folder": child.name,
                        "path": str(child),
                        "summary": audit_res.get("summary", {})
                    })
        print(json.dumps({"status": "success", "audited_folders": len(results), "folders": results}, indent=2))
        return

    actual_query = args.query_flag or args.query
    if not actual_query:
        parser.error("A search query, URL, or --audit flag must be provided.")

    force_sockseek_fail = (args.acq_mode == "instant_studio")

    res = process_song(
        input_query=actual_query,
        selection_index=args.index,
        base_dir=args.base_dir,
        override_album=args.override_album,
        preferred_format=args.format,
        playlist_name=args.playlist_name,
        code=args.code,
        exact_title=args.exact_title,
        exact_artist=args.exact_artist,
        exact_url=args.exact_url,
        expected_duration=args.expected_duration,
        force_sockseek_fail=force_sockseek_fail,
        upgrade_mode=args.upgrade_mode
    )
    print(json.dumps(res, indent=2))

if __name__ == "__main__":
    main()
