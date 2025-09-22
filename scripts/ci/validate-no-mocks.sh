#!/bin/bash

# CI Validation Script for No-Mocks Policy
# Enforces the prohibition of mock/fake/synthetic data

set -e

echo "================================================================"
echo "🔍 VALIDATING NO-MOCKS POLICY COMPLIANCE"
echo "================================================================"

ALLOWED_MOCK_AGENT="${ALLOWED_MOCK_AGENT_NAME:-mock-data-generator}"
EXIT_CODE=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to log errors
log_error() {
    echo -e "${RED}❌ $1${NC}"
    EXIT_CODE=1
}

# Function to log success
log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# Function to log warning
log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

echo ""
echo "Allowed mock agent: $ALLOWED_MOCK_AGENT"
echo ""

# 1. Check for banned terms in codebase (excluding allowed agent)
echo "1️⃣  Scanning for banned mock/fake/stub patterns..."

# Create temp file for results
TEMP_RESULTS=$(mktemp)

# Run ripgrep scan (case-insensitive)
rg -i "(mock|fixture|fake|stub|sample|lorem|faker|factory|chance|msw|nock|responses|sinon|unittest\.mock|pytest\.fixture)" \
    -g '!**/node_modules/**' \
    -g '!**/venv/**' \
    -g '!**/.git/**' \
    -g '!**/coverage/**' \
    -g '!**/dist/**' \
    -g '!**/build/**' \
    -g "!**/${ALLOWED_MOCK_AGENT}*" \
    -g '!**/package-lock.json' \
    -g '!**/yarn.lock' \
    --stats \
    > "$TEMP_RESULTS" 2>&1 || true

# Check if any matches were found
MATCH_COUNT=$(grep -c "matches" "$TEMP_RESULTS" 2>/dev/null || echo "0")

if [[ "$MATCH_COUNT" != "0" ]]; then
    log_error "Found prohibited mock/fake patterns in codebase:"
    head -20 "$TEMP_RESULTS"
    echo "..."
    echo "Full results saved to: mock_violations.log"
    cp "$TEMP_RESULTS" mock_violations.log
else
    log_success "No prohibited mock patterns found in code"
fi

rm "$TEMP_RESULTS"

# 2. Check package.json for mock dependencies
echo ""
echo "2️⃣  Checking for mock libraries in production dependencies..."

PACKAGE_FILES=$(find . -name "package.json" -not -path "*/node_modules/*" -not -path "*/.git/*")

for pkg in $PACKAGE_FILES; do
    echo "   Checking: $pkg"

    # Check production dependencies
    if jq -e '.dependencies' "$pkg" > /dev/null 2>&1; then
        MOCK_DEPS=$(jq -r '.dependencies | keys[]' "$pkg" 2>/dev/null | grep -E "(faker|chance|casual|msw|nock|sinon|testdouble|mock)" || true)

        if [[ ! -z "$MOCK_DEPS" ]]; then
            log_error "Found mock libraries in production dependencies of $pkg:"
            echo "$MOCK_DEPS"
        fi
    fi
done

if [[ $EXIT_CODE -eq 0 ]]; then
    log_success "No mock libraries in production dependencies"
fi

# 3. Check for test data files
echo ""
echo "3️⃣  Checking for test/mock/sample data files..."

TEST_DATA_FILES=$(find . \
    -type f \
    \( -path "*/mock*/*" -o \
       -path "*/fixture*/*" -o \
       -path "*/sample*/*" -o \
       -path "*/stub*/*" -o \
       -path "*/__mocks__/*" -o \
       -name "*_mock.*" -o \
       -name "*_fixture.*" -o \
       -name "*_sample.*" -o \
       -name "*_stub.*" -o \
       -name "test-data.*" -o \
       -name "mock-data.*" \) \
    -not -path "*/node_modules/*" \
    -not -path "*/.git/*" \
    -not -path "*/${ALLOWED_MOCK_AGENT}*" \
    2>/dev/null || true)

if [[ ! -z "$TEST_DATA_FILES" ]]; then
    log_error "Found test/mock data files:"
    echo "$TEST_DATA_FILES" | head -10
    echo "..."
else
    log_success "No test/mock data files found"
fi

# 4. Verify DataAccessError implementation
echo ""
echo "4️⃣  Verifying DataAccessError implementation..."

if [[ -f "scripts/lib/data-access-error.js" ]]; then
    log_success "DataAccessError class found"
else
    log_error "DataAccessError class not found at scripts/lib/data-access-error.js"
fi

if [[ -f "scripts/lib/runtime-mock-guard.js" ]]; then
    log_success "RuntimeMockGuard class found"
else
    log_error "RuntimeMockGuard class not found at scripts/lib/runtime-mock-guard.js"
fi

# 5. Run Node.js runtime check with NO_MOCKS=1
echo ""
echo "5️⃣  Running Node.js runtime validation..."

cat > /tmp/test_no_mocks.js << 'EOF'
const RuntimeMockGuard = require('./scripts/lib/runtime-mock-guard.js');

// Quick check
const result = RuntimeMockGuard.quickCheck();
process.exit(result ? 0 : 1);
EOF

if NO_MOCKS=1 node /tmp/test_no_mocks.js; then
    log_success "Runtime mock guard validation passed"
else
    log_error "Runtime mock guard validation failed"
fi

rm /tmp/test_no_mocks.js

# 6. Check for hardcoded example data patterns
echo ""
echo "6️⃣  Scanning for hardcoded example/placeholder data..."

EXAMPLE_PATTERNS=$(rg -i "(example\s*(corp|company|inc)|test\s*\d+|john\s*doe|jane\s*smith|lorem\s*ipsum|00[A-Z]000000000000[A-Z0-9]{3})" \
    -g '!**/node_modules/**' \
    -g '!**/venv/**' \
    -g '!**/.git/**' \
    -g '!**/coverage/**' \
    -g '!**/README.md' \
    -g '!**/docs/**' \
    -g "!**/${ALLOWED_MOCK_AGENT}*" \
    --count-matches \
    | grep -v ":0$" || true)

if [[ ! -z "$EXAMPLE_PATTERNS" ]]; then
    log_warning "Found potential hardcoded example data:"
    echo "$EXAMPLE_PATTERNS" | head -10
fi

# 7. Check environment variable
echo ""
echo "7️⃣  Checking NO_MOCKS environment variable..."

if [[ "$NO_MOCKS" == "1" ]]; then
    log_success "NO_MOCKS=1 is set"
else
    log_warning "NO_MOCKS is not set to 1 (current value: '$NO_MOCKS')"
    echo "   Set NO_MOCKS=1 to enforce no-mock policy at runtime"
fi

# Final summary
echo ""
echo "================================================================"

if [[ $EXIT_CODE -eq 0 ]]; then
    echo -e "${GREEN}✅ ALL CHECKS PASSED - No mock policy is enforced${NC}"
else
    echo -e "${RED}❌ VALIDATION FAILED - Mock policy violations detected${NC}"
    echo ""
    echo "Required actions:"
    echo "1. Remove all mock/fake data generation code"
    echo "2. Replace with real data sources or explicit failure"
    echo "3. Use DataAccessError for data access failures"
    echo "4. Set NO_MOCKS=1 in environment"
fi

echo "================================================================"

exit $EXIT_CODE