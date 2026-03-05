#!/bin/bash
# =============================================================================
# Pre-Tool-Use Asset Resolver (Bash)
# =============================================================================
#
# Purpose: Rewrite Bash commands that reference encrypted asset paths to use
#   the decrypted runtime copies instead. Also triggers JIT decryption for
#   assets marked with decrypt_on: ["PreToolUse"].
#
# Version: 1.1.0
# Created: 2026-03-03
# Updated: 2026-03-03 — Fix C1/C2/C3/H1/H2: no shell interpolation in node -e
#
# Event: PreToolUse
# Matcher: Bash
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
    HOOK_NAME="pre-tool-use-asset-resolver"
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

# Extract the command from tool_input — pass input via stdin, single-quoted JS
COMMAND=$(printf '%s' "$INPUT" | node -e '
    try {
        const d = JSON.parse(require("fs").readFileSync("/dev/stdin","utf8"));
        console.log(d.tool_input?.command || "");
    } catch { console.log(""); }
' 2>/dev/null || echo "")

if [[ -z "$COMMAND" ]]; then
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

# Rewrite paths — pass manifest path via env, tool input via stdin.
# All node -e blocks use single-quoted strings to prevent shell expansion.
# Fix C1: no $VAR interpolation inside JS. Fix H2: path-boundary matching.
REWRITTEN=$(ENC_MANIFEST_PATH="$MANIFEST_PATH" \
    printf '%s' "$INPUT" | node -e '
    const fs = require("fs");
    const manifestPath = process.env.ENC_MANIFEST_PATH;
    if (!manifestPath || !fs.existsSync(manifestPath)) process.exit(0);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const input = JSON.parse(fs.readFileSync("/dev/stdin", "utf8"));
    let command = input.tool_input?.command || "";
    if (!command) process.exit(0);

    let modified = false;

    for (const asset of (manifest.assets || [])) {
        const patterns = [asset.encrypted_path, asset.logical_path].filter(Boolean);

        for (const pattern of patterns) {
            // Fix H2: require path-segment boundary match, not substring
            const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const regex = new RegExp("(^|/|\\s|[\"'"'"'])" + escaped + "($|/|\\s|[\"'"'"'])", "g");
            if (regex.test(command)) {
                command = command.replace(new RegExp(escaped, "g"), asset.decrypted_path);
                modified = true;
            }
        }
    }

    if (modified) {
        input.tool_input.command = command;
        console.log(JSON.stringify({ updatedInput: input }));
    }
' 2>/dev/null || echo "")

if [[ -n "$REWRITTEN" ]] && [[ "$REWRITTEN" != "undefined" ]]; then
    echo "$REWRITTEN"
else
    exit 0
fi
