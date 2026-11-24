#!/usr/bin/env sh
# SheroFetch on your own device: Linux, macOS, or Android (Termux).
#
#   curl -fsSL https://sherofetch.vercel.app/get.sh | sh -s -- device-xxxxx-xxxxx
#
# Installs what fetching needs (Python, ffmpeg, yt-dlp, the Soulseek client and cloudflared),
# links this device to your SheroFetch account with the one-time code from the app, and starts it.
# Your Soulseek password, if you give one, is written only to this device.
set -eu
CODE="${1:-}"
DIR="${SHEROFETCH_DIR:-$HOME/sherofetch}"
REPO="https://github.com/meet-the-1337/SheroFetch.git"
SITE="https://sherofetch.vercel.app"
SOCKSEEK="3.1.0"
say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

if [ -z "$CODE" ]; then
  printf 'Device code from the SheroFetch app (device-xxxxx-xxxxx): '
  read -r CODE </dev/tty
fi

if [ -n "${PREFIX:-}" ] && echo "$PREFIX" | grep -q com.termux; then
  say "Android (Termux)"
  pkg install -y git >/dev/null
  [ -d "$DIR/.git" ] && git -C "$DIR" pull -q || git clone -q --depth 1 "$REPO" "$DIR"
  bash "$DIR/termux/setup.sh"
  (cd "$DIR" && python worker/sherofetch_worker.py --setup --code "$CODE" --site "$SITE") </dev/tty
  sherofetch-server restart
  exit 0
fi

OS="$(uname -s)"; ARCH="$(uname -m)"
say "Tools for $OS $ARCH"
if [ "$OS" = Darwin ]; then
  have brew || { echo "Install Homebrew first: https://brew.sh"; exit 1; }
  for p in git ffmpeg cloudflared uv; do have "$p" || brew install "$p"; done
else
  need=""
  for p in git ffmpeg curl; do have "$p" || need="$need $p"; done
  if [ -n "$need" ]; then
    if have pacman; then sudo pacman -S --needed --noconfirm $need
    elif have apt-get; then sudo apt-get update -q && sudo apt-get install -y $need
    elif have dnf; then sudo dnf install -y $need
    else echo "Please install:$need"; exit 1; fi
  fi
  have uv || curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
  if ! have cloudflared; then
    case "$ARCH" in x86_64) cf=amd64 ;; aarch64|arm64) cf=arm64 ;; *) cf=arm ;; esac
    mkdir -p "$HOME/.local/bin"
    curl -fsSL -o "$HOME/.local/bin/cloudflared" "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$cf"
    chmod +x "$HOME/.local/bin/cloudflared"
  fi
fi
export PATH="$HOME/.local/bin:$PATH"

say "Soulseek client (sockseek $SOCKSEEK)"
if ! have sockseek; then
  case "$OS-$ARCH" in
    Linux-x86_64) a=linux-x64 ;; Linux-aarch64|Linux-armv7l) a=linux-arm ;;
    Darwin-arm64) a=osx-arm64 ;; Darwin-x86_64) a=osx-x64 ;; *) a="" ;;
  esac
  if [ -n "$a" ]; then
    mkdir -p "$HOME/.local/opt/sockseek" "$HOME/.local/bin"
    curl -fsSL "https://github.com/fiso64/sockseek/releases/download/v$SOCKSEEK/sockseek_${SOCKSEEK}_$a.tar.gz" | tar -xz -C "$HOME/.local/opt/sockseek"
    ln -sf "$HOME/.local/opt/sockseek/sockseek" "$HOME/.local/bin/sockseek"
  else
    echo "No Soulseek build for $OS $ARCH; songs will come from YouTube only."
  fi
fi

say "SheroFetch"
[ -d "$DIR/.git" ] && git -C "$DIR" pull -q || git clone -q --depth 1 "$REPO" "$DIR"
cd "$DIR"
uv venv -q .venv
uv pip install -q --python .venv/bin/python -r requirements.txt

say "Linking this device to your account"
.venv/bin/python worker/sherofetch_worker.py --setup --code "$CODE" --site "$SITE" </dev/tty

say "Starting"
if [ "$OS" = Linux ] && have systemctl; then
  mkdir -p "$HOME/.config/systemd/user"
  cat > "$HOME/.config/systemd/user/sherofetch-worker.service" <<EOF
[Unit]
Description=SheroFetch worker (fetches your songs)
After=network-online.target

[Service]
WorkingDirectory=$DIR
Environment=PATH=$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=$DIR/.venv/bin/python -u worker/sherofetch_worker.py
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
EOF
  systemctl --user daemon-reload
  systemctl --user enable --now sherofetch-worker.service
  echo "Running now, and on every login. Logs: journalctl --user -u sherofetch-worker -f"
else
  echo "Start it with:  cd $DIR && .venv/bin/python -u worker/sherofetch_worker.py"
fi
echo "Open SheroFetch: your device shows as online within a minute."
