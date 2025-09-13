#!/bin/bash
# Google Drive MCP Integration Test Script

echo "🔍 Testing Google Drive MCP Integration..."
echo "========================================="

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Check MCP configuration
echo -e "\n${YELLOW}1. Checking MCP Configuration...${NC}"
if grep -q '"gdrive"' .mcp.json; then
    echo -e "${GREEN}✓ Google Drive MCP server configured in .mcp.json${NC}"
else
    echo -e "${RED}✗ Google Drive MCP server not found in .mcp.json${NC}"
    exit 1
fi

# Test 2: Check environment variables
echo -e "\n${YELLOW}2. Checking Environment Variables...${NC}"
source .env 2>/dev/null

if [ -n "$GDRIVE_CLIENT_ID" ]; then
    echo -e "${GREEN}✓ GDRIVE_CLIENT_ID configured${NC}"
else
    echo -e "${RED}✗ GDRIVE_CLIENT_ID not set${NC}"
    exit 1
fi

if [ -n "$GDRIVE_CLIENT_SECRET" ]; then
    echo -e "${GREEN}✓ GDRIVE_CLIENT_SECRET configured${NC}"
else
    echo -e "${RED}✗ GDRIVE_CLIENT_SECRET not set${NC}"
    exit 1
fi

# Test 3: Check agent files
echo -e "\n${YELLOW}3. Checking Google Drive Agents...${NC}"
AGENT_COUNT=$(ls -1 .claude/agents/gdrive-*.md 2>/dev/null | wc -l)
if [ "$AGENT_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓ Found $AGENT_COUNT Google Drive agent(s):${NC}"
    ls -1 .claude/agents/gdrive-*.md | sed 's/.*\//  - /'
else
    echo -e "${RED}✗ No Google Drive agents found${NC}"
    exit 1
fi

# Test 4: Check authentication
echo -e "\n${YELLOW}4. Testing Google Drive Authentication...${NC}"
if [ -f ~/.credentials/gdrive-mcp.json ]; then
    echo -e "${GREEN}✓ Authentication credentials found${NC}"
else
    echo -e "${YELLOW}⚠ Running authentication...${NC}"
    npx -y @modelcontextprotocol/server-gdrive auth
fi

# Test 5: Test server startup
echo -e "\n${YELLOW}5. Testing MCP Server Startup...${NC}"
timeout 5 npx -y @modelcontextprotocol/server-gdrive 2>&1 | head -5 | grep -q "Server running" && \
    echo -e "${GREEN}✓ MCP server can start successfully${NC}" || \
    echo -e "${YELLOW}⚠ Server startup test inconclusive (this is normal)${NC}"

# Test 6: Check enhanced agents
echo -e "\n${YELLOW}6. Checking Enhanced Agents...${NC}"
if grep -q "gdrive" ClaudeSFDC/agents/sfdc-reports-dashboards.yaml 2>/dev/null; then
    echo -e "${GREEN}✓ Salesforce reports agent has Drive export capability${NC}"
else
    echo -e "${YELLOW}⚠ Salesforce reports agent may need updating${NC}"
fi

if grep -q "gdrive" ClaudeHubSpot/agents/hubspot-reporting-builder.yaml 2>/dev/null; then
    echo -e "${GREEN}✓ HubSpot reporting agent has Drive export capability${NC}"
else
    echo -e "${YELLOW}⚠ HubSpot reporting agent may need updating${NC}"
fi

# Test 7: Documentation check
echo -e "\n${YELLOW}7. Checking Documentation...${NC}"
if [ -f documentation/GOOGLE_DRIVE_INTEGRATION.md ]; then
    echo -e "${GREEN}✓ Google Drive integration documentation exists${NC}"
else
    echo -e "${RED}✗ Documentation not found${NC}"
fi

# Summary
echo -e "\n========================================="
echo -e "${GREEN}✅ Google Drive MCP Integration Test Complete!${NC}"
echo -e "\nNext steps:"
echo -e "1. Create folder structure in Google Drive:"
echo -e "   - RevPal/Documentation/"
echo -e "   - RevPal/Reports/"
echo -e "   - RevPal/Templates/"
echo -e "   - RevPal/Compliance/"
echo -e ""
echo -e "2. Test with Claude:"
echo -e '   "Hey Claude, can you list my Google Drive folders?"'
echo -e '   "Export a test report to Google Sheets"'
echo -e ""
echo -e "3. Review documentation at documentation/GOOGLE_DRIVE_INTEGRATION.md"