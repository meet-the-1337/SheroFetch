import re
import requests
from difflib import SequenceMatcher

def normalize_text(text: str) -> str:
    clean = re.sub(
        r"(?i)\b(remastered|remaster|official audio|official video|hd|lyrics|feat\.?|ft\.?)\b",
        "",
        text
    )
    return re.sub(r"\s+", " ", clean).strip()

def calculate_similarity(s1: str, s2: str) -> float:
    if not s1 or not s2:
        return 0.0
    return SequenceMatcher(None, s1.lower().strip(), s2.lower().strip()).ratio()

def detect_language(text: str) -> str:
    text_lower = text.lower()
    hindi_keywords = ["tum", "hi", "ho", "dil", "pyar", "zindagi", "mera", "meri", "aashiqui", "arijit", "mithoon"]
    spanish_keywords = ["despacito", "luis", "fonsi", "daddy", "yankee", "amor", "como", "senorita"]
    japanese_keywords = ["utada", "hikaru", "first love", "hatsukoi"]
    if any(k in text_lower for k in hindi_keywords) or any('\u0900' <= c <= '\u097F' for c in text):
        return "hi"
    elif any(k in text_lower for k in spanish_keywords):
        return "es"
    elif any(k in text_lower for k in japanese_keywords) or any('\u3040' <= c <= '\u30FF' or '\u4E00' <= c <= '\u9FFF' for c in text):
        return "ja"
    else:
        return "en"

def query_musicbrainz(query_str: str, limit: int = 100) -> list:
    url = "https://musicbrainz.org/ws/2/recording/"
    headers = {"User-Agent": "FlowStateApp/1.0 (contact@flowstate.app)"}
    for attempt in range(3):
        try:
            res = requests.get(url, params={"query": query_str, "fmt": "json", "limit": limit}, headers=headers, timeout=10)
            if res.status_code == 200:
                return res.json().get("recordings", [])
            elif res.status_code in (429, 503):
                import time
                time.sleep(1.0 * (attempt + 1))
        except Exception:
            import time
            time.sleep(0.5)
    return []

def analyze_releases(releases: list) -> dict:
    total_releases = len(releases)
    if total_releases == 0:
        return {
            "total_releases": 0,
            "has_official_studio_album": False,
            "has_single": False,
            "has_compilation": False,
            "has_live": False,
            "earliest_year": 9999,
            "official_album_count": 0,
            "compilation_count": 0,
            "release_type": "Other",
            "release_priority_score": 0.2,
            "popularity_score": 0.0
        }

    official_album_count = 0
    compilation_count = 0
    single_count = 0
    live_count = 0
    earliest_year = 9999

    for rel in releases:
        status = (rel.get("status") or "").lower()
        rg = rel.get("release-group") or {}
        ptype = (rg.get("primary-type") or "").lower()
        stypes = [s.lower() for s in (rg.get("secondary-types") or [])]
        date_str = rel.get("date") or ""

        if date_str:
            m = re.match(r"^(\d{4})", date_str)
            if m:
                yr = int(m.group(1))
                if 1900 <= yr <= 2030 and yr < earliest_year:
                    earliest_year = yr

        is_official = (status == "official")
        is_comp = ("compilation" in stypes) or ("compilation" in (rel.get("title") or "").lower())
        is_live = ("live" in stypes) or ("live" in (rel.get("title") or "").lower())

        if is_comp:
            compilation_count += 1
        if is_live:
            live_count += 1

        if is_official and not is_comp and not is_live:
            if ptype == "album":
                official_album_count += 1
            elif ptype == "single":
                single_count += 1
        elif ptype == "single" and not is_comp and not is_live:
            single_count += 1

    has_official_studio_album = (official_album_count > 0)
    has_single = (single_count > 0)
    has_compilation = (compilation_count > 0)
    has_live = (live_count > 0)

    # Release priority score:
    # official studio album = high (1.0)
    # single = medium (0.6)
    # compilation/cover/live = low (0.2)
    if has_official_studio_album:
        release_type = "Official Studio Album"
        release_priority_score = 1.0
    elif has_single and not has_live:
        release_type = "Single"
        release_priority_score = 0.6
    elif has_live:
        release_type = "Live"
        release_priority_score = 0.2
    elif has_compilation:
        release_type = "Compilation"
        release_priority_score = 0.2
    else:
        release_type = "Other"
        release_priority_score = 0.2

    # Popularity score proxy using MusicBrainz:
    # 1. Number of releases linked to recording
    # 2. Presence in official albums vs compilations
    rel_count_proxy = min(1.0, total_releases / 25.0)

    if official_album_count > 0:
        album_presence = 0.7 + 0.3 * (official_album_count / max(1, official_album_count + compilation_count))
    elif has_single:
        album_presence = 0.5
    elif compilation_count > 0:
        album_presence = 0.2
    else:
        album_presence = 0.1

    popularity_score = round(min(1.0, 0.65 * rel_count_proxy + 0.35 * album_presence), 3)

    return {
        "total_releases": total_releases,
        "has_official_studio_album": has_official_studio_album,
        "has_single": has_single,
        "has_compilation": has_compilation,
        "has_live": has_live,
        "earliest_year": earliest_year,
        "official_album_count": official_album_count,
        "compilation_count": compilation_count,
        "release_type": release_type,
        "release_priority_score": release_priority_score,
        "popularity_score": popularity_score
    }

