#!/bin/bash
# Turbopack dev server with auto-restart on ENOENT crash
# The _buildManifest.js.tmp ENOENT is a known Turbopack race condition on macOS.
# This script catches the crash, clears .next, and restarts automatically.

MAX_RESTARTS=5
RESTART_COUNT=0

# Subshell after `|` needs this exported so we can flag Next's duplicate-dev exit.
DUP_SIGNAL=$(mktemp "${TMPDIR:-/tmp}/puxaficha-dev.XXXXXX")
export DUP_SIGNAL
trap 'rm -f "$DUP_SIGNAL"' EXIT

while [ $RESTART_COUNT -lt $MAX_RESTARTS ]; do
  rm -f "$DUP_SIGNAL"

  # If something already holds 3000, Next may bind to 3001 and then exit with
  # "Another next dev server is already running" — same as the ENOENT recovery path.
  if [ "${PUXAFICHA_DEV_NO_KILL_PORT:-}" != "1" ]; then
    if lsof -ti :3000 >/dev/null 2>&1; then
      echo "[dev.sh] Liberando porta 3000 (processo anterior)..."
      lsof -ti :3000 | xargs kill -9 2>/dev/null || true
      sleep 0.5
    fi
  fi

  npx next dev --turbopack "$@" 2>&1 | tee /dev/stderr | {
    while IFS= read -r line; do
      case "$line" in
        *"_buildManifest.js.tmp"*)
          echo ""
          echo "[dev.sh] ENOENT detectado. Limpando cache e reiniciando..."
          echo ""
          lsof -ti :3000 | xargs kill -9 2>/dev/null
          rm -rf .next
          break
          ;;
        *"Another next dev server is already running"*)
          : >"$DUP_SIGNAL"
          ;;
      esac
    done
  }

  EXIT_CODE=${PIPESTATUS[0]}

  # If next dev exited cleanly (Ctrl+C), don't restart
  if [ $EXIT_CODE -eq 0 ] || [ $EXIT_CODE -eq 130 ] || [ $EXIT_CODE -eq 143 ]; then
    exit 0
  fi

  if [ -f "$DUP_SIGNAL" ]; then
    echo ""
    echo "[dev.sh] Next.js encerrou: já havia outra instância de dev para este projeto."
    echo "[dev.sh] Dica: encerre a outra aba/terminal ou rode: kill \$(lsof -ti :3000)"
    echo "[dev.sh] Para não matar o que está na 3000 antes de subir: PUXAFICHA_DEV_NO_KILL_PORT=1 npm run dev"
    exit 1
  fi

  RESTART_COUNT=$((RESTART_COUNT + 1))
  echo "[dev.sh] Restart $RESTART_COUNT/$MAX_RESTARTS"
  sleep 1
done

echo "[dev.sh] Max restarts atingido. Rode 'npm run dev:clean' manualmente."
exit 1
