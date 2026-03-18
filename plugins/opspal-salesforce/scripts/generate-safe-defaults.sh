#!/bin/bash

# Generate Safe Defaults for Common Salesforce Objects
# Creates bypass configurations for validation rules

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CONFIG_DIR="$PROJECT_ROOT/config"
VALIDATION_ANALYZER="$SCRIPT_DIR/validation-rule-analyzer.sh"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Common Salesforce objects to process
STANDARD_OBJECTS=(
    "Account"
    "Contact"
    "Lead"
    "Opportunity"
    "Case"
    "Task"
    "Event"
    "Campaign"
    "CampaignMember"
    "Contract"
    "Order"
    "Quote"
    "Product2"
    "Pricebook2"
    "PricebookEntry"
    "OpportunityLineItem"
    "Asset"
    "User"
)

# Common custom objects (add your org's custom objects here)
CUSTOM_OBJECTS=(
    # Add your custom objects here, e.g.:
    # "Project__c"
    # "Invoice__c"
    # "Payment__c"
)

# Function to check if object exists
check_object_exists() {
    local object_name="$1"
    
    sf sobject describe --sobject "$object_name" --json >/dev/null 2>&1
    return $?
}

# Function to generate defaults for single object
generate_object_defaults() {
    local object_name="$1"
    
    echo -e "${BLUE}Processing $object_name...${NC}"
    
    # Check if object exists
    if ! check_object_exists "$object_name"; then
        echo -e "${YELLOW}  ⚠ Object $object_name not found in org${NC}"
        return 1
    fi
    
    # Run validation analyzer
    if [ -f "$VALIDATION_ANALYZER" ]; then
        $VALIDATION_ANALYZER full "$object_name" >/dev/null 2>&1
        
        if [ -f "$CONFIG_DIR/safe_defaults_${object_name}.json" ]; then
            echo -e "${GREEN}  ✓ Safe defaults generated for $object_name${NC}"
            return 0
        else
            echo -e "${YELLOW}  ⚠ No validation rules found for $object_name${NC}"
            return 1
        fi
    else
        echo -e "${RED}  ✗ Validation analyzer not found${NC}"
        return 1
    fi
}

# Function to generate master defaults configuration
create_master_config() {
    local output_file="$CONFIG_DIR/master_safe_defaults.json"
    
    echo -e "${BLUE}Creating master configuration...${NC}"
    
    echo "{" > "$output_file"
    echo "  \"generated\": \"$(date -Iseconds)\"," >> "$output_file"
    echo "  \"objects\": {" >> "$output_file"
    
    local first=true
    
    # Process all default files
    for defaults_file in "$CONFIG_DIR"/safe_defaults_*.json; do
        [ -f "$defaults_file" ] || continue
        
        local object_name=$(basename "$defaults_file" | sed 's/safe_defaults_//' | sed 's/.json//')
        
        if [ "$first" = true ]; then
            first=false
        else
            echo "," >> "$output_file"
        fi
        
        echo -n "    \"$object_name\": " >> "$output_file"
        jq '.defaults' "$defaults_file" >> "$output_file"
    done
    
    echo "" >> "$output_file"
    echo "  }" >> "$output_file"
    echo "}" >> "$output_file"
    
    echo -e "${GREEN}✓ Master configuration created: $output_file${NC}"
}

# Function to generate quick reference
generate_quick_reference() {
    local output_file="$PROJECT_ROOT/docs/SAFE_DEFAULTS_REFERENCE.md"
    
    echo -e "${BLUE}Generating quick reference...${NC}"
    
    cat > "$output_file" << 'HEADER'
# Safe Defaults Quick Reference

Generated: DATE_PLACEHOLDER

## Overview

This document provides a quick reference for safe default values that bypass validation rules for common Salesforce objects.

## Objects with Safe Defaults

HEADER
    
    # Add each object's defaults
    for defaults_file in "$CONFIG_DIR"/safe_defaults_*.json; do
        [ -f "$defaults_file" ] || continue
        
        local object_name=$(basename "$defaults_file" | sed 's/safe_defaults_//' | sed 's/.json//')
        
        echo "### $object_name" >> "$output_file"
        echo "" >> "$output_file"
        echo "| Field | Safe Default | Notes |" >> "$output_file"
        echo "|-------|--------------|-------|" >> "$output_file"
        
        jq -r '.defaults | to_entries | .[] | "| " + .key + " | " + .value + " | |"' "$defaults_file" >> "$output_file"
        
        echo "" >> "$output_file"
        
        # Add validation rules info
        local rule_count=$(jq '.validationRules | length' "$defaults_file")
        echo "**Validation Rules:** $rule_count active rules" >> "$output_file"
        echo "" >> "$output_file"
    done
    
    # Add usage section
    cat >> "$output_file" << 'FOOTER'
## Usage

### Apply to Single Record
```bash
./scripts/bypass_[Object]_validation.sh your_data.csv
```

### Apply to Multiple Objects
```bash
for obj in Account Contact Opportunity; do
    ./scripts/bypass_${obj}_validation.sh data_${obj}.csv
done
```

### Check Safe Defaults
```bash
jq '.defaults' config/safe_defaults_[Object].json
```

## Regenerate Defaults

To regenerate safe defaults after validation rule changes:
```bash
./scripts/generate-safe-defaults.sh --refresh
```

## Notes

- Safe defaults are designed to pass validation rules, not business logic
- Always review generated data before production use
- Some defaults may need adjustment based on your org's configuration
- Picklist values marked as "__CHECK_PICKLIST__" need manual review
FOOTER
    
    # Replace placeholder
    sed -i "s/DATE_PLACEHOLDER/$(date)/g" "$output_file"
    
    echo -e "${GREEN}✓ Quick reference generated: $output_file${NC}"
}

