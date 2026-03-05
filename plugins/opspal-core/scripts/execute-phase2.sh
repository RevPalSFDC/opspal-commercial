#!/bin/bash

##
# Phase 2 Execution Script
#
# This script executes Phase 2 of the reflection processing workflow:
# 1. Converts phase1-data to execution-data format
# 2. Invokes process-reflections.js in execute mode
# 3. Generates summary report
#
# The script uses the comprehensive orchestration infrastructure with:
# - Saga pattern for transactional integrity
# - Supabase verified updates with persistence checks
# - Asana task creation via supabase-asana-bridge
# - Fix plan generation via supabase-fix-planner
##

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo
echo "════════════════════════════════════════════════════════════"
echo "  PHASE 2: REFLECTION PROCESSING EXECUTION"
echo "════════════════════════════════════════════════════════════"
echo

# Check dependencies
echo -e "${BLUE}Checking dependencies...${NC}"

if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js not found${NC}"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo -e "${RED}✗ jq not found (required for JSON processing)${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Dependencies OK${NC}"
echo

# Check environment variables
echo -e "${BLUE}Checking environment...${NC}"

REQUIRED_VARS=("SUPABASE_URL" "SUPABASE_SERVICE_ROLE_KEY" "ASANA_ACCESS_TOKEN")
MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var:-}" ]; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo -e "${RED}✗ Missing required environment variables:${NC}"
    printf '  %s\n' "${MISSING_VARS[@]}"
    echo
    echo "Set them in .env file or export them:"
    for var in "${MISSING_VARS[@]}"; do
        echo "  export $var=<value>"
    done
    exit 1
fi

echo -e "${GREEN}✓ Environment OK${NC}"
echo

# Locate phase1 data
PHASE1_DATA="plugins/opspal-core/output/reflection-processing/phase1-data-2026-01-27.json"

if [ ! -f "$PHASE1_DATA" ]; then
    echo -e "${RED}✗ Phase 1 data not found: $PHASE1_DATA${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Phase 1 data found${NC}"
echo

# Parse phase1 data to understand structure
echo "─────────────────────────────────────────────────────────────"
echo "  Phase 1 Data Summary"
echo "─────────────────────────────────────────────────────────────"

REFLECTION_COUNT=$(jq '.reflections | length' "$PHASE1_DATA")
COHORT_COUNT=$(jq '.cohorts | length' "$PHASE1_DATA")
TIMESTAMP=$(jq -r '.timestamp' "$PHASE1_DATA")

echo "  Timestamp: $TIMESTAMP"
echo "  Reflections: $REFLECTION_COUNT"
echo "  Cohorts: $COHORT_COUNT"
echo

if [ "$COHORT_COUNT" -eq 0 ]; then
    echo -e "${YELLOW}⚠ No cohorts to process${NC}"
    exit 0
fi

# Convert to execution data format
echo "─────────────────────────────────────────────────────────────"
echo "  Converting to Execution Data Format"
echo "─────────────────────────────────────────────────────────────"
echo

node plugins/opspal-core/scripts/convert-phase1-to-execution-data.js

# Find the generated execution data file
EXECUTION_DATA=$(ls -t reports/reflection-plan-*-execution-data.json 2>/dev/null | head -1)

if [ -z "$EXECUTION_DATA" ]; then
    echo -e "${RED}✗ Failed to generate execution data${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Execution data ready: $EXECUTION_DATA${NC}"
echo

# Execute Phase 2
echo "════════════════════════════════════════════════════════════"
echo "  EXECUTING PHASE 2"
echo "════════════════════════════════════════════════════════════"
echo

# Check for dry-run flag
DRY_RUN_FLAG=""
if [[ "${1:-}" == "--dry-run" ]]; then
    DRY_RUN_FLAG="--dry-run"
    echo -e "${YELLOW}Running in DRY RUN mode (no changes will be made)${NC}"
    echo
fi

# Execute with orchestration script
node .claude/scripts/process-reflections.js --execute="$EXECUTION_DATA" $DRY_RUN_FLAG

EXIT_CODE=$?

echo
if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✅ Phase 2 execution completed successfully${NC}"
else
    echo -e "${RED}❌ Phase 2 execution failed (exit code: $EXIT_CODE)${NC}"
fi

echo
echo "════════════════════════════════════════════════════════════"
echo

exit $EXIT_CODE
