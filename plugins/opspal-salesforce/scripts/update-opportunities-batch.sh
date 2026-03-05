#!/bin/bash

# Script to update opportunities with Parent_Contract__c using individual commands
# Author: Claude Code
# Date: 2025-08-30

set -e

TARGET_ORG="example-company-sandbox"
DATA_FILE="${PROJECT_ROOT:-${PROJECT_ROOT:-/path/to/project}}"

echo "=== Updating Opportunities with Parent_Contract__c ==="
echo "Target Org: ${TARGET_ORG}"
echo "Data File: ${DATA_FILE}"
echo ""

# Skip header line and process each record
tail -n +2 "${DATA_FILE}" | while IFS=',' read -r opportunity_id contract_id; do
    echo "Updating Opportunity ${opportunity_id} -> Contract ${contract_id}"
    
    # Update the opportunity record
    sf data update record \
        --sobject Opportunity \
        --record-id "${opportunity_id}" \
        --values "Parent_Contract__c=${contract_id}" \
        --target-org "${TARGET_ORG}" >/dev/null
    
    if [ $? -eq 0 ]; then
        echo "  ✓ Success"
    else
        echo "  ✗ Failed"
    fi
done

echo ""
echo "=== Batch update completed ==="
