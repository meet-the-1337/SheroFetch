#!/usr/bin/env bash
# Universal Debian (.deb) Packager for Music Downloader
set -e

REPO_ROOT="/home/ms/all_projects/scrappin"
TAURI_DIR="$REPO_ROOT/tauri-music-downloader"
BUILD_DIR="/tmp/music-downloader-deb-build"
VERSION="1.0.2"
ARCH="amd64"
DEB_NAME="sherofetch_${VERSION}_${ARCH}.deb"
OUTPUT_DIR="$REPO_ROOT/dist-packages"

echo "==> Building frontend assets..."
cd "$TAURI_DIR"
npm run build

echo "==> Compiling native Rust binary..."
cd "$TAURI_DIR/src-tauri"
cargo build --release || cargo build

BIN_PATH="$TAURI_DIR/src-tauri/target/release/music-downloader"
if [ ! -f "$BIN_PATH" ]; then
    BIN_PATH="$TAURI_DIR/src-tauri/target/debug/music-downloader"
fi

echo "==> Assembling Debian package layout..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/DEBIAN"
mkdir -p "$BUILD_DIR/usr/bin"
mkdir -p "$BUILD_DIR/usr/share/applications"
mkdir -p "$BUILD_DIR/usr/share/icons/hicolor/128x128/apps"
mkdir -p "$BUILD_DIR/usr/share/music-downloader"

# Copy binary
cp "$BIN_PATH" "$BUILD_DIR/usr/bin/music-downloader"
chmod 755 "$BUILD_DIR/usr/bin/music-downloader"

# Copy python backend scripts
cp "$REPO_ROOT/download_cli.py" "$BUILD_DIR/usr/share/music-downloader/"
cp "$REPO_ROOT/search_cli.py" "$BUILD_DIR/usr/share/music-downloader/"
cp "$REPO_ROOT/match_song.py" "$BUILD_DIR/usr/share/music-downloader/"
cp "$REPO_ROOT/path_manager.py" "$BUILD_DIR/usr/share/music-downloader/"
cp "$REPO_ROOT/checkpoint4_pipeline.py" "$BUILD_DIR/usr/share/music-downloader/"
cp "$REPO_ROOT/playlist_resolver.py" "$BUILD_DIR/usr/share/music-downloader/"

# Copy icon
cp "$TAURI_DIR/src-tauri/icons/128x128.png" "$BUILD_DIR/usr/share/icons/hicolor/128x128/apps/music-downloader.png"

# Copy desktop entry
cat << 'DESK' > "$BUILD_DIR/usr/share/applications/music-downloader.desktop"
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

# Control file
cat << CTRL > "$BUILD_DIR/DEBIAN/control"
Package: music-downloader
Version: ${VERSION}
Section: sound
Priority: optional
Architecture: ${ARCH}
Maintainer: Antigravity Team <contact@musicdownloader.app>
Description: Lightweight Cross-Platform Music Acquisition & Organization Engine
 Fast, native media acquisition tool supporting automatic metadata enrichment,
 ID3 tag embedding, synchronized lyrics (.lrc), and strict folder hierarchy.
Depends: python3, python3-requests, python3-mutagen, python3-pil
CTRL

# Build .deb using ar and tar (universal, works on Arch, Debian, Alpine, Fedora)
echo "==> Packaging into ${DEB_NAME}..."
mkdir -p "$OUTPUT_DIR"

cd "$BUILD_DIR"
echo "2.0" > debian-binary

tar --numeric-owner --owner=0 --group=0 -czf control.tar.gz -C DEBIAN .
tar --numeric-owner --owner=0 --group=0 -czf data.tar.gz -C "$BUILD_DIR" usr

ar rcs "$OUTPUT_DIR/$DEB_NAME" debian-binary control.tar.gz data.tar.gz

rm -rf "$BUILD_DIR"
echo "==> Package generated successfully: $OUTPUT_DIR/$DEB_NAME"
ls -lh "$OUTPUT_DIR/$DEB_NAME"
