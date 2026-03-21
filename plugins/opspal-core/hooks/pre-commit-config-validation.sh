#!/usr/bin/env bash
#
# Pre-commit Config Validation Hook
#
# Validates all changed config files before commit to prevent schema/parse errors.
# Part of Phase 3: Prevention (CI/Pre-commit) for reflection cohort remediation.
#
# Validates:
#   - JSON files (including plugin.json manifests)
#   - YAML files (including config files)
#   - XML files (Salesforce metadata)
#
# Target: Block commits with invalid configs (0 schema/parse reflections from commits)
# Performance: < 2 seconds for typical commits
#
# Usage:
#   As git pre-commit hook:
#     ln -s ../../.claude-plugins/opspal-core/hooks/pre-commit-config-validation.sh .git/hooks/pre-commit
#
#   Manual execution:
#     bash pre-commit-config-validation.sh [--all] [--verbose]
#
# Exit codes:
#   0 = All validations passed
#   1 = Validation errors (commit blocked)
#   2 = Warnings only (commit allowed)
#

set -e

if ! command -v jq &>/dev/null; then
    echo "[pre-commit-config-validation] jq not found, skipping" >&2
    exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${SCRIPT_DIR}/.."
CORE_SCRIPTS="${PLUGIN_ROOT}/scripts/lib"

# Configuration
VALIDATE_ALL="${VALIDATE_ALL:-0}"
VERBOSE="${VERBOSE:-0}"
MAX_FILES="${MAX_FILES:-50}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
TOTAL_FILES=0
PASSED_FILES=0
FAILED_FILES=0
WARNED_FILES=0
ERRORS=()
WARNINGS=()

log() {
    if [ "$VERBOSE" = "1" ]; then
        echo -e "${BLUE}[pre-commit]${NC} $1" >&2
    fi
}

error() {
    echo -e "${RED}❌ ERROR:${NC} $1" >&2
}

warn() {
    echo -e "${YELLOW}⚠️  WARNING:${NC} $1" >&2
}

success() {
    echo -e "${GREEN}✅${NC} $1" >&2
}

# Parse arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --all) VALIDATE_ALL=1 ;;
        --verbose|-v) VERBOSE=1 ;;
        --help|-h)
            echo "Usage: $0 [--all] [--verbose]"
            echo "  --all      Validate all config files, not just staged"
            echo "  --verbose  Show detailed output"
            exit 0
            ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
    shift
done

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  PRE-COMMIT CONFIG VALIDATION"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Get list of files to validate
if [ "$VALIDATE_ALL" = "1" ]; then
    log "Validating ALL config files..."
    FILES=$(find . -type f \( -name "*.json" -o -name "*.yaml" -o -name "*.yml" -o -name "*.xml" \) \
        -not -path "./node_modules/*" \
        -not -path "./.git/*" \
        -not -path "./test-output/*" \
        -not -path "./.claude/*" \
        | head -n "$MAX_FILES")
else
    log "Validating staged config files..."
    FILES=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null | grep -E '\.(json|yaml|yml|xml)$' || true)
fi

if [ -z "$FILES" ]; then
    success "No config files to validate"
    exit 0
fi

FILE_COUNT=$(echo "$FILES" | wc -l)
log "Found $FILE_COUNT config file(s) to validate"

