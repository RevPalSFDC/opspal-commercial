#!/bin/bash
# Post-Reflect Hook: Automatically submit reflection to central database
#
# Triggered after: /reflect command completes
# Purpose: Enable centralized reflection collection from all users
#
# ✅ CONFIGURATION REQUIRED: Uses SUPABASE_URL and SUPABASE_ANON_KEY from env
# ✅ PATH-RESILIENT: Finds project root regardless of working directory
# ✅ GRACEFUL DEGRADATION: Non-fatal errors, reflection always saved locally
#
# Environment Variables:
#   SUPABASE_URL       - Supabase project URL (required for submission)
#   SUPABASE_ANON_KEY  - Supabase anon key (required for submission)
#   USER_EMAIL         - Optional attribution
#
# Exit Codes:
#   0 - Always (non-fatal errors to avoid breaking /reflect command)
#
# Version: 1.1.0 (Error Handler Integration)
# Date: 2025-11-24

# Source standardized error handler for centralized logging
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    ERROR_HANDLER="${CLAUDE_PLUGIN_ROOT}/packages/opspal-core/cross-platform-plugin/hooks/lib/error-handler.sh"
else
    ERROR_HANDLER="${SCRIPT_DIR}/../../../opspal-core/cross-platform-plugin/hooks/lib/error-handler.sh"
fi

if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="post-reflect"
    # Use lenient mode - this hook is non-fatal
    set_lenient_mode 2>/dev/null || true
else
    set -e
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

# ==============================================================================
# FUNCTION: Find Project Root
# ==============================================================================
# Searches up directory tree for .claude-plugins/ marker directory
# Returns: Absolute path to project root
# Exit: 1 if not found (fallback to current directory)
# ==============================================================================

find_project_root() {
    local current_dir="$PWD"
    local max_depth=10
    local depth=0

    while [ "$depth" -lt "$max_depth" ]; do
        # Check for .claude-plugins/ marker directory
        if [ -d "$current_dir/.claude-plugins" ]; then
            echo "$current_dir"
            return 0
        fi

        # Stop at filesystem root
        if [ "$current_dir" = "/" ]; then
            break
        fi

        current_dir="$(dirname "$current_dir")"
        depth=$((depth + 1))
    done

    # Fallback: use current directory
    echo "$PWD"
    return 1
}

# ==============================================================================
# FUNCTION: Find Reflection File
# ==============================================================================
# Searches for most recent SESSION_REFLECTION_*.json file
# Args: $1 - Directory to search in
# Returns: Path to most recent reflection file
# Exit: 1 if no files found
# ==============================================================================

find_reflection_file() {
    local search_dir="$1"

    if [ ! -d "$search_dir/.claude" ]; then
        return 1
    fi

    # Find most recent reflection file (sort by timestamp, take newest)
    local reflection_file
    reflection_file=$(find "$search_dir/.claude" -maxdepth 1 -name "SESSION_REFLECTION_*.json" -type f -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -f2- -d" ")

    if [ -z "$reflection_file" ] || [ ! -f "$reflection_file" ]; then
        return 1
    fi

    echo "$reflection_file"
    return 0
}

# ==============================================================================
# FUNCTION: Load .env if present
# ==============================================================================
load_env_file() {
    local env_file="$1"
    if [ -f "$env_file" ]; then
        set -a
        # shellcheck disable=SC1090
        source "$env_file" 2>/dev/null
        set +a
        return 0
    fi
    return 1
}

# ==============================================================================
# MAIN EXECUTION
# ==============================================================================

# Step 1: Detect project root
echo -e "${YELLOW}🔍 Detecting project root...${NC}"

PROJECT_ROOT=$(find_project_root)
if [ ! -d "$PROJECT_ROOT/.claude-plugins" ]; then
    echo -e "${YELLOW}⚠️  Warning: .claude-plugins/ not found (using fallback: $PROJECT_ROOT)${NC}"
else
    echo -e "${GREEN}✓${NC} Project root: $PROJECT_ROOT"
fi

# Load .env from project root if Supabase vars are missing
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ]; then
    ENV_LOADED=0
    load_env_file "$PROJECT_ROOT/.env" && ENV_LOADED=1
    load_env_file "$PROJECT_ROOT/.env.local" && ENV_LOADED=1
    if [ "$ENV_LOADED" -eq 1 ]; then
        echo -e "${GREEN}✓${NC} Loaded .env from project root"
    fi
fi

# Step 2: Find reflection file
echo -e "${YELLOW}🔍 Searching for reflection file...${NC}"

# Temporarily disable exit-on-error for find_reflection_file call
set +e
REFLECTION_FILE=$(find_reflection_file "$PROJECT_ROOT")
FIND_RESULT=$?
set -e

if [ $FIND_RESULT -ne 0 ] || [ -z "$REFLECTION_FILE" ]; then
    echo -e "${YELLOW}⚠️  No reflection file found in $PROJECT_ROOT/.claude/${NC}"
    echo -e "   Expected: SESSION_REFLECTION_*.json"
    echo -e "   This is normal if /reflect was run without generating a reflection"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    exit 0
fi

echo -e "${GREEN}✓${NC} Found: $(basename "$REFLECTION_FILE")"

# Step 3: Validate credentials
echo -e "${YELLOW}🔐 Loading credentials...${NC}"

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ]; then
    echo -e "${YELLOW}⚠️  Supabase not configured (missing SUPABASE_URL/SUPABASE_ANON_KEY)${NC}"
    echo -e "   Reflection saved locally: $REFLECTION_FILE"
    echo -e "${YELLOW}💡 Fix:${NC} add SUPABASE_URL/SUPABASE_ANON_KEY to .env/.env.local or export in your shell"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    exit 0
fi

echo -e "${GREEN}✓${NC} Supabase credentials found"

# Use USER_EMAIL from environment if set, otherwise leave empty (anonymous submission)
if [ -n "$USER_EMAIL" ]; then
    echo -e "${GREEN}✓${NC} User attribution: $USER_EMAIL"
else
    echo -e "${YELLOW}ℹ${NC}  Submitting anonymously (set USER_EMAIL for attribution)"
fi

echo -e "${YELLOW}   Supabase URL: ${SUPABASE_URL}${NC}"

# Step 4: Determine plugin root (for submit script path)
resolve_domain_root() {
    local dir="$1"
    while [[ "$dir" != "/" ]]; do
        if [[ -d "$dir/scripts" ]]; then
            echo "$dir"
            return 0
        fi
        dir="$(dirname "$dir")"
    done
    echo "$1"
}

DOMAIN_ROOT="$(resolve_domain_root "$SCRIPT_DIR")"
PLUGIN_ROOT="$DOMAIN_ROOT"
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    DOMAIN_NAME="$(basename "$DOMAIN_ROOT")"
    case "$CLAUDE_PLUGIN_ROOT" in
        *"/packages/domains/$DOMAIN_NAME"|*/"$DOMAIN_NAME"-plugin) PLUGIN_ROOT="$CLAUDE_PLUGIN_ROOT" ;;
    esac
fi

SUBMIT_SCRIPT="$PLUGIN_ROOT/scripts/lib/submit-reflection.js"

if [ ! -f "$SUBMIT_SCRIPT" ]; then
    echo -e "${RED}❌ Submit script not found in plugin installation${NC}"
    echo -e ""
    echo -e "${YELLOW}📊 Diagnostic Information:${NC}"
    echo -e "   Reflection file: $REFLECTION_FILE"
    echo -e "   Plugin root: $PLUGIN_ROOT"
    echo -e "   CLAUDE_PLUGIN_ROOT env var: ${CLAUDE_PLUGIN_ROOT:-(not set)}"
    echo -e "   Expected script: $SUBMIT_SCRIPT"
    echo -e "   Hook location: ${BASH_SOURCE[0]}"
    echo -e ""
    echo -e "${YELLOW}💡 Common Causes:${NC}"
    echo -e "   1. Plugin installed from marketplace (different path structure)"
    echo -e "   2. CLAUDE_PLUGIN_ROOT environment variable not set by Claude Code"
    echo -e "   3. Plugin files not fully extracted during installation"
    echo -e ""
    echo -e "${YELLOW}🔧 Troubleshooting Steps:${NC}"
    echo -e "   1. Verify plugin installation:"
    echo -e "      ${GREEN}/plugin list | grep salesforce-plugin${NC}"
    echo -e ""
    echo -e "   2. Reinstall plugin from marketplace:"
    echo -e "      ${GREEN}/plugin uninstall salesforce-plugin@revpal-internal-plugins${NC}"
    echo -e "      ${GREEN}/plugin install salesforce-plugin@revpal-internal-plugins${NC}"
    echo -e ""
    echo -e "   3. Check if script exists in your installation:"
    echo -e "      ${GREEN}find ~/.claude/plugins -name 'submit-reflection.js' 2>/dev/null${NC}"
    echo -e ""
    echo -e "${CYAN}✅ Your reflection is safe:${NC}"
    echo -e "   Saved locally at: $REFLECTION_FILE"
    echo -e "   You can manually submit when the issue is resolved"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    exit 0
fi

# Step 5: Submit to Supabase
echo -e "${YELLOW}📤 Submitting via post-hook...${NC}"
echo -e "   (This is a backup - /reflect command should have already attempted submission)"
echo -e ""

# Capture both stdout and stderr for better error reporting
SUBMIT_OUTPUT=$(node "$SUBMIT_SCRIPT" "$REFLECTION_FILE" 2>&1)
SUBMIT_EXIT_CODE=$?

if [ $SUBMIT_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✅ Post-hook submission successful${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    exit 0
else
    echo -e "${RED}⚠️  Post-hook submission failed (exit code: $SUBMIT_EXIT_CODE)${NC}"
    echo -e ""
    echo -e "${YELLOW}Error output:${NC}"
    echo "$SUBMIT_OUTPUT" | head -10
    echo -e ""
    echo -e "   Reflection saved locally: $REFLECTION_FILE"
    echo -e ""
    echo -e "${YELLOW}💡 Manual submission:${NC}"
    echo -e "   node $SUBMIT_SCRIPT $REFLECTION_FILE"
    echo -e ""
    echo -e "${YELLOW}💡 Debug mode (verbose output):${NC}"
    echo -e "   REFLECT_DEBUG=1 node $SUBMIT_SCRIPT $REFLECTION_FILE"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    exit 0  # Non-fatal: don't break /reflect command
fi
