#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# Session Start Environment Configuration Hook (v2.0.0)
#
# Comprehensive environment validation using environment-schema.json.
# Validates environment variables, system dependencies, and auth configuration.
#
# Addresses: config/env cohort (14 reflections, $35K ROI)
# Root Causes:
#   - Bash expansion failures
#   - Path resolution inconsistencies
#   - Missing dependencies
#
# How It Works:
# 1. Triggered at session start
# 2. Loads environment-schema.json
# 3. Validates global dependencies (node, jq)
# 4. Validates plugin-specific requirements
# 5. Checks authentication configuration
# 6. Generates remediation commands on failure
#
# Configuration:
#   ENV_VALIDATION_STRICT=0          # Block on missing required vars (default: 0)
#   ENV_VALIDATION_ENABLED=1         # Enable validation (default: 1)
#   ENV_CONFIG_VERBOSE=0             # Show verbose output (default: 0)
#   ENV_SKIP_DEPENDENCY_CHECK=0      # Skip dependency validation (default: 0)
#
# Exit Codes:
#   0 - Validation passed (or non-blocking mode)
#   1 - Validation failed (strict mode only)
#
# Version: 2.0.0
# Date: 2025-12-19
###############################################################################

# Configuration
ENABLED="${ENV_VALIDATION_ENABLED:-1}"
STRICT_MODE="${ENV_VALIDATION_STRICT:-0}"
VERBOSE="${ENV_CONFIG_VERBOSE:-0}"
SKIP_DEPS="${ENV_SKIP_DEPENDENCY_CHECK:-0}"

# Only run if enabled
if [ "$ENABLED" != "1" ]; then
    exit 0
fi

# Get plugin directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_DIR="$PLUGIN_DIR/config"
SCHEMA_FILE="$CONFIG_DIR/environment-schema.json"
LOG_DIR="${HOME}/.claude/logs"
LOG_FILE="$LOG_DIR/env-validation.jsonl"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Helper function for logging
log_verbose() {
    if [ "$VERBOSE" == "1" ]; then
        echo "  [env-validation] $1" >&2
    fi
}

log_entry() {
    local level="$1"
    local message="$2"
    local details="${3:-}"

    local entry=$(jq -nc \
        --arg timestamp "$(date -Iseconds)" \
        --arg level "$level" \
        --arg message "$message" \
        --arg details "$details" \
        '{timestamp: $timestamp, level: $level, message: $message, details: $details}')
    echo "$entry" >> "$LOG_FILE"
}

# Check if jq is available (required for this script)
if ! command -v jq &> /dev/null; then
    echo ""
    echo "======================================================================" >&2
    echo "[ENVIRONMENT ERROR] Missing required dependency: jq" >&2
    echo "======================================================================" >&2
    echo "" >&2
    echo "Install jq to enable environment validation:" >&2
    echo "  macOS:   brew install jq" >&2
    echo "  Ubuntu:  sudo apt-get install jq" >&2
    echo "  Fedora:  sudo dnf install jq" >&2
    echo "" >&2

    if [ "$STRICT_MODE" == "1" ]; then
        exit 1
    fi
    exit 0
fi

# Check if schema file exists
if [ ! -f "$SCHEMA_FILE" ]; then
    log_verbose "Schema file not found: $SCHEMA_FILE"
    exit 0
fi

# Load schema
SCHEMA=$(cat "$SCHEMA_FILE" 2>/dev/null)

if [ -z "$SCHEMA" ]; then
    log_verbose "Failed to load schema file"
    exit 0
fi

# Initialize validation state
ERRORS=()
WARNINGS=()
REMEDIATIONS=()

# ============================================================================
# GLOBAL DEPENDENCY VALIDATION
# ============================================================================

