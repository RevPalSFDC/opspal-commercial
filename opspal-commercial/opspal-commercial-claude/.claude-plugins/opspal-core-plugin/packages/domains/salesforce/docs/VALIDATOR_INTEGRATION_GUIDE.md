# Validator Integration Guide

**Created:** 2025-10-22
**Purpose:** Wire existing validators into agent workflows
**Fix Plans:** FP-002, FP-006, FP-008, FP-010

---

## Overview

The salesforce-plugin has **53 validators** covering 84% of validation needs. This guide shows how to **integrate existing validators** into agent workflows to complete fix plans FP-002, FP-006, FP-008, and FP-010.

---

## FP-002: Field Validator Integration (2 hours)

**Root Cause:** SOQL queries include non-queryable fields
**Existing Infrastructure:** 19 FLS/queryability validators
**Gap:** No centralized integration point

### Integration Pattern

Create a centralized pre-query validation wrapper:

```javascript
// File: scripts/lib/schema-field-validator-wrapper.js

const smartQueryValidator = require('./smart-query-validator');
const cpqFieldValidator = require('./cpq-field-validator');
const layoutFieldValidator = require('./layout-field-validator');

/**
 * Validate fields before SOQL query generation
 *
 * @param {string} sobject - Object name
 * @param {Array} fields - Fields to query
 * @param {string} orgAlias - Org alias
 * @param {Object} options - Validation options
 * @returns {Object} { valid, validFields, invalidFields, errors }
 */
async function validateQueryFields(sobject, fields, orgAlias, options = {}) {
  const results = {
    valid: true,
    validFields: [],
    invalidFields: [],
    errors: []
  };

  // Run smart query validator
  const smartResult = await smartQueryValidator.validate(sobject, fields, orgAlias);
  if (!smartResult.valid) {
    results.valid = false;
    results.errors.push(...smartResult.errors);
    results.invalidFields.push(...smartResult.invalidFields);
  }

  // For CPQ objects, run CPQ-specific validation
  if (sobject.startsWith('SBQQ__')) {
    const cpqResult = await cpqFieldValidator.validate(sobject, fields, orgAlias);
    if (!cpqResult.valid) {
      results.valid = false;
      results.errors.push(...cpqResult.errors);
    }
  }

  // Return only valid fields
  results.validFields = fields.filter(f => !results.invalidFields.includes(f));

  return results;
}

module.exports = { validateQueryFields };
```

### Usage in SOQL Builders

Update `safe-query-builder.js` and similar:

```javascript
const SafeQueryBuilder = require('./safe-query-builder');
const { validateQueryFields } = require('./schema-field-validator-wrapper');

async function buildSafeQuery(sobject, fields, conditions, orgAlias) {
  // STEP 1: Validate fields BEFORE building query
  const validation = await validateQueryFields(sobject, fields, orgAlias);

  if (!validation.valid) {
    console.error('❌ Invalid fields detected:');
    validation.errors.forEach(err => console.error(`  - ${err}`));

    if (validation.validFields.length === 0) {
      throw new Error('No valid fields to query');
    }

    // Use only valid fields
    console.warn(`⚠️  Using ${validation.validFields.length} valid fields (removed ${validation.invalidFields.length} invalid)`);
    fields = validation.validFields;
  }

  // STEP 2: Build query with validated fields
  const query = new SafeQueryBuilder(sobject)
    .select(fields)
    .where(conditions)
    .build();

  return query;
}
```

### Integration Checklist

- [ ] Create `schema-field-validator-wrapper.js`
- [ ] Update `safe-query-builder.js` to call wrapper
- [ ] Update `soql-enhancement-engine.js` to call wrapper
- [ ] Test with non-queryable field (BillingAddress)
- [ ] Update 3 key agents to use safe builder
- [ ] Document in agent prompts

**Estimated Effort:** 2 hours

---

## FP-006: Metadata Validator Enhancement (1 hour)

**Root Cause:** Dashboard metadata requirements not validated (chartAxisRange)
**Existing Infrastructure:** `metadata-validator.js`
**Gap:** Dashboard-specific rules

### Integration Pattern

Add dashboard rules to existing validator:

```javascript
// File: scripts/lib/metadata-validator.js (ADD TO EXISTING)

// Add to existing validation rules:
const DASHBOARD_RULES = {
  chartComponents: {
    required: ['chartAxisRange'],
    message: 'Dashboard chart components require chartAxisRange element'
  },
  reportReferences: {
    format: 'FolderName/DeveloperName',
    message: 'Report references must be in format FolderName/DeveloperName, not IDs'
  }
};

/**
 * Validate dashboard metadata (NEW METHOD)
 *
 * @param {Object} dashboardMetadata - Parsed dashboard XML
 * @returns {Object} Validation result
 */
function validateDashboard(dashboardMetadata) {
  const errors = [];
  const warnings = [];

  // Check chart components
  if (dashboardMetadata.dashboardGridComponents) {
    dashboardMetadata.dashboardGridComponents.forEach(component => {
      if (component.chartType && !component.chartAxisRange) {
        errors.push(`Chart component missing chartAxisRange: ${component.componentType || 'unknown'}`);
      }

      // Check report references
      if (component.reportName && /^00O[a-zA-Z0-9]{12}/.test(component.reportName)) {
        warnings.push(`Report reference uses ID format (${component.reportName}), should use FolderName/DeveloperName`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

// Add to module.exports
module.exports = {
  // ... existing exports
  validateDashboard
};
```

### Integration Checklist

- [ ] Add `DASHBOARD_RULES` to `metadata-validator.js`
- [ ] Add `validateDashboard()` method
- [ ] Update dashboard deployment scripts to call validator
- [ ] Test with dashboard missing chartAxisRange
- [ ] Document in deployment agent prompts

**Estimated Effort:** 1 hour

---

## FP-008: Evidence-Based Troubleshooting Protocol (2 hours)

**Root Cause:** Agents make assumptions without querying
**Existing Infrastructure:** `response-validation-orchestrator.js`
**Gap:** Agent prompts need "query before assuming" requirement

### Integration Pattern

Update agent prompts with evidence requirement:

```markdown
## Evidence-Based Troubleshooting Protocol

Before making ANY assumption about org state:

**REQUIRED:**
1. **Query to verify** - Run SOQL/API query to confirm
2. **Show evidence** - Include query result in response
3. **Document assumption** - If making assumption, explicitly state it

**Example:**

❌ BAD:
"The dashboard deployment succeeded."

✅ GOOD:
"Verifying deployment...
Query: SELECT Id, DeveloperName FROM Dashboard WHERE DeveloperName = 'MyDashboard'
Result: 1 record found
✅ Dashboard deployment confirmed."

**Validation:**
- All deployment operations MUST call post-deployment-state-verifier.js
- All troubleshooting MUST query org state before diagnosis
- All "success" claims MUST include verification evidence
```

### Agents to Update (10 agents)

**Deployment Agents (5):**
1. `sfdc-metadata-deployer.md`
2. `sfdc-dashboard-deployer.md`
3. `sfdc-layout-deployer.md`
4. `sfdc-profile-deployer.md`
5. `sfdc-permission-deployer.md`

**Troubleshooting Agents (5):**
6. `sfdc-deployment-troubleshooter.md`
7. `sfdc-metadata-analyzer.md`
8. `sfdc-conflict-resolver.md`
9. `sfdc-remediation-executor.md`
10. `sfdc-quality-auditor.md`

### Agent Prompt Template Addition

Add this section to each agent's prompt:

```yaml
## CRITICAL: Evidence-Based Protocol

**Before claiming success or making assumptions:**

1. Query org to verify state
2. Call post-deployment-state-verifier.js after deployments
3. Include query results in response
4. Never assume - always verify

**Example:**
After deployment: "Verifying... [Query: ...] [Result: ...] ✅ Confirmed"
```

### Integration Checklist

- [ ] Update 5 deployment agent prompts
- [ ] Update 5 troubleshooting agent prompts
- [ ] Add verification examples to each
- [ ] Test with deployment scenario
- [ ] Document in AGENT_BEST_PRACTICES.md

**Estimated Effort:** 2 hours

---

## FP-010: Validation-Aware Update Framework (2 hours)

**Root Cause:** Validation rules block updates unexpectedly
**Existing Infrastructure:** `validation-rule-manager.js`, `validation-bypass-manager.js`
**Gap:** Not integrated with bulk update operations

### Integration Pattern

Wire validation rule manager into update workflow:

```javascript
// File: scripts/lib/bulk-update-with-validation-awareness.js (NEW)

const ValidationRuleManager = require('./validation-rule-manager');
const { execSync } = require('child_process');

/**
 * Update records with validation rule awareness
 *
 * @param {string} orgAlias - Org alias
 * @param {string} sobject - Object name
 * @param {Array} updates - Updates to perform
 * @returns {Object} Update results
 */
async function updateWithValidationAwareness(orgAlias, sobject, updates) {
  // STEP 1: Query active validation rules
  const vrManager = new ValidationRuleManager(orgAlias);
  const activeRules = await vrManager.listActive(sobject);

  console.log(`Found ${activeRules.length} active validation rules for ${sobject}`);

  // STEP 2: Extract required fields from validation rules
  const requiredFields = new Set();
  activeRules.forEach(rule => {
    // Parse error formula to find required fields
    // Example: "Who_Set_Meeting__c IS NOT NULL AND Contract_Type__c != null"
    const formula = rule.ErrorConditionFormula || '';
    const fieldMatches = formula.match(/[A-Za-z_][A-Za-z0-9_]*__c/g) || [];
    fieldMatches.forEach(field => requiredFields.add(field));
  });

  console.log(`Required fields from validation rules: ${Array.from(requiredFields).join(', ')}`);

  // STEP 3: Enhance updates with required fields
  const enhancedUpdates = updates.map(update => {
    const enhanced = { ...update };

    // Add required fields with null if not present
    requiredFields.forEach(field => {
      if (!(field in enhanced)) {
        console.warn(`⚠️  Adding required field ${field} = null to update`);
        enhanced[field] = null; // or fetch current value
      }
    });

    return enhanced;
  });

  // STEP 4: Perform update
  return enhancedUpdates;
}

module.exports = { updateWithValidationAwareness };
```

### Usage in Bulk Update Scripts

```javascript
const { updateWithValidationAwareness } = require('./bulk-update-with-validation-awareness');

// Before
const updates = [{ Id: '001xxx', AccountId: '001yyy' }];
// Would fail: "Who_Set_Meeting__c required"

// After
const safeUpdates = await updateWithValidationAwareness('myorg', 'Opportunity', updates);
// Includes: { Id: '001xxx', AccountId: '001yyy', Who_Set_Meeting__c: null, Contract_Type__c: null }
```

### Integration Checklist

- [ ] Create `bulk-update-with-validation-awareness.js`
- [ ] Update `bulk-update-orchestrator` to use wrapper
- [ ] Add validation rule query pre-update
- [ ] Test with Opportunity update scenario (Who_Set_Meeting__c)
- [ ] Document in BULK_OPERATIONS_BEST_PRACTICES.md
- [ ] Update relevant agents

**Estimated Effort:** 2 hours

---

## Integration Priority

**Execute in this order:**

1. **FP-004: Query Batching** ✅ DONE (3h) - Highest ROI, standalone
2. **FP-010: Validation-Aware Updates** (2h) - High ROI, clear integration
3. **FP-002: Field Validator** (2h) - Medium complexity
4. **FP-006: Metadata Validator** (1h) - Low effort
5. **FP-008: Evidence Protocol** (2h) - Agent prompts, do last

**Total:** 10 hours

---

## Testing Strategy

For each integration:

1. **Unit Test:** Test the wrapper/integration function
2. **Integration Test:** Test with actual agent workflow
3. **Reflection Scenario Test:** Run original reflection scenario
4. **Regression Test:** Ensure existing functionality still works

---

## Success Criteria

### FP-002: Field Validator Integration
- ✅ Zero "No such column" errors when field is non-queryable
- ✅ Query builder only uses valid fields
- ✅ Warning shown when fields are filtered out

### FP-006: Metadata Validator Enhancement
- ✅ Dashboard deployment fails early if chartAxisRange missing
- ✅ Clear error message with fix guidance
- ✅ Report reference format validated

### FP-008: Evidence Protocol
- ✅ Agents query org before claiming success
- ✅ Verification evidence included in responses
- ✅ post-deployment-state-verifier.js called after deployments

### FP-010: Validation-Aware Updates
- ✅ Zero unexpected validation rule errors on updates
- ✅ Required fields auto-included
- ✅ Warning shown when fields added

---

## See Also

- `FINAL_GAP_ANALYSIS_REPORT.md` - Complete analysis
- `INFRASTRUCTURE_INVENTORY.md` - All 53 validators cataloged
- Individual validator documentation in each script
