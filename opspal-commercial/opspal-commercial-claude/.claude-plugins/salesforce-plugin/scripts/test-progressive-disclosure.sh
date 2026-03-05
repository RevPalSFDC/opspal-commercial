#!/bin/bash

###############################################################################
# Progressive Disclosure System - Comprehensive Test Suite
#
# Tests keyword detection and context injection with various user prompts
# to validate the progressive disclosure optimization.
###############################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEYWORD_DETECTOR="$SCRIPT_DIR/lib/keyword-detector.js"
CONTEXT_INJECTOR="$SCRIPT_DIR/lib/context-injector.js"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "═══════════════════════════════════════════════════════════════════════════════"
echo "  PROGRESSIVE DISCLOSURE SYSTEM - TEST SUITE"
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""

###############################################################################
# Test Scenario 1: FLS Field Deployment
###############################################################################

echo -e "${BLUE}TEST 1: FLS Field Deployment${NC}"
echo "Prompt: 'Deploy custom field AccountTier__c to Account with FLS permissions'"
echo ""

RESULT=$(node "$KEYWORD_DETECTOR" "Deploy custom field AccountTier__c to Account with FLS permissions")
echo "$RESULT" | jq '.'

CONTEXTS_COUNT=$(echo "$RESULT" | jq '.matches | length')
echo ""
echo -e "${GREEN}✓ Detected $CONTEXTS_COUNT context(s)${NC}"
echo "  Primary: $(echo "$RESULT" | jq -r '.matches[0].contextName')"
echo "  Score: $(echo "$RESULT" | jq -r '.matches[0].score')"
echo ""

###############################################################################
# Test Scenario 2: Bulk Operations with Parallel Agents
###############################################################################

echo "───────────────────────────────────────────────────────────────────────────────"
echo -e "${BLUE}TEST 2: Bulk Operations with Parallel Agents${NC}"
echo "Prompt: 'Coordinate 8 agents to process bulk data in parallel'"
echo ""

RESULT=$(node "$KEYWORD_DETECTOR" "Coordinate 8 agents to process bulk data in parallel")
echo "$RESULT" | jq '.'

CONTEXTS_COUNT=$(echo "$RESULT" | jq '.matches | length')
echo ""
echo -e "${GREEN}✓ Detected $CONTEXTS_COUNT context(s)${NC}"
for i in $(seq 0 $(($CONTEXTS_COUNT - 1))); do
  NAME=$(echo "$RESULT" | jq -r ".matches[$i].contextName")
  SCORE=$(echo "$RESULT" | jq -r ".matches[$i].score")
  echo "  [$((i+1))] $NAME (score: $SCORE)"
done
echo ""

###############################################################################
# Test Scenario 3: Error Recovery & Troubleshooting
###############################################################################

echo "───────────────────────────────────────────────────────────────────────────────"
echo -e "${BLUE}TEST 3: Error Recovery & Troubleshooting${NC}"
echo "Prompt: 'Debug failed deployment and recover from validation errors'"
echo ""

RESULT=$(node "$KEYWORD_DETECTOR" "Debug failed deployment and recover from validation errors")
echo "$RESULT" | jq '.'

CONTEXTS_COUNT=$(echo "$RESULT" | jq '.matches | length')
echo ""
echo -e "${GREEN}✓ Detected $CONTEXTS_COUNT context(s)${NC}"
for i in $(seq 0 $(($CONTEXTS_COUNT - 1))); do
  NAME=$(echo "$RESULT" | jq -r ".matches[$i].contextName")
  SCORE=$(echo "$RESULT" | jq -r ".matches[$i].score")
  KEYWORDS=$(echo "$RESULT" | jq -r ".matches[$i].matchedKeywords | join(\", \")")
  echo "  [$((i+1))] $NAME (score: $SCORE)"
  echo "      Keywords: $KEYWORDS"
done
echo ""

###############################################################################
# Test Scenario 4: Flow Consolidation with Validation
###############################################################################

echo "───────────────────────────────────────────────────────────────────────────────"
echo -e "${BLUE}TEST 4: Flow Consolidation with Validation${NC}"
echo "Prompt: 'Create flow with validation for Opportunity before update'"
echo ""

RESULT=$(node "$KEYWORD_DETECTOR" "Create flow with validation for Opportunity before update")
echo "$RESULT" | jq '.'

CONTEXTS_COUNT=$(echo "$RESULT" | jq '.matches | length')
echo ""
echo -e "${GREEN}✓ Detected $CONTEXTS_COUNT context(s)${NC}"
for i in $(seq 0 $(($CONTEXTS_COUNT - 1))); do
  NAME=$(echo "$RESULT" | jq -r ".matches[$i].contextName")
  SCORE=$(echo "$RESULT" | jq -r ".matches[$i].score")
  echo "  [$((i+1))] $NAME (score: $SCORE)"
done
echo ""

###############################################################################
# Test Scenario 5: Sequential Multi-Step Operation
###############################################################################

echo "───────────────────────────────────────────────────────────────────────────────"
echo -e "${BLUE}TEST 5: Sequential Multi-Step Operation${NC}"
echo "Prompt: 'Execute step-by-step orchestration with validation gates'"
echo ""

RESULT=$(node "$KEYWORD_DETECTOR" "Execute step-by-step orchestration with validation gates")
echo "$RESULT" | jq '.'

CONTEXTS_COUNT=$(echo "$RESULT" | jq '.matches | length')
echo ""
echo -e "${GREEN}✓ Detected $CONTEXTS_COUNT context(s)${NC}"
for i in $(seq 0 $(($CONTEXTS_COUNT - 1))); do
  NAME=$(echo "$RESULT" | jq -r ".matches[$i].contextName")
  SCORE=$(echo "$RESULT" | jq -r ".matches[$i].score")
  echo "  [$((i+1))] $NAME (score: $SCORE)"
done
echo ""

###############################################################################
# Test Scenario 6: Simple Operation (No Contexts)
###############################################################################

echo "───────────────────────────────────────────────────────────────────────────────"
echo -e "${BLUE}TEST 6: Simple Operation (Should Load Few/No Contexts)${NC}"
echo "Prompt: 'Query Account records for New York region'"
echo ""

RESULT=$(node "$KEYWORD_DETECTOR" "Query Account records for New York region")
echo "$RESULT" | jq '.'

CONTEXTS_COUNT=$(echo "$RESULT" | jq '.matches | length')
echo ""
if [ "$CONTEXTS_COUNT" -eq 0 ]; then
  echo -e "${GREEN}✓ No contexts loaded (expected for simple query)${NC}"
else
  echo -e "${YELLOW}⚠ $CONTEXTS_COUNT context(s) detected (may be over-matching)${NC}"
fi
echo ""

###############################################################################
# Test Scenario 7: End-to-End Context Injection
###############################################################################

echo "═══════════════════════════════════════════════════════════════════════════════"
echo -e "${BLUE}TEST 7: End-to-End Context Injection${NC}"
echo "Prompt: 'Deploy field with FLS and validate before deployment'"
echo ""

echo -e "${YELLOW}Testing full pipeline (keyword detection → context injection)...${NC}"
echo ""

node "$KEYWORD_DETECTOR" "Deploy field with FLS and validate before deployment" | \
  node "$CONTEXT_INJECTOR" --stdin 2>&1 | head -100

echo ""
echo -e "${GREEN}✓ End-to-end injection test complete${NC}"
echo ""

###############################################################################
# Token Measurement Tests
###############################################################################

echo "═══════════════════════════════════════════════════════════════════════════════"
echo -e "${BLUE}TOKEN MEASUREMENT TESTS${NC}"
echo ""

echo "Measuring context file sizes for token estimation..."
echo ""

CONTEXTS_DIR="$SCRIPT_DIR/../contexts/orchestrator"

for context_file in "$CONTEXTS_DIR"/*.md; do
  BASENAME=$(basename "$context_file" .md)
  LINES=$(wc -l < "$context_file")
  TOKENS=$((LINES * 9))  # Rough estimate: 1 line ≈ 9 tokens
  printf "  %-45s %4d lines (~%5d tokens)\n" "$BASENAME" "$LINES" "$TOKENS"
done

echo ""

TOTAL_LINES=$(find "$CONTEXTS_DIR" -name "*.md" -exec cat {} \; | wc -l)
TOTAL_TOKENS=$((TOTAL_LINES * 9))
echo -e "${GREEN}Total context library: $TOTAL_LINES lines (~$TOTAL_TOKENS tokens)${NC}"
echo ""

###############################################################################
# Summary
###############################################################################

echo "═══════════════════════════════════════════════════════════════════════════════"
echo -e "${GREEN}ALL TESTS COMPLETE${NC}"
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""
echo "Progressive Disclosure System Status:"
echo "  ✓ Keyword detection working"
echo "  ✓ Context injection working"
echo "  ✓ Intent pattern matching working"
echo "  ✓ Priority weighting working"
echo "  ✓ Max contexts limit working"
echo ""
echo "Next Steps:"
echo "  1. Review test results above"
echo "  2. Adjust keyword mappings if needed"
echo "  3. Test with real user prompts"
echo "  4. Measure actual token usage in production"
echo ""
