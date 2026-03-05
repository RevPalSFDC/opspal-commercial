# Runbook Context Loading - Detailed Guide

**Context Type**: Progressive Disclosure (loaded on-demand)
**Priority**: Medium
**Trigger**: When user message contains: `runbook`, `org-specific`, `load context`, `operational context`
**Estimated Tokens**: 1,944

---

## Overview

Dynamic runbook loading system that extracts org-specific operational context to prevent recurring metadata failures using historical knowledge. This system loads learned patterns from past operations to apply proven best practices and avoid known pitfalls.

**Key Benefits**:
- Prevents recurring metadata failures (15-30 minute troubleshooting cycles)
- Applies historical best practices automatically
- Detects known conflicts before deployment
- Context extraction: 50-100ms (negligible overhead)

---

## 🚨 CRITICAL: Runbook Context Loading (NEW - 2025-10-20)

**EVERY metadata operation MUST load runbook context BEFORE planning to prevent known metadata failures.**

### Pre-Operation Runbook Check

```bash
# Extract metadata-specific context
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/runbook-context-extractor.js \
    --org <org-alias> \
    --operation-type metadata \
    --format summary
```

**Use runbook context to prevent recurring metadata failures**:

### 1. Check Known Metadata Exceptions

```javascript
const { extractRunbookContext } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/runbook-context-extractor');

const context = extractRunbookContext(orgAlias, {
    operationType: 'metadata'
});

if (context.exists && context.knownExceptions.length > 0) {
    console.log('⚠️  Known metadata exceptions:');
    context.knownExceptions.forEach(ex => {
        if (ex.isRecurring && ex.name.toLowerCase().includes('metadata')) {
            console.log(`   🔴 RECURRING: ${ex.name}`);
            console.log(`      Context: ${ex.context}`);
            console.log(`      Recommendation: ${ex.recommendation}`);
        }
    });
}
```

**Common Metadata Exceptions from History**:
- **Metadata Conflicts**: Overlapping field modifications, duplicate field creation attempts
- **Schema Validation Errors**: Invalid field types, relationship constraints
- **FLS Configuration Issues**: Missing permission sets, incorrect field-level security
- **Picklist Value Conflicts**: Record type accessibility issues, value propagation delays
- **Master-Detail Limitations**: Relationship limits, propagation timing issues

### 2. Pre-Flight Metadata Validation Based on History

```javascript
// Check if org has known metadata quirks
if (context.knownRecommendations) {
    context.knownRecommendations.forEach(rec => {
        if (rec.includes('field history limit')) {
            console.log('⚠️  Known issue: Field history tracking limits');
            console.log('   Checking current tracked field count before deployment...');
            // Run pre-flight validation
        }
        if (rec.includes('validation rule')) {
            console.log('⚠️  Known issue: Validation rule conflicts');
            console.log('   Analyzing PRIORVALUE patterns and flow compatibility...');
            // Check validation rule compatibility
        }
        if (rec.includes('record type')) {
            console.log('⚠️  Known issue: Record type accessibility');
            console.log('   Verifying picklist values across all record types...');
            // Validate record type metadata
        }
    });
}
```

**Recommended Pre-Flight Checks**:
```bash
# Field history limit check (based on historical failures)
sf data query --query "
  SELECT COUNT(Id)
  FROM FieldDefinition
  WHERE EntityDefinition.QualifiedApiName = '<Object>'
  AND IsFieldHistoryTracked = true
" --use-tooling-api

# Validation rule conflict detection
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/validation-rule-impact-analyzer.js \
    --object <Object> \
    --check-priorvalue-patterns

# Record type metadata consistency
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/picklist-recordtype-validator.js verify \
    --object <Object> --field <Field> --org <org-alias>
```

### 3. Check Active Metadata Components

```javascript
// Check if metadata operation might impact active components
if (context.platformMetrics?.automation) {
    const { workflows, flows, validationRules } = context.platformMetrics.automation;

    console.log(`\n📊 Active Automation Context:`);
    console.log(`   Workflows: ${workflows} (may be impacted by field changes)`);
    console.log(`   Flows: ${flows} (check PRIORVALUE compatibility)`);
    console.log(`   Validation Rules: ${validationRules} (verify formula dependencies)`);

    // Apply impact analysis
    console.log(`\n🔍 Running metadata impact analysis...`);
}
```

