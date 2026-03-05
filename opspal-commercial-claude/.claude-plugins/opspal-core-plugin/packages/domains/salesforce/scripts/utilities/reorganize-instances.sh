#!/bin/bash

# Script to reorganize Salesforce instance files into proper directories

echo "======================================================================"
echo "🔧 Reorganizing Salesforce Instance Files"
echo "======================================================================"

# Create instance directories
echo "Creating instance directory structure..."
mkdir -p instances/sample-org-sandbox
mkdir -p instances/example-company-sandbox
mkdir -p instances/shared

# Identify and categorize files
echo ""
echo "Analyzing current files..."

# Check for DVM-related files (sample-org-specific)
echo "Identifying sample-org-specific files (DVM-related)..."
if [ -f "force-app/main/default/objects/Account/fields/Count_of_DVMs__c.field-meta.xml" ]; then
    echo "  ✓ Found DVM count field - sample-org component"
fi

# Check for Subscription object (needs verification of which instance)
if [ -d "force-app/main/default/objects/Subscription__c" ]; then
    echo "  ? Found Subscription__c object - needs instance verification"
fi

# Check for Contract fields
if [ -d "force-app/main/default/objects/Contract/fields" ]; then
    echo "  ? Found Contract fields - needs instance verification"
    ls force-app/main/default/objects/Contract/fields/
fi

# Check for Opportunity fields  
if [ -d "force-app/main/default/objects/Opportunity/fields" ]; then
    echo "  ? Found Opportunity fields - needs instance verification"
    ls force-app/main/default/objects/Opportunity/fields/
fi

# Check for example-company-specific files
echo ""
echo "Identifying example-company-specific files..."
ls -1 | grep -i example-company | head -10

# Check for flows
echo ""
echo "Checking flows..."
if [ -d "force-app/main/default/flows" ]; then
    echo "Found flows:"
    ls force-app/main/default/flows/ | head -10
fi

echo ""
echo "======================================================================"
echo "File Organization Plan:"
echo "======================================================================"
echo ""
echo "1. sample-org-Sandbox files:"
echo "   - DVM-related components (Count_of_DVMs__c)"
echo "   - DVM flows and rollups"
echo ""
echo "2. example-company-Sandbox files:"
echo "   - Asana integration files"
echo "   - example-company-specific search and task files"
echo ""
echo "3. Shared/Unknown:"
echo "   - Subscription__c object"
echo "   - Contract renewal fields"
echo "   - Opportunity revenue fields"
echo "   - Generic RevOps components"
echo ""
echo "Note: These shared components may belong to a specific instance"
echo "      or could be template components for both instances."
echo ""
echo "======================================================================"

# Create mapping file for reference
cat > instance-file-mapping.json << 'EOF'
{
  "sample-org-sandbox": {
    "description": "sample-org-specific components",
    "components": [
      "force-app/main/default/objects/Account/fields/Count_of_DVMs__c.field-meta.xml",
      "force-app/main/default/flows/DVM_Count_Rollup.flow-meta.xml",
      "force-app/main/default/flows/Update_DVM_Count_on_Contact_Change.flow-meta.xml"
    ]
  },
  "example-company-sandbox": {
    "description": "example-company-specific components",
    "components": [
      "example-company-*.json",
      "example-company-*.txt",
      "example-company-*.md",
      "search_rentable_*",
      "retrieve_rentable_*",
      "execute_rentable_*"
    ]
  },
  "unknown-instance": {
    "description": "Components that need instance verification",
    "components": [
      "force-app/main/default/objects/Subscription__c/*",
      "force-app/main/default/objects/Contract/fields/*",
      "force-app/main/default/objects/Opportunity/fields/*",
      "force-app/main/default/flows/Contract_*.flow-meta.xml",
      "force-app/main/default/flows/OLI_CreateSubscription.flow-meta.xml",
      "force-app/main/default/flows/Opp_ClosedWon_CreateContract.flow-meta.xml"
    ]
  }
}
EOF

echo "Created instance-file-mapping.json for reference"
echo ""
echo "Next steps:"
echo "1. Verify which instance owns the Subscription/Contract/Opportunity components"
echo "2. Move files to appropriate instance directories"
echo "3. Update deployment scripts to use instance-specific paths"
echo "4. Configure MCP settings per instance"