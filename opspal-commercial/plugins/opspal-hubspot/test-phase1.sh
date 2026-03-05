#!/bin/bash

# Phase 1 Quick Test Script
# Runs basic sanity tests on all Phase 1 components

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================"
echo "Phase 1 - Quick Test Suite"
echo "========================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0
WARNINGS=0

# Helper functions
pass() {
  echo -e "${GREEN}✓ PASS${NC}: $1"
  PASSED=$((PASSED + 1))
}

fail() {
  echo -e "${RED}✗ FAIL${NC}: $1"
  FAILED=$((FAILED + 1))
}

warn() {
  echo -e "${YELLOW}⚠ WARN${NC}: $1"
  WARNINGS=$((WARNINGS + 1))
}

# Test 0: Check dependencies
echo "Test 0: Checking Dependencies..."
echo "================================"

if node -e "require('xml2js')" 2>/dev/null; then
  pass "xml2js installed"
else
  fail "xml2js not installed - run: npm install xml2js"
fi

if node -e "require('cheerio')" 2>/dev/null; then
  pass "cheerio installed"
else
  fail "cheerio not installed - run: npm install cheerio"
fi

if node -e "require('node-fetch')" 2>/dev/null; then
  pass "node-fetch installed"
else
  fail "node-fetch not installed - run: npm install node-fetch"
fi

echo ""

# If dependencies failed, exit
if [ $FAILED -gt 0 ]; then
  echo -e "${RED}Dependencies missing. Install with: npm install xml2js cheerio node-fetch${NC}"
  exit 1
fi

# Test 1: Sitemap Crawler
echo "Test 1: Sitemap Crawler"
echo "======================="

# Test 1.1: Basic sitemap parsing
echo "Test 1.1: Parsing example.com sitemap..."
if timeout 30 node scripts/lib/seo-sitemap-crawler.js https://www.example.com/sitemap.xml > /tmp/test-sitemap.out 2>&1; then
  if grep -q "Found.*URLs" /tmp/test-sitemap.out; then
    pass "Sitemap crawler works"
    cat /tmp/test-sitemap.out | head -10
  else
    warn "Sitemap crawler ran but output unexpected"
    cat /tmp/test-sitemap.out
  fi
else
  fail "Sitemap crawler failed or timed out"
  cat /tmp/test-sitemap.out
fi

echo ""

# Test 1.2: Sitemap discovery
echo "Test 1.2: Sitemap discovery..."
if timeout 30 node scripts/lib/seo-sitemap-crawler.js discover https://www.example.com > /tmp/test-discovery.out 2>&1; then
  if grep -q "sitemap" /tmp/test-discovery.out; then
    pass "Sitemap discovery works"
  else
    warn "Sitemap discovery ran but no sitemaps found"
  fi
else
  fail "Sitemap discovery failed"
fi

echo ""

# Test 2: Batch Analyzer
echo "Test 2: Batch Analyzer"
echo "======================"

# Test 2.1: Single page analysis
echo "Test 2.1: Analyzing example.com..."
if timeout 60 node scripts/lib/seo-batch-analyzer.js https://www.example.com --checks technical,content > /tmp/test-batch.out 2>&1; then
  if grep -q "Analysis complete" /tmp/test-batch.out || grep -q "analyzed" /tmp/test-batch.out; then
    pass "Batch analyzer works"
    tail -20 /tmp/test-batch.out
  else
    warn "Batch analyzer ran but output unexpected"
    cat /tmp/test-batch.out
  fi
else
  fail "Batch analyzer failed or timed out"
  cat /tmp/test-batch.out
fi

echo ""

# Test 2.2: Multiple pages
echo "Test 2.2: Analyzing multiple pages..."
if timeout 60 node scripts/lib/seo-batch-analyzer.js \
  https://www.example.com \
  https://www.example.com/about > /tmp/test-batch-multi.out 2>&1; then

  if grep -q "2" /tmp/test-batch-multi.out && grep -q "analyzed" /tmp/test-batch-multi.out; then
    pass "Multi-page batch analysis works"
  else
    warn "Multi-page analysis completed but may have issues"
  fi
else
  fail "Multi-page batch analysis failed"
fi

echo ""

# Test 3: Broken Link Detector
echo "Test 3: Broken Link Detector"
echo "============================"

# We need crawl results first
echo "Test 3.1: Generating crawl results..."
node scripts/lib/seo-batch-analyzer.js \
  https://www.example.com \
  https://www.example.com/about > /tmp/test-crawl-for-links.json 2>&1

if [ -f /tmp/test-crawl-for-links.json ]; then
  echo "Test 3.2: Running broken link detector..."

  # Create a minimal test file (since real crawl results are complex)
  cat > /tmp/test-pages.json << 'EOF'
[
  {
    "url": "https://www.example.com",
    "links": {
      "internal": 5,
      "external": 3,
      "externalLinks": [
        {"href": "https://www.iana.org/domains/example", "text": "More information"}
      ]
    }
  }
]
EOF

  if timeout 60 node scripts/lib/seo-broken-link-detector.js \
    https://www.example.com \
    /tmp/test-pages.json > /tmp/test-links.out 2>&1; then

    if grep -q "Scan complete" /tmp/test-links.out; then
      pass "Broken link detector works"
    else
      warn "Broken link detector ran but may have issues"
    fi
  else
    fail "Broken link detector failed"
    cat /tmp/test-links.out
  fi
else
  warn "Could not generate crawl results for link testing"
fi

echo ""

# Test 4: Health Scorer
echo "Test 4: Health Scorer"
echo "===================="

# Create test crawl results
cat > /tmp/test-health-crawl.json << 'EOF'
[
  {
    "url": "https://www.example.com",
    "technical": {
      "statusCode": 200,
      "loadTime": 1500,
      "pageSize": 50000,
      "hasViewport": true,
      "canonical": "https://www.example.com",
      "estimatedLCP": "Good"
    },
    "content": {
      "title": {
        "text": "Example Domain",
        "length": 14,
        "isOptimal": false
      },
      "metaDescription": {
        "text": "Example domain for testing",
        "length": 26,
        "exists": true,
        "isOptimal": false
      },
      "headings": {
        "h1": {
          "count": 1,
          "text": ["Example Domain"],
          "hasOne": true
        },
        "hierarchy": {
          "isValid": true,
          "issues": []
        }
      },
      "wordCount": 150,
      "isSubstantial": false,
      "openGraphTags": {}
    },
    "schema": {
      "hasSchema": false,
      "count": 0,
      "schemas": []
    },
    "images": {
      "total": 0,
      "missingAlt": 0,
      "altCoverage": "N/A",
      "lazyLoading": 0
    }
  }
]
EOF

echo "Test 4.1: Calculating health score..."
if timeout 30 node scripts/lib/seo-technical-health-scorer.js \
  /tmp/test-health-crawl.json > /tmp/test-health.out 2>&1; then

  if grep -q "Overall Health Score" /tmp/test-health.out || grep -q "Overall Score" /tmp/test-health.out; then
    pass "Health scorer works"
    cat /tmp/test-health.out | head -30
  else
    warn "Health scorer ran but output unexpected"
    cat /tmp/test-health.out
  fi
else
  fail "Health scorer failed"
  cat /tmp/test-health.out
fi

echo ""

# Test 5: File Structure
echo "Test 5: File Structure"
echo "====================="

FILES=(
  "agents/hubspot-seo-site-crawler.md"
  "scripts/lib/seo-sitemap-crawler.js"
  "scripts/lib/seo-batch-analyzer.js"
  "scripts/lib/seo-broken-link-detector.js"
  "scripts/lib/seo-technical-health-scorer.js"
  "commands/seo-broken-links.md"
)

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    pass "File exists: $file"
  else
    fail "File missing: $file"
  fi
done

echo ""

# Summary
echo "========================================"
echo "Test Summary"
echo "========================================"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${YELLOW}Warnings: $WARNINGS${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ All critical tests passed!${NC}"
  echo ""
  echo "Next steps:"
  echo "1. Review test output above for any warnings"
  echo "2. Run comprehensive tests: see PHASE1_TESTING_GUIDE.md"
  echo "3. Test with your actual website URLs"
  echo ""
  exit 0
else
  echo -e "${RED}✗ Some tests failed${NC}"
  echo ""
  echo "Review failures above and fix issues before proceeding."
  echo "See PHASE1_TESTING_GUIDE.md for detailed testing instructions."
  echo ""
  exit 1
fi
