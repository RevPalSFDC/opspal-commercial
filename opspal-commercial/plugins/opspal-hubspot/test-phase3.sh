#!/bin/bash

#
# Phase 3 Unit Test Script
# Tests all 5 Phase 3 scripts + orchestration
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TOTAL=0
PASSED=0
FAILED=0

# Test result directory
TEST_DIR=".test-results/phase3"
mkdir -p "$TEST_DIR"

# Helper functions
pass() {
  echo -e "${GREEN}✓ PASS${NC}: $1"
  PASSED=$((PASSED + 1))
}

fail() {
  echo -e "${RED}✗ FAIL${NC}: $1"
  FAILED=$((FAILED + 1))
}

info() {
  echo -e "${BLUE}ℹ INFO${NC}: $1"
}

section() {
  echo ""
  echo -e "${YELLOW}========================================${NC}"
  echo -e "${YELLOW}$1${NC}"
  echo -e "${YELLOW}========================================${NC}"
}

# Check if script exists and is executable
check_script() {
  local script=$1
  TOTAL=$((TOTAL + 1))

  if [ ! -f "$script" ]; then
    fail "Script not found: $script"
    return 1
  fi

  if [ ! -x "$script" ]; then
    chmod +x "$script"
  fi

  pass "Script exists: $(basename $script)"
  return 0
}

# Test script execution with basic arguments
test_script_help() {
  local script=$1
  local name=$(basename "$script" .js)
  TOTAL=$((TOTAL + 1))

  if node "$script" --help > /dev/null 2>&1; then
    pass "$name --help works"
    return 0
  else
    fail "$name --help failed"
    return 1
  fi
}

# Create mock HTML content for testing
create_mock_html() {
  cat > "$TEST_DIR/mock-content.html" << 'EOF'
<!DOCTYPE html>
<html>
<head>
  <title>Complete Guide to Revenue Operations</title>
  <meta name="description" content="Learn how to build and scale revenue operations teams.">
</head>
<body>
  <h1>Complete Guide to Revenue Operations</h1>

  <p>Revenue operations (RevOps) is a strategic approach to aligning sales, marketing, and customer success teams around a unified revenue goal. This comprehensive guide will teach you everything you need to know about building a successful revenue operations function.</p>

  <h2>What is Revenue Operations?</h2>
  <p>Revenue operations is the alignment of sales, marketing, and customer success operations across the full customer lifecycle. It focuses on driving growth through operational efficiency and keeping all teams accountable to revenue.</p>

  <h2>Key Components of RevOps</h2>
  <ul>
    <li>Data management and analytics</li>
    <li>Technology stack optimization</li>
    <li>Process standardization</li>
    <li>Performance metrics</li>
    <li>Cross-functional alignment</li>
  </ul>

  <h2>How to Build a RevOps Team</h2>
  <p>Building a revenue operations team requires careful planning and execution. Here are the key steps:</p>

  <ol>
    <li>Assess your current state and identify gaps</li>
    <li>Define clear objectives and key results</li>
    <li>Hire the right talent with cross-functional experience</li>
    <li>Implement the right technology stack</li>
    <li>Establish clear processes and governance</li>
  </ol>

  <h2>Best Practices</h2>
  <p>Successful revenue operations teams follow these best practices:</p>
  <p>First, they maintain a single source of truth for customer data. Second, they automate repetitive tasks to free up time for strategic work. Third, they continuously measure and optimize key metrics.</p>

  <h2>Common Challenges</h2>
  <p>Organizations often face challenges when implementing revenue operations, including data silos, resistance to change, and lack of executive sponsorship. However, these challenges can be overcome with proper planning and communication.</p>

  <img src="revops-diagram.png" alt="Revenue Operations Organizational Structure">

  <p>Revenue operations is not just a trend; it's a fundamental shift in how modern B2B companies operate. By aligning teams and optimizing processes, RevOps enables sustainable growth and improved customer experiences.</p>
</body>
</html>
EOF

  info "Created mock HTML content"
}

