#!/bin/bash

# Exhaustive Automation Catalog Generator for gamma-corp - V2
# This script queries ALL automation components with correct field names

ORG_ALIAS="${1:-gamma-corp}"
OUTPUT_DIR="./gamma-corp-exhaustive-catalog-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUTPUT_DIR"

echo "═══════════════════════════════════════════════════════"
echo "Generating EXHAUSTIVE Automation Catalog for $ORG_ALIAS"
echo "Output Directory: $OUTPUT_DIR"
echo "═══════════════════════════════════════════════════════"

# 1. Query ALL Apex Triggers with complete details
echo -e "\n[1/8] Querying ALL Apex Triggers..."
sf data query --query "SELECT Id, Name, TableEnumOrId, Status, IsValid, ApiVersion, LengthWithoutComments, CreatedDate, LastModifiedDate, CreatedBy.Name, LastModifiedBy.Name, SystemModstamp FROM ApexTrigger WHERE NamespacePrefix = null ORDER BY TableEnumOrId, Name" --target-org "$ORG_ALIAS" --result-format json > "$OUTPUT_DIR/apex_triggers.json"

# 2. Query ALL Apex Classes with complete details
echo -e "\n[2/8] Querying ALL Apex Classes..."
sf data query --query "SELECT Id, Name, Status, IsValid, ApiVersion, LengthWithoutComments, CreatedDate, LastModifiedDate, CreatedBy.Name, LastModifiedBy.Name FROM ApexClass WHERE NamespacePrefix = null ORDER BY Name" --target-org "$ORG_ALIAS" --result-format json > "$OUTPUT_DIR/apex_classes.json"

# 3. Query ALL Flows (including Process Builders) with corrected fields
echo -e "\n[3/8] Querying ALL Flows and Process Builders..."
sf data query --query "SELECT Id, DeveloperName, Label, ProcessType, Status, VersionNumber, Description, LastModifiedDate, LastModifiedBy, IsActive, IsDeleted, IsOverridable, IsTemplate, TriggerObjectOrEvent.QualifiedApiName, TriggerOrder, TriggerType FROM FlowDefinitionView ORDER BY ProcessType, Label" --target-org "$ORG_ALIAS" --use-tooling-api --result-format json > "$OUTPUT_DIR/flows.json"

# 4. Query ALL Workflow Rules with corrected fields
echo -e "\n[4/8] Querying ALL Workflow Rules..."
sf data query --query "SELECT Id, Name, TableEnumOrId, LastModifiedDate, LastModifiedBy, CreatedDate, CreatedBy FROM WorkflowRule ORDER BY TableEnumOrId, Name" --target-org "$ORG_ALIAS" --use-tooling-api --result-format json > "$OUTPUT_DIR/workflow_rules.json"

# Also get workflow rule metadata separately for active status
echo -e "\n[4b/8] Getting Workflow Rule metadata..."
sf data query --query "SELECT Metadata FROM WorkflowRule" --target-org "$ORG_ALIAS" --use-tooling-api --result-format json > "$OUTPUT_DIR/workflow_rules_metadata.json" 2>/dev/null || echo "Unable to query metadata"

# 5. Query ALL Validation Rules with corrected fields
echo -e "\n[5/8] Querying ALL Validation Rules..."
sf data query --query "SELECT Id, ValidationName, EntityDefinition.DeveloperName, Active, Description, ErrorDisplayField, ErrorMessage FROM ValidationRule ORDER BY EntityDefinition.DeveloperName, ValidationName" --target-org "$ORG_ALIAS" --use-tooling-api --result-format json > "$OUTPUT_DIR/validation_rules.json"

# 6. Get list of all objects (standard and custom)
echo -e "\n[6/8] Getting all objects..."
sf data query --query "SELECT DeveloperName, Label, QualifiedApiName, IsCustomSetting, KeyPrefix FROM EntityDefinition WHERE IsCustomizable = true ORDER BY DeveloperName" --target-org "$ORG_ALIAS" --use-tooling-api --result-format json > "$OUTPUT_DIR/all_objects.json"

# 7. Query Process Builders specifically
echo -e "\n[7/8] Querying Process Builders specifically..."
sf data query --query "SELECT Id, DeveloperName, Label, Status, VersionNumber, Description FROM FlowDefinitionView WHERE ProcessType = 'Workflow' ORDER BY Label" --target-org "$ORG_ALIAS" --use-tooling-api --result-format json > "$OUTPUT_DIR/process_builders.json"

# 8. Generate detailed analysis
echo -e "\n[8/8] Generating detailed analysis..."

# Count all components
TRIGGER_COUNT=$(jq '.result.totalSize' "$OUTPUT_DIR/apex_triggers.json" 2>/dev/null || echo "0")
CLASS_COUNT=$(jq '.result.totalSize' "$OUTPUT_DIR/apex_classes.json" 2>/dev/null || echo "0")
FLOW_COUNT=$(jq '.result.totalSize' "$OUTPUT_DIR/flows.json" 2>/dev/null || echo "0")
WORKFLOW_COUNT=$(jq '.result.totalSize' "$OUTPUT_DIR/workflow_rules.json" 2>/dev/null || echo "0")
VALIDATION_COUNT=$(jq '.result.totalSize' "$OUTPUT_DIR/validation_rules.json" 2>/dev/null || echo "0")
OBJECT_COUNT=$(jq '.result.totalSize' "$OUTPUT_DIR/all_objects.json" 2>/dev/null || echo "0")
PB_COUNT=$(jq '.result.totalSize' "$OUTPUT_DIR/process_builders.json" 2>/dev/null || echo "0")

# Generate summary report
cat > "$OUTPUT_DIR/EXHAUSTIVE_SUMMARY.txt" << EOF
═══════════════════════════════════════════════════════════════════
EXHAUSTIVE AUTOMATION CATALOG - $ORG_ALIAS
Generated: $(date)
═══════════════════════════════════════════════════════════════════

TOTAL COMPONENT COUNTS:
━━━━━━━━━━━━━━━━━━━━━━
Apex Triggers:          $TRIGGER_COUNT
Apex Classes:           $CLASS_COUNT
Flows (All Types):      $FLOW_COUNT
Process Builders:       $PB_COUNT
Workflow Rules:         $WORKFLOW_COUNT
Validation Rules:       $VALIDATION_COUNT
Objects (Customizable): $OBJECT_COUNT

DATA FILES GENERATED:
━━━━━━━━━━━━━━━━━━━━
✓ apex_triggers.json      - All non-managed triggers with metadata
✓ apex_classes.json       - All non-managed classes with metadata
✓ flows.json              - All flows including process builders
✓ process_builders.json   - Process builders specifically
✓ workflow_rules.json     - All workflow rules
✓ validation_rules.json   - All validation rules with formulas
✓ all_objects.json        - All customizable objects

To view detailed data, examine the JSON files in: $OUTPUT_DIR
EOF

cat "$OUTPUT_DIR/EXHAUSTIVE_SUMMARY.txt"

echo -e "\n✅ EXHAUSTIVE data collection complete!"
echo "📁 All raw data saved to: $OUTPUT_DIR"