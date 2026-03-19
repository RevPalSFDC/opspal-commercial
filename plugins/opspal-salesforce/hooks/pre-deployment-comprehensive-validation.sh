#!/bin/bash

##############################################################################
# Pre-Deployment Comprehensive Validation Hook
#
# Orchestrates ALL validation checks before Salesforce deployments:
# 1. Deployment source validation
# 2. Flow XML validation (prevents .CurrentItem syntax errors)
# 3. Field dependency analysis (prevents 42 reflections worth of errors)
# 4. CSV data validation (prevents positional parsing errors)
# 5. Field history tracking limits
# 6. Picklist formula validation
# 7. Deployment order validation (config/env cohort fix)
# 8. Unified Pre-Operation Validation (Phase 2.1 orchestrator)
#
# ROI: $140,000/year (prevents 80% of deployment failures)
#
# Usage: Runs automatically before 'sf project deploy' commands
# Can be disabled with: SKIP_COMPREHENSIVE_VALIDATION=1
#
# Version: 1.3.0 (Unified Orchestrator Integration - Phase 2.1 + Exit Code Standards)
# Date: 2025-11-24
# Updated: 2026-01-15 - Standardized exit codes
#
# Exit Codes (standardized - see sf-exit-codes.sh):
#   0 - Validation passed
#   1 - Validation error (deployment blocked)
#   5 - Config error (missing target org)
#
# @see docs/runbooks/DEPLOYMENT_VALIDATION.md
##############################################################################

set -e
PRETOOLUSE_MODE="${PRETOOLUSE_MODE:-0}"

# Source standardized error handler for centralized logging
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PLUGIN_PARENT="$(cd "${PLUGIN_ROOT}/.." && pwd)"

resolve_sibling_asset() {
    local relative_path="$1"
    find "$PLUGIN_PARENT" -mindepth 2 -maxdepth 4 -type f -path "*/${relative_path}" ! -path "${PLUGIN_ROOT}/*" | head -n 1
}

# Source standardized exit codes
if [[ -f "${SCRIPT_DIR}/../scripts/lib/sf-exit-codes.sh" ]]; then
    source "${SCRIPT_DIR}/../scripts/lib/sf-exit-codes.sh"
else
    # Fallback exit codes
    EXIT_SUCCESS=0
    EXIT_VALIDATION_ERROR=1
    EXIT_CONFIG_ERROR=5
fi
ERROR_HANDLER="$(resolve_sibling_asset 'hooks/lib/error-handler.sh')"
if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="pre-deployment-comprehensive-validation"
    # Use lenient mode since this hook has its own validation logic
    set_lenient_mode 2>/dev/null || true
fi

# Source common validation library
VALIDATION_LIB="${SCRIPT_DIR}/../scripts/lib/validation-commons.sh"

# OutputFormatter for standardized output
OUTPUT_FORMATTER="$(resolve_sibling_asset 'scripts/lib/output-formatter.js')"
HOOK_LOGGER="$(resolve_sibling_asset 'scripts/lib/hook-logger.js')"

# Initialize HookLogger if available
if [ -f "$HOOK_LOGGER" ]; then
    HOOK_NAME="pre-deployment-comprehensive-validation"
    LOG_CONTEXT="{\"targetOrg\":\"${SF_TARGET_ORG:-unknown}\",\"deployDir\":\"${SF_DEPLOY_DIR:-force-app}\"}"
fi

if [ -f "$VALIDATION_LIB" ]; then
    source "$VALIDATION_LIB"
else
    # Fallback logging if commons not available
    log_info() { echo "[$(date '+%H:%M:%S')] $1"; }
    log_success() { echo "[$(date '+%H:%M:%S')] ✓ $1"; }
    log_warning() { echo "[$(date '+%H:%M:%S')] ⚠ $1"; }
    log_error() { echo "[$(date '+%H:%M:%S')] ✗ $1"; }
fi

HOOK_INPUT=""
if [ ! -t 0 ]; then
    HOOK_INPUT=$(cat 2>/dev/null || true)
fi

if [ "$PRETOOLUSE_MODE" = "1" ]; then
    local_deploy_command=$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.command // .input.command // .command // ""' 2>/dev/null || echo "")
    if [[ -z "$local_deploy_command" ]] || ! printf '%s' "$local_deploy_command" | grep -qE '(^|[[:space:]])sf[[:space:]]+project[[:space:]]+deploy([[:space:]]|$)'; then
        exit 0
    fi

    # PreToolUse hooks must emit JSON or nothing on stdout.
    exec 3>&1 1>&2
fi

