#!/bin/bash

###############################################################################
# v3.2.0 Integration Test Suite
# Tests new utilities and enhancements from reflection improvements
###############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "======================================================================"
echo "v3.2.0 Integration Test Suite"
echo "======================================================================"
echo ""

PASS_COUNT=0
FAIL_COUNT=0

# Test result tracking
test_pass() {
    echo "✅ PASS: $1"
    ((PASS_COUNT++))
}

test_fail() {
    echo "❌ FAIL: $1"
    ((FAIL_COUNT++))
}

###############################################################################
# Test 1: safe-node-exec.js - Basic execution
###############################################################################
echo "Test 1: safe-node-exec.js - Basic execution"
if result=$(echo "console.log(2 + 2)" | node "$PROJECT_ROOT/scripts/lib/safe-node-exec.js" 2>&1); then
    if [[ "$result" == "4" ]]; then
        test_pass "Basic console.log execution"
    else
        test_fail "Basic execution returned wrong result: $result"
    fi
else
    test_fail "Basic execution failed"
fi
echo ""

###############################################################################
# Test 2: safe-node-exec.js - Special characters (! character)
###############################################################################
echo "Test 2: safe-node-exec.js - Special characters handling"
# Use heredoc to avoid bash escaping the ! character
cat > /tmp/test-special-chars.js << 'EOF'
const arr = [{deleted: false}, {deleted: true}];
const filtered = arr.filter(a => !a.deleted);
return filtered.length;
EOF
if result=$(cat /tmp/test-special-chars.js | node "$PROJECT_ROOT/scripts/lib/safe-node-exec.js" 2>&1); then
    if [[ "$result" == "1" ]]; then
        test_pass "Special character (!) handling"
    else
        test_fail "Special character test returned: $result"
    fi
else
    test_fail "Special character execution failed"
fi
rm -f /tmp/test-special-chars.js
echo ""

###############################################################################
# Test 3: safe-node-exec.js - JSON output mode
###############################################################################
echo "Test 3: safe-node-exec.js - JSON output mode"
if result=$(echo "return { success: true, count: 42 }" | node "$PROJECT_ROOT/scripts/lib/safe-node-exec.js" --json 2>&1); then
    if echo "$result" | jq -e '.success == true and .count == 42' >/dev/null 2>&1; then
        test_pass "JSON output mode"
    else
        test_fail "JSON output incorrect: $result"
    fi
else
    test_fail "JSON output mode failed"
fi
echo ""

###############################################################################
# Test 4: safe-node-exec.js - Module pre-loading
###############################################################################
echo "Test 4: safe-node-exec.js - Module pre-loading"
if result=$(echo "console.log(fs.existsSync('.'))" | node "$PROJECT_ROOT/scripts/lib/safe-node-exec.js" --require fs 2>&1); then
    if [[ "$result" == "true" ]]; then
        test_pass "Module pre-loading (fs)"
    else
        test_fail "Module pre-loading returned: $result"
    fi
else
    test_fail "Module pre-loading failed"
fi
echo ""

###############################################################################
# Test 5: fuzzy-account-matcher.js - Data richness calculation
###############################################################################
echo "Test 5: fuzzy-account-matcher.js - Data richness calculation"

# Create test data
cat > /tmp/test-richness.js << 'EOF'
const { FuzzyAccountMatcher } = require('./scripts/lib/fuzzy-account-matcher.js');

const matcher = new FuzzyAccountMatcher('test-org', {});

// Test with complete records
const completeRecords = [
    { Name: 'Test Account 1', Website: 'test1.com', Phone: '555-1234', BillingStreet: '123 Main St', BillingCity: 'Boston', BillingState: 'MA' },
    { Name: 'Test Account 2', Website: 'test2.com', Phone: '555-5678', BillingStreet: '456 Oak Ave', BillingCity: 'NYC', BillingState: 'NY' }
];

const richness = matcher.calculateDataRichness(completeRecords);

if (richness.score !== 100) {
    console.error('Expected 100% richness for complete records, got:', richness.score);
    process.exit(1);
}

// Test with empty records
const emptyRecords = [
    { Name: 'Empty Account', Website: null, Phone: null, BillingStreet: null, BillingCity: null, BillingState: null }
];

const emptyRichness = matcher.calculateDataRichness(emptyRecords);

if (emptyRichness.score !== 16.7) {  // Only Name is populated (1/6 fields)
    console.error('Expected 16.7% richness for empty records, got:', emptyRichness.score);
    process.exit(1);
}

