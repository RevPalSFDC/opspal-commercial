#!/usr/bin/env bash
exec 3>&1 1>&2

#
# Session Start Hook - Marketo Plugin
#
# Trigger: SessionStart
# Purpose: Load instance context and validate authentication on session start
#
# Behavior:
#   - Checks Marketo configuration exists
#   - Validates authentication token (if configured)
#   - Loads instance context for the active instance
#   - Provides session-start reminders about available agents
#
# Configuration:
#   - MARKETO_INSTANCE_NAME: Override default instance
#   - MARKETO_SKIP_AUTH_CHECK: Set to 1 to skip auth validation
#
# Version: 1.0.0
#

# Source error handler
SCRIPT_DIR="$(dirname "$(realpath "$0")")"
source "${SCRIPT_DIR}/lib/error-handler.sh"

# Set lenient mode - session start should not block
set_lenient_mode

# Get instance name
INSTANCE_NAME=$(get_instance_name)
log_info "Session starting for Marketo instance: ${INSTANCE_NAME}"

# Check configuration exists
CONFIG_FILE="${MARKETO_PLUGIN_ROOT}/portals/config.json"
HAS_ENV_CONFIG=0
HAS_FILE_CONFIG=0

if [ -n "$MARKETO_CLIENT_ID" ] && [ -n "$MARKETO_CLIENT_SECRET" ] && [ -n "$MARKETO_BASE_URL" ]; then
    HAS_ENV_CONFIG=1
fi

if [ -f "$CONFIG_FILE" ]; then
    HAS_FILE_CONFIG=1
fi

if [ "$HAS_ENV_CONFIG" -eq 0 ] && [ "$HAS_FILE_CONFIG" -eq 0 ]; then
    log_warning "Marketo not configured. Run: node ${MARKETO_PLUGIN_ROOT}/scripts/lib/add-instance-config.js"
    exit 0
fi

# Load instance context if available
CONTEXT_FILE="${MARKETO_PLUGIN_ROOT}/portals/${INSTANCE_NAME}/INSTANCE_CONTEXT.json"
if [ -f "$CONTEXT_FILE" ]; then
    log_info "Loaded context for instance: ${INSTANCE_NAME}"

    # Export context as JSON blob (aligned with SF_ORG_CONTEXT and PORTAL_CONTEXT convention).
    # Previously exported the file path string; normalized to JSON in O10 optimization (2026-04-01).
    CONTEXT_JSON=$(cat "$CONTEXT_FILE" 2>/dev/null || echo '{}')
    export MARKETO_INSTANCE_CONTEXT="$CONTEXT_JSON"

    # Also write to shared cache for cross-process access
    echo "$CONTEXT_JSON" > "${TMPDIR:-/tmp}/mkto-instance-context.json" 2>/dev/null || true
fi

# Validate authentication (unless skipped)
if [ "${MARKETO_SKIP_AUTH_CHECK:-0}" != "1" ]; then
    AUTH_SCRIPT="${MARKETO_PLUGIN_ROOT}/scripts/lib/marketo-auth-manager.js"

    if [ -f "$AUTH_SCRIPT" ]; then
        # Check token validity (quiet mode)
        if node "$AUTH_SCRIPT" validate "$INSTANCE_NAME" > /dev/null 2>&1; then
            log_success "Authentication valid for ${INSTANCE_NAME}"
        else
            log_warning "Authentication may need refresh. Use /marketo-auth to configure."
        fi
    fi
fi

# Output available agents reminder
cat << 'EOF' >&2

╔══════════════════════════════════════════════════════════════════╗
║                    MARKETO PLUGIN READY                          ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  Available Agents:                                               ║
║  • marketo-orchestrator    - Complex multi-step operations       ║
║  • marketo-instance-discovery - Read-only exploration            ║
║  • marketo-lead-manager    - Lead CRUD and management            ║
║                                                                  ║
║  Quick Commands:                                                 ║
║  • /marketo-auth          - Configure authentication             ║
║  • /marketo-instance      - Switch instances                     ║
║  • /marketo-leads         - Lead operations                      ║
║  • /diagnose-campaign     - Campaign troubleshooting wizard      ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝

EOF

exit 0
