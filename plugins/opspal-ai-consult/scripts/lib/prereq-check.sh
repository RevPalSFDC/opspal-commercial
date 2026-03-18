#!/bin/bash
# AI Consult Plugin - Prerequisite Check
# Validates that Gemini CLI and required dependencies are installed

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "AI Consult Plugin - Prerequisite Check"
echo "=========================================="
echo ""

ERRORS=0

# Check Node.js
echo -n "Checking Node.js... "
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}OK${NC} ($NODE_VERSION)"
else
    echo -e "${RED}MISSING${NC}"
    echo "  Install: https://nodejs.org/"
    ERRORS=$((ERRORS + 1))
fi

# Check Gemini CLI
echo -n "Checking Gemini CLI... "
if command -v gemini &> /dev/null; then
    GEMINI_VERSION=$(gemini --version 2>/dev/null || echo "version unknown")
    echo -e "${GREEN}OK${NC} ($GEMINI_VERSION)"
else
    echo -e "${RED}MISSING${NC}"
    echo "  Install: npm install -g @google/gemini-cli"
    ERRORS=$((ERRORS + 1))
fi

# Check GEMINI_API_KEY environment variable
echo -n "Checking GEMINI_API_KEY... "
if [ -n "$GEMINI_API_KEY" ]; then
    # Mask the key for display
    KEY_LENGTH=${#GEMINI_API_KEY}
    MASKED_KEY="${GEMINI_API_KEY:0:4}...${GEMINI_API_KEY: -4}"
    echo -e "${GREEN}SET${NC} ($MASKED_KEY, $KEY_LENGTH chars)"
else
    echo -e "${YELLOW}NOT SET${NC}"
    echo "  Set: export GEMINI_API_KEY=\"your-api-key\""
    echo "  Get key: https://aistudio.google.com/apikey"
    ERRORS=$((ERRORS + 1))
fi

# Check jq (optional but recommended)
echo -n "Checking jq (optional)... "
if command -v jq &> /dev/null; then
    JQ_VERSION=$(jq --version 2>/dev/null || echo "version unknown")
    echo -e "${GREEN}OK${NC} ($JQ_VERSION)"
else
    echo -e "${YELLOW}MISSING${NC} (optional - install for better JSON handling)"
fi

echo ""
echo "=========================================="

if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}All prerequisites met!${NC}"
    exit 0
else
    echo -e "${RED}$ERRORS prerequisite(s) missing${NC}"
    echo ""
    echo "Quick fix:"
    echo "  npm install -g @google/gemini-cli"
    echo "  export GEMINI_API_KEY=\"your-api-key-from-ai-studio\""
    exit 1
fi
