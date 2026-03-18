#!/bin/bash
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

    # 1. Check plaintext in plugin directory (dev mode or pre-encryption)
    local plaintext="$plugin_root/$rel_path"
    if [[ -f "$plaintext" ]]; then
        echo "$plaintext"
        return 0
    fi

    # 2. Check session runtime directory
    local session_dir="${OPSPAL_ENC_SESSION_DIR:-}"

    # If env var not set, read from .current-session pointer
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

    # 3. Not found
    echo ""
    return 1
}
