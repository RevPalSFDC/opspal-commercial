# Runbook 3: Tools and Techniques

**Version**: 1.0.0
**Last Updated**: 2025-11-23
**Audience**: Salesforce Administrators, Developers

---

## Table of Contents

1. [Introduction](#introduction)
2. [Salesforce UI Tools](#salesforce-ui-tools)
3. [Metadata API](#metadata-api)
4. [Tooling API](#tooling-api)
5. [Salesforce CLI](#salesforce-cli)
6. [Formula Validation Techniques](#formula-validation-techniques)
7. [Testing Approaches](#testing-approaches)
8. [Deployment Strategies](#deployment-strategies)
9. [Automation Scripts](#automation-scripts)
10. [Quick Reference](#quick-reference)

---

## Introduction

This runbook covers the tools and techniques for creating, testing, and deploying validation rules efficiently. Choose the right tool for each task:

| Task | Best Tool | Why |
|------|-----------|-----|
| Create simple rule | Salesforce UI | Visual, intuitive |
| Bulk operations | Metadata API | Programmatic, repeatable |
| Query rule details | Tooling API | Fastest, most flexible |
| Test formula | Salesforce UI Builder | Real-time validation |
| Deploy rules | CLI + Metadata API | Version control, automation |
| Analyze complexity | Custom scripts | Automated scoring |

---

## Salesforce UI Tools

### Setup Interface

**Path**: Setup → Object Manager → [Object] → Validation Rules

**Capabilities**:
- Create/edit validation rules
- Activate/deactivate rules
- Test formulas in builder
- View rule history

**Best For**: Quick rule creation, testing, one-off changes

---

### Formula Builder

**Access**: When creating/editing validation rule → "Check Syntax" button

**Features**:
1. **Syntax Validation**: Real-time error checking
2. **Field Insertion**: Browse fields to avoid typos
3. **Function Reference**: Built-in documentation
4. **Test Evaluation**: Test formula with sample values

**Best Practice**: Always use "Insert Field" instead of typing field names manually

**Example Workflow**:
```
1. Click "Insert Field" → Browse to field
2. Write formula logic
3. Click "Check Syntax"
4. Fix any errors
5. Save rule
6. Test with real record
```

---

### Insert Field Helper

**Purpose**: Ensures correct API names, prevents typos

**Usage**:
```
1. Position cursor in formula
2. Click "Insert Field" button
3. Navigate object tree:
   - Current Object Fields
   - Related Object Fields (via lookup)
   - System Fields ($Profile, $User, etc.)
4. Select field → Inserts correct API name
```

**Example**:
```
Instead of typing: Account.Industry
Insert Field: {!Account.Industry} ← Correct API name
```

---

## Metadata API

### Retrieving Validation Rules

**Retrieve All Rules for Object**:

```xml
<!-- package.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>Opportunity.Require_Closed_Date_When_Won</members>
        <members>Opportunity.*</members>
        <name>ValidationRule</name>
    </types>
    <version>62.0</version>
</Package>
```

**CLI Command**:
```bash
sf project retrieve start \
  --metadata ValidationRule:Opportunity.* \
  --target-org myOrg
```

**Output Location**: `force-app/main/default/objects/Opportunity/validationRules/`

---

### Validation Rule XML Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ValidationRule xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Require_Closed_Date_When_Won</fullName>
    <active>true</active>
    <description>Require Closed Date when Stage is Closed Won per Sales Policy v2.3</description>
    <errorConditionFormula>AND(
  ISPICKVAL(StageName, &quot;Closed Won&quot;),
  ISBLANK(CloseDate)
)</errorConditionFormula>
    <errorDisplayField>CloseDate</errorDisplayField>
    <errorMessage>Closed Date is required when Stage is Closed Won. Please enter the date the deal closed.</errorMessage>
</ValidationRule>
```

**Key Elements**:
- `fullName`: API name (object name not included here)
- `active`: true/false
- `description`: Business requirement documentation
- `errorConditionFormula`: Formula (HTML-encoded: `&quot;` = `"`)
- `errorDisplayField`: Field API name (optional, blank = top of page)
- `errorMessage`: User-facing error text

---

### Deploying Validation Rules

**Single Rule Deployment**:

```bash
sf project deploy start \
  --source-dir force-app/main/default/objects/Opportunity/validationRules/Require_Closed_Date_When_Won.validationRule-meta.xml \
  --target-org myOrg
```

**Multiple Rules Deployment**:

```bash
sf project deploy start \
  --metadata ValidationRule:Opportunity.Require_Closed_Date_When_Won,ValidationRule:Opportunity.Validate_Discount_Threshold \
  --target-org myOrg
```

**All Rules for Object**:

```bash
sf project deploy start \
  --metadata ValidationRule:Opportunity.* \
  --target-org myOrg
```

---

### Backup Before Deployment

**Always backup existing rules before modifying**:

```bash
# Retrieve current rules
sf project retrieve start \
  --metadata ValidationRule:Opportunity.* \
  --target-org myOrg \
  --output-dir ./backup/validation-rules-$(date +%Y%m%d)
```

---

## Tooling API

### Query Validation Rules

**Get All Validation Rules for Object**:

```bash
sf data query \
  --query "SELECT Id, ValidationName, EntityDefinitionId, Active, ErrorDisplayField, ErrorMessage, Description FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = 'Opportunity' ORDER BY ValidationName" \
  --use-tooling-api \
  --target-org myOrg
```

**Get Active Rules Only**:

```bash
sf data query \
  --query "SELECT ValidationName, ErrorMessage, Active FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = 'Opportunity' AND Active = true" \
  --use-tooling-api \
  --target-org myOrg
```

**Get Rule Count Per Object**:

```bash
sf data query \
  --query "SELECT EntityDefinition.QualifiedApiName, COUNT(Id) ruleCount FROM ValidationRule GROUP BY EntityDefinition.QualifiedApiName ORDER BY COUNT(Id) DESC" \
  --use-tooling-api \
  --target-org myOrg
```

---

### Get Full Formula via Metadata

**Note**: Tooling API doesn't return full formula. Use Metadata API:

```bash
sf data query \
  --query "SELECT Id, ValidationName, Metadata FROM ValidationRule WHERE ValidationName = 'Require_Closed_Date_When_Won' AND EntityDefinition.QualifiedApiName = 'Opportunity'" \
  --use-tooling-api \
  --target-org myOrg
```

**Parse Metadata Field** (contains full formula):
```json
{
  "Metadata": {
    "errorConditionFormula": "AND(ISPICKVAL(StageName, \"Closed Won\"), ISBLANK(CloseDate))",
    "errorMessage": "Closed Date is required..."
  }
}
```

---

### Check Validation Rule Limit

```bash
# Count validation rules per object (max 500)
sf data query \
  --query "SELECT EntityDefinition.QualifiedApiName objectName, COUNT(Id) ruleCount FROM ValidationRule GROUP BY EntityDefinition.QualifiedApiName HAVING COUNT(Id) > 400" \
  --use-tooling-api \
  --target-org myOrg
```

**Warning Threshold**: >400 rules = approaching limit (500 hard max)

---

## Salesforce CLI

### Create Validation Rule via CLI

**Step 1: Create directory structure**:

```bash
mkdir -p force-app/main/default/objects/Opportunity/validationRules
```

**Step 2: Create XML file**:

```bash
cat > force-app/main/default/objects/Opportunity/validationRules/My_New_Rule.validationRule-meta.xml << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<ValidationRule xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>My_New_Rule</fullName>
    <active>true</active>
    <description>Business requirement here</description>
    <errorConditionFormula>ISBLANK(Required_Field__c)</errorConditionFormula>
    <errorDisplayField>Required_Field__c</errorDisplayField>
    <errorMessage>Required Field is required. Please enter Required Field.</errorMessage>
</ValidationRule>
EOF
```

**Step 3: Deploy**:

```bash
sf project deploy start \
  --source-dir force-app/main/default/objects/Opportunity/validationRules/My_New_Rule.validationRule-meta.xml \
  --target-org myOrg
```

---

### Update Existing Rule via CLI

**Step 1: Retrieve current rule**:

```bash
sf project retrieve start \
  --metadata ValidationRule:Opportunity.My_Rule \
  --target-org myOrg
```

**Step 2: Edit XML file**:

```bash
# Edit formula or error message
vi force-app/main/default/objects/Opportunity/validationRules/My_Rule.validationRule-meta.xml
```

**Step 3: Deploy changes**:

```bash
sf project deploy start \
  --source-dir force-app/main/default/objects/Opportunity/validationRules/My_Rule.validationRule-meta.xml \
  --target-org myOrg
```

---

### Deactivate Rule via CLI

**Option 1: Edit XML, set active=false, deploy**

**Option 2: Use script** (see Automation Scripts section)

---

## Formula Validation Techniques

### Syntax Validation

**Salesforce UI Method**:
1. Open formula builder
2. Write formula
3. Click "Check Syntax"
4. Fix errors
5. Repeat until syntax valid

**Common Syntax Errors**:
```
Error: "Incorrect number of parameters for function 'AND'"
Fix: Ensure all AND/OR have ≥2 arguments

Error: "Field does not exist: Field__c"
Fix: Check field API name, use Insert Field

Error: "')' expected"
Fix: Balance parentheses (count opening vs closing)
```

---

### Field Reference Validation

**Check All Fields Exist**:

```bash
# Extract fields from formula
grep -oE '[A-Z][a-zA-Z0-9_]*__[cr]' formula.txt | sort -u > fields.txt

# For each field, verify it exists
while read field; do
  sf sobject describe Opportunity --json | jq ".fields[] | select(.name==\"$field\")"
done < fields.txt
```

**Automated Field Check Script**: See Automation Scripts section

---

### Cross-Object Field Validation

**Verify Lookup Relationship Exists**:

```bash
# Check if Account lookup exists on Opportunity
sf sobject describe Opportunity --json | jq '.fields[] | select(.type=="reference") | {name, relationshipName, referenceTo}'
```

**Verify Parent Field Exists**:

```bash
# Check if Industry field exists on Account
sf sobject describe Account --json | jq '.fields[] | select(.name=="Industry")'
```

---

### Logic Testing

**Test Formula Logic with Sample Values**:

1. **Identify test scenarios**:
   - Should block: Closed Won + no Close Date
   - Should allow: Closed Won + has Close Date
   - Should allow: Other stages (any Close Date value)

2. **Create test records** (in sandbox):
   ```
   Record 1: Stage = Closed Won, CloseDate = null → Should error
   Record 2: Stage = Closed Won, CloseDate = 2025-12-31 → Should save
   Record 3: Stage = Qualification, CloseDate = null → Should save
   ```

3. **Verify behavior** matches expectations

---

## Testing Approaches

### Unit Testing (Per Rule)

**Test Cases for Each Rule**:
1. **Positive Test**: Record that should pass validation
2. **Negative Test**: Record that should fail validation
3. **Edge Cases**: Null values, boundary conditions

**Example Test Matrix**:

| Test | Stage | CloseDate | Expected Result |
|------|-------|-----------|-----------------|
| 1 | Closed Won | 2025-12-31 | ✅ Save |
| 2 | Closed Won | null | ❌ Error |
| 3 | Qualification | null | ✅ Save |
| 4 | Closed Lost | null | ✅ Save (rule doesn't apply) |

---

### Integration Testing (Multiple Rules)

**Test Interactions Between Rules**:
- Do multiple rules fire on same record?
- Are error messages clear when multiple rules fail?
- Do rules conflict (make record unsavable)?

**Example Conflict**:
```
Rule 1: "CloseDate required when Stage = Closed Won"
Rule 2: "CloseDate must be in future when Stage = Closed Won"

Conflict: If today's date is required Close Date, which rule fires?
```

**Resolution**: Review and consolidate conflicting rules

---

### Bulk Testing

**Test with 200 Records**:

```bash
# Create CSV with 200 test records
# Upload via Data Loader or Bulk API
# Verify all pass validation or fail with correct errors
```

**Purpose**: Ensure formula doesn't cause governor limit issues with bulk operations

---

### Impact Analysis Testing

**Before Deploying to Production**:

```bash
# Analyze how many existing records would violate new rule
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/validation-rule-impact-analyzer.js \
  --org myOrg \
  --object Opportunity \
  --formula "AND(ISPICKVAL(StageName, 'Closed Won'), ISBLANK(CloseDate))" \
  --sample-size 1000
```

**Output**:
```
Total Records: 5,420
Violating Records: 12 (0.22%)
Recommendation: Safe to deploy (violation rate <5%)
```

---

## Deployment Strategies

### Strategy 1: Direct Deployment (Simple Rules)

**Use When**:
- Rule is simple (<30 complexity)
- Impact analysis shows <1% violation rate
- Deploying to sandbox first

**Steps**:
1. Deploy rule as Active
2. Test with sample record
3. Monitor error logs for 24 hours
4. If issues, deactivate and fix

---

### Strategy 2: Staged Deployment (Complex Rules)

**Use When**:
- Rule is complex (>60 complexity)
- Impact analysis shows 5-20% violation rate
- High-visibility object (Opportunity, Account)

**Steps**:
1. Deploy rule as **Inactive**
2. Notify users of upcoming requirement
3. Provide grace period (1-2 weeks) for data cleanup
4. Run impact analysis again (should be <1%)
5. Activate rule
6. Monitor closely for 1 week

---

### Strategy 3: Profile-Filtered Deployment

**Use When**:
- Want to test with subset of users first
- Rolling out policy change gradually

**Steps**:
1. Create rule with profile filter:
   ```
   AND(
     $Profile.Name = "Pilot User Profile",
     [validation logic]
   )
   ```
2. Test with pilot group
3. Gather feedback
4. Remove profile filter to apply to all users

---

### Strategy 4: Record Type-Filtered Deployment

**Use When**:
- Rule applies to specific record types only
- Testing on one record type before expanding

**Steps**:
1. Create rule with record type filter:
   ```
   AND(
     ISPICKVAL(RecordType.DeveloperName, "PilotRecordType"),
     [validation logic]
   )
   ```
2. Test thoroughly
3. Expand to other record types via OR condition

---

## Automation Scripts

### Script 1: Validation Rule Complexity Calculator

**File**: `scripts/lib/validation-rule-complexity-calculator.js`

**Usage**:
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/validation-rule-complexity-calculator.js assess \
  --formula "AND(ISPICKVAL(Stage, 'Closed Won'), ISBLANK(CloseDate))"
```

**Output**:
```
Complexity Score: 25/100 (Simple)
Recommendation: Deploy directly
```

---

### Script 2: Validation Rule Impact Analyzer

**File**: `scripts/lib/validation-rule-impact-analyzer.js`

**Usage**:
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/validation-rule-impact-analyzer.js \
  --org myOrg \
  --object Opportunity \
  --formula "[formula]" \
  --sample-size 1000
```

**Output**:
```
Total Records: 5,420
Violating Records: 12 (0.22%)
Export: ./violating-records-20251123.csv
Recommendation: Safe to deploy
```

---

### Script 3: Validation Rule Batch Manager

**File**: `scripts/lib/validation-rule-batch-manager.js`

**Usage**:
```bash
# Deploy multiple rules in parallel
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/validation-rule-batch-manager.js deploy \
  --org myOrg \
  --rules "Opportunity.Rule1,Opportunity.Rule2,Account.Rule3" \
  --parallel 3
```

**Benefits**: 5x faster than sequential deployment

---

### Script 4: Formula Validator

**File**: `scripts/lib/validation-rule-formula-validator.js`

**Usage**:
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/validation-rule-formula-validator.js \
  --formula "AND(ISPICKVAL(Stage, 'Closed Won'), ISBLANK(CloseDate))" \
  --object Opportunity
```

**Checks**:
- Syntax valid
- All fields exist
- Correct field types (picklist, text, number)
- Parent relationships valid

---

## Quick Reference

### CLI Commands Cheatsheet

```bash
# Query validation rules
sf data query --query "SELECT ValidationName, Active FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = 'Opportunity'" --use-tooling-api

# Retrieve rules
sf project retrieve start --metadata ValidationRule:Opportunity.*

# Deploy rules
sf project deploy start --metadata ValidationRule:Opportunity.My_Rule

# Backup rules
sf project retrieve start --metadata ValidationRule:* --output-dir ./backup

# Count rules per object
sf data query --query "SELECT EntityDefinition.QualifiedApiName, COUNT(Id) FROM ValidationRule GROUP BY EntityDefinition.QualifiedApiName" --use-tooling-api
```

### Formula Validation Checklist

- ✅ Syntax valid (Check Syntax button)
- ✅ All fields exist (use Insert Field)
- ✅ Picklist fields use TEXT() not ISBLANK()
- ✅ Parent relationships null-checked
- ✅ Complexity score <60
- ✅ Error message <255 characters
- ✅ Tested with positive/negative cases
- ✅ Impact analysis complete
- ✅ Documented in rule description

### Deployment Checklist

- ✅ Tested in sandbox
- ✅ Impact analysis <5% violation rate
- ✅ Users notified (if applicable)
- ✅ Backup of existing rules taken
- ✅ Deployment strategy selected
- ✅ Error monitoring plan in place
- ✅ Rollback plan documented

---

## Next Steps

**Continue to Runbook 4**: [Validation and Best Practices](./04-validation-and-best-practices.md)

Learn validation best practices, anti-patterns to avoid, and optimization techniques.

---

**Related Runbooks**:
- [Runbook 5: Testing and Deployment](./05-testing-and-deployment.md)
- [Runbook 7: Troubleshooting](./07-troubleshooting.md)

**Related Scripts**:
- `validation-rule-complexity-calculator.js`
- `validation-rule-impact-analyzer.js`
- `validation-rule-formula-validator.js`

---

**Version History**:
- v1.0.0 (2025-11-23) - Initial release
