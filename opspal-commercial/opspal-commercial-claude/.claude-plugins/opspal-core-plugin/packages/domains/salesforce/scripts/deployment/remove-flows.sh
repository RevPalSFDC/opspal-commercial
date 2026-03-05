#!/bin/bash

# Two-Phase Flow Removal Script
# Implements the required process: Phase 1 - Deactivate, Phase 2 - Delete
#
# Usage:
#   ./remove-flows.sh [org-alias] [flow1] [flow2] ...
#   ./remove-flows.sh myorg "Lead_Assignment_v2" "Opportunity_Update_v1"
#
# Options:
#   --force         Skip confirmation prompts
#   --by-label      Use MasterLabel instead of DeveloperName
#   --list          List flows before removal
#   --dry-run       Show what would be removed without executing

set -e

# Parse arguments
ORG_ALIAS=""
FLOWS=()
FORCE=false
BY_LABEL=false
LIST_FIRST=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --force)
            FORCE=true
            shift
            ;;
        --by-label)
            BY_LABEL=true
            shift
            ;;
        --list)
            LIST_FIRST=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        *)
            if [ -z "$ORG_ALIAS" ]; then
                ORG_ALIAS="$1"
            else
                FLOWS+=("$1")
            fi
            shift
            ;;
    esac
done

# Set defaults
if [ -z "$ORG_ALIAS" ]; then
    ORG_ALIAS="${SF_TARGET_ORG:-myorg}"
fi

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
LIB_DIR="${SCRIPT_DIR}/../lib"

echo "================================================"
echo " Two-Phase Flow Removal Process"
echo "================================================"
echo "Org: $ORG_ALIAS"
echo "Mode: $([ "$BY_LABEL" = true ] && echo "By MasterLabel" || echo "By DeveloperName")"
echo "Dry Run: $DRY_RUN"
echo ""

