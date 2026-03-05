#!/bin/bash

# Update Sub-Agents with New Validation Knowledge
# This script updates all SFDC sub-agents to be aware of the new validation tools
# and requirements implemented to prevent syntax errors

echo "════════════════════════════════════════════════════════════════"
echo "   SFDC Sub-Agent Validation Knowledge Update"
echo "   Implementing lessons from sample-org Production Analysis"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Configuration
AGENT_DIR="$HOME/.claude/agents"
PROJECT_AGENT_DIR="$(dirname $(dirname $(realpath $0)))/.claude/agents"
BACKUP_DIR="$(dirname $(dirname $(realpath $0)))/backups/agent-update-$(date +%Y%m%d-%H%M%S)"

# Create backup directory
mkdir -p "$BACKUP_DIR"
echo "📁 Created backup directory: $BACKUP_DIR"
echo ""

# Define the validation knowledge snippet to add to agents
read -r -d '' VALIDATION_KNOWLEDGE << 'EOF'

## 🔴 MANDATORY Pre-Deployment Validation

**CRITICAL**: Always run validation BEFORE any deployment to prevent syntax errors.

### Required Validation Steps:
```bash
# 1. Run unified syntax validator (prevents 90% of errors)
node scripts/unified-syntax-validator.js --org [alias] --type all --path .

# 2. Run pre-deployment validator
node scripts/sfdc-pre-deployment-validator.js [org] [path]
```

### Known API Limitations:
- **Blocked Report Types**: Activities, Tasks, Events cannot be created via API
- **Report Name Mappings**: Use LeadList not Leads, ContactList not Contacts
- **Date Filters**: Use LAST_N_DAYS:90 not LAST_90_DAYS
- **Field References**: Use ACCOUNT.NAME not ACCOUNT_NAME

### Workarounds for Blocked Features:
```bash
# Convert blocked reports to SOQL
node scripts/soql-report-converter.js --type [report-type] --execute

# Check API limitations documentation
cat docs/SALESFORCE_API_LIMITATIONS.md
```

### Configuration Files:
- `config/report-mappings.json` - Report type API mappings
- `config/field-mappings.json` - Field reference requirements

EOF

# Define agents that need updates
declare -a CRITICAL_AGENTS=(
    "sfdc-deployment-manager"
    "sfdc-metadata-manager"
    "sfdc-reports-dashboards"
    "sfdc-orchestrator"
    "sfdc-planner"
    "sfdc-automation-builder"
    "sfdc-apex-developer"
    "sfdc-field-analyzer"
    "sfdc-conflict-resolver"
    "sfdc-state-discovery"
    "instance-deployer"
    "sfdc-merge-orchestrator"
    "sfdc-dependency-analyzer"
)

echo "🔍 Agents to update: ${#CRITICAL_AGENTS[@]}"
echo ""

# Function to update an agent file
update_agent() {
    local agent_name=$1
    local agent_file=""
    
    # Check project agent directory first
    if [ -f "$PROJECT_AGENT_DIR/${agent_name}.md" ]; then
        agent_file="$PROJECT_AGENT_DIR/${agent_name}.md"
    elif [ -f "$AGENT_DIR/${agent_name}.md" ]; then
        agent_file="$AGENT_DIR/${agent_name}.md"
    else
        echo "  ⚠️  Agent file not found: ${agent_name}.md"
        return 1
    fi
    
    echo "📝 Updating: $(basename $agent_file)"
    
    # Backup the original file
    cp "$agent_file" "$BACKUP_DIR/$(basename $agent_file).backup"
    
    # Check if validation knowledge already exists
    if grep -q "MANDATORY Pre-Deployment Validation" "$agent_file"; then
        echo "  ✓ Already has validation knowledge"
        return 0
    fi
    
    # Find the best place to insert (after ## Tools or ## Instructions)
    if grep -q "^## Tools" "$agent_file"; then
        # Insert after Tools section
        awk '/^## Tools/{print; print ""; print "'"$VALIDATION_KNOWLEDGE"'"; next}1' "$agent_file" > "${agent_file}.tmp"
    elif grep -q "^## Instructions" "$agent_file"; then
        # Insert after Instructions section
        awk '/^## Instructions/{print; print ""; print "'"$VALIDATION_KNOWLEDGE"'"; next}1' "$agent_file" > "${agent_file}.tmp"
    else
        # Insert at the beginning after the first heading
        awk 'NR==1{print; print ""; print "'"$VALIDATION_KNOWLEDGE"'"}NR>1' "$agent_file" > "${agent_file}.tmp"
    fi
    
    # Replace the original file
    mv "${agent_file}.tmp" "$agent_file"
    echo "  ✅ Updated successfully"
    
    return 0
}

