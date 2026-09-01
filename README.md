# Music Downloader (Feishin Edition)

> A modern, lightweight, cross-platform music acquisition and showcase engine built with **Tauri v2**, **Rust**, and **React**.

---

## 🌟 Key Features

- 🎨 **Feishin-Inspired Visuals**:
  - Deep dark aesthetic with dynamic atmospheric ambient backdrops matching the active album artwork.
  - **Synchronized Lyrics Showcase**: Fullscreen lyrics view powered by locally acquired `.lrc` files with active line highlighting.
  - **Album & Artist Showcase**: Hero banners, discography stats, and clean tracklist tables.
  - **No Player Bloat**: Dedicated to media acquisition, tagging, artwork, and library showcase. Includes one-click launching into your native system player (VLC, MPV, Amberol).

- 📥 **Multi-Source Acquisition Engine**:
  - **Song & Artist Name**: Search canonical recordings using MusicBrainz with popularity ranking and confidence formulas.
  - **CSV File Batch Import**: Upload `.csv` or paste rows (`Artist, Title`), select tracks via checklist, and batch install.
  - **Playlist Link Import**: Extract and install public playlists from **Spotify**, **YouTube**, **YouTube Music**, and **Apple Music** in seconds.

- 🗂️ **Authoritative File Hierarchy**:
  - Strictly enforces the structure: `~/Music/MusicDownloader/{Artist}/{Album}/`
  - Input sanitization (removes illegal filesystem chars `[<>:"/\\|?*\0]`), spacing normalization, and deterministic fallbacks (`Unknown Artist`, `Unknown Album`).
  - Strict leakage guards assert path containment before any disk write occurs.

- 🛡️ **Quality Validation Gates**:
  - Dual-engine acquisition: `sockseek` primary with automatic `yt-dlp` bestaudio fallback.
  - Strict quality validation: duration tolerance $\le 2.0$s, file size $> 1$MB, filename match.
  - High-resolution artwork ($\ge 1000$px), synchronized `.lrc` lyrics, and complete ID3/Vorbis tag embedding.

- ⚡ **Lightweight & Cross-Platform**:
  - Runs smoothly on low-spec systems ($\le 4$GB RAM, zero GPU dependency).
  - Fast startup ($<1$s) with non-blocking async multithreading (`Tokio`).
  - Supports Linux (Debian `.deb`, Arch `.pkg.tar.zst`, standalone), Windows, macOS, and Android.

---

## 🚀 Quick Start

### 1. Launch Standalone Native Executable
```bash
./launch_music_downloader.sh
```

### 2. Install via Debian Package (.deb)
```bash
sudo dpkg -i dist-packages/music-downloader_1.0.0_amd64.deb
```

### 3. Install via Arch Linux Package (.pkg.tar.zst)
```bash
sudo pacman -U dist-packages/music-downloader-bin-1.0.0-1-x86_64.pkg.tar.zst
```

---

## 🛠️ Building from Source

### Prerequisites
- Python 3.10+
- Rust & Cargo 1.75+
- Node.js 18+ and npm
- `yt-dlp` and `ffmpeg` installed

### Build Steps
```bash
# 1. Install frontend dependencies and build assets
cd tauri-music-downloader
npm install
npm run build

# 2. Compile native Rust desktop binary
cd src-tauri
cargo build --release

# The compiled binary is located at:
# tauri-music-downloader/src-tauri/target/release/music-downloader
```

### Build Distribution Packages
```bash
# Generate Debian (.deb) package
./packaging/package_deb.sh

# Generate Arch Linux (.pkg.tar.zst) package
./packaging/package_arch.sh
```

---

## 📂 Repository Structure

```
├── checkpoint4_pipeline.py    # Acquisition pipeline, quality gates & metadata embedding
├── match_song.py              # MusicBrainz search, popularity ranking & confidence scoring
├── path_manager.py            # Authoritative hierarchy builder, sanitizer & index manager
├── playlist_resolver.py       # Universal Spotify/YouTube/Apple Music playlist resolver
├── download_cli.py            # Subprocess download CLI for Tauri backend
├── search_cli.py              # Subprocess search CLI for Tauri backend
├── launch_music_downloader.sh # Standalone native desktop launcher
├── packaging/                 # Debian (.deb) and Arch Linux (PKGBUILD) packagers
└── tauri-music-downloader/     # Tauri v2 desktop application
    ├── src-tauri/             # Rust native backend with non-blocking Tokio commands
    └── src/                   # React + Tailwind frontend with Feishin design
```

---

## 📄 License
MIT License.
