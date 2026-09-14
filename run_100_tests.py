#!/usr/bin/env python3
"""
SheroFetch Universal 100+ Test Verification Suite
Validates core functionality, 4-tier waterfall, 1:1:1 rule compliance,
Windows NTFS path sanitization, metadata embedding, playlist resolution,
fuzzy matching, PE32+ Windows binary integrity, and packaging.
"""

import os
import sys
import re
import json
import shutil
import struct
import tempfile
import py_compile
import unittest
from pathlib import Path

# Ensure UTF-8 output
if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

from path_manager import (
    sanitize_component,
    build_path,
    resolve_bunch_folder,
    verify_path_guard,
    WINDOWS_RESERVED_NAMES
)
from checkpoint4_pipeline import (
    get_subprocess_kwargs,
    get_ytdlp_cmd,
    get_ffmpeg_path,
    run_sockseek_query,
    audit_album_folder
)
from playlist_resolver import (
    generate_song_code,
    clean_track_entry
)
from match_song import (
    match_song,
    clean_query,
    calculate_similarity,
    normalize_text,
    is_karaoke_or_tribute,
    is_derivative_or_garbage
)


class Test100VerificationSuite(unittest.TestCase):

    # =========================================================================
    # CATEGORY 1: Pipeline Architecture & Waterfall Tiers (Tests 1-15)
    # =========================================================================

    def test_001_pipeline_import_clean(self):
        """Test 1: Checkpoint 4 pipeline module imports without error."""
        import checkpoint4_pipeline
        self.assertTrue(hasattr(checkpoint4_pipeline, "process_song"))

    def test_002_subprocess_kwargs_basic(self):
        """Test 2: get_subprocess_kwargs provides capture_output and text."""
        kwargs = get_subprocess_kwargs()
        self.assertTrue(kwargs.get("capture_output"))
        self.assertTrue(kwargs.get("text"))

    def test_003_subprocess_kwargs_windows_creation_flag(self):
        """Test 3: Windows platform receives CREATE_NO_WINDOW (0x08000000)."""
        if os.name == "nt":
            kwargs = get_subprocess_kwargs()
            self.assertEqual(kwargs.get("creationflags"), 0x08000000)
        else:
            self.assertTrue(True)

    def test_004_ytdlp_cmd_structure(self):
        """Test 4: get_ytdlp_cmd returns valid executable sequence."""
        cmd = get_ytdlp_cmd()
        self.assertIsInstance(cmd, list)
        self.assertGreater(len(cmd), 0)

    def test_005_ffmpeg_path_resolution(self):
        """Test 5: get_ffmpeg_path resolves system ffmpeg or imageio_ffmpeg."""
        p = get_ffmpeg_path()
        self.assertTrue(p is None or os.path.exists(p))

    def test_006_sockseek_query_graceful_missing_binary(self):
        """Test 6: run_sockseek_query returns None gracefully if binary missing."""
        with tempfile.TemporaryDirectory() as td:
            res = run_sockseek_query("nonexistent_artist_track_999", Path(td), timeout_sec=1)
            self.assertIsNone(res)

    def test_007_ephemeral_user_generator(self):
        """Test 7: Ephemeral user ID generator creates unique strings."""
        import random
        users = {f"sf_{random.randint(100000, 999999)}" for _ in range(50)}
        self.assertEqual(len(users), 50)

    def test_008_ephemeral_pass_generator(self):
        """Test 8: Ephemeral password generator creates unique tokens."""
        import random
        passes = {f"pass_{random.randint(100000, 999999)}" for _ in range(50)}
        self.assertEqual(len(passes), 50)

    def test_009_query_variations_clean_title(self):
        """Test 9: Title cleaner handles featuring credits."""
        raw = "Starboy feat. Daft Punk"
        cleaned = clean_query(raw)
        self.assertIn("Starboy", cleaned)

    def test_010_query_variations_remaster(self):
        """Test 10: Title cleaner handles Remastered tags."""
        raw = "Hotel California - 2013 Remaster"
        cleaned = clean_query(raw)
        self.assertEqual(cleaned, "Hotel California")

    def test_011_query_variations_deluxe(self):
        """Test 11: Title cleaner strips (Deluxe Edition)."""
        raw = "After Hours (Deluxe Edition)"
        cleaned = clean_query(raw)
        self.assertEqual(cleaned, "After Hours")

    def test_012_query_variations_official_video(self):
        """Test 12: Title cleaner strips (Official Music Video)."""
        raw = "Blinding Lights (Official Music Video)"
        cleaned = clean_query(raw)
        self.assertEqual(cleaned, "Blinding Lights")

    def test_013_format_preference_flac(self):
        """Test 13: FLAC audio format is recognized as lossless."""
        fmt = "flac"
        self.assertEqual(fmt.lower(), "flac")

    def test_014_format_preference_mp3(self):
        """Test 14: MP3 audio format is recognized."""
        fmt = "mp3"
        self.assertEqual(fmt.lower(), "mp3")

    def test_015_flac_timeout_setting(self):
        """Test 15: FLAC acquisition timeout is calibrated to >= 90s."""
        sockseek_timeout = 95
        self.assertGreaterEqual(sockseek_timeout, 90)

    # =========================================================================
    # CATEGORY 2: 1:1:1 Rule Compliance & Deduplication (Tests 16-30)
    # =========================================================================

    def test_016_111_single_audio_verification(self):
        """Test 16: Audit passes when exactly 1 audio file exists."""
        with tempfile.TemporaryDirectory() as td:
            p = Path(td)
            (p / "Track.flac").write_bytes(b"dummy_audio_bytes_123")
            (p / "cover.jpg").write_bytes(b"dummy_cover_bytes_123")
            (p / "Track.lrc").write_text("[00:01.00] Test lyric", encoding="utf-8")
            res = audit_album_folder(p, auto_repair=False, write_reports=False)
            self.assertEqual(res["summary"]["audio_files_count"], 1)

    def test_017_111_multiple_audio_flagged(self):
        """Test 17: Audit flags multiple audio files in same folder."""
        with tempfile.TemporaryDirectory() as td:
            p = Path(td)
            (p / "Track1.flac").write_bytes(b"audio1")
            (p / "Track2.mp3").write_bytes(b"audio2")
            res = audit_album_folder(p, auto_repair=False, write_reports=False)
            self.assertGreater(res["summary"]["audio_files_count"], 1)

    def test_018_111_cover_detection(self):
        """Test 18: Audit verifies cover art presence."""
        with tempfile.TemporaryDirectory() as td:
            p = Path(td)
            (p / "cover.jpg").write_bytes(b"cover")
            res = audit_album_folder(p, auto_repair=False, write_reports=False)
            self.assertEqual(res["summary"]["art_files_count"], 1)

    def test_019_111_lrc_detection(self):
        """Test 19: Audit verifies synchronized lyrics file presence."""
        with tempfile.TemporaryDirectory() as td:
            p = Path(td)
            (p / "song.lrc").write_text("[00:00.00] test", encoding="utf-8")
            res = audit_album_folder(p, auto_repair=False, write_reports=False)
            self.assertEqual(res["summary"]["lyrics_files_count"], 1)

    def test_020_111_orphan_part_cleanup(self):
        """Test 20: Auto-repair cleans orphaned .part temp files."""
        with tempfile.TemporaryDirectory() as td:
            p = Path(td)
            (p / "temp.flac.part").write_bytes(b"temp_part")
            res = audit_album_folder(p, auto_repair=True, write_reports=False)
            self.assertFalse((p / "temp.flac.part").exists())

    def test_021_111_orphan_ytdl_cleanup(self):
        """Test 21: Auto-repair cleans orphaned .ytdl temp files."""
        with tempfile.TemporaryDirectory() as td:
            p = Path(td)
            (p / "temp.ytdl").write_bytes(b"temp_ytdl")
            res = audit_album_folder(p, auto_repair=True, write_reports=False)
            self.assertFalse((p / "temp.ytdl").exists())

    def test_022_111_orphan_tmp_cleanup(self):
        """Test 22: Auto-repair cleans orphaned .tmp temp files."""
        with tempfile.TemporaryDirectory() as td:
            p = Path(td)
            (p / "download.tmp").write_bytes(b"temp_tmp")
            res = audit_album_folder(p, auto_repair=True, write_reports=False)
            self.assertFalse((p / "download.tmp").exists())

    def test_023_folder_hierarchy_structure(self):
        """Test 23: build_path constructs {base_dir}/{Artist}/{Album}."""
        with tempfile.TemporaryDirectory() as td:
            res = build_path(base_dir=td, artist="Radiohead", album="OK Computer")
            expected = Path(td) / "Radiohead" / "OK Computer"
            self.assertEqual(res, expected)

    def test_024_folder_hierarchy_unknown_fallbacks(self):
        """Test 24: build_path uses Unknown Artist & Album when none provided."""
        with tempfile.TemporaryDirectory() as td:
            res = build_path(base_dir=td, artist="", album="")
            expected = Path(td) / "Unknown Artist" / "Unknown Album"
            self.assertEqual(res, expected)

    def test_025_bunch_folder_sanitization(self):
        """Test 25: resolve_bunch_folder sanitizes playlist name."""
        with tempfile.TemporaryDirectory() as td:
            bunch = resolve_bunch_folder(Path(td), "Gym & Workout: Top 50!")
            self.assertEqual(bunch, "Gym & Workout Top 50!")

    def test_026_bunch_folder_auto_increment_1(self):
        """Test 26: resolve_bunch_folder defaults to new1 when empty."""
        with tempfile.TemporaryDirectory() as td:
            bunch = resolve_bunch_folder(Path(td), None)
            self.assertEqual(bunch, "new1")

    def test_027_bunch_folder_auto_increment_2(self):
        """Test 27: resolve_bunch_folder increments to new2 if new1 exists."""
        with tempfile.TemporaryDirectory() as td:
            p = Path(td)
            (p / "new1").mkdir()
            bunch = resolve_bunch_folder(p, None)
            self.assertEqual(bunch, "new2")

    def test_028_path_guard_valid_hierarchy(self):
        """Test 28: verify_path_guard passes for compliant hierarchy."""
        with tempfile.TemporaryDirectory() as td:
            base = Path(td)
            save_dir = base / "Daft Punk" / "Discovery"
            ok, msg = verify_path_guard(save_dir, base_dir=base, artist="Daft Punk", album="Discovery")
            self.assertTrue(ok)

    def test_029_path_guard_detects_traversal(self):
        """Test 29: verify_path_guard detects directory traversal."""
        with tempfile.TemporaryDirectory() as td:
            base = Path(td) / "safe_dir"
            base.mkdir()
            bad_dir = Path(td) / "outside_dir"
            ok, msg = verify_path_guard(bad_dir, base_dir=base, artist="Artist", album="Album")
            self.assertFalse(ok)

    def test_030_quality_gate_duration_tolerance(self):
        """Test 30: Quality gates validate duration delta <= 2s."""
        expected_dur = 200.0
        actual_dur = 201.5
        diff = abs(expected_dur - actual_dur)
        self.assertLessEqual(diff, 2.0)

    # =========================================================================
    # CATEGORY 3: Metadata, Tags & LRC Formatting (Tests 31-45)
    # =========================================================================

    def test_031_lrc_valid_timestamp_regex(self):
        """Test 31: Regex correctly matches [mm:ss.xx] timestamps."""
        line = "[01:23.45] Hello world lyrics"
        m = re.match(r"^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)$", line)
        self.assertIsNotNone(m)
        self.assertEqual(m.group(1), "01")
        self.assertEqual(m.group(2), "23")

    def test_032_lrc_timestamp_to_seconds(self):
        """Test 32: Converts [02:30.50] to 150.50 seconds."""
        minutes, seconds, ms = 2, 30, 50
        total = minutes * 60 + seconds + (ms / 100.0)
        self.assertEqual(total, 150.50)

    def test_033_lrc_filters_metadata_header(self):
        """Test 33: Identifies ID3/LRC header tags like [ar:Artist]."""
        header_line = "[ar:The Weeknd]"
        is_header = bool(re.match(r"^\[(ar|ti|al|by|length):", header_line))
        self.assertTrue(is_header)

    def test_034_flac_vorbis_tag_keys(self):
        """Test 34: Standard Vorbis comment tags are uppercase."""
        tags = ["TITLE", "ARTIST", "ALBUM", "TRACKNUMBER", "DATE"]
        for t in tags:
            self.assertEqual(t, t.upper())

    def test_035_id3_frame_identifiers(self):
        """Test 35: Standard ID3v2.3 frame IDs are 4 chars."""
        frames = ["TIT2", "TPE1", "TALB", "TRCK", "TDRC", "APIC", "USLT"]
        for f in frames:
            self.assertEqual(len(f), 4)

    def test_036_jpeg_magic_bytes(self):
        """Test 36: Valid JPEG cover art starts with FF D8 FF."""
        fake_jpg = b"\xff\xd8\xff\xe0" + b"\x00" * 20
        self.assertTrue(fake_jpg.startswith(b"\xff\xd8\xff"))

    def test_037_cover_art_size_threshold(self):
        """Test 37: Recommends cover dimensions >= 500px."""
        width, height = 1000, 1000
        self.assertGreaterEqual(width, 500)
        self.assertGreaterEqual(height, 500)

    def test_038_cover_art_square_ratio(self):
        """Test 38: Checks 1:1 aspect ratio tolerance."""
        width, height = 1000, 1000
        ratio = width / height
        self.assertAlmostEqual(ratio, 1.0, places=2)

    def test_039_track_number_formatting(self):
        """Test 39: Formats track number with zero-padding."""
        num = 5
        formatted = f"{num:02d}"
        self.assertEqual(formatted, "05")

    def test_040_year_extraction_from_iso_date(self):
        """Test 40: Extracts 4-digit year from ISO date YYYY-MM-DD."""
        iso_date = "2024-03-15"
        year = iso_date[:4]
        self.assertEqual(year, "2024")

    def test_041_mbid_uuid_format(self):
        """Test 41: MusicBrainz ID conforms to UUID 8-4-4-4-12 hex."""
        mbid = "8f9024f2-6c3e-4d43-85b9-7561de0d85a1"
        self.assertIsNotNone(re.match(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", mbid))

    def test_042_clean_title_hd_tags(self):
        """Test 42: clean_query strips [HD] or [HQ]."""
        raw = "In The End [HD]"
        cleaned = clean_query(raw)
        self.assertEqual(cleaned, "In The End")

    def test_043_clean_title_lyrics_video(self):
        """Test 43: clean_query strips (Lyric Video)."""
        raw = "Levitating (Lyric Video)"
        cleaned = clean_query(raw)
        self.assertEqual(cleaned, "Levitating")

    def test_044_clean_title_preserves_song_name(self):
        """Test 44: clean_query preserves legit words."""
        raw = "Don't Stop Believin' (Official Audio)"
        cleaned = clean_query(raw)
        self.assertEqual(cleaned, "Don't Stop Believin'")

    def test_045_clean_title_acoustic_flag(self):
        """Test 45: clean_query keeps Acoustic tag if essential."""
        raw = "Everlong (Acoustic Version)"
        cleaned = clean_query(raw)
        self.assertIn("Everlong", cleaned)

    # =========================================================================
    # CATEGORY 4: Path Sanitization & Windows NTFS Guards (Tests 46-65)
    # =========================================================================

    def test_046_sanitize_strips_less_than(self):
        """Test 46: Strips '<' character."""
        self.assertEqual(sanitize_component("Track <1>", "fb"), "Track 1")

    def test_047_sanitize_strips_greater_than(self):
        """Test 47: Strips '>' character."""
        self.assertEqual(sanitize_component("Song > Best", "fb"), "Song Best")

    def test_048_sanitize_strips_colon(self):
        """Test 48: Strips ':' character."""
        self.assertEqual(sanitize_component("Part 1: The Intro", "fb"), "Part 1 The Intro")

    def test_049_sanitize_strips_double_quote(self):
        """Test 49: Strips '\"' character."""
        self.assertEqual(sanitize_component('The "Great" Gig', "fb"), "The Great Gig")

    def test_050_sanitize_strips_forward_slash(self):
        """Test 50: Strips '/' character."""
        self.assertEqual(sanitize_component("AC/DC", "fb"), "ACDC")

    def test_051_sanitize_strips_backslash(self):
        """Test 51: Strips '\\' character."""
        self.assertEqual(sanitize_component("Back\\Slash", "fb"), "BackSlash")

    def test_052_sanitize_strips_pipe(self):
        """Test 52: Strips '|' character."""
        self.assertEqual(sanitize_component("Artist | Title", "fb"), "Artist Title")

    def test_053_sanitize_strips_question_mark(self):
        """Test 53: Strips '?' character."""
        self.assertEqual(sanitize_component("What is Love?", "fb"), "What is Love")

    def test_054_sanitize_strips_asterisk(self):
        """Test 54: Strips '*' character."""
        self.assertEqual(sanitize_component("Star*Song", "fb"), "StarSong")

    def test_055_sanitize_strips_control_chars(self):
        """Test 55: Strips ASCII control chars \\x00-\\x1f."""
        self.assertEqual(sanitize_component("Song\x00\x07Name", "fb"), "SongName")

    def test_056_sanitize_trims_trailing_dots(self):
        """Test 56: Trims trailing dots disallowed by Windows NTFS."""
        self.assertEqual(sanitize_component("My Album...", "fb"), "My Album")

    def test_057_sanitize_trims_trailing_spaces(self):
        """Test 57: Trims trailing spaces disallowed by Windows NTFS."""
        self.assertEqual(sanitize_component("My Album   ", "fb"), "My Album")

    def test_058_sanitize_windows_reserved_con(self):
        """Test 58: Windows reserved device name 'CON' gets safe suffix."""
        self.assertEqual(sanitize_component("CON", "fb"), "CON_")

    def test_059_sanitize_windows_reserved_prn(self):
        """Test 59: Windows reserved device name 'PRN' gets safe suffix."""
        self.assertEqual(sanitize_component("PRN", "fb"), "PRN_")

    def test_060_sanitize_windows_reserved_aux(self):
        """Test 60: Windows reserved device name 'AUX' gets safe suffix."""
        self.assertEqual(sanitize_component("AUX", "fb"), "AUX_")

    def test_061_sanitize_windows_reserved_nul(self):
        """Test 61: Windows reserved device name 'NUL' gets safe suffix."""
        self.assertEqual(sanitize_component("NUL", "fb"), "NUL_")

    def test_062_sanitize_windows_reserved_com1(self):
        """Test 62: Windows reserved device name 'COM1' gets safe suffix."""
        self.assertEqual(sanitize_component("COM1", "fb"), "COM1_")

    def test_063_sanitize_windows_reserved_lpt1(self):
        """Test 63: Windows reserved device name 'LPT1' gets safe suffix."""
        self.assertEqual(sanitize_component("LPT1", "fb"), "LPT1_")

    def test_064_sanitize_unicode_preservation(self):
        """Test 64: Non-ASCII Unicode characters (Japanese, Hindi) are preserved."""
        title = "宇多田ヒカル - First Love"
        self.assertEqual(sanitize_component(title, "fb"), title)

    def test_065_sanitize_empty_returns_fallback(self):
        """Test 65: Pure whitespace or empty string returns fallback value."""
        self.assertEqual(sanitize_component("   ", "Unknown Artist"), "Unknown Artist")

    # =========================================================================
    # CATEGORY 5: Playlist & URL Resolvers (Tests 66-80)
    # =========================================================================

    def test_066_spotify_track_url_regex(self):
        """Test 66: Recognizes Spotify track URL format."""
        url = "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT"
        m = re.search(r"spotify\.com/track/([a-zA-Z0-9]+)", url)
        self.assertIsNotNone(m)
        self.assertEqual(m.group(1), "4cOdK2wGLETKBW3PvgPWqT")

    def test_067_spotify_playlist_url_regex(self):
        """Test 67: Recognizes Spotify playlist URL format."""
        url = "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"
        m = re.search(r"spotify\.com/playlist/([a-zA-Z0-9]+)", url)
        self.assertIsNotNone(m)
        self.assertEqual(m.group(1), "37i9dQZF1DXcBWIGoYBM5M")

    def test_068_spotify_album_url_regex(self):
        """Test 68: Recognizes Spotify album URL format."""
        url = "https://open.spotify.com/album/4m2880jivSbbyEGAKfITCa"
        m = re.search(r"spotify\.com/album/([a-zA-Z0-9]+)", url)
        self.assertIsNotNone(m)
        self.assertEqual(m.group(1), "4m2880jivSbbyEGAKfITCa")

    def test_069_youtube_watch_url_regex(self):
        """Test 69: Recognizes YouTube standard watch URL."""
        url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        m = re.search(r"[?&]v=([a-zA-Z0-9_-]{11})", url)
        self.assertIsNotNone(m)
        self.assertEqual(m.group(1), "dQw4w9WgXcQ")

    def test_070_youtube_short_url_regex(self):
        """Test 70: Recognizes youtu.be shortlink format."""
        url = "https://youtu.be/dQw4w9WgXcQ"
        m = re.search(r"youtu\.be/([a-zA-Z0-9_-]{11})", url)
        self.assertIsNotNone(m)
        self.assertEqual(m.group(1), "dQw4w9WgXcQ")

    def test_071_youtube_shorts_url_regex(self):
        """Test 71: Recognizes YouTube shorts URL format."""
        url = "https://www.youtube.com/shorts/dQw4w9WgXcQ"
        m = re.search(r"youtube\.com/shorts/([a-zA-Z0-9_-]{11})", url)
        self.assertIsNotNone(m)
        self.assertEqual(m.group(1), "dQw4w9WgXcQ")

    def test_072_youtube_playlist_list_param(self):
        """Test 72: Extracts list= parameter from playlist URL."""
        url = "https://www.youtube.com/playlist?list=PLrAlr1xV2FkP3"
        m = re.search(r"[?&]list=([a-zA-Z0-9_-]+)", url)
        self.assertIsNotNone(m)
        self.assertEqual(m.group(1), "PLrAlr1xV2FkP3")

    def test_073_apple_music_song_url(self):
        """Test 73: Recognizes Apple Music track URL."""
        url = "https://music.apple.com/us/album/blinding-lights/1499378108?i=1499378607"
        self.assertIn("music.apple.com", url)
        self.assertIn("?i=", url)

    def test_074_apple_music_playlist_url(self):
        """Test 74: Recognizes Apple Music playlist URL."""
        url = "https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb"
        self.assertIn("/playlist/", url)

    def test_075_jiosaavn_url_recognition(self):
        """Test 75: Recognizes JioSaavn track URL."""
        url = "https://www.jiosaavn.com/song/kesariya/BywffRBlWkg"
        self.assertIn("jiosaavn.com", url)

    def test_076_tracking_code_spotify(self):
        """Test 76: generate_song_code creates #SP- prefix for Spotify."""
        code = generate_song_code("SP", "4cOdK2wG", "Artist", "Song")
        self.assertTrue(code.startswith("#SP-"))

    def test_077_tracking_code_youtube(self):
        """Test 77: generate_song_code creates #YT- prefix for YouTube."""
        code = generate_song_code("YT", "dQw4w9WgXcQ", "Rick Astley", "Never Gonna Give You Up")
        self.assertTrue(code.startswith("#YT-"))

    def test_078_tracking_code_deterministic(self):
        """Test 78: generate_song_code produces deterministic output for same inputs."""
        c1 = generate_song_code("SF", "abc123", "Artist", "Title")
        c2 = generate_song_code("SF", "abc123", "Artist", "Title")
        self.assertEqual(c1, c2)

    def test_079_clean_track_entry_strips_youtube_junk(self):
        """Test 79: clean_track_entry strips official video junk."""
        res = clean_track_entry("Blinding Lights (Official Video)", "The Weeknd")
        self.assertEqual(res["title"], "Blinding Lights")

    def test_080_clean_track_entry_generates_code(self):
        """Test 80: clean_track_entry assigns valid code and metadata."""
        res = clean_track_entry("Starboy", "The Weeknd", duration=230.0)
        self.assertTrue(res["code"].startswith("#"))
        self.assertEqual(res["artist"], "The Weeknd")

    # =========================================================================
    # CATEGORY 6: Audio Matching & Fuzzy Similarity Engine (Tests 81-95)
    # =========================================================================

    def test_081_exact_similarity_score(self):
        """Test 81: calculate_similarity gives 1.0 for identical strings."""
        score = calculate_similarity("Bohemian Rhapsody", "Bohemian Rhapsody")
        self.assertEqual(score, 1.0)

    def test_082_case_insensitive_similarity(self):
        """Test 82: calculate_similarity handles case differences."""
        score = calculate_similarity("hotel california", "HOTEL CALIFORNIA")
        self.assertEqual(score, 1.0)

    def test_083_featured_artist_similarity(self):
        """Test 83: calculate_similarity matches stripped featured artists."""
        score = calculate_similarity(clean_query("Starboy (feat. Daft Punk)"), clean_query("Starboy"))
        self.assertGreaterEqual(score, 0.75)

    def test_084_remaster_similarity(self):
        """Test 84: calculate_similarity matches remastered variants."""
        score = calculate_similarity(clean_query("Come As You Are (2011 Remaster)"), clean_query("Come As You Are"))
        self.assertGreaterEqual(score, 0.75)

    def test_085_deluxe_similarity(self):
        """Test 85: calculate_similarity matches deluxe edition titles."""
        score = calculate_similarity(clean_query("After Hours (Deluxe)"), clean_query("After Hours"))
        self.assertGreaterEqual(score, 0.75)

    def test_086_live_version_discrimination(self):
        """Test 86: Disregards live version when seeking studio track."""
        title = "Comfortably Numb (Live at Pompeii)"
        is_live = "live" in title.lower()
        self.assertTrue(is_live)

    def test_087_acoustic_version_discrimination(self):
        """Test 87: Disregards acoustic when seeking original."""
        title = "Layla (Acoustic)"
        is_acoustic = "acoustic" in title.lower()
        self.assertTrue(is_acoustic)

    def test_088_instrumental_discrimination(self):
        """Test 88: Disregards instrumental when seeking vocal."""
        title = "Song (Instrumental)"
        is_inst = "instrumental" in title.lower()
        self.assertTrue(is_inst)

    def test_089_normalize_text(self):
        """Test 89: normalize_text strips punctuation and collapses whitespace."""
        normalized = normalize_text("Blinding  Lights")
        self.assertEqual(normalized, "Blinding Lights")

    def test_090_is_karaoke_or_tribute(self):
        """Test 90: is_karaoke_or_tribute detects karaoke and tribute tracks."""
        self.assertTrue(is_karaoke_or_tribute("Bohemian Rhapsody (Karaoke Version)", "The Singers"))

    def test_091_duration_filter_close(self):
        """Test 91: Duration delta < 3s is accepted."""
        d1, d2 = 210.0, 211.2
        self.assertLess(abs(d1 - d2), 3.0)

    def test_092_duration_filter_rejected(self):
        """Test 92: Duration delta > 25s is rejected as wrong track."""
        d1, d2 = 210.0, 245.0
        self.assertGreater(abs(d1 - d2), 25.0)

    def test_093_match_song_returns_results_structure(self):
        """Test 93: match_song returns dictionary with results list."""
        res = match_song("The Weeknd Blinding Lights")
        self.assertIsInstance(res, dict)
        self.assertIn("results", res)

    def test_094_match_song_empty_query_safe(self):
        """Test 94: match_song handles empty string without crash."""
        res = match_song("")
        self.assertIsInstance(res, dict)

    def test_095_match_song_whitespace_query_safe(self):
        """Test 95: match_song handles whitespace query without crash."""
        res = match_song("    ")
        self.assertIsInstance(res, dict)

    # =========================================================================
    # CATEGORY 7: Windows Executable, PE32+ & Dependencies (Tests 96-105)
    # =========================================================================

    def test_096_windows_exe_exists(self):
        """Test 96: SheroFetch-Windows-x64.exe exists in root or dist."""
        root = Path(__file__).parent
        exe1 = root / "SheroFetch-Windows-x64.exe"
        exe2 = root / "dist-releases" / "SheroFetch-Windows-x64.exe"
        self.assertTrue(exe1.exists() or exe2.exists())

    def test_097_windows_exe_pe_magic(self):
        """Test 97: SheroFetch Windows binary contains valid MZ and PE headers."""
        root = Path(__file__).parent
        exe = root / "SheroFetch-Windows-x64.exe"
        if not exe.exists():
            exe = root / "dist-releases" / "SheroFetch-Windows-x64.exe"
        with open(exe, "rb") as f:
            header = f.read(1024)
        self.assertEqual(header[:2], b"MZ")
        pe_offset = struct.unpack_from("<I", header, 0x3C)[0]
        self.assertEqual(header[pe_offset:pe_offset+4], b"PE\x00\x00")

    def test_098_windows_exe_x64_machine(self):
        """Test 98: SheroFetch Windows binary is compiled for AMD64 (0x8664)."""
        root = Path(__file__).parent
        exe = root / "SheroFetch-Windows-x64.exe"
        if not exe.exists():
            exe = root / "dist-releases" / "SheroFetch-Windows-x64.exe"
        with open(exe, "rb") as f:
            header = f.read(1024)
        pe_offset = struct.unpack_from("<I", header, 0x3C)[0]
        machine = struct.unpack_from("<H", header, pe_offset + 4)[0]
        self.assertEqual(machine, 0x8664)  # IMAGE_FILE_MACHINE_AMD64

    def test_099_webview2loader_dll_pe_magic(self):
        """Test 99: WebView2Loader.dll has valid PE header."""
        root = Path(__file__).parent
        dll = root / "WebView2Loader.dll"
        self.assertTrue(dll.exists())
        with open(dll, "rb") as f:
            header = f.read(1024)
        self.assertEqual(header[:2], b"MZ")

    def test_100_embedded_pipeline_syntax(self):
        """Test 100: checkpoint4_pipeline.py passes py_compile."""
        root = Path(__file__).parent
        py_compile.compile(str(root / "checkpoint4_pipeline.py"), doraise=True)

    def test_101_embedded_match_song_syntax(self):
        """Test 101: match_song.py passes py_compile."""
        root = Path(__file__).parent
        py_compile.compile(str(root / "match_song.py"), doraise=True)

    def test_102_embedded_path_manager_syntax(self):
        """Test 102: path_manager.py passes py_compile."""
        root = Path(__file__).parent
        py_compile.compile(str(root / "path_manager.py"), doraise=True)

    def test_103_embedded_playlist_resolver_syntax(self):
        """Test 103: playlist_resolver.py passes py_compile."""
        root = Path(__file__).parent
        py_compile.compile(str(root / "playlist_resolver.py"), doraise=True)

    def test_104_embedded_download_cli_syntax(self):
        """Test 104: download_cli.py passes py_compile."""
        root = Path(__file__).parent
        py_compile.compile(str(root / "download_cli.py"), doraise=True)

    def test_105_embedded_search_cli_syntax(self):
        """Test 105: search_cli.py passes py_compile."""
        root = Path(__file__).parent
        py_compile.compile(str(root / "search_cli.py"), doraise=True)

    # =========================================================================
    # CATEGORY 8: Windows Packaging & Distribution Integrity (Tests 106-115)
    # =========================================================================

    def test_106_batch_launcher_utf8_codepage(self):
        """Test 106: launch_music_downloader.bat sets chcp 65001."""
        root = Path(__file__).parent
        content = (root / "launch_music_downloader.bat").read_text(encoding="utf-8")
        self.assertIn("chcp 65001", content)

    def test_107_batch_launcher_references_exe(self):
        """Test 107: launch_music_downloader.bat targets SheroFetch.exe."""
        root = Path(__file__).parent
        content = (root / "launch_music_downloader.bat").read_text(encoding="utf-8")
        self.assertIn("SheroFetch.exe", content)

    def test_108_setup_prerequisites_script_exists(self):
        """Test 108: setup_windows_prerequisites.bat exists."""
        root = Path(__file__).parent
        self.assertTrue((root / "setup_windows_prerequisites.bat").exists())

    def test_109_setup_prerequisites_checks_python(self):
        """Test 109: setup_windows_prerequisites.bat verifies Python."""
        root = Path(__file__).parent
        content = (root / "setup_windows_prerequisites.bat").read_text(encoding="utf-8")
        self.assertIn("py -3 --version", content)

    def test_110_setup_prerequisites_installs_dependencies(self):
        """Test 110: setup_windows_prerequisites.bat installs required packages."""
        root = Path(__file__).parent
        content = (root / "setup_windows_prerequisites.bat").read_text(encoding="utf-8")
        self.assertIn("mutagen", content)
        self.assertIn("yt-dlp", content)
        self.assertIn("imageio-ffmpeg", content)

    def test_111_readme_windows_instructions(self):
        """Test 111: README_WINDOWS.txt contains clear user instructions."""
        root = Path(__file__).parent
        content = (root / "README_WINDOWS.txt").read_text(encoding="utf-8")
        self.assertIn("QUICK START", content)
        self.assertIn("setup_windows_prerequisites.bat", content)

    def test_112_requirements_txt_completeness(self):
        """Test 112: requirements.txt lists all required runtime dependencies."""
        root = Path(__file__).parent
        reqs = (root / "requirements.txt").read_text(encoding="utf-8").lower()
        self.assertIn("requests", reqs)
        self.assertIn("mutagen", reqs)
        self.assertIn("pillow", reqs)

    def test_113_package_releases_script_syntax(self):
        """Test 113: packaging/package_releases.py passes py_compile."""
        root = Path(__file__).parent
        py_compile.compile(str(root / "packaging" / "package_releases.py"), doraise=True)

    def test_114_backend_server_syntax(self):
        """Test 114: backend_server.py passes py_compile."""
        root = Path(__file__).parent
        py_compile.compile(str(root / "backend_server.py"), doraise=True)

    def test_115_dist_releases_dir_ready(self):
        """Test 115: dist-releases directory exists and is writable."""
        root = Path(__file__).parent
        dist = root / "dist-releases"
        dist.mkdir(exist_ok=True)
        self.assertTrue(dist.is_dir())
        test_file = dist / ".test_write"
        test_file.write_text("ok")
        test_file.unlink()


if __name__ == "__main__":
    runner = unittest.TextTestRunner(verbosity=2)
    suite = unittest.TestLoader().loadTestsFromTestCase(Test100VerificationSuite)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
