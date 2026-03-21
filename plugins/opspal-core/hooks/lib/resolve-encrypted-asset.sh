#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# Encrypted Asset Path Resolver (shared helper)
# =============================================================================
#
# Purpose: Resolve a logical asset path (e.g., scripts/lib/complexity-scorer.js)
#   to the actual file on disk — checking plaintext first, then the session
#   runtime directory where encrypted assets are decrypted.
#
# Usage:
#   source "$PLUGIN_ROOT/hooks/lib/resolve-encrypted-asset.sh"
#   RESOLVED=$(resolve_enc_asset "$PLUGIN_ROOT" "opspal-core" "scripts/lib/complexity-scorer.js")
#   if [[ -n "$RESOLVED" ]]; then
#       node "$RESOLVED" ...
#   fi
#
# Version: 1.0.0
# Created: 2026-03-10
# =============================================================================

# resolve_enc_asset <plugin_root> <plugin_name> <relative_path>
#
# Returns the resolved absolute path on stdout, or empty string if not found.
resolve_enc_asset() {
    local plugin_root="$1"
    local plugin_name="$2"
    local rel_path="$3"
    local plaintext="$plugin_root/$rel_path"
    local encrypted="$plaintext.enc"
    local protected_asset=0
    local allow_plaintext_fallback="${OPSPAL_ALLOW_PROTECTED_PLAINTEXT_FALLBACK:-0}"

    if [[ -f "$encrypted" ]]; then
        protected_asset=1
    fi

    # 1. Check session runtime directory first for protected assets.
    local session_dir="${OPSPAL_ENC_SESSION_DIR:-}"

    if [[ -z "$session_dir" ]]; then
        local pointer="$HOME/.claude/opspal-enc/runtime/.current-session"
        if [[ -f "$pointer" ]]; then
            session_dir=$(cat "$pointer" 2>/dev/null || echo "")
        fi
    fi

    if [[ -n "$session_dir" ]]; then
        local runtime_path="$session_dir/$plugin_name/$rel_path"
        if [[ -f "$runtime_path" ]]; then
            echo "$runtime_path"
            return 0
        fi
    fi

    # 2. Plaintext fallback is allowed only for non-protected assets or explicit maintainer bypass.
    if [[ -f "$plaintext" ]]; then
        if [[ "$protected_asset" -eq 0 ]]; then
            echo "$plaintext"
            return 0
        fi

        if [[ "${OPSPAL_ENC_DEV_MODE:-0}" = "1" || "$allow_plaintext_fallback" = "1" ]]; then
            echo "$plaintext"
            return 0
        fi
    fi

    # 3. Not found
    echo ""
    return 1
}