console.log('SUCCESS');
EOF

cd "$PROJECT_ROOT"
if result=$(node /tmp/test-richness.js 2>&1); then
    if [[ "$result" == "SUCCESS" ]]; then
        test_pass "Data richness calculation"
    else
        test_fail "Data richness calculation: $result"
    fi
else
    test_fail "Data richness test failed: $result"
fi
rm -f /tmp/test-richness.js
echo ""

###############################################################################
# Test 6: Playbook template exists and is complete
###############################################################################
echo "Test 6: Account duplicate cleanup playbook template"
PLAYBOOK_PATH="$PROJECT_ROOT/templates/playbooks/account-duplicate-cleanup/README.md"
if [[ -f "$PLAYBOOK_PATH" ]]; then
    # Check for key sections
    if grep -q "Data Richness Scoring" "$PLAYBOOK_PATH" && \
       grep -q "Multi-criteria duplicate detection" "$PLAYBOOK_PATH" && \
       grep -q "Step-by-Step Instructions" "$PLAYBOOK_PATH"; then
        test_pass "Playbook template completeness"
    else
        test_fail "Playbook missing key sections"
    fi
else
    test_fail "Playbook template not found"
fi
echo ""

###############################################################################
# Test 7: Documentation exists
###############################################################################
echo "Test 7: Bash scripting best practices documentation"
DOCS_PATH="$PROJECT_ROOT/docs/BASH_SCRIPTING_BEST_PRACTICES.md"
if [[ -f "$DOCS_PATH" ]]; then
    if grep -q "safe-node-exec" "$DOCS_PATH" && \
       grep -q "Shell Escaping Issues" "$DOCS_PATH" && \
       grep -q "heredoc" "$DOCS_PATH"; then
        test_pass "Documentation completeness"
    else
        test_fail "Documentation missing key content"
    fi
else
    test_fail "Documentation not found"
fi
echo ""

###############################################################################
# Test 8: Agent integration
###############################################################################
echo "Test 8: Agent integration check"
AGENT_PATH="$PROJECT_ROOT/.claude/agents/sfdc-data-operations.md"
if [[ -f "$AGENT_PATH" ]]; then
    if grep -q "Data Richness Scoring" "$AGENT_PATH" && \
       grep -q "safe-node-exec" "$AGENT_PATH" && \
       grep -q "Account Duplicate Cleanup Playbook" "$AGENT_PATH"; then
        test_pass "Agent integration (sfdc-data-operations)"
    else
        test_fail "Agent missing v3.2.0 enhancements"
    fi
else
    test_fail "Agent file not found"
fi
echo ""

###############################################################################
# Test 9: TOOL_REFERENCE.md updated
###############################################################################
echo "Test 9: Tool reference documentation"
TOOL_REF="$PROJECT_ROOT/TOOL_REFERENCE.md"
if [[ -f "$TOOL_REF" ]]; then
    if grep -q "safe-node-exec.js" "$TOOL_REF" && \
       grep -q "Data Richness" "$TOOL_REF" && \
       grep -q "v3.2.0" "$TOOL_REF"; then
        test_pass "Tool reference updated"
    else
        test_fail "Tool reference missing v3.2.0 tools"
    fi
else
    test_fail "Tool reference not found"
fi
echo ""

###############################################################################
# Test 10: CHANGELOG.md updated
###############################################################################
echo "Test 10: Changelog documentation"
CHANGELOG="$PROJECT_ROOT/CHANGELOG.md"
if [[ -f "$CHANGELOG" ]]; then
    if grep -q "\[3.2.0\]" "$CHANGELOG" && \
       grep -q "Data Richness Scoring" "$CHANGELOG" && \
       grep -q "Safe Node.js Executor" "$CHANGELOG"; then
        test_pass "Changelog updated"
    else
        test_fail "Changelog missing v3.2.0 release"
    fi
else
    test_fail "Changelog not found"
fi
echo ""

###############################################################################
# Summary
###############################################################################
echo "======================================================================"
echo "Test Summary"
echo "======================================================================"
echo "PASSED: $PASS_COUNT"
echo "FAILED: $FAIL_COUNT"
echo ""

if [[ $FAIL_COUNT -eq 0 ]]; then
    echo "✅ ALL TESTS PASSED - v3.2.0 integration successful!"
    exit 0
else
    echo "❌ SOME TESTS FAILED - review errors above"
    exit 1
fi