# Create mock markdown content
create_mock_markdown() {
  cat > "$TEST_DIR/mock-content.md" << 'EOF'
# The Ultimate Guide to Marketing Automation

Marketing automation has revolutionized how businesses engage with prospects and customers. This comprehensive guide covers everything you need to know about implementing marketing automation successfully.

## What is Marketing Automation?

Marketing automation is technology that manages marketing processes and multifunctional campaigns across multiple channels automatically. It helps businesses nurture prospects with highly personalized, useful content that converts prospects into customers and customers into advocates.

## Benefits of Marketing Automation

Marketing automation delivers significant benefits:

- **Increased efficiency**: Automate repetitive tasks
- **Better lead nurturing**: Personalized communication at scale
- **Improved ROI**: Better targeting and measurement
- **Enhanced customer experience**: Timely, relevant interactions
- **Data-driven insights**: Better understanding of customer behavior

## Key Features to Look For

When evaluating marketing automation platforms, consider these essential features:

1. Email marketing capabilities
2. Lead scoring and grading
3. CRM integration
4. Landing page builder
5. Analytics and reporting
6. Multi-channel support

## Implementation Best Practices

Successfully implementing marketing automation requires careful planning. Start by defining clear goals and mapping your customer journey. Then, segment your audience and create targeted content for each stage of the funnel.

However, many companies make the mistake of automating too quickly without proper strategy. Take time to understand your audience and their needs before launching complex automation workflows.

## Common Mistakes to Avoid

Organizations frequently encounter these pitfalls when implementing marketing automation:

- Over-automating and losing the personal touch
- Poor data quality leading to irrelevant messaging
- Lack of content strategy
- Insufficient testing and optimization

## Getting Started

If you're ready to implement marketing automation, start small and scale gradually. Focus on one or two high-impact use cases first, such as welcome email series or lead nurturing campaigns. As you gain experience and see results, expand to more sophisticated automation.
EOF

  info "Created mock Markdown content"
}

# Create mock crawl data for internal linking
create_mock_crawl() {
  cat > "$TEST_DIR/mock-crawl.json" << 'EOF'
{
  "domain": "example.com",
  "crawledAt": "2025-11-14T12:00:00Z",
  "pages": [
    {
      "url": "https://example.com/",
      "title": "Revenue Operations Platform - Example.com",
      "content": {
        "wordCount": 800,
        "headings": {
          "h1": ["Revenue Operations Platform"],
          "h2": ["Features", "Benefits", "Pricing"],
          "h3": []
        },
        "images": [
          {"src": "hero.png", "alt": "RevOps Dashboard"}
        ]
      },
      "links": {
        "internal": [
          {"href": "https://example.com/features", "text": "Learn More"}
        ]
      }
    },
    {
      "url": "https://example.com/features",
      "title": "Features - Revenue Operations Tools",
      "content": {
        "wordCount": 1500,
        "headings": {
          "h1": ["Features"],
          "h2": ["Data Analytics", "Team Alignment", "Automation"],
          "h3": ["Real-time Dashboards", "Custom Reports"]
        },
        "images": [
          {"src": "features.png", "alt": "Feature Overview"}
        ]
      },
      "links": {
        "internal": [
          {"href": "https://example.com/", "text": "Home"},
          {"href": "https://example.com/pricing", "text": "See Pricing"}
        ]
      }
    },
    {
      "url": "https://example.com/blog/what-is-revops",
      "title": "What is Revenue Operations? Complete Guide",
      "content": {
        "wordCount": 2500,
        "headings": {
          "h1": ["What is Revenue Operations?"],
          "h2": ["Definition", "Key Components", "Benefits", "How to Get Started"],
          "h3": ["Sales Operations", "Marketing Operations", "Customer Success Operations"]
        },
        "images": [
          {"src": "revops-diagram.png", "alt": "RevOps Organizational Structure"}
        ]
      },
      "links": {
        "internal": [
          {"href": "https://example.com/", "text": "Home"}
        ]
      }
    },
    {
      "url": "https://example.com/blog/revops-best-practices",
      "title": "Revenue Operations Best Practices for 2025",
      "content": {
        "wordCount": 1800,
        "headings": {
          "h1": ["Revenue Operations Best Practices"],
          "h2": ["Data Management", "Process Optimization", "Technology Stack"],
          "h3": []
        },
        "images": []
      },
      "links": {
        "internal": [
          {"href": "https://example.com/blog/what-is-revops", "text": "Learn about RevOps"}
        ]
      }
    },
    {
      "url": "https://example.com/resources/guide",
      "title": "Free RevOps Implementation Guide",
      "content": {
        "wordCount": 500,
        "headings": {
          "h1": ["Free Implementation Guide"],
          "h2": ["Download Now"],
          "h3": []
        },
        "images": []
      },
      "links": {
        "internal": []
      }
    }
  ]
}
EOF

  info "Created mock crawl data"
}

