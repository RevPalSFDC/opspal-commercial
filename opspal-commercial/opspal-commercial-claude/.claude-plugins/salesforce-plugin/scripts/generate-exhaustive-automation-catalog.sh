#!/bin/bash

# Exhaustive Automation Catalog Generator for neonone
# This script queries ALL automation components directly from Salesforce

ORG_ALIAS="${1:-neonone}"
OUTPUT_DIR="./neonone-exhaustive-catalog-$(date +%Y%m%d)"
mkdir -p "$OUTPUT_DIR"

echo "═══════════════════════════════════════════════════════"
echo "Generating Exhaustive Automation Catalog for $ORG_ALIAS"
echo "Output Directory: $OUTPUT_DIR"
echo "═══════════════════════════════════════════════════════"

# 1. Query ALL Apex Triggers
echo -e "\n[1/7] Querying ALL Apex Triggers..."
sf data query --query "SELECT Id, Name, TableEnumOrId, Body, Status, IsValid, CreatedDate, LastModifiedDate, CreatedBy.Name, LastModifiedBy.Name FROM ApexTrigger WHERE NamespacePrefix = null ORDER BY TableEnumOrId, Name" --target-org "$ORG_ALIAS" --result-format json > "$OUTPUT_DIR/apex_triggers.json"

# 2. Query ALL Apex Classes
echo -e "\n[2/7] Querying ALL Apex Classes..."
sf data query --query "SELECT Id, Name, Body, Status, IsValid, LengthWithoutComments, CreatedDate, LastModifiedDate, CreatedBy.Name, LastModifiedBy.Name FROM ApexClass WHERE NamespacePrefix = null ORDER BY Name" --target-org "$ORG_ALIAS" --result-format json --wait 30 > "$OUTPUT_DIR/apex_classes.json"

# 3. Query ALL Flows (including Process Builders)
echo -e "\n[3/7] Querying ALL Flows and Process Builders..."
sf data query --query "SELECT Id, Definition.DeveloperName, MasterLabel, ProcessType, TriggerType, Status, VersionNumber, Description, LastModifiedDate, LastModifiedBy, IsActive, IsDeleted, IsOverridable, IsTemplate FROM Flow WHERE NamespacePrefix = null ORDER BY ProcessType, MasterLabel" --target-org "$ORG_ALIAS" --use-tooling-api --result-format json > "$OUTPUT_DIR/flows.json"

# 4. Query ALL Workflow Rules
echo -e "\n[4/7] Querying ALL Workflow Rules..."
sf data query --query "SELECT Id, Name, TableEnumOrId, Active, Description, Formula, LastModifiedDate, LastModifiedBy FROM WorkflowRule WHERE NamespacePrefix = null ORDER BY TableEnumOrId, Name" --target-org "$ORG_ALIAS" --use-tooling-api --result-format json > "$OUTPUT_DIR/workflow_rules.json"

# 5. Query ALL Validation Rules
echo -e "\n[5/7] Querying ALL Validation Rules..."
sf data query --query "SELECT Id, ValidationName, EntityDefinition.DeveloperName, Active, Description, ErrorDisplayField, ErrorMessage, ErrorConditionFormula FROM ValidationRule WHERE NamespacePrefix = null ORDER BY EntityDefinition.DeveloperName, ValidationName" --target-org "$ORG_ALIAS" --use-tooling-api --result-format json > "$OUTPUT_DIR/validation_rules.json"

# 6. Get list of all custom objects to ensure complete coverage
echo -e "\n[6/7] Getting all custom objects..."
sf data query --query "SELECT DeveloperName, Label FROM EntityDefinition WHERE IsCustomSetting = false AND IsCustomizable = true AND DeveloperName LIKE '%__c' ORDER BY DeveloperName" --target-org "$ORG_ALIAS" --use-tooling-api --result-format json > "$OUTPUT_DIR/custom_objects.json"

# 7. Count summary
echo -e "\n[7/7] Generating count summary..."
echo "Component Counts:" > "$OUTPUT_DIR/SUMMARY.txt"
echo "=================" >> "$OUTPUT_DIR/SUMMARY.txt"

TRIGGER_COUNT=$(jq '.result.totalSize' "$OUTPUT_DIR/apex_triggers.json" 2>/dev/null || echo "0")
CLASS_COUNT=$(jq '.result.totalSize' "$OUTPUT_DIR/apex_classes.json" 2>/dev/null || echo "0")
FLOW_COUNT=$(jq '.result.totalSize' "$OUTPUT_DIR/flows.json" 2>/dev/null || echo "0")
WORKFLOW_COUNT=$(jq '.result.totalSize' "$OUTPUT_DIR/workflow_rules.json" 2>/dev/null || echo "0")
VALIDATION_COUNT=$(jq '.result.totalSize' "$OUTPUT_DIR/validation_rules.json" 2>/dev/null || echo "0")
OBJECT_COUNT=$(jq '.result.totalSize' "$OUTPUT_DIR/custom_objects.json" 2>/dev/null || echo "0")

echo "Apex Triggers: $TRIGGER_COUNT" >> "$OUTPUT_DIR/SUMMARY.txt"
echo "Apex Classes: $CLASS_COUNT" >> "$OUTPUT_DIR/SUMMARY.txt"
echo "Flows/Process Builders: $FLOW_COUNT" >> "$OUTPUT_DIR/SUMMARY.txt"
echo "Workflow Rules: $WORKFLOW_COUNT" >> "$OUTPUT_DIR/SUMMARY.txt"
echo "Validation Rules: $VALIDATION_COUNT" >> "$OUTPUT_DIR/SUMMARY.txt"
echo "Custom Objects: $OBJECT_COUNT" >> "$OUTPUT_DIR/SUMMARY.txt"

echo -e "\nData collection complete!"
echo "Results saved to: $OUTPUT_DIR"
cat "$OUTPUT_DIR/SUMMARY.txt"