if [ "$SKIP_DEPS" != "1" ]; then
    log_verbose "Checking global dependencies..."

    # Get required global dependencies from schema
    GLOBAL_DEPS=$(echo "$SCHEMA" | jq -r '.global.dependencies.required[]? // empty' 2>/dev/null)

    while IFS= read -r dep_json; do
        if [ -z "$dep_json" ]; then continue; fi

        dep_name=$(echo "$dep_json" | jq -r '.name // empty')
        dep_check=$(echo "$dep_json" | jq -r '.check // empty')
        dep_min_version=$(echo "$dep_json" | jq -r '.minVersion // empty')
        dep_install=$(echo "$dep_json" | jq -r '.installCommand // empty')

        if [ -z "$dep_name" ]; then continue; fi

        log_verbose "  Checking $dep_name..."

        # Run the check command
        if [ -n "$dep_check" ]; then
            check_output=$(eval "$dep_check" 2>/dev/null)
            check_exit=$?

            if [ $check_exit -ne 0 ]; then
                ERRORS+=("Missing dependency: $dep_name")
                if [ -n "$dep_install" ]; then
                    REMEDIATIONS+=("Install $dep_name: $dep_install")
                fi
            else
                # Version check if min version specified
                if [ -n "$dep_min_version" ] && [ -n "$check_output" ]; then
                    # Extract version number (handles formats like "v18.0.0", "jq-1.6", "node v20.9.0")
                    current_version=$(echo "$check_output" | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1)

                    if [ -n "$current_version" ]; then
                        # Simple version comparison using sort
                        min_major=$(echo "$dep_min_version" | cut -d. -f1)
                        current_major=$(echo "$current_version" | cut -d. -f1)

                        if [ "$current_major" -lt "$min_major" ] 2>/dev/null; then
                            WARNINGS+=("$dep_name version $current_version is below minimum $dep_min_version")
                        fi
                    fi
                fi
                log_verbose "    ✓ $dep_name found"
            fi
        fi
    done <<< "$(echo "$SCHEMA" | jq -c '.global.dependencies.required[]? // empty' 2>/dev/null)"

    # Check optional global dependencies (just warnings)
    while IFS= read -r dep_json; do
        if [ -z "$dep_json" ]; then continue; fi

        dep_name=$(echo "$dep_json" | jq -r '.name // empty')
        dep_check=$(echo "$dep_json" | jq -r '.check // empty')
        dep_desc=$(echo "$dep_json" | jq -r '.description // empty')

        if [ -z "$dep_name" ] || [ -z "$dep_check" ]; then continue; fi

        if ! eval "$dep_check" &>/dev/null; then
            WARNINGS+=("Optional dependency not found: $dep_name ($dep_desc)")
        fi
    done <<< "$(echo "$SCHEMA" | jq -c '.global.dependencies.optional[]? // empty' 2>/dev/null)"
fi

# ============================================================================
# DETECT ACTIVE PLUGINS
# ============================================================================

# Determine which plugins are likely active based on environment and context
ACTIVE_PLUGINS=()

# Check for Salesforce indicators
if [ -n "${SALESFORCE_ORG_ALIAS:-}" ] || [ -n "${SF_TARGET_ORG:-}" ] || [ -n "${SFDX_DEFAULTUSERNAME:-}" ]; then
    ACTIVE_PLUGINS+=("salesforce-plugin")
elif command -v sf &> /dev/null && sf org list &> /dev/null; then
    # sf CLI is installed and configured
    ACTIVE_PLUGINS+=("salesforce-plugin")
fi

# Check for HubSpot indicators
if [ -n "${HUBSPOT_PRIVATE_APP_TOKEN:-}" ] || [ -n "${HUBSPOT_ACCESS_TOKEN:-}" ]; then
    ACTIVE_PLUGINS+=("hubspot-plugin")
fi

# Check for Marketo indicators
if [ -n "${MARKETO_CLIENT_ID:-}" ] && [ -n "${MARKETO_CLIENT_SECRET:-}" ]; then
    ACTIVE_PLUGINS+=("marketo-plugin")
fi

# Cross-platform plugin is always active
ACTIVE_PLUGINS+=("opspal-core")

# Developer tools plugin active if npm is available
if command -v npm &> /dev/null; then
    ACTIVE_PLUGINS+=("developer-tools-plugin")
fi

log_verbose "Active plugins detected: ${ACTIVE_PLUGINS[*]}"

# ============================================================================
# PLUGIN-SPECIFIC VALIDATION
# ============================================================================