def match_song(input_string: str) -> dict:
    """
    Checkpoint 3 Matching Logic — Prioritizes Original Songs Over Covers.
    
    Modes:
      1. Strict Mode (input contains 'artist - track'):
         Returns max 1 result. Enforces artist_similarity >= 0.70 AND title_similarity >= 0.90.
      2. Ambiguous Mode (input contains track only):
         Confidence Formula:
           confidence = (title_similarity * 0.5) + (artist_match_score * 0.2) + (popularity_score * 0.2) + (release_priority_score * 0.1)
    """
    clean_q = normalize_text(input_string)

    if " - " in clean_q:
        mode = "strict"
        art_req, trk_req = [p.strip() for p in clean_q.split(" - ", 1)]

        search_queries = [
            f'artist:"{art_req}" AND recording:"{trk_req}"',
            f'artist:{art_req.split()[-1].lower()} recording:{trk_req.split()[0].lower()}',
            f"{art_req} {trk_req}"
        ]

        strict_candidates = []

        for q_str in search_queries:
            recordings = query_musicbrainz(q_str, limit=100)
            if not recordings:
                continue

            for rec in recordings:
                title = rec.get("title", "")
                dis = (rec.get("disambiguation") or "").lower()
                is_alt = bool(re.search(r'\b(live|remix|versi[oó]n|acoustic|instrumental|karaoke|edit)\b', dis)) or bool(re.search(r'\b(live|remix|versi[oó]n|acoustic|instrumental|karaoke|edit)\b', title.lower()))
                artist_credits = rec.get("artist-credit", [])
                primary_artist = artist_credits[0].get("name", "") if artist_credits else ""
                mbid = rec.get("id")
                length_ms = rec.get("length")

                if not mbid or not length_ms:
                    continue

                duration = round(int(length_ms) / 1000.0, 1)
                if duration <= 0:
                    continue

                sim_a = calculate_similarity(art_req, primary_artist)
                sim_t = calculate_similarity(trk_req, title)

                # Strict mode criteria: artist_sim >= 0.70 and title_sim >= 0.90
                if sim_a >= 0.70 and sim_t >= 0.90:
                    conf = 1.0 if (sim_a >= 0.98 and sim_t >= 0.98) else round(sim_a * 0.5 + sim_t * 0.5, 2)
                    rel_info = analyze_releases(rec.get("releases", []))
                    strict_candidates.append({
                        "artist": primary_artist,
                        "track": title,
                        "title": title,
                        "mbid": mbid,
                        "duration": duration,
                        "confidence": conf,
                        "popularity_score": rel_info["popularity_score"],
                        "release_type": rel_info["release_type"],
                        "releases": rel_info["total_releases"],
                        "is_alt": is_alt
                    })

        best_candidate = None
        if strict_candidates:
            best_candidate = sorted(
                strict_candidates,
                key=lambda x: (not x["is_alt"], x["confidence"], x["popularity_score"], x["releases"]),
                reverse=True
            )[0]

        return {
            "mode": mode,
            "results": [best_candidate] if best_candidate else [],
            "artist": best_candidate["artist"] if best_candidate else None,
            "track": best_candidate["track"] if best_candidate else None,
            "title": best_candidate["title"] if best_candidate else None,
            "mbid": best_candidate["mbid"] if best_candidate else None,
            "duration": best_candidate["duration"] if best_candidate else 0.0,
            "confidence": best_candidate["confidence"] if best_candidate else 0.0,
            "popularity_score": best_candidate.get("popularity_score", 1.0) if best_candidate else 0.0,
            "release_type": best_candidate.get("release_type", "Official Studio Album") if best_candidate else None,
            "language": detect_language(clean_q)
        }

    else:
        mode = "ambiguous"
        trk_req = clean_q
        clean_term = re.sub(r'[\(\)\[\]\{\}\^\"~\*\?:\\/]', ' ', trk_req)
        clean_term = re.sub(r'\s+', ' ', clean_term).strip()

        # Query MusicBrainz: use word grouping for high recall without term dilution
        search_queries = [
            f'"{clean_term}"',
            f'recording:"{clean_term}"',
            f'recording:({clean_term})'
        ]

        recordings = []
        seen_mbids = set()

        for q_str in search_queries:
            batch = query_musicbrainz(q_str, limit=100)
            for r in batch:
                mid = r.get("id")
                if mid and mid not in seen_mbids:
                    seen_mbids.add(mid)
                    recordings.append(r)
            if len(recordings) >= 100:
                break

        if not recordings:
            recordings = query_musicbrainz(clean_term, limit=100)

        # 1. Parse raw candidates
        raw_candidates = []
        artist_stats = {}

        for rec in recordings:
            title = rec.get("title", "")
            artist_credits = rec.get("artist-credit", [])
            primary_artist = artist_credits[0].get("name", "") if artist_credits else ""
            mbid = rec.get("id")
            length_ms = rec.get("length")

            if not mbid or not primary_artist or not length_ms:
                continue

            duration = round(int(length_ms) / 1000.0, 1)
            if duration <= 0:
                continue

            sim_t = calculate_similarity(trk_req, title)
            if sim_t < 0.70:
                continue

            releases = rec.get("releases", [])
            rel_info = analyze_releases(releases)

            disambig = (rec.get("disambiguation") or "").lower()
            title_lower = title.lower()
            is_explicit_cover = (
                "cover" in disambig or "cover" in title_lower or 
                "tribute" in disambig or "tribute" in title_lower or 
                "karaoke" in disambig
            )
            is_remix = bool(
                re.search(r"(?i)\b(remix|versi[oó]n|salsa|acoustic|instrumental|karaoke|live|edit)\b", title_lower) or
                re.search(r"(?i)\b(remix|versi[oó]n|salsa|acoustic|instrumental|karaoke|live|edit)\b", disambig) or
                any(re.search(r"(?i)\b(remix|versi[oó]n|salsa|acoustic|instrumental|karaoke|live)\b", (r.get("title") or "")) for r in releases)
            )
            if is_explicit_cover:
                rel_info["release_type"] = "Cover"
                rel_info["release_priority_score"] = 0.2

            art_key = primary_artist.lower()
            if art_key not in artist_stats:
                artist_stats[art_key] = {
                    "artist": primary_artist,
                    "total_releases": 0,
                    "recordings_count": 0,
                    "earliest_year": 9999,
                    "has_official_studio_album": False,
                    "has_single": False
                }
            artist_stats[art_key]["total_releases"] += rel_info["total_releases"]
            artist_stats[art_key]["recordings_count"] += 1
            if rel_info["has_official_studio_album"]:
                artist_stats[art_key]["has_official_studio_album"] = True
            if rel_info["has_single"]:
                artist_stats[art_key]["has_single"] = True
            if rel_info["earliest_year"] < artist_stats[art_key]["earliest_year"]:
                artist_stats[art_key]["earliest_year"] = rel_info["earliest_year"]

            raw_candidates.append({
                "artist": primary_artist,
                "art_key": art_key,
                "title": title,
                "mbid": mbid,
                "duration": duration,
                "sim_t": sim_t,
                "rel_info": rel_info,
                "is_explicit_cover": is_explicit_cover,
                "is_remix": is_remix
            })

        if not raw_candidates:
            return {
                "mode": mode,
                "results": [],
                "artist": None,
                "title": None,
                "track": None,
                "mbid": None,
                "duration": 0.0,
                "confidence": 0.0,
                "popularity_score": 0.0,
                "release_type": None,
                "language": detect_language(clean_q)
            }

        # 2. Detect canonical artist & global presence
        # Directive: "prefer artist with highest global presence (more recordings/releases)"
        max_artist_releases = max((s["total_releases"] for s in artist_stats.values()), default=1)

        canonical_artist_key = None
        best_canonical_score = -1.0

        for art_key, stats in artist_stats.items():
            pres_score = stats["total_releases"] / max(1, max_artist_releases)
            album_score = 1.0 if stats["has_official_studio_album"] else (0.6 if stats["has_single"] else 0.2)
            c_score = (pres_score * 0.70) + (album_score * 0.30)
            if c_score > best_canonical_score:
                best_canonical_score = c_score
                canonical_artist_key = art_key

        canonical_earliest_year = artist_stats.get(canonical_artist_key, {}).get("earliest_year", 9999)

        # 3. Score each candidate using the exact confidence formula
        scored_candidates = []
        for cand in raw_candidates:
            art_key = cand["art_key"]
            sim_t = cand["sim_t"]
            rel_info = cand["rel_info"]
            popularity_score = rel_info["popularity_score"]
            release_priority_score = rel_info["release_priority_score"]
            release_type = rel_info["release_type"]

            # Artist match score:
            # Prefer artist with highest global presence (more recordings/releases)
            if art_key == canonical_artist_key:
                artist_match_score = 1.0
            else:
                art_releases = artist_stats[art_key]["total_releases"]
                artist_match_score = round(min(0.5, (art_releases / max(1, max_artist_releases)) * 0.5), 3)

            # Base formula:
            # confidence = (title_similarity * 0.5) + (artist_match_score * 0.2) + (popularity_score * 0.2) + (release_priority_score * 0.1)
            raw_conf = (
                (sim_t * 0.5) +
                (artist_match_score * 0.2) +
                (popularity_score * 0.2) +
                (release_priority_score * 0.1)
            )

            # Filtering rule: boost earliest official release (and non-remix)
            if art_key == canonical_artist_key and not cand.get("is_remix") and rel_info["earliest_year"] <= canonical_earliest_year:
                raw_conf += 0.05

            # Filtering rule: deprioritize remix / alternate versions for the canonical track
            if cand.get("is_remix"):
                raw_conf -= 0.15

            # Filtering rule: deprioritize cover artists if original artist exists
            if canonical_artist_key and art_key != canonical_artist_key:
                is_cover_artist = (
                    cand["is_explicit_cover"] or 
                    artist_stats[art_key]["earliest_year"] > canonical_earliest_year or
                    rel_info["total_releases"] < (max_artist_releases * 0.2)
                )
                if is_cover_artist:
                    raw_conf -= 0.15

            # In ambiguous mode, confidence is capped at 0.95 (never 1.0)
            final_conf = min(0.95, max(0.10, round(raw_conf, 2)))

            scored_candidates.append({
                "artist": cand["artist"],
                "track": cand["title"],
                "title": cand["title"],
                "mbid": cand["mbid"],
                "duration": cand["duration"],
                "confidence": final_conf,
                "popularity_score": popularity_score,
                "release_type": release_type,
                "releases": rel_info["total_releases"],
                "raw_conf": raw_conf
            })

        # 4. Sort and deduplicate by artist
        sorted_candidates = sorted(
            scored_candidates, 
            key=lambda x: (x["confidence"], x["popularity_score"], x["releases"]), 
            reverse=True
        )

        unique_cand = {}
        for c in sorted_candidates:
            key = c["artist"].lower()
            if key not in unique_cand:
                unique_cand[key] = {
                    "artist": c["artist"],
                    "track": c["track"],
                    "title": c["title"],
                    "mbid": c["mbid"],
                    "duration": c["duration"],
                    "confidence": c["confidence"],
                    "popularity_score": c["popularity_score"],
                    "release_type": c["release_type"]
                }

        top_results = list(unique_cand.values())[:5]
        return {
            "mode": mode,
            "results": top_results,
            "artist": top_results[0]["artist"] if top_results else None,
            "track": top_results[0]["track"] if top_results else None,
            "title": top_results[0]["title"] if top_results else None,
            "mbid": top_results[0]["mbid"] if top_results else None,
            "duration": top_results[0]["duration"] if top_results else 0.0,
            "confidence": top_results[0]["confidence"] if top_results else 0.0,
            "popularity_score": top_results[0]["popularity_score"] if top_results else 0.0,
            "release_type": top_results[0]["release_type"] if top_results else None,
            "language": detect_language(clean_q)
        }
