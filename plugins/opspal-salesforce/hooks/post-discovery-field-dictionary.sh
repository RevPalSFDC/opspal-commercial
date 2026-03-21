#!/usr/bin/env bash
#
# Post-Discovery Field Dictionary Hook
#
# Purpose: Automatically populate metadata cache and generate field dictionary
#          after sfdc-discovery agent completes.
#
# Trigger: Stop hook - runs when any agent stops
# Pattern: Only activates for sfdc-discovery agent
#
# Pipeline:
#   sfdc-discovery completes
#   → org-metadata-cache.js refresh (fast, <30s)
#   → field-dictionary-generator.js generate (fast, <10s)
#   → Field dictionary ready for reporting agents
#
# Environment:
#   SF_TARGET_ORG or ORG_SLUG - Org to process
#   SKIP_FIELD_DICTIONARY=1   - Disable this hook
#   FIELD_DICT_VERBOSE=1      - Verbose output
#
# Version: 1.0.0
# Date: 2026-01-28
# Related: LLM-ready Field Dictionary system (feat: 21a84f4)
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Configuration
ENABLED="${SKIP_FIELD_DICTIONARY:-0}"
VERBOSE="${FIELD_DICT_VERBOSE:-0}"

# Scripts
METADATA_CACHE_SCRIPT="$PLUGIN_ROOT/scripts/lib/org-metadata-cache.js"
FIELD_DICT_SCRIPT="$PLUGIN_ROOT/scripts/lib/field-dictionary-generator.js"

# Read hook input (Stop hook receives transcript info)
HOOK_INPUT=""
if [ ! -t 0 ]; then
    HOOK_INPUT=$(cat)
fi

# Early exit if disabled
if [ "$ENABLED" = "1" ]; then
    echo '{"status":"skipped","reason":"Field dictionary disabled"}'
    exit 0
fi

# ============================================================================
# Functions
# ============================================================================

log_verbose() {
    if [ "$VERBOSE" = "1" ]; then
        echo "[post-discovery-dict] $1" >&2
    fi
}

log_info() {
    echo "[post-discovery-dict] $1" >&2
}

# Extract stop_hook_agent_name from hook input
get_agent_name() {
    if [ -n "$HOOK_INPUT" ] && command -v jq &>/dev/null; then
        echo "$HOOK_INPUT" | jq -r '.stop_hook_agent_name // ""' 2>/dev/null || echo ""
    else
        echo ""
    fi
}

# Normalize agent name (remove prefixes like "salesforce-plugin:")
normalize_agent() {
    local agent="$1"
    echo "$agent" | sed -E 's/^[a-z]+-[a-z]+://' | sed -E 's/^[a-z]+-plugin://' | sed -E 's/^opspal-[a-z]+://'
}

# Extract org alias from environment or context
get_org_alias() {
    # Priority 1: SF_TARGET_ORG
    if [ -n "${SF_TARGET_ORG:-}" ]; then
        echo "$SF_TARGET_ORG"
        return 0
    fi

    # Priority 2: SALESFORCE_ORG_ALIAS
    if [ -n "${SALESFORCE_ORG_ALIAS:-}" ]; then
        echo "$SALESFORCE_ORG_ALIAS"
        return 0
    fi

    # Priority 3: ORG_SLUG (may be client name, need to find SF alias)
    if [ -n "${ORG_SLUG:-}" ]; then
        # Check if there's a mapping in orgs/{slug}/platforms/salesforce/
        local sf_dir="orgs/${ORG_SLUG}/platforms/salesforce"
        if [ -d "$sf_dir" ]; then
            # Look for instance.yaml or .instance-config.json
            for instance_dir in "$sf_dir"/*/; do
                if [ -f "${instance_dir}instance.yaml" ]; then
                    local alias
                    alias=$(grep -E '^org_alias:' "${instance_dir}instance.yaml" 2>/dev/null | head -1 | sed 's/org_alias: *//')
                    if [ -n "$alias" ]; then
                        echo "$alias"
                        return 0
                    fi
                fi
                if [ -f "${instance_dir}.instance-config.json" ]; then
                    local alias
                    alias=$(jq -r '.orgAlias // empty' "${instance_dir}.instance-config.json" 2>/dev/null)
                    if [ -n "$alias" ]; then
                        echo "$alias"
                        return 0
                    fi
                fi
            done
        fi

        # Fallback: use ORG_SLUG directly as alias
        echo "$ORG_SLUG"
        return 0
    fi

    # Priority 4: Try to get default org from sf cli
    local default_org
    default_org=$(sf config get target-org --json 2>/dev/null | jq -r '.result[0].value // empty' 2>/dev/null || echo "")
    if [ -n "$default_org" ]; then
        echo "$default_org"
        return 0
    fi

    return 1
}

