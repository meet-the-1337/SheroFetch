#!/data/data/com.termux/files/usr/bin/bash
# Start/stop the SheroFetch backend inside Termux.
# Usage: sherofetch-server.sh [start|stop|status|restart]
APP_DIR="${SHEROFETCH_APP_DIR:-$HOME/sherofetch}"
LOG="$HOME/sherofetch_server.log"
PIDFILE="$HOME/.sherofetch_server.pid"
export SHEROFETCH_MUSIC_DIR="${SHEROFETCH_MUSIC_DIR:-/sdcard/Music/SheroFetch}"
export SHEROFETCH_HOST="${SHEROFETCH_HOST:-0.0.0.0}"
export SHEROFETCH_PORT="${SHEROFETCH_PORT:-5050}"

running() { [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; }

case "${1:-start}" in
  start)
    if running; then echo "already running (pid $(cat "$PIDFILE"))"; exit 0; fi
    mkdir -p "$SHEROFETCH_MUSIC_DIR"
    command -v termux-wake-lock >/dev/null && termux-wake-lock
    cd "$APP_DIR" || exit 1
    nohup python backend_server.py >"$LOG" 2>&1 </dev/null &
    echo $! >"$PIDFILE"
    echo "started pid $! on $SHEROFETCH_HOST:$SHEROFETCH_PORT -> $SHEROFETCH_MUSIC_DIR"
    ;;
  stop)
    running && kill "$(cat "$PIDFILE")" && echo stopped || echo "not running"
    pkill -f "^python backend_server.py" 2>/dev/null
    rm -f "$PIDFILE"
    command -v termux-wake-unlock >/dev/null && termux-wake-unlock
    ;;
  status) running && echo "running (pid $(cat "$PIDFILE"))" || echo "not running" ;;
  restart) "$0" stop; sleep 1; "$0" start ;;
  *) echo "usage: $0 [start|stop|status|restart]"; exit 1 ;;
esac