# Create mock keyword research data
create_mock_keywords() {
  cat > "$TEST_DIR/mock-keywords.json" << 'EOF'
{
  "seedKeyword": "revenue operations",
  "generatedAt": "2025-11-14T12:00:00Z",
  "keywords": [
    {
      "keyword": "revenue operations",
      "searchVolume": 2400,
      "difficulty": 45,
      "opportunityScore": 7.5
    },
    {
      "keyword": "what is revenue operations",
      "searchVolume": 880,
      "difficulty": 30,
      "opportunityScore": 8.2
    },
    {
      "keyword": "revenue operations team",
      "searchVolume": 590,
      "difficulty": 35,
      "opportunityScore": 7.8
    },
    {
      "keyword": "revenue operations manager",
      "searchVolume": 480,
      "difficulty": 40,
      "opportunityScore": 7.0
    },
    {
      "keyword": "revenue operations framework",
      "searchVolume": 320,
      "difficulty": 25,
      "opportunityScore": 8.5
    }
  ]
}
EOF

  info "Created mock keyword data"
}

# Create mock gap analysis data
create_mock_gaps() {
  cat > "$TEST_DIR/mock-gaps.json" << 'EOF'
{
  "analyzedAt": "2025-11-14T12:00:00Z",
  "topicGaps": [
    {
      "topic": "revenue operations metrics",
      "severity": 8,
      "competitorUrls": [
        "https://competitor1.com/revops-metrics",
        "https://competitor2.com/measuring-revops"
      ],
      "avgWordCount": 2200,
      "commonElements": ["dashboard examples", "KPI definitions", "calculation formulas"]
    },
    {
      "topic": "revenue operations tools",
      "severity": 7,
      "competitorUrls": [
        "https://competitor1.com/best-revops-tools"
      ],
      "avgWordCount": 2800,
      "commonElements": ["tool comparisons", "feature matrices", "pricing"]
    }
  ],
  "keywordGaps": [
    {
      "keyword": "revenue operations salary",
      "searchVolume": 720,
      "difficulty": 35,
      "opportunity": 7.5,
      "competitorUrls": [
        "https://competitor1.com/revops-salary-guide"
      ]
    },
    {
      "keyword": "revenue operations vs sales operations",
      "searchVolume": 450,
      "difficulty": 30,
      "opportunity": 8.0,
      "competitorUrls": [
        "https://competitor2.com/revops-vs-sales-ops"
      ]
    }
  ]
}
EOF

  info "Created mock gap analysis data"
}

#
# MAIN TEST EXECUTION
#

section "PHASE 3 UNIT TESTS - Starting"

# Change to plugin directory
cd "$(dirname "$0")"
info "Working directory: $(pwd)"

# Create mock data
section "Creating Mock Test Data"
create_mock_html
create_mock_markdown
create_mock_crawl
create_mock_keywords
create_mock_gaps

# Test 1: Script Existence
section "Test 1: Script Existence & Permissions"

check_script "scripts/lib/seo-content-scorer.js"
check_script "scripts/lib/seo-aeo-optimizer.js"
check_script "scripts/lib/seo-readability-analyzer.js"
check_script "scripts/lib/seo-content-recommender.js"
check_script "scripts/lib/seo-internal-linking-suggestor.js"

