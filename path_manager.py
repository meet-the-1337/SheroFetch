# SheroFetch — resolve and manage your music library
# Copyright (C) 2026 meet-the-1337
# Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0)
"""
Path Manager Module - Checkpoint 5
Authoritative directory hierarchy generator, input sanitizer, verification guard,
and persistent library index.json manager.
"""

import os
import re
import json
from pathlib import Path
from typing import Optional, Union, Tuple, List, Dict, Any

DEFAULT_BASE_DIR = Path.home() / "Music" / "MusicDownloader"
if os.name == "nt":
    _appdata = os.environ.get("APPDATA")
    DEFAULT_CONFIG_DIR = (Path(_appdata) if _appdata else Path.home() / "AppData" / "Roaming") / "music_downloader"
else:
    DEFAULT_CONFIG_DIR = Path.home() / ".config" / "music_downloader"
DEFAULT_INDEX_FILE = DEFAULT_CONFIG_DIR / "index.json"


WINDOWS_RESERVED_NAMES = {
    "CON", "PRN", "AUX", "NUL",
    "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
    "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"
}


def sanitize_component(val: Optional[str], fallback: str) -> str:
    """
    Sanitizes filesystem path components:
    - Removes invalid filesystem characters: < > : " / \\ | ? * and control chars
    - Normalizes spacing and strips leading/trailing spaces and dots
    - Enforces Windows reserved name protection (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
    - Enforces fallback if empty or whitespace
    """
    if not val or not str(val).strip():
        return fallback

    s = str(val).strip()
    # Replace illegal filesystem chars with empty string or clean underscore
    s = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '', s)
    # Collapse multiple spaces into single space
    s = re.sub(r'\s+', ' ', s).strip()
    # Strip leading or trailing dots
    s = s.strip('.')

    # Windows reserved device names check
    root_part = s.split('.')[0].upper()
    if root_part in WINDOWS_RESERVED_NAMES:
        s = f"{s}_"

    if not s:
        return fallback
    return s


def build_path(
    base_dir: Optional[Union[str, Path]] = None,
    artist: Optional[str] = None,
    album: Optional[str] = None
) -> Path:
    """
    Single authoritative function to construct target directory paths.
    Format: {base_dir}/{Artist}/{Album}/
    - Sanitizes artist and album components
    - Fallbacks: artist -> 'Unknown Artist', album -> 'Unknown Album'
    - Returns fully resolved Path object
    """
    if base_dir is None or str(base_dir).strip() == "":
        resolved_base = DEFAULT_BASE_DIR.expanduser().resolve()
    else:
        resolved_base = Path(base_dir).expanduser().resolve()

    clean_artist = sanitize_component(artist, fallback="Unknown Artist")
    clean_album = sanitize_component(album, fallback="Unknown Album")

    save_dir = resolved_base / clean_artist / clean_album
    return save_dir


def resolve_bunch_folder(base_dir: Path, playlist_name: Optional[str] = None) -> str:
    """
    Returns sanitized playlist name if provided.
    If playlist_name is empty/None or resolves to empty,
    returns auto-incrementing new1, new2, new3... based on existing folders in base_dir.
    """
    if playlist_name and str(playlist_name).strip():
        sanitized = sanitize_component(playlist_name, fallback="")
        if sanitized:
            return sanitized

    idx = 1
    while (base_dir / f"new{idx}").exists():
        idx += 1
    return f"new{idx}"


def verify_path_guard(
    save_dir: Path,
    base_dir: Optional[Union[str, Path]] = None,
    artist: Optional[str] = None,
    album: Optional[str] = None,
    is_playlist: bool = False
) -> Tuple[bool, str]:
    """
    Verification guard:
    1. Assert save_dir contains both artist and album in its hierarchy (or is valid playlist folder)
    2. Assert save_dir is strictly inside base_dir (no path traversal or directory leakage)
    Returns (True, "OK") or (False, error_message).
    """
    if base_dir is None or str(base_dir).strip() == "":
        resolved_base = DEFAULT_BASE_DIR.expanduser().resolve()
    else:
        resolved_base = Path(base_dir).expanduser().resolve()

    resolved_save = Path(save_dir).expanduser().resolve()

    # Guard 1: Must be inside base_dir
    try:
        resolved_save.relative_to(resolved_base)
    except ValueError:
        err = f"Verification Guard Violation: Target path '{resolved_save}' leaks outside base directory '{resolved_base}'"
        return False, err

    if is_playlist:
        return True, "OK"

    clean_artist = sanitize_component(artist, fallback="Unknown Artist")
    clean_album = sanitize_component(album, fallback="Unknown Album")

    # Guard 2: Hierarchy must strictly end in sanitized artist and album
    if resolved_save.name != clean_album or resolved_save.parent.name != clean_artist:
        err = (
            f"Verification Guard Violation: Directory hierarchy mismatch. "
            f"Expected '.../{clean_artist}/{clean_album}', got '.../{resolved_save.parent.name}/{resolved_save.name}'"
        )
        return False, err

    return True, "OK"


def update_library_index(entry: Dict[str, Any], index_file: Optional[Path] = None) -> List[Dict[str, Any]]:
    """
    Appends or updates a track entry in the persistent index.json.
    Deduplicates entries by track file_path or id.
    """
    target_index = index_file if index_file else DEFAULT_INDEX_FILE
    target_index.parent.mkdir(parents=True, exist_ok=True)

    items = []
    if target_index.exists():
        try:
            with open(target_index, "r", encoding="utf-8") as f:
                content = f.read().strip()
                if content:
                    items = json.loads(content)
                    if not isinstance(items, list):
                        items = []
        except Exception:
            items = []

    # Deduplicate existing entry matching file_path, id, or same folder+(artist,track)
    entry_id = entry.get("id") or entry.get("mbid")
    entry_path = entry.get("file_path")
    entry_folder = entry.get("folder_path")
    entry_artist = (entry.get("artist") or "").lower()
    entry_track = (entry.get("track") or "").lower()

    filtered_items = []
    for it in items:
        p = it.get("file_path")
        if p and not Path(p).exists():
            continue
        if entry_folder and it.get("folder_path") == entry_folder:
            if (it.get("artist") or "").lower() == entry_artist and (it.get("track") or "").lower() == entry_track:
                continue
        if entry_id and (it.get("id") == entry_id or it.get("mbid") == entry_id):
            continue
        if entry_path and it.get("file_path") == entry_path:
            continue
        filtered_items.append(it)

    items = filtered_items
    items.insert(0, entry)

    # Atomic write to avoid corruption
    tmp_file = target_index.with_suffix(".json.tmp")
    with open(tmp_file, "w", encoding="utf-8") as f:
        json.dump(items, f, indent=2, ensure_ascii=False)
    tmp_file.replace(target_index)

    return items


def read_library_index(index_file: Optional[Path] = None) -> List[Dict[str, Any]]:
    """Reads all library items from index.json."""
    target_index = index_file if index_file else DEFAULT_INDEX_FILE
    if not target_index.exists():
        return []
    try:
        with open(target_index, "r", encoding="utf-8") as f:
            content = f.read().strip()
            if not content:
                return []
            data = json.loads(content)
            return data if isinstance(data, list) else []
    except Exception:
        return []
