#!/bin/bash

# JWT Bearer Flow Authentication for Salesforce
# Enables headless server-to-server authentication without browser
# Based on Salesforce JWT Bearer OAuth 2.0 flow

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
CONFIG_DIR="$PROJECT_ROOT/config/auth"
KEYS_DIR="$CONFIG_DIR/keys"
TOKENS_DIR="$CONFIG_DIR/tokens"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Function to display usage
show_usage() {
    cat << EOF
Usage: $0 [COMMAND] [OPTIONS]

Commands:
    setup <org_alias>         Initial JWT setup for an org
    login <org_alias>         Authenticate using JWT
    refresh <org_alias>       Refresh access token
    verify <org_alias>        Verify JWT authentication
    list                      List configured JWT orgs
    generate-key <org_alias>  Generate new RSA key pair

Options:
    --client-id <id>          Connected App Consumer Key
    --username <username>     Salesforce username
    --instance-url <url>      Instance URL (https://login.salesforce.com or https://test.salesforce.com)
    --key-file <path>         Path to private key file
    --cert-file <path>        Path to certificate file (optional)

Example:
    $0 setup myorg --client-id 3MVG9... --username admin@company.com --instance-url https://login.salesforce.com
    $0 login myorg

EOF
}

# Function to generate RSA key pair
generate_key_pair() {
    local org_alias="$1"
    local key_file="$KEYS_DIR/${org_alias}_private.key"
    local cert_file="$KEYS_DIR/${org_alias}_public.crt"
    
    echo -e "${BLUE}Generating RSA key pair for $org_alias...${NC}"
    
    # Create keys directory if it doesn't exist
    mkdir -p "$KEYS_DIR"
    chmod 700 "$KEYS_DIR"
    
    # Generate private key
    openssl genrsa -out "$key_file" 2048
    chmod 600 "$key_file"
    
    # Generate self-signed certificate
    openssl req -new -x509 -key "$key_file" -out "$cert_file" -days 365 \
        -subj "/CN=Salesforce JWT Auth/O=Company/C=US"
    
    echo -e "${GREEN}✓ Key pair generated successfully${NC}"
    echo "  Private key: $key_file"
    echo "  Certificate: $cert_file"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo "1. Upload certificate to Connected App in Salesforce Setup:"
    echo "   Setup → Apps → App Manager → New Connected App"
    echo "2. Enable OAuth Settings:"
    echo "   - Callback URL: http://localhost:1717/OauthRedirect"
    echo "   - Use digital signatures: Upload $cert_file"
    echo "   - Selected OAuth Scopes: api, refresh_token, offline_access"
    echo "3. After saving, copy the Consumer Key"
    echo "4. Run: $0 setup $org_alias --client-id <consumer_key> --username <your_username>"
}

# Function to setup JWT configuration
setup_jwt_config() {
    local org_alias="$1"
    shift
    
    local client_id=""
    local username=""
    local instance_url="https://login.salesforce.com"
    local key_file=""
    local cert_file=""
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --client-id)
                client_id="$2"
                shift 2
                ;;
            --username)
                username="$2"
                shift 2
                ;;
            --instance-url)
                instance_url="$2"
                shift 2
                ;;
            --key-file)
                key_file="$2"
                shift 2
                ;;
            --cert-file)
                cert_file="$2"
                shift 2
                ;;
            *)
                shift
                ;;
        esac
    done
    
    # Validate required parameters
    if [ -z "$client_id" ] || [ -z "$username" ]; then
        echo -e "${RED}Error: --client-id and --username are required${NC}"
        return 1
    fi
    
    # Use default key file if not specified
    if [ -z "$key_file" ]; then
        key_file="$KEYS_DIR/${org_alias}_private.key"
    fi
    
    # Check if key file exists
    if [ ! -f "$key_file" ]; then
        echo -e "${YELLOW}Private key not found. Generating new key pair...${NC}"
        generate_key_pair "$org_alias"
        key_file="$KEYS_DIR/${org_alias}_private.key"
    fi
    
    # Create config directory
    mkdir -p "$CONFIG_DIR"
    
    # Save configuration
    local config_file="$CONFIG_DIR/jwt_${org_alias}.json"
    cat > "$config_file" << EOF
{
    "orgAlias": "$org_alias",
    "clientId": "$client_id",
    "username": "$username",
    "instanceUrl": "$instance_url",
    "privateKeyPath": "$key_file",
    "certificatePath": "${cert_file:-$KEYS_DIR/${org_alias}_public.crt}",
    "createdAt": "$(date -Iseconds)",
    "lastAuthenticated": null
}
EOF
    
    chmod 600 "$config_file"
    
    echo -e "${GREEN}✓ JWT configuration saved for $org_alias${NC}"
    echo "  Config file: $config_file"
    
    # Test authentication
    echo -e "${BLUE}Testing JWT authentication...${NC}"
    authenticate_jwt "$org_alias"
}

# Function to create JWT assertion
create_jwt_assertion() {
    local client_id="$1"
    local username="$2"
    local key_file="$3"
    local instance_url="$4"
    
    # JWT header
    local header='{"alg":"RS256","typ":"JWT"}'
    local header_base64=$(echo -n "$header" | base64 -w 0 | tr '+/' '-_' | tr -d '=')
    
    # JWT claims
    local iat=$(date +%s)
    local exp=$((iat + 300))  # 5 minutes expiration
    local aud=$(echo "$instance_url" | sed 's|https://||' | sed 's|\.salesforce\.com.*|.salesforce.com|')
    
    local claims=$(cat <<EOF
{
    "iss": "$client_id",
    "sub": "$username",
    "aud": "$aud",
    "iat": $iat,
    "exp": $exp
}
EOF
)
    
    local claims_base64=$(echo -n "$claims" | base64 -w 0 | tr '+/' '-_' | tr -d '=')
    
    # Create signature
    local data_to_sign="${header_base64}.${claims_base64}"
    local signature=$(echo -n "$data_to_sign" | openssl dgst -sha256 -sign "$key_file" | base64 -w 0 | tr '+/' '-_' | tr -d '=')
    
    # Combine to create JWT
    echo "${data_to_sign}.${signature}"
}

# Function to authenticate using JWT
authenticate_jwt() {
    local org_alias="$1"
    local config_file="$CONFIG_DIR/jwt_${org_alias}.json"
    
    if [ ! -f "$config_file" ]; then
        echo -e "${RED}Error: Configuration not found for $org_alias${NC}"
        echo "Run: $0 setup $org_alias"
        return 1
    fi
    
    # Read configuration
    local client_id=$(jq -r '.clientId' "$config_file")
    local username=$(jq -r '.username' "$config_file")
    local instance_url=$(jq -r '.instanceUrl' "$config_file")
    local key_file=$(jq -r '.privateKeyPath' "$config_file")
    
    # Create JWT assertion
    local jwt_assertion=$(create_jwt_assertion "$client_id" "$username" "$key_file" "$instance_url")
    
    # Request access token
    local token_endpoint="${instance_url}/services/oauth2/token"
    local response=$(curl -s -X POST "$token_endpoint" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer" \
        -d "assertion=$jwt_assertion")
    
    # Check for errors
    if echo "$response" | jq -e '.error' > /dev/null 2>&1; then
        local error=$(echo "$response" | jq -r '.error')
        local error_desc=$(echo "$response" | jq -r '.error_description')
        echo -e "${RED}Authentication failed: $error${NC}"
        echo "  $error_desc"
        return 1
    fi
    
    # Extract tokens
    local access_token=$(echo "$response" | jq -r '.access_token')
    local instance_url=$(echo "$response" | jq -r '.instance_url')
    local issued_at=$(echo "$response" | jq -r '.issued_at')
    
    # Save tokens
    mkdir -p "$TOKENS_DIR"
    local token_file="$TOKENS_DIR/${org_alias}_token.json"
    echo "$response" | jq '. + {"orgAlias": "'"$org_alias"'", "expiresAt": '"$(($(date +%s) + 7200))"'}' > "$token_file"
    chmod 600 "$token_file"
    
    # Update last authenticated time
    jq '.lastAuthenticated = "'$(date -Iseconds)'"' "$config_file" > "${config_file}.tmp" && mv "${config_file}.tmp" "$config_file"
    
    # Also configure SF CLI to use this org
    echo -e "${BLUE}Configuring SF CLI with JWT auth...${NC}"
    sf org login jwt \
        --client-id "$client_id" \
        --jwt-key-file "$key_file" \
        --username "$username" \
        --alias "$org_alias" \
        --instance-url "$instance_url" \
        --set-default 2>/dev/null || true
    
    echo -e "${GREEN}✓ Successfully authenticated to $org_alias${NC}"
    echo "  Instance: $instance_url"
    echo "  Username: $username"
    echo "  Token saved: $token_file"
    echo "  Token expires: $(date -d @$(($(date +%s) + 7200)))"
    
    # Export for immediate use
    export SF_ACCESS_TOKEN="$access_token"
    export SF_INSTANCE_URL="$instance_url"
    export SF_TARGET_ORG="$org_alias"
    
    return 0
}

# Function to refresh token
refresh_token() {
    local org_alias="$1"
    echo -e "${BLUE}Refreshing token for $org_alias...${NC}"
    authenticate_jwt "$org_alias"
}

# Function to verify JWT authentication
verify_jwt_auth() {
    local org_alias="$1"
    local token_file="$TOKENS_DIR/${org_alias}_token.json"
    
    if [ ! -f "$token_file" ]; then
        echo -e "${RED}No active token found for $org_alias${NC}"
        return 1
    fi
    
    local access_token=$(jq -r '.access_token' "$token_file")
    local instance_url=$(jq -r '.instance_url' "$token_file")
    local expires_at=$(jq -r '.expiresAt' "$token_file")
    
    # Check if token is expired
    if [ "$(date +%s)" -gt "$expires_at" ]; then
        echo -e "${YELLOW}Token expired. Refreshing...${NC}"
        refresh_token "$org_alias"
        return $?
    fi
    
    # Test token with a simple API call
    local response=$(curl -s -X GET "${instance_url}/services/data/v64.0/limits" \
        -H "Authorization: Bearer $access_token" \
        -H "Accept: application/json")
    
    if echo "$response" | jq -e '.DailyApiRequests' > /dev/null 2>&1; then
        echo -e "${GREEN}✓ JWT authentication is valid for $org_alias${NC}"
        echo "  Token expires: $(date -d @$expires_at)"
        
        # Show API limits
        local api_used=$(echo "$response" | jq -r '.DailyApiRequests.Remaining')
        local api_max=$(echo "$response" | jq -r '.DailyApiRequests.Max')
        echo "  API Requests: $api_used / $api_max remaining"
        return 0
    else
        echo -e "${RED}Token validation failed${NC}"
        echo "Refreshing token..."
        refresh_token "$org_alias"
        return $?
    fi
}

# Function to list configured orgs
list_jwt_orgs() {
    echo -e "${BLUE}Configured JWT Organizations:${NC}"
    echo ""
    
    if [ ! -d "$CONFIG_DIR" ]; then
        echo "No JWT configurations found"
        return
    fi
    
    for config_file in "$CONFIG_DIR"/jwt_*.json; do
        if [ -f "$config_file" ]; then
            local org_alias=$(jq -r '.orgAlias' "$config_file")
            local username=$(jq -r '.username' "$config_file")
            local instance_url=$(jq -r '.instanceUrl' "$config_file")
            local last_auth=$(jq -r '.lastAuthenticated // "Never"' "$config_file")
            
            echo "  $org_alias:"
            echo "    Username: $username"
            echo "    Instance: $instance_url"
            echo "    Last Auth: $last_auth"
            
            # Check if token exists and is valid
            local token_file="$TOKENS_DIR/${org_alias}_token.json"
            if [ -f "$token_file" ]; then
                local expires_at=$(jq -r '.expiresAt' "$token_file")
                if [ "$(date +%s)" -lt "$expires_at" ]; then
                    echo -e "    Status: ${GREEN}Active (expires $(date -d @$expires_at '+%Y-%m-%d %H:%M'))${NC}"
                else
                    echo -e "    Status: ${YELLOW}Expired${NC}"
                fi
            else
                echo -e "    Status: ${YELLOW}Not authenticated${NC}"
            fi
            echo ""
        fi
    done
}

# Function to get active token for use in other scripts
get_active_token() {
    local org_alias="${1:-$SF_TARGET_ORG}"
    
    if [ -z "$org_alias" ]; then
        echo -e "${RED}Error: No org specified${NC}" >&2
        return 1
    fi
    
    local token_file="$TOKENS_DIR/${org_alias}_token.json"
    
    if [ ! -f "$token_file" ]; then
        # Try to authenticate
        authenticate_jwt "$org_alias" >&2
        token_file="$TOKENS_DIR/${org_alias}_token.json"
    fi
    
    local expires_at=$(jq -r '.expiresAt' "$token_file" 2>/dev/null)
    
    # Check if token is expired
    if [ -z "$expires_at" ] || [ "$(date +%s)" -gt "$expires_at" ]; then
        authenticate_jwt "$org_alias" >&2
    fi
    
    # Return token and instance URL
    jq -r '.access_token + "|" + .instance_url' "$token_file"
}

# Main execution
main() {
    local command="${1:-help}"
    shift || true
    
    case "$command" in
        setup)
            setup_jwt_config "$@"
            ;;
        login)
            authenticate_jwt "$@"
            ;;
        refresh)
            refresh_token "$@"
            ;;
        verify)
            verify_jwt_auth "$@"
            ;;
        list)
            list_jwt_orgs
            ;;
        generate-key)
            generate_key_pair "$@"
            ;;
        get-token)
            get_active_token "$@"
            ;;
        help|--help|-h)
            show_usage
            ;;
        *)
            echo -e "${RED}Unknown command: $command${NC}"
            show_usage
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
