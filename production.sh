#!/usr/bin/env bash
# ==============================================================================
# CBT Examination Platform — Production Entry Point Wrapper
# ==============================================================================
# Forwards all arguments to the canonical script at scripts/production.sh
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/scripts/production.sh" "$@"