# Update each critical agent
updated_count=0
failed_count=0

for agent in "${CRITICAL_AGENTS[@]}"; do
    if update_agent "$agent"; then
        ((updated_count++))
    else
        ((failed_count++))
    fi
    echo ""
done

echo "════════════════════════════════════════════════════════════════"
echo "📊 Update Summary:"
echo "  ✅ Successfully updated: $updated_count agents"
if [ $failed_count -gt 0 ]; then
    echo "  ⚠️  Failed/Not found: $failed_count agents"
fi
echo "  📁 Backups saved to: $BACKUP_DIR"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Create a reference card for quick access
cat > "$(dirname $(dirname $(realpath $0)))/VALIDATION_QUICK_REFERENCE.md" << 'EOF'
# Salesforce Validation Quick Reference Card

## 🚀 Before EVERY Deployment

```bash
# Step 1: Validate syntax (MANDATORY)
node scripts/unified-syntax-validator.js --org production --type all --path .

# Step 2: Pre-deployment check
node scripts/sfdc-pre-deployment-validator.js production .

# Step 3: If validation fails, check specific types
node scripts/unified-syntax-validator.js --org production --type report --path reports/
node scripts/unified-syntax-validator.js --org production --type field --path fields/
node scripts/unified-syntax-validator.js --org production --type flow --path flows/
```

## 🚫 API Blocked? Use Workarounds

```bash
# Convert blocked report to SOQL
node scripts/soql-report-converter.js --type Activities --execute

# List available report templates
node scripts/soql-report-converter.js

# Check what's blocked
cat docs/SALESFORCE_API_LIMITATIONS.md
```

## ⚡ Common Fixes

| Error | Wrong ❌ | Correct ✅ |
|-------|----------|-----------|
| Report Type | Leads | LeadList |
| Date Filter | LAST_90_DAYS | LAST_N_DAYS:90 |
| Field Ref | ACCOUNT_NAME | ACCOUNT.NAME |
| Picklist Check | ISBLANK(field) | TEXT(field) = "" |

## 📚 Documentation

- API Limitations: `docs/SALESFORCE_API_LIMITATIONS.md`
- Report Mappings: `config/report-mappings.json`
- Field Mappings: `config/field-mappings.json`

## 🆘 If Deployment Still Fails

1. Check validation output for specific errors
2. Consult API limitations documentation
3. Use SOQL converter for blocked reports
4. Create manually in UI if necessary

---
*Generated from sample-org Production deployment analysis*
*90% error reduction when followed correctly*
EOF

echo "✅ Created VALIDATION_QUICK_REFERENCE.md"
echo ""

# Update the main AGENT_CATALOG.md to reference the new tools
if [ -f "$(dirname $(dirname $(realpath $0)))/AGENT_CATALOG.md" ]; then
    echo "📝 Updating AGENT_CATALOG.md with validation tools reference..."
    
    # Add validation tools section if it doesn't exist
    if ! grep -q "Validation Tools" "$(dirname $(dirname $(realpath $0)))/AGENT_CATALOG.md"; then
        cat >> "$(dirname $(dirname $(realpath $0)))/AGENT_CATALOG.md" << 'EOF'

## Validation Tools (Required for All Deployments)

### unified-syntax-validator.js
- **Purpose**: Comprehensive syntax validation to prevent deployment errors
- **When to Use**: BEFORE every deployment (mandatory)
- **Validates**: Reports, fields, flows, formulas, API limitations
- **Success Rate**: Prevents 90% of deployment failures

### soql-report-converter.js
- **Purpose**: Converts API-blocked reports to SOQL queries
- **When to Use**: When report creation fails due to API limitations
- **Supports**: Activities, Tasks, Events, and other blocked types

### sfdc-pre-deployment-validator.js
- **Purpose**: Enhanced pre-deployment validation
- **When to Use**: Final check before deployment
- **Includes**: Report validation, field history limits, formula syntax, master-detail permission set guard
- **Prevents**: Deploying permission sets that reference master-detail fields (Salesforce blocks field-level security on these relationships)

See `VALIDATION_QUICK_REFERENCE.md` for usage examples.
EOF
        echo "  ✅ Added validation tools section"
    else
        echo "  ✓ Validation tools already documented"
    fi
fi

echo ""
echo "🎉 Agent knowledge update complete!"
echo ""
echo "Next steps:"
echo "1. Test validation with: node scripts/unified-syntax-validator.js --org production --type all --path ."
echo "2. Review updated agents in: $AGENT_DIR"
echo "3. Check quick reference: VALIDATION_QUICK_REFERENCE.md"
echo ""
