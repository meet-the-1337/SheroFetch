#!/usr/bin/env python3
"""Runs one fetch in its own process, so the worker can read its progress line by line and stop it.

Prints the pipeline's own log lines, then one final line: @@RESULT <json>.
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["track", "playlist"], default="track")
    ap.add_argument("--query", required=True)
    ap.add_argument("--artist")
    ap.add_argument("--title")
    ap.add_argument("--url")
    ap.add_argument("--format", default="mp3", choices=["mp3", "flac", "opus"])
    ap.add_argument("--base-dir", required=True)
    a = ap.parse_args()

    if a.mode == "playlist":
        import playlist_resolver

        res = playlist_resolver.resolve_playlist(a.url or a.query)
    else:
        import checkpoint4_pipeline as pipeline

        res = pipeline.process_song(
            input_query=a.query,
            base_dir=a.base_dir,
            preferred_format=a.format,
            exact_url=a.url or None,
            exact_title=a.title or None,
            exact_artist=a.artist or None,
        )
    print("@@RESULT " + json.dumps(res, default=str), flush=True)


if __name__ == "__main__":
    main()
