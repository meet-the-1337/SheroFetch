#!/data/data/com.termux/files/usr/bin/bash
# One-shot SheroFetch setup for Termux (Android, aarch64).
# Installs every runtime dependency, builds the Soulseek client (sockseek) natively,
# and registers the server for auto-start via Termux:Boot.
#
#   bash ~/sherofetch/termux/setup.sh
#
# Re-running is safe: finished steps are skipped.
set -euo pipefail
APP_DIR="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
SOCKSEEK_VERSION="${SOCKSEEK_VERSION:-3.0.5}"
step() { printf '\n==> %s\n' "$*"; }

step "System packages (python, ffmpeg, chromaprint, rust toolchain, .NET 10)"
yes | pkg update -y
pkg install -y python git ffmpeg chromaprint python-pillow rust binutils maturin \
  dotnet-sdk-10.0 aspnetcore-runtime-10.0 aspnetcore-targeting-pack-10.0 termux-api

step "Python packages"
# maturin needs the API level to build pydantic-core's Rust extension on Android
export ANDROID_API_LEVEL="$(getprop ro.build.version.sdk)"
pip install -U yt-dlp requests httpx mutagen fastapi uvicorn pydantic

step "Soulseek client: sockseek v$SOCKSEEK_VERSION (built from source; upstream ships no arm64 build)"
if ! command -v sockseek >/dev/null || ! sockseek --version 2>/dev/null | grep -q "$SOCKSEEK_VERSION"; then
  export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1
  rm -rf "$HOME/src/sockseek"
  git clone -q --depth 1 --branch "v$SOCKSEEK_VERSION" https://github.com/fiso64/sockseek "$HOME/src/sockseek"
  (cd "$HOME/src/sockseek" \
    && dotnet restore Sockseek.HelpGenerator/Sockseek.HelpGenerator.csproj \
    && dotnet publish Sockseek.Cli/Sockseek.Cli.csproj -c Release -o "$HOME/opt/sockseek")
  # The native apphost cannot locate Termux's .NET, so launch through `dotnet` instead
  cat > "$PREFIX/bin/sockseek" <<'EOF'
#!/data/data/com.termux/files/usr/bin/sh
export DOTNET_ROOT="$PREFIX/lib/dotnet"
export DOTNET_CLI_TELEMETRY_OPTOUT=1
exec dotnet "$HOME/opt/sockseek/sockseek.dll" "$@"
EOF
  chmod +x "$PREFIX/bin/sockseek"
fi
sockseek --version

step "Server launcher + boot hook"
chmod +x "$APP_DIR/termux/sherofetch-server.sh"
ln -sf "$APP_DIR/termux/sherofetch-server.sh" "$PREFIX/bin/sherofetch-server"
sherofetch-server install-boot

step "Soulseek login"
if [ ! -s "$HOME/.config/sockseek/sockseek.conf" ]; then
  echo "No Soulseek account configured yet. Either sign in from the SheroFetch app, or create"
  echo "$HOME/.config/sockseek/sockseek.conf with:  username = ...  /  password = ...  (chmod 600)"
fi

step "Starting server"
sherofetch-server restart
cat <<EOF

Done.
  • Phone app: works automatically (talks to http://127.0.0.1:5050 on this phone)
  • Other devices on the same Wi-Fi: http://<phone-ip>:5050 with token: $(sherofetch-server token)
  • Install the Termux:Boot app (same source as Termux) and open it once for auto-start after reboot
EOF
