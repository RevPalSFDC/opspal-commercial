#!/bin/bash

##############################################################################
# Verification Test Suite - Reflection Fixes v3.35.0
#
# Tests all 4 features deployed to address reflection cohorts:
# - FP-003: CLI Command Validator
# - FP-004: Smart Query Batcher
# - FP-005: CLI Format Converter
# - FP-009: Metadata Reference Resolver
#
# Usage: bash tests/verify-reflection-fixes.sh
##############################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$SCRIPT_DIR/../scripts/lib"

echo "=================================="
echo "Verification Test Suite v3.35.0"
echo "=================================="
echo ""

PASS=0
FAIL=0

# Helper functions
pass() {
  echo "  ✅ PASS: $1"
  ((PASS++))
}

fail() {
  echo "  ❌ FAIL: $1"
  ((FAIL++))
}

##############################################################################
# Test 1: CLI Command Validator (FP-003)
##############################################################################

echo "Test 1: CLI Command Validator (FP-003)"
echo "--------------------------------------"

# Test 1.1: Detect invalid command (sf data export)
echo "1.1 Testing invalid command detection..."
if node "$LIB_DIR/cli-command-validator.js" "sf data export" 2>&1 | grep -q "Invalid command"; then
  pass "Detects invalid 'sf data export' command"
else
  fail "Should detect invalid 'sf data export'"
fi

# Test 1.2: Validate correct command (sf data query)
echo "1.2 Testing valid command..."
if node "$LIB_DIR/cli-command-validator.js" "sf data query --query 'SELECT Id FROM Account' --target-org myorg" 2>&1 | grep -q "Valid command"; then
  pass "Validates correct 'sf data query' command"
else
  fail "Should validate 'sf data query'"
fi

# Test 1.3: Detect deprecated flag (--source-path)
echo "1.3 Testing deprecated flag detection..."
if node "$LIB_DIR/cli-command-validator.js" "sf project deploy start --source-path force-app" 2>&1 | grep -q "Deprecated\|deprecated"; then
  pass "Detects deprecated '--source-path' flag"
else
  fail "Should detect deprecated '--source-path'"
fi

# Test 1.4: Programmatic API test
echo "1.4 Testing programmatic API..."
cat > /tmp/test-cli-api.js << 'EOFJS'
const validator = require('./scripts/lib/cli-command-validator');
const result1 = validator.validate('sf data export');
const result2 = validator.validate('sf data query --query "SELECT Id FROM Account"');
console.log(result1.valid === false && result2.valid === true ? 'PASS' : 'FAIL');
EOFJS

if [ "$(node /tmp/test-cli-api.js)" = "PASS" ]; then
  pass "Programmatic API works correctly"
else
  fail "Programmatic API issue"
fi

echo ""

##############################################################################
# Test 2: CLI Format Converter (FP-005)
##############################################################################

echo "Test 2: CLI Format Converter (FP-005)"
echo "--------------------------------------"

# Test 2.1: JSON to CSV conversion
echo "2.1 Testing JSON → CSV conversion..."
echo '[{"Id":"001xxx","Name":"Test Account"},{"Id":"001yyy","Name":"Another"}]' > /tmp/test.json

if node "$LIB_DIR/cli-format-converter.js" "sf data import bulk" /tmp/test.json 2>&1 | grep -q "Converted json → csv"; then
  pass "Converts JSON to CSV for bulk import"
else
  fail "JSON → CSV conversion failed"
fi

# Test 2.2: CSV format detection
echo "2.2 Testing CSV format detection..."
echo -e "Id,Name\n001xxx,Test\n001yyy,Another" > /tmp/test.csv

if node "$LIB_DIR/cli-format-converter.js" "sf data query" /tmp/test.csv 2>&1 | grep -q "Input format: csv"; then
  pass "Detects CSV format correctly"
else
  fail "CSV detection failed"
fi

