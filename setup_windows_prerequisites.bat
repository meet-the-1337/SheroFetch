@echo off
chcp 65001 >nul
title SheroFetch - Windows Prerequisites Setup

echo =========================================================================
echo   SheroFetch - Automatic Windows Environment & Prerequisites Installer
echo =========================================================================
echo.

set "PY_CMD="

:: 1. Detect Python
echo [*] Checking for Python installation...
py -3 --version >nul 2>&1
if %errorlevel% equ 0 (
    set "PY_CMD=py -3"
    goto :python_found
)

python --version >nul 2>&1
if %errorlevel% equ 0 (
    set "PY_CMD=python"
    goto :python_found
)

python3 --version >nul 2>&1
if %errorlevel% equ 0 (
    set "PY_CMD=python3"
    goto :python_found
)

:: Python not found -> Attempt automatic install via winget or curl
echo [-] Python is not currently installed or not in PATH.
echo [*] Attempting automated Python 3 installation...

where winget >nul 2>&1
if %errorlevel% equ 0 (
    echo [*] Installing Python via Windows Package Manager (winget)...
    winget install Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements
    timeout /t 5 >nul
    set "PY_CMD=py -3"
    goto :python_found
)

echo [*] Downloading Python 3.12 64-bit installer...
curl -sSL -o "%TEMP%\python_installer.exe" "https://www.python.org/ftp/python/3.12.8/python-3.12.8-amd64.exe"
if exist "%TEMP%\python_installer.exe" (
    echo [*] Running silent Python installation...
    "%TEMP%\python_installer.exe" /quiet InstallAllUsers=0 PrependPath=1 Include_test=0
    timeout /t 8 >nul
    del "%TEMP%\python_installer.exe" >nul 2>&1
    set "PY_CMD=py -3"
    goto :python_found
)

echo [!] Automated Python install could not proceed.
echo [!] Please manually download and install Python from: https://www.python.org/downloads/
echo [!] (IMPORTANT: Make sure to check "Add Python to PATH" during installation)
echo.
pause
exit /b 1

:python_found
echo [+] Python detected: %PY_CMD%
%PY_CMD% --version
echo.

:: 2. Upgrade pip and install audio dependencies
echo [*] Installing required audio processing dependencies...
echo [*] Installing: requests, mutagen, pillow, yt-dlp, imageio-ffmpeg...

%PY_CMD% -m pip install --upgrade pip --quiet
%PY_CMD% -m pip install --quiet requests mutagen pillow yt-dlp imageio-ffmpeg

if %errorlevel% neq 0 (
    echo [!] Pip install encountered warnings, retrying with --user flag...
    %PY_CMD% -m pip install --user requests mutagen pillow yt-dlp imageio-ffmpeg
)

echo.
echo [*] Verifying all engines and libraries...
%PY_CMD% -c "import requests, mutagen, PIL, yt_dlp, imageio_ffmpeg; print('[+] All core libraries loaded successfully!'); print('[+] Bundled FFmpeg ready at:', imageio_ffmpeg.get_ffmpeg_exe())"

if %errorlevel% neq 0 (
    echo [!] Verification encountered an issue. Please run: pip install requests mutagen pillow yt-dlp imageio-ffmpeg
    pause
    exit /b 1
)

echo.
echo =========================================================================
echo   [SUCCESS] Windows Prerequisites Successfully Configured!
echo   You can now launch SheroFetch via:
echo     1. Double-clicking "SheroFetch.exe" or "SheroFetch-Windows-x64.exe"
echo     2. Or running "launch_music_downloader.bat"
echo =========================================================================
echo.
pause
