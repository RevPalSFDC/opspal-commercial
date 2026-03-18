#!/bin/bash
#
# Legacy compatibility wrapper.
# Delegates to the canonical runtime hook implementation to prevent drift.
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TARGET_HOOK="$PLUGIN_ROOT/hooks/pre-bash-soql-validator.sh"

if [ ! -f "$TARGET_HOOK" ]; then
    echo "[legacy hook wrapper] Missing runtime hook: $TARGET_HOOK" >&2
    exit 0
fi

exec bash "$TARGET_HOOK"
