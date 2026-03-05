#!/usr/bin/env bash
# Verify script - checks deployment results
# Always read-only

source scripts/lib/guard.sh

echo "
═══════════════════════════════════════════════════════════════
VERIFICATION: $ORG
═══════════════════════════════════════════════════════════════"

# Run tests (if any)
echo "
Running Apex tests..."
sf apex test run -o "$ORG" \
  --test-level RunLocalTests \
  --result-format human \
  --wait 30 || echo "No tests or tests failed"

# Check recent reports
echo "
Recent Reports (last 10):"
sf data query -o "$ORG" \
  -q "SELECT Id, Name, DeveloperName, FolderName, LastModifiedDate 
      FROM Report 
      ORDER BY LastModifiedDate DESC 
      LIMIT 10" \
  --json | jq -r '.result.records[] | "\(.LastModifiedDate | .[0:10]) \(.FolderName)/\(.DeveloperName) - \(.Name)"'

# Check recent dashboards
echo "
Recent Dashboards (last 10):"
sf data query -o "$ORG" \
  -q "SELECT Id, Title, DeveloperName, FolderName, LastModifiedDate 
      FROM Dashboard 
      ORDER BY LastModifiedDate DESC 
      LIMIT 10" \
  --json | jq -r '.result.records[] | "\(.LastModifiedDate | .[0:10]) \(.FolderName)/\(.DeveloperName) - \(.Title)"'

# Check org limits
echo "
Org Limits Check:"
sf limits api display -o "$ORG" --json | jq '.result[] | select(.remaining < .max * 0.2) | {name: .name, used: .remaining, max: .max, percentUsed: (100 - (.remaining / .max * 100))}'

# Check for errors in last hour
echo "
Recent Errors (if any):"
sf data query -o "$ORG" \
  -q "SELECT Message, StackTrace, CreatedDate 
      FROM DebugLog 
      WHERE CreatedDate = LAST_HOUR 
      LIMIT 5" \
  --json 2>/dev/null | jq -r '.result.records[] | "\(.CreatedDate): \(.Message)"' || echo "No debug logs available"

echo "
═══════════════════════════════════════════════════════════════
"