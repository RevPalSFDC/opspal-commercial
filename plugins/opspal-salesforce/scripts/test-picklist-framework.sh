#!/bin/bash

###############################################################################
# Quick Verification Test: Picklist Modification Framework
###############################################################################
#
# This script performs a quick smoke test of the new picklist framework
# using a sandbox environment.
#
# Usage:
#   ./scripts/test-picklist-framework.sh [org-alias]
#
# Example:
#   ./scripts/test-picklist-framework.sh sample-org-uat
#
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get org alias
ORG_ALIAS=${1:-$SF_TARGET_ORG}

if [ -z "$ORG_ALIAS" ]; then
    echo -e "${RED}❌ Error: No org alias provided${NC}"
    echo "Usage: $0 [org-alias]"
    echo "Example: $0 sample-org-uat"
    exit 1
fi

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Picklist Framework Verification Test${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}Target Org:${NC} $ORG_ALIAS"
echo ""

# Verify org connection
echo -e "${BLUE}[1/5]${NC} Verifying Salesforce connection..."
if sf org display --target-org "$ORG_ALIAS" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Connected to $ORG_ALIAS"
else
    echo -e "${RED}✗${NC} Failed to connect to $ORG_ALIAS"
    echo "Please authenticate first: sf org login web --alias $ORG_ALIAS"
    exit 1
fi

# Check if scripts exist
echo -e "${BLUE}[2/5]${NC} Checking script files..."
SCRIPTS=(
    "scripts/lib/unified-picklist-manager.js"
    "scripts/lib/picklist-recordtype-validator.js"
    "scripts/lib/recordtype-manager.js"
    "scripts/examples/modify-picklist-with-recordtypes.js"
)

for script in "${SCRIPTS[@]}"; do
    if [ -f "$script" ]; then
        echo -e "${GREEN}✓${NC} Found $script"
    else
        echo -e "${RED}✗${NC} Missing $script"
        exit 1
    fi
done

# Test Node.js module loading
echo -e "${BLUE}[3/5]${NC} Testing module imports..."
node -e "
try {
    const UnifiedPicklistManager = require('./scripts/lib/unified-picklist-manager');
    const PicklistRecordTypeValidator = require('./scripts/lib/picklist-recordtype-validator');
    const RecordTypeManager = require('./scripts/lib/recordtype-manager');
    console.log('${GREEN}✓${NC} All modules loaded successfully');
} catch (error) {
    console.error('${RED}✗${NC} Module loading failed:', error.message);
    process.exit(1);
}
"

# Test record type discovery
echo -e "${BLUE}[4/5]${NC} Testing record type discovery..."
DISCOVERY_TEST=$(node -e "
const UnifiedPicklistManager = require('./scripts/lib/unified-picklist-manager');
(async () => {
    try {
        const manager = new UnifiedPicklistManager({ org: '$ORG_ALIAS' });
        const recordTypes = await manager.discoverRecordTypes('Account', '$ORG_ALIAS');
        console.log('${GREEN}✓${NC} Discovered ' + recordTypes.length + ' active record types for Account');
        if (recordTypes.length === 0) {
            console.warn('${YELLOW}⚠${NC} Warning: No active record types found on Account');
        }
    } catch (error) {
        console.error('${RED}✗${NC} Discovery failed:', error.message);
        process.exit(1);
    }
})();
" 2>&1)

echo "$DISCOVERY_TEST"

# Test validator CLI
echo -e "${BLUE}[5/5]${NC} Testing validator CLI..."
if node scripts/lib/picklist-recordtype-validator.js 2>&1 | grep -q "Usage:"; then
    echo -e "${GREEN}✓${NC} Validator CLI is functional"
else
    echo -e "${RED}✗${NC} Validator CLI test failed"
    exit 1
fi

# Summary
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ All verification tests passed!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}Framework Status:${NC} ${GREEN}READY${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. Run example: ./scripts/examples/modify-picklist-with-recordtypes.js 6"
echo "  2. Read guide: docs/PICKLIST_MODIFICATION_GUIDE.md"
echo "  3. Test on sandbox before production"
echo ""
echo -e "${YELLOW}Documentation:${NC}"
echo "  • Complete Guide: docs/PICKLIST_MODIFICATION_GUIDE.md"
echo "  • Library Reference: scripts/lib/README.md"
echo "  • Agent Protocol: .claude/agents/sfdc-metadata-manager.md"
echo ""