# Validate each file
validate_json() {
    local file="$1"

    # Check if file exists
    if [ ! -f "$file" ]; then
        return 0  # Skip non-existent files (maybe deleted)
    fi

    log "Validating JSON: $file"

    # Use node for JSON validation (more detailed errors than jq)
    if command -v node &>/dev/null; then
        RESULT=$(node -e "
            const fs = require('fs');
            try {
                JSON.parse(fs.readFileSync('$file', 'utf8'));
                console.log('VALID');
            } catch (e) {
                console.log('INVALID: ' + e.message);
            }
        " 2>&1)

        if [[ "$RESULT" == "INVALID:"* ]]; then
            ERRORS+=("$file: ${RESULT#INVALID: }")
            return 1
        fi
    else
        # Fallback to jq
        if ! jq empty "$file" 2>/dev/null; then
            ERRORS+=("$file: Invalid JSON syntax")
            return 1
        fi
    fi

    # Special validation for plugin.json files
    if [[ "$file" == *"plugin.json"* ]] || [[ "$file" == *".claude-plugin"*"/plugin.json"* ]]; then
        log "  Additional plugin manifest validation..."

        # Check required fields
        NAME=$(jq -r '.name // empty' "$file" 2>/dev/null)
        if [ -z "$NAME" ]; then
            ERRORS+=("$file: Plugin manifest missing required 'name' field")
            return 1
        fi

        VERSION=$(jq -r '.version // empty' "$file" 2>/dev/null)
        if [ -z "$VERSION" ]; then
            WARNINGS+=("$file: Plugin manifest missing 'version' field (recommended)")
        fi
    fi

    return 0
}

validate_yaml() {
    local file="$1"
    local validated=0

    if [ ! -f "$file" ]; then
        return 0
    fi

    log "Validating YAML: $file"

    # Use node with js-yaml for validation
    if [ -f "$CORE_SCRIPTS/parse-error-handler.js" ]; then
        RESULT=$(node "$CORE_SCRIPTS/parse-error-handler.js" parse "$file" --format yaml 2>&1) || true
        if echo "$RESULT" | grep -qi "YAML parsing requires js-yaml package"; then
            log "  parse-error-handler missing js-yaml, falling back to python3"
        elif echo "$RESULT" | grep -qi "parse.*failed\|error"; then
            ERRORS+=("$file: Invalid YAML syntax")
            return 1
        else
            validated=1
        fi
    fi

    if [ "$validated" = "0" ] && command -v python3 &>/dev/null; then
        # Fallback to Python
        if ! python3 -c "import yaml; yaml.safe_load(open('$file'))" 2>/dev/null; then
            ERRORS+=("$file: Invalid YAML syntax")
            return 1
        fi
        validated=1
    fi

    if [ "$validated" = "0" ]; then
        WARNINGS+=("$file: YAML validation skipped (no validator available)")
    fi

    return 0
}

validate_xml() {
    local file="$1"

    if [ ! -f "$file" ]; then
        return 0
    fi

    log "Validating XML: $file"

    # Use node xml parser for validation
    if [ -f "$CORE_SCRIPTS/parse-error-handler.js" ]; then
        local FORMAT="xml"
        if [[ "$file" == *".flow-meta.xml"* ]] || [[ "$file" == *".flow"* ]]; then
            FORMAT="flowXml"
        fi

        RESULT=$(node "$CORE_SCRIPTS/parse-error-handler.js" parse "$file" --format "$FORMAT" 2>&1) || true
        if echo "$RESULT" | grep -qi "parse.*failed\|error"; then
            ERRORS+=("$file: Invalid XML syntax")
            return 1
        fi
    elif command -v xmllint &>/dev/null; then
        # Fallback to xmllint
        if ! xmllint --noout "$file" 2>/dev/null; then
            ERRORS+=("$file: Invalid XML syntax")
            return 1
        fi
    else
        WARNINGS+=("$file: XML validation skipped (no validator available)")
    fi

    return 0
}

# Process each file
START_TIME=$(date +%s%N)

while IFS= read -r file; do
    [ -z "$file" ] && continue

    TOTAL_FILES=$((TOTAL_FILES + 1))

    case "$file" in
        *.json)
            if validate_json "$file"; then
                PASSED_FILES=$((PASSED_FILES + 1))
            else
                FAILED_FILES=$((FAILED_FILES + 1))
            fi
            ;;
        *.yaml|*.yml)
            if validate_yaml "$file"; then
                PASSED_FILES=$((PASSED_FILES + 1))
            else
                FAILED_FILES=$((FAILED_FILES + 1))
            fi
            ;;
        *.xml)
            if validate_xml "$file"; then
                PASSED_FILES=$((PASSED_FILES + 1))
            else
                FAILED_FILES=$((FAILED_FILES + 1))
            fi
            ;;
    esac
done <<< "$FILES"

END_TIME=$(date +%s%N)
DURATION=$(( (END_TIME - START_TIME) / 1000000 ))

# Output results
echo "───────────────────────────────────────────────────────────────────"
echo "  VALIDATION RESULTS"
echo "───────────────────────────────────────────────────────────────────"
echo ""
echo "Files validated: $TOTAL_FILES"
echo "Passed: $PASSED_FILES"
echo "Failed: $FAILED_FILES"
echo "Warnings: ${#WARNINGS[@]}"
echo "Duration: ${DURATION}ms"
echo ""

# Show errors
if [ ${#ERRORS[@]} -gt 0 ]; then
    echo -e "${RED}ERRORS (blocking commit):${NC}"
    for err in "${ERRORS[@]}"; do
        echo "  ❌ $err"
    done
    echo ""
fi

# Show warnings
if [ ${#WARNINGS[@]} -gt 0 ]; then
    echo -e "${YELLOW}WARNINGS (non-blocking):${NC}"
    for warn in "${WARNINGS[@]}"; do
        echo "  ⚠️  $warn"
    done
    echo ""
fi

echo "═══════════════════════════════════════════════════════════════════"

# Exit with appropriate code
if [ $FAILED_FILES -gt 0 ]; then
    echo ""
    error "Config validation FAILED. Fix errors before committing."
    echo ""
    echo "To fix JSON errors, try:"
    echo "  node .claude-plugins/opspal-core/scripts/lib/parse-error-handler.js auto-fix <file>"
    echo ""
    exit 1
elif [ ${#WARNINGS[@]} -gt 0 ]; then
    warn "Validation passed with warnings. Review before committing."
    exit 0
else
    success "All config files validated successfully!"
    exit 0
fi
