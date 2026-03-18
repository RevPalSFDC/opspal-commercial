# Pre-Deployment Checklist

## Mandatory Validation Steps

### Step 1: Deployment Source Structure

**File:** `scripts/lib/deployment-source-validator.js`

```bash
node scripts/lib/deployment-source-validator.js validate-source ./force-app
```

**Validates:**
- Package.xml exists and is valid XML
- Source directory structure matches Salesforce project format
- All referenced metadata types exist
- API versions are consistent

**Blocks deployment if:**
- Missing package.xml
- Invalid directory structure
- "No source-backed components present"

### Step 2: Flow XML Validation

**File:** `scripts/lib/flow-xml-validator.js`

```bash
# Validate all flows
for flow in force-app/main/default/flows/*.flow-meta.xml; do
  node scripts/lib/flow-xml-validator.js "$flow"
done

# Auto-fix common errors
node scripts/lib/flow-xml-validator.js <flow-file.xml> --fix
```

**Validates:**
- `.CurrentItem` accessor syntax (not `$CurrentItem`)
- No duplicate field assignments
- Valid element references
- Formula syntax (balanced parentheses)
- Loop collection references
- Decision logic completeness

**Example Output:**
```
❌ Flow validation failed
   ERROR: Invalid .CurrentItem syntax: "$CurrentItem"
   → Use {!loopVar.CurrentItem} not $CurrentItem

   🔧 Auto-fix available: Run with --fix flag
```

### Step 3: Field Dependency Analysis

**File:** `scripts/lib/metadata-dependency-analyzer.js`

```bash
# MANDATORY before deleting any field
node scripts/lib/metadata-dependency-analyzer.js <orgAlias> <objectName> <fieldName>
```

**Blocks deployment if field is referenced in:**
- ✅ Flows (assignments, formulas, screens, decisions)
- ✅ Validation Rules (formula references)
- ✅ Formula Fields (field dependencies)
- ✅ Page Layouts (field assignments)
- ✅ Process Builders (field criteria)
- ✅ Workflow Rules (field criteria)

**Example Output:**
```
❌ Cannot delete Account.CustomField__c - 3 active references
   1. Flow: Account_Validation
   2. ValidationRule: Email_Check
   3. FormulaField: Score__c
   → Must update metadata before field deletion
```

### Step 4: CSV Data Validation

**File:** `scripts/lib/csv-parser-safe.js`

```bash
node scripts/lib/csv-parser-safe.js <file.csv> --schema schema.json --strict
```

**Validates:**
- Header-based parsing (NOT positional indices)
- Schema compliance (required fields, data types)
- Line endings normalization
- UTF-8 BOM detection
- Missing value detection
- Column count verification

### Step 5: Field History Tracking Limits

**Query before adding tracked fields:**

```bash
sf data query --query "SELECT COUNT() FROM FieldDefinition
  WHERE EntityDefinition.QualifiedApiName = 'Account'
  AND IsFieldHistoryTracked = true" --use-tooling-api
```

**HARD LIMIT:** Max 20 fields per object. Deployment WILL FAIL if exceeded.

### Step 6: Picklist Formula Validation

**Validate formulas don't use incorrect picklist functions:**

```javascript
// ❌ WRONG - Will cause deployment failure
ISBLANK(Picklist_Field__c)
ISNULL(Picklist_Field__c)

// ✅ CORRECT
TEXT(Picklist_Field__c) = ""
```

## OOO Dependency Validation

**File:** `scripts/lib/ooo-dependency-enforcer.js`

```bash
node scripts/lib/ooo-dependency-enforcer.js validate package.xml myorg \
  --context deployment-context.json \
  --verbose
```

### The 5 Dependency Rules

**Rule 1: Flow/Trigger Field References**
- Blocks activation until all referenced fields verified
- Parses flow metadata, checks FieldDefinition for each reference

**Rule 2: Dependent Picklists**
- Controlling field must be set before dependent field
- Queries picklist dependency metadata, validates write order

**Rule 3: Record Type Write Order**
- RecordTypeId must be set FIRST when requirements differ
- Validates field availability for record type

**Rule 4: Master-Detail Parent Existence**
- Parent record must exist before child creation
- Queries parent object for ID existence

**Rule 5: Blocking Validation/Duplicate Rules**
- Detect active rules that would block write
- Don't mutate payload - just report

### Context File Format

```json
{
  "flows": [
    { "name": "MyFlow", "path": "./flows/MyFlow.flow-meta.xml" }
  ],
  "picklistWrites": [
    {
      "object": "Account",
      "controllingField": "Industry",
      "dependentField": "AccountType",
      "controllingSetFirst": true
    }
  ],
  "recordTypeWrites": [
    {
      "object": "Account",
      "recordTypeId": "012xxx",
      "fields": ["Name", "Industry"],
      "recordTypeSetFirst": true
    }
  ],
  "masterDetailFields": [
    {
      "childObject": "OrderItem__c",
      "fieldName": "Order__c",
      "parentObject": "Order__c",
      "parentId": "801xxx"
    }
  ]
}
```

## Flow Best Practices Validation

**File:** `scripts/lib/flow-best-practices-validator.js`

```javascript
const validator = new FlowBestPracticesValidator({
  flowPath: flow.path,
  verbose: true
});

const result = await validator.validate();

if (result.complianceScore < 70) {
  throw new Error(`Flow fails compliance (Score: ${result.complianceScore})`);
}

if (result.violations.some(v => v.severity === 'CRITICAL')) {
  throw new Error('CRITICAL Flow violations must be fixed');
}
```

### Anti-Patterns to Block

- ❌ DML operations inside loops (CRITICAL)
- ❌ SOQL queries inside loops (CRITICAL)
- ❌ Hard-coded Salesforce IDs (HIGH)
- ❌ Unnecessary Get Records (MEDIUM)
- ❌ Missing fault paths (MEDIUM)

### Minimum Requirements

- Compliance score >= 70/100
- Zero CRITICAL violations

## Complete Validation Pipeline

```bash
#!/bin/bash
# Enhanced deployment with comprehensive validation

# Gate 0: Comprehensive Pre-Deployment Validation
echo "🔒 Gate 0: Running comprehensive pre-deployment validation..."
bash hooks/pre-deployment-comprehensive-validation.sh
if [ $? -ne 0 ]; then
    echo "❌ Pre-deployment validation failed"
    exit 1
fi

# Gate 1: Dependency validation
echo "🔒 Gate 1: Validating dependencies..."
node scripts/lib/ooo-dependency-enforcer.js validate package.xml myorg \
    --context deployment-context.json --verbose
if [ $? -ne 0 ]; then
    echo "❌ Dependency validation failed"
    exit 1
fi

# Gate 2: Flow best practices
echo "🔒 Gate 2: Validating Flow best practices..."
for flow in force-app/main/default/flows/*.flow-meta.xml; do
    node scripts/lib/flow-best-practices-validator.js "$flow"
    if [ $? -ne 0 ]; then
        echo "❌ Flow validation failed: $flow"
        exit 1
    fi
done

# Proceed with deployment
echo "✅ All validations passed - proceeding to deployment"
sf project deploy start --manifest package.xml --target-org myorg
```