# Test 2: Help Output
section "Test 2: Help/Usage Information"

test_script_help "scripts/lib/seo-content-scorer.js"
test_script_help "scripts/lib/seo-aeo-optimizer.js"
test_script_help "scripts/lib/seo-readability-analyzer.js"
test_script_help "scripts/lib/seo-content-recommender.js"
test_script_help "scripts/lib/seo-internal-linking-suggestor.js"

# Test 3: Content Scorer
section "Test 3: Content Scorer - Basic Functionality"

TOTAL=$((TOTAL + 1))
if node scripts/lib/seo-content-scorer.js "$TEST_DIR/mock-content.html" \
    --keyword "revenue operations" \
    --format html \
    --output "$TEST_DIR/content-score.json" > /dev/null 2>&1; then

  if [ -f "$TEST_DIR/content-score.json" ]; then
    # Check if output contains expected fields
    if grep -q "overallScore" "$TEST_DIR/content-score.json" && \
       grep -q "readability" "$TEST_DIR/content-score.json" && \
       grep -q "recommendations" "$TEST_DIR/content-score.json"; then
      pass "Content scorer produces valid output"
    else
      fail "Content scorer output missing expected fields"
    fi
  else
    fail "Content scorer did not create output file"
  fi
else
  fail "Content scorer execution failed"
fi

# Test 4: AEO Optimizer
section "Test 4: AEO Optimizer - Basic Functionality"

TOTAL=$((TOTAL + 1))
if node scripts/lib/seo-aeo-optimizer.js "$TEST_DIR/mock-content.html" \
    --keyword "revenue operations" \
    --format html \
    --output "$TEST_DIR/aeo-report.json" > /dev/null 2>&1; then

  if [ -f "$TEST_DIR/aeo-report.json" ]; then
    # Check if output contains expected fields
    if grep -q "aeoScore" "$TEST_DIR/aeo-report.json" && \
       grep -q "snippetOpportunities" "$TEST_DIR/aeo-report.json"; then
      pass "AEO optimizer produces valid output"
    else
      fail "AEO optimizer output missing expected fields"
    fi
  else
    fail "AEO optimizer did not create output file"
  fi
else
  fail "AEO optimizer execution failed"
fi

# Test 5: Readability Analyzer
section "Test 5: Readability Analyzer - Basic Functionality"

TOTAL=$((TOTAL + 1))
if node scripts/lib/seo-readability-analyzer.js "$TEST_DIR/mock-content.md" \
    --format markdown \
    --output "$TEST_DIR/readability-report.json" > /dev/null 2>&1; then

  if [ -f "$TEST_DIR/readability-report.json" ]; then
    # Check if output contains expected fields
    if grep -q "overallGrade" "$TEST_DIR/readability-report.json" && \
       grep -q "readabilityScores" "$TEST_DIR/readability-report.json" && \
       grep -q "sentenceAnalysis" "$TEST_DIR/readability-report.json"; then
      pass "Readability analyzer produces valid output"
    else
      fail "Readability analyzer output missing expected fields"
    fi
  else
    fail "Readability analyzer did not create output file"
  fi
else
  fail "Readability analyzer execution failed"
fi

# Test 6: Content Recommender
section "Test 6: Content Recommender - Basic Functionality"

TOTAL=$((TOTAL + 1))
if node scripts/lib/seo-content-recommender.js \
    --keywords "$TEST_DIR/mock-keywords.json" \
    --gap-analysis "$TEST_DIR/mock-gaps.json" \
    --crawl "$TEST_DIR/mock-crawl.json" \
    --output "$TEST_DIR/content-recommendations.json" > /dev/null 2>&1; then

  if [ -f "$TEST_DIR/content-recommendations.json" ]; then
    # Check if output contains expected fields
    if grep -q "recommendations" "$TEST_DIR/content-recommendations.json" && \
       grep -q "summary" "$TEST_DIR/content-recommendations.json"; then
      pass "Content recommender produces valid output"
    else
      fail "Content recommender output missing expected fields"
    fi
  else
    fail "Content recommender did not create output file"
  fi