for plugin in "${ACTIVE_PLUGINS[@]}"; do
    log_verbose "Validating $plugin requirements..."

    # Get plugin config from schema
    PLUGIN_CONFIG=$(echo "$SCHEMA" | jq -c ".plugins[\"$plugin\"] // empty" 2>/dev/null)

    if [ -z "$PLUGIN_CONFIG" ] || [ "$PLUGIN_CONFIG" == "null" ]; then
        log_verbose "  No schema config for $plugin"
        continue
    fi

    # Check required environment variables
    while IFS= read -r req_json; do
        if [ -z "$req_json" ]; then continue; fi

        var_name=$(echo "$req_json" | jq -r '.name // empty')
        var_desc=$(echo "$req_json" | jq -r '.description // empty')
        var_example=$(echo "$req_json" | jq -r '.example // empty')

        if [ -z "$var_name" ]; then continue; fi

        # Check if variable is set
        var_value="${!var_name:-}"

        if [ -z "$var_value" ]; then
            # Check alternatives
            alternatives=$(echo "$req_json" | jq -r '.alternatives[]? // empty' 2>/dev/null)
            found_alt=""

            while IFS= read -r alt_name; do
                if [ -n "$alt_name" ]; then
                    alt_value="${!alt_name:-}"
                    if [ -n "$alt_value" ]; then
                        found_alt="$alt_name"
                        log_verbose "  ✓ $var_name (via alternative: $alt_name)"
                        break
                    fi
                fi
            done <<< "$alternatives"

            if [ -z "$found_alt" ]; then
                ERRORS+=("$plugin: Missing required variable $var_name ($var_desc)")
                if [ -n "$var_example" ]; then
                    REMEDIATIONS+=("Set $var_name: export $var_name=\"$var_example\"")
                else
                    REMEDIATIONS+=("Set $var_name: export $var_name=\"<value>\"")
                fi
            fi
        else
            # Validate pattern if specified
            pattern=$(echo "$req_json" | jq -r '.validation.pattern // empty' 2>/dev/null)

            if [ -n "$pattern" ] && [ "$pattern" != "null" ]; then
                if ! echo "$var_value" | grep -qE "$pattern"; then
                    WARNINGS+=("$plugin: $var_name value may be invalid (pattern: $pattern)")
                fi
            fi

            log_verbose "  ✓ $var_name is set"
        fi
    done <<< "$(echo "$PLUGIN_CONFIG" | jq -c '.required[]? // empty' 2>/dev/null)"

    # Check deprecated variables (warnings only)
    while IFS= read -r opt_json; do
        if [ -z "$opt_json" ]; then continue; fi

        var_name=$(echo "$opt_json" | jq -r '.name // empty')
        is_deprecated=$(echo "$opt_json" | jq -r '.deprecated // false' 2>/dev/null)
        use_instead=$(echo "$opt_json" | jq -r '.useInstead // empty' 2>/dev/null)

        if [ "$is_deprecated" == "true" ]; then
            var_value="${!var_name:-}"
            if [ -n "$var_value" ]; then
                if [ -n "$use_instead" ]; then
                    WARNINGS+=("$plugin: $var_name is deprecated, use $use_instead instead")
                else
                    WARNINGS+=("$plugin: $var_name is deprecated")
                fi
            fi
        fi
    done <<< "$(echo "$PLUGIN_CONFIG" | jq -c '.optional[]? // empty' 2>/dev/null)"

    # Check plugin-specific dependencies
    if [ "$SKIP_DEPS" != "1" ]; then
        while IFS= read -r dep_json; do
            if [ -z "$dep_json" ]; then continue; fi

            dep_name=$(echo "$dep_json" | jq -r '.name // empty')
            dep_check=$(echo "$dep_json" | jq -r '.check // empty')
            dep_install=$(echo "$dep_json" | jq -r '.installCommand // empty')

            if [ -z "$dep_name" ] || [ -z "$dep_check" ]; then continue; fi

            if ! eval "$dep_check" &>/dev/null; then
                ERRORS+=("$plugin: Missing dependency $dep_name")
                if [ -n "$dep_install" ]; then
                    REMEDIATIONS+=("Install $dep_name: $dep_install")
                fi
            else
                log_verbose "  ✓ $dep_name dependency satisfied"
            fi
        done <<< "$(echo "$PLUGIN_CONFIG" | jq -c '.dependencies.required[]? // empty' 2>/dev/null)"
    fi
done

# ============================================================================
# INTEGRATION VALIDATION
# ============================================================================

log_verbose "Checking integration configurations..."

# Check Asana integration
if [ -n "${ASANA_ACCESS_TOKEN:-}" ]; then
    ASANA_CONFIG=$(echo "$SCHEMA" | jq -c '.integrations.asana // empty' 2>/dev/null)

    if [ -n "$ASANA_CONFIG" ]; then
        # Check workspace ID
        if [ -z "${ASANA_WORKSPACE_ID:-}" ] && [ -z "${ASANA_WORKSPACE_GID:-}" ]; then
            WARNINGS+=("Asana: Token set but ASANA_WORKSPACE_ID not configured")
        fi
    fi
