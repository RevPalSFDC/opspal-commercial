#!/bin/bash

##############################################################################
# credential-manager.sh - Secure Credential Management Library
##############################################################################
# Provides secure credential management for all ClaudeSFDC scripts
# Supports environment variables, .env files, and vault integration
##############################################################################

set -euo pipefail

# Get project directory
CLAUDE_SFDC_DIR="${CLAUDE_SFDC_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

# Credential storage locations (in priority order)
CREDENTIAL_SOURCES=(
    "${HOME}/.claudesfdc/credentials"     # User-specific credentials
    "${CLAUDE_SFDC_DIR}/.env"            # Project-level .env file
    "/etc/claudesfdc/credentials"         # System-wide credentials
)

# Required credentials list
REQUIRED_CREDENTIALS=(
    "SF_TARGET_ORG"
    "SF_TARGET_ORG"
    "ASANA_ACCESS_TOKEN"
    "ASANA_WORKSPACE_ID"
)

# Optional credentials
OPTIONAL_CREDENTIALS=(
    "SLACK_WEBHOOK_URL"
    "DISCORD_WEBHOOK_URL"
    "EMAIL_SMTP_HOST"
    "EMAIL_SMTP_USER"
    "ERROR_LOG_LEVEL"
    "INSTANCE_URL"
)

##############################################################################
# Core Functions
##############################################################################