### 4. Apply Historical Best Practices

```javascript
// Use proven metadata patterns from successful past operations
if (context.recommendations?.length > 0) {
    console.log('\n💡 Applying historical best practices:');
    context.recommendations.forEach(rec => {
        console.log(`   ✓ ${rec}`);
    });

    // Examples of applied practices:
    // - Always deploy fields with Permission Sets atomically (FLS-aware pattern)
    // - Validate picklist changes across ALL record types
    // - Wait 15-30 minutes after Master-Detail creation before layout deployment
    // - Exclude required fields from Permission Sets
    // - Check validation rule PRIORVALUE usage before Flow creation
}
```

### 5. Metadata Conflict Prevention

```javascript
// Check for known metadata conflicts before deployment
const objectsToModify = ['Account', 'Contact', 'Opportunity'];

objectsToModify.forEach(object => {
    const objectContext = extractRunbookContext(orgAlias, {
        operationType: 'metadata',
        objects: [object]
    });

    if (objectContext.knownExceptions?.some(ex => ex.name.includes('conflict'))) {
        console.log(`⚠️  Object ${object} has historical metadata conflicts`);
        console.log(`   Running pre-deployment conflict detection...`);

        // Run conflict detection before deployment
        execSync(`node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/metadata-conflict-detector.js scan \
            --object ${object} --org ${orgAlias}`);
    }
});
```

---

## Workflow Impact

**Before Any Metadata Operation**:
1. Load runbook context (1-2 seconds)
2. Check known metadata exceptions (prevents recurring errors)
3. Apply historical recommendations (use proven patterns)
4. Run suggested pre-flight validations (catch issues early)
5. Proceed with metadata operation (with context-aware execution)

---

## Integration with Existing Validation

Runbook context **complements** existing validation framework:

```javascript
// Existing validation framework (comprehensive pre-deployment checks)
await validateMetadataDesign(object, field);

// NEW: Runbook context (historical knowledge and patterns)
const context = extractRunbookContext(orgAlias, {
    operationType: 'metadata',
    objects: [object]
});

// Combined approach: Structural validation + historical learning
if (context.exists) {
    applyHistoricalRecommendations(context.recommendations);
    checkKnownExceptions(context.knownExceptions);
}
```

---

## Performance Impact

- **Context Extraction**: 50-100ms (negligible)
- **Exception Checking**: 10-20ms
- **Benefit**: Prevents 15-30 minute troubleshooting cycles and failed deployments

**ROI**: Minimal performance cost, significant time savings from prevented failures.

---

## Example: Field Deployment with Runbook Context

```javascript
const { extractRunbookContext } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/runbook-context-extractor');
const FLSAwareFieldDeployer = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/fls-aware-field-deployer');

// Load historical context
const context = extractRunbookContext(orgAlias, {
    operationType: 'metadata',
    objects: ['Account']
});

// Check for known field deployment issues
if (context.knownExceptions?.some(ex => ex.name.includes('FLS'))) {
    console.log('⚠️  Historical FLS configuration issues detected');
    console.log('   Using atomic FLS-aware deployment pattern...');
}

// Deploy with FLS-aware pattern (learned from past failures)
const deployer = new FLSAwareFieldDeployer({ orgAlias });
await deployer.deployFieldWithFLS('Account', fieldMetadata);

console.log('✅ Field deployed using proven historical pattern');
```

---

## Documentation References

- **User Guide**: `docs/LIVING_RUNBOOK_SYSTEM.md`
- **Integration Guide**: `docs/AGENT_RUNBOOK_INTEGRATION.md`
- **Context Extractor**: `scripts/lib/runbook-context-extractor.js`

---

**When This Context is Loaded**: When user message contains keywords: `runbook`, `operational context`, `org-specific`, `load context`, `runbook context`, `instance context`, `org runbook`, `operational playbook`

**Back to Core Agent**: See `agents/sfdc-metadata-manager.md` for overview and other metadata management patterns.

**Related Contexts**: None (standalone system)

---

**Context File**: `contexts/metadata-manager/runbook-context-loading.md`
**Lines**: 216 (original agent lines 423-639)
**Priority**: Medium
**Related Scripts**: `scripts/lib/runbook-context-extractor.js`
