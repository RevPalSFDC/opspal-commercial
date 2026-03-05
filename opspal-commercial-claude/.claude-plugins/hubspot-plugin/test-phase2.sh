#!/bin/bash

# Phase 2 Integration Test Script
# Tests SERP analysis, keyword research, and content gap analysis

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
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

info() {
  echo -e "${BLUE}ℹ INFO${NC}: $1"
}

# Create test output directory
TEST_DIR="./.test-results/phase2-$(date +%s)"
mkdir -p "$TEST_DIR"

echo "============================================="
echo "Phase 2 Integration Tests"
echo "============================================="
echo "Test output: $TEST_DIR"
echo ""

# ============================================
# Test 1: Keyword Researcher
# ============================================
echo -e "${BLUE}Test 1: Keyword Research${NC}"
echo "Testing: seo-keyword-researcher.js"

SEED_KEYWORD="seo tools"

info "Generating keywords for: $SEED_KEYWORD"
if node scripts/lib/seo-keyword-researcher.js "$SEED_KEYWORD" --output="$TEST_DIR/keyword-research.json" > "$TEST_DIR/keyword-research.log" 2>&1; then
  pass "Keyword research script executed successfully"

  # Check output file
  if [ -f "$TEST_DIR/keyword-research.json" ]; then
    pass "Keyword research JSON created"

    # Validate JSON structure
    TOTAL_KEYWORDS=$(jq -r '.summary.totalKeywords' "$TEST_DIR/keyword-research.json" 2>/dev/null || echo "0")
    if [ "$TOTAL_KEYWORDS" -gt 0 ]; then
      pass "Generated keywords: $TOTAL_KEYWORDS"
    else
      fail "No keywords generated"
    fi

    # Check for related keywords
    RELATED_COUNT=$(jq -r '.relatedKeywords | length' "$TEST_DIR/keyword-research.json" 2>/dev/null || echo "0")
    if [ "$RELATED_COUNT" -gt 0 ]; then
      pass "Related keywords: $RELATED_COUNT"
    else
      warn "No related keywords found"
    fi

    # Check for question keywords
    QUESTION_COUNT=$(jq -r '.questionKeywords | length' "$TEST_DIR/keyword-research.json" 2>/dev/null || echo "0")
    if [ "$QUESTION_COUNT" -gt 0 ]; then
      pass "Question keywords: $QUESTION_COUNT"
    else
      warn "No question keywords found"
    fi

    # Check for clusters
    CLUSTER_COUNT=$(jq -r '.clusters | length' "$TEST_DIR/keyword-research.json" 2>/dev/null || echo "0")
    if [ "$CLUSTER_COUNT" -gt 0 ]; then
      pass "Keyword clusters: $CLUSTER_COUNT"
    else
      warn "No keyword clusters found"
    fi
  else
    fail "Keyword research JSON not created"
  fi
else
  fail "Keyword research script failed"
  cat "$TEST_DIR/keyword-research.log"
fi

echo ""

# ============================================
# Test 2: SERP Analyzer (with mock data)
# ============================================
echo -e "${BLUE}Test 2: SERP Analysis (Mock Data)${NC}"
echo "Testing: seo-serp-analyzer.js"

# Create mock SERP results for testing
cat > "$TEST_DIR/mock-serp.json" <<'EOF'
{
  "keyword": "marketing automation",
  "results": [
    {
      "position": 1,
      "url": "https://competitor1.com/marketing-automation",
      "title": "Best Marketing Automation Software 2025 - Complete Guide",
      "description": "Discover the top marketing automation platforms...",
      "features": ["featured_snippet"]
    },
    {
      "position": 2,
      "url": "https://competitor2.com/automation-guide",
      "title": "Marketing Automation: The Ultimate Guide",
      "description": "Everything you need to know about marketing automation...",
      "features": []
    },
    {
      "position": 3,
      "url": "https://example.com/marketing",
      "title": "Marketing Tools",
      "description": "Our marketing tools...",
      "features": []
    }
  ],
  "features": ["featured_snippet", "people_also_ask", "videos"],
  "searchVolume": 5400,
  "difficulty": 65
}
EOF

info "Created mock SERP data"

# Test SERP feature detection
if node -e "
const fs = require('fs');
const SERPAnalyzer = require('./scripts/lib/seo-serp-analyzer');
const analyzer = new SERPAnalyzer({ useCache: false });