# Load credentials from all available sources
load_credentials() {
    local verbose="${1:-false}"
    local loaded_count=0
    
    # First, check for .env file in project root
    local env_file="${CLAUDE_SFDC_DIR:-$(pwd)}/.env"
    if [[ -f "$env_file" ]]; then
        while IFS='=' read -r key value; do
            # Skip comments and empty lines
            [[ "$key" =~ ^#.*$ ]] && continue
            [[ -z "$key" ]] && continue
            
            # Remove quotes from value
            value="${value%\"}"
            value="${value#\"}"
            value="${value%\'}"
            value="${value#\'}"
            
            # Export if not already set
            if [[ -z "${!key:-}" ]]; then
                export "$key=$value"
                ((loaded_count++))
                [[ "$verbose" == "true" ]] && echo "Loaded: $key"
            fi
        done < "$env_file"
    fi
    
    # Load from other sources
    for source in "${CREDENTIAL_SOURCES[@]}"; do
        if [[ -f "$source" ]]; then
            source "$source" 2>/dev/null || true
            [[ "$verbose" == "true" ]] && echo "Loaded credentials from: $source"
        fi
    done
    
    [[ "$verbose" == "true" ]] && echo "Loaded $loaded_count credentials"
    return 0
}

# Get a credential value securely
get_credential() {
    local key="$1"
    local default="${2:-}"
    local required="${3:-false}"
    
    # Check environment variable
    local value="${!key:-}"
    
    # If not found and required, try to load
    if [[ -z "$value" ]] && [[ "$required" == "true" ]]; then
        load_credentials false
        value="${!key:-}"
    fi
    
    # Use default if still not found
    if [[ -z "$value" ]] && [[ -n "$default" ]]; then
        value="$default"
    fi
    
    # Error if required and still not found
    if [[ -z "$value" ]] && [[ "$required" == "true" ]]; then
        echo "ERROR: Required credential '$key' not found" >&2
        echo "Please set it in one of:" >&2
        printf " - %s\n" "${CREDENTIAL_SOURCES[@]}" >&2
        return 1
    fi
    
    echo "$value"
}

# Set a credential securely
set_credential() {
    local key="$1"
    local value="$2"
    local persist="${3:-false}"
    
    # Export to current environment
    export "$key=$value"
    
    # Persist if requested
    if [[ "$persist" == "true" ]]; then
        local cred_dir="${HOME}/.claudesfdc"
        local cred_file="${cred_dir}/credentials"
        
        # Create directory if needed
        mkdir -p "$cred_dir"
        chmod 700 "$cred_dir"
        
        # Update or add credential
        if [[ -f "$cred_file" ]]; then
            # Remove old value if exists
            grep -v "^${key}=" "$cred_file" > "${cred_file}.tmp" || true
            mv "${cred_file}.tmp" "$cred_file"
        fi
        
        # Add new value
        echo "${key}=${value}" >> "$cred_file"
        chmod 600 "$cred_file"
    fi
}

# Validate all required credentials
validate_credentials() {
    local missing=()
    local optional_missing=()
    
    echo "Validating credentials..."
    
    # Check required credentials
    for cred in "${REQUIRED_CREDENTIALS[@]}"; do
        if [[ -z "${!cred:-}" ]]; then
            missing+=("$cred")
        else
            echo "✓ $cred is set"
        fi
    done
    
    # Check optional credentials
    for cred in "${OPTIONAL_CREDENTIALS[@]}"; do
        if [[ -z "${!cred:-}" ]]; then
            optional_missing+=("$cred")
        else
            echo "✓ $cred is set (optional)"
        fi
    done
    
    # Report missing
    if [[ ${#missing[@]} -gt 0 ]]; then
        echo ""
        echo "❌ Missing required credentials:"
        printf " - %s\n" "${missing[@]}"
        return 1
    fi
    
    if [[ ${#optional_missing[@]} -gt 0 ]]; then
        echo ""
        echo "ℹ️  Optional credentials not set:"
        printf " - %s\n" "${optional_missing[@]}"
    fi
    
    echo ""
    echo "✅ All required credentials are configured"
    return 0
}

# Create template .env file
create_env_template() {
    local template_file="${1:-.env.template}"
    
    cat > "$template_file" << 'EOF'
# ClaudeSFDC Credential Configuration Template
# Copy this file to .env and fill in your values
# DO NOT commit .env to version control!

# === REQUIRED CREDENTIALS ===

# Salesforce Configuration
SF_TARGET_ORG=your-org-alias
SF_TARGET_ORG=your-username@example.com
INSTANCE_URL=https://your-instance.salesforce.com

# Asana Integration (if using)
ASANA_ACCESS_TOKEN=your-asana-token
ASANA_WORKSPACE_ID=your-workspace-id

# === OPTIONAL CREDENTIALS ===

# Notification Webhooks
SLACK_WEBHOOK_URL=
DISCORD_WEBHOOK_URL=

# Email Configuration
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=
EMAIL_SMTP_PASS=

# Error Logging
ERROR_LOG_LEVEL=INFO
ERROR_LOG_FILE=/var/log/claudesfdc/errors.log

# Performance Settings
MAX_PARALLEL_JOBS=4
RETRY_MAX_ATTEMPTS=3
TIMEOUT_SECONDS=300

# === SENSITIVE DATA ===
# Add any other sensitive configuration here
# Remember: NEVER commit actual credentials to git!
EOF
    
    echo "✓ Created credential template: $template_file"
    echo "  Copy to .env and fill in your values"
}

# Migrate hardcoded credentials from a script
migrate_script_credentials() {
    local script_file="$1"
    local backup_dir="${2:-backups}"
    
    if [[ ! -f "$script_file" ]]; then
        echo "Error: Script not found: $script_file" >&2
        return 1
    fi
    
    # Create backup
    local backup_file="${backup_dir}/$(basename "$script_file").$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$backup_dir"
    cp "$script_file" "$backup_file"
    
    # Common credential patterns to replace
    local replacements=(
        's/SF_TARGET_ORG="[^"]*"/SF_TARGET_ORG="${SF_TARGET_ORG:-}"/g'
        's/INSTANCE_URL="[^"]*"/INSTANCE_URL="${INSTANCE_URL:-}"/g'
        's/API_KEY="[^"]*"/API_KEY="${API_KEY:-}"/g'
        's/TOKEN="[^"]*"/TOKEN="${TOKEN:-}"/g'
        's/PASSWORD="[^"]*"/PASSWORD="${PASSWORD:-}"/g'
        's/SECRET="[^"]*"/SECRET="${SECRET:-}"/g'
    )
    
    # Apply replacements
    for pattern in "${replacements[@]}"; do
        sed -i "$pattern" "$script_file"
    done
    
    # Add credential loading if not present
    if ! grep -q "load_credentials" "$script_file"; then
        # Add after shebang
        sed -i '2i\
\
# Load credentials\
source "$(dirname "$0")/lib/credential-manager.sh"\
load_credentials' "$script_file"
    fi
    
    echo "✓ Migrated credentials in: $script_file"
    echo "  Backup saved to: $backup_file"
}

# Encrypt sensitive credential file
encrypt_credentials() {
    local file="${1:-${HOME}/.claudesfdc/credentials}"
    local encrypted="${file}.enc"
    
    if [[ ! -f "$file" ]]; then
        echo "Error: Credential file not found: $file" >&2
        return 1
    fi
    
    # Use GPG if available
    if command -v gpg &> /dev/null; then
        gpg --symmetric --cipher-algo AES256 --output "$encrypted" "$file"
        echo "✓ Encrypted credentials to: $encrypted"
        echo "  Decrypt with: gpg --decrypt $encrypted"
    else
        echo "Warning: GPG not available, using base64 encoding (not secure!)" >&2
        base64 < "$file" > "$encrypted"
        echo "⚠️  Encoded credentials to: $encrypted (NOT ENCRYPTED)"
    fi
}

# Decrypt credential file
decrypt_credentials() {
    local encrypted="${1:-${HOME}/.claudesfdc/credentials.enc}"
    local output="${2:-${HOME}/.claudesfdc/credentials}"
    
    if [[ ! -f "$encrypted" ]]; then
        echo "Error: Encrypted file not found: $encrypted" >&2
        return 1
    fi
    
    # Use GPG if available
    if command -v gpg &> /dev/null; then
        gpg --decrypt --output "$output" "$encrypted"
        chmod 600 "$output"
        echo "✓ Decrypted credentials to: $output"
    else
        base64 -d < "$encrypted" > "$output"
        chmod 600 "$output"
        echo "⚠️  Decoded credentials to: $output"
    fi
}

##############################################################################
# Vault Integration (Future)
##############################################################################

# HashiCorp Vault integration placeholder
get_vault_credential() {
    local key="$1"
    
    if command -v vault &> /dev/null; then
        vault kv get -field="$key" secret/claudesfdc 2>/dev/null || echo ""
    else
        echo ""
    fi
}

##############################################################################
# Auto-initialization
##############################################################################

# Automatically load credentials when sourced
if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
    load_credentials false
fi

# Export functions for use in other scripts
export -f load_credentials
export -f get_credential
export -f set_credential
export -f validate_credentials
export -f create_env_template
export -f migrate_script_credentials