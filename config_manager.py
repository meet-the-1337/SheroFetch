#!/usr/bin/env python3
"""
SheroFetch — Cross-Platform Configuration & Onboarding Manager
Handles user preferences, credentials (Soulseek & Gemini), and interactive onboarding.
Supports Linux, macOS, and Windows with native path standards.
"""

import os
import sys
import json
import socket
import getpass
from pathlib import Path
from typing import Dict, Any, Optional, Tuple


def get_config_dir() -> Path:
    """Return the platform-specific configuration directory for SheroFetch."""
    if sys.platform == "win32":
        app_data = os.environ.get("APPDATA")
        base = Path(app_data) if app_data else Path.home() / "AppData" / "Roaming"
        cfg = base / "sherofetch"
    elif sys.platform == "darwin":
        cfg = Path.home() / "Library" / "Application Support" / "sherofetch"
    else:
        # Linux and other UNIX
        xdg_config = os.environ.get("XDG_CONFIG_HOME")
        base = Path(xdg_config) if xdg_config else Path.home() / ".config"
        cfg = base / "sherofetch"
    cfg.mkdir(parents=True, exist_ok=True)
    return cfg


def get_config_file() -> Path:
    """Return path to config.json."""
    return get_config_dir() / "config.json"


def get_sockseek_conf_path() -> Path:
    """Return platform-specific sockseek.conf location."""
    if sys.platform == "win32":
        app_data = os.environ.get("APPDATA")
        base = Path(app_data) if app_data else Path.home() / "AppData" / "Roaming"
        p = base / "sockseek" / "sockseek.conf"
    else:
        xdg_config = os.environ.get("XDG_CONFIG_HOME")
        base = Path(xdg_config) if xdg_config else Path.home() / ".config"
        p = base / "sockseek" / "sockseek.conf"
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def read_sockseek_credentials() -> Tuple[str, str]:
    """Read Soulseek credentials from sockseek.conf."""
    p = get_sockseek_conf_path()
    if p.exists():
        try:
            user, pwd = "", ""
            for line in p.read_text(encoding="utf-8", errors="replace").splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k, v = k.strip().lower(), v.strip()
                if k == "username":
                    user = v
                elif k == "password":
                    pwd = v
            if user:
                return user, pwd
        except Exception:
            pass
    return "", ""


def update_sockseek_conf(username: str, password: str, output_dir: Optional[str] = None):
    """Write updated credentials to sockseek.conf."""
    conf_path = get_sockseek_conf_path()
    out = output_dir or str(Path.home() / "Music" / "Sockseek")
    content = f"""# Sockseek Configuration File
username = {username}
password = {password}
output-dir = {out}
pref-format = flac,mp3
concurrent-jobs = 20
concurrent-searches = 2
concurrent-extractors = 4

[lossless]
pref-format = flac,wav

[high-quality]
pref-format = flac,mp3
pref-min-bitrate = 320
"""
    try:
        conf_path.write_text(content, encoding="utf-8")
    except Exception as e:
        print(f"[CONFIG] Warning: could not write sockseek.conf: {e}")


def test_soulseek_server(timeout: float = 2.0) -> bool:
    """Check if server.slsknet.org:2242 is reachable."""
    try:
        with socket.create_connection(("server.slsknet.org", 2242), timeout=timeout):
            return True
    except Exception:
        return False


