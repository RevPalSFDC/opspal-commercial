#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# Post-Reflect Hook (Unified)
# =============================================================================
#
# Purpose: Automatically submit reflection to central database
# Version: 2.0.0 (Consolidated from Salesforce/HubSpot duplicates)
# Created: 2026-01-09
#
# Triggered: After /reflect command completes
# Behavior: Submit reflection to Supabase for centralized collection
#
# Requirements:
#   - SUPABASE_URL/SUPABASE_ANON_KEY (for submission)
#   - Node.js (for submit script)
#
# Environment Variables:
#   SUPABASE_URL       - Supabase project URL (required)
#   SUPABASE_ANON_KEY  - Supabase anon key (required)
#   USER_EMAIL         - Optional user attribution
#
# Exit Codes:
#   0 - Always (non-fatal errors to avoid breaking /reflect command)
#
# =============================================================================

# Source standardized error handler
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Always calculate from SCRIPT_DIR - CLAUDE_PLUGIN_ROOT may point to workspace root
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

ERROR_HANDLER="$PLUGIN_ROOT/hooks/lib/error-handler.sh"
if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="post-reflect"
    set_lenient_mode 2>/dev/null || true
else
    set +e  # Don't exit on errors (non-fatal hook)
fi

# Colors for output (fallback if error handler not loaded)
GREEN="${GREEN:-\033[0;32m}"
YELLOW="${YELLOW:-\033[1;33m}"
RED="${RED:-\033[0;31m}"
CYAN="${CYAN:-\033[0;36m}"
NC="${NC:-\033[0m}"

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}📤 Automatic Reflection Submission${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# =============================================================================
# MAIN EXECUTION
# =============================================================================

# Step 1: Detect project root using shared function
echo -e "${YELLOW}🔍 Detecting project root...${NC}"

# Use shared function if available, otherwise fallback
if type find_project_root &>/dev/null; then
    PROJECT_ROOT=$(find_project_root)
else
    # Fallback implementation
    PROJECT_ROOT="$PWD"
    local current="$PWD"
    local depth=0
    while [[ "$depth" -lt 10 ]]; do
        if [[ -d "$current/.claude-plugins" ]]; then
            PROJECT_ROOT="$current"
            break
        fi
        [[ "$current" == "/" ]] && break
        current="$(dirname "$current")"
        ((depth++))
    done
fi

if [[ ! -d "$PROJECT_ROOT/.claude-plugins" ]] && [[ ! -d "$PROJECT_ROOT/.claude" ]]; then
    echo -e "${YELLOW}⚠️  Warning: Project markers not found (using: $PROJECT_ROOT)${NC}"
else
    echo -e "${GREEN}✓${NC} Project root: $PROJECT_ROOT"
fi

# Load .env from project root if Supabase vars are missing
if [[ -z "${SUPABASE_URL:-}" ]] || [[ -z "${SUPABASE_ANON_KEY:-}" ]]; then
    if type load_project_env &>/dev/null; then
        load_project_env "$PROJECT_ROOT" && echo -e "${GREEN}✓${NC} Loaded .env from project root"
    else
        # Fallback: try common .env locations
        for env_file in "$PROJECT_ROOT/.env" "$PROJECT_ROOT/.env.local"; do
            if [[ -f "$env_file" ]]; then
                set -a
                source "$env_file" 2>/dev/null || true
                set +a
                echo -e "${GREEN}✓${NC} Loaded $env_file"
                break
            fi
        done
    fi
fi

# Step 2: Find reflection file using shared function
echo -e "${YELLOW}🔍 Searching for reflection file...${NC}"

REFLECTION_FILE=""
if type find_reflection_file &>/dev/null; then
    REFLECTION_FILE=$(find_reflection_file "$PROJECT_ROOT" 2>/dev/null || echo "")
else
    # Fallback implementation
    if [[ -d "$PROJECT_ROOT/.claude" ]]; then
        REFLECTION_FILE=$(find "$PROJECT_ROOT/.claude" -maxdepth 1 -name "SESSION_REFLECTION_*.json" -type f -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -f2- -d" ")
    fi
fi

if [[ -z "$REFLECTION_FILE" ]] || [[ ! -f "$REFLECTION_FILE" ]]; then
    echo -e "${YELLOW}⚠️  No reflection file found in $PROJECT_ROOT/.claude/${NC}"
    echo -e "   Expected: SESSION_REFLECTION_*.json"
    echo -e "   This is normal if /reflect was run without generating a reflection"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    exit 0
fi

echo -e "${GREEN}✓${NC} Found: $(basename "$REFLECTION_FILE")"

# Step 3: Validate credentials
echo -e "${YELLOW}🔐 Loading credentials...${NC}"

if [[ -z "${SUPABASE_URL:-}" ]] || [[ -z "${SUPABASE_ANON_KEY:-}" ]]; then
    echo -e "${YELLOW}⚠️  Supabase not configured (missing SUPABASE_URL/SUPABASE_ANON_KEY)${NC}"
    echo -e "   Reflection saved locally: $REFLECTION_FILE"
    echo -e "${YELLOW}💡 Fix:${NC} add SUPABASE_URL/SUPABASE_ANON_KEY to .env/.env.local or export in your shell"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    exit 0
fi

echo -e "${GREEN}✓${NC} Supabase credentials found"

# User attribution
if [[ -n "${USER_EMAIL:-}" ]]; then
    echo -e "${GREEN}✓${NC} User attribution: $USER_EMAIL"
else
    echo -e "${YELLOW}ℹ${NC}  Submitting anonymously (set USER_EMAIL for attribution)"
fi

# Step 4: Find submit script - check multiple locations with path validation
SUBMIT_SCRIPT=""
SUBMIT_LOCATIONS=(
    "$PLUGIN_ROOT/scripts/lib/submit-reflection.js"
)

# Only add CLAUDE_PLUGIN_ROOT paths if the variable is set and non-empty
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    SUBMIT_LOCATIONS+=(
        "${CLAUDE_PLUGIN_ROOT}/../opspal-salesforce/scripts/lib/submit-reflection.js"
        "${CLAUDE_PLUGIN_ROOT}/../opspal-hubspot/scripts/lib/submit-reflection.js"
        # Legacy paths (for backward compatibility)
        "${CLAUDE_PLUGIN_ROOT}/../salesforce-plugin/scripts/lib/submit-reflection.js"
        "${CLAUDE_PLUGIN_ROOT}/../hubspot-plugin/scripts/lib/submit-reflection.js"
    )
fi

# Add absolute fallback paths
SUBMIT_LOCATIONS+=(
    "/home/revpal/.claude/plugins/marketplaces/revpal-internal-plugins/plugins/opspal-core/scripts/lib/submit-reflection.js"
    "$HOME/.claude-plugins/opspal-core/scripts/lib/submit-reflection.js"
)

for location in "${SUBMIT_LOCATIONS[@]}"; do
    # Resolve symlinks and check file exists AND is readable
    resolved_path=$(readlink -f "$location" 2>/dev/null || echo "$location")
    if [[ -f "$resolved_path" && -r "$resolved_path" ]]; then
        SUBMIT_SCRIPT="$resolved_path"
        echo -e "${GREEN}✓${NC} Found submit script: $SUBMIT_SCRIPT"
        break
    fi
done

# Retry with small delay if not found on first pass (race condition mitigation)
if [[ -z "${SUBMIT_SCRIPT:-}" ]]; then
    echo -e "${YELLOW}⚠️  Submit script not found on first pass, retrying...${NC}"
    sleep 0.5
    for location in "${SUBMIT_LOCATIONS[@]}"; do
        resolved_path=$(readlink -f "$location" 2>/dev/null || echo "$location")
        if [[ -f "$resolved_path" && -r "$resolved_path" ]]; then
            SUBMIT_SCRIPT="$resolved_path"
            echo -e "${GREEN}✓${NC} Found submit script on retry: $SUBMIT_SCRIPT"
            break
        fi
    done
fi

if [[ -z "$SUBMIT_SCRIPT" ]]; then
    echo -e "${RED}❌ Submit script not found${NC}"
    echo -e ""
    echo -e "${YELLOW}📊 Diagnostic Information:${NC}"
    echo -e "   Reflection file: $REFLECTION_FILE"
    echo -e "   Plugin root: $PLUGIN_ROOT"
    echo -e "   CLAUDE_PLUGIN_ROOT: ${CLAUDE_PLUGIN_ROOT:-(not set)}"
    echo -e ""
    echo -e "${YELLOW}💡 Troubleshooting:${NC}"
    echo -e "   1. Verify plugin installation: ${GREEN}/plugin list${NC}"
    echo -e "   2. Reinstall plugin if needed"
    echo -e ""
    echo -e "${CYAN}✅ Your reflection is safe:${NC}"
    echo -e "   Saved locally at: $REFLECTION_FILE"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    exit 0
fi

# Step 5: Submit to Supabase
echo -e "${YELLOW}📤 Submitting to Supabase...${NC}"

# Capture both stdout and stderr
SUBMIT_OUTPUT=$(node "$SUBMIT_SCRIPT" "$REFLECTION_FILE" 2>&1)
SUBMIT_EXIT_CODE=$?

if [[ $SUBMIT_EXIT_CODE -eq 0 ]]; then
    echo -e "${GREEN}✅ Submission successful${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    exit 0
else
    echo -e "${RED}⚠️  Submission failed (exit code: $SUBMIT_EXIT_CODE)${NC}"
    echo -e ""
    echo -e "${YELLOW}Error output:${NC}"
    echo "$SUBMIT_OUTPUT" | head -10
    echo -e ""
    echo -e "   Reflection saved locally: $REFLECTION_FILE"
    echo -e ""
    echo -e "${YELLOW}💡 Manual submission:${NC}"
    echo -e "   node $SUBMIT_SCRIPT $REFLECTION_FILE"
    echo -e ""
    echo -e "${YELLOW}💡 Debug mode:${NC}"
    echo -e "   REFLECT_DEBUG=1 node $SUBMIT_SCRIPT $REFLECTION_FILE"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    exit 0  # Non-fatal: don't break /reflect command
fi
