#!/bin/bash

##############################################################################
# Asana Connection Manager
#
# SYSTEMIC FIX for recurring token breakage issue (5th occurrence)
#
# ROOT CAUSE: Multiple scripts overwrite ASANA_ACCESS_TOKEN without validation
# SOLUTION: Centralized credential management with validation and protection
#
# Features:
# - Token validation before operations
# - Protection against accidental overwrites
# - Automated health checks
# - Recovery mechanism
# - Audit trail
#
# Part of Asana Agent Integration Playbook v1.6.0
##############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
ENV_FILE="${ENV_FILE:-.env}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
ENV_PATH="$ROOT_DIR/$ENV_FILE"
AUDIT_LOG="$ROOT_DIR/.claude/logs/asana-credential-audit.log"

# Ensure log directory exists
mkdir -p "$(dirname "$AUDIT_LOG")"

# Logging function
log_audit() {
    local action="$1"
    local status="$2"
    local details="$3"
    echo "[$(date -Iseconds)] ACTION=$action STATUS=$status DETAILS=$details USER=${USER:-unknown}" >> "$AUDIT_LOG"
}

##############################################################################
# VALIDATION FUNCTIONS
##############################################################################

validate_token() {
    local token="$1"

    if [ -z "$token" ]; then
        echo -e "${RED}❌ Token is empty${NC}"
        return 1
    fi

    # Check token format: should start with "2/" and contain ":"
    if [[ ! "$token" =~ ^2/[0-9]+/[0-9]+:[a-f0-9]{32}$ ]]; then
        echo -e "${RED}❌ Token format invalid${NC}"
        echo -e "${YELLOW}   Expected: 2/XXXXXX/XXXXXX:hash${NC}"
        return 1
    fi

    # Test token with Asana API
    local response=$(curl -s -w "\n%{http_code}" \
        -H "Authorization: Bearer $token" \
        "https://app.asana.com/api/1.0/workspaces")

    local http_code=$(echo "$response" | tail -n 1)
    local body=$(echo "$response" | head -n -1)

    if [ "$http_code" = "200" ]; then
        echo -e "${GREEN}✅ Token valid and working${NC}"
        log_audit "VALIDATE_TOKEN" "SUCCESS" "Token validated successfully"
        return 0
    elif [ "$http_code" = "401" ]; then
        echo -e "${RED}❌ Token invalid or expired (401 Unauthorized)${NC}"
        log_audit "VALIDATE_TOKEN" "FAILED" "Token returned 401"
        return 1
    else
        echo -e "${RED}❌ API request failed (HTTP $http_code)${NC}"
        log_audit "VALIDATE_TOKEN" "ERROR" "HTTP $http_code"
        return 1
    fi
}

validate_workspace() {
    local token="$1"
    local workspace_id="$2"

    if [ -z "$workspace_id" ]; then
        echo -e "${RED}❌ Workspace ID is empty${NC}"
        return 1
    fi

    # Get workspaces
    local response=$(curl -s -w "\n%{http_code}" \
        -H "Authorization: Bearer $token" \
        "https://app.asana.com/api/1.0/workspaces")

    local http_code=$(echo "$response" | tail -n 1)
    local body=$(echo "$response" | head -n -1)

    if [ "$http_code" = "200" ]; then
        # Check if workspace exists
        if echo "$body" | grep -q "\"gid\":\"$workspace_id\""; then
            local workspace_name=$(echo "$body" | grep -A 1 "\"gid\":\"$workspace_id\"" | grep '"name"' | cut -d'"' -f4)
            echo -e "${GREEN}✅ Workspace accessible: $workspace_name ($workspace_id)${NC}"
            log_audit "VALIDATE_WORKSPACE" "SUCCESS" "Workspace $workspace_id accessible"
            return 0
        else
            echo -e "${RED}❌ Workspace $workspace_id not accessible with this token${NC}"
            log_audit "VALIDATE_WORKSPACE" "FAILED" "Workspace $workspace_id not found"
            return 1
        fi
    else
        echo -e "${RED}❌ Cannot access workspaces (HTTP $http_code)${NC}"
        return 1
    fi
}

##############################################################################
# PROTECTION FUNCTIONS
##############################################################################

protect_token() {
    # Create backup of current .env
    if [ -f "$ENV_PATH" ]; then
        cp "$ENV_PATH" "$ENV_PATH.backup-$(date +%Y%m%d-%H%M%S)"
        echo -e "${GREEN}✓ Backup created${NC}"
        log_audit "PROTECT_TOKEN" "BACKUP_CREATED" "Backup before modification"
    fi
}