# List flows if requested
if [ "$LIST_FIRST" = true ]; then
    echo "Listing all flows in org..."
    echo "----------------------------------------"
    
    if [ -f "$LIB_DIR/flow-removal-manager.js" ]; then
        node "$LIB_DIR/flow-removal-manager.js" list --org "$ORG_ALIAS"
    else
        sf data query --query "SELECT Definition.DeveloperName, MasterLabel, Status FROM Flow WHERE Status != 'Obsolete' ORDER BY MasterLabel" --use-tooling-api --target-org "$ORG_ALIAS"
    fi
    
    echo ""
    
    if [ ${#FLOWS[@]} -eq 0 ]; then
        echo "No flows specified for removal. Exiting."
        exit 0
    fi
fi

# If no flows specified, prompt for them
if [ ${#FLOWS[@]} -eq 0 ]; then
    echo "No flows specified."
    echo ""
    echo "Usage: $0 [org-alias] [flow1] [flow2] ..."
    echo "Example: $0 myorg \"Lead_Assignment_v2\" \"Opportunity_Update_v1\""
    echo ""
    echo "Options:"
    echo "  --force      Skip confirmation prompts"
    echo "  --by-label   Use MasterLabel instead of DeveloperName"
    echo "  --list       List flows before removal"
    echo "  --dry-run    Show what would be removed without executing"
    exit 1
fi

# Display flows to be removed
echo "Flows to remove:"
for FLOW in "${FLOWS[@]}"; do
    echo "  - $FLOW"
done
echo ""

# Confirmation unless forced
if [ "$FORCE" = false ] && [ "$DRY_RUN" = false ]; then
    read -p "Proceed with removal? This cannot be undone! (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Cancelled."
        exit 0
    fi
fi

# Use flow-removal-manager if available
if [ -f "$LIB_DIR/flow-removal-manager.js" ]; then
    echo ""
    echo "Using flow-removal-manager for safe two-phase removal..."
    echo "=========================================="
    
    SUCCESS_COUNT=0
    FAIL_COUNT=0
    
    for FLOW in "${FLOWS[@]}"; do
        echo ""
        echo "Processing: $FLOW"
        echo "----------------------------------------"
        
        if [ "$DRY_RUN" = true ]; then
            echo "[DRY RUN] Would remove: $FLOW"
            ((SUCCESS_COUNT++))
        else
            # Prepare command
            CMD="node \"$LIB_DIR/flow-removal-manager.js\" remove"
            
            if [ "$BY_LABEL" = true ]; then
                # First need to find DeveloperName from label
                echo "Finding DeveloperName for label: $FLOW"
                CMD="node \"$LIB_DIR/flow-deactivator.js\" --label \"$FLOW\" --org \"$ORG_ALIAS\""
            else
                CMD="$CMD --flow \"$FLOW\""
            fi
            
            CMD="$CMD --org \"$ORG_ALIAS\""
            
            if [ "$FORCE" = true ]; then
                CMD="$CMD --force"
            fi
            
            # Execute removal
            if eval "$CMD"; then
                echo "✅ Successfully removed: $FLOW"
                ((SUCCESS_COUNT++))
            else
                echo "❌ Failed to remove: $FLOW"
                ((FAIL_COUNT++))
            fi
        fi
    done
    
    echo ""
    echo "=========================================="
    echo "Summary:"
    echo "  Processed: ${#FLOWS[@]} flows"
    echo "  Successful: $SUCCESS_COUNT"
    echo "  Failed: $FAIL_COUNT"
    
else
    echo "Warning: flow-removal-manager.js not found."
    echo "Using manual two-phase process..."
    echo ""
    
    # Manual Phase 1: Deactivate
    echo "=== Phase 1: Deactivating Flows ==="
    
    for FLOW in "${FLOWS[@]}"; do
        echo "Deactivating: $FLOW"
        
        if [ "$DRY_RUN" = true ]; then
            echo "  [DRY RUN] Would deactivate"
        else
            if [ -f "$LIB_DIR/flow-deactivator.js" ]; then
                if [ "$BY_LABEL" = true ]; then
                    node "$LIB_DIR/flow-deactivator.js" --label "$FLOW" --org "$ORG_ALIAS" || true
                else
                    node "$LIB_DIR/flow-deactivator.js" --flow "$FLOW" --org "$ORG_ALIAS" || true
                fi
            else
                # Manual deactivation
                mkdir -p temp-deactivate/flows
                
                cat > "temp-deactivate/flows/${FLOW}.flow-meta.xml" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <status>Inactive</status>
</Flow>
EOF
                
                sf project deploy start --source-dir "temp-deactivate/flows" --target-org "$ORG_ALIAS" --wait 10 || true
                rm -rf temp-deactivate
            fi
        fi
    done
    
    if [ "$DRY_RUN" = false ]; then
        echo ""
        echo "Waiting for deactivation to process..."
        sleep 3
    fi
    
    # Manual Phase 2: Delete
    echo ""
    echo "=== Phase 2: Deleting Flows ==="
    
    if [ "$DRY_RUN" = true ]; then
        echo "[DRY RUN] Would create destructive changes for:"
        for FLOW in "${FLOWS[@]}"; do
            echo "  - $FLOW"
        done
    else
        mkdir -p manifest
        
        # Create destructive changes
        cat > manifest/destructiveChanges.xml << EOF
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
EOF
        
        for FLOW in "${FLOWS[@]}"; do
            echo "        <members>$FLOW</members>" >> manifest/destructiveChanges.xml
        done
        
        cat >> manifest/destructiveChanges.xml << EOF
        <name>Flow</name>
    </types>
    <version>62.0</version>
</Package>
EOF
        
        # Create empty package
        cat > manifest/package.xml << EOF
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <version>62.0</version>
</Package>
EOF
        
        echo "Deploying destructive changes..."
        sf project deploy start \
            --manifest manifest/package.xml \
            --post-destructive-changes manifest/destructiveChanges.xml \
            --target-org "$ORG_ALIAS" \
            --wait 10
        
        # Cleanup
        rm -rf manifest
    fi
fi

echo ""
echo "Process completed!"
echo ""

if [ "$DRY_RUN" = false ]; then
    echo "💡 Tips:"
    echo "  - Check Salesforce UI to verify removal"
    echo "  - If flows still exist, they may be referenced by other metadata"
    echo "  - Use --list option to see remaining flows"
fi