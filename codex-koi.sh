#!/bin/bash
# Codex Koi: `status` says how Codex runs (koi / plain / off); `start` opens it through the launcher.
DIR="$(cd "$(dirname "$0")" && pwd)"
APP_BIN="/Applications/ChatGPT.app/Contents/MacOS/ChatGPT"
case "$1" in
  status)
    echo "$(date -u +%FT%TZ) entry status check" >>"$HOME/Library/Logs/codex-koi.log"
    if [ -f "$DIR/codex.pid" ] && /bin/kill -0 "$(cat "$DIR/codex.pid")" 2>/dev/null; then echo koi
    elif /usr/bin/pgrep -f "$APP_BIN" >/dev/null; then echo plain
    else echo off; fi ;;
  start)
    mkdir -p "$HOME/Library/Logs"
    echo "$(date -u +%FT%TZ) entry start" >>"$HOME/Library/Logs/codex-koi.log"
    /usr/bin/nohup /opt/homebrew/bin/node "$DIR/launcher.mjs" >>"$HOME/Library/Logs/codex-koi.log" 2>&1 &
    ;;
  *) echo "usage: $0 status|start" >&2; exit 2 ;;
esac
