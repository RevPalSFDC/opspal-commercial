#!/bin/bash
# Pre-Commit Quality Check Hook
# Prevents common quality issues from being committed
#
# Usage: Place in .git/hooks/pre-commit or .claude-plugins/hooks/
# Make executable: chmod +x pre-commit-quality-check.sh

set -e

BOLD='\033[1m'
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BOLD}🔍 Running pre-commit quality checks...${NC}"

ERRORS=0
WARNINGS=0

# Get staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)

if [ -z "$STAGED_FILES" ]; then
  echo -e "${GREEN}✓ No files staged${NC}"
  exit 0
fi

echo ""
echo -e "${BOLD}Checking ${#STAGED_FILES[@]} staged files...${NC}"
echo ""

# ====================================================================
# CHECK 1: Cross-Boundary Imports (.claude/ from plugins)
# ====================================================================
echo -e "${BOLD}[1/5] Checking for cross-boundary imports...${NC}"

CROSS_BOUNDARY=$(echo "$STAGED_FILES" | grep -E '\.claude-plugins/.*\.md$' | xargs grep -l "@import.*\.claude/" 2>/dev/null || true)

if [ -n "$CROSS_BOUNDARY" ]; then
  echo -e "${RED}❌ BLOCKED: Found cross-boundary imports (gitignored .claude/ from plugins)${NC}"
  echo ""
  echo "$CROSS_BOUNDARY" | while read file; do
    echo -e "  ${RED}•${NC} $file"
    grep -n "@import.*\.claude/" "$file" | head -3 | sed 's/^/    /'
  done
  echo ""
  echo -e "${YELLOW}Fix: Replace @import ../.claude/... with plugin-local paths${NC}"
  echo -e "${YELLOW}Example: @import ../docs/shared/STANDARDS.md${NC}"
  echo ""
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}✓ No cross-boundary imports${NC}"
fi

# ====================================================================
# CHECK 2: Mock Data Generation
# ====================================================================
echo -e "${BOLD}[2/5] Checking for mock data generation...${NC}"

MOCK_DATA=$(echo "$STAGED_FILES" | grep -E '\.(js|ts)$' | xargs grep -l "Array.from.*length.*mock\|mockData\|fakeData\|simulateMode.*return.*mock" 2>/dev/null || true)

if [ -n "$MOCK_DATA" ]; then
  echo -e "${YELLOW}⚠️  WARNING: Found potential mock data generation${NC}"
  echo ""
  echo "$MOCK_DATA" | while read file; do
    echo -e "  ${YELLOW}•${NC} $file"
    grep -n "Array.from.*length.*mock\|mockData\|fakeData\|simulateMode.*return.*mock" "$file" | head -2 | sed 's/^/    /'
  done
  echo ""
  echo -e "${YELLOW}Review: Ensure mock data throws DataAccessError instead of returning${NC}"
  echo -e "${YELLOW}Correct pattern:${NC}"
  echo -e "  ${YELLOW}if (simulateMode) throw new DataAccessError('API', 'Simulate mode', {...})${NC}"
  echo ""
  WARNINGS=$((WARNINGS + 1))
else
  echo -e "${GREEN}✓ No mock data generation detected${NC}"
fi

# ====================================================================
# CHECK 3: Silent Error Handling (return null in catch)
# ====================================================================
echo -e "${BOLD}[3/5] Checking for silent error handling...${NC}"

SILENT_ERRORS=$(echo "$STAGED_FILES" | grep -E '\.(js|ts)$' | xargs grep -l "catch.*{.*return null\|catch.*{.*return \[\]\|catch.*{.*return {}" 2>/dev/null || true)

if [ -n "$SILENT_ERRORS" ]; then
  echo -e "${YELLOW}⚠️  WARNING: Found potential silent error handling${NC}"
  echo ""
  echo "$SILENT_ERRORS" | while read file; do
    echo -e "  ${YELLOW}•${NC} $file"
    grep -A 2 -B 1 "catch" "$file" | grep -A 2 "return null\|return \[\]\|return {}" | head -5 | sed 's/^/    /'
  done
  echo ""
  echo -e "${YELLOW}Review: Consider throwing DataAccessError instead of returning null/[]/{}${NC}"
  echo -e "${YELLOW}Correct pattern:${NC}"
  echo -e "  ${YELLOW}catch (error) { throw new DataAccessError('Source', error.message, {...}) }${NC}"
  echo ""
  WARNINGS=$((WARNINGS + 1))
