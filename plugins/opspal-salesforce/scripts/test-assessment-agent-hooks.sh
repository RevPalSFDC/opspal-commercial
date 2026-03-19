#!/usr/bin/env bash

##
# Test Assessment Agent Hooks
#
# Tests Stop hooks for 4 assessment agents:
#   - sfdc-revops-auditor
#   - sfdc-cpq-assessor
#   - sfdc-automation-auditor
#   - sfdc-architecture-auditor
#
# Usage:
#   bash test-assessment-agent-hooks.sh [agent-type]
#
# Arguments:
#   agent-type   Optional: revops, cpq, automation, or architecture (tests all if omitted)
##

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ASSET_RESOLVER="$SCRIPT_DIR/../../opspal-core/hooks/lib/resolve-encrypted-asset.sh"
if [[ -f "$ASSET_RESOLVER" ]]; then
    source "$ASSET_RESOLVER"
fi

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
log_info() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

log_section() {
    echo -e "\n${BLUE}=== $1 ===${NC}\n"
}

# Test directory setup
TEST_DIR="/tmp/test-assessment-hooks-$$"
mkdir -p "$TEST_DIR"

# Track success/failure
TESTS_PASSED=0
TESTS_FAILED=0

# Cleanup function
cleanup() {
    if [[ -d "$TEST_DIR" ]]; then
        read -p "Delete test directory $TEST_DIR? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm -rf "$TEST_DIR"
            log_info "Cleaned up test directory"
        else
            log_warn "Test directory preserved: $TEST_DIR"
        fi
    fi
}

trap cleanup EXIT

##
# Test RevOps Auditor Hooks
##
test_revops_hooks() {
    log_section "Testing RevOps Auditor Hooks"

    local work_dir="$TEST_DIR/revops-test"
    mkdir -p "$work_dir"

    # Create mock RevOps report
    cat > "$work_dir/revops-pipeline-analysis.md" <<'EOF'
# RevOps Pipeline Analysis

Pipeline Value: $2,500,000
45 opportunities in pipeline
Velocity: 42 days

## Conversion Rates
Lead to SQL conversion: 25%
SQL to Opportunity conversion: 60%
Opportunity to Close conversion: 22%

## Forecast Accuracy
Forecast accuracy: 78%
Variance: +5%

## Data Quality
Completeness: 82%
Accuracy: 88%
EOF

    # Create mock transcript
    local transcript="$work_dir/transcript.jsonl"
    echo '{"role":"assistant","content":"Completed RevOps assessment"}' > "$transcript"

    # Test 1: Run revops-summary-consolidator.js
    echo "Test 1: RevOps Summary Consolidator"
    if node scripts/lib/revops-summary-consolidator.js "$transcript" --output-dir "$work_dir"; then
        log_info "RevOps summary consolidator succeeded"
        TESTS_PASSED=$((TESTS_PASSED + 1))

        # Verify outputs
        if [[ -f "$work_dir/revops-executive-summary.html" ]]; then
            log_info "  Executive summary HTML generated"
        else
            log_error "  Executive summary HTML missing"
            TESTS_FAILED=$((TESTS_FAILED + 1))
        fi

        if [[ -f "$work_dir/revops-summary-manifest.json" ]]; then
            log_info "  Manifest JSON generated"
        else
            log_error "  Manifest JSON missing"
            TESTS_FAILED=$((TESTS_FAILED + 1))
        fi
    else
        log_error "RevOps summary consolidator failed"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi

    # Test 2: Run package-audit-deliverables.sh
    echo -e "\nTest 2: Package Deliverables"
    export ORG_ALIAS="test-org"
    if bash scripts/lib/package-audit-deliverables.sh "$work_dir" --org-alias "$ORG_ALIAS"; then
        log_info "Deliverable packaging succeeded"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_error "Deliverable packaging failed"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi

    echo ""
}

##
# Test CPQ Assessor Hooks
##
test_cpq_hooks() {
    log_section "Testing CPQ Assessor Hooks"

    local work_dir="$TEST_DIR/cpq-test"
    mkdir -p "$work_dir"

    # Create mock CPQ report
    cat > "$work_dir/cpq-utilization-analysis.md" <<'EOF'
# CPQ Utilization Analysis

Quote Adoption: 65%
Subscription Linkage: 72%
125 active quotes
18 products used

## Configuration
45 price rules
23 product rules
12 discount schedules

## Time Series
Recent: 80 records
Total: 150 records
Latest: 2025-01-05

## Data Quality
Completeness: 85%
Accuracy: 90%
EOF

    local transcript="$work_dir/transcript.jsonl"
    echo '{"role":"assistant","content":"Completed CPQ assessment"}' > "$transcript"

    # Test 1: Run cpq-scorecard-generator.js
    echo "Test 1: CPQ Scorecard Generator"
    local scorecard_generator="$PLUGIN_ROOT/scripts/lib/cpq-scorecard-generator.js"
    if declare -F resolve_enc_asset >/dev/null 2>&1; then
        scorecard_generator=$(resolve_enc_asset "$PLUGIN_ROOT" "opspal-salesforce" "scripts/lib/cpq-scorecard-generator.js")
    fi

    if node "$scorecard_generator" "$transcript" --output-dir "$work_dir"; then
        log_info "CPQ scorecard generator succeeded"
        TESTS_PASSED=$((TESTS_PASSED + 1))

        # Verify outputs
        if [[ -f "$work_dir/cpq-scorecard.html" ]]; then
            log_info "  Scorecard HTML generated"

            # Check for key content
            if grep -q "Utilization Score" "$work_dir/cpq-scorecard.html"; then
                log_info "  Utilization score present"
            else
                log_warn "  Utilization score not found in HTML"
            fi
        else
            log_error "  Scorecard HTML missing"
            TESTS_FAILED=$((TESTS_FAILED + 1))
        fi

        if [[ -f "$work_dir/cpq-scorecard-manifest.json" ]]; then
            log_info "  Manifest JSON generated"
        else
            log_error "  Manifest JSON missing"
            TESTS_FAILED=$((TESTS_FAILED + 1))
        fi
    else
        log_error "CPQ scorecard generator failed"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi

    echo ""
}

