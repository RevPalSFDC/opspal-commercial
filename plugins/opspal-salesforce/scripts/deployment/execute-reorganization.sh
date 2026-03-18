#!/bin/bash

# Script to reorganize Salesforce files into proper instance directories

set -e

echo "======================================================================"
echo "🔄 Salesforce Instance File Reorganization"
echo "======================================================================"
echo ""

# Define paths
MAIN_DIR="${PROJECT_ROOT:-${PROJECT_ROOT:-/path/to/project}}"
BETA_CORP_DIR="/path/to/salesforce/sample-org-sandbox"
DELTA_CORP_DIR="/path/to/salesforce/example-company-sandbox"
BACKUP_DIR="${MAIN_DIR}/backup-$(date +%Y%m%d-%H%M%S)"

# Create backup
echo "📦 Creating backup..."
mkdir -p "$BACKUP_DIR"
cp -r force-app "$BACKUP_DIR/" 2>/dev/null || true
cp -r manifest "$BACKUP_DIR/" 2>/dev/null || true
echo "✅ Backup created at: $BACKUP_DIR"
echo ""

# Move sample-org-specific components
echo "🏢 Moving sample-org-specific components..."
echo "Target: $BETA_CORP_DIR"

# DVM field
if [ -f "force-app/main/default/objects/Account/fields/Count_of_DVMs__c.field-meta.xml" ]; then
    mkdir -p "$BETA_CORP_DIR/force-app/main/default/objects/Account/fields"
    cp "force-app/main/default/objects/Account/fields/Count_of_DVMs__c.field-meta.xml" \
       "$BETA_CORP_DIR/force-app/main/default/objects/Account/fields/"
    echo "  ✓ Moved Count_of_DVMs__c field"
fi

# DVM flows  
if [ -f "force-app/main/default/flows/DVM_Count_Rollup.flow-meta.xml" ]; then
    mkdir -p "$BETA_CORP_DIR/force-app/main/default/flows"
    cp "force-app/main/default/flows/DVM_Count_Rollup.flow-meta.xml" \
       "$BETA_CORP_DIR/force-app/main/default/flows/"
    echo "  ✓ Moved DVM_Count_Rollup flow"
fi

if [ -f "force-app/main/default/flows/Update_DVM_Count_on_Contact_Change.flow-meta.xml" ]; then
    cp "force-app/main/default/flows/Update_DVM_Count_on_Contact_Change.flow-meta.xml" \
       "$BETA_CORP_DIR/force-app/main/default/flows/"
    echo "  ✓ Moved Update_DVM_Count_on_Contact_Change flow"
fi

echo ""

# Move example-company-specific components
echo "🏢 Moving example-company-specific components..."
echo "Target: $DELTA_CORP_DIR"

# Move Subscription object
if [ -d "force-app/main/default/objects/Subscription__c" ]; then
    mkdir -p "$DELTA_CORP_DIR/force-app/main/default/objects"
    cp -r "force-app/main/default/objects/Subscription__c" \
          "$DELTA_CORP_DIR/force-app/main/default/objects/"
    echo "  ✓ Moved Subscription__c object"
fi

# Move Contract fields (RevOps-related, likely example-company)
if [ -d "force-app/main/default/objects/Contract/fields" ]; then
    mkdir -p "$DELTA_CORP_DIR/force-app/main/default/objects/Contract"
    # Only copy renewal/cohort fields
    for field in Contract_Cohort__c Next_Renewal_Date__c Renewal_Generated__c Source_Opportunity__c; do
        if [ -f "force-app/main/default/objects/Contract/fields/${field}.field-meta.xml" ]; then
            mkdir -p "$DELTA_CORP_DIR/force-app/main/default/objects/Contract/fields"
            cp "force-app/main/default/objects/Contract/fields/${field}.field-meta.xml" \
               "$DELTA_CORP_DIR/force-app/main/default/objects/Contract/fields/"
            echo "  ✓ Moved Contract.$field"
        fi
    done
fi

# Move Opportunity fields (RevOps-related, likely example-company)
if [ -d "force-app/main/default/objects/Opportunity/fields" ]; then
    mkdir -p "$DELTA_CORP_DIR/force-app/main/default/objects/Opportunity/fields"
    for field in force-app/main/default/objects/Opportunity/fields/*.field-meta.xml; do
        if [ -f "$field" ]; then
            cp "$field" "$DELTA_CORP_DIR/force-app/main/default/objects/Opportunity/fields/"
            echo "  ✓ Moved $(basename $field)"
        fi
    done
fi

# Move Contract/Opportunity flows
for flow in Contract_AssignCohort Contract_GenerateRenewal Contract_RenewalNotifications Contract_ValidateData OLI_CreateSubscription Opp_ClosedWon_CreateContract; do
    if [ -f "force-app/main/default/flows/${flow}.flow-meta.xml" ]; then
        mkdir -p "$DELTA_CORP_DIR/force-app/main/default/flows"
        cp "force-app/main/default/flows/${flow}.flow-meta.xml" \
           "$DELTA_CORP_DIR/force-app/main/default/flows/"
        echo "  ✓ Moved $flow flow"
    fi
done

# Move example-company-specific files in root
echo ""
echo "📄 Moving example-company-specific root files..."
mkdir -p "$DELTA_CORP_DIR/asana-integration"
for file in *example-company* *example-company*; do
    if [ -f "$file" ]; then
        mv "$file" "$DELTA_CORP_DIR/asana-integration/"
        echo "  ✓ Moved $file"
    fi
done

echo ""
echo "======================================================================"
echo "📊 Reorganization Summary"
echo "======================================================================"
echo ""
echo "✅ sample-org components moved to:"
echo "   $BETA_CORP_DIR"
echo ""
echo "✅ example-company components moved to:" 
echo "   $DELTA_CORP_DIR"
echo ""
echo "📦 Backup saved at:"
echo "   $BACKUP_DIR"
echo ""
echo "Next steps:"
echo "1. Update deployment scripts to use instance-specific paths"
echo "2. Configure MCP settings per instance"
echo "3. Test deployments to each instance"
echo ""
echo "======================================================================"