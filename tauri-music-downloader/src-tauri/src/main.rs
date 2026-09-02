// SheroFetch — resolve and manage your music library
// Copyright (C) 2026 meet-the-1337
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0)

// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
use std::process::Command;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AppConfig {
    pub install_dir: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        let home = dirs_next().unwrap_or_else(|| PathBuf::from("."));
        let music_dir = home.join("Music").join("MusicDownloader");
        Self {
            install_dir: music_dir.to_string_lossy().to_string(),
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LibraryItem {
    pub id: String,
    pub mbid: Option<String>,
    pub artist: String,
    pub track: String,
    pub album: String,
    pub year: Option<String>,
    pub folder_path: String,
    pub file_path: String,
    pub cover_path: Option<String>,
    pub lrc_path: Option<String>,
    pub has_lrc: bool,
    pub has_cover: bool,
    pub duration: Option<f64>,
    pub file_size_mb: Option<f64>,
    pub source_used: Option<String>,
    pub downloaded_at: Option<String>,
}

fn dirs_next() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

fn get_config_path() -> PathBuf {
    let home = dirs_next().unwrap_or_else(|| PathBuf::from("."));
    let cfg_dir = if cfg!(target_os = "windows") {
        std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join("AppData").join("Roaming"))
            .join("music_downloader")
    } else if cfg!(target_os = "macos") {
        home.join("Library").join("Application Support").join("music_downloader")
    } else {
        home.join(".config").join("music_downloader")
    };
    fs::create_dir_all(&cfg_dir).ok();
    cfg_dir.join("config.json")
}

const SCRIPT_SEARCH_CLI: &str = include_str!("../../../search_cli.py");
const SCRIPT_DOWNLOAD_CLI: &str = include_str!("../../../download_cli.py");
const SCRIPT_MATCH_SONG: &str = include_str!("../../../match_song.py");
const SCRIPT_PATH_MANAGER: &str = include_str!("../../../path_manager.py");
const SCRIPT_PIPELINE: &str = include_str!("../../../checkpoint4_pipeline.py");
const SCRIPT_PLAYLIST_RESOLVER: &str = include_str!("../../../playlist_resolver.py");

fn get_repo_root() -> PathBuf {
    if let Ok(p) = std::env::var("MUSIC_DOWNLOADER_ROOT") {
        let pb = PathBuf::from(p);
        if pb.join("download_cli.py").exists() {
            return pb;
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        let mut cur = exe.parent();
        for _ in 0..6 {
            if let Some(c) = cur {
                if c.join("download_cli.py").exists() {
                    return c.to_path_buf();
                }
                cur = c.parent();
            }
        }
    }
    let cwd = std::env::current_dir().unwrap_or_default();
    if cwd.join("download_cli.py").exists() {
        return cwd;
    }

    // Auto-extract embedded scripts into persistent application storage
    let base_dir = if cfg!(target_os = "windows") {
        std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|| dirs_next().unwrap_or_default().join("AppData").join("Roaming"))
            .join("SheroFetch")
            .join("engine")
    } else {
        dirs_next()
            .unwrap_or_default()
            .join(".local")
            .join("share")
            .join("SheroFetch")
            .join("engine")
    };

    let _ = fs::create_dir_all(&base_dir);
    let _ = fs::write(base_dir.join("search_cli.py"), SCRIPT_SEARCH_CLI);
    let _ = fs::write(base_dir.join("download_cli.py"), SCRIPT_DOWNLOAD_CLI);
    let _ = fs::write(base_dir.join("match_song.py"), SCRIPT_MATCH_SONG);
    let _ = fs::write(base_dir.join("path_manager.py"), SCRIPT_PATH_MANAGER);
    let _ = fs::write(base_dir.join("checkpoint4_pipeline.py"), SCRIPT_PIPELINE);
    let _ = fs::write(base_dir.join("playlist_resolver.py"), SCRIPT_PLAYLIST_RESOLVER);

    base_dir
}

fn get_python_cmd() -> String {
    if let Ok(custom) = std::env::var("SHEROFETCH_PYTHON") {
        return custom;
    }
    let candidates = if cfg!(target_os = "windows") {
        vec!["python", "py", "python3"]
    } else {
        vec!["python3", "python"]
    };
    for cmd in candidates {
        if let Ok(out) = Command::new(cmd).arg("--version").output() {
            if out.status.success() {
                return cmd.to_string();
            }
        }
    }
    if cfg!(target_os = "windows") { "python".to_string() } else { "python3".to_string() }
}

fn ensure_python_environment(py: &str) {
    use std::sync::atomic::{AtomicBool, Ordering};
    static BOOTSTRAPPED: AtomicBool = AtomicBool::new(false);
    if BOOTSTRAPPED.swap(true, Ordering::SeqCst) {
        return;
    }

    let test_cmd = Command::new(py)
        .args(["-c", "import requests, mutagen, PIL; print('OK')"])
        .output();

    let needs_install = match test_cmd {
        Ok(out) => !out.status.success(),
        Err(_) => true,
    };

    if needs_install {
        let _ = Command::new(py)
            .args(["-m", "pip", "install", "--quiet", "requests", "mutagen", "pillow", "yt-dlp"])
            .status();
    }
}

const B64_CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
fn to_base64(data: &[u8]) -> String {
    let mut res = String::new();
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = if chunk.len() > 1 { chunk[1] as usize } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as usize } else { 0 };
        let n = (b0 << 16) | (b1 << 8) | b2;
        res.push(B64_CHARS[(n >> 18) & 63] as char);
        res.push(B64_CHARS[(n >> 12) & 63] as char);
        if chunk.len() > 1 {
            res.push(B64_CHARS[(n >> 6) & 63] as char);
        } else {
            res.push('=');
        }
        if chunk.len() > 2 {
            res.push(B64_CHARS[n & 63] as char);
        } else {
            res.push('=');
        }
    }
    res
}

