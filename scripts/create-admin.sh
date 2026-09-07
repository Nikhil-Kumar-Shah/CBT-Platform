#!/usr/bin/env bash
# ==============================================================================
# CBT Examination Platform — Administrator Account Creation Script
# ==============================================================================
# Usage:
#   ./scripts/create-admin.sh
#
# Interactively prompts for username, email, and password (hidden).
# Connects directly to the production PostgreSQL 'cbt' database,
# hashes passwords using bcrypt, and verifies existing accounts safely.
# ==============================================================================

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$APP_DIR"

# 1. Environment Verification
ENV_FILE="$APP_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: Environment configuration file not found at: $ENV_FILE" >&2
    echo "Please configure /opt/cbt/.env before creating admin accounts." >&2
    exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# 2. Virtual Environment Detection
PYTHON_CMD=""
if [ -f "$APP_DIR/.venv/bin/python3" ]; then
    PYTHON_CMD="$APP_DIR/.venv/bin/python3"
elif [ -f "$APP_DIR/.venv/bin/python" ]; then
    PYTHON_CMD="$APP_DIR/.venv/bin/python"
elif [ -f "$APP_DIR/venv/bin/python3" ]; then
    PYTHON_CMD="$APP_DIR/venv/bin/python3"
elif [ -f "$APP_DIR/venv/bin/python" ]; then
    PYTHON_CMD="$APP_DIR/venv/bin/python"
elif [ -f "$APP_DIR/.venv/Scripts/python.exe" ]; then
    PYTHON_CMD="$APP_DIR/.venv/Scripts/python.exe"
elif command -v python3 >/dev/null 2>&1; then
    PYTHON_CMD="python3"
fi

if [ -z "$PYTHON_CMD" ] || ! command -v "$PYTHON_CMD" >/dev/null 2>&1; then
    echo "ERROR: Python runtime not found. Virtualenv at $APP_DIR/.venv is required." >&2
    exit 1
fi

# 3. Execute Interactive Python Tool
exec "$PYTHON_CMD" "$APP_DIR/scripts/create_admin_cli.py" "$@"
