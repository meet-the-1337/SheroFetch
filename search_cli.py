#!/usr/bin/env python3
# SheroFetch — resolve and manage your music library
# Copyright (C) 2026 meet-the-1337
# Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0)
"""
Search CLI module for Tauri native desktop app candidate resolution.
Uses match_song engine with multi-mode ranking.
"""

import sys
import json
from match_song import match_song

def search_query(query: str):
    res = match_song(query)
    results = []
    
    for idx, item in enumerate(res.get("results", []), start=1):
        dur = item.get("duration") or 185.0
        mbid = item.get("mbid")
        results.append({
            "id": f"item-{idx}",
            "artist": item.get("artist", "Unknown Artist"),
            "title": item.get("track", item.get("title", "Unknown Title")),
            "album": item.get("release_type") or "Official Studio Album",
            "language": item.get("language", "en"),
            "mbid": mbid,
            "duration_sec": dur,
            "estimated_flac_mb": round(dur * 0.14, 1),
            "estimated_mp3_mb": round(dur * 0.04, 1),
            "estimated_wav_mb": round(dur * 0.16, 1),
            "confidence": item.get("confidence", 0.9),
            "cover_url": f"https://coverartarchive.org/release-group/{mbid}/front-250" if mbid else None,
            "resolved": True,
        })

    return {
        "query": query,
        "mode": res.get("mode", "ambiguous"),
        "total_count": len(results),
        "results": results,
    }

if __name__ == "__main__":
    q = sys.argv[1] if len(sys.argv) > 1 else "Radiohead - Creep"
    data = search_query(q)
    print(json.dumps(data))