const serpData = JSON.parse(fs.readFileSync('$TEST_DIR/mock-serp.json', 'utf8'));

// Test feature detection
const features = analyzer.detectSERPFeatures(serpData.results);
console.log('Features detected:', JSON.stringify(features, null, 2));

// Test ranking patterns
const patterns = analyzer.analyzeRankingPatterns(serpData.results);
console.log('Patterns analyzed:', JSON.stringify(patterns, null, 2));

fs.writeFileSync('$TEST_DIR/serp-analysis.json', JSON.stringify({ features, patterns }, null, 2));
" > "$TEST_DIR/serp-analysis.log" 2>&1; then
  pass "SERP analysis script executed successfully"

  if [ -f "$TEST_DIR/serp-analysis.json" ]; then
    pass "SERP analysis JSON created"

    # Check if features were detected
    TOTAL_FEATURES=$(jq -r '.features.totalFeatures' "$TEST_DIR/serp-analysis.json" 2>/dev/null || echo "0")
    if [ "$TOTAL_FEATURES" -gt 0 ]; then
      pass "SERP features detected: $TOTAL_FEATURES"
    else
      warn "No SERP features detected"
    fi
  else
    fail "SERP analysis JSON not created"
  fi
else
  fail "SERP analysis failed"
  cat "$TEST_DIR/serp-analysis.log"
fi

echo ""

# ============================================
# Test 3: Content Gap Analyzer
# ============================================
echo -e "${BLUE}Test 3: Content Gap Analysis${NC}"
echo "Testing: seo-content-gap-analyzer.js"

# Create mock crawl data for testing
cat > "$TEST_DIR/your-site-crawl.json" <<'EOF'
{
  "domain": "example.com",
  "pages": [
    {
      "url": "https://example.com/",
      "title": "Example Domain",
      "content": {
        "wordCount": 17,
        "headings": [
          {"level": "h1", "text": "Example Domain"}
        ]
      },
      "schema": [],
      "images": {"total": 0},
      "links": {"internal": 0, "external": 1}
    },
    {
      "url": "https://example.com/about",
      "title": "About Us",
      "content": {
        "wordCount": 500,
        "headings": [
          {"level": "h1", "text": "About Our Company"},
          {"level": "h2", "text": "Our Mission"}
        ]
      },
      "schema": ["Organization"],
      "images": {"total": 3},
      "links": {"internal": 5, "external": 2}
    }
  ]
}
EOF

cat > "$TEST_DIR/competitor-crawl.json" <<'EOF'
{
  "domain": "competitor.com",
  "pages": [
    {
      "url": "https://competitor.com/",
      "title": "Competitor Home",
      "content": {
        "wordCount": 1200,
        "headings": [
          {"level": "h1", "text": "Leading Marketing Automation Platform"}
        ]
      },
      "schema": ["Organization", "WebSite"],
      "images": {"total": 8},
      "links": {"internal": 15, "external": 5}
    },
    {
      "url": "https://competitor.com/marketing-automation",
      "title": "Marketing Automation Guide",
      "content": {
        "wordCount": 2500,
        "headings": [
          {"level": "h1", "text": "Complete Marketing Automation Guide"},
          {"level": "h2", "text": "Email Marketing Automation"},
          {"level": "h2", "text": "Lead Scoring"}
        ]
      },
      "schema": ["Article"],
      "images": {"total": 12},
      "links": {"internal": 20, "external": 8}
    },
    {
      "url": "https://competitor.com/email-marketing",
      "title": "Email Marketing Best Practices",
      "content": {
        "wordCount": 1800,
        "headings": [
          {"level": "h1", "text": "Email Marketing Best Practices"}
        ]
      },
      "schema": ["Article"],
      "images": {"total": 6},
      "links": {"internal": 12, "external": 4}
    }
  ]
}
EOF

info "Created mock crawl data"

# Test content gap analysis
if node -e "
const fs = require('fs');
const ContentGapAnalyzer = require('./scripts/lib/seo-content-gap-analyzer');
const analyzer = new ContentGapAnalyzer({ useCache: false });

const yourCrawl = JSON.parse(fs.readFileSync('$TEST_DIR/your-site-crawl.json', 'utf8'));
const compCrawl = JSON.parse(fs.readFileSync('$TEST_DIR/competitor-crawl.json', 'utf8'));