# Test 2.3: Programmatic API test
echo "2.3 Testing programmatic conversion..."
cat > /tmp/test-format-api.js << 'EOFJS'
const converter = require('./scripts/lib/cli-format-converter');
const jsonData = [{ Id: '001xxx', Name: 'Test' }];
const csv = converter.jsonToCsv(jsonData);
console.log(csv.includes('Id,Name') && csv.includes('001xxx,Test') ? 'PASS' : 'FAIL');
EOFJS

if [ "$(node /tmp/test-format-api.js)" = "PASS" ]; then
  pass "Programmatic JSON→CSV works"
else
  fail "Programmatic conversion issue"
fi

# Test 2.4: CSV escaping
echo "2.4 Testing CSV escaping..."
cat > /tmp/test-escaping.js << 'EOFJS'
const converter = require('./scripts/lib/cli-format-converter');
const data = [{ Id: '001', Name: 'Test, Inc.', Notes: 'Has "quotes"' }];
const csv = converter.jsonToCsv(data);
// Should escape commas and quotes
console.log(csv.includes('"Test, Inc."') && csv.includes('"Has ""quotes"""') ? 'PASS' : 'FAIL');
EOFJS

if [ "$(node /tmp/test-escaping.js)" = "PASS" ]; then
  pass "CSV escaping handles commas and quotes"
else
  fail "CSV escaping issue"
fi

echo ""

##############################################################################
# Test 3: Smart Query Batcher (FP-004)
##############################################################################

echo "Test 3: Smart Query Batcher (FP-004)"
echo "-------------------------------------"

# Test 3.1: Header size calculation
echo "3.1 Testing header size calculation..."
cat > /tmp/test-header-size.js << 'EOFJS'
const batcher = require('./scripts/lib/smart-query-batcher');
const smallQuery = "SELECT Id FROM Account WHERE Id = '001xxx'";
const result = batcher.testHeaderSize(smallQuery, 'myorg');
console.log(result.size > 0 && result.size < 1000 ? 'PASS' : 'FAIL');
EOFJS

if [ "$(node /tmp/test-header-size.js)" = "PASS" ]; then
  pass "Header size calculation works"
else
  fail "Header size calculation issue"
fi

# Test 3.2: Batch size calculation with 2,355 IDs
echo "3.2 Testing optimal batch size with 2,355 IDs..."
cat > /tmp/test-batch-calc.js << 'EOFJS'
const batcher = require('./scripts/lib/smart-query-batcher');
const ids = Array(2355).fill().map((_, i) => `001${String(i).padStart(12, '0')}AAA`);
const fields = ['Id', 'Name', 'Industry'];
const batchSize = batcher.calculateOptimalBatchSize(ids, fields, 'Account');
const numBatches = Math.ceil(ids.length / batchSize);
console.log(batchSize > 100 && batchSize < 500 && numBatches >= 5 && numBatches <= 25 ? 'PASS' : 'FAIL');
EOFJS

if [ "$(node /tmp/test-batch-calc.js)" = "PASS" ]; then
  pass "Calculates optimal batch size (2,355 IDs → 5-25 batches)"
else
  fail "Batch size calculation issue"
fi

# Test 3.3: Header size stays under limit
echo "3.3 Testing header size stays under 8KB limit..."
cat > /tmp/test-header-limit.js << 'EOFJS'
const batcher = require('./scripts/lib/smart-query-batcher');
const ids = Array(2355).fill().map((_, i) => `001${String(i).padStart(12, '0')}AAA`);
const fields = ['Id', 'Name', 'Industry'];
const batchSize = batcher.calculateOptimalBatchSize(ids, fields, 'Account');
const batch = ids.slice(0, batchSize);
const query = `SELECT ${fields.join(', ')} FROM Account WHERE Id IN (${batch.map(id => `'${id}'`).join(', ')})`;
const test = batcher.testHeaderSize(query, 'myorg');
console.log(test.exceeds === false && test.size < 7500 ? 'PASS' : 'FAIL');
EOFJS