def load_config() -> Dict[str, Any]:
    """Load config.json with environment variable overrides."""
    cfg_file = get_config_file()
    data: Dict[str, Any] = {
        "onboarding_completed": False,
        "gemini_api_key": "",
        "soulseek_username": "",
        "soulseek_password": "",
        "preferred_format": "opus",
        "download_dir": str(Path.home() / "Music" / "MusicDownloader"),
        "acoustid_api_key": ""
    }

    if cfg_file.exists():
        try:
            loaded = json.loads(cfg_file.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                data.update(loaded)
        except Exception:
            pass

    # Read Soulseek credentials from sockseek.conf if missing in config
    if not data["soulseek_username"]:
        u, p = read_sockseek_credentials()
        if u:
            data["soulseek_username"] = u
            data["soulseek_password"] = p

    # Env var overrides
    if "GEMINI_API_KEY" in os.environ and os.environ["GEMINI_API_KEY"].strip():
        data["gemini_api_key"] = os.environ["GEMINI_API_KEY"].strip()
    if "SOULSEEK_USER" in os.environ and os.environ["SOULSEEK_USER"].strip():
        data["soulseek_username"] = os.environ["SOULSEEK_USER"].strip()
    if "SOULSEEK_PASS" in os.environ:
        data["soulseek_password"] = os.environ["SOULSEEK_PASS"].strip()

    return data


def save_config(data: Dict[str, Any]):
    """Save config to JSON."""
    cfg_file = get_config_file()
    try:
        cfg_file.write_text(json.dumps(data, indent=2), encoding="utf-8")
    except Exception as e:
        print(f"[CONFIG] Error saving config: {e}")

    # Also keep sockseek.conf synchronized if Soulseek user is present
    u = data.get("soulseek_username", "")
    p = data.get("soulseek_password", "")
    if u:
        update_sockseek_conf(u, p)


def is_configured() -> bool:
    """Check if initial setup has been completed."""
    cfg = load_config()
    return bool(cfg.get("onboarding_completed", False))


def run_interactive_onboarding(force: bool = False) -> Dict[str, Any]:
    """
    Run interactive onboarding in terminal.
    Prompts for:
      1. Soulseek P2P Credentials (with server test)
      2. Google Gemini API Key (optional)
      3. Preferred format and output directory
    """
    cfg = load_config()
    if cfg.get("onboarding_completed") and not force:
        return cfg

    print("\n" + "=" * 65)
    print("      🎵  SHEROFETCH AUDIOPHILE SUITE — INITIAL SETUP  🎵")
    print("=" * 65)
    print("Welcome! Let's configure your lossless acquisition pipeline in 30 seconds.")
    print("Your preferences and keys will be saved locally to:")
    print(f"  {get_config_file()}\n")

    # ─────────────────────────────────────────────────────────────
    # Step 1: Soulseek P2P Credentials
    # ─────────────────────────────────────────────────────────────
    print("┌── [1/3] Soulseek P2P Network (Lossless FLAC Acquisition)")
    print("│ Enables Tier 1 & Tier 2 direct P2P FLAC downloads.")
    print("│ Free registration is available at: https://www.slsknet.org/")
    
    current_u = cfg.get("soulseek_username", "")
    has_slsk = input(f"│ Do you have a Soulseek account? [{'Y/n' if current_u else 'y/N'}]: ").strip().lower()

    if (current_u and has_slsk not in ("n", "no")) or (has_slsk in ("y", "yes")):
        u_prompt = f"│ Soulseek Username [{current_u}]: " if current_u else "│ Soulseek Username: "
        new_u = input(u_prompt).strip() or current_u

        print("│ Soulseek Password (hidden): ", end="", flush=True)
        try:
            new_p = getpass.getpass("")
        except Exception:
            new_p = input("")
        if not new_p and current_u:
            new_p = cfg.get("soulseek_password", "")

        cfg["soulseek_username"] = new_u
        cfg["soulseek_password"] = new_p

        # Quick connectivity probe
        print("│ Probing connection to server.slsknet.org:2242...", end=" ", flush=True)
        if test_soulseek_server():
            print("✓ Online & Reachable")
        else:
            print("⚠ Server offline or blocked by firewall (will fallback to YouTube)")

        update_sockseek_conf(new_u, new_p)
    else:
        print("│ Skipping Soulseek P2P. Pipeline will use YouTube HQ stream rips (Tier 3).")
        print("│ (You can configure Soulseek later by running: sherofetch --config)")
        cfg["soulseek_username"] = ""
        cfg["soulseek_password"] = ""

    print("└" + "─" * 60 + "\n")

    # ─────────────────────────────────────────────────────────────
    # Step 2: Google Gemini API Key
    # ─────────────────────────────────────────────────────────────
    print("┌── [2/3] Google Gemini API Key (AI Audio Veto & Gate 3)")
    print("│ Gemini 2.5 Flash verifies sung language & lyric authenticity.")
    print("│ Completely optional. If skipped, local Chromaprint & silence gates are used.")
    print("│ Get a free key at: https://aistudio.google.com/app/apikey")

    curr_gem = cfg.get("gemini_api_key", "")
    gem_prompt = f"│ Gemini API Key [{curr_gem[:8]}...]: " if curr_gem else "│ Gemini API Key (Enter to skip): "
    new_gem = input(gem_prompt).strip()
    if new_gem:
        cfg["gemini_api_key"] = new_gem
    elif not curr_gem:
        cfg["gemini_api_key"] = ""
    print("└" + "─" * 60 + "\n")

    # ─────────────────────────────────────────────────────────────
    # Step 3: Format & Download Directory
    # ─────────────────────────────────────────────────────────────
    print("┌── [3/3] Audio Preferences")
    curr_fmt = cfg.get("preferred_format", "opus")
    fmt_in = input(f"│ Preferred format (opus/flac/mp3) [{curr_fmt}]: ").strip().lower()
    if fmt_in in ("opus", "flac", "mp3"):
        cfg["preferred_format"] = fmt_in

    curr_dir = cfg.get("download_dir", str(Path.home() / "Music" / "MusicDownloader"))
    dir_in = input(f"│ Download folder [{curr_dir}]: ").strip()
    if dir_in:
        cfg["download_dir"] = str(Path(dir_in).expanduser().resolve())

    print("└" + "─" * 60 + "\n")

    cfg["onboarding_completed"] = True
    save_config(cfg)
    print("✓ Configuration saved successfully!\n")
    return cfg


if __name__ == "__main__":
    run_interactive_onboarding(force=True)
