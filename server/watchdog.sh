#!/bin/bash
# VIGÍA Portal Watchdog — auto-restarts server if killed
# Usage: bash watchdog.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT=3007
LOG="$SCRIPT_DIR/watchdog.log"

echo "[watchdog] Starting at $(date)" | tee -a "$LOG"

while true; do
  # Check if something is already on the port
  if lsof -ti :$PORT > /dev/null 2>&1; then
    lsof -ti :$PORT | xargs kill -9 2>/dev/null
    sleep 1
  fi

  echo "[watchdog] $(date) — Starting server..." | tee -a "$LOG"
  node "$SCRIPT_DIR/index.js" >> "$LOG" 2>&1
  EXIT_CODE=$?
  echo "[watchdog] $(date) — Server exited with code $EXIT_CODE. Restarting in 3s..." | tee -a "$LOG"
  sleep 3
done
