#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"

ERROR_HANDLER="$PLUGIN_ROOT/hooks/lib/error-handler.sh"
if [[ -f "$ERROR_HANDLER" ]]; then
    # shellcheck source=/dev/null
    source "$ERROR_HANDLER"
    HOOK_NAME="ambient-hook-error-observer"
    HOOK_PHASE="${HOOK_PHASE:-PostToolUse}"
    set_lenient_mode 2>/dev/null || true
fi

if ! command -v node >/dev/null 2>&1; then
    exit 0
fi

cat >/dev/null 2>/dev/null || true

INTERCEPTOR="$PLUGIN_ROOT/scripts/lib/ambient/hook-reflection-interceptor.js"
LEGACY_OBSERVER="$PLUGIN_ROOT/scripts/lib/ambient/hook-error-observer.js"
BUFFER_SCRIPT="$PLUGIN_ROOT/scripts/lib/ambient/reflection-candidate-buffer.js"

if [[ -f "$INTERCEPTOR" ]]; then
    node "$INTERCEPTOR" >/dev/null 2>&1 || true
    exit 0
fi

CANDIDATES="$(node "$LEGACY_OBSERVER" 2>/dev/null || echo '[]')"
if [[ -n "$CANDIDATES" ]] && [[ "$CANDIDATES" != "[]" ]]; then
    node "$BUFFER_SCRIPT" add "$CANDIDATES" >/dev/null 2>&1 || true
fi

exit 0
