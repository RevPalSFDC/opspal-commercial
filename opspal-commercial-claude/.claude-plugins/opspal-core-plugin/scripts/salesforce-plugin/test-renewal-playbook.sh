#!/bin/bash

###############################################################################
# Test Script for Contract Renewal Playbook Infrastructure
#
# Validates all components built to prevent the 8 errors from 2025-10-03:
# 1. Idempotent operation wrapper
# 2. Field mapping engine
# 3. Operation linker
# 4. Contract renewal playbook
# 5. Instance-agnostic toolkit integration
#
# Usage: ./scripts/test-renewal-playbook.sh [org-alias]
###############################################################################

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Functions
log_info() {
    echo -e "${BLUE}ℹ ${NC}$1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
    ((TESTS_PASSED++))
}

log_error() {
    echo -e "${RED}✗${NC} $1"
    ((TESTS_FAILED++))
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

run_test() {
    ((TESTS_RUN++))
    echo ""
    log_info "Test $TESTS_RUN: $1"
}

# Header
echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║     Contract Renewal Playbook Infrastructure Test Suite      ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Get org alias
ORG_ALIAS=${1:-$SF_TARGET_ORG}
if [ -z "$ORG_ALIAS" ]; then
    log_error "No org alias provided and SF_TARGET_ORG not set"
    echo "Usage: $0 [org-alias]"
    exit 1
fi

log_info "Testing with org: $ORG_ALIAS"
echo ""

# ============================================================================
# Test 1: Idempotent Bulk Operation Wrapper
# ============================================================================
run_test "Idempotent Bulk Operation Wrapper - Module Load"

if node -e "const { IdempotentBulkOperation } = require('./scripts/lib/idempotent-bulk-operation'); console.log('OK');" 2>&1 | grep -q "OK"; then
    log_success "Idempotent wrapper module loads successfully"
else
    log_error "Failed to load idempotent wrapper module"
fi

# ============================================================================
# Test 2: Field Mapping Engine
# ============================================================================
run_test "Field Mapping Engine - Module Load"

if node -e "const { FieldMappingEngine } = require('./scripts/lib/field-mapping-engine'); console.log('OK');" 2>&1 | grep -q "OK"; then
    log_success "Field mapping engine module loads successfully"
else
    log_error "Failed to load field mapping engine module"
fi

# Test field mapping template generation
run_test "Field Mapping Engine - Template Generation"

# Create sample CSV
cat > /tmp/test-renewals.csv << 'EOF'
Account Name,Close Date,Amount
Test Agency,2026-03-31,50000
Another Agency,2026-06-30,75000
EOF

if node scripts/lib/field-mapping-engine.js generate-template /tmp/test-renewals.csv > /tmp/test-mapping.json 2>&1; then
    if [ -s /tmp/test-mapping.json ]; then
        log_success "Template generation works (created /tmp/test-mapping.json)"
    else
        log_error "Template generation created empty file"
    fi
else
    log_error "Template generation failed"
fi

# Test CSV transformation
run_test "Field Mapping Engine - CSV Transformation"

if node scripts/lib/field-mapping-engine.js transform /tmp/test-mapping.json /tmp/test-renewals.csv /tmp/test-output.json 2>&1; then
    if [ -s /tmp/test-output.json ]; then
        log_success "CSV transformation works (created /tmp/test-output.json)"
    else
        log_error "CSV transformation created empty file"
    fi
else
    log_error "CSV transformation failed"
fi

# ============================================================================
# Test 3: Operation Linker
# ============================================================================
run_test "Operation Linker - Module Load"

if node -e "const { OperationLinker } = require('./scripts/lib/operation-linker'); console.log('OK');" 2>&1 | grep -q "OK"; then
    log_success "Operation linker module loads successfully"
else
    log_error "Failed to load operation linker module"
fi

# Test operation recording
run_test "Operation Linker - Record Operation"

if node scripts/lib/operation-linker.js record "$ORG_ALIAS" '{"type":"test-operation","description":"Test operation","outputs":["test.json"],"stats":{"recordCount":10}}' > /tmp/test-op-record.json 2>&1; then
    if grep -q "type" /tmp/test-op-record.json; then
        log_success "Operation recording works"
    else
        log_error "Operation recording output invalid"
    fi
else
    log_error "Operation recording failed"
fi

# Test operation discovery
run_test "Operation Linker - Discover Operations"

if node scripts/lib/operation-linker.js discover "$ORG_ALIAS" renewal-import > /tmp/test-op-discover.json 2>&1; then
    log_success "Operation discovery works"
else
    log_error "Operation discovery failed"
fi

# Test operation list
run_test "Operation Linker - List Operations"

if node scripts/lib/operation-linker.js list "$ORG_ALIAS" > /tmp/test-op-list.json 2>&1; then
    log_success "Operation listing works"
else
    log_error "Operation listing failed"
fi

# ============================================================================
# Test 4: Playbook Structure
# ============================================================================
run_test "Contract Renewal Playbook - Structure"

if [ -d "templates/playbooks/contract-renewal-bulk-import" ]; then
    log_success "Playbook directory exists"
else
    log_error "Playbook directory missing"
fi

run_test "Contract Renewal Playbook - Required Files"

REQUIRED_FILES=(
    "templates/playbooks/contract-renewal-bulk-import/README.md"
    "templates/playbooks/contract-renewal-bulk-import/config-template.json"
    "templates/playbooks/contract-renewal-bulk-import/field-mapping-template.json"
    "templates/playbooks/contract-renewal-bulk-import/run-import.js"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        log_success "Found: $(basename $file)"
    else
        log_error "Missing: $file"
    fi
done

# Test config template is valid JSON
run_test "Contract Renewal Playbook - Config Template Validation"

if jq . templates/playbooks/contract-renewal-bulk-import/config-template.json > /dev/null 2>&1; then
    log_success "config-template.json is valid JSON"
else
    log_error "config-template.json is invalid JSON"
fi

# Test field mapping template is valid JSON
run_test "Contract Renewal Playbook - Field Mapping Template Validation"

if jq . templates/playbooks/contract-renewal-bulk-import/field-mapping-template.json > /dev/null 2>&1; then
    log_success "field-mapping-template.json is valid JSON"
else
    log_error "field-mapping-template.json is invalid JSON"
fi

# ============================================================================
# Test 5: Instance-Agnostic Toolkit Integration
# ============================================================================
run_test "Instance-Agnostic Toolkit - New Methods"

# Test that new methods exist
TEST_SCRIPT=$(cat << 'EOFJS'
const toolkit = require('./scripts/lib/instance-agnostic-toolkit');

// Check for new methods
const methods = [
    'executeRenewalImport',
    'validateBeforeImport',
    'findRelatedOperations',
    'recordOperation'
];

const kit = toolkit.createToolkit();
let missing = [];

for (const method of methods) {
    if (typeof kit[method] !== 'function') {
        missing.push(method);
    }
}

if (missing.length > 0) {
    console.error('Missing methods:', missing.join(', '));
    process.exit(1);
} else {
    console.log('OK');
}
EOFJS
)

if echo "$TEST_SCRIPT" | node 2>&1 | grep -q "OK"; then
    log_success "All 4 new toolkit methods exist"
else
    log_error "Some toolkit methods are missing"
fi

# ============================================================================
# Test 6: Agent Files
# ============================================================================
run_test "Agent Files - sfdc-renewal-import"

if [ -f ".claude/agents/sfdc-renewal-import.md" ]; then
    log_success "sfdc-renewal-import agent file exists"
else
    log_error "sfdc-renewal-import agent file missing"
fi

run_test "Agent Files - sfdc-data-operations updated"

if grep -q "MANDATORY: Playbook Usage" .claude/agents/sfdc-data-operations.md; then
    log_success "sfdc-data-operations has playbook requirements"
else
    log_error "sfdc-data-operations missing playbook section"
fi

# ============================================================================
# Test 7: Documentation
# ============================================================================
run_test "Documentation - TOOL_INTEGRATION_GUIDE.md"

if grep -q "Playbook System" docs/TOOL_INTEGRATION_GUIDE.md; then
    log_success "TOOL_INTEGRATION_GUIDE.md has playbook documentation"
else
    log_error "TOOL_INTEGRATION_GUIDE.md missing playbook section"
fi

# ============================================================================
# Test 8: Preflight Validator Integration
# ============================================================================
run_test "Preflight Validator - Exists"

if [ -f "scripts/lib/preflight-validator.js" ]; then
    log_success "Preflight validator exists"
else
    log_error "Preflight validator missing"
fi

# ============================================================================
# Summary
# ============================================================================
echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                        Test Summary                           ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "Total Tests:    $TESTS_RUN"
echo -e "Passed:         ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed:         ${RED}$TESTS_FAILED${NC}"
echo ""

# Cleanup
rm -f /tmp/test-renewals.csv /tmp/test-mapping.json /tmp/test-output.json
rm -f /tmp/test-op-record.json /tmp/test-op-discover.json /tmp/test-op-list.json

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed! Infrastructure is ready.${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Register agent in AGENT_CATALOG.md"
    echo "  2. Update sfdc-orchestrator routing rules"
    echo "  3. Add renewal keywords to CLAUDE.md"
    echo ""
    exit 0
else
    echo -e "${RED}✗ Some tests failed. Fix issues before proceeding.${NC}"
    echo ""
    exit 1
fi
