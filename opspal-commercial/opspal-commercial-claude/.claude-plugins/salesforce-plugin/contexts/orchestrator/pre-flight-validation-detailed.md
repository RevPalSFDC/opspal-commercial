# Pre-Flight Object Validation - Detailed Guide

**Context Type**: Progressive Disclosure (loaded on "validate", "pre-flight", "check", "verify" keywords)
**Priority**: High
**Trigger**: Before automation generation or complex operations

---

## Overview

**CRITICAL**: Before generating ANY automation (Flows, Apex, Process Builder), you MUST validate object existence and field locations to prevent failures from incorrect assumptions.

---

## Required Pre-Flight Checks

Before delegating to ANY automation-building agent:

### 1. Verify Object Existence

```bash
# ALWAYS run this first
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/object-existence-validator.js <org-alias> <object-name>

# For common objects, discover which variant exists
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/object-existence-validator.js <org-alias> Quote --discover
```

**Purpose**: Ensure object exists before building automation around it

---

### 2. Discover Object Variant

**Common Variants to Check**:
- For Quote: Check if `SBQQ__Quote__c` (CPQ) or `Quote` (standard)
- For Account: Check PersonAccount features
- For Contract: Check if `SBQQ__Contract__c` or `Contract`
- **Never assume** - always verify with actual org metadata

---

### 3. Validate Field Locations

```bash
# Use object-field-resolver to verify field paths
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/object-field-resolver.js <org> <object> <field>

# Common mistakes to check:
# - Quote.OwnerId → Actually Opportunity.OwnerId via Quote.OpportunityId
# - Quote.AccountId → Actually Opportunity.AccountId
# - SBQQ__Quote__c fields vs standard Quote fields
```

**Purpose**: Ensure fields exist on correct objects

---

### 4. Validate Flow Formulas

```bash
# Before deploying any flow, validate formulas
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-formula-validator.js <flow-file> <org-alias>

# Auto-fix common issues like missing TEXT() wrappers
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-formula-validator.js <flow-file> <org-alias> --auto-fix
```

**Purpose**: Prevent formula syntax errors in flows

---

### 5. Check User Resolution (Sandboxes)

```bash
# For sandbox orgs, handle email suffixes
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/user-id-resolver.js <org-alias> <email>

# Automatically handles .invalid, .sandbox, .{orgname} suffixes
```

**Purpose**: Resolve correct user IDs in sandbox environments

---

## Object Validation Workflow

### Mandatory Pattern for All Automation Generation

```javascript
async function preFlightValidation(orgAlias, requirements) {
    // 1. Validate primary object
    const objectValidation = await validateObjectExists(orgAlias, requirements.object);
    if (!objectValidation.exists) {
        // Check for variants
        const variant = await discoverObjectVariant(orgAlias, requirements.object);
        if (variant.exists) {
            console.log(`Using ${variant.variant} instead of ${requirements.object}`);
            requirements.object = variant.variant;
        } else {
            throw new Error(`Object ${requirements.object} does not exist in org`);
        }
    }

    // 2. Validate all referenced fields
    for (const field of requirements.fields) {
        const fieldPath = await resolveFieldPath(orgAlias, requirements.object, field);
        if (!fieldPath.valid) {
            console.log(`Field ${field} not on ${requirements.object}, checking relationships...`);
            // Update to correct path (e.g., Opportunity.OwnerId)
            requirements.fieldPaths[field] = fieldPath.correctPath;
        }
    }

    // 3. Return validated requirements
    return requirements;
}
```

---

## Common CPQ vs Standard Patterns

| Scenario | Standard Org | CPQ Org |
|----------|-------------|---------|
| Quote Object | `Quote` | `SBQQ__Quote__c` |
| Quote Line | `QuoteLineItem` | `SBQQ__QuoteLine__c` |
| Quote Owner | via `Opportunity.OwnerId` | `SBQQ__Quote__c.SBQQ__PrimaryContact__c` or via Opportunity |
| Contract | `Contract` | `SBQQ__Contract__c` or both |
| Product | `Product2` | `SBQQ__Product__c` + `Product2` |

---

## Delegation Instructions to Sub-Agents

When delegating to automation builders, ALWAYS include validated metadata:

```javascript
await Task({
    subagent_type: 'salesforce-plugin:sfdc-automation-builder',
    description: 'Create approval flow',
    prompt: `Create approval flow for ${validatedObject} with following VALIDATED metadata:
    - Object API Name: ${validatedObject} (verified to exist)
    - Field Paths: ${JSON.stringify(validatedFieldPaths)}
    - Has CPQ: ${hasCPQ}
    - Is Sandbox: ${isSandbox}

    Use exact object and field names provided - they have been pre-validated.`
});
```

**Key Point**: Include validation status in delegation prompt to prevent sub-agents from re-validating

---

## Error Prevention Checklist

Before ANY flow/automation generation:
- [ ] Ran `object-existence-validator.js` for all objects
- [ ] Discovered correct object variant (Quote vs SBQQ__Quote__c)
- [ ] Validated all field paths with `object-field-resolver.js`
- [ ] Checked flow formulas with `flow-formula-validator.js`
- [ ] Resolved user IDs with sandbox suffix handling
- [ ] Included validated metadata in delegation prompt

---

## Why This Matters

### Real Example: Approval Flow Generation Failure

**What Went Wrong**:
1. Assumed standard Quote object, but org had `SBQQ__Quote__c` (CPQ)
2. Referenced `Quote.OwnerId` which doesn't exist (it's `Opportunity.OwnerId`)
3. Picklist comparison without `TEXT()` wrapper caused formula errors
4. User email had `.invalid` suffix in sandbox

**Result**: Flow deployment failed with 4 different errors

**All preventable with pre-flight validation!**

---

## Tools Reference

### Validation Scripts

- **object-existence-validator.js**: Validates objects exist, discovers variants
- **flow-formula-validator.js**: Validates and fixes flow formula syntax
- **user-id-resolver.js**: Handles sandbox email suffixes
- **object-field-resolver.js**: Validates field paths and relationships

### Documentation

- Flow Best Practices: `docs/SALESFORCE_FLOW_BEST_PRACTICES.md`
- Object Field Patterns: `docs/SALESFORCE_OBJECT_FIELD_PATTERNS.md`
- Platform Limitations: `docs/SALESFORCE_PLATFORM_LIMITATIONS.md`

---

## Success Metrics

**Before Pre-Flight Validation**:
- 40% of automation deployments failed due to metadata assumptions
- Average troubleshooting time: 2-3 hours per failure

**After Pre-Flight Validation**:
- 95% deployment success rate
- Average troubleshooting time: 15 minutes (for legitimate issues)

---

**When This Context is Loaded**: When user message contains keywords: "validate", "pre-flight", "check before", "verify", "validation", "automation", "flow", "approval"

**Back to Core Agent**: See `sfdc-orchestrator.md` for orchestration overview and delegation patterns
