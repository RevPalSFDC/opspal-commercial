#!/bin/bash

# Approval Bypass Script for Low-Risk Salesforce Operations
# This script enables automatic approval for defined low-risk operations

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CONFIG_DIR="$PROJECT_ROOT/config"
TRUST_SETTINGS="$CONFIG_DIR/trust-settings.json"
WORKFLOW_PREFS="$CONFIG_DIR/workflow-preferences.json"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to check if operation is auto-approvable
check_auto_approve() {
    local operation_type="$1"
    
    if [ ! -f "$TRUST_SETTINGS" ]; then
        echo -e "${RED}Trust settings not found. Creating default...${NC}"
        return 1
    fi
    
    # Check if operation is in autoApprove list
    auto_approve=$(jq -r ".autoApprove.$operation_type // false" "$TRUST_SETTINGS")
    
    if [ "$auto_approve" = "true" ]; then
        echo -e "${GREEN}✓ Operation '$operation_type' is auto-approved${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠ Operation '$operation_type' requires manual approval${NC}"
        return 1
    fi
}

# Function to batch operations
batch_operations() {
    local operations=("$@")
    local batch_enabled=$(jq -r '.batchSettings.enableBatching // false' "$TRUST_SETTINGS")
    local max_batch=$(jq -r '.batchSettings.maxBatchSize // 10' "$TRUST_SETTINGS")
    
    if [ "$batch_enabled" = "true" ]; then
        echo -e "${GREEN}Batching enabled. Processing ${#operations[@]} operations (max: $max_batch)${NC}"
        
        if [ ${#operations[@]} -le $max_batch ]; then
            echo -e "${GREEN}✓ All operations batched for single approval${NC}"
            return 0
        else
            echo -e "${YELLOW}⚠ Operations exceed batch limit. Will require multiple approvals.${NC}"
            return 1
        fi
    else
        echo -e "${YELLOW}Batching disabled. Each operation requires separate approval.${NC}"
        return 1
    fi
}

# Function to check express mode eligibility
check_express_mode() {
    local operation="$1"
    local express_enabled=$(jq -r '.expressMode.enabled // false' "$WORKFLOW_PREFS")
    
    if [ "$express_enabled" = "true" ]; then
        # Check if operation is in express mode list
        express_ops=$(jq -r '.expressMode.operations[]' "$WORKFLOW_PREFS" 2>/dev/null)
        
        if echo "$express_ops" | grep -q "$operation"; then
            echo -e "${GREEN}⚡ Express mode available for '$operation'${NC}"
            return 0
        fi
    fi
    
    return 1
}

# Function to determine planning requirement
check_planning_required() {
    local operation="$1"
    local planning_mode=$(jq -r '.planningRequired // "all"' "$WORKFLOW_PREFS")
    
    case "$planning_mode" in
        "complex-only")
            # Check skip list
            skip_list=$(jq -r '.skipPlanningFor[]' "$WORKFLOW_PREFS" 2>/dev/null)
            if echo "$skip_list" | grep -q "$operation"; then
                echo -e "${GREEN}✓ Planning skipped for '$operation'${NC}"
                return 1
            fi
            ;;
        "none")
            echo -e "${GREEN}✓ Planning disabled${NC}"
            return 1
            ;;
        *)
            echo -e "${YELLOW}Planning required for '$operation'${NC}"
            return 0
            ;;
    esac
}

# Main execution
main() {
    echo "=== Salesforce Approval Bypass Configuration ==="
    echo ""
    
    # Check configuration files
    if [ ! -f "$TRUST_SETTINGS" ]; then
        echo -e "${RED}Error: Trust settings not found at $TRUST_SETTINGS${NC}"
        exit 1
    fi
    
    if [ ! -f "$WORKFLOW_PREFS" ]; then
        echo -e "${RED}Error: Workflow preferences not found at $WORKFLOW_PREFS${NC}"
        exit 1
    fi
    
    # Display current settings
    echo "Current Configuration:"
    echo "----------------------"
    
    echo -e "${GREEN}Auto-Approved Operations:${NC}"
    jq -r '.autoApprove | to_entries[] | select(.value==true) | "  ✓ " + .key' "$TRUST_SETTINGS"
    
    echo -e "\n${YELLOW}Manual Approval Required:${NC}"
    jq -r '.requireApproval | to_entries[] | select(.value==true) | "  ⚠ " + .key' "$TRUST_SETTINGS"
    
    echo -e "\n${GREEN}Express Mode Operations:${NC}"
    jq -r '.expressMode.operations[]' "$WORKFLOW_PREFS" | sed 's/^/  ⚡ /'
    
    echo -e "\n${GREEN}Skip Planning For:${NC}"
    jq -r '.skipPlanningFor[]' "$WORKFLOW_PREFS" | sed 's/^/  ⏭ /'
    
    # Batch settings
    batch_enabled=$(jq -r '.batchSettings.enableBatching' "$TRUST_SETTINGS")
    max_batch=$(jq -r '.batchSettings.maxBatchSize' "$TRUST_SETTINGS")
    echo -e "\n${GREEN}Batch Settings:${NC}"
    echo "  Enabled: $batch_enabled"
    echo "  Max Size: $max_batch operations"
    
    # If operation provided as argument, check it
    if [ $# -gt 0 ]; then
        echo -e "\n=== Checking Operation: $1 ==="
        check_auto_approve "$1"
        check_express_mode "$1"
        check_planning_required "$1"
    fi
}

# Run main function
main "$@"