(async () => {
  const result = await analyzer.analyzeGaps(
    'example.com',
    ['competitor.com'],
    {
      yourCrawlData: yourCrawl,
      competitorCrawlData: [compCrawl]
    }
  );

  fs.writeFileSync('$TEST_DIR/content-gaps.json', JSON.stringify(result, null, 2));
  console.log('Gap analysis complete');
})();
" > "$TEST_DIR/gap-analysis.log" 2>&1; then
  pass "Content gap analysis executed successfully"

  if [ -f "$TEST_DIR/content-gaps.json" ]; then
    pass "Content gaps JSON created"

    # Check for topic gaps
    TOPIC_GAPS=$(jq -r '.summary.totalTopicGaps' "$TEST_DIR/content-gaps.json" 2>/dev/null || echo "0")
    if [ "$TOPIC_GAPS" -gt 0 ]; then
      pass "Topic gaps identified: $TOPIC_GAPS"
    else
      warn "No topic gaps found (expected with limited mock data)"
    fi

    # Check for content depth gaps
    DEPTH_GAPS=$(jq -r '.summary.totalContentDepthGaps' "$TEST_DIR/content-gaps.json" 2>/dev/null || echo "0")
    if [ "$DEPTH_GAPS" -gt 0 ]; then
      pass "Content depth gaps identified: $DEPTH_GAPS"
    else
      warn "No content depth gaps found"
    fi

    # Check for recommendations
    REC_COUNT=$(jq -r '.summary.totalRecommendations' "$TEST_DIR/content-gaps.json" 2>/dev/null || echo "0")
    if [ "$REC_COUNT" -gt 0 ]; then
      pass "Recommendations generated: $REC_COUNT"
    else
      warn "No recommendations generated"
    fi
  else
    fail "Content gaps JSON not created"
  fi
else
  fail "Content gap analysis failed"
  cat "$TEST_DIR/gap-analysis.log"
fi

echo ""

# ============================================
# Test 4: Script Dependencies
# ============================================
echo -e "${BLUE}Test 4: Script Dependencies${NC}"

# Check if scripts can be imported
for script in "seo-serp-analyzer" "seo-keyword-researcher" "seo-content-gap-analyzer"; do
  if node -e "require('./scripts/lib/$script.js');" 2>/dev/null; then
    pass "$script.js can be imported"
  else
    fail "$script.js cannot be imported"
  fi
done

echo ""

# ============================================
# Test 5: JSON Output Validation
# ============================================
echo -e "${BLUE}Test 5: JSON Output Validation${NC}"

# Validate all generated JSON files
for json_file in "$TEST_DIR"/*.json; do
  if [ -f "$json_file" ]; then
    filename=$(basename "$json_file")
    if jq empty "$json_file" 2>/dev/null; then
      pass "$filename is valid JSON"
    else
      fail "$filename is invalid JSON"
    fi
  fi
done

echo ""

# ============================================
# Test 6: Phase 1 Integration
# ============================================
echo -e "${BLUE}Test 6: Phase 1 Integration${NC}"

# Check if Phase 1 scripts are accessible
PHASE1_SCRIPTS=("seo-sitemap-crawler" "seo-batch-analyzer" "seo-technical-health-scorer")

for script in "${PHASE1_SCRIPTS[@]}"; do
  if [ -f "scripts/lib/$script.js" ]; then
    pass "Phase 1 script available: $script.js"
  else
    fail "Phase 1 script missing: $script.js"
  fi
done

# Check if Phase 1 agent is available
if [ -f "agents/hubspot-seo-site-crawler.md" ]; then
  pass "Phase 1 agent available: hubspot-seo-site-crawler"
else
  fail "Phase 1 agent missing: hubspot-seo-site-crawler"
fi

echo ""

# ============================================
# Test Summary
# ============================================
echo "============================================="
echo "Test Summary"
echo "============================================="
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo -e "${YELLOW}Warnings: $WARNINGS${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ All critical tests passed!${NC}"
  echo ""
  echo "Phase 2 components are functional and ready for integration."
  echo ""
  echo "Next steps:"
  echo "1. Review test results in: $TEST_DIR"
  echo "2. Proceed with end-to-end workflow testing"
  echo "3. Test with real competitor sites"
  exit 0
else
  echo -e "${RED}❌ $FAILED test(s) failed${NC}"
  echo ""
  echo "Review logs in: $TEST_DIR"
  exit 1
fi
