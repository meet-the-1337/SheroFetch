#!/usr/bin/env bash
# Arch Linux Package Generator
set -e

REPO_ROOT="/home/ms/all_projects/scrappin"
TAURI_DIR="$REPO_ROOT/tauri-music-downloader"
BUILD_DIR="/tmp/music-downloader-arch-build"
OUTPUT_DIR="$REPO_ROOT/dist-packages"

echo "==> Preparing Arch Linux Package..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
mkdir -p "$OUTPUT_DIR"

BIN_PATH="$TAURI_DIR/src-tauri/target/release/music-downloader"
if [ ! -f "$BIN_PATH" ]; then
    BIN_PATH="$TAURI_DIR/src-tauri/target/debug/music-downloader"
fi

cp "$BIN_PATH" "$BUILD_DIR/music-downloader"
cp "$REPO_ROOT/packaging/arch/PKGBUILD" "$BUILD_DIR/PKGBUILD"
cp "$TAURI_DIR/src-tauri/icons/128x128.png" "$BUILD_DIR/128x128.png"
cp "$REPO_ROOT/tauri-music-downloader/src-tauri/icons/128x128.png" "$BUILD_DIR/music-downloader.png"

cat << 'DESK' > "$BUILD_DIR/music-downloader.desktop"
[Desktop Entry]
Name=Music Downloader
Comment=Lightweight Cross-Platform Music Acquisition and Organization Engine
Exec=/usr/bin/music-downloader
Icon=music-downloader
Terminal=false
Type=Application
Categories=AudioVideo;Audio;
StartupNotify=true
DESK

cp "$REPO_ROOT/download_cli.py" "$BUILD_DIR/"
cp "$REPO_ROOT/search_cli.py" "$BUILD_DIR/"
cp "$REPO_ROOT/match_song.py" "$BUILD_DIR/"
cp "$REPO_ROOT/path_manager.py" "$BUILD_DIR/"
cp "$REPO_ROOT/checkpoint4_pipeline.py" "$BUILD_DIR/"

cd "$BUILD_DIR"
echo "==> Running makepkg..."
makepkg -f --nodeps

cp *.pkg.tar.zst "$OUTPUT_DIR/" 2>/dev/null || true
echo "==> Arch Linux package generated in $OUTPUT_DIR"
ls -lh "$OUTPUT_DIR"
