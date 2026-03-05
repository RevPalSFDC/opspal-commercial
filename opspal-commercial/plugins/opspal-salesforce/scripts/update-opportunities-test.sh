#!/bin/bash

# Test script to update a few opportunities with Parent_Contract__c
# Author: Claude Code
# Date: 2025-08-30

set -e

TARGET_ORG="example-company-sandbox"
DATA_FILE="${PROJECT_ROOT:-${PROJECT_ROOT:-/path/to/project}}"

echo "=== Testing Opportunity Updates with Parent_Contract__c ==="
echo "Target Org: ${TARGET_ORG}"
echo "Data File: ${DATA_FILE}"
echo ""

COUNTER=0
MAX_UPDATES=10

# Skip header line and process each record
tail -n +2 "${DATA_FILE}" | while IFS=',' read -r opportunity_id contract_id; do
    COUNTER=$((COUNTER + 1))
    
    if [ $COUNTER -gt $MAX_UPDATES ]; then
        break
    fi
    
    echo "[$COUNTER] Updating Opportunity ${opportunity_id} -> Contract ${contract_id}"
    
    # Update the opportunity record
    sf data update record \
        --sobject Opportunity \
        --record-id "${opportunity_id}" \
        --values "Parent_Contract__c=${contract_id}" \
        --target-org "${TARGET_ORG}" >/dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        echo "    ✓ Success"
    else
        echo "    ✗ Failed"
    fi
    
    # Small delay to avoid hitting rate limits
    sleep 0.1
done

echo ""
echo "=== Test update completed ==="
