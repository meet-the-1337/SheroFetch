@echo off
chcp 65001 >nul
setlocal
set "MUSIC_DOWNLOADER_ROOT=%~dp0"
set "PYTHONIOENCODING=utf-8"

if exist "%~dp0SheroFetch.exe" (
    start "" "%~dp0SheroFetch.exe" %*
    exit /b 0
)

if exist "%~dp0SheroFetch-Windows-x64.exe" (
    start "" "%~dp0SheroFetch-Windows-x64.exe" %*
    exit /b 0
)

if exist "%~dp0tauri-music-downloader\src-tauri\target\x86_64-pc-windows-gnu\release\music-downloader.exe" (
    start "" "%~dp0tauri-music-downloader\src-tauri\target\x86_64-pc-windows-gnu\release\music-downloader.exe" %*
    exit /b 0
)

echo =========================================================================
echo [ERROR] SheroFetch executable not found in directory:
echo %~dp0
echo.
echo Please ensure SheroFetch.exe or SheroFetch-Windows-x64.exe is present.
echo =========================================================================
pause
exit /b 1
