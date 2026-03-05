#!/bin/bash

set -e

echo "=== Checking Flow Status in sample-org-sandbox ==="

# Query to check if the Flow exists and its status
sf data query \
    --query "SELECT Id, MasterLabel, Status, VersionNumber FROM Flow WHERE Definition.DeveloperName LIKE '%Compounding_Opportunity_Amount_Calculator%'" \
    --use-tooling-api \
    --target-org sample-org-sandbox
