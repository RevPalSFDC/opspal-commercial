#!/usr/bin/env bash
exec 3>&1 1>&2

#
# Session Start Hook - Attio Plugin
#
# Trigger:  SessionStart
# Matcher:  (no matcher — fires on every session start)
# Purpose:  Load workspace context, validate authentication, and print a ready
#           banner with available agents and commands.
#
# Behavior:
#   - Checks Attio configuration (ATTIO_API_KEY or workspaces/config.json)
#   - Validates auth if configured (calls node scripts/lib/attio-auth-manager.js validate)
#   - Loads workspace context if available
#   - Prints ready banner listing available agents and commands
#
# Configuration:
#   - ATTIO_API_KEY:           Bearer token for Attio API
#   - ATTIO_WORKSPACE_NAME:    Override default workspace name
#   - ATTIO_SKIP_AUTH_CHECK:   Set to 1 to skip auth validation at session start
#
# Output:
#   - Prints informational messages to stderr (fd 1 redirected → fd 2)
#   - Emits {} on fd 3 (hook output consumed by Claude Code)
#
# Exit Codes:
#   0 - Always exits 0; session start must not block
#
# Version: 1.0.0
#

# Source error handler
SCRIPT_DIR="$(dirname "$(realpath "$0")")"
source "${SCRIPT_DIR}/lib/error-handler.sh"

# Set lenient mode — session start must never block the session
set_lenient_mode

# Resolve workspace name
WORKSPACE_NAME=$(get_workspace_name)
log_info "Session starting for Attio workspace: ${WORKSPACE_NAME}"

# ── Config check ──────────────────────────────────────────────────────────────
CONFIG_FILE="${ATTIO_PLUGIN_ROOT}/workspaces/config.json"
HAS_ENV_CONFIG=0
HAS_FILE_CONFIG=0

if [[ -n "${ATTIO_API_KEY:-}" ]]; then
    HAS_ENV_CONFIG=1
fi

if [[ -f "$CONFIG_FILE" ]]; then
    HAS_FILE_CONFIG=1
fi

if [[ "$HAS_ENV_CONFIG" -eq 0 ]] && [[ "$HAS_FILE_CONFIG" -eq 0 ]]; then
    log_warning "Attio not configured. Set ATTIO_API_KEY or run /attio-auth to configure."
    printf '{}\n' >&3
    exit 0
fi

# ── Workspace context ─────────────────────────────────────────────────────────
CONTEXT_FILE="${ATTIO_PLUGIN_ROOT}/workspaces/${WORKSPACE_NAME}/WORKSPACE_CONTEXT.json"
if [[ -f "$CONTEXT_FILE" ]]; then
    log_info "Loaded context for workspace: ${WORKSPACE_NAME}"

    CONTEXT_JSON=$(cat "$CONTEXT_FILE" 2>/dev/null || echo '{}')
    export ATTIO_WORKSPACE_CONTEXT="$CONTEXT_JSON"

    # Write to shared temp cache for cross-process access
    echo "$CONTEXT_JSON" > "${TMPDIR:-/tmp}/attio-workspace-context.json" 2>/dev/null || true
fi

# ── Auth validation ───────────────────────────────────────────────────────────
if [[ "${ATTIO_SKIP_AUTH_CHECK:-0}" != "1" ]]; then
    AUTH_SCRIPT="${ATTIO_PLUGIN_ROOT}/scripts/lib/attio-auth-manager.js"

    if [[ -f "$AUTH_SCRIPT" ]]; then
        if node "$AUTH_SCRIPT" validate "$WORKSPACE_NAME" > /dev/null 2>&1; then
            log_success "Authentication valid for workspace: ${WORKSPACE_NAME}"
        else
            log_warning "Attio authentication may need refresh. Use /attio-auth to reconfigure."
        fi
    fi
fi

# ── Ready banner ──────────────────────────────────────────────────────────────
cat << 'EOF' >&2

╔══════════════════════════════════════════════════════════════════╗
║                     ATTIO PLUGIN READY                           ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  Available Agents:                                               ║
║  • attio-orchestrator        - Complex multi-step operations     ║
║  • attio-workspace-explorer  - Read-only workspace exploration   ║
║  • attio-record-manager      - Record and list CRUD              ║
║  • attio-schema-architect    - Objects, attributes, schema       ║
║                                                                  ║
║  Quick Commands:                                                 ║
║  • /attio-auth               - Configure API authentication      ║
║  • /attio-workspace          - Switch workspace                  ║
║  • /attio-records            - Record operations                 ║
║  • /attio-audit              - Full workspace audit              ║
║                                                                  ║
║  Safety Reminders:                                               ║
║  • Attio has NO recycle bin — record deletes are permanent       ║
║  • Schema changes (delete object/attribute) destroy ALL data     ║
║  • Use /attio-audit before bulk operations                       ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝

EOF

printf '{}\n' >&3
exit 0
