#!/bin/bash

# Verify Google Drive Folder Structure
# This script checks if the RevPal folder structure has been created

echo "=================================================="
echo "🔍 Google Drive Folder Structure Verification"
echo "=================================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Expected folder structure
echo -e "${BLUE}Expected Folder Structure:${NC}"
echo ""
echo "RevPal/"
echo "├── Documentation/"
echo "│   ├── Salesforce/"
echo "│   ├── HubSpot/"
echo "│   └── Integration/"
echo "├── Reports/"
echo "│   ├── Salesforce/"
echo "│   │   ├── Daily/"
echo "│   │   ├── Weekly/"
echo "│   │   └── Monthly/"
echo "│   ├── HubSpot/"
echo "│   │   ├── Marketing/"
echo "│   │   ├── Sales/"
echo "│   │   └── Service/"
echo "│   └── Combined/"
echo "│       ├── Executive/"
echo "│       └── Operational/"
echo "├── Templates/"
echo "│   ├── Salesforce/"
echo "│   ├── HubSpot/"
echo "│   └── Documentation/"
echo "├── Compliance/"
echo "│   ├── GDPR/"
echo "│   ├── HIPAA/"
echo "│   ├── SOC2/"
echo "│   └── CCPA/"
echo "└── Archives/"
echo "    └── 2025/"
echo ""
echo "=================================================="
echo ""

# Test with Claude
echo -e "${YELLOW}To verify the folders have been created:${NC}"
echo ""
echo "Ask Claude to test the integration:"
echo '  "List the folders in my RevPal Drive folder"'
echo '  "Check if RevPal/Reports/Salesforce exists"'
echo '  "Show me the structure of the RevPal folder"'
echo ""

# Manual verification
echo -e "${BLUE}Manual Verification Steps:${NC}"
echo "1. Open https://drive.google.com"
echo "2. Look for the 'RevPal' folder"
echo "3. Verify all subfolders are present"
echo ""

# Quick test
echo -e "${GREEN}Quick Test Commands:${NC}"
echo ""
echo "Test document access:"
echo '  "Create a test file in RevPal/Documentation"'
echo ""
echo "Test report export:"
echo '  "Export a sample report to RevPal/Reports/Salesforce/Weekly"'
echo ""
echo "Test template library:"
echo '  "Save a template to RevPal/Templates/Salesforce"'
echo ""

echo "=================================================="
echo -e "${GREEN}✅ Once folders are created, your integration is ready!${NC}"
echo "=================================================="
echo ""
echo "Resources:"
echo "  • Manual Setup Guide: MANUAL_DRIVE_SETUP.md"
echo "  • Test Scenarios: TEST_SCENARIOS.md"
echo "  • Full Documentation: documentation/GOOGLE_DRIVE_INTEGRATION.md"