#!/usr/bin/env bash
# STATUS: SUPERSEDED — called as child by a registered dispatcher hook

##
## Post-SF-Command Hook - API Usage Tracking
##
## Automatically tracks Salesforce CLI API calls for quota monitoring.
## Intercepts all `sf` commands and logs them to the API usage monitor.
##
## Features:
## - Tracks sf data query, sf data update, sf project deploy commands
## - Calculates API call count based on operation type
## - Pre-operation quota validation
## - Alerts when approaching limits
##
## Version: 1.1.0 (Error Handler Integration)
## Phase: Phase 2 - Compliance Automation
## Date: 2025-11-24
##

# Enable strict mode
set -euo pipefail

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"

# Source standardized error handler for centralized logging
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    ERROR_HANDLER="${CLAUDE_PLUGIN_ROOT}/opspal-core/hooks/lib/error-handler.sh"
else
    ERROR_HANDLER="${SCRIPT_DIR}/../../opspal-core/hooks/lib/error-handler.sh"
fi

if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="post-sf-command"
    # Use lenient mode - API tracking is non-blocking
    set_lenient_mode 2>/dev/null || true
fi

# Load progress helper
source "$PLUGIN_ROOT/scripts/lib/hook-progress-helper.sh"

# API usage monitor script
API_MONITOR="$PLUGIN_ROOT/scripts/lib/api-usage-monitor.js"

# Check if API monitoring is enabled (default: enabled)
if [[ "${API_MONITORING_ENABLED:-true}" != "true" ]]; then
    exit 0
fi

# Get the command that was executed
COMMAND="${1:-}"
EXIT_CODE="${2:-0}"

