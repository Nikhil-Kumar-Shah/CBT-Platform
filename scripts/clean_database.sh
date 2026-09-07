#!/usr/bin/env bash
# ==============================================================================
# CBT Examination Platform — Database Cleanup Script
# ==============================================================================
# Usage:
#   ./scripts/clean_database.sh [OPTIONS]
#
# Options:
#   --dry-run          Preview records without deleting
#   --force, -y        Bypass interactive confirmation
#   --clear-sessions   Also purge active sessions
#   --keep-audit       Preserve the universal audit events
# ==============================================================================

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$APP_DIR"

# 1. Environment Verification
ENV_FILE="$APP_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: Environment file not found at: $ENV_FILE" >&2
    exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# 2. Virtual Environment Detection
PYTHON_CMD="python3"
if [ -f "$APP_DIR/.venv/bin/python3" ]; then
    PYTHON_CMD="$APP_DIR/.venv/bin/python3"
elif [ -f "$APP_DIR/.venv/bin/python" ]; then
    PYTHON_CMD="$APP_DIR/.venv/bin/python"
elif [ -f "$APP_DIR/.venv/Scripts/python.exe" ]; then
    PYTHON_CMD="$APP_DIR/.venv/Scripts/python.exe"
fi

if ! command -v "$PYTHON_CMD" >/dev/null 2>&1; then
    if command -v python >/dev/null 2>&1; then
        PYTHON_CMD="python"
    else
        echo "ERROR: Python runtime not found." >&2
        exit 1
    fi
fi

# 3. Execute Cleanup Tool
exec "$PYTHON_CMD" "$APP_DIR/scripts/clean_database.py" "$@"
