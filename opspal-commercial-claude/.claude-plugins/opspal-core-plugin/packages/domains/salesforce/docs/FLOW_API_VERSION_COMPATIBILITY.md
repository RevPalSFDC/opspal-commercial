# Flow API Version Compatibility Framework

**Version**: 1.0.0
**Status**: ✅ Production Ready
**Created**: 2025-10-24
**Addresses**: Cohort #3 - Flow API v65.0 Compatibility ($15k ROI)

## Overview

The Flow API Version Compatibility Framework prevents deployment failures from deprecated Flow patterns, specifically the v65.0 breaking change where `actionType='flow'` is no longer supported.

### The Problem

**Breaking Change in v65.0**: Salesforce removed support for `actionType='flow'` in actionCalls elements for autolaunched flows. Agents using old patterns cause deployment failures.

**Error Message**: `actionType value of 'flow' is not supported`

### The Solution

Automatic detection and migration of deprecated patterns:
- ✅ **Detects** deprecated actionType='flow' usage
- ✅ **Migrates** to subflows element automatically
- ✅ **Validates** API version compatibility
- ✅ **Prevents** deployment failures

---

## Quick Start

### 1. Validate Flow Compatibility

```bash
# Check if flow has deprecated patterns
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-api-version-validator.js validate \
  force-app/main/default/flows/MyFlow.flow-meta.xml

# Exit code:
#   0 - No issues found
#   1 - Deprecated patterns or errors found
```

### 2. Migrate Deprecated Patterns

```bash
# Automatically migrate single flow
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-pattern-migrator.js migrate \
  force-app/main/default/flows/MyFlow.flow-meta.xml

# Batch migrate all flows
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-pattern-migrator.js batch \
  "force-app/**/*.flow-meta.xml"
```

### 3. Programmatic Usage

```javascript
const FlowAPIVersionValidator = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-api-version-validator');
const FlowPatternMigrator = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-pattern-migrator');

// Validate
const validator = new FlowAPIVersionValidator();
const result = await validator.validate(flowPath);

if (!result.valid && result.migrationAvailable) {
    // Auto-migrate
    const migrator = new FlowPatternMigrator();
    const migration = await migrator.migrate(flowPath);

    if (migration.success) {
        console.log('✅ Flow migrated to v65.0+');
    }
}
```

---

## The Breaking Change (v64 → v65)

### What Changed

**v64.0 Pattern** (Deprecated):
```xml
<actionCalls>
    <name>InvokeSubFlow</name>
    <label>Invoke Sub Flow</label>
    <actionName>SubFlowToInvoke</actionName>
    <actionType>flow</actionType>
    <flowName>SubFlowToInvoke</flowName>
</actionCalls>
```

**v65.0+ Pattern** (Required):
```xml
<subflows>
    <name>InvokeSubFlow</name>
    <label>Invoke Sub Flow</label>
    <flowName>SubFlowToInvoke</flowName>
</subflows>
```

### Why It Matters

- **Affected Flows**: All autolaunched flows that invoke other flows
- **Error Impact**: Deployment fails with cryptic error message
- **Debug Time**: 2-3 hours per occurrence (from reflection data)
- **Frequency**: 2 occurrences in last 2 days

---

## Components

### 1. API Version Compatibility Matrix

**File**: `config/flow-api-version-compatibility.json`

**Contents**:
- Version history (v64, v65, v66)
- Breaking changes documentation
- Migration strategies
- Compatibility matrix
- Template library references
- CI/CD integration points

### 2. Deprecated Patterns Registry

**File**: `config/deprecated-flow-patterns.json`

**Contents**:
- Pattern definitions with detection regex
- Severity levels
- Migration strategies
- Auto-fix availability
- Examples (before/after)

### 3. Flow API Version Validator

**File**: `scripts/lib/flow-api-version-validator.js`

**Features**:
- Parses flow XML
- Extracts API version
- Scans for deprecated patterns
- Checks version-specific requirements
- Provides migration suggestions

### 4. Flow Pattern Migrator

**File**: `scripts/lib/flow-pattern-migrator.js`

**Features**:
- Auto-migrates actionType='flow' → subflows
- Adds missing API version declarations
- Creates automatic backups
- Batch migration support
- Statistics tracking

---

## Usage Examples

### Example 1: Pre-Deployment Validation

```javascript
// Before deploying flow
const validator = new FlowAPIVersionValidator({ verbose: true });

async function validateBeforeDeploy(flowPath) {
    const result = await validator.validate(flowPath);

    if (!result.valid) {
        console.error('❌ Flow validation failed');

        for (const error of result.errors) {
            console.error(`  ${error.message}`);
        }

        if (result.migrationAvailable) {
            console.log('💡 Auto-migration available - run migrator');
            return false; // Block deployment
        }
    }

    return result.valid;
}
```

### Example 2: Auto-Migration Workflow

```javascript
const validator = new FlowAPIVersionValidator();
const migrator = new FlowPatternMigrator({ createBackup: true });

async function deployFlowWithMigration(flowPath, orgAlias) {
    // Step 1: Validate
    const validation = await validator.validate(flowPath);

    // Step 2: Migrate if needed
    if (!validation.valid && validation.migrationAvailable) {
        console.log('🔧 Migrating deprecated patterns...');
        const migration = await migrator.migrate(flowPath);

        if (!migration.success) {
            throw new Error('Migration failed: ' + migration.errors.join(', '));
        }

        console.log('✅ Migration successful');
    }

    // Step 3: Deploy
    const { execSync } = require('child_process');
    execSync(`sf project deploy start --source-dir ${flowPath} --target-org ${orgAlias}`);

    console.log('✅ Flow deployed successfully');
}
```