else
  echo -e "${GREEN}✓ No obvious silent error patterns${NC}"
fi

# ====================================================================
# CHECK 4: Missing DataAccessError Import in API Files
# ====================================================================
echo -e "${BOLD}[4/5] Checking for missing DataAccessError imports...${NC}"

API_FILES=$(echo "$STAGED_FILES" | grep -E 'scripts/lib/.*\.(js|ts)$' || true)

if [ -n "$API_FILES" ]; then
  MISSING_DATA_ACCESS_ERROR=""

  for file in $API_FILES; do
    # Check if file has API calls but no DataAccessError import
    if grep -q "fetch(\|axios\|request(\|\.get(\|\.post(" "$file" 2>/dev/null; then
      if ! grep -q "DataAccessError" "$file" 2>/dev/null; then
        MISSING_DATA_ACCESS_ERROR="$MISSING_DATA_ACCESS_ERROR\n$file"
      fi
    fi
  done

  if [ -n "$MISSING_DATA_ACCESS_ERROR" ]; then
    echo -e "${YELLOW}⚠️  WARNING: API files without DataAccessError import${NC}"
    echo ""
    echo -e "$MISSING_DATA_ACCESS_ERROR" | grep -v "^$" | while read file; do
      echo -e "  ${YELLOW}•${NC} $file"
    done
    echo ""
    echo -e "${YELLOW}Consider adding: const { DataAccessError } = require('./data-access-error')${NC}"
    echo ""
    WARNINGS=$((WARNINGS + 1))
  else
    echo -e "${GREEN}✓ All API files have DataAccessError or no API calls${NC}"
  fi
else
  echo -e "${GREEN}✓ No API files staged${NC}"
fi

# ====================================================================
# CHECK 5: Hardcoded Credentials or Secrets
# ====================================================================
echo -e "${BOLD}[5/5] Checking for hardcoded credentials...${NC}"

SECRETS=$(echo "$STAGED_FILES" | xargs grep -n "SUPABASE_URL.*=.*https://\|HUBSPOT_ACCESS_TOKEN.*=\|api[_-]key.*=.*['\"]sk_\|password.*=.*['\"][^$]" 2>/dev/null || true)

if [ -n "$SECRETS" ]; then
  echo -e "${RED}❌ BLOCKED: Found potential hardcoded credentials${NC}"
  echo ""
  echo "$SECRETS" | head -10 | while read line; do
    echo -e "  ${RED}•${NC} $line"
  done
  echo ""
  echo -e "${YELLOW}Fix: Use environment variables instead${NC}"
  echo -e "${YELLOW}Example: process.env.SUPABASE_URL (not hardcoded URL)${NC}"
  echo ""
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}✓ No hardcoded credentials detected${NC}"
fi

# ====================================================================
# Summary
# ====================================================================
echo ""
echo -e "${BOLD}═══════════════════════════════════════${NC}"

if [ $ERRORS -gt 0 ]; then
  echo -e "${RED}❌ COMMIT BLOCKED: $ERRORS critical issues found${NC}"
  echo -e "${YELLOW}⚠️  $WARNINGS warnings (non-blocking)${NC}"
  echo ""
  echo -e "${YELLOW}Fix the errors above and try again.${NC}"
  exit 1
elif [ $WARNINGS -gt 0 ]; then
  echo -e "${YELLOW}⚠️  $WARNINGS warnings found (commit allowed)${NC}"
  echo ""
  echo -e "${YELLOW}Review warnings before pushing.${NC}"
  echo ""
  echo -e "${GREEN}✓ Commit proceeding...${NC}"
  exit 0
else
  echo -e "${GREEN}✓ All quality checks passed!${NC}"
  exit 0
fi
