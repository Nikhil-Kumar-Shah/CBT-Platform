#!/usr/bin/env bash
# ==============================================================================
# CBT Examination Platform — Database Cleanup Script Wrapper
# ==============================================================================
# Forwards all arguments to scripts/clean_database.sh
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/scripts/clean_database.sh" "$@"