### Example 3: CI/CD Integration

```bash
#!/bin/bash
# pre-deployment.sh

# Validate all flows before deployment
for flow in force-app/main/default/flows/*.flow-meta.xml; do
    echo "Validating $flow..."

    node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-api-version-validator.js validate "$flow"

    if [ $? -ne 0 ]; then
        echo "❌ Validation failed for $flow"
        echo "Run migration: node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-pattern-migrator.js migrate $flow"
        exit 1
    fi
done

echo "✅ All flows validated"
```

---

## Configuration Files

### API Version Compatibility

**File**: `config/flow-api-version-compatibility.json`

Key sections:
- **versions**: v64, v65, v66 details
- **breaking_changes**: Documented breaking changes
- **deprecated_patterns**: Patterns to detect
- **migration_guide**: Step-by-step migration
- **validation_strategy**: Pre-deployment checks
- **ci_cd_integration**: Hook configurations

### Deprecated Patterns

**File**: `config/deprecated-flow-patterns.json`

Includes:
- **actiontype-flow-autolaunched**: CRITICAL severity, auto-fixable
- **missing-api-version**: HIGH severity, auto-fixable
- **text-wrapping-id-fields**: MEDIUM severity, auto-fixable

---

## Integration with Existing Systems

### Works With

1. **Flow Management Framework** (v3.40.0) ✅
   - Complements version management
   - Compatible with best practices validation

2. **Error Prevention System** ✅
   - Can be integrated into sf-command-auto-corrector.js
   - Pre-deployment validation

3. **Order of Operations** ✅
   - Fits into safe flow deployment (D3 sequence)
   - Pre-deployment validation step

### Integration Points

**Pre-Deployment Hook**:
```bash
# Add to hooks/pre-flow-deployment.sh
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-api-version-validator.js validate "$FLOW_PATH"
if [ $? -ne 0 ]; then
    echo "Run migrator or fix manually"
    exit 1
fi
```

**Error Prevention Integration**:
```javascript
// Add to sf-command-auto-corrector.js
if (command.includes('project deploy') && command.includes('flows')) {
    // Validate flows before deployment
    const validator = new FlowAPIVersionValidator();
    // Run validation...
}
```

---

## Migration Strategies

### Strategy 1: Auto-Migration (Recommended)

```bash
# Automatic migration with backup
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-pattern-migrator.js migrate MyFlow.flow-meta.xml

# Result:
#   ✅ Creates backup (.backup.timestamp)
#   ✅ Migrates actionType='flow' → subflows
#   ✅ Adds API version if missing
#   ✅ Preserves all other flow logic
```

### Strategy 2: Manual Migration

1. Open flow in Salesforce Flow Builder
2. Locate flow invocation elements
3. Remove and re-add as "Subflow" element type
4. Save and activate

### Strategy 3: Batch Migration

```bash
# Migrate all flows in directory
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-pattern-migrator.js batch "force-app/**/*.flow-meta.xml"

# Result: Migrates all flows, creates backups, reports results
```

---

## ROI Calculation

### Time Savings

- **Occurrences**: 2 in last 2 days
- **Debug time per occurrence**: 3 hours (identify issue + fix + redeploy)
- **Monthly occurrences**: 5 (extrapolated)
- **Monthly savings**: 15 hours
- **Annual savings**: 180 hours

### Financial Impact

- **Annual value**: $54,000 (180 hrs × $300/hr)
- **Conservative estimate**: $15,000/year
- **Implementation cost**: $3,000 (10 hrs × $300/hr)
- **Payback period**: 2.0 months
- **First year ROI**: $12,000

---

## Testing

### Validation Test

```bash
# Create test flow with deprecated pattern
echo '<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <actionCalls>
        <name>CallSubFlow</name>
        <actionType>flow</actionType>
        <flowName>TestSubFlow</flowName>
    </actionCalls>
</Flow>' > /tmp/test-flow.flow-meta.xml

# Validate
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-api-version-validator.js validate /tmp/test-flow.flow-meta.xml

# Expected: ❌ INVALID - deprecated pattern found
```

### Migration Test

```bash
# Migrate the test flow
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-pattern-migrator.js migrate /tmp/test-flow.flow-meta.xml

# Expected: ✅ SUCCESS - converted to subflows element

# Verify
cat /tmp/test-flow.flow-meta.xml
# Should contain: <subflows> instead of <actionCalls>
```

---

## Troubleshooting

### Issue: "No deprecated patterns found" but deployment still fails

**Cause**: Pattern may not be in deprecated-flow-patterns.json

**Solution**: Add new pattern to config and re-validate

### Issue: Migration creates invalid XML

**Cause**: Edge case in migration logic

**Solution**: Restore from backup (.backup.timestamp) and migrate manually

### Issue: Validator not detecting actionType='flow'

**Cause**: Different XML structure or namespace

**Solution**: Check XML structure, may need regex adjustment

---

## Related Documentation

- [Flow Management Framework](../FLOW_INTEGRATION_SUMMARY.md)
- [Flow Design Best Practices](../FLOW_DESIGN_BEST_PRACTICES.md)
- [Error Prevention System](./ERROR_PREVENTION_SYSTEM.md)

---

**Last Updated**: 2025-10-24
**Maintained By**: RevPal Engineering