# Extract command type and org
if [[ "$COMMAND" =~ ^(sf|sfdx)[[:space:]] ]]; then
    # Extract subcommand (e.g., "data query", "project deploy")
    SUBCOMMAND=$(echo "$COMMAND" | grep -oP '(sf|sfdx) \K[a-z]+ [a-z]+' || echo "unknown")
    
    # Extract org from command
    ORG=$(echo "$COMMAND" | grep -oP '(?:--target-org|-o)[[:space:]]+\K[^[:space:]]+' || echo "${SF_TARGET_ORG:-}")
    
    # Skip if no org found
    if [[ -z "$ORG" ]]; then
        exit 0
    fi
    
    # Determine call type and estimate API calls
    CALL_TYPE="unknown"
    API_CALLS=1
    
    case "$SUBCOMMAND" in
        "data query")
            CALL_TYPE="data query"
            API_CALLS=1
            ;;
        "data create"|"data update"|"data upsert"|"data delete")
            CALL_TYPE="data modification"
            # Estimate based on record count if available
            RECORD_COUNT=$(echo "$COMMAND" | grep -oP '(?:--file|-f)[[:space:]]+' && wc -l < "$FILE" 2>/dev/null || echo "1")
            API_CALLS=$((RECORD_COUNT / 200 + 1))  # Salesforce batches ~200 records per API call
            ;;
        "project deploy")
            CALL_TYPE="metadata deployment"
            # Deployments can use multiple API calls
            API_CALLS=5  # Conservative estimate
            ;;
        "apex run")
            CALL_TYPE="apex execution"
            API_CALLS=1
            ;;
        "apex test")
            CALL_TYPE="apex testing"
            # Test runs can use many API calls
            API_CALLS=3
            ;;
        *)
            # For other commands, track but don't estimate heavily
            CALL_TYPE="other"
            API_CALLS=1
            ;;
    esac
    
    # Track the API call
    if [[ -x "$API_MONITOR" ]]; then
        # Show progress for tracking
        progress_start "Tracking API usage for $SUBCOMMAND"

        # Get agent name if available
        AGENT_NAME="${CLAUDE_AGENT_NAME:-manual}"

        # Success based on exit code
        SUCCESS="true"
        if [[ "$EXIT_CODE" != "0" ]]; then
            SUCCESS="false"
        fi

        # Track in background to avoid slowing down operations
        (
            for ((i=0; i<API_CALLS; i++)); do
                node "$API_MONITOR" track "$ORG" "$CALL_TYPE" "$SUBCOMMAND" 2>/dev/null || true
            done
        ) &

        progress_complete "API usage tracked ($API_CALLS call(s))"
    fi

    # =========================================================================
    # Cache Invalidation After Bulk Operations (Phase 2.3 - Reflection Cohort Fix)
    # Clears metadata caches after bulk data operations to prevent stale data analysis.
    # Source: Reflection Cohort - Data Quality & Aggregation (Asana: 1212204315832256)
    # =========================================================================

    # Detect bulk operations that modify data
    if [[ "$SUBCOMMAND" =~ ^data\ (upsert|update|delete|import) ]] && [[ "$EXIT_CODE" == "0" ]]; then
        progress_start "Invalidating caches after bulk operation"

        # Clear schema cache (might have new custom fields after import)
        SCHEMA_CACHE="${TMPDIR:-/tmp}/salesforce-schema-cache"
        if [[ -d "$SCHEMA_CACHE" ]]; then
            rm -rf "$SCHEMA_CACHE/${ORG}-"* 2>/dev/null || true
        fi

        # Clear org-specific caches
        rm -f "${TMPDIR:-/tmp}/sf-cache/${ORG}-"* 2>/dev/null || true

        # Clear field metadata cache
        FIELD_CACHE="$PLUGIN_ROOT/data/field-metadata-cache.json"
        if [[ -f "$FIELD_CACHE" ]]; then
            # Remove entries for this org
            if command -v jq &>/dev/null; then
                jq "del(.\"${ORG}\")" "$FIELD_CACHE" > "$FIELD_CACHE.tmp" 2>/dev/null && \
                    mv "$FIELD_CACHE.tmp" "$FIELD_CACHE" || rm -f "$FIELD_CACHE.tmp"
            fi
        fi

        # Clear relationship cache
        RELATIONSHIP_CACHE="$PLUGIN_ROOT/data/org-schema-cache.json"
        if [[ -f "$RELATIONSHIP_CACHE" ]]; then
            if command -v jq &>/dev/null; then
                jq "del(.\"${ORG}\")" "$RELATIONSHIP_CACHE" > "$RELATIONSHIP_CACHE.tmp" 2>/dev/null && \
                    mv "$RELATIONSHIP_CACHE.tmp" "$RELATIONSHIP_CACHE" || rm -f "$RELATIONSHIP_CACHE.tmp"
            fi
        fi

        progress_complete "Caches invalidated for $ORG"
    fi

    # =========================================================================
    # Post-Deployment State Verification (Phase 1 Implementation)
    # Addresses 17 idempotency/state reflections by verifying deployed state
    # matches local metadata after successful deployments.
    # =========================================================================

    STATE_VERIFIER="$PLUGIN_ROOT/scripts/lib/post-deployment-state-verifier.js"

    # Only verify after successful project deploy commands
    if [[ "$SUBCOMMAND" == "project deploy" ]] && [[ "$EXIT_CODE" == "0" ]] && [[ -x "$STATE_VERIFIER" ]]; then
        # Check if verification is enabled (default: enabled)
        if [[ "${STATE_VERIFICATION_ENABLED:-true}" == "true" ]]; then
            progress_start "Running post-deployment state verification"

            # Extract source directory from command (--source-dir or -d)
            SOURCE_DIR=$(echo "$COMMAND" | grep -oP '(?:--source-dir|-d)[[:space:]]+\K[^[:space:]]+' || echo "")

            # Extract manifest path from command (--manifest or -x)
            MANIFEST=$(echo "$COMMAND" | grep -oP '(?:--manifest|-x)[[:space:]]+\K[^[:space:]]+' || echo "")

            # Default to force-app if no source specified
            if [[ -z "$SOURCE_DIR" ]] && [[ -z "$MANIFEST" ]]; then
                SOURCE_DIR="force-app/main/default"
            fi

            # Track verification results
            VERIFY_SUCCESS=0
            VERIFY_FAILED=0
            VERIFY_SKIPPED=0

            # Verify deployed components by scanning source directory
            if [[ -n "$SOURCE_DIR" ]] && [[ -d "$SOURCE_DIR" ]]; then
                # Verify Permission Sets (high-value, commonly fail silently)
                if [[ -d "$SOURCE_DIR/permissionsets" ]]; then
                    for PS_FILE in "$SOURCE_DIR/permissionsets"/*.permissionset-meta.xml; do
                        [[ -f "$PS_FILE" ]] || continue
                        PS_NAME=$(basename "$PS_FILE" .permissionset-meta.xml)
                        if node "$STATE_VERIFIER" "$ORG" "PermissionSet" "$PS_NAME" "$PS_FILE" 2>/dev/null; then
                            ((VERIFY_SUCCESS++))
                        else
                            ((VERIFY_FAILED++))
                            log_warn "State mismatch: PermissionSet $PS_NAME"
                        fi
                    done
                fi

                # Verify Profiles (frequently have silent deployment issues)
                if [[ -d "$SOURCE_DIR/profiles" ]]; then
                    for PROFILE_FILE in "$SOURCE_DIR/profiles"/*.profile-meta.xml; do
                        [[ -f "$PROFILE_FILE" ]] || continue
                        PROFILE_NAME=$(basename "$PROFILE_FILE" .profile-meta.xml)
                        if node "$STATE_VERIFIER" "$ORG" "Profile" "$PROFILE_NAME" "$PROFILE_FILE" 2>/dev/null; then
                            ((VERIFY_SUCCESS++))
                        else
                            ((VERIFY_FAILED++))
                            log_warn "State mismatch: Profile $PROFILE_NAME"
                        fi
                    done
                fi

                # Verify Custom Tabs (visibility issues common)
                if [[ -d "$SOURCE_DIR/tabs" ]]; then
                    for TAB_FILE in "$SOURCE_DIR/tabs"/*.tab-meta.xml; do
                        [[ -f "$TAB_FILE" ]] || continue
                        TAB_NAME=$(basename "$TAB_FILE" .tab-meta.xml)
                        if node "$STATE_VERIFIER" "$ORG" "CustomTab" "$TAB_NAME" "$TAB_FILE" 2>/dev/null; then
                            ((VERIFY_SUCCESS++))
                        else
                            ((VERIFY_FAILED++))
                            log_warn "State mismatch: CustomTab $TAB_NAME"
                        fi
                    done
                fi

                # Verify Layouts (field assignments often silently dropped)
                if [[ -d "$SOURCE_DIR/layouts" ]]; then
                    for LAYOUT_FILE in "$SOURCE_DIR/layouts"/*.layout-meta.xml; do
                        [[ -f "$LAYOUT_FILE" ]] || continue
                        LAYOUT_NAME=$(basename "$LAYOUT_FILE" .layout-meta.xml)
                        if node "$STATE_VERIFIER" "$ORG" "Layout" "$LAYOUT_NAME" "$LAYOUT_FILE" 2>/dev/null; then
                            ((VERIFY_SUCCESS++))
                        else
                            ((VERIFY_FAILED++))
                            log_warn "State mismatch: Layout $LAYOUT_NAME"
                        fi
                    done
                fi
            fi

            # Report verification results
            TOTAL=$((VERIFY_SUCCESS + VERIFY_FAILED))
            if [[ $TOTAL -gt 0 ]]; then
                if [[ $VERIFY_FAILED -eq 0 ]]; then
                    progress_complete "State verification passed ($VERIFY_SUCCESS components verified)"
                else
                    log_warn "State verification: $VERIFY_SUCCESS passed, $VERIFY_FAILED failed"
                    # Non-blocking - log but don't fail the deployment
                fi
            else
                progress_complete "State verification skipped (no verifiable components)"
            fi
        fi
    fi
fi

exit 0