# Function to refresh existing defaults
refresh_defaults() {
    echo -e "${CYAN}Refreshing existing safe defaults...${NC}"
    
    local refreshed=0
    
    for defaults_file in "$CONFIG_DIR"/safe_defaults_*.json; do
        [ -f "$defaults_file" ] || continue
        
        local object_name=$(basename "$defaults_file" | sed 's/safe_defaults_//' | sed 's/.json//')
        
        # Delete old file
        rm "$defaults_file"
        
        # Regenerate
        if generate_object_defaults "$object_name"; then
            ((refreshed++))
        fi
    done
    
    echo -e "${GREEN}✓ Refreshed $refreshed object configurations${NC}"
}

# Function to analyze all objects in org
analyze_org_objects() {
    echo -e "${BLUE}Analyzing all objects in org...${NC}"
    
    # Get all custom objects
    local custom_objects=$(sf sobject list --sobject-type custom --json 2>/dev/null | jq -r '.result[].name')
    
    local total=0
    local with_rules=0
    
    echo "$custom_objects" | while read -r object; do
        [ -z "$object" ] && continue
        ((total++))
        
        echo -n "  Checking $object... "
        
        # Check for validation rules
        local rules=$(sf data query --query "SELECT COUNT() FROM ValidationRule WHERE EntityDefinition.QualifiedApiName='$object' AND Active=true" --use-tooling-api --json 2>/dev/null | jq -r '.result.totalSize')
        
        if [ "$rules" -gt 0 ]; then
            echo -e "${YELLOW}$rules validation rules found${NC}"
            ((with_rules++))
        else
            echo "no validation rules"
        fi
    done
    
    echo -e "\n${CYAN}Summary:${NC}"
    echo "  Total custom objects: $total"
    echo "  Objects with validation rules: $with_rules"
}

# Main execution
main() {
    echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║   SAFE DEFAULTS GENERATOR              ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
    echo ""
    
    local mode="${1:-standard}"
    
    case "$mode" in
        standard)
            echo -e "${CYAN}Generating safe defaults for standard objects...${NC}"
            local processed=0
            local successful=0
            
            for object in "${STANDARD_OBJECTS[@]}"; do
                ((processed++))
                if generate_object_defaults "$object"; then
                    ((successful++))
                fi
            done
            
            echo -e "\n${GREEN}Processed: $processed objects${NC}"
            echo -e "${GREEN}Successful: $successful objects${NC}"
            ;;
            
        custom)
            echo -e "${CYAN}Generating safe defaults for custom objects...${NC}"
            
            if [ ${#CUSTOM_OBJECTS[@]} -eq 0 ]; then
                echo -e "${YELLOW}No custom objects configured${NC}"
                echo "Edit this script to add your custom objects"
            else
                for object in "${CUSTOM_OBJECTS[@]}"; do
                    generate_object_defaults "$object"
                done
            fi
            ;;
            
        all)
            echo -e "${CYAN}Generating safe defaults for all objects...${NC}"
            
            # Process standard objects
            for object in "${STANDARD_OBJECTS[@]}"; do
                generate_object_defaults "$object"
            done
            
            # Process custom objects
            for object in "${CUSTOM_OBJECTS[@]}"; do
                generate_object_defaults "$object"
            done
            ;;
            
        refresh|--refresh)
            refresh_defaults
            ;;
            
        analyze)
            analyze_org_objects
            ;;
            
        specific)
            if [ -z "$2" ]; then
                echo -e "${RED}Please specify object name${NC}"
                exit 1
            fi
            generate_object_defaults "$2"
            ;;
            
        *)
            echo "Usage: $0 {standard|custom|all|refresh|analyze|specific <object>}"
            echo ""
            echo "Modes:"
            echo "  standard       - Generate for standard objects"
            echo "  custom         - Generate for custom objects"
            echo "  all            - Generate for all configured objects"
            echo "  refresh        - Refresh existing configurations"
            echo "  analyze        - Analyze all objects in org"
            echo "  specific <obj> - Generate for specific object"
            exit 1
            ;;
    esac
    
    # Create master config if any defaults exist
    if ls "$CONFIG_DIR"/safe_defaults_*.json >/dev/null 2>&1; then
        create_master_config
        generate_quick_reference
        
        echo -e "\n${BLUE}═══ Summary ═══${NC}"
        echo "Default configurations: $(ls -1 "$CONFIG_DIR"/safe_defaults_*.json 2>/dev/null | wc -l)"
        echo "Master config: $CONFIG_DIR/master_safe_defaults.json"
        echo "Quick reference: $PROJECT_ROOT/docs/SAFE_DEFAULTS_REFERENCE.md"
    fi
}

# Run main function
main "$@"