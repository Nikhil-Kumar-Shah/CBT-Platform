#!/usr/bin/env bash
# ==============================================================================
# CBT Examination Platform — Graceful Production Shutdown Script
# ==============================================================================
# Usage:
#   ./scripts/shutdown.sh [--with-nginx]
#
# Stops CBT backend and frontend services gracefully without killing unrelated
# processes or PostgreSQL database services.
# ==============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

LOG_DIR="$APP_DIR/logs"
mkdir -p "$LOG_DIR"
SHUTDOWN_LOG="$LOG_DIR/shutdown.log"

log() {
    local msg="[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $1"
    echo "$msg"
    echo "$msg" >> "$SHUTDOWN_LOG" 2>/dev/null || true
}

STOP_NGINX=false
for arg in "$@"; do
    if [ "$arg" = "--with-nginx" ]; then
        STOP_NGINX=true
    fi
done

log "Initiating graceful shutdown of CBT Examination Platform services..."

# 1. Systemd managed services
if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet cbt-backend 2>/dev/null; then
    log "Stopping CBT systemd services..."
    sudo systemctl stop cbt-frontend 2>/dev/null || true
    sudo systemctl stop cbt-backend 2>/dev/null || true
    
    if [ "$STOP_NGINX" = true ]; then
        log "Stopping NGINX proxy..."
        sudo systemctl stop nginx 2>/dev/null || true
    fi
    log "✓ CBT application services stopped via systemd."
else
    # 2. Process-level graceful termination
    log "Stopping application worker processes gracefully (SIGTERM)..."
    
    # Identify specific CBT backend uvicorn processes
    BACKEND_PIDS=$(pgrep -f "uvicorn backend.app.main:app" || true)
    FRONTEND_PIDS=$(pgrep -f "next-server" || true)

    if [ -n "$BACKEND_PIDS" ]; then
        log "Sending SIGTERM to CBT backend PIDs: $BACKEND_PIDS"
        kill -15 $BACKEND_PIDS 2>/dev/null || true
    fi

    if [ -n "$FRONTEND_PIDS" ]; then
        log "Sending SIGTERM to CBT frontend PIDs: $FRONTEND_PIDS"
        kill -15 $FRONTEND_PIDS 2>/dev/null || true
    fi

    # Wait up to 10 seconds for graceful termination
    WAIT_SECS=10
    while [ $WAIT_SECS -gt 0 ]; do
        REMAINING_BACKEND=$(pgrep -f "uvicorn backend.app.main:app" || true)
        REMAINING_FRONTEND=$(pgrep -f "next-server" || true)
        if [ -z "$REMAINING_BACKEND" ] && [ -z "$REMAINING_FRONTEND" ]; then
            break
        fi
        sleep 1
        WAIT_SECS=$((WAIT_SECS - 1))
    done

    # Force kill only if processes refuse to exit gracefully
    STILL_RUNNING=$(pgrep -f "uvicorn backend.app.main:app" || true)
    if [ -n "$STILL_RUNNING" ]; then
        log "Warning: Force stopping backend PIDs: $STILL_RUNNING"
        kill -9 $STILL_RUNNING 2>/dev/null || true
    fi

    STILL_RUNNING_FE=$(pgrep -f "next-server" || true)
    if [ -n "$STILL_RUNNING_FE" ]; then
        log "Warning: Force stopping frontend PIDs: $STILL_RUNNING_FE"
        kill -9 $STILL_RUNNING_FE 2>/dev/null || true
    fi

    log "✓ CBT application worker processes terminated."
fi

# Note: PostgreSQL is intentionally NOT stopped.
log "PostgreSQL database status: UNTOUCHED (managed independently)."
log "=========================================================="
log "CBT Application Graceful Shutdown Complete."
log "=========================================================="
exit 0