check_env_integrity() {
    if [ ! -f "$ENV_PATH" ]; then
        echo -e "${RED}❌ .env file not found at $ENV_PATH${NC}"
        return 1
    fi

    # Check for required variables
    local required_vars=("ASANA_ACCESS_TOKEN" "ASANA_WORKSPACE_ID")
    local missing=()

    for var in "${required_vars[@]}"; do
        if ! grep -q "^${var}=" "$ENV_PATH"; then
            missing+=("$var")
        fi
    done

    if [ ${#missing[@]} -gt 0 ]; then
        echo -e "${RED}❌ Missing required variables: ${missing[*]}${NC}"
        return 1
    fi

    echo -e "${GREEN}✅ .env integrity OK${NC}"
    return 0
}

##############################################################################
# UPDATE FUNCTIONS
##############################################################################

update_token() {
    local new_token="$1"
    local workspace_id="$2"

    echo -e "${BLUE}Updating Asana credentials...${NC}"

    # Validate new token first
    if ! validate_token "$new_token"; then
        echo -e "${RED}❌ Cannot update - new token is invalid${NC}"
        log_audit "UPDATE_TOKEN" "FAILED" "New token failed validation"
        return 1
    fi

    # Validate workspace access
    if [ -n "$workspace_id" ]; then
        if ! validate_workspace "$new_token" "$workspace_id"; then
            echo -e "${RED}❌ Cannot update - workspace not accessible${NC}"
            log_audit "UPDATE_TOKEN" "FAILED" "Workspace not accessible"
            return 1
        fi
    fi

    # Protect current token
    protect_token

    # Update .env
    if grep -q "^ASANA_ACCESS_TOKEN=" "$ENV_PATH"; then
        # Replace existing
        sed -i "s|^ASANA_ACCESS_TOKEN=.*|ASANA_ACCESS_TOKEN=$new_token|" "$ENV_PATH"
    else
        # Add new
        echo "ASANA_ACCESS_TOKEN=$new_token" >> "$ENV_PATH"
    fi

    if [ -n "$workspace_id" ]; then
        if grep -q "^ASANA_WORKSPACE_ID=" "$ENV_PATH"; then
            sed -i "s|^ASANA_WORKSPACE_ID=.*|ASANA_WORKSPACE_ID=$workspace_id|" "$ENV_PATH"
        else
            echo "ASANA_WORKSPACE_ID=$workspace_id" >> "$ENV_PATH"
        fi
    fi

    # Add validation timestamp
    local timestamp=$(date -Iseconds)
    if grep -q "^# Last validated:" "$ENV_PATH"; then
        sed -i "s|^# Last validated:.*|# Last validated: $timestamp|" "$ENV_PATH"
    else
        sed -i "/^ASANA_ACCESS_TOKEN=/a # Last validated: $timestamp" "$ENV_PATH"
    fi

    echo -e "${GREEN}✅ Token updated successfully${NC}"
    log_audit "UPDATE_TOKEN" "SUCCESS" "Token updated and validated"

    return 0
}

##############################################################################
# HEALTH CHECK FUNCTIONS
##############################################################################

health_check() {
    echo -e "${BLUE}Running Asana connection health check...${NC}"

    # Load current credentials
    if [ -f "$ENV_PATH" ]; then
        set -a
        source "$ENV_PATH"
        set +a
    else
        echo -e "${RED}❌ .env file not found${NC}"
        return 1
    fi

    # Validate token
    if ! validate_token "$ASANA_ACCESS_TOKEN"; then
        echo -e "${RED}❌ Health check FAILED - token invalid${NC}"
        log_audit "HEALTH_CHECK" "FAILED" "Token validation failed"
        return 1
    fi

    # Validate workspace
    if ! validate_workspace "$ASANA_ACCESS_TOKEN" "$ASANA_WORKSPACE_ID"; then
        echo -e "${RED}❌ Health check FAILED - workspace inaccessible${NC}"
        log_audit "HEALTH_CHECK" "FAILED" "Workspace validation failed"
        return 1
    fi

    # Check recent audit log for issues
    if [ -f "$AUDIT_LOG" ]; then
        local recent_failures=$(tail -100 "$AUDIT_LOG" | grep "STATUS=FAILED" | wc -l)
        if [ "$recent_failures" -gt 5 ]; then
            echo -e "${YELLOW}⚠️  Warning: $recent_failures failures in recent audit log${NC}"
        fi
    fi

    echo -e "${GREEN}✅ Health check PASSED${NC}"
    log_audit "HEALTH_CHECK" "SUCCESS" "All checks passed"
    return 0
}

##############################################################################
# RECOVERY FUNCTIONS
##############################################################################

recover_from_backup() {
    echo -e "${BLUE}Searching for .env backups...${NC}"

    local backups=($(ls -t "$ENV_PATH".backup-* 2>/dev/null))

    if [ ${#backups[@]} -eq 0 ]; then
        echo -e "${RED}❌ No backups found${NC}"
        return 1
    fi

    echo -e "${YELLOW}Found ${#backups[@]} backup(s):${NC}"
    for i in "${!backups[@]}"; do
        local backup="${backups[$i]}"
        local date=$(echo "$backup" | sed 's/.*backup-//')
        echo "  $((i+1)). $(basename "$backup") (from $date)"
    done

    # Use most recent backup
    local latest_backup="${backups[0]}"
    echo -e "${BLUE}Testing latest backup: $(basename "$latest_backup")${NC}"

    # Extract token from backup
    local backup_token=$(grep "^ASANA_ACCESS_TOKEN=" "$latest_backup" | cut -d'=' -f2)

    if validate_token "$backup_token"; then
        echo -e "${GREEN}✅ Backup token is valid!${NC}"
        echo -e "${YELLOW}Restore from backup? [y/N]${NC}"
        read -r response

        if [[ "$response" =~ ^[Yy]$ ]]; then
            cp "$latest_backup" "$ENV_PATH"
            echo -e "${GREEN}✅ Restored from backup${NC}"
            log_audit "RECOVER" "SUCCESS" "Restored from $latest_backup"
            return 0
        fi
    else
        echo -e "${RED}❌ Backup token is also invalid${NC}"
        log_audit "RECOVER" "FAILED" "Backup token invalid"
        return 1
    fi
}

##############################################################################
# PREVENTION FUNCTIONS
##############################################################################

install_pre_operation_hook() {
    local hook_file="$ROOT_DIR/.claude/hooks/pre-asana-operation.sh"

    mkdir -p "$(dirname "$hook_file")"

    cat > "$hook_file" << 'HOOK_EOF'
#!/bin/bash
# Pre-Asana-Operation Validation Hook
# Validates Asana token before any operation

set -e

# Load environment
if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

# Quick token validation
if [ -z "$ASANA_ACCESS_TOKEN" ]; then
    echo "❌ ASANA_ACCESS_TOKEN not set in .env"
    echo "   Run: .claude-plugins/opspal-core/scripts/lib/asana-connection-manager.sh validate"
    exit 1
fi

# Basic format check
if [[ ! "$ASANA_ACCESS_TOKEN" =~ ^2/ ]]; then
    echo "❌ ASANA_ACCESS_TOKEN format invalid (should start with '2/')"
    echo "   Run: .claude-plugins/opspal-core/scripts/lib/asana-connection-manager.sh fix"
    exit 1
fi

# Token is present and formatted correctly
exit 0
HOOK_EOF

    chmod +x "$hook_file"
    echo -e "${GREEN}✅ Pre-operation hook installed${NC}"
    log_audit "INSTALL_HOOK" "SUCCESS" "Pre-operation validation hook installed"
}

install_daily_health_check() {
    local cron_script="$ROOT_DIR/.claude/scripts/daily-asana-health-check.sh"

    mkdir -p "$(dirname "$cron_script")"

    cat > "$cron_script" << 'CRON_EOF'
#!/bin/bash
# Daily Asana Health Check
# Validates Asana connection and alerts if broken

cd "$(dirname "$0")/../.."
./claude-plugins/opspal-core/scripts/lib/asana-connection-manager.sh health

if [ $? -ne 0 ]; then
    echo "⚠️  Asana connection health check FAILED"
    echo "   Run: ./claude-plugins/opspal-core/scripts/lib/asana-connection-manager.sh fix"

    # Optionally send Slack alert
    if [ -n "$SLACK_WEBHOOK_URL" ]; then
        curl -X POST "$SLACK_WEBHOOK_URL" \
            -H 'Content-Type: application/json' \
            -d '{"text":"🚨 Asana connection health check FAILED - token may be invalid"}'
    fi
fi
CRON_EOF

    chmod +x "$cron_script"
    echo -e "${GREEN}✅ Daily health check script installed${NC}"
    echo -e "${YELLOW}   Add to crontab: 0 9 * * * $cron_script${NC}"
    log_audit "INSTALL_CRON" "SUCCESS" "Daily health check installed"
}

##############################################################################
# MAIN COMMAND ROUTING
##############################################################################

case "${1:-help}" in
    validate)
        echo -e "${BLUE}=== Asana Connection Validation ===${NC}\n"

        # Load .env
        if [ -f "$ENV_PATH" ]; then
            set -a
            source "$ENV_PATH"
            set +a
        else
            echo -e "${RED}❌ .env file not found at $ENV_PATH${NC}"
            exit 1
        fi

        # Check integrity
        check_env_integrity || exit 1

        # Validate token
        validate_token "$ASANA_ACCESS_TOKEN" || exit 1

        # Validate workspace
        validate_workspace "$ASANA_ACCESS_TOKEN" "$ASANA_WORKSPACE_ID" || exit 1

        echo -e "\n${GREEN}✅ All validations passed${NC}"
        exit 0
        ;;

    health)
        health_check
        exit $?
        ;;

    update)
        if [ -z "$2" ]; then
            echo -e "${RED}Usage: $0 update <new-token> [workspace-id]${NC}"
            exit 1
        fi

        update_token "$2" "$3"
        exit $?
        ;;

    fix)
        echo -e "${BLUE}=== Asana Connection Recovery ===${NC}\n"

        # Try to recover from backup
        if recover_from_backup; then
            health_check
            exit $?
        fi

        # Manual fix required
        echo -e "\n${YELLOW}Manual recovery required:${NC}"
        echo -e "1. Get your Asana Personal Access Token from:"
        echo -e "   ${BLUE}https://app.asana.com/0/my-apps${NC}"
        echo -e "2. Run: $0 update <your-token> <workspace-id>"
        exit 1
        ;;

    protect)
        echo -e "${BLUE}=== Installing Protection Infrastructure ===${NC}\n"

        install_pre_operation_hook
        install_daily_health_check

        echo -e "\n${GREEN}✅ Protection infrastructure installed${NC}"
        echo -e "\n${BLUE}Next steps:${NC}"
        echo -e "1. Add daily health check to crontab (optional)"
        echo -e "2. Run: $0 validate"
        exit 0
        ;;

    status)
        echo -e "${BLUE}=== Asana Connection Status ===${NC}\n"

        # Load .env
        if [ -f "$ENV_PATH" ]; then
            set -a
            source "$ENV_PATH"
            set +a

            echo "📁 Environment file: $ENV_PATH"
            echo "🔑 Token configured: ${ASANA_ACCESS_TOKEN:+YES} ${ASANA_ACCESS_TOKEN:-NO}"
            echo "🏢 Workspace: ${ASANA_WORKSPACE_ID:-NOT_SET}"

            if [ -n "$ASANA_ACCESS_TOKEN" ]; then
                echo ""
                validate_token "$ASANA_ACCESS_TOKEN" > /dev/null 2>&1
                if [ $? -eq 0 ]; then
                    echo -e "${GREEN}✅ Connection: HEALTHY${NC}"
                else
                    echo -e "${RED}❌ Connection: BROKEN${NC}"
                    echo -e "${YELLOW}   Run: $0 fix${NC}"
                fi
            fi
        else
            echo -e "${RED}❌ .env file not found${NC}"
            exit 1
        fi

        # Show recent audit log
        if [ -f "$AUDIT_LOG" ]; then
            echo ""
            echo "📋 Recent Activity (last 5 entries):"
            tail -5 "$AUDIT_LOG" | while read line; do
                echo "   $line"
            done
        fi

        exit 0
        ;;

    audit)
        echo -e "${BLUE}=== Asana Connection Audit Log ===${NC}\n"

        if [ ! -f "$AUDIT_LOG" ]; then
            echo -e "${YELLOW}No audit log found${NC}"
            exit 0
        fi

        # Summary
        echo "Total entries: $(wc -l < "$AUDIT_LOG")"
        echo "Successes: $(grep -c "STATUS=SUCCESS" "$AUDIT_LOG" || echo 0)"
        echo "Failures: $(grep -c "STATUS=FAILED" "$AUDIT_LOG" || echo 0)"
        echo "Errors: $(grep -c "STATUS=ERROR" "$AUDIT_LOG" || echo 0)"

        echo ""
        echo "Recent entries:"
        tail -20 "$AUDIT_LOG"
        exit 0
        ;;

    help|*)
        echo -e "${BLUE}=== Asana Connection Manager ===${NC}\n"
        echo "Systemic fix for recurring token breakage (5th occurrence)"
        echo ""
        echo "Commands:"
        echo "  validate          Validate current token and workspace"
        echo "  health            Run health check"
        echo "  update <token>    Update token (validates before applying)"
        echo "  fix               Attempt automatic recovery"
        echo "  protect           Install protection infrastructure"
        echo "  status            Show current connection status"
        echo "  audit             Show audit log"
        echo ""
        echo "Examples:"
        echo "  $0 validate"
        echo "  $0 update 2/xxx/xxx:hash REDACTED_WORKSPACE_ID"
        echo "  $0 fix"
        echo "  $0 protect"
        echo ""
        echo "Environment:"
        echo "  ENV_FILE          Path to .env (default: .env)"
        exit 0
        ;;
esac
