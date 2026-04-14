#!/usr/bin/env bash
# STATUS: STAGED — not registered by design (experimental or non-hook-event script)

# Pre-Dependency Check Hook
# Validates system dependencies before operations that require them
#
# Trigger: PreToolUse for specific tool patterns
# ROI: Part of $33,000/year config/env error prevention
#
# Features:
#   - Detects PDF generation operations and validates PDF dependencies
#   - Detects Salesforce operations and validates SF CLI
#   - Provides clear installation instructions on failure
#   - Caches results to avoid repeated checks
#
# Usage:
#   Called automatically by Claude Code hooks system
#   Manual: ./pre-dependency-check.sh <tool_name> <tool_input_json>

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"
VALIDATOR="$PLUGIN_ROOT/scripts/lib/system-dependency-validator.js"

# Cache file to avoid repeated checks in same session
CACHE_DIR="${HOME}/.claude/cache"
CACHE_FILE="${CACHE_DIR}/dependency-check-cache.json"
CACHE_TTL=3600  # 1 hour

# Configuration
SKIP_DEPENDENCY_CHECK="${SKIP_DEPENDENCY_CHECK:-0}"
VERBOSE="${DEPENDENCY_CHECK_VERBOSE:-0}"

# Input from hook
TOOL_NAME="${1:-}"
TOOL_INPUT="${2:-{}}"

# =============================================================================
# Helper Functions
# =============================================================================

log() {
    if [[ "$VERBOSE" == "1" ]]; then
        echo "[dependency-check] $*" >&2
    fi
}

error() {
    echo "❌ [dependency-check] $*" >&2
}

warning() {
    echo "⚠️  [dependency-check] $*" >&2
}

# Check if cache is valid
is_cache_valid() {
    local profile="$1"

    if [[ ! -f "$CACHE_FILE" ]]; then
        return 1
    fi

    # Check cache age
    local cache_age=$(($(date +%s) - $(stat -c %Y "$CACHE_FILE" 2>/dev/null || stat -f %m "$CACHE_FILE")))
    if [[ $cache_age -gt $CACHE_TTL ]]; then
        log "Cache expired (age: ${cache_age}s)"
        return 1
    fi

    # Check if profile is in cache and passed
    if command -v jq >/dev/null 2>&1; then
        local cached=$(jq -r ".\"$profile\".ready // \"false\"" "$CACHE_FILE" 2>/dev/null)
        if [[ "$cached" == "true" ]]; then
            log "Cache hit for $profile: ready"
            return 0
        fi
    fi

    return 1
}

# Update cache
update_cache() {
    local profile="$1"
    local ready="$2"

    mkdir -p "$CACHE_DIR"

    if command -v jq >/dev/null 2>&1; then
        if [[ -f "$CACHE_FILE" ]]; then
            jq --arg profile "$profile" --arg ready "$ready" \
               '.[$profile] = {ready: ($ready == "true"), timestamp: (now | floor)}' \
               "$CACHE_FILE" > "${CACHE_FILE}.tmp" && mv "${CACHE_FILE}.tmp" "$CACHE_FILE"
        else
            echo "{\"$profile\": {\"ready\": $ready, \"timestamp\": $(date +%s)}}" > "$CACHE_FILE"
        fi
    fi
}

# Detect required profile based on tool name
detect_profile() {
    local tool="$1"
    local input="$2"

    case "$tool" in
        # PDF Generation
        *pdf*|*PDF*|PDFGenerate|generatePDF)
            echo "pdf-generation"
            ;;

        # Mermaid Diagrams
        *mermaid*|*diagram*|MermaidRender)
            echo "mermaid"
            ;;

        # Salesforce Operations
        sf_*|sfdx_*|mcp__salesforce*|sfdc_*)
            echo "salesforce"
            ;;

        # Data operations involving CSV
        *csv*|*CSV*|ImportCSV|ExportCSV)
            echo "data-ops"
            ;;

        # Web visualization
        *viz*|WebViz|generateDashboard)
            echo "web-viz"
            ;;

        *)
            # Check input for clues
            if [[ "$input" == *"pdf"* ]] || [[ "$input" == *"PDF"* ]]; then
                echo "pdf-generation"
            elif [[ "$input" == *"mermaid"* ]] || [[ "$input" == *"diagram"* ]]; then
                echo "mermaid"
            elif [[ "$input" == *"salesforce"* ]] || [[ "$input" == *"sf "* ]]; then
                echo "salesforce"
            else
                echo ""
            fi
            ;;
    esac
}

# Run dependency validation
validate_dependencies() {
    local profile="$1"

    if [[ -z "$profile" ]]; then
        log "No profile to validate"
        return 0
    fi

    log "Validating dependencies for profile: $profile"

    # Check cache first
    if is_cache_valid "$profile"; then
        return 0
    fi

    # Run validator
    if [[ ! -f "$VALIDATOR" ]]; then
        warning "Validator not found at $VALIDATOR - skipping check"
        return 0
    fi

    local result
    result=$(node "$VALIDATOR" "$profile" --json 2>/dev/null)
    local exit_code=$?

    if [[ $exit_code -eq 0 ]]; then
        log "Dependencies validated successfully"
        update_cache "$profile" "true"
        return 0
    else
        # Extract missing dependencies
        local missing=""
        if command -v jq >/dev/null 2>&1; then
            missing=$(echo "$result" | jq -r '.recommendations[]? | "\(.dependency): \(.action)"' 2>/dev/null | head -5)
        fi

        error "Missing dependencies for $profile"
        if [[ -n "$missing" ]]; then
            echo ""
            echo "Missing dependencies:"
            echo "$missing"
            echo ""
            echo "To install missing dependencies, run:"
            echo "  node $VALIDATOR $profile --install-script | bash"
            echo ""
        fi

        update_cache "$profile" "false"
        return 1
    fi
}

# =============================================================================
# Main
# =============================================================================

main() {
    # Skip if disabled
    if [[ "$SKIP_DEPENDENCY_CHECK" == "1" ]]; then
        log "Dependency check disabled via SKIP_DEPENDENCY_CHECK"
        exit 0
    fi

    # Skip if no tool name
    if [[ -z "$TOOL_NAME" ]]; then
        log "No tool name provided"
        exit 0
    fi

    log "Checking dependencies for tool: $TOOL_NAME"

    # Detect profile
    local profile
    profile=$(detect_profile "$TOOL_NAME" "$TOOL_INPUT")

    if [[ -z "$profile" ]]; then
        log "No specific profile needed for $TOOL_NAME"
        exit 0
    fi

    log "Detected profile: $profile"

    # Validate
    if ! validate_dependencies "$profile"; then
        # For non-blocking mode, just warn
        if [[ "${DEPENDENCY_CHECK_BLOCKING:-0}" != "1" ]]; then
            warning "Proceeding despite missing dependencies"
            exit 0
        else
            error "Blocking operation due to missing dependencies"
            exit 1
        fi
    fi

    exit 0
}

main "$@"
