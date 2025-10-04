#!/bin/bash

##
# Post-Org Authentication Hook
#
# Automatically runs org quirks detection after new org authentication
# to proactively identify label customizations and generate documentation.
#
# INPUTS (environment variables):
#   ORG_ALIAS - The Salesforce org alias that was authenticated
#
# OUTPUTS:
#   ORG_QUIRKS.json, OBJECT_MAPPINGS.txt, QUICK_REFERENCE.md
#
# USAGE:
#   Called automatically after 'sf org login' commands
##

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if ORG_ALIAS is set
if [[ -z "$ORG_ALIAS" ]]; then
  echo -e "${YELLOW}⚠️  WARNING: ORG_ALIAS not set, skipping quirks detection${NC}" >&2
  exit 0
fi

# Find the org-quirks-detector script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DETECTOR_SCRIPT="$PROJECT_ROOT/SFDC/scripts/lib/org-quirks-detector.js"

if [[ ! -f "$DETECTOR_SCRIPT" ]]; then
  echo -e "${YELLOW}⚠️  WARNING: org-quirks-detector.js not found, skipping detection${NC}" >&2
  exit 0
fi

# Check if quirks already exist for this org
QUIRKS_FILE="$PROJECT_ROOT/SFDC/instances/$ORG_ALIAS/ORG_QUIRKS.json"

if [[ -f "$QUIRKS_FILE" ]]; then
  # Quirks already detected
  FILE_AGE=$(($(date +%s) - $(stat -c %Y "$QUIRKS_FILE" 2>/dev/null || stat -f %m "$QUIRKS_FILE" 2>/dev/null)))
  DAYS_OLD=$((FILE_AGE / 86400))

  if [[ $DAYS_OLD -lt 30 ]]; then
    echo -e "${GREEN}✅ Org quirks already detected (${DAYS_OLD} days old)${NC}" >&2
    exit 0
  else
    echo -e "${BLUE}🔄 Org quirks file is ${DAYS_OLD} days old, updating...${NC}" >&2
  fi
fi

# Run quirks detection
echo -e "${BLUE}🔍 Detecting org quirks for ${ORG_ALIAS}...${NC}" >&2

node "$DETECTOR_SCRIPT" generate-docs "$ORG_ALIAS" 2>&1 | while IFS= read -r line; do
  echo "  $line" >&2
done

if [[ $? -eq 0 ]]; then
  echo -e "${GREEN}✅ Org quirks detection complete${NC}" >&2
  echo -e "${BLUE}📄 Documentation generated:${NC}" >&2
  echo "     - ORG_QUIRKS.json" >&2
  echo "     - OBJECT_MAPPINGS.txt" >&2
  echo "     - QUICK_REFERENCE.md" >&2
else
  echo -e "${YELLOW}⚠️  Quirks detection failed or partially completed${NC}" >&2
fi

exit 0
