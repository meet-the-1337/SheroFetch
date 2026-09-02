import os
import shutil
import zipfile
import tarfile
import io
import time
from pathlib import Path

BASE_DIR = Path(r"c:\Users\manan\Downloads\scrappin")
DIST_DIR = BASE_DIR / "dist-releases"
DIST_DIR.mkdir(parents=True, exist_ok=True)

print("[*] ===============================================")
print("[*] Packaging SheroFetch Universal Releases (v2.4)")
print("[*] ===============================================")

# 1. Package Windows Portable ZIP
portable_zip_path = DIST_DIR / "SheroFetch-Windows-x64-Portable.zip"
print(f"\n[*] Creating Windows Portable Bundle: {portable_zip_path.name}...")

exe_src = BASE_DIR / "SheroFetch-Windows-x64.exe"
dll_src = BASE_DIR / "WebView2Loader.dll"
bat_src = BASE_DIR / "launch_music_downloader.bat"
req_src = BASE_DIR / "requirements.txt"

python_scripts = [
    "checkpoint4_pipeline.py",
    "download_cli.py",
    "search_cli.py",
    "match_song.py",
    "path_manager.py",
    "playlist_resolver.py",
    "backend_server.py"
]

readme_portable = """========================================================================
SheroFetch — Full Working Premium Music Downloader & Organiser (v2.4)
Windows x64 Portable Edition
========================================================================

QUICK START:
1. Double click "SheroFetch-Windows-x64.exe" or run "launch_music_downloader.bat".
2. The application will start immediately with the full GUI.
3. Choose your music download directory under Settings / Storage Vault.
4. Search songs, paste Spotify/YouTube/Apple playlist links, or batch import CSV files.
5. All acquired files are saved in:
   <Music_Folder>/<Artist>/<Album>/<Artist> - <Title>.flac (or .mp3)
   along with synced .lrc lyrics and album cover.jpg.

AUDIOPHILE PLAYBACK NOTE:
SheroFetch provides an integrated preview player, synchronized lyrics showcase,
and metadata inspector. For bit-perfect, studio-grade lossless playback of your
downloaded FLAC files, open them in your preferred audiophile media player:
- Windows: Foobar2000, VLC, MusicBee, AIMP
- Android: Poweramp, USB Audio Player PRO, Fiio Music
- Linux: Strawberry Music Player, DeaDBeeF, VLC

Enjoy bit-perfect lossless music with SheroFetch!
"""

with zipfile.ZipFile(portable_zip_path, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
    if exe_src.exists():
        zf.write(exe_src, arcname="SheroFetch-Windows-x64.exe")
        zf.write(exe_src, arcname="SheroFetch.exe")
        print(f"  + Added: SheroFetch.exe ({exe_src.stat().st_size / (1024*1024):.2f} MB)")
    if dll_src.exists():
        zf.write(dll_src, arcname="WebView2Loader.dll")
        print("  + Added: WebView2Loader.dll")
    if bat_src.exists():
        zf.write(bat_src, arcname="launch_music_downloader.bat")
        print("  + Added: launch_music_downloader.bat")
    if req_src.exists():
        zf.write(req_src, arcname="requirements.txt")
        print("  + Added: requirements.txt")
    
    for script in python_scripts:
        sp = BASE_DIR / script
        if sp.exists():
            zf.write(sp, arcname=f"engine/{script}")
            print(f"  + Added: engine/{script}")
            
    zf.writestr("README_PORTABLE.txt", readme_portable)
    print("  + Added: README_PORTABLE.txt")

print(f"[+] Portable ZIP ready: {portable_zip_path} ({portable_zip_path.stat().st_size / (1024*1024):.2f} MB)")

# 2. Copy Standalone Windows EXE
print("\n[*] Staging Standalone Windows EXE...")
dst_exe = DIST_DIR / "SheroFetch-Windows-x64.exe"
if exe_src.exists():
    shutil.copy2(exe_src, dst_exe)
    print(f"[+] Copied: {dst_exe} ({dst_exe.stat().st_size / (1024*1024):.2f} MB)")

# 3. Copy Latest Android APK (v2.4)
print("\n[*] Staging Latest Verified Android APK (v2.4)...")
apk_src = BASE_DIR / "SheroFetch-debug.apk"
dst_apk1 = DIST_DIR / "SheroFetch-v2.4-FLAC.apk"
dst_apk2 = DIST_DIR / "SheroFetch-debug.apk"

if apk_src.exists():
    shutil.copy2(apk_src, dst_apk1)
    shutil.copy2(apk_src, dst_apk2)
    print(f"[+] Copied: {dst_apk1} ({dst_apk1.stat().st_size / (1024*1024):.2f} MB)")
    print(f"[+] Copied: {dst_apk2} ({dst_apk2.stat().st_size / (1024*1024):.2f} MB)")

# 4. Build Linux Debian Package (.deb)
deb_path = DIST_DIR / "sherofetch_2.4_all.deb"
print(f"\n[*] Assembling Linux Debian Package: {deb_path.name}...")

# Control file
control_content = """Package: sherofetch
Version: 2.4
Section: sound
Priority: optional
Architecture: all
Maintainer: Meet Singhal <msinghal1_be24@thapar.edu>
Installed-Size: 10240
Depends: python3, python3-requests, python3-mutagen, python3-pil, ffmpeg
Homepage: https://github.com/meet-the-1337/SheroFetch
Description: Full Working Premium Music Downloader & Organiser with Lyrics and Cover Image Support
 Fast, lossless media acquisition tool supporting automatic metadata enrichment,
 ID3 tag embedding, FLAC bit-perfect transcoding, synchronized lyrics (.lrc),
 and strict folder hierarchy. Includes Spotify, YouTube, Apple Music, and CSV import.
"""

control_tar_io = io.BytesIO()
with tarfile.open(fileobj=control_tar_io, mode='w:gz') as tar:
    ctrl_data = control_content.encode('utf-8')
    ti = tarfile.TarInfo(name="./control")
    ti.size = len(ctrl_data)
    ti.mtime = int(time.time())
    ti.mode = 0o644
    tar.addfile(ti, io.BytesIO(ctrl_data))
control_tar_bytes = control_tar_io.getvalue()

# Data tar
launcher_sh = """#!/bin/bash
exec python3 /usr/share/sherofetch/backend_server.py "$@"
"""

desktop_entry = """[Desktop Entry]
Name=SheroFetch
Comment=Full Working Premium Music Downloader & Organiser with Lyrics and Cover Image Support
Exec=/usr/bin/sherofetch
Icon=sherofetch
Terminal=false
Type=Application
Categories=AudioVideo;Audio;
StartupNotify=true
"""

data_tar_io = io.BytesIO()
with tarfile.open(fileobj=data_tar_io, mode='w:gz') as tar:
    # 1. Launcher script
    sh_data = launcher_sh.encode('utf-8')
    ti = tarfile.TarInfo(name="./usr/bin/sherofetch")
    ti.size = len(sh_data)
    ti.mtime = int(time.time())
    ti.mode = 0o755
    tar.addfile(ti, io.BytesIO(sh_data))
    
    # 2. Desktop entry
    desk_data = desktop_entry.encode('utf-8')
    ti = tarfile.TarInfo(name="./usr/share/applications/sherofetch.desktop")
    ti.size = len(desk_data)
    ti.mtime = int(time.time())
    ti.mode = 0o644
    tar.addfile(ti, io.BytesIO(desk_data))
    
    # 3. Python backend scripts
    for s in python_scripts:
        sp = BASE_DIR / s
        if sp.exists():
            with open(sp, 'rb') as f:
                content = f.read()
            ti = tarfile.TarInfo(name=f"./usr/share/sherofetch/{s}")
            ti.size = len(content)
            ti.mtime = int(time.time())
            ti.mode = 0o644
            tar.addfile(ti, io.BytesIO(content))
            
    # 4. Icon
    icon_src = BASE_DIR / "tauri-music-downloader/src-tauri/icons/128x128.png"
    if icon_src.exists():
        with open(icon_src, 'rb') as f:
            icon_data = f.read()
        ti = tarfile.TarInfo(name="./usr/share/icons/hicolor/128x128/apps/sherofetch.png")
        ti.size = len(icon_data)
        ti.mtime = int(time.time())
        ti.mode = 0o644
        tar.addfile(ti, io.BytesIO(icon_data))

data_tar_bytes = data_tar_io.getvalue()

# Assemble Debian archive format (ar format)
def make_ar_header(filename, size):
    name = (filename.strip() + "/").ljust(16)
    mtime = str(int(time.time())).ljust(12)
    owner = "0".ljust(6)
    group = "0".ljust(6)
    mode = "100644".ljust(8)
    sz = str(size).ljust(10)
    magic = "`\n"
    return (name + mtime + owner + group + mode + sz + magic).encode('ascii')

with open(deb_path, 'wb') as deb_f:
    deb_f.write(b"!<arch>\n")
    
    # Member 1: debian-binary
    deb_bin = b"2.0\n"
    deb_f.write(make_ar_header("debian-binary", len(deb_bin)))
    deb_f.write(deb_bin)
    if len(deb_bin) % 2 != 0:
        deb_f.write(b"\n")
        
    # Member 2: control.tar.gz
    deb_f.write(make_ar_header("control.tar.gz", len(control_tar_bytes)))
    deb_f.write(control_tar_bytes)
    if len(control_tar_bytes) % 2 != 0:
        deb_f.write(b"\n")
        
    # Member 3: data.tar.gz
    deb_f.write(make_ar_header("data.tar.gz", len(data_tar_bytes)))
    deb_f.write(data_tar_bytes)
    if len(data_tar_bytes) % 2 != 0:
        deb_f.write(b"\n")

print(f"[+] Debian package ready: {deb_path} ({deb_path.stat().st_size / 1024:.1f} KB)")

print("\n[*] ===============================================")
print("[+] ALL RELEASE ASSETS READY IN: dist-releases/")
print("[*] ===============================================")
for f in DIST_DIR.iterdir():
    print(f"  - {f.name} ({f.stat().st_size / (1024*1024):.2f} MB)")
