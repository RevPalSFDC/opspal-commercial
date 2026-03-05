#!/bin/bash
# =============================================================================
# Pre-Tool-Use Asset Resolver (Read)
# =============================================================================
#
# Purpose: Rewrite Read tool file_path references that point to encrypted
#   assets to use the decrypted runtime copies instead.
#
# Version: 1.1.0
# Created: 2026-03-03
# Updated: 2026-03-03 — Fix C1/C2/C3/H1/H2: no shell interpolation in node -e
#
# Event: PreToolUse
# Matcher: Read
# Timeout: 8000ms
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"

# Source error handler
ERROR_HANDLER="$PLUGIN_ROOT/hooks/lib/error-handler.sh"
if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="pre-tool-use-asset-resolver-read"
    set_lenient_mode 2>/dev/null || true
fi

# Dev mode bypass
if [[ "${OPSPAL_ENC_DEV_MODE:-0}" = "1" ]]; then
    exit 0
fi

# Read tool input from stdin
INPUT=$(cat)
if [[ -z "$INPUT" ]]; then
    exit 0
fi

# Extract file_path from tool_input — pass input via stdin, single-quoted JS
FILE_PATH=$(printf '%s' "$INPUT" | node -e '
    try {
        const d = JSON.parse(require("fs").readFileSync("/dev/stdin","utf8"));
        console.log(d.tool_input?.file_path || "");
    } catch { console.log(""); }
' 2>/dev/null || echo "")

if [[ -z "$FILE_PATH" ]]; then
    exit 0
fi

# Find the session manifest — use .current-session file (fix H1)
SESSION_DIR="${OPSPAL_ENC_SESSION_DIR:-}"
if [[ -z "$SESSION_DIR" ]]; then
    CURRENT_FILE="$HOME/.claude/opspal-enc/runtime/.current-session"
    if [[ -f "$CURRENT_FILE" ]]; then
        SESSION_DIR=$(cat "$CURRENT_FILE" 2>/dev/null || echo "")
    fi
fi

if [[ -z "$SESSION_DIR" ]] || [[ ! -f "$SESSION_DIR/.session-manifest.json" ]]; then
    exit 0
fi

MANIFEST_PATH="$SESSION_DIR/.session-manifest.json"

# Check if the file_path matches any encrypted asset — pass via env vars + stdin.
# Fix C1: no $VAR interpolation. Fix H2: path-boundary matching.
REWRITTEN=$(ENC_MANIFEST_PATH="$MANIFEST_PATH" \
    printf '%s' "$INPUT" | node -e '
    const fs = require("fs");
    const manifestPath = process.env.ENC_MANIFEST_PATH;
    if (!manifestPath || !fs.existsSync(manifestPath)) process.exit(0);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const input = JSON.parse(fs.readFileSync("/dev/stdin", "utf8"));
    const filePath = input.tool_input?.file_path || "";
    if (!filePath) process.exit(0);

    for (const asset of (manifest.assets || [])) {
        const patterns = [asset.encrypted_path, asset.logical_path].filter(Boolean);

        for (const pattern of patterns) {
            // Fix H2: require path-segment boundary or exact match
            const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const regex = new RegExp("(^|/)" + escaped + "($|/)");
            if (regex.test(filePath) || filePath.endsWith(pattern)) {
                input.tool_input.file_path = asset.decrypted_path;
                console.log(JSON.stringify({ updatedInput: input }));
                process.exit(0);
            }
        }
    }
' 2>/dev/null || echo "")

if [[ -n "$REWRITTEN" ]] && [[ "$REWRITTEN" != "undefined" ]]; then
    echo "$REWRITTEN"
else
    exit 0
fi