if [ "$(node /tmp/test-header-limit.js)" = "PASS" ]; then
  pass "Batched queries stay under 7,500 byte limit"
else
  fail "Header size limit exceeded"
fi

echo ""

##############################################################################
# Test 4: Metadata Reference Resolver (FP-009)
##############################################################################

echo "Test 4: Metadata Reference Resolver (FP-009)"
echo "---------------------------------------------"

# Test 4.1: Format detection
echo "4.1 Testing format detection..."
cat > /tmp/test-format-detect.js << 'EOFJS'
const resolver = require('./scripts/lib/metadata-reference-resolver');
const idFormat = resolver.detectFormat('00O1234567890ABC');
const refFormat = resolver.detectFormat('Sales_Reports/Pipeline_Report');
console.log(idFormat === 'id' && refFormat === 'folder_developer_name' ? 'PASS' : 'FAIL');
EOFJS

if [ "$(node /tmp/test-format-detect.js)" = "PASS" ]; then
  pass "Detects ID vs FolderName/DeveloperName format"
else
  fail "Format detection issue"
fi

# Test 4.2: Batch conversion capability
echo "4.2 Testing batch conversion API..."
cat > /tmp/test-batch-convert.js << 'EOFJS'
const resolver = require('./scripts/lib/metadata-reference-resolver');
// Can't test actual conversion without org, but test API exists
const hasAPI = typeof resolver.batchConvert === 'function' &&
              typeof resolver.idToReference === 'function' &&
              typeof resolver.toDashboardFormat === 'function';
console.log(hasAPI ? 'PASS' : 'FAIL');
EOFJS

if [ "$(node /tmp/test-batch-convert.js)" = "PASS" ]; then
  pass "Batch conversion API exists"
else
  fail "Missing batch conversion API"
fi

# Test 4.3: Cache management
echo "4.3 Testing cache management..."
cat > /tmp/test-cache.js << 'EOFJS'
const resolver = require('./scripts/lib/metadata-reference-resolver');
const hasCacheAPI = typeof resolver.clearCache === 'function';
console.log(hasCacheAPI ? 'PASS' : 'FAIL');
EOFJS

if [ "$(node /tmp/test-cache.js)" = "PASS" ]; then
  pass "Cache management API exists"
else
  fail "Missing cache API"
fi

echo ""

##############################################################################
# Integration Tests
##############################################################################

echo "Integration Tests"
echo "-----------------"

# Test 5: All modules load without errors
echo "5. Testing module loading..."
cat > /tmp/test-module-load.js << 'EOFJS'
try {
  require('./scripts/lib/cli-command-validator');
  require('./scripts/lib/cli-format-converter');
  require('./scripts/lib/smart-query-batcher');
  require('./scripts/lib/metadata-reference-resolver');
  console.log('PASS');
} catch (error) {
  console.log('FAIL: ' + error.message);
}
EOFJS

if [ "$(node /tmp/test-module-load.js)" = "PASS" ]; then
  pass "All 4 modules load without errors"
else
  fail "Module loading issue"
fi

# Test 6: Command reference data loads
echo "6. Testing command reference data..."
if [ -f "$SCRIPT_DIR/../data/sf-cli-command-reference.json" ]; then
  if jq -e '.commands | length > 0' "$SCRIPT_DIR/../data/sf-cli-command-reference.json" > /dev/null 2>&1; then
    pass "Command reference JSON is valid"
  else
    fail "Command reference JSON invalid"
  fi
else
  fail "Command reference JSON missing"
fi

echo ""

##############################################################################
# Results Summary
##############################################################################

echo "=================================="
echo "Test Results Summary"
echo "=================================="
echo ""
echo "PASSED: $PASS tests"
echo "FAILED: $FAIL tests"
echo ""

if [ $FAIL -eq 0 ]; then
  echo "✅ ALL TESTS PASSED - Features ready for production"
  exit 0
else
  echo "❌ SOME TESTS FAILED - Review failures above"
  exit 1
fi
