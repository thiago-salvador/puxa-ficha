#!/bin/bash
# Turbopack dev server with auto-restart on ENOENT crash
# The _buildManifest.js.tmp ENOENT is a known Turbopack race condition on macOS.
# This script catches the crash, clears .next, and restarts automatically.

MAX_RESTARTS=5
RESTART_COUNT=0

while [ $RESTART_COUNT -lt $MAX_RESTARTS ]; do
  npx next dev --turbopack "$@" 2>&1 | tee /dev/stderr | {
    while IFS= read -r line; do
      if echo "$line" | grep -q "_buildManifest.js.tmp"; then
        echo ""
        echo "[dev.sh] ENOENT detectado. Limpando cache e reiniciando..."
        echo ""
        # Find and kill the next dev process
        lsof -ti :3000 | xargs kill -9 2>/dev/null
        rm -rf .next
        break
      fi
    done
  }

  EXIT_CODE=${PIPESTATUS[0]}

  # If next dev exited cleanly (Ctrl+C), don't restart
  if [ $EXIT_CODE -eq 0 ] || [ $EXIT_CODE -eq 130 ] || [ $EXIT_CODE -eq 143 ]; then
    exit 0
  fi

  RESTART_COUNT=$((RESTART_COUNT + 1))
  echo "[dev.sh] Restart $RESTART_COUNT/$MAX_RESTARTS"
  sleep 1
done

echo "[dev.sh] Max restarts atingido. Rode 'npm run dev:clean' manualmente."
exit 1
