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
from checkpoint4_pipeline import process_song

def main():
    parser = argparse.ArgumentParser(description="Download music track with authoritative path hierarchy")
    parser.add_argument("query", type=str, help="Song search query")
    parser.add_argument("--base-dir", type=str, default=None, help="Base directory for music library")
    parser.add_argument("--index", type=int, default=0, help="Selection index for ambiguous mode")
    parser.add_argument("--override-album", type=str, default=None, help="Override album name for testing fallback")
    parser.add_argument("--format", type=str, default="mp3", choices=["mp3", "flac"], help="Preferred audio format: flac or mp3")
    args = parser.parse_args()

    res = process_song(
        input_query=args.query,
        selection_index=args.index,
        base_dir=args.base_dir,
        override_album=args.override_album,
        preferred_format=args.format
    )
    print(json.dumps(res, indent=2))

if __name__ == "__main__":
    main()