#[tauri::command]
async fn get_config() -> Result<AppConfig, String> {
    tokio::task::spawn_blocking(|| {
        let path = get_config_path();
        if path.exists() {
            let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
            let cfg: AppConfig = serde_json::from_str(&content).unwrap_or_default();
            Ok(cfg)
        } else {
            let default_cfg = AppConfig::default();
            let content = serde_json::to_string_pretty(&default_cfg).map_err(|e| e.to_string())?;
            fs::write(&path, content).map_err(|e| e.to_string())?;
            Ok(default_cfg)
        }
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn save_config(install_dir: String) -> Result<AppConfig, String> {
    tokio::task::spawn_blocking(move || {
        let path = get_config_path();
        let cfg = AppConfig { install_dir };
        let content = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
        fs::write(&path, content).map_err(|e| e.to_string())?;
        Ok(cfg)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn choose_folder(current_dir: Option<String>) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || {
        #[cfg(target_os = "linux")]
        {
            if let Ok(output) = Command::new("zenity")
                .arg("--file-selection")
                .arg("--directory")
                .arg("--title=Select Music Directory")
                .output()
            {
                if output.status.success() {
                    let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    if !s.is_empty() {
                        let path = get_config_path();
                        let cfg = AppConfig { install_dir: s.clone() };
                        if let Ok(content) = serde_json::to_string_pretty(&cfg) {
                            let _ = fs::write(&path, content);
                        }
                        return Ok(Some(s));
                    }
                }
            }
            if let Ok(output) = Command::new("kdialog")
                .arg("--getexistingdirectory")
                .output()
            {
                if output.status.success() {
                    let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    if !s.is_empty() {
                        let path = get_config_path();
                        let cfg = AppConfig { install_dir: s.clone() };
                        if let Ok(content) = serde_json::to_string_pretty(&cfg) {
                            let _ = fs::write(&path, content);
                        }
                        return Ok(Some(s));
                    }
                }
            }
        }

        #[cfg(target_os = "macos")]
        {
            let script = "POSIX path of (choose folder with prompt \"Select Music Directory\")";
            if let Ok(output) = Command::new("osascript").arg("-e").arg(script).output() {
                if output.status.success() {
                    let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    if !s.is_empty() {
                        let path = get_config_path();
                        let cfg = AppConfig { install_dir: s.clone() };
                        if let Ok(content) = serde_json::to_string_pretty(&cfg) {
                            let _ = fs::write(&path, content);
                        }
                        return Ok(Some(s));
                    }
                }
            }
        }

        #[cfg(target_os = "windows")]
        {
            let ps = "[System.Reflection.Assembly]::LoadWithPartialName('System.windows.forms') | Out-Null; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.ShowNewFolderButton = $true; if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Host $f.SelectedPath }";
            if let Ok(output) = Command::new("powershell").arg("-Command").arg(ps).output() {
                if output.status.success() {
                    let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    if !s.is_empty() {
                        let path = get_config_path();
                        let cfg = AppConfig { install_dir: s.clone() };
                        if let Ok(content) = serde_json::to_string_pretty(&cfg) {
                            let _ = fs::write(&path, content);
                        }
                        return Ok(Some(s));
                    }
                }
            }
        }

        let _ = current_dir;
        Ok(None)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_library() -> Result<Vec<LibraryItem>, String> {
    tokio::task::spawn_blocking(|| {
        let home = dirs_next().unwrap_or_else(|| PathBuf::from("."));
        let index_dir = if cfg!(target_os = "windows") {
            std::env::var_os("APPDATA")
                .map(PathBuf::from)
                .unwrap_or_else(|| home.join("AppData").join("Roaming"))
                .join("music_downloader")
        } else if cfg!(target_os = "macos") {
            home.join("Library").join("Application Support").join("music_downloader")
        } else {
            home.join(".config").join("music_downloader")
        };
        let index_path = index_dir.join("index.json");
        if !index_path.exists() {
            return Ok(Vec::new());
        }
        let content = fs::read_to_string(&index_path).map_err(|e| e.to_string())?;
        let items: Vec<LibraryItem> = serde_json::from_str(&content).unwrap_or_default();
        Ok(items)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn open_folder(folder_path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let p = PathBuf::from(&folder_path);
        let target = if p.is_file() {
            p.parent().unwrap_or(&p).to_path_buf()
        } else {
            p
        };
        if !target.exists() {
            return Err(format!("Directory does not exist: {}", target.display()));
        }

        #[cfg(target_os = "windows")]
        Command::new("explorer").arg(&target).spawn().map_err(|e| e.to_string())?;

        #[cfg(target_os = "macos")]
        Command::new("open").arg(&target).spawn().map_err(|e| e.to_string())?;

        #[cfg(target_os = "linux")]
        Command::new("xdg-open").arg(&target).spawn().map_err(|e| e.to_string())?;

        Ok(())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn open_file(file_path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let p = PathBuf::from(&file_path);
        if !p.exists() {
            return Err(format!("File does not exist: {}", file_path));
        }

        #[cfg(target_os = "windows")]
        Command::new("explorer").arg(&p).spawn().map_err(|e| e.to_string())?;

        #[cfg(target_os = "macos")]
        Command::new("open").arg(&p).spawn().map_err(|e| e.to_string())?;

        #[cfg(target_os = "linux")]
        Command::new("xdg-open").arg(&p).spawn().map_err(|e| e.to_string())?;

        Ok(())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn read_cover_base64(path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let p = PathBuf::from(&path);
        if !p.exists() {
            return Err(format!("File not found: {}", path));
        }
        let bytes = fs::read(&p).map_err(|e| e.to_string())?;
        Ok(format!("data:image/jpeg;base64,{}", to_base64(&bytes)))
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn read_lrc_content(path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let p = PathBuf::from(&path);
        if !p.exists() {
            return Err(format!("LRC file not found: {}", path));
        }
        let content = fs::read_to_string(&p).map_err(|e| e.to_string())?;
        Ok(content)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn search_song_candidates(query: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let root = get_repo_root();
        let script_path = root.join("search_cli.py");
        let py = get_python_cmd();
        ensure_python_environment(&py);

        let output = Command::new(&py)
            .current_dir(&root)
            .env("PYTHONPATH", &root)
            .arg(&script_path)
            .arg(&query)
            .output()
            .map_err(|e| {
                format!(
                    "Failed to launch Python engine ('{}'). Please ensure Python 3 is installed: {}",
                    py, e
                )
            })?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        if output.status.success() {
            Ok(stdout.trim().to_string())
        } else {
            Err(format!("Search subprocess error: {}", stderr))
        }
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn resolve_playlist_url(url: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let root = get_repo_root();
        let script = root.join("playlist_resolver.py");
        let py = get_python_cmd();
        ensure_python_environment(&py);

        let output = Command::new(&py)
            .current_dir(&root)
            .env("PYTHONPATH", &root)
            .arg(&script)
            .arg(&url)
            .output()
            .map_err(|e| format!("Playlist resolver error: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        if output.status.success() {
            Ok(stdout.trim().to_string())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            Err(format!("Playlist resolution failed: {}", stderr))
        }
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn download_song(
    query: String,
    target_dir: Option<String>,
    selection_index: Option<usize>,
    override_album: Option<String>,
    preferred_format: Option<String>,
) -> Result<LibraryItem, String> {
    tokio::task::spawn_blocking(move || {
        let root = get_repo_root();
        let script_path = root.join("download_cli.py");
        let py = get_python_cmd();
        ensure_python_environment(&py);

        let mut cmd = Command::new(&py);
        cmd.current_dir(&root)
           .env("PYTHONPATH", &root)
           .arg(&script_path)
           .arg(&query);

        if let Some(ref dir) = target_dir {
            if !dir.trim().is_empty() {
                cmd.arg("--base-dir").arg(dir);
                let path = get_config_path();
                let cfg = AppConfig { install_dir: dir.clone() };
                if let Ok(content) = serde_json::to_string_pretty(&cfg) {
                    let _ = fs::write(&path, content);
                }
            }
        }
        if let Some(idx) = selection_index {
            cmd.arg("--index").arg(idx.to_string());
        }
        if let Some(ref alb) = override_album {
            cmd.arg("--override-album").arg(alb);
        }
        if let Some(ref fmt) = preferred_format {
            cmd.arg("--format").arg(fmt);
        }

        let output = cmd.output().map_err(|e| format!("Download process failed: {}", e))?;
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        if !output.status.success() {
            return Err(format!("Download failed:\nSTDOUT:\n{}\nSTDERR:\n{}", stdout, stderr));
        }

        let json_start = stdout.find('{').ok_or_else(|| format!("Invalid JSON output: {}", stdout))?;
        let json_slice = &stdout[json_start..];
        let parsed: serde_json::Value = serde_json::from_str(json_slice)
            .map_err(|e| format!("JSON parse error: {}\nRaw: {}", e, stdout))?;

        if parsed.get("status").and_then(|s| s.as_str()) != Some("success") {
            let reason = parsed.get("reason").and_then(|r| r.as_str()).unwrap_or("Download failed");
            return Err(format!("Download failed: {}", reason));
        }

        let item = LibraryItem {
            id: parsed.get("id").or_else(|| parsed.get("mbid")).and_then(|v| v.as_str()).unwrap_or("").to_string(),
            mbid: parsed.get("mbid").and_then(|v| v.as_str()).map(|s| s.to_string()),
            artist: parsed.get("artist").and_then(|v| v.as_str()).unwrap_or("Unknown Artist").to_string(),
            track: parsed.get("track").and_then(|v| v.as_str()).unwrap_or("Unknown Track").to_string(),
            album: parsed.get("album").and_then(|v| v.as_str()).unwrap_or("Unknown Album").to_string(),
            year: parsed.get("year").and_then(|v| v.as_str()).map(|s| s.to_string()),
            folder_path: parsed.get("folder_path").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            file_path: parsed.get("file_path").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            cover_path: parsed.get("cover_file").or_else(|| parsed.get("cover_path")).and_then(|v| v.as_str()).map(|s| s.to_string()),
            lrc_path: parsed.get("lrc_file").or_else(|| parsed.get("lrc_path")).and_then(|v| v.as_str()).map(|s| s.to_string()),
            has_lrc: parsed.get("lrc_saved").or_else(|| parsed.get("has_lrc")).and_then(|v| v.as_bool()).unwrap_or(false),
            has_cover: parsed.get("cover_embedded").or_else(|| parsed.get("has_cover")).and_then(|v| v.as_bool()).unwrap_or(false),
            duration: parsed.get("duration").and_then(|v| v.as_f64()),
            file_size_mb: parsed.get("file_size_mb").and_then(|v| v.as_f64()),
            source_used: parsed.get("source_used").and_then(|v| v.as_str()).map(|s| s.to_string()),
            downloaded_at: parsed.get("downloaded_at").and_then(|v| v.as_str()).map(|s| s.to_string()),
        };

        Ok(item)
    }).await.map_err(|e| e.to_string())?
}

fn main() {
    // Immediately ensure Python engine scripts are extracted on startup
    let _ = get_repo_root();

    tauri::Builder::default()
        .setup(|_app| {
            let py = get_python_cmd();
            ensure_python_environment(&py);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_config,
            choose_folder,
            get_library,
            open_folder,
            open_file,
            read_cover_base64,
            read_lrc_content,
            search_song_candidates,
            resolve_playlist_url,
            download_song
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
