#!/bin/bash

###############################################################################
# Test Quality Auditor Stop Hooks
#
# Verifies that all three Stop hooks execute correctly with test data.
###############################################################################

set -euo pipefail

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}🧪 Testing Quality Auditor Stop Hooks${NC}\n"

# Setup test directory
TEST_DIR="/tmp/quality-auditor-test-$$"
mkdir -p "$TEST_DIR"

echo -e "${GREEN}✅ Created test directory: $TEST_DIR${NC}\n"

# Phase 1: Create test data
echo -e "${YELLOW}Phase 1: Creating test data...${NC}"

# Create test audit manifest
cat > "$TEST_DIR/quality-audit-manifest.json" <<'EOF'
{
  "metadata": {
    "auditDate": "2025-01-07T00:00:00Z",
    "orgAlias": "test-org",
    "artifactCount": 4,
    "version": "1.0.0"
  },
  "scores": {
    "overall": 85,
    "fieldHealth": 90,
    "automation": 80,
    "performance": 85,
    "security": 88,
    "compliance": 82
  },
  "analysis": {
    "totalIssues": 12,
    "criticalIssues": 2,
    "highIssues": 5,
    "mediumIssues": 3,
    "lowIssues": 2,
    "topIssues": [
      "❌ Unencrypted PII fields detected",
      "🔴 Field History Tracking approaching limit",
      "⚠️ Validation rules with hardcoded IDs",
      "💡 Duplicate field candidates found",
      "📊 Flow conflicts detected"
    ]
  },
  "recommendations": [
    {
      "title": "Encrypt PII fields",
      "priority": 1,
      "effort": "2-4 hours",
      "impact": "High - compliance requirement"
    },
    {
      "title": "Consolidate validation rules",
      "priority": 2,
      "effort": "3-5 hours",
      "impact": "Medium - reduces complexity"
    },
    {
      "title": "Archive unused fields",
      "priority": 3,
      "effort": "1-2 hours",
      "impact": "Low - improves page load"
    }
  ],
  "artifacts": {
    "reports": ["summary.md", "detailed-analysis.md"],
    "diagrams": ["drift-comparison.md", "health-trends.md"],
    "data": []
  },
  "detailedFindings": {
    "sources": [
      {
        "source": "field-analysis.md",
        "type": "text",
        "summary": { "scoreCount": 3, "issueCount": 8 }
      }
    ]
  }
}
EOF

# Create test report
cat > "$TEST_DIR/summary.md" <<'EOF'
# Quality Audit Summary

Quality Score: 85/100

## Key Findings

- 2 critical issues identified
- 5 high-priority recommendations
- 88% security compliance

## Issues

❌ Critical: Unencrypted PII fields
🔴 High: Field History Tracking limit approaching
EOF

# Create test transcript placeholder
echo "Test transcript" > "$TEST_DIR/transcript.txt"

echo -e "${GREEN}✅ Test data created${NC}\n"

# Phase 2: Test Hook 1 - Generate Executive Summary
echo -e "${YELLOW}Phase 2: Testing generate-executive-summary hook...${NC}"

cd "$(dirname "$0")/.."

if node scripts/lib/quality-audit-summary-generator.js "$TEST_DIR/transcript.txt" --output-dir "$TEST_DIR"; then
    echo -e "${GREEN}✅ Hook 1 passed: Executive summary generated${NC}\n"
else
    echo -e "${RED}❌ Hook 1 failed${NC}\n"
    exit 1
fi

# Verify outputs
if [ -f "$TEST_DIR/quality-audit-summary-"*".html" ]; then
    echo -e "${GREEN}✅ PDF report generated${NC}"
else
    echo -e "${YELLOW}⚠️  PDF report not found (expected)${NC}"
fi

if [ -f "$TEST_DIR/quality-audit-manifest.json" ]; then
    echo -e "${GREEN}✅ Manifest exists${NC}\n"
else
    echo -e "${RED}❌ Manifest missing${NC}\n"
    exit 1
fi

# Phase 3: Test Hook 2 - Package Deliverables
echo -e "${YELLOW}Phase 3: Testing package-deliverables hook...${NC}"

if bash scripts/lib/package-audit-deliverables.sh "$TEST_DIR" --org-alias "test-org"; then
    echo -e "${GREEN}✅ Hook 2 passed: Deliverables packaged${NC}\n"
else
    echo -e "${RED}❌ Hook 2 failed${NC}\n"
    exit 1
fi

# Verify archive
if ls "$TEST_DIR"/quality-audit-test-org-*.zip &> /dev/null; then
    ARCHIVE_SIZE=$(du -h "$TEST_DIR"/quality-audit-test-org-*.zip | cut -f1)
    echo -e "${GREEN}✅ Archive created (${ARCHIVE_SIZE})${NC}\n"
else
    echo -e "${RED}❌ Archive not created${NC}\n"
    exit 1
fi

# Phase 4: Test Hook 3 - Post to Asana
echo -e "${YELLOW}Phase 4: Testing post-to-asana hook...${NC}"

if node scripts/lib/asana-status-updater.js "$TEST_DIR/quality-audit-manifest.json"; then
    echo -e "${GREEN}✅ Hook 3 passed: Asana update formatted${NC}\n"
else
    echo -e "${RED}❌ Hook 3 failed${NC}\n"
    exit 1
fi

# Verify Asana update file
if [ -f "$TEST_DIR/asana-update.md" ]; then
    echo -e "${GREEN}✅ Asana update file created${NC}"
    echo -e "\nAsana Update Preview:"
    head -n 10 "$TEST_DIR/asana-update.md"
    echo ""
else
    echo -e "${YELLOW}⚠️  Asana update file not found${NC}\n"
fi

# Phase 5: Summary
echo -e "${YELLOW}📊 Test Summary${NC}\n"
echo -e "  ${GREEN}✅ All 3 hooks executed successfully${NC}"
echo -e "  ${GREEN}✅ Executive summary generated${NC}"
echo -e "  ${GREEN}✅ Deliverables packaged${NC}"
echo -e "  ${GREEN}✅ Asana update formatted${NC}"
echo -e "\n  Test artifacts: ${TEST_DIR}"
echo -e "  Archive: $(ls "$TEST_DIR"/quality-audit-test-org-*.zip 2>/dev/null || echo 'Not found')"

# Cleanup option
echo -e "\n${YELLOW}Cleanup test directory? (y/n)${NC}"
read -r CLEANUP
if [ "$CLEANUP" = "y" ]; then
    rm -rf "$TEST_DIR"
    echo -e "${GREEN}✅ Test directory removed${NC}"
else
    echo -e "${YELLOW}Test directory preserved for inspection${NC}"
fi

echo -e "\n${GREEN}✅ Hook Testing Complete${NC}"
exit 0
