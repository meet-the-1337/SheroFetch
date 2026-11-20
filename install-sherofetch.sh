#!/usr/bin/env bash
set -e

# ==============================================================================
# SheroFetch Audiophile Suite - Clean Installer
# Copyright (C) 2026 meet-the-1337 | AGPL-3.0
# ==============================================================================

BOLD="\033[1m"
GREEN="\033[1;32m"
CYAN="\033[1;36m"
YELLOW="\033[1;33m"
RED="\033[1;31m"
RESET="\033[0m"

echo -e "${CYAN}${BOLD}"
echo "  ╔═══════════════════════════════════════════════════════════════════╗"
echo "  ║                  SHEROFETCH AUDIOPHILE SUITE                     ║"
echo "  ║                   Native Installation Tool                       ║"
echo "  ╚═══════════════════════════════════════════════════════════════════╝"
echo -e "${RESET}"

# 1. Terminate running instances
echo -e "${YELLOW}[1/5] Terminating previous instances...${RESET}"
pkill -x sherofetch-gui 2>/dev/null || true
pkill -x music-downloader 2>/dev/null || true
sleep 0.5

# 2. Deploy Python backend engine
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENGINE_DIR="$HOME/.local/share/SheroFetch/engine"
echo -e "${YELLOW}[2/5] Deploying verified Python engine to $ENGINE_DIR...${RESET}"
mkdir -p "$ENGINE_DIR"
cp -f "$SCRIPT_DIR/cli.py" "$ENGINE_DIR/"
cp -f "$SCRIPT_DIR/download_cli.py" "$ENGINE_DIR/"
cp -f "$SCRIPT_DIR/search_cli.py" "$ENGINE_DIR/"
cp -f "$SCRIPT_DIR/universal_resolver.py" "$ENGINE_DIR/"
cp -f "$SCRIPT_DIR/five_gate_verifier.py" "$ENGINE_DIR/"
cp -f "$SCRIPT_DIR/config_manager.py" "$ENGINE_DIR/"
cp -f "$SCRIPT_DIR/playlist_resolver.py" "$ENGINE_DIR/"

# 3. Install CLI launcher
echo -e "${YELLOW}[3/5] Installing CLI launcher to ~/.local/bin/sherofetch...${RESET}"
mkdir -p "$HOME/.local/bin"
cat << 'CLI_LAUNCHER' > "$HOME/.local/bin/sherofetch"
#!/usr/bin/env bash
ENGINE_PATH="$HOME/.local/share/SheroFetch/engine/cli.py"
PYTHON_BIN="$(which python3 2>/dev/null || echo "python3")"
exec "$PYTHON_BIN" "$ENGINE_PATH" "$@"
CLI_LAUNCHER
chmod +x "$HOME/.local/bin/sherofetch"

# 4. Install native desktop binary (if built)
BINARY_SOURCE="$SCRIPT_DIR/tauri-music-downloader/src-tauri/target/release/music-downloader"
if [ -f "$BINARY_SOURCE" ]; then
    echo -e "${YELLOW}[4/5] Installing Desktop GUI to ~/.local/bin/sherofetch-gui...${RESET}"
    cp -f "$BINARY_SOURCE" "$HOME/.local/bin/sherofetch-gui"
    chmod +x "$HOME/.local/bin/sherofetch-gui"
else
    echo -e "${YELLOW}[4/5] Native release binary not found; CLI mode installed.${RESET}"
fi

# 5. Install desktop shortcut & icon
echo -e "${YELLOW}[5/5] Registering desktop entries and icons...${RESET}"
ICON_BASE="$SCRIPT_DIR/tauri-music-downloader/src-tauri/icons"
if [ -d "$ICON_BASE" ]; then
    mkdir -p "$HOME/.local/share/icons/hicolor/128x128/apps"
    cp -f "$ICON_BASE/128x128.png" "$HOME/.local/share/icons/hicolor/128x128/apps/sherofetch.png" 2>/dev/null || true
fi

mkdir -p "$HOME/.local/share/applications"
cat << DESK > "$HOME/.local/share/applications/sherofetch.desktop"
[Desktop Entry]
Name=SheroFetch
Comment=Universal Lossless Music Acquisition & Audiophile Suite
Exec=$HOME/.local/bin/sherofetch-gui
Icon=sherofetch
Terminal=false
Type=Application
Categories=AudioVideo;Audio;Player;Music;
StartupWMClass=sherofetch
DESK

update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true

echo -e "\n${GREEN}${BOLD}✔ SheroFetch successfully installed!${RESET}\n"
echo -e "${CYAN}Available commands:${RESET}"
echo -e "  • ${BOLD}sherofetch \"Artist - Song\"${RESET}  — Download via CLI (4-tier lossless)"
echo -e "  • ${BOLD}sherofetch --playlist <url>${RESET}    — Download entire playlist"
echo -e "  • ${BOLD}sherofetch --config${RESET}            — Interactive onboarding & credentials"
echo -e "  • ${BOLD}sherofetch --check${RESET}             — Check system prerequisites"
if [ -f "$HOME/.local/bin/sherofetch-gui" ]; then
    echo -e "  • ${BOLD}sherofetch-gui${RESET}                 — Launch native desktop GUI app"
fi
echo ""
