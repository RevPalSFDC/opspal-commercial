# Dependency Analysis

## MANDATORY Pre-Deletion Analysis

**CRITICAL**: Before deleting ANY field or metadata component, MUST analyze ALL dependencies to prevent deployment failures and data loss.

### Analyzer Usage

```javascript
const MetadataDependencyAnalyzer = require('./scripts/lib/metadata-dependency-analyzer');

const analyzer = new MetadataDependencyAnalyzer(orgAlias, { verbose: true });
const dependencies = await analyzer.analyzeField('Account', 'Status__c');

if (!dependencies.canDelete) {
    console.error('❌ Cannot delete field - active dependencies found:');
    console.error(`   Total References: ${dependencies.totalReferences}`);

    dependencies.blockers.forEach(blocker => {
        console.error(`   🚫 ${blocker.type}: ${blocker.name}`);
        console.error(`      Issue: ${blocker.message}`);
        console.error(`      Action: ${blocker.action}`);
    });

    throw new Error('Field has active dependencies - cannot delete');
}
```

### CLI Usage

```bash
# Basic analysis
node scripts/lib/metadata-dependency-analyzer.js \
  --org <org-alias> \
  --object Account \
  --field Status__c

# Verbose output
node scripts/lib/metadata-dependency-analyzer.js \
  --org <org-alias> \
  --object Account \
  --field CustomField__c \
  --verbose

# JSON report for documentation
node scripts/lib/metadata-dependency-analyzer.js \
  --org <org-alias> \
  --object Opportunity \
  --field RenewalDate__c \
  --output-format json > dependency-report.json
```

## Dependency Categories

### Flow References
```javascript
if (dependencies.references.flows.length > 0) {
    console.log('🌊 Flow References:');
    dependencies.references.flows.forEach(flow => {
        console.log(`   - ${flow.name} (${flow.risk} risk)`);
        if (flow.referenceType) {
            console.log(`     Used in: ${flow.referenceType.join(', ')}`);
        }
    });
}
```

### Validation Rules
```javascript
if (dependencies.references.validationRules.length > 0) {
    console.log('⚠️ Validation Rule References:');
    dependencies.references.validationRules.forEach(rule => {
        console.log(`   - ${rule.name} (${rule.risk} risk)`);
        if (rule.formula) {
            console.log(`     Formula: ${rule.formula.substring(0, 100)}...`);
        }
    });
}
```

### Formula Fields
```javascript
if (dependencies.references.formulaFields.length > 0) {
    console.log('🧮 Formula Field References:');
    dependencies.references.formulaFields.forEach(field => {
        console.log(`   - ${field.name} (${field.risk} risk)`);
    });
}
```

### Page Layouts
```javascript
if (dependencies.references.layouts.length > 0) {
    console.log('📄 Page Layout References:');
    dependencies.references.layouts.forEach(layout => {
        console.log(`   - ${layout.name}`);
    });
}
```

### Process Builders & Workflow Rules
```javascript
if (dependencies.references.processBuilders.length > 0) {
    console.log('⚙️ Process Builder References:');
    dependencies.references.processBuilders.forEach(pb => {
        console.log(`   - ${pb.name}`);
    });
}

if (dependencies.references.workflowRules.length > 0) {
    console.log('📋 Workflow Rule References:');
    dependencies.references.workflowRules.forEach(rule => {
        console.log(`   - ${rule.name}`);
    });
}
```

## Key Features

- **Flow Reference Detection**: Queries FlowDefinitionView for active flows
- **Formula Field Analysis**: Checks all formula fields for references
- **Validation Rule Analysis**: Analyzes validation rule formulas
- **Page Layout Analysis**: Checks all layouts for field assignments
- **Process Builder Detection**: Identifies Process Builders using field
- **Workflow Rule Detection**: Finds workflow rules with field criteria
- **Comprehensive Reporting**: Detailed reports with remediation steps
