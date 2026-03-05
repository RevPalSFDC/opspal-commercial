#!/bin/bash

# Query Flow status to check if it exists and is active
echo "Querying Flow status in sample-org-sandbox..."

sf data query --query "SELECT Id, MasterLabel, Status, VersionNumber FROM Flow WHERE Definition.DeveloperName LIKE '%Compounding_Opportunity_Amount_Calculator%'" --use-tooling-api --target-org sample-org-sandbox --json

echo "Query completed."
