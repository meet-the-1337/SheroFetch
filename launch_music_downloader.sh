#!/usr/bin/env bash
# Standalone Native Music Downloader Launcher
# Runs the release executable directly with zero dev server / browser dependency
BIN_PATH="/home/ms/all_projects/scrappin/tauri-music-downloader/src-tauri/target/release/music-downloader"

if [ ! -f "$BIN_PATH" ]; then
    BIN_PATH="/home/ms/all_projects/scrappin/tauri-music-downloader/src-tauri/target/debug/music-downloader"
fi

export GDK_BACKEND=wayland,x11
export WEBKIT_DISABLE_DMABUF_RENDERER=1
exec "$BIN_PATH" "$@"