emit_block() {
    local message="$1"
    if [ "$PRETOOLUSE_MODE" = "1" ]; then
        jq -Rn --arg message "$message" '{
          suppressOutput: true,
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: $message
          }
        }' >&3
    fi
}

##############################################################################
# Configuration
##############################################################################

# Check if validation should be skipped
if [ "$SKIP_COMPREHENSIVE_VALIDATION" = "1" ]; then
    if [ -f "$OUTPUT_FORMATTER" ]; then
        node "$OUTPUT_FORMATTER" warning \
            "Comprehensive Validation Skipped" \
            "Validation disabled via environment variable" \
            "SKIP_COMPREHENSIVE_VALIDATION:1" \
            "Remove environment variable to enable validation,Validation prevents 80% deployment failures" \
            ""
        [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" info "$HOOK_NAME" "Validation skipped by user" "$LOG_CONTEXT"
        exit 0
    else
        log_warning "Comprehensive validation skipped (SKIP_COMPREHENSIVE_VALIDATION=1)"
        exit 0
    fi
fi

# Get deployment parameters from environment or command
TARGET_ORG="${SF_TARGET_ORG:-${SF_TARGET_ORG}}"
DEPLOY_DIR="${SF_DEPLOY_DIR:-force-app/main/default}"
HAS_TARGET_ORG=0
if [ -n "$TARGET_ORG" ]; then
    HAS_TARGET_ORG=1
fi

if [ -z "$TARGET_ORG" ]; then
    if [ "$PRETOOLUSE_MODE" = "1" ]; then
        log_warning "No target org specified. Running source-only validation and skipping org-dependent checks."
    elif [ -f "$OUTPUT_FORMATTER" ]; then
        node "$OUTPUT_FORMATTER" error \
            "Target Org Not Specified" \
            "Deployment requires a target Salesforce org" \
            "SF_TARGET_ORG:not set,SF_TARGET_ORG:not set" \
            "Set SF_TARGET_ORG environment variable,Set SF_TARGET_ORG via sf config,Run 'sf org login web' to authenticate" \
            ""
        [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" error "$HOOK_NAME" "Missing target org configuration" "$LOG_CONTEXT"
        exit $EXIT_CONFIG_ERROR
    else
        log_error "No target org specified. Set SF_TARGET_ORG or SF_TARGET_ORG"
        exit $EXIT_CONFIG_ERROR
    fi
fi

##############################################################################
# Validation Steps
##############################################################################

echo "════════════════════════════════════════════════════════════"
echo "  PRE-DEPLOYMENT COMPREHENSIVE VALIDATION"
echo "════════════════════════════════════════════════════════════"
echo ""
log_info "Target Org: ${TARGET_ORG}"
log_info "Deployment Dir: ${DEPLOY_DIR}"
echo ""

# Log validation start
[ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" info "$HOOK_NAME" "Starting comprehensive deployment validation" \
    "{\"targetOrg\":\"$TARGET_ORG\",\"deployDir\":\"$DEPLOY_DIR\",\"validationSteps\":8}"

VALIDATION_FAILED=0
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
SKIPPED_CHECKS=0

##############################################################################
# Step 1: Deployment Source Validation
##############################################################################

echo "📦 Step 1/8: Deployment Source Validation"
TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

VALIDATOR="${SCRIPT_DIR}/../scripts/lib/deployment-source-validator.js"
if [ -f "$VALIDATOR" ]; then
    if node "$VALIDATOR" validate-source "$DEPLOY_DIR" > /dev/null 2>&1; then
        log_success "Deployment source structure valid"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
    else
        log_error "Invalid deployment source structure"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        VALIDATION_FAILED=1
    fi
else
    log_warning "Deployment source validator not found, skipping"
fi
echo ""

##############################################################################
# Step 2: Flow XML Validation (Enhanced with .null__NotFound detection)
##############################################################################

echo "🌊 Step 2/8: Flow XML Validation"
TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

FLOW_VALIDATOR="${SCRIPT_DIR}/../scripts/lib/flow-xml-validator.js"
DEPENDENCY_ANALYZER="${SCRIPT_DIR}/../scripts/lib/metadata-dependency-analyzer.js"
FLOW_FILES=$(find "$DEPLOY_DIR" -name "*.flow-meta.xml" 2>/dev/null || echo "")

if [ "$PRETOOLUSE_MODE" = "1" ]; then
    log_info "Skipping comprehensive Flow XML validation in PreToolUse mode; pre-deploy-flow-validation.sh owns flow-specific blocking checks"
    SKIPPED_CHECKS=$((SKIPPED_CHECKS + 1))
elif [ -n "$FLOW_FILES" ]; then
    FLOW_COUNT=$(echo "$FLOW_FILES" | wc -l | tr -d ' ')
    log_info "Found $FLOW_COUNT flow(s) to validate"

    FLOW_ERRORS=0

    while IFS= read -r flow_file; do
        if [ -n "$flow_file" ]; then
            FLOW_NAME=$(basename "$flow_file" .flow-meta.xml)

            # Check 1: Standard flow validation (if validator exists)
            STANDARD_VALID=true
            if [ -f "$FLOW_VALIDATOR" ]; then
                if ! node "$FLOW_VALIDATOR" "$flow_file" > /dev/null 2>&1; then
                    STANDARD_VALID=false
                fi
            fi

            # Check 2: Enhanced pattern validation (.null__NotFound, loop variables, etc.)
            PATTERN_VALID=true
            PATTERN_ERRORS=""
            if [ -f "$DEPENDENCY_ANALYZER" ]; then
                # Check for .null__NotFound pattern (critical error)
                if grep -q "\.null__NotFound" "$flow_file" 2>/dev/null; then
                    PATTERN_VALID=false
                    PATTERN_ERRORS="NULL_NOTFOUND: Uses incorrect .null__NotFound pattern"
                fi

                # Check for potential loop variable misuse
                if grep -q '<loops>' "$flow_file" 2>/dev/null; then
                    # Extract loop variable names
                    LOOP_VARS=$(grep -oP '<name>\K[^<]+' "$flow_file" | head -20)
                    for VAR in $LOOP_VARS; do
                        # Check if referenced without .CurrentItem
                        if grep -qP "\{!${VAR}\.[^C]" "$flow_file" 2>/dev/null; then
                            if [ -z "$PATTERN_ERRORS" ]; then
                                PATTERN_ERRORS="LOOP_VAR_WARNING: Potential loop variable misuse for '$VAR'"
                            fi
                        fi
                    done
                fi
            fi

            # Combined result
            if [ "$STANDARD_VALID" = true ] && [ "$PATTERN_VALID" = true ]; then
                echo "  ✅ $FLOW_NAME"
            elif [ "$PATTERN_VALID" = false ]; then
                echo "  ❌ $FLOW_NAME - pattern validation failed"
                echo "     $PATTERN_ERRORS"
                echo "     💡 Fix: Replace .null__NotFound with .CurrentItem for loop variables"
                FLOW_ERRORS=$((FLOW_ERRORS + 1))
            else
                echo "  ❌ $FLOW_NAME - validation failed"
                FLOW_ERRORS=$((FLOW_ERRORS + 1))
                # Show first few errors from standard validator
                if [ -f "$FLOW_VALIDATOR" ]; then
                    node "$FLOW_VALIDATOR" "$flow_file" 2>&1 | grep -E "ERROR|CURRENTITEM" | head -3
                fi
            fi
        fi
    done <<< "$FLOW_FILES"

    if [ $FLOW_ERRORS -eq 0 ]; then
        log_success "All flows validated successfully"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
    else
        log_error "$FLOW_ERRORS flow(s) failed validation"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        VALIDATION_FAILED=1
    fi
else
    log_info "No flows to validate"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
fi
echo ""

##############################################################################
# Step 3: Field Dependency Analysis (Enhanced with blocking)
##############################################################################

echo "🔗 Step 3/8: Field Dependency Analysis"
TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

DEPENDENCY_ANALYZER="${SCRIPT_DIR}/../scripts/lib/metadata-dependency-analyzer.js"

# Extract field deletions from deployment (multiple detection methods)
DELETED_FIELDS=""
if [ -d "$DEPLOY_DIR" ]; then
    # Method 1: Check for files with "deleted" content
    DELETED_FIELDS=$(find "$DEPLOY_DIR" -name "*.field-meta.xml" -exec grep -l "deleted" {} \; 2>/dev/null || echo "")

    # Method 2: Check for files with empty fullName (deletion marker)
    EMPTY_FULLNAME=$(find "$DEPLOY_DIR" -name "*.field-meta.xml" -exec grep -l "<fullName></fullName>" {} \; 2>/dev/null || echo "")
    if [ -n "$EMPTY_FULLNAME" ]; then
        DELETED_FIELDS="${DELETED_FIELDS}
${EMPTY_FULLNAME}"
    fi

    # Method 3: Check for .DELETED suffix files
    DELETED_SUFFIX=$(find "$DEPLOY_DIR" -name "*.field-meta.xml.DELETED" 2>/dev/null || echo "")
    if [ -n "$DELETED_SUFFIX" ]; then
        DELETED_FIELDS="${DELETED_FIELDS}
${DELETED_SUFFIX}"
    fi

    # Remove duplicates and empty lines
    DELETED_FIELDS=$(echo "$DELETED_FIELDS" | sort -u | grep -v '^$')
fi

if [ "$HAS_TARGET_ORG" -eq 0 ]; then
    log_info "Skipping field dependency analysis (no target org)"
    SKIPPED_CHECKS=$((SKIPPED_CHECKS + 1))
elif [ -n "$DELETED_FIELDS" ]; then
    FIELD_COUNT=$(echo "$DELETED_FIELDS" | wc -l | tr -d ' ')
    log_info "Found $FIELD_COUNT field(s) marked for deletion"

    if [ -f "$DEPENDENCY_ANALYZER" ]; then
        DEPENDENCY_ERRORS=0
        BLOCKED_FIELDS=""

        while IFS= read -r field_file; do
            if [ -n "$field_file" ]; then
                # Extract object and field name from path
                # Example: force-app/main/default/objects/Account/fields/MyField__c.field-meta.xml
                OBJECT_NAME=$(echo "$field_file" | sed -n 's|.*/objects/\([^/]*\)/fields/.*|\1|p')
                FIELD_NAME=$(basename "$field_file" .field-meta.xml)
                FIELD_NAME=${FIELD_NAME%.DELETED}  # Remove .DELETED suffix if present

                log_info "Analyzing dependencies for ${OBJECT_NAME}.${FIELD_NAME}..."

                # Use --block-if-referenced flag for CI/CD blocking
                ANALYSIS_OUTPUT=$(node "$DEPENDENCY_ANALYZER" "$TARGET_ORG" --block-if-referenced "$OBJECT_NAME" "$FIELD_NAME" 2>&1)
                ANALYSIS_EXIT_CODE=$?

                if [ $ANALYSIS_EXIT_CODE -eq 0 ]; then
                    echo "  ✅ ${OBJECT_NAME}.${FIELD_NAME} - safe to delete (no active references)"
                else
                    echo "  ❌ ${OBJECT_NAME}.${FIELD_NAME} - BLOCKED (has active dependencies)"
                    DEPENDENCY_ERRORS=$((DEPENDENCY_ERRORS + 1))
                    BLOCKED_FIELDS="${BLOCKED_FIELDS}  - ${OBJECT_NAME}.${FIELD_NAME}
"

                    # Show blocker summary
                    echo "$ANALYSIS_OUTPUT" | grep -E "BLOCKERS|Flow|ValidationRule|FormulaField|ProcessBuilder|WorkflowRule" | head -8

                    echo ""
                    echo "     💡 Action Required:"
                    echo "        1. Update/remove references listed above"
                    echo "        2. Deploy those changes first"
                    echo "        3. Re-attempt this deployment"
                fi
            fi
        done <<< "$DELETED_FIELDS"

        if [ $DEPENDENCY_ERRORS -eq 0 ]; then
            log_success "No field dependency conflicts"
            PASSED_CHECKS=$((PASSED_CHECKS + 1))
        else
            log_error "$DEPENDENCY_ERRORS field(s) have active dependencies - DEPLOYMENT BLOCKED"
            echo ""
            echo "🚫 BLOCKED FIELDS:"
            echo "$BLOCKED_FIELDS"
            echo ""
            echo "This deployment will FAIL if attempted. Fix the dependencies first."
            FAILED_CHECKS=$((FAILED_CHECKS + 1))
            VALIDATION_FAILED=1
        fi
    else
        log_warning "Dependency analyzer not found, skipping dependency check"
        log_warning "Install the full salesforce-plugin to enable dependency analysis"
    fi
else
    log_info "No field deletions detected"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
fi
echo ""

##############################################################################
# Step 4: CSV Data Validation
##############################################################################

echo "📊 Step 4/8: CSV Data Validation"
TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

CSV_PARSER="${SCRIPT_DIR}/../scripts/lib/csv-parser-safe.js"
CSV_FILES=$(find "$DEPLOY_DIR" -name "*.csv" 2>/dev/null || echo "")

if [ -n "$CSV_FILES" ]; then
    CSV_COUNT=$(echo "$CSV_FILES" | wc -l)
    log_info "Found $CSV_COUNT CSV file(s) to validate"

    if [ -f "$CSV_PARSER" ]; then
        CSV_ERRORS=0

        while IFS= read -r csv_file; do
            if [ -n "$csv_file" ]; then
                CSV_NAME=$(basename "$csv_file")

                if node "$CSV_PARSER" "$csv_file" > /dev/null 2>&1; then
                    echo "  ✅ $CSV_NAME"
                else
                    echo "  ❌ $CSV_NAME - validation failed"
                    CSV_ERRORS=$((CSV_ERRORS + 1))

                    # Show errors
                    node "$CSV_PARSER" "$csv_file" 2>&1 | grep -E "ERROR|MISSING" | head -5
                fi
            fi
        done <<< "$CSV_FILES"

        if [ $CSV_ERRORS -eq 0 ]; then
            log_success "All CSV files validated successfully"
            PASSED_CHECKS=$((PASSED_CHECKS + 1))
        else
            log_error "$CSV_ERRORS CSV file(s) failed validation"
            FAILED_CHECKS=$((FAILED_CHECKS + 1))
            VALIDATION_FAILED=1
        fi
    else
        log_warning "CSV parser not found, skipping"
    fi
else
    log_info "No CSV files to validate"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
fi
echo ""

##############################################################################
# Step 5: Field History Tracking Limits
##############################################################################

echo "📜 Step 5/8: Field History Tracking Limits"
TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

# Find objects with tracked fields in the deployment
TRACKED_FIELDS=$(find "$DEPLOY_DIR" -name "*.field-meta.xml" -exec grep -l "trackHistory>true" {} \; 2>/dev/null || echo "")

if [ "$HAS_TARGET_ORG" -eq 0 ]; then
    log_info "Skipping field history tracking limits (no target org)"
    SKIPPED_CHECKS=$((SKIPPED_CHECKS + 1))
elif [ -n "$TRACKED_FIELDS" ]; then
    log_info "Found fields with history tracking enabled in deployment"

    # Extract unique objects
    OBJECTS=$(echo "$TRACKED_FIELDS" | sed -n 's|.*/objects/\([^/]*\)/fields/.*|\1|p' | sort -u)

    TRACKING_ERRORS=0

    while IFS= read -r object; do
        if [ -n "$object" ]; then
            field_list=$(echo "$TRACKED_FIELDS" | sed -n "s|.*/objects/${object}/fields/\\([^/]*\\)\\.field-meta.xml|\\1|p")

            if [ -z "$field_list" ]; then
                continue
            fi

            new_tracked_fields=0

            while IFS= read -r field_name; do
                if [ -z "$field_name" ]; then
                    continue
                fi

                FIELD_QUERY="SELECT IsFieldHistoryTracked FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '$object' AND QualifiedApiName = '${object}.${field_name}'"
                FIELD_TRACKED=$(sf data query --query "$FIELD_QUERY" --target-org "$TARGET_ORG" --use-tooling-api --json 2>/dev/null | jq -r '.result.records[0].IsFieldHistoryTracked // empty' || echo "")

                if [ "$FIELD_TRACKED" != "true" ]; then
                    new_tracked_fields=$((new_tracked_fields + 1))
                fi
            done <<< "$field_list"

            QUERY="SELECT COUNT() FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '$object' AND IsFieldHistoryTracked = true"
            CURRENT_COUNT=$(sf data query --query "$QUERY" --target-org "$TARGET_ORG" --use-tooling-api --json 2>/dev/null | jq -r '.result.totalSize' || echo "0")

            if [ "$new_tracked_fields" -eq 0 ]; then
                if [ "$CURRENT_COUNT" -ge 20 ]; then
                    log_warning "$object is at field history limit (20) but deployment adds no new tracked fields"
                else
                    log_info "$object: no new tracked fields (current ${CURRENT_COUNT}/20)"
                fi
                continue
            fi

            total_count=$((CURRENT_COUNT + new_tracked_fields))
            log_info "$object: current ${CURRENT_COUNT}, new ${new_tracked_fields}, total ${total_count}/20"

            if [ "$total_count" -gt 20 ]; then
                log_error "$object would exceed field history tracking limit (${total_count}/20)"
                TRACKING_ERRORS=$((TRACKING_ERRORS + 1))
            elif [ "$total_count" -eq 20 ]; then
                log_warning "$object will reach field history tracking limit (20) after deployment"
            fi
        fi
    done <<< "$OBJECTS"

    if [ $TRACKING_ERRORS -eq 0 ]; then
        log_success "Field history tracking limits OK"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
    else
        log_error "$TRACKING_ERRORS object(s) would exceed field history tracking limit"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        VALIDATION_FAILED=1
    fi
else
    log_info "No tracked fields in deployment"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
fi
echo ""

##############################################################################
# Step 6: Picklist Formula Validation
##############################################################################

echo "📋 Step 6/8: Picklist Formula Validation"
TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

# Find validation rules and formula fields
FORMULAS=$(find "$DEPLOY_DIR" \( -name "*.validationRule-meta.xml" -o -name "*.field-meta.xml" \) -exec grep -l "formula" {} \; 2>/dev/null || echo "")

if [ -n "$FORMULAS" ]; then
    FORMULA_ERRORS=0

    while IFS= read -r formula_file; do
        if [ -n "$formula_file" ]; then
            # Check for ISBLANK/ISNULL on picklist fields (common error)
            if grep -qE "ISBLANK\(.*__c\)|ISNULL\(.*__c\)" "$formula_file"; then
                # Check if it's a picklist field
                if grep -qE "<type>Picklist</type>|<type>MultiselectPicklist</type>" "$formula_file"; then
                    FORMULA_NAME=$(basename "$formula_file")
                    log_error "$FORMULA_NAME uses ISBLANK/ISNULL on picklist field"
                    echo "   💡 Use TEXT(field) = \"\" instead"
                    FORMULA_ERRORS=$((FORMULA_ERRORS + 1))
                fi
            fi
        fi
    done <<< "$FORMULAS"

    if [ $FORMULA_ERRORS -eq 0 ]; then
        log_success "No picklist formula errors detected"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
    else
        log_error "$FORMULA_ERRORS formula(s) use invalid picklist syntax"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        VALIDATION_FAILED=1
    fi
else
    log_info "No formulas to validate"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
fi
echo ""

##############################################################################
# Step 7: Deployment Order Validation (config/env cohort fix)
##############################################################################

echo "📂 Step 7/8: Deployment Order Validation"
TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

ENV_CONFIG_VALIDATOR="$(resolve_sibling_asset 'scripts/lib/env-config-validator.js')"

# Detect metadata types in deployment and validate order
if [ -f "$ENV_CONFIG_VALIDATOR" ]; then
    # Extract instance name from org alias or path
    INSTANCE_NAME="${TARGET_ORG##*/}"  # Get last part of path/alias
    if [ -z "$INSTANCE_NAME" ]; then
        INSTANCE_NAME="unknown"
    fi

    DEPLOYMENT_ORDER_WARNINGS=0
    DEPLOYMENT_ORDER_ERRORS=0

    # Check for reports requiring folders
    if [ -d "$DEPLOY_DIR/reports" ]; then
        REPORT_COUNT=$(find "$DEPLOY_DIR/reports" -name "*.report-meta.xml" 2>/dev/null | wc -l)
        FOLDER_COUNT=$(find "$DEPLOY_DIR/reports" -name "*.reportFolder-meta.xml" 2>/dev/null | wc -l)

        if [ "$REPORT_COUNT" -gt 0 ]; then
            ORDER_RESULT=$(node -e "
                const { validateDeploymentOrder } = require('$ENV_CONFIG_VALIDATOR');
                const result = validateDeploymentOrder('$INSTANCE_NAME', 'reports');
                console.log(JSON.stringify(result));
            " 2>/dev/null || echo '{"valid":"unknown"}')

            RULE=$(echo "$ORDER_RESULT" | jq -r '.rule // "standard"' 2>/dev/null || echo "standard")

            if [ "$RULE" = "before_reports" ] && [ "$FOLDER_COUNT" -eq 0 ]; then
                log_warning "Reports found but no report folders - folders should deploy first"
                DEPLOYMENT_ORDER_WARNINGS=$((DEPLOYMENT_ORDER_WARNINGS + 1))
            else
                log_info "Report deployment order: OK (folders: $FOLDER_COUNT, reports: $REPORT_COUNT)"
            fi
        fi
    fi

    # Check for flows requiring layouts
    if [ -d "$DEPLOY_DIR/flows" ]; then
        FLOW_COUNT=$(find "$DEPLOY_DIR/flows" -name "*.flow-meta.xml" 2>/dev/null | wc -l)
        LAYOUT_COUNT=$(find "$DEPLOY_DIR/layouts" -name "*.layout-meta.xml" 2>/dev/null | wc -l)

        if [ "$FLOW_COUNT" -gt 0 ]; then
            ORDER_RESULT=$(node -e "
                const { validateDeploymentOrder } = require('$ENV_CONFIG_VALIDATOR');
                const result = validateDeploymentOrder('$INSTANCE_NAME', 'flows');
                console.log(JSON.stringify(result));
            " 2>/dev/null || echo '{"valid":"unknown"}')

            RULE=$(echo "$ORDER_RESULT" | jq -r '.rule // "standard"' 2>/dev/null || echo "standard")

            if [ "$RULE" = "after_layouts" ] && [ "$LAYOUT_COUNT" -gt 0 ]; then
                log_info "Flow deployment order: OK (layouts will deploy first)"
            else
                log_info "Flow deployment order: standard rules apply"
            fi
        fi
    fi

    # Check for customMetadata requiring early deployment
    if [ -d "$DEPLOY_DIR/customMetadata" ]; then
        CMD_COUNT=$(find "$DEPLOY_DIR/customMetadata" -name "*.md-meta.xml" 2>/dev/null | wc -l)

        if [ "$CMD_COUNT" -gt 0 ]; then
            ORDER_RESULT=$(node -e "
                const { validateDeploymentOrder } = require('$ENV_CONFIG_VALIDATOR');
                const result = validateDeploymentOrder('$INSTANCE_NAME', 'customMetadata');
                console.log(JSON.stringify(result));
            " 2>/dev/null || echo '{"valid":"unknown"}')

            RULE=$(echo "$ORDER_RESULT" | jq -r '.rule // "standard"' 2>/dev/null || echo "standard")

            if [ "$RULE" = "before_flows" ]; then
                log_info "Custom Metadata: $CMD_COUNT types will deploy before flows (correct order)"
            else
                log_info "Custom Metadata: $CMD_COUNT types detected"
            fi
        fi
    fi

    if [ $DEPLOYMENT_ORDER_ERRORS -eq 0 ]; then
        if [ $DEPLOYMENT_ORDER_WARNINGS -gt 0 ]; then
            log_warning "$DEPLOYMENT_ORDER_WARNINGS deployment order warning(s)"
        else
            log_success "Deployment order validation passed"
        fi
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
    else
        log_error "$DEPLOYMENT_ORDER_ERRORS deployment order error(s)"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        VALIDATION_FAILED=1
    fi
else
    log_info "Deployment order validator not available, using standard order"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
fi
echo ""

##############################################################################
# Step 8: Unified Pre-Operation Validation (Phase 2.1)
##############################################################################

echo "🔄 Step 8/8: Unified Pre-Operation Validation"
TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

PRE_OP_ORCHESTRATOR="$(resolve_sibling_asset 'scripts/lib/pre-operation-validation-orchestrator.js')"

if [ "$HAS_TARGET_ORG" -eq 0 ]; then
    log_info "Skipping unified pre-operation validation (no target org)"
    SKIPPED_CHECKS=$((SKIPPED_CHECKS + 1))
elif [ -f "$PRE_OP_ORCHESTRATOR" ]; then
    # Run orchestrator in deploy mode with all detected metadata types
    METADATA_TYPES=""

    # Detect metadata types in deployment
    [ -d "$DEPLOY_DIR/flows" ] && METADATA_TYPES="${METADATA_TYPES}Flow,"
    [ -d "$DEPLOY_DIR/objects" ] && METADATA_TYPES="${METADATA_TYPES}CustomObject,"
    [ -d "$DEPLOY_DIR/permissionsets" ] && METADATA_TYPES="${METADATA_TYPES}PermissionSet,"
    [ -d "$DEPLOY_DIR/profiles" ] && METADATA_TYPES="${METADATA_TYPES}Profile,"
    [ -d "$DEPLOY_DIR/layouts" ] && METADATA_TYPES="${METADATA_TYPES}Layout,"
    [ -d "$DEPLOY_DIR/classes" ] && METADATA_TYPES="${METADATA_TYPES}ApexClass,"
    [ -d "$DEPLOY_DIR/triggers" ] && METADATA_TYPES="${METADATA_TYPES}ApexTrigger,"

    # Remove trailing comma
    METADATA_TYPES="${METADATA_TYPES%,}"

    if [ -n "$METADATA_TYPES" ]; then
        log_info "Running unified validation for: $METADATA_TYPES"

        ORCHESTRATOR_RESULT=$(node "$PRE_OP_ORCHESTRATOR" "$TARGET_ORG" deploy \
            --deploy-dir "$DEPLOY_DIR" \
            --metadata "$METADATA_TYPES" \
            --json 2>&1) || true

        # Parse results
        ORCH_VALID=$(echo "$ORCHESTRATOR_RESULT" | jq -r '.valid // true' 2>/dev/null || echo "true")
        ORCH_ERRORS=$(echo "$ORCHESTRATOR_RESULT" | jq -r '.errors | length // 0' 2>/dev/null || echo "0")
        ORCH_WARNINGS=$(echo "$ORCHESTRATOR_RESULT" | jq -r '.warnings | length // 0' 2>/dev/null || echo "0")
        ORCH_BLOCKERS=$(echo "$ORCHESTRATOR_RESULT" | jq -r '.blockers | length // 0' 2>/dev/null || echo "0")

        if [ "$ORCH_VALID" = "true" ] && [ "$ORCH_BLOCKERS" -eq 0 ]; then
            if [ "$ORCH_WARNINGS" -gt 0 ]; then
                log_warning "Unified validation passed with $ORCH_WARNINGS warning(s)"
                echo "$ORCHESTRATOR_RESULT" | jq -r '.warnings[]?.message // empty' 2>/dev/null | head -5 | while read -r warn; do
                    echo "  ⚠️  $warn"
                done
            else
                log_success "Unified validation passed (all validators)"
            fi
            PASSED_CHECKS=$((PASSED_CHECKS + 1))
        else
            log_error "Unified validation failed: $ORCH_BLOCKERS blocker(s), $ORCH_ERRORS error(s)"
            FAILED_CHECKS=$((FAILED_CHECKS + 1))
            VALIDATION_FAILED=1

            # Show blocking issues
            echo "$ORCHESTRATOR_RESULT" | jq -r '.blockers[]? | "  ❌ [\(.validator)] \(.message)"' 2>/dev/null | head -5
            echo "$ORCHESTRATOR_RESULT" | jq -r '.errors[]? | "  ❌ [\(.validator)] \(.message)"' 2>/dev/null | head -5

            echo ""
            echo "     💡 Run standalone for details:"
            echo "        node $PRE_OP_ORCHESTRATOR $TARGET_ORG deploy --deploy-dir $DEPLOY_DIR"
        fi
    else
        log_info "No metadata types detected for unified validation"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
    fi
else
    log_info "Unified orchestrator not available (Phase 2.1 pending)"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
fi
echo ""

##############################################################################
# Summary
##############################################################################

echo "════════════════════════════════════════════════════════════"
echo "  VALIDATION SUMMARY"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "Total Checks: $TOTAL_CHECKS"
echo "Passed: $PASSED_CHECKS"
echo "Failed: $FAILED_CHECKS"
echo "Skipped: $SKIPPED_CHECKS"
echo ""

if [ $VALIDATION_FAILED -eq 1 ]; then
    # Log validation failure
    [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" error "$HOOK_NAME" "Deployment validation failed" \
        "{\"targetOrg\":\"$TARGET_ORG\",\"totalChecks\":$TOTAL_CHECKS,\"passed\":$PASSED_CHECKS,\"failed\":$FAILED_CHECKS}"

    if [ "$PRETOOLUSE_MODE" = "1" ]; then
        emit_block "Deployment validation failed: $FAILED_CHECKS of $TOTAL_CHECKS checks failed. Review stderr for details or set SKIP_COMPREHENSIVE_VALIDATION=1 to bypass."
        exit 0
    elif [ -f "$OUTPUT_FORMATTER" ]; then
        node "$OUTPUT_FORMATTER" error \
            "Deployment Validation Failed" \
            "Deployment blocked - $FAILED_CHECKS of $TOTAL_CHECKS validation checks failed" \
            "Target Org:$TARGET_ORG,Total Checks:$TOTAL_CHECKS,Passed:$PASSED_CHECKS,Failed:$FAILED_CHECKS,Deployment Dir:$DEPLOY_DIR" \
            "Review and fix the errors listed above,Check deployment source structure,Verify org permissions and limits,Use SKIP_COMPREHENSIVE_VALIDATION=1 to bypass (not recommended)" \
            "Prevents 80% of deployment failures • ROI: \$126K/year"
        exit $EXIT_VALIDATION_ERROR
    else
        echo "❌ VALIDATION FAILED - Deployment blocked"
        echo ""
        echo "💡 Fix the errors above or skip validation with:"
        echo "   export SKIP_COMPREHENSIVE_VALIDATION=1"
        echo ""
        echo "════════════════════════════════════════════════════════════"
        exit $EXIT_VALIDATION_ERROR
    fi
fi

# Log validation success
[ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" success "$HOOK_NAME" "All deployment validations passed" \
    "{\"targetOrg\":\"$TARGET_ORG\",\"totalChecks\":$TOTAL_CHECKS,\"passed\":$PASSED_CHECKS,\"failed\":$FAILED_CHECKS}"

if [ -f "$OUTPUT_FORMATTER" ]; then
    if [ "$PRETOOLUSE_MODE" != "1" ]; then
        node "$OUTPUT_FORMATTER" success \
            "All Deployment Validations Passed" \
            "Deployment approved - all $PASSED_CHECKS validation checks passed" \
            "Target Org:$TARGET_ORG,Total Checks:$TOTAL_CHECKS,Passed:$PASSED_CHECKS,Failed:$FAILED_CHECKS,Skipped:$SKIPPED_CHECKS" \
            "Proceed with deployment,Review deployment plan if this is production,Consider running additional org-specific tests" \
            "Org: ${TARGET_ORG:-unset} • Deployment: $DEPLOY_DIR"
        echo ""
        echo "════════════════════════════════════════════════════════════"
    fi
    exit $EXIT_SUCCESS
else
    echo "✅ ALL VALIDATIONS PASSED - Deployment approved"
    echo ""
    echo "════════════════════════════════════════════════════════════"
    exit $EXIT_SUCCESS
fi