# Get org slug for dictionary output path
get_org_slug() {
    if [ -n "${ORG_SLUG:-}" ]; then
        echo "$ORG_SLUG"
        return 0
    fi

    # Derive from org alias if not set
    local alias="$1"
    # Simple sanitization: lowercase, replace spaces with hyphens
    echo "$alias" | tr '[:upper:]' '[:lower:]' | tr ' ' '-'
}

# Populate metadata cache
populate_cache() {
    local org_alias="$1"

    if [ ! -f "$METADATA_CACHE_SCRIPT" ]; then
        log_verbose "Metadata cache script not found: $METADATA_CACHE_SCRIPT"
        return 1
    fi

    log_info "Refreshing metadata cache for $org_alias..."

    # Run cache refresh (or init if first time)
    if node "$METADATA_CACHE_SCRIPT" info "$org_alias" >/dev/null 2>&1; then
        node "$METADATA_CACHE_SCRIPT" refresh "$org_alias" >/dev/null 2>&1 || {
            log_verbose "Cache refresh failed, attempting init"
            node "$METADATA_CACHE_SCRIPT" init "$org_alias" >/dev/null 2>&1
        }
    else
        node "$METADATA_CACHE_SCRIPT" init "$org_alias" >/dev/null 2>&1
    fi
}

# Generate field dictionary
generate_dictionary() {
    local org_alias="$1"
    local org_slug="$2"

    if [ ! -f "$FIELD_DICT_SCRIPT" ]; then
        log_verbose "Field dictionary script not found: $FIELD_DICT_SCRIPT"
        return 1
    fi

    log_info "Generating field dictionary for $org_slug (from $org_alias)..."

    # Ensure output directory exists
    local output_dir="orgs/${org_slug}/configs"
    mkdir -p "$output_dir"

    # Generate dictionary
    node "$FIELD_DICT_SCRIPT" generate "$org_alias" \
        --output "$output_dir/field-dictionary.yaml" \
        --skip-system >/dev/null 2>&1

    if [ -f "$output_dir/field-dictionary.yaml" ]; then
        log_info "Field dictionary created: $output_dir/field-dictionary.yaml"
        return 0
    else
        log_verbose "Dictionary generation completed but file not found"
        return 1
    fi
}

# ============================================================================
# Main Logic
# ============================================================================

# Check if this is a discovery agent
AGENT_NAME=$(get_agent_name)
NORMALIZED_AGENT=$(normalize_agent "$AGENT_NAME")

log_verbose "Stop hook triggered for agent: $AGENT_NAME (normalized: $NORMALIZED_AGENT)"

# Only run for sfdc-discovery or sfdc-state-discovery
case "$NORMALIZED_AGENT" in
    sfdc-discovery|sfdc-state-discovery|state-discovery)
        log_verbose "Discovery agent detected, proceeding with field dictionary pipeline"
        ;;
    *)
        log_verbose "Not a discovery agent, skipping"
        echo '{"status":"skipped","reason":"Not a discovery agent"}'
        exit 0
        ;;
esac

# Get org alias
ORG_ALIAS=$(get_org_alias || echo "")

if [ -z "$ORG_ALIAS" ]; then
    log_verbose "Could not determine org alias, skipping field dictionary generation"
    echo '{"status":"skipped","reason":"No org alias"}'
    exit 0
fi

ORG_SLUG_VAL=$(get_org_slug "$ORG_ALIAS")

log_info "Post-discovery pipeline starting..."
log_info "  Org Alias: $ORG_ALIAS"
log_info "  Org Slug: $ORG_SLUG_VAL"

# Export ORG_SLUG for org-centric path resolution
export ORG_SLUG="$ORG_SLUG_VAL"

# Step 1: Populate/refresh metadata cache
if ! populate_cache "$ORG_ALIAS"; then
    log_info "Warning: Metadata cache population failed, continuing anyway"
fi

# Step 2: Generate field dictionary
if generate_dictionary "$ORG_ALIAS" "$ORG_SLUG_VAL"; then
    echo "" >&2
    echo "┌─────────────────────────────────────────────────────────────────┐" >&2
    echo "│  📚 FIELD DICTIONARY GENERATED                                   │" >&2
    echo "├─────────────────────────────────────────────────────────────────┤" >&2
    echo "│  Org: $ORG_ALIAS" >&2
    echo "│  Dictionary: orgs/${ORG_SLUG_VAL}/configs/field-dictionary.yaml" >&2
    echo "│                                                                 │" >&2
    echo "│  Reporting agents will now receive field context automatically. │" >&2
    echo "│  Run /enrich-field-dictionary to add business context.          │" >&2
    echo "└─────────────────────────────────────────────────────────────────┘" >&2
    echo "" >&2
else
    log_info "Field dictionary generation incomplete - run manually with:"
    log_info "  /generate-field-dictionary $ORG_SLUG_VAL --sf-alias $ORG_ALIAS"
fi

# Output valid JSON to stdout for hook system
echo '{"status":"ok"}'
exit 0
