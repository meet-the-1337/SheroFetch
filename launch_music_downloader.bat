@echo off
setlocal
set "SHEROFETCH_PYTHON=py"
set "MUSIC_DOWNLOADER_ROOT=%~dp0"

if exist "%~dp0SheroFetch-Windows-x64.exe" (
    start "" "%~dp0SheroFetch-Windows-x64.exe" %*
) else if exist "%~dp0tauri-music-downloader\src-tauri\target\x86_64-pc-windows-gnu\release\music-downloader.exe" (
    start "" "%~dp0tauri-music-downloader\src-tauri\target\x86_64-pc-windows-gnu\release\music-downloader.exe" %*
) else (
    echo [ERROR] SheroFetch executable not found.
    pause
)
