#!/bin/bash

# Post-Execution Validation Hook
# Purpose: Validates sub-agent outputs for simulated data patterns
# Usage: Called automatically after sub-agent execution

OUTPUT_FILE="$1"
AGENT_NAME="$2"
VALIDATION_LOG="/tmp/validation_$(date +%s).log"

# Color codes for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo "🔍 Post-Execution Validation Running..." | tee -a "$VALIDATION_LOG"
echo "Agent: $AGENT_NAME" | tee -a "$VALIDATION_LOG"
echo "Output File: $OUTPUT_FILE" | tee -a "$VALIDATION_LOG"
echo "Timestamp: $(date)" | tee -a "$VALIDATION_LOG"
echo "----------------------------------------" | tee -a "$VALIDATION_LOG"

# Initialize counters
WARNINGS=0
ERRORS=0
SUSPICIOUS_PATTERNS=0

# Function to check for pattern and log results
check_pattern() {
    local pattern="$1"
    local description="$2"
    local severity="$3"  # WARNING or ERROR
    
    if grep -q "$pattern" "$OUTPUT_FILE" 2>/dev/null; then
        SUSPICIOUS_PATTERNS=$((SUSPICIOUS_PATTERNS + 1))
        
        if [ "$severity" = "ERROR" ]; then
            ERRORS=$((ERRORS + 1))
            echo -e "${RED}❌ ERROR: $description${NC}" | tee -a "$VALIDATION_LOG"
            echo "   Pattern: $pattern" | tee -a "$VALIDATION_LOG"
            grep -n "$pattern" "$OUTPUT_FILE" | head -3 | tee -a "$VALIDATION_LOG"
        else
            WARNINGS=$((WARNINGS + 1))
            echo -e "${YELLOW}⚠️ WARNING: $description${NC}" | tee -a "$VALIDATION_LOG"
            echo "   Pattern: $pattern" | tee -a "$VALIDATION_LOG"
        fi
        return 0
    fi
    return 1
}

# Check for fake data patterns
echo "Checking for simulated data patterns..." | tee -a "$VALIDATION_LOG"

# Critical patterns (likely fake data)
check_pattern "Lead 45" "Specific fake Lead ID detected from known sample" "ERROR"
check_pattern "Opportunity 23" "Specific fake Opportunity ID detected from known sample" "ERROR"
check_pattern "Lead 89" "Specific fake Lead ID detected from known sample" "ERROR"
check_pattern "00Q000000000000045" "Fake Salesforce Lead ID format" "ERROR"
check_pattern "006000000000000023" "Fake Salesforce Opportunity ID format" "ERROR"

# Generic naming patterns
check_pattern "Lead [0-9]\+" "Generic lead naming pattern (Lead 1, Lead 2, etc.)" "ERROR"
check_pattern "Opportunity [0-9]\+" "Generic opportunity naming pattern" "ERROR"
check_pattern "Account [0-9]\+" "Generic account naming pattern" "ERROR"
check_pattern "Contact [0-9]\+" "Generic contact naming pattern" "ERROR"

# Round percentages (suspicious)
check_pattern "\b15\.0*%" "Suspiciously round percentage (15%)" "WARNING"
check_pattern "\b20\.0*%" "Suspiciously round percentage (20%)" "WARNING"
check_pattern "\b25\.0*%" "Suspiciously round percentage (25%)" "WARNING"
check_pattern "\b30\.0*%" "Suspiciously round percentage (30%)" "WARNING"
check_pattern "\b35\.0*%" "Suspiciously round percentage (35%)" "WARNING"
check_pattern "\b40\.0*%" "Suspiciously round percentage (40%)" "WARNING"
check_pattern "\b45\.0*%" "Suspiciously round percentage (45%)" "WARNING"
check_pattern "\b50\.0*%" "Suspiciously round percentage (50%)" "WARNING"

# Example/Sample indicators
check_pattern "Example [0-9]:" "Example data indicator" "ERROR"
check_pattern "Sample data" "Sample data mentioned" "WARNING"
check_pattern "Demo " "Demo data indicator" "WARNING"
check_pattern "Test data" "Test data mentioned" "WARNING"
check_pattern "SIMULATED" "Simulated data indicator" "WARNING"
check_pattern "synthetic" "Synthetic data mentioned" "WARNING"