else
  fail "Content recommender execution failed"
fi

# Test 7: Internal Linking Suggestor
section "Test 7: Internal Linking Suggestor - Basic Functionality"

TOTAL=$((TOTAL + 1))
if node scripts/lib/seo-internal-linking-suggestor.js "$TEST_DIR/mock-crawl.json" \
    --output "$TEST_DIR/internal-linking.json" > /dev/null 2>&1; then

  if [ -f "$TEST_DIR/internal-linking.json" ]; then
    # Check if output contains expected fields
    if grep -q "healthScore" "$TEST_DIR/internal-linking.json" && \
       grep -q "orphanPages" "$TEST_DIR/internal-linking.json" && \
       grep -q "recommendations" "$TEST_DIR/internal-linking.json"; then
      pass "Internal linking suggestor produces valid output"
    else
      fail "Internal linking suggestor output missing expected fields"
    fi
  else
    fail "Internal linking suggestor did not create output file"
  fi
else
  fail "Internal linking suggestor execution failed"
fi

# Test 8: Integration - Multiple Scripts
section "Test 8: Integration Testing"

TOTAL=$((TOTAL + 1))
# Run content scorer and readability analyzer on same content
if node scripts/lib/seo-content-scorer.js "$TEST_DIR/mock-content.html" \
    --keyword "revenue operations" \
    --format html \
    --output "$TEST_DIR/integration-content-score.json" > /dev/null 2>&1 && \
   node scripts/lib/seo-readability-analyzer.js "$TEST_DIR/mock-content.html" \
    --format html \
    --output "$TEST_DIR/integration-readability.json" > /dev/null 2>&1; then

  # Check both outputs exist
  if [ -f "$TEST_DIR/integration-content-score.json" ] && \
     [ -f "$TEST_DIR/integration-readability.json" ]; then
    pass "Multiple scripts can analyze same content"
  else
    fail "Integration test: missing output files"
  fi
else
  fail "Integration test: script execution failed"
fi

# Test 9: JSON Output Validation
section "Test 9: JSON Output Validation"

TOTAL=$((TOTAL + 1))
# Validate all JSON outputs are well-formed
all_valid=true

for json_file in "$TEST_DIR"/*.json; do
  if [ -f "$json_file" ]; then
    if ! node -e "JSON.parse(require('fs').readFileSync('$json_file', 'utf-8'))" 2>/dev/null; then
      fail "Invalid JSON: $(basename $json_file)"
      all_valid=false
    fi
  fi
done

if [ "$all_valid" = true ]; then
  pass "All JSON outputs are well-formed"
else
  fail "Some JSON outputs are malformed"
fi

# Test 10: Error Handling
section "Test 10: Error Handling"

TOTAL=$((TOTAL + 1))
# Test with invalid input (should fail gracefully)
if node scripts/lib/seo-content-scorer.js "/nonexistent/file.html" 2>/dev/null; then
  fail "Content scorer should fail with nonexistent file"
else
  pass "Content scorer handles missing file error correctly"
fi

TOTAL=$((TOTAL + 1))
# Test with invalid format
if node scripts/lib/seo-aeo-optimizer.js "$TEST_DIR/mock-crawl.json" \
    --format invalidformat 2>/dev/null; then
  fail "AEO optimizer should reject invalid format"
else
  pass "AEO optimizer handles invalid format error correctly"
fi

#
# FINAL RESULTS
#

section "TEST SUMMARY"

echo ""
echo "Total Tests:  $TOTAL"
echo -e "${GREEN}Passed:       $PASSED${NC}"
echo -e "${RED}Failed:       $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}✅ ALL TESTS PASSED${NC}"
  echo -e "${GREEN}========================================${NC}"
  exit 0
else
  echo -e "${RED}========================================${NC}"
  echo -e "${RED}❌ SOME TESTS FAILED${NC}"
  echo -e "${RED}========================================${NC}"
  exit 1
fi