##
# Test Automation Auditor Hooks
##
test_automation_hooks() {
    log_section "Testing Automation Auditor Hooks"

    local work_dir="$TEST_DIR/automation-test"
    mkdir -p "$work_dir"

    # Create mock automation report
    cat > "$work_dir/automation-inventory.md" <<'EOF'
# Automation Inventory

## Components
25 flows
12 triggers
8 process builders
15 workflow rules

## Conflicts
5 potential conflicts detected on Account object
3 conflicts on Opportunity object

## Migration Candidates
8 Process Builders → Flow migrations recommended
EOF

    local transcript="$work_dir/transcript.jsonl"
    echo '{"role":"assistant","content":"Completed automation audit"}' > "$transcript"

    # Test 1: Run automation-audit-summary.js
    echo "Test 1: Automation Audit Summary"
    if node scripts/lib/automation-audit-summary.js "$transcript" --output-dir "$work_dir"; then
        log_info "Automation audit summary succeeded"
        TESTS_PASSED=$((TESTS_PASSED + 1))

        # Verify outputs
        if [[ -f "$work_dir/automation-audit-summary.html" ]]; then
            log_info "  Summary HTML generated"
        else
            log_error "  Summary HTML missing"
            TESTS_FAILED=$((TESTS_FAILED + 1))
        fi

        if [[ -f "$work_dir/automation-audit-manifest.json" ]]; then
            log_info "  Manifest JSON generated"
        else
            log_error "  Manifest JSON missing"
            TESTS_FAILED=$((TESTS_FAILED + 1))
        fi
    else
        log_error "Automation audit summary failed"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi

    echo ""
}

##
# Test Architecture Auditor Hooks
##
test_architecture_hooks() {
    log_section "Testing Architecture Auditor Hooks"

    local work_dir="$TEST_DIR/architecture-test"
    mkdir -p "$work_dir"

    # Create mock architecture reports
    cat > "$work_dir/architecture-health-report.md" <<'EOF'
# Architecture Health Report

Health Score: 78/100

## Components
- 125 custom objects
- 450 custom fields
- 35 integrations

## Findings
- Circular dependency in Account/Contact relationship
- Complex permission structure
- High Apex code complexity
EOF

    cat > "$work_dir/architecture-adr-001.md" <<'EOF'
# ADR-001: API Integration Pattern

Status: Accepted
Date: 2025-01-05

## Decision
Use middleware pattern for all external integrations
EOF

    local transcript="$work_dir/transcript.jsonl"
    echo '{"role":"assistant","content":"Completed architecture audit"}' > "$transcript"

    # Test 1: Run package-architecture-audit.sh
    echo "Test 1: Package Architecture Deliverables"
    export ORG_ALIAS="test-org"
    if bash scripts/lib/package-architecture-audit.sh "$work_dir" --org-alias "$ORG_ALIAS"; then
        log_info "Architecture deliverable packaging succeeded"
        TESTS_PASSED=$((TESTS_PASSED + 1))

        # Verify archive created
        local archive=$(find "$work_dir" -name "architecture-audit-*.zip" -o -type d -name "architecture-audit-*" | head -1)
        if [[ -n "$archive" ]]; then
            log_info "  Archive created: $(basename "$archive")"
        else
            log_warn "  Archive not found (zip may not be installed)"
        fi
    else
        log_error "Architecture deliverable packaging failed"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi

    echo ""
}

##
# Main test runner
##
main() {
    local agent_type="${1:-all}"

    echo "Assessment Agent Hooks Test Suite"
    echo "=================================="
    echo ""

    case "$agent_type" in
        revops)
            test_revops_hooks
            ;;
        cpq)
            test_cpq_hooks
            ;;
        automation)
            test_automation_hooks
            ;;
        architecture)
            test_architecture_hooks
            ;;
        all)
            test_revops_hooks
            test_cpq_hooks
            test_automation_hooks
            test_architecture_hooks
            ;;
        *)
            log_error "Unknown agent type: $agent_type"
            echo "Usage: $0 [revops|cpq|automation|architecture|all]"
            exit 1
            ;;
    esac

    # Summary
    log_section "Test Summary"
    echo "Tests Passed: $TESTS_PASSED"
    echo "Tests Failed: $TESTS_FAILED"
    echo ""

    if [[ $TESTS_FAILED -eq 0 ]]; then
        log_info "All tests passed! ✨"
        exit 0
    else
        log_error "Some tests failed"
        exit 1
    fi
}

main "$@"
