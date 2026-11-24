#!/data/data/com.termux/files/usr/bin/bash
# SheroFetch backend manager for Termux (Android).
# Usage: sherofetch-server.sh [start|stop|restart|status|token|install-boot|logs]
#
#   start         start the server under a supervisor that restarts it if it crashes
#   install-boot  register a Termux:Boot hook so the server starts when the phone boots
#   token         print the LAN access token (other devices must send it; the phone itself does not)
set -u
SELF="$(readlink -f "$0")"
APP_DIR="${SHEROFETCH_APP_DIR:-$(dirname "$(dirname "$SELF")")}"
CONF_DIR="$HOME/.config/sherofetch"
LOG="$HOME/sherofetch_server.log"
PIDFILE="$HOME/.sherofetch_server.pid"
WPIDFILE="$HOME/.sherofetch_worker.pid"
WLOG="$HOME/sherofetch_worker.log"
TOKEN_FILE="$CONF_DIR/token"

export SHEROFETCH_MUSIC_DIR="${SHEROFETCH_MUSIC_DIR:-/sdcard/Music/SheroFetch}"
export SHEROFETCH_HOST="${SHEROFETCH_HOST:-0.0.0.0}"
export SHEROFETCH_PORT="${SHEROFETCH_PORT:-5050}"
export DOTNET_ROOT="${DOTNET_ROOT:-$PREFIX/lib/dotnet}"

ensure_token() {
  mkdir -p "$CONF_DIR"
  if [ ! -s "$TOKEN_FILE" ]; then
    python -c 'import secrets; print(secrets.token_urlsafe(24))' > "$TOKEN_FILE"
    chmod 600 "$TOKEN_FILE"
  fi
  export SHEROFETCH_TOKEN="$(cat "$TOKEN_FILE")"
}

running() { [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; }
wrunning() { [ -f "$WPIDFILE" ] && kill -0 "$(cat "$WPIDFILE")" 2>/dev/null; }
start_worker() {
  if wrunning || [ ! -s "$CONF_DIR/worker.env" ]; then return; fi
  cd "$APP_DIR" || return
  : >"$WLOG"
  setsid nohup "$SELF" __supervise_worker >/dev/null 2>&1 </dev/null &
  echo $! >"$WPIDFILE"
  echo "worker started (supervisor pid $!)"
}

supervise() {
  # Restart the program whenever it exits; back off if it keeps crashing.
  # $1 = log file, rest = command
  local log="$1"; shift
  trap 'kill "$child" 2>/dev/null; exit 0' TERM INT
  local delay=3
  while true; do
    started=$(date +%s)
    "$@" >>"$log" 2>&1 </dev/null &
    child=$!
    wait "$child"
    code=$?
    echo "[supervisor] $1 exited with $code at $(date '+%F %T'); restarting in ${delay}s" >>"$log"
    if [ $(( $(date +%s) - started )) -gt 60 ]; then delay=3; else delay=$(( delay < 60 ? delay * 2 : 60 )); fi
    sleep "$delay"
  done
}

case "${1:-start}" in
  start)
    start_worker
    if running; then echo "already running (pid $(cat "$PIDFILE"))"; exit 0; fi
    ensure_token
    mkdir -p "$SHEROFETCH_MUSIC_DIR"
    # the worker takes the wake lock itself, and only while switched on
    cd "$APP_DIR" || exit 1
    : >"$LOG"
    setsid nohup "$SELF" __supervise >/dev/null 2>&1 </dev/null &
    echo $! >"$PIDFILE"
    echo "started (supervisor pid $!) on $SHEROFETCH_HOST:$SHEROFETCH_PORT -> $SHEROFETCH_MUSIC_DIR"
    ;;
  __supervise)
    ensure_token
    cd "$APP_DIR" || exit 1
    supervise "$LOG" python backend_server.py
    ;;
  __supervise_worker)
    cd "$APP_DIR" || exit 1
    supervise "$WLOG" python -u worker/sherofetch_worker.py
    ;;
  stop)
    if running; then kill "$(cat "$PIDFILE")"; echo stopped; else echo "not running"; fi
    rm -f "$PIDFILE"
    pkill -f "^python backend_server.py" 2>/dev/null
    if wrunning; then kill "$(cat "$WPIDFILE")"; fi
    rm -f "$WPIDFILE"
    pkill -f "^python -u worker/sherofetch_worker.py" 2>/dev/null
    command -v termux-wake-unlock >/dev/null && termux-wake-unlock
    ;;
  restart) "$SELF" stop; sleep 1; "$SELF" start ;;
  status)
    if wrunning; then echo "worker running (supervisor pid $(cat "$WPIDFILE"))"; else echo "worker not running"; fi
    if running; then echo "running (supervisor pid $(cat "$PIDFILE"))"; else echo "not running"; exit 1; fi
    ;;
  token) ensure_token; echo "$SHEROFETCH_TOKEN" ;;
  logs) tail -n "${2:-50}" "$LOG" ;;
  wlogs) tail -n "${2:-50}" "$WLOG" ;;
  install-boot)
    mkdir -p "$HOME/.termux/boot"
    cat > "$HOME/.termux/boot/10-sherofetch" <<EOF
#!/data/data/com.termux/files/usr/bin/sh
# Started by Termux:Boot after the phone boots.
# the worker holds the wake lock only while switched on
pgrep -x sshd >/dev/null || sshd
"$SELF" start
EOF
    chmod +x "$HOME/.termux/boot/10-sherofetch"
    echo "boot hook installed: $HOME/.termux/boot/10-sherofetch"
    # Watchdog: every 15 minutes Android wakes Termux:API, which re-runs the (idempotent) start.
    if command -v termux-job-scheduler >/dev/null; then
      termux-job-scheduler --job-id 1337 --script "$HOME/.termux/boot/10-sherofetch" --period-ms 900000 --persisted true --network any >/dev/null 2>&1 \
        && echo "watchdog scheduled every 15 minutes"
    fi
    ;;
  *) echo "usage: $0 [start|stop|restart|status|token|install-boot|logs]"; exit 1 ;;
esac