# Check for absence of real query indicators
echo "Checking for query execution evidence..." | tee -a "$VALIDATION_LOG"

QUERY_EVIDENCE=0
if grep -q "SELECT.*FROM" "$OUTPUT_FILE" 2>/dev/null; then
    QUERY_EVIDENCE=$((QUERY_EVIDENCE + 1))
    echo -e "${GREEN}✓ SOQL query found${NC}" | tee -a "$VALIDATION_LOG"
fi

if grep -q "mcp_salesforce" "$OUTPUT_FILE" 2>/dev/null; then
    QUERY_EVIDENCE=$((QUERY_EVIDENCE + 1))
    echo -e "${GREEN}✓ MCP Salesforce tool usage found${NC}" | tee -a "$VALIDATION_LOG"
fi

if grep -q "Query.*executed" "$OUTPUT_FILE" 2>/dev/null; then
    QUERY_EVIDENCE=$((QUERY_EVIDENCE + 1))
    echo -e "${GREEN}✓ Query execution mentioned${NC}" | tee -a "$VALIDATION_LOG"
fi

if grep -q "Records.*retrieved" "$OUTPUT_FILE" 2>/dev/null; then
    QUERY_EVIDENCE=$((QUERY_EVIDENCE + 1))
    echo -e "${GREEN}✓ Record retrieval mentioned${NC}" | tee -a "$VALIDATION_LOG"
fi

# Check for data source declarations
echo "Checking for data source transparency..." | tee -a "$VALIDATION_LOG"

if grep -q "Data Source.*VERIFIED" "$OUTPUT_FILE" 2>/dev/null; then
    echo -e "${GREEN}✓ Data source verification found${NC}" | tee -a "$VALIDATION_LOG"
elif grep -q "Data Source.*SIMULATED" "$OUTPUT_FILE" 2>/dev/null; then
    echo -e "${YELLOW}⚠️ WARNING: Simulated data source declared${NC}" | tee -a "$VALIDATION_LOG"
    WARNINGS=$((WARNINGS + 1))
else
    echo -e "${RED}❌ ERROR: No data source declaration found${NC}" | tee -a "$VALIDATION_LOG"
    ERRORS=$((ERRORS + 1))
fi

# Summary
echo "----------------------------------------" | tee -a "$VALIDATION_LOG"
echo "VALIDATION SUMMARY:" | tee -a "$VALIDATION_LOG"
echo "  Errors: $ERRORS" | tee -a "$VALIDATION_LOG"
echo "  Warnings: $WARNINGS" | tee -a "$VALIDATION_LOG"
echo "  Suspicious Patterns: $SUSPICIOUS_PATTERNS" | tee -a "$VALIDATION_LOG"
echo "  Query Evidence: $QUERY_EVIDENCE indicators found" | tee -a "$VALIDATION_LOG"

# Determine exit status
if [ $ERRORS -gt 0 ]; then
    echo -e "${RED}❌ VALIDATION FAILED: Possible simulated data detected!${NC}" | tee -a "$VALIDATION_LOG"
    echo "Patterns found that match synthetic data generation" | tee -a "$VALIDATION_LOG"
    echo "Review the output and ensure real queries are being executed" | tee -a "$VALIDATION_LOG"
    
    # Send alert if webhook configured
    if [ -n "$SLACK_WEBHOOK_URL" ]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"🚨 Data Integrity Alert: Agent $AGENT_NAME may have generated simulated data. Errors: $ERRORS, Warnings: $WARNINGS\"}" \
            "$SLACK_WEBHOOK_URL" 2>/dev/null
    fi
    
    exit 1
elif [ $WARNINGS -gt 3 ]; then
    echo -e "${YELLOW}⚠️ VALIDATION WARNING: Multiple suspicious patterns detected${NC}" | tee -a "$VALIDATION_LOG"
    echo "Review the output for potential issues" | tee -a "$VALIDATION_LOG"
    exit 0
elif [ $QUERY_EVIDENCE -eq 0 ]; then
    echo -e "${YELLOW}⚠️ VALIDATION WARNING: No query execution evidence found${NC}" | tee -a "$VALIDATION_LOG"
    echo "Verify that real queries were executed" | tee -a "$VALIDATION_LOG"
    exit 0
else
    echo -e "${GREEN}✅ VALIDATION PASSED${NC}" | tee -a "$VALIDATION_LOG"
    exit 0
fi