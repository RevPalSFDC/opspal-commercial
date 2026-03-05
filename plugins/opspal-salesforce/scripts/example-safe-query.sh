#!/bin/bash
# Example script showing how to use the instance-agnostic error prevention utilities

# Source the utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/sf-wrapper.sh"
source "${SCRIPT_DIR}/lib/soql-validator.sh"

# Example 1: Simple query with wrapper (no update warnings)
echo "=== Example 1: Simple Query with No Warnings ==="
sf_exec data query --query "SELECT Id, Name FROM Account LIMIT 5" --target-org "${1:-default}"
echo ""

# Example 2: Complex query with validation
echo "=== Example 2: Complex Query with Reserved Word Validation ==="
COMPLEX_QUERY="SELECT
    Product__r.Name,
    COUNT(Id) Count,
    AVG(ARR__c) Average,
    SUM(ARR__c) Sum,
    MAX(ARR__c) Max,
    MIN(ARR__c) Min
FROM Subscription__c
GROUP BY Product__r.Name
ORDER BY COUNT(Id) DESC"

echo "Original Query:"
echo "$COMPLEX_QUERY"
echo ""

# Validate and get fixed query
echo "Validating query..."
VALIDATION_OUTPUT=$(validate_soql_aliases "$COMPLEX_QUERY")
FIXED_QUERY=$(echo "$VALIDATION_OUTPUT" | sed -n '/=== VALIDATED QUERY ===/,$ p' | tail -n +2)

echo "Fixed Query:"
echo "$FIXED_QUERY"
echo ""

# Execute the validated query
echo "Executing validated query..."
sf_exec data query --query "$FIXED_QUERY" --target-org "${1:-default}"

# Example 3: Using the execute_validated_soql function
echo ""
echo "=== Example 3: Direct Validated Execution ==="
execute_validated_soql "SELECT Status, COUNT(Id) Count FROM Case GROUP BY Status" "${1:-default}"