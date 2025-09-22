#!/bin/bash

# Environment Switcher for Cross-Platform Operations
# Switch between different SF-HS environment pairs

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Function to display usage
usage() {
    echo -e "${BLUE}Cross-Platform Environment Switcher${NC}"
    echo ""
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  list                    List available environment configurations"
    echo "  switch <env>           Switch to a specific environment"
    echo "  current                Show current environment"
    echo "  create                 Create new environment configuration"
    echo "  test                   Test current environment connections"
    echo ""
    echo "Available Environments:"
    echo "  rentable-production    Rentable Production (SF) <-> Rentable Prod (HS)"
    echo "  rentable               Rentable Sandbox (SF) <-> Rentable Prod (HS)"
    echo "  production             Production (SF) <-> Production (HS)"
    echo "  development            Dev Sandbox (SF) <-> Sandbox (HS)"
    echo ""
    echo "Examples:"
    echo "  $0 switch rentable-production     Switch to Rentable Production"
    echo "  $0 current                        Show current environment"
    echo "  $0 test                           Test connections"
}

# Function to list environments
list_environments() {
    echo -e "${BLUE}Available Environment Configurations:${NC}"
    echo ""

    for file in config/*.json; do
        if [ -f "$file" ]; then
            basename="${file##*/}"
            name="${basename%.*}"
            if [[ "$name" != "mcp-config" && "$name" != "cli-config" && "$name" != "active-connection" ]]; then
                echo -e "  ${GREEN}•${NC} $name"
                if [ -f "$file" ]; then
                    description=$(grep -m1 '"description"' "$file" | cut -d'"' -f4)
                    echo "    $description"
                fi
            fi
        fi
    done

    echo ""
}

# Function to switch environment
switch_environment() {
    ENV_NAME=$1

    if [ -z "$ENV_NAME" ]; then
        echo -e "${RED}Error: Environment name required${NC}"
        usage
        exit 1
    fi

    # Check if environment config exists
    CONFIG_FILE="config/${ENV_NAME}-config.json"
    ENV_FILE=".env.${ENV_NAME}"

    if [ ! -f "$CONFIG_FILE" ]; then
        echo -e "${RED}Error: Configuration not found: $CONFIG_FILE${NC}"
        echo "Available environments:"
        list_environments
        exit 1
    fi

    if [ ! -f "$ENV_FILE" ]; then
        echo -e "${YELLOW}Warning: Environment file not found: $ENV_FILE${NC}"
        echo "Creating from template..."

        # Create basic env file
        cat > "$ENV_FILE" << EOF
# ${ENV_NAME} Environment Configuration
# Auto-generated on $(date)

# Load specific configuration
XPLAT_CONFIG_FILE=./${CONFIG_FILE}
XPLAT_ENVIRONMENT=${ENV_NAME}

# Copy additional settings from main .env if needed
EOF
        echo -e "${GREEN}Created $ENV_FILE${NC}"
    fi

    # Update symlinks
    echo -e "${YELLOW}Switching to ${ENV_NAME} environment...${NC}"

    # Create/update .env symlink
    rm -f .env
    ln -s "$ENV_FILE" .env

    # Create/update active config
    echo "{\"active\": \"$ENV_NAME\", \"timestamp\": \"$(date -Iseconds)\"}" > config/active-environment.json

    # For Rentable environments, set specific Salesforce org
    if [ "$ENV_NAME" == "rentable" ]; then
        echo -e "${BLUE}Setting Salesforce org to rentable-sandbox...${NC}"
        sf config set target-org=rentable-sandbox --global
    elif [ "$ENV_NAME" == "rentable-production" ]; then
        echo -e "${BLUE}Setting Salesforce org to rentable-production...${NC}"
        sf config set target-org=rentable-production --global
    fi

    echo -e "${GREEN}✓ Switched to ${ENV_NAME} environment${NC}"
    echo ""

    # Show environment details
    show_current_environment
}

# Function to show current environment
show_current_environment() {
    echo -e "${BLUE}Current Environment:${NC}"
    echo ""

    # Check for active connection file (new format)
    if [ -f "config/active-connection.json" ]; then
        # Parse active connection
        SF_ORG=$(jq -r '.salesforce.orgAlias // "Not set"' config/active-connection.json 2>/dev/null)
        SF_ENV=$(jq -r '.salesforce.environment // "Not set"' config/active-connection.json 2>/dev/null)
        HS_PORTAL=$(jq -r '.hubspot.portalId // "Not set"' config/active-connection.json 2>/dev/null)
        HS_ENV=$(jq -r '.hubspot.environment // "Not set"' config/active-connection.json 2>/dev/null)
        HS_NAME=$(jq -r '.hubspot.portalName // "Not set"' config/active-connection.json 2>/dev/null)
        PROD_MODE=$(jq -r '.safety.productionMode // false' config/active-connection.json 2>/dev/null)

        if [ "$SF_ENV" == "PRODUCTION" ] && [ "$HS_ENV" == "PRODUCTION" ]; then
            echo -e "  Environment: ${RED}${BOLD}Rentable Production${NC}"
        else
            echo -e "  Environment: ${GREEN}Rentable${NC}"
        fi
    elif [ -f "config/active-environment.json" ]; then
        # Fallback to old format
        CURRENT=$(grep '"active"' config/active-environment.json | cut -d'"' -f4)
        echo -e "  Environment: ${GREEN}$CURRENT${NC}"
    else
        echo -e "  Environment: ${YELLOW}Not set${NC}"
    fi

    # Show Salesforce details from active connection if available
    if [ -f "config/active-connection.json" ]; then
        echo -e "\n  ${BLUE}Salesforce:${NC}"
        echo "    Org: ${GREEN}$SF_ORG${NC}"
        echo "    Environment: ${RED}$SF_ENV${NC}"

        # Try to get additional org details
        if [ -n "$SF_ORG" ] && [ "$SF_ORG" != "Not set" ]; then
            ORG_INFO=$(sf org display --target-org "$SF_ORG" --json 2>/dev/null || echo "{}")
            if [ "$ORG_INFO" != "{}" ]; then
                USERNAME=$(echo "$ORG_INFO" | jq -r '.result.username // ""')
                INSTANCE=$(echo "$ORG_INFO" | jq -r '.result.instanceUrl // ""')
                [ -n "$USERNAME" ] && echo "    User: $USERNAME"
                [ -n "$INSTANCE" ] && echo "    Instance: $INSTANCE"
            fi
        fi
    else
        # Fallback to checking current SF org
        echo -e "\n  ${BLUE}Salesforce:${NC}"
        CURRENT_ORG=$(sf config get target-org --json 2>/dev/null | grep '"value"' | cut -d'"' -f4)
        if [ -n "$CURRENT_ORG" ]; then
            echo "    Org: $CURRENT_ORG"

            # Get org details
            ORG_INFO=$(sf org display --target-org "$CURRENT_ORG" --json 2>/dev/null || echo "{}")
            if [ "$ORG_INFO" != "{}" ]; then
                USERNAME=$(echo "$ORG_INFO" | grep '"username"' | head -1 | cut -d'"' -f4)
                INSTANCE=$(echo "$ORG_INFO" | grep '"instanceUrl"' | cut -d'"' -f4)
                IS_SANDBOX=$(echo "$ORG_INFO" | grep '"isSandbox"' | grep -o 'true\|false')

                echo "    User: $USERNAME"
                echo "    Instance: $INSTANCE"
                echo "    Sandbox: $IS_SANDBOX"
            fi
        else
            echo "    Org: Not connected"
        fi
    fi

    # Show HubSpot config from active connection if available
    if [ -f "config/active-connection.json" ]; then
        echo -e "\n  ${BLUE}HubSpot:${NC}"
        echo "    Portal: ${GREEN}$HS_NAME${NC} (ID: $HS_PORTAL)"
        echo "    Environment: ${RED}$HS_ENV${NC}"

        if [ "$PROD_MODE" == "true" ]; then
            echo -e "\n  ${RED}${BOLD}⚠️  PRODUCTION MODE ACTIVE${NC}"
            echo -e "  ${YELLOW}All operations will affect LIVE data${NC}"
        else
            echo -e "\n  ${GREEN}✓ Safe mode (dry-run default)${NC}"
        fi
    else
        # Fallback to checking .env file
        echo -e "\n  ${BLUE}HubSpot:${NC}"
        if [ -f ".env" ]; then
            PORTAL_ID=$(grep "HUBSPOT_PORTAL_ID" .env | cut -d'=' -f2)
            PORTAL_NAME=$(grep "HUBSPOT_PORTAL_NAME" .env | cut -d'=' -f2)

            if [ -n "$PORTAL_ID" ] && [ "$PORTAL_ID" != "YOUR_RENTABLE_PORTAL_ID_HERE" ]; then
                echo "    Portal ID: $PORTAL_ID"
                echo "    Portal Name: $PORTAL_NAME"
            else
                echo "    Portal: Not configured"
            fi
        else
            echo "    Portal: Not configured"
        fi
    fi

    echo ""
}

# Function to test connections
test_connections() {
    echo -e "${BLUE}Testing Environment Connections...${NC}"
    echo ""

    # Test Salesforce
    echo -e "${YELLOW}Testing Salesforce...${NC}"
    if sf org display --json >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Salesforce connected${NC}"

        # Try a simple query
        if sf data query --query "SELECT COUNT() FROM Contact LIMIT 1" --json >/dev/null 2>&1; then
            echo -e "${GREEN}✓ Salesforce API accessible${NC}"
        else
            echo -e "${RED}✗ Salesforce API error${NC}"
        fi
    else
        echo -e "${RED}✗ Salesforce not connected${NC}"
    fi

    # Test HubSpot
    echo -e "\n${YELLOW}Testing HubSpot...${NC}"
    if [ -f ".env" ]; then
        source .env

        if [ -n "$HUBSPOT_API_KEY" ] && [ "$HUBSPOT_API_KEY" != "YOUR_RENTABLE_HUBSPOT_API_KEY_HERE" ]; then
            # Test API connection
            RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
                -H "Authorization: Bearer $HUBSPOT_API_KEY" \
                "https://api.hubapi.com/account-info/v3/api-usage/daily")

            if [ "$RESPONSE" == "200" ]; then
                echo -e "${GREEN}✓ HubSpot connected${NC}"
                echo -e "${GREEN}✓ HubSpot API accessible${NC}"
            else
                echo -e "${RED}✗ HubSpot API error (HTTP $RESPONSE)${NC}"
            fi
        else
            echo -e "${YELLOW}⚠ HubSpot not configured${NC}"
        fi
    else
        echo -e "${RED}✗ No environment file found${NC}"
    fi

    echo ""
}

# Function to create new environment
create_environment() {
    echo -e "${BLUE}Create New Environment Configuration${NC}"
    echo ""

    read -p "Environment name (e.g., 'client-name'): " ENV_NAME
    read -p "Salesforce org alias: " SF_ORG
    read -p "HubSpot Portal ID: " HS_PORTAL_ID
    read -p "Description: " DESCRIPTION

    CONFIG_FILE="config/${ENV_NAME}-config.json"
    ENV_FILE=".env.${ENV_NAME}"

    # Create config file
    cat > "$CONFIG_FILE" << EOF
{
  "name": "${ENV_NAME}",
  "description": "${DESCRIPTION}",
  "salesforce": {
    "orgAlias": "${SF_ORG}"
  },
  "hubspot": {
    "portalId": "${HS_PORTAL_ID}"
  },
  "sync": {
    "enabled": true,
    "direction": "bidirectional"
  }
}
EOF

    # Create env file
    cat > "$ENV_FILE" << EOF
# ${ENV_NAME} Environment Configuration
SALESFORCE_ORG_ALIAS=${SF_ORG}
HUBSPOT_PORTAL_ID=${HS_PORTAL_ID}
HUBSPOT_API_KEY=YOUR_API_KEY_HERE
XPLAT_CONFIG_FILE=./${CONFIG_FILE}
XPLAT_ENVIRONMENT=${ENV_NAME}
EOF

    echo -e "${GREEN}✓ Created configuration: $CONFIG_FILE${NC}"
    echo -e "${GREEN}✓ Created environment: $ENV_FILE${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Edit $ENV_FILE and add your HubSpot API key"
    echo "  2. Run: $0 switch $ENV_NAME"
}

# Main script logic
case "$1" in
    list)
        list_environments
        ;;
    switch)
        switch_environment "$2"
        ;;
    current)
        show_current_environment
        ;;
    create)
        create_environment
        ;;
    test)
        test_connections
        ;;
    *)
        usage
        ;;
esac