#!/bin/bash
#
# Salesloft Token Setup Helper
# This script helps you securely set up your Salesloft API token
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "=========================================="
echo "Salesloft API Token Setup Assistant"
echo "=========================================="
echo ""

# Check if token is already set
if [ ! -z "$SALESLOFT_TOKEN" ]; then
    echo -e "${GREEN}✅ SALESLOFT_TOKEN is already configured${NC}"
    echo ""
    echo "Current token (first 10 chars): ${SALESLOFT_TOKEN:0:10}..."
    echo ""
    read -p "Do you want to update it? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Keeping existing token."
        exit 0
    fi
fi

echo -e "${BLUE}Step 1: Get Your Salesloft API Token${NC}"
echo "----------------------------------------"
echo "1. Open your browser and go to: https://app.salesloft.com"
echo "2. Log in with your credentials"
echo "3. Navigate to: Settings → API → API Keys"
echo "4. Click 'Create API Key' or copy an existing key"
echo ""
echo -e "${YELLOW}Press Enter when you have your token ready...${NC}"
read

echo ""
echo -e "${BLUE}Step 2: Enter Your Token${NC}"
echo "----------------------------------------"
echo "Paste your Salesloft API token below:"
echo "(Note: The token will be hidden for security)"
echo ""
read -s -p "Token: " SALESLOFT_TOKEN_INPUT
echo ""
echo ""

# Validate token format (basic check)
if [ -z "$SALESLOFT_TOKEN_INPUT" ]; then
    echo -e "${RED}Error: Token cannot be empty${NC}"
    exit 1
fi

if [ ${#SALESLOFT_TOKEN_INPUT} -lt 20 ]; then
    echo -e "${RED}Error: Token seems too short. Salesloft tokens are typically longer.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Token format looks valid${NC}"
echo ""

echo -e "${BLUE}Step 3: Save Token Configuration${NC}"
echo "----------------------------------------"
echo "Choose how to save the token:"
echo ""
echo "1. Environment variable (current session only)"
echo "2. Add to ~/.bashrc (persistent for your user)"
echo "3. Add to project .env file (persistent for project)"
echo "4. All of the above"
echo ""
read -p "Select option (1-4): " SAVE_OPTION

case $SAVE_OPTION in
    1)
        export SALESLOFT_TOKEN="$SALESLOFT_TOKEN_INPUT"
        echo -e "${GREEN}✅ Token set for current session${NC}"
        echo ""
        echo "Run this in your terminal:"
        echo -e "${BLUE}export SALESLOFT_TOKEN='$SALESLOFT_TOKEN_INPUT'${NC}"
        ;;
    2)
        echo "" >> ~/.bashrc
        echo "# Salesloft API Token" >> ~/.bashrc
        echo "export SALESLOFT_TOKEN='$SALESLOFT_TOKEN_INPUT'" >> ~/.bashrc
        export SALESLOFT_TOKEN="$SALESLOFT_TOKEN_INPUT"
        echo -e "${GREEN}✅ Token added to ~/.bashrc${NC}"
        echo "Run: source ~/.bashrc"
        ;;
    3)
        # Check if .env exists
        if [ -f .env ]; then
            # Check if SALESLOFT_TOKEN already exists in .env
            if grep -q "^SALESLOFT_TOKEN=" .env; then
                # Update existing token
                sed -i.bak "s|^SALESLOFT_TOKEN=.*|SALESLOFT_TOKEN=$SALESLOFT_TOKEN_INPUT|" .env
                echo -e "${GREEN}✅ Updated SALESLOFT_TOKEN in .env${NC}"
            else
                # Add new token
                echo "" >> .env
                echo "# Salesloft API Token" >> .env
                echo "SALESLOFT_TOKEN=$SALESLOFT_TOKEN_INPUT" >> .env
                echo -e "${GREEN}✅ Added SALESLOFT_TOKEN to .env${NC}"
            fi
        else
            # Create new .env file
            echo "# Salesloft API Token" > .env
            echo "SALESLOFT_TOKEN=$SALESLOFT_TOKEN_INPUT" >> .env
            echo -e "${GREEN}✅ Created .env with SALESLOFT_TOKEN${NC}"
        fi
        export SALESLOFT_TOKEN="$SALESLOFT_TOKEN_INPUT"
        ;;
    4)
        # Set for current session
        export SALESLOFT_TOKEN="$SALESLOFT_TOKEN_INPUT"

        # Add to bashrc
        echo "" >> ~/.bashrc
        echo "# Salesloft API Token" >> ~/.bashrc
        echo "export SALESLOFT_TOKEN='$SALESLOFT_TOKEN_INPUT'" >> ~/.bashrc

        # Add to .env
        if [ -f .env ]; then
            if grep -q "^SALESLOFT_TOKEN=" .env; then
                sed -i.bak "s|^SALESLOFT_TOKEN=.*|SALESLOFT_TOKEN=$SALESLOFT_TOKEN_INPUT|" .env
            else
                echo "" >> .env
                echo "# Salesloft API Token" >> .env
                echo "SALESLOFT_TOKEN=$SALESLOFT_TOKEN_INPUT" >> .env
            fi
        else
            echo "# Salesloft API Token" > .env
            echo "SALESLOFT_TOKEN=$SALESLOFT_TOKEN_INPUT" >> .env
        fi

        echo -e "${GREEN}✅ Token saved to all locations${NC}"
        ;;
    *)
        echo -e "${RED}Invalid option${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${BLUE}Step 4: Verify Token${NC}"
echo "----------------------------------------"
echo "Testing token with Salesloft API..."
echo ""

# Test the token
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $SALESLOFT_TOKEN_INPUT" \
    "https://api.salesloft.com/v2/me")

if [ "$RESPONSE" = "200" ]; then
    echo -e "${GREEN}✅ Token is valid and working!${NC}"
    echo ""

    # Get user info
    USER_INFO=$(curl -s -H "Authorization: Bearer $SALESLOFT_TOKEN_INPUT" \
        "https://api.salesloft.com/v2/me")

    USER_NAME=$(echo "$USER_INFO" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('data', {}).get('name', 'Unknown'))")
    USER_EMAIL=$(echo "$USER_INFO" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('data', {}).get('email', 'Unknown'))")

    echo "Connected as: $USER_NAME ($USER_EMAIL)"
else
    echo -e "${RED}❌ Token validation failed (HTTP $RESPONSE)${NC}"
    echo "Please check your token and try again."
    exit 1
fi

echo ""
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo -e "${GREEN}Your Salesloft API token is now configured.${NC}"
echo ""
echo "Next steps:"
echo "1. Run the dry-run test:"
echo -e "${BLUE}   ./scripts/execute-salesloft-fixes.sh --dry-run${NC}"
echo ""
echo "2. If everything looks good, apply the fixes:"
echo -e "${BLUE}   ./scripts/execute-salesloft-fixes.sh${NC}"
echo ""
echo "3. Monitor the results:"
echo -e "${BLUE}   python3 scripts/salesloft-sync-health-monitor.py --mode once${NC}"
echo ""