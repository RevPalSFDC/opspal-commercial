#!/usr/bin/env bash
# =============================================================================
# Session Stop Asset Cleanup
# =============================================================================
#
# Purpose: Securely wipe decrypted plugin assets when a session ends.
#   Uses shred if available, otherwise dd+rm fallback.
#
# Version: 1.1.0
# Created: 2026-03-03
# Updated: 2026-03-03 — Fix H1: read .current-session for session dir
#
# Event: Stop
# Matcher: *
# Timeout: 15000ms
#
# IMPORTANT: Always exits 0. Cleanup failure must never block session end.
#
# =============================================================================

# Do NOT set -e — cleanup must not block session end
set +e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"

VERBOSE="${ASSET_CLEANUP_VERBOSE:-0}"
ENC_BASE_DIR="$HOME/.claude/opspal-enc"
RUNTIME_BASE="$ENC_BASE_DIR/runtime"
LOG_FILE="$HOME/.claude/logs/asset-cleanup.jsonl"

log_verbose() {
    if [[ "$VERBOSE" = "1" ]]; then
        echo "[asset-cleanup] $1" >&2
    fi
}

log_cleanup() {
    local session_id="$1"
    local files_wiped="$2"
    local status="$3"

    mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true

    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S')

    printf '{"timestamp":"%s","session":"%s","files_wiped":%d,"status":"%s"}\n' \
        "$timestamp" "$session_id" "$files_wiped" "$status" \
        >> "$LOG_FILE" 2>/dev/null || true
}

# =============================================================================
# Secure wipe function
# =============================================================================

secure_wipe_file() {
    local file_path="$1"

    if [[ ! -f "$file_path" ]]; then
        return 0
    fi

    # Prefer shred (GNU coreutils)
    if command -v shred &>/dev/null; then
        shred -u "$file_path" 2>/dev/null && return 0
    fi

    # Fallback: overwrite with random data then remove
    local file_size
    file_size=$(stat -c %s "$file_path" 2>/dev/null || stat -f %z "$file_path" 2>/dev/null || echo "1024")

    dd if=/dev/urandom of="$file_path" bs=1 count="$file_size" conv=notrunc 2>/dev/null || true
    rm -f "$file_path" 2>/dev/null || true
}

# =============================================================================
# Find current session directory — Fix H1: use .current-session file
# =============================================================================

SESSION_DIR="${OPSPAL_ENC_SESSION_DIR:-}"

if [[ -z "$SESSION_DIR" ]]; then
    CURRENT_FILE="$RUNTIME_BASE/.current-session"
    if [[ -f "$CURRENT_FILE" ]]; then
        SESSION_DIR=$(cat "$CURRENT_FILE" 2>/dev/null || echo "")
    fi
fi

if [[ -z "$SESSION_DIR" ]] || [[ ! -d "$SESSION_DIR" ]]; then
    log_verbose "No session directory found, nothing to clean"
    exit 0
fi

SESSION_ID=$(basename "$SESSION_DIR")
log_verbose "Cleaning session: $SESSION_ID"

# =============================================================================
# Wipe all decrypted files
# =============================================================================

FILES_WIPED=0

# Find all regular files in the session dir (excluding the manifest itself initially)
while IFS= read -r -d '' file; do
    secure_wipe_file "$file"
    FILES_WIPED=$((FILES_WIPED + 1))
done < <(find "$SESSION_DIR" -type f -not -name ".session-manifest.json" -print0 2>/dev/null)

# Now wipe the session manifest
secure_wipe_file "$SESSION_DIR/.session-manifest.json" 2>/dev/null
FILES_WIPED=$((FILES_WIPED + 1))

# Remove the directory tree
rm -rf "$SESSION_DIR" 2>/dev/null || true

# Clean up .current-session pointer if it points to our session
CURRENT_FILE="$RUNTIME_BASE/.current-session"
if [[ -f "$CURRENT_FILE" ]]; then
    local_session=$(cat "$CURRENT_FILE" 2>/dev/null || echo "")
    if [[ "$local_session" = "$SESSION_DIR" ]]; then
        rm -f "$CURRENT_FILE" 2>/dev/null || true
    fi
fi

log_verbose "Wiped $FILES_WIPED files from session $SESSION_ID"
log_cleanup "$SESSION_ID" "$FILES_WIPED" "ok"

exit 0
