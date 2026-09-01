# Contributing to SheroFetch

Thank you for your interest in contributing to **SheroFetch**! We welcome bug fixes, documentation improvements, UI enhancements, and optimizations.

---

## ⚖️ Legal & Compliance Requirements

To protect the project, maintainers, and community contributors, all contributions must strictly adhere to the following policies:

1. **Content Agnosticism & No Copyrighted Material**:
   - This project **does not host, mirror, or distribute copyrighted audio files**.
   - Test suites, fixtures, documentation, and PRs must never bundle or link to proprietary or copyrighted audio files.

2. **No DRM Circumvention or ToS Violations**:
   - **Contributions must not add functionality to bypass DRM (Digital Rights Management) or scrape content from services in violation of their Terms of Service.**
   - All extraction and resolution logic must rely solely on public, authorized API endpoints, user-provided credentials, or open metadata registries (e.g., MusicBrainz, Cover Art Archive, LRCLIB).

3. **No Hardcoded Tokens or Proprietary Endpoints**:
   - Contributors must **not hardcode any third-party API keys, tokens, session cookies, or scraping logic** that targets a specific paid service's protected or private endpoints.

---

## 🛠️ Development Workflow

### 1. Fork & Clone
```bash
git clone https://github.com/<your-username>/SheroFetch.git
cd SheroFetch
git checkout -b feat/your-feature-name
```

### 2. Code Standards & Architecture
- **Desktop Frontend**: React + Tailwind CSS located in `tauri-music-downloader/src/`. Keep components clean, accessible, and aligned with Feishin design principles.
- **Tauri Backend**: Rust located in `tauri-music-downloader/src-tauri/src/main.rs`. All subprocesses and disk operations must be non-blocking async tasks (`tokio::task::spawn_blocking`).
- **Python Pipeline Engine**: Python 3.10+ in root (`checkpoint4_pipeline.py`, `match_song.py`, `path_manager.py`). Must follow PEP 8 and use type annotations.
- **Authoritative Path Integrity**: File organization must strictly flow through `build_path(base_dir, artist, album)` in `path_manager.py` (`~/Music/MusicDownloader/{Artist}/{Album}/`).

### 3. Testing Changes Locally
```bash
# Verify frontend build
cd tauri-music-downloader
npm run build

# Verify Rust compilation
cargo check --manifest-path src-tauri/Cargo.toml
```

---

## 📋 Pull Request & Issue Guidelines

When opening an Issue or Pull Request, please specify which subsystem your changes affect:
- [ ] **Metadata Resolution** (MusicBrainz, candidate scoring, normalization)
- [ ] **Download Pipeline & Quality Gates** (Sockseek, yt-dlp fallback, duration validation, FLAC/Vorbis tagging)
- [ ] **Desktop UI & Lyrics Showcase** (Tauri commands, React components, Tailwind styling)
- [ ] **Packaging & Build System** (Debian `.deb`, Arch PKGBUILD, cross-platform releases)

### Submitting a Pull Request
1. Keep PRs focused on a single issue or feature.
2. Provide a clear description of the problem solved and manual verification steps.
3. Ensure the working tree is clean and builds without warnings.

---

## 📄 License

By contributing to SheroFetch, you agree that your contributions will be licensed under the [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE).