fi

# Check Supabase integration
if [ -n "${SUPABASE_URL:-}" ]; then
    if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ] && [ -z "${SUPABASE_ANON_KEY:-}" ]; then
        WARNINGS+=("Supabase: URL set but no key configured")
    fi
fi

# ============================================================================
# REPORT RESULTS
# ============================================================================

ERROR_COUNT=${#ERRORS[@]}
WARNING_COUNT=${#WARNINGS[@]}
REMEDIATION_COUNT=${#REMEDIATIONS[@]}

# Log validation results
log_entry "info" "Environment validation complete" "errors=$ERROR_COUNT,warnings=$WARNING_COUNT"

# Output results if there are issues
if [ $ERROR_COUNT -gt 0 ] || [ $WARNING_COUNT -gt 0 ]; then
    echo "" >&2
    echo "======================================================================" >&2
    echo "[ENVIRONMENT VALIDATION]" >&2
    echo "======================================================================" >&2
    echo "" >&2

    if [ $ERROR_COUNT -gt 0 ]; then
        echo "ERRORS ($ERROR_COUNT):" >&2
        for err in "${ERRORS[@]}"; do
            echo "  ✗ $err" >&2
        done
        echo "" >&2
    fi

    if [ $WARNING_COUNT -gt 0 ]; then
        echo "WARNINGS ($WARNING_COUNT):" >&2
        for warn in "${WARNINGS[@]}"; do
            echo "  ⚠ $warn" >&2
        done
        echo "" >&2
    fi

    if [ $REMEDIATION_COUNT -gt 0 ]; then
        echo "REMEDIATION STEPS:" >&2
        for rem in "${REMEDIATIONS[@]}"; do
            echo "  → $rem" >&2
        done
        echo "" >&2
    fi

    if [ "$STRICT_MODE" == "1" ] && [ $ERROR_COUNT -gt 0 ]; then
        echo "----------------------------------------------------------------------" >&2
        echo "Strict mode enabled. Fix errors above before proceeding." >&2
        echo "To disable strict mode: export ENV_VALIDATION_STRICT=0" >&2
        echo "======================================================================" >&2
        echo "" >&2
        exit 1
    fi

    echo "======================================================================" >&2
    echo "" >&2
fi

# ============================================================================
# ORG_SLUG AUTO-DETECTION FROM WORKING DIRECTORY
# ============================================================================

# Auto-detect ORG_SLUG from working directory if not already set
if [ -z "${ORG_SLUG:-}" ] && [ -z "${CLIENT_ORG:-}" ]; then
    CURRENT_DIR="$(pwd)"

    # Pattern: .../orgs/<org-name>/... or .../orgs/<org-name>
    if [[ "$CURRENT_DIR" =~ /orgs/([^/]+) ]]; then
        DETECTED_ORG="${BASH_REMATCH[1]}"

        # Validate: check if org directory exists
        ORG_DIR="${CURRENT_DIR%%/orgs/${DETECTED_ORG}*}/orgs/${DETECTED_ORG}"

        if [ -d "$ORG_DIR" ]; then
            export ORG_SLUG="$DETECTED_ORG"
            export CLIENT_ORG="$DETECTED_ORG"
            echo "" >&2
            echo "✨ Auto-detected client: $DETECTED_ORG" >&2
            echo "   Work-index auto-capture enabled for this session." >&2
            echo "" >&2
        fi
    fi
fi

# Only show tip if ORG_SLUG still not set after auto-detection
if [ -z "${ORG_SLUG:-}" ] && [ -z "${CLIENT_ORG:-}" ]; then
    echo "" >&2
    echo "💡 TIP: Set ORG_SLUG to enable work-index auto-capture:" >&2
    echo "   export ORG_SLUG=<client-org-name>" >&2
    echo "   Or navigate to orgs/<client>/ for auto-detection." >&2
    echo "" >&2
fi

# Export validation state for use by other scripts
export ENV_VALIDATION_ERROR_COUNT="$ERROR_COUNT"
export ENV_VALIDATION_WARNING_COUNT="$WARNING_COUNT"
export ENV_VALIDATION_PASSED=$( [ $ERROR_COUNT -eq 0 ] && echo "true" || echo "false" )

# Log success if verbose
if [ $ERROR_COUNT -eq 0 ] && [ "$VERBOSE" == "1" ]; then
    echo "[env-validation] ✓ All environment checks passed" >&2
fi

exit 0
