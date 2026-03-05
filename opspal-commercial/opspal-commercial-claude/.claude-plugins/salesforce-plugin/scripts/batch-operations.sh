#!/bin/bash

# Batch Operations Handler for Salesforce Tasks
# Groups related operations for single approval

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CONFIG_DIR="$PROJECT_ROOT/config"
WORKFLOW_PREFS="$CONFIG_DIR/workflow-preferences.json"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Batch storage
BATCH_FILE="$PROJECT_ROOT/.batch_operations.json"

# Initialize batch file
init_batch() {
    echo '{
  "operations": [],
  "created": "'$(date -Iseconds)'",
  "status": "pending"
}' > "$BATCH_FILE"
    echo -e "${GREEN}✓ Batch initialized${NC}"
}

# Add operation to batch
add_to_batch() {
    local operation_type="$1"
    local operation_details="$2"
    
    if [ ! -f "$BATCH_FILE" ]; then
        init_batch
    fi
    
    # Add operation to batch
    jq --arg type "$operation_type" \
       --arg details "$operation_details" \
       '.operations += [{
           "type": $type,
           "details": $details,
           "timestamp": now | todate
       }]' "$BATCH_FILE" > "$BATCH_FILE.tmp" && mv "$BATCH_FILE.tmp" "$BATCH_FILE"
    
    count=$(jq '.operations | length' "$BATCH_FILE")
    echo -e "${GREEN}✓ Added to batch (total: $count operations)${NC}"
}

# Show current batch
show_batch() {
    if [ ! -f "$BATCH_FILE" ]; then
        echo -e "${YELLOW}No active batch${NC}"
        return 1
    fi
    
    echo -e "${BLUE}=== Current Batch Operations ===${NC}"
    jq -r '.operations[] | "  [\(.type)] \(.details)"' "$BATCH_FILE"
    
    count=$(jq '.operations | length' "$BATCH_FILE")
    max_batch=$(jq -r '.batchOperations.maxItemsPerBatch // 20' "$WORKFLOW_PREFS")
    
    echo -e "\nTotal: $count operations (max: $max_batch)"
    
    if [ "$count" -ge "$max_batch" ]; then
        echo -e "${YELLOW}⚠ Batch at maximum capacity${NC}"
    fi
}

# Execute batch with single approval
execute_batch() {
    if [ ! -f "$BATCH_FILE" ]; then
        echo -e "${YELLOW}No batch to execute${NC}"
        return 1
    fi
    
    count=$(jq '.operations | length' "$BATCH_FILE")
    
    if [ "$count" -eq 0 ]; then
        echo -e "${YELLOW}Batch is empty${NC}"
        return 1
    fi
    
    echo -e "${BLUE}=== Batch Execution Plan ===${NC}"
    show_batch
    
    echo -e "\n${GREEN}This batch requires only ONE approval for all $count operations${NC}"
    echo -n "Proceed with batch execution? (y/n): "
    read -r response
    
    if [ "$response" = "y" ]; then
        echo -e "${GREEN}✓ Batch approved - executing all operations...${NC}"
        
        # Mark batch as executing
        jq '.status = "executing"' "$BATCH_FILE" > "$BATCH_FILE.tmp" && mv "$BATCH_FILE.tmp" "$BATCH_FILE"
        
        # Here you would integrate with actual Salesforce operations
        # For now, we'll simulate execution
        echo -e "${BLUE}Executing operations...${NC}"
        
        jq -r '.operations[] | "  Executing: [\(.type)] \(.details)"' "$BATCH_FILE"
        
        # Mark as completed
        jq '.status = "completed"' "$BATCH_FILE" > "$BATCH_FILE.tmp" && mv "$BATCH_FILE.tmp" "$BATCH_FILE"
        
        echo -e "${GREEN}✓ Batch execution completed${NC}"
        
        # Archive batch
        archive_batch
    else
        echo -e "${YELLOW}Batch execution cancelled${NC}"
    fi
}

# Clear current batch
clear_batch() {
    if [ -f "$BATCH_FILE" ]; then
        rm "$BATCH_FILE"
        echo -e "${GREEN}✓ Batch cleared${NC}"
    else
        echo -e "${YELLOW}No batch to clear${NC}"
    fi
}

# Archive completed batch
archive_batch() {
    if [ -f "$BATCH_FILE" ]; then
        archive_dir="$PROJECT_ROOT/.batch_archive"
        mkdir -p "$archive_dir"
        
        timestamp=$(date +%Y%m%d_%H%M%S)
        mv "$BATCH_FILE" "$archive_dir/batch_$timestamp.json"
        
        echo -e "${GREEN}✓ Batch archived${NC}"
    fi
}

# Parse batch command from natural language
parse_batch_command() {
    local command="$*"
    
    # Check for batch keywords
    if echo "$command" | grep -qiE "batch|bulk|multiple|group"; then
        echo -e "${GREEN}✓ Batch mode detected${NC}"
        
        # Extract operations
        if echo "$command" | grep -qiE "field|fields"; then
            echo "Detected: Field operations"
            # Parse field names and add to batch
        elif echo "$command" | grep -qiE "report|reports"; then
            echo "Detected: Report operations"
            # Parse report details and add to batch
        elif echo "$command" | grep -qiE "user|users"; then
            echo "Detected: User operations"
            # Parse user details and add to batch
        fi
        
        return 0
    fi
    
    return 1
}

# Main menu
show_menu() {
    echo -e "${BLUE}=== Salesforce Batch Operations Manager ===${NC}"
    echo "1) Initialize new batch"
    echo "2) Add operation to batch"
    echo "3) Show current batch"
    echo "4) Execute batch (single approval)"
    echo "5) Clear batch"
    echo "6) Exit"
    echo -n "Select option: "
}

# Interactive mode
interactive_mode() {
    while true; do
        show_menu
        read -r choice
        
        case $choice in
            1) init_batch ;;
            2) 
                echo -n "Operation type: "
                read -r op_type
                echo -n "Operation details: "
                read -r op_details
                add_to_batch "$op_type" "$op_details"
                ;;
            3) show_batch ;;
            4) execute_batch ;;
            5) clear_batch ;;
            6) exit 0 ;;
            *) echo -e "${YELLOW}Invalid option${NC}" ;;
        esac
        
        echo ""
    done
}

# Main execution
main() {
    # Check for command line arguments
    case "${1:-}" in
        init) init_batch ;;
        add) add_to_batch "$2" "$3" ;;
        show) show_batch ;;
        execute) execute_batch ;;
        clear) clear_batch ;;
        parse) shift; parse_batch_command "$@" ;;
        *) interactive_mode ;;
    esac
}

main "$@"