# Agent Runbook Integration Guide

## Overview

This guide documents how agents integrate with the Living Runbook System to leverage historical operational knowledge for context-aware operations.

**Status**: ✅ Production Ready (Phase 5.2 Complete)
**Version**: 1.0.0
**Last Updated**: 2025-10-20

---

## Purpose

Agents that read runbooks before operations can:
- ✅ **Avoid recurring issues** by learning from historical exceptions
- ✅ **Make context-aware decisions** by understanding active workflows
- ✅ **Optimize performance** by applying recommended approaches
- ✅ **Prevent conflicts** by recognizing org-specific quirks

---

## Quick Start

### 1. For Agents: Loading Runbook Context

**In Agent Prompts** (JavaScript example):

```javascript
const { extractRunbookContext } = require('./scripts/lib/runbook-context-extractor');

// Load full context
const context = extractRunbookContext('delta-sandbox', {
    operationType: 'deployment', // Optional: filter by operation
    objects: ['Account', 'Contact'] // Optional: filter by objects
});

// Check if runbook exists
if (!context.exists) {
    console.log('⚠️  No runbook available - proceeding without historical context');
    // Continue with operation
} else {
    console.log(`📚 Loaded runbook (${context.metadata.observationCount} observations)`);

    // Use context to inform decisions
    if (context.knownExceptions.length > 0) {
        // Proactively avoid known issues
    }
}
```

**Via CLI** (Bash example):

```bash
# Get condensed summary
CONTEXT=$(node scripts/lib/runbook-context-extractor.js \
    --org delta-sandbox \
    --format summary)

# Parse JSON
echo "$CONTEXT" | jq '.criticalExceptions'
```

### 2. For Orchestrators: Passing Context to Sub-Agents

```javascript
const context = extractRunbookContext(orgAlias, { operationType: 'deployment' });

await Task({
    subagent_type: 'sfdc-deployment-validator',
    description: 'Validate deployment',
    prompt: `Validate deployment for ${orgAlias}.

    📚 RUNBOOK CONTEXT:
    - Observations: ${context.metadata.observationCount}
    - Known Exceptions: ${context.condensedSummary.criticalExceptions.join('; ')}
    - Active Workflows: ${context.condensedSummary.activeWorkflows.join(', ')}

    Avoid triggering: ${context.condensedSummary.criticalExceptions[0]}
    Package: ${packageDetails}`
});
```

---

## Context Extractor API

### Module: `runbook-context-extractor.js`

**Location**: `scripts/lib/runbook-context-extractor.js`

### Function: `extractRunbookContext(org, options)`

**Parameters**:
- `org` (string, required): Salesforce org alias
- `options` (object, optional):
  - `operationType` (string): Filter by operation type ('deployment', 'data-operation', 'workflow', etc.)
  - `objects` (array): Filter by object names (['Account', 'Contact', ...])

**Returns**: Context object
```javascript
{
  exists: boolean,               // Runbook exists?
  metadata: {
    version: string,             // Runbook version
    lastUpdated: string,         // Last update date
    observationCount: number     // Total observations
  },
  knownExceptions: [
    {
      name: string,              // Exception name
      frequency: string,         // How often it occurs
      context: string,           // When it happens
      recommendation: string,    // How to fix/avoid
      isRecurring: boolean       // Recurring issue?
    }
  ],
  workflows: [
    {
      name: string,              // Workflow name
      type: string,              // Workflow type
      status: string,            // Active/Inactive
      trigger: string            // Trigger condition
    }
  ],
  recommendations: string[],     // Operational recommendations
  platformOverview: string,      // High-level summary
  condensedSummary: {
    hasRunbook: boolean,
    observationCount: number,
    lastUpdated: string,
    criticalExceptions: string[], // Top 3 recurring
    activeWorkflows: string[],    // Top 5 active
    topRecommendations: string[]  // Top 3 recommendations
  }
}
```

### CLI Usage

```bash
# Full context (JSON)
node scripts/lib/runbook-context-extractor.js --org <org-alias>

# Condensed summary only
node scripts/lib/runbook-context-extractor.js --org <org-alias> --format summary

# Filter by operation type
node scripts/lib/runbook-context-extractor.js --org <org-alias> --operation-type deployment

# Filter by objects
node scripts/lib/runbook-context-extractor.js --org <org-alias> --objects "Account,Contact,Opportunity"

# Write to file
node scripts/lib/runbook-context-extractor.js --org <org-alias> --output /tmp/context.json
```

---

## Integration Patterns

### Pattern 1: Pre-Operation Check (Recommended)

**Use Case**: Before any operation, check for known issues

```javascript
// 1. Load context
const context = extractRunbookContext(orgAlias);

if (!context.exists) {
    // No runbook - continue with standard operation
    return executeOperation();
}

// 2. Check for blocking exceptions
const blockingExceptions = context.knownExceptions.filter(ex =>
    ex.isRecurring && ex.name.toLowerCase().includes('schema')
);

if (blockingExceptions.length > 0) {
    console.log('🚨 BLOCKING EXCEPTIONS DETECTED:');
    blockingExceptions.forEach(ex => {
        console.log(`   - ${ex.name}: ${ex.recommendation}`);
    });
    console.log('\n⚠️  Address these issues before proceeding.');
    return; // Stop operation
}

// 3. Proceed with awareness
console.log('✅ No blocking exceptions - proceeding with operation');
executeOperation();
```

### Pattern 2: Filtered Context for Specific Objects

**Use Case**: When operation targets specific objects, filter context to those objects only

```javascript
const targetObjects = ['Account', 'Contact', 'Opportunity'];

const context = extractRunbookContext(orgAlias, {
    objects: targetObjects
});

// Context now only includes:
// - Exceptions related to Account/Contact/Opportunity
// - Workflows touching those objects
```

### Pattern 3: Operation-Specific Context

**Use Case**: Different operations need different context

```javascript
// For deployment operations
const deployContext = extractRunbookContext(orgAlias, {
    operationType: 'deployment'
});
// Returns: Schema exceptions, deployment failures, metadata conflicts

// For data operations
const dataContext = extractRunbookContext(orgAlias, {
    operationType: 'data-operation'
});
// Returns: Data quality issues, record-level exceptions, bulk operation patterns
```

### Pattern 4: Condensed Summary for Prompts

**Use Case**: Injecting context into agent prompts without verbose JSON

```javascript
const context = extractRunbookContext(orgAlias);
const summary = context.condensedSummary;

const prompt = `
Execute ${operation} on ${orgAlias}.

HISTORICAL CONTEXT:
- Runbook observations: ${summary.observationCount}
- Last updated: ${summary.lastUpdated}
${summary.criticalExceptions.length > 0 ? `
- CRITICAL EXCEPTIONS TO AVOID:
  ${summary.criticalExceptions.map(ex => `  • ${ex}`).join('\n')}
` : ''}
${summary.activeWorkflows.length > 0 ? `
- Active workflows that may be affected:
  ${summary.activeWorkflows.join(', ')}
` : ''}

Proceed with operation while avoiding known exceptions.
`;
```

### Pattern 5: Plan Enrichment

**Use Case**: Planners incorporate runbook recommendations into plans

```javascript
const context = extractRunbookContext(orgAlias);

const plan = {
    title: 'Deployment Plan',
    phases: [
        {
            name: 'Pre-Flight Validation',
            steps: [
                'Validate metadata syntax',
                'Check field history limits',
                // Add runbook-recommended steps
                ...context.recommendations
                    .filter(rec => rec.includes('validation'))
                    .map(rec => `Runbook Recommendation: ${rec}`)
            ]
        }
    ],
    knownRisks: context.knownExceptions.map(ex => ({
        issue: ex.name,
        mitigation: ex.recommendation
    }))
};
```

---

## Agent Integration Examples

### Example 1: sfdc-orchestrator

**Location**: `agents/sfdc-orchestrator.md`

**Integration Point**: Pre-operation critical section

```markdown
## 🚨 CRITICAL: Runbook Context Loading (NEW - 2025-10-20)

**EVERY operation MUST load runbook context BEFORE planning.**

### Pre-Operation Runbook Loading

```javascript
const context = extractRunbookContext(orgAlias, {
    operationType: 'deployment',
    objects: ['Account', 'Contact']
});

if (!context.exists) {
    console.log('⚠️  No runbook available - proceeding without historical context');
} else {
    console.log(`📚 Loaded runbook context`);

    // Check for known exceptions
    if (context.knownExceptions.length > 0) {
        console.log('\n⚠️  Known Exceptions:');
        context.knownExceptions.forEach(ex => {
            if (ex.isRecurring) {
                console.log(`   🔴 RECURRING: ${ex.name}`);
                console.log(`      Recommendation: ${ex.recommendation}`);
            }
        });
    }
}
```
```

**Why**: Orchestrator delegates to many agents - needs full context to pass down

### Example 2: sfdc-planner

**Location**: `agents/sfdc-planner.md`

**Integration Point**: Before planning phase

```markdown
## 🚨 CRITICAL: Load Runbook Context Before Planning

**EVERY planning session MUST load runbook context FIRST.**

### Pre-Planning Runbook Check

```bash
node scripts/lib/runbook-context-extractor.js --org <org-alias> --format summary
```

**Use runbook context to inform your plan**:

1. **Check Known Exceptions**: Avoid steps that trigger recurring issues
2. **Identify Active Workflows**: Plan around existing automations
3. **Apply Recommendations**: Incorporate operational best practices
4. **Factor in Observation Count**: Adjust confidence based on data
```

**Why**: Plans informed by history avoid repeating mistakes

### Example 3: sfdc-deployment-validator (Recommended)

**Not yet implemented - Reference pattern:**

```markdown
## Context-Aware Validation

Before validating deployment package:

```bash
# Load deployment-specific context
CONTEXT=$(node scripts/lib/runbook-context-extractor.js \
    --org $ORG_ALIAS \
    --operation-type deployment \
    --format summary)

# Check for field history limit exceptions
if echo "$CONTEXT" | jq -e '.criticalExceptions[] | select(contains("field history"))'; then
    echo "⚠️  Field history limits have been exceeded before"
    echo "   Running pre-flight validation..."
    node scripts/lib/field-history-validator.js --org $ORG_ALIAS
fi
```
```

---

## Best Practices

### 1. Always Check `exists` First

```javascript
const context = extractRunbookContext(orgAlias);

if (!context.exists) {
    // Runbook doesn't exist yet - normal for new orgs
    // Don't fail - just proceed without context
    return executeWithoutContext();
}

// Use context...
```

### 2. Use Condensed Summary for Prompts

```javascript
// ❌ BAD: Passing entire context object to prompts
const prompt = `Execute operation. Context: ${JSON.stringify(context)}`;

// ✅ GOOD: Use condensed summary
const summary = context.condensedSummary;
const prompt = `Execute operation.
Known exceptions: ${summary.criticalExceptions.join(', ')}
Active workflows: ${summary.activeWorkflows.join(', ')}`;
```

### 3. Filter Context for Performance

```javascript
// ❌ BAD: Loading full context when only targeting Account
const context = extractRunbookContext(orgAlias);

// ✅ GOOD: Filter to relevant objects
const context = extractRunbookContext(orgAlias, {
    objects: ['Account']
});
// Much smaller response, faster processing
```

### 4. Include Runbook Status in Logs

```javascript
if (context.exists) {
    console.log(`📚 Runbook: ${context.metadata.observationCount} observations (last updated: ${context.metadata.lastUpdated})`);
} else {
    console.log('⚠️  No runbook available for this org');
}
```

### 5. Proactively Prevent Recurring Issues

```javascript
const recurringIssues = context.knownExceptions.filter(ex => ex.isRecurring);

if (recurringIssues.length > 0) {
    console.log('\n🔴 RECURRING ISSUES DETECTED:');
    recurringIssues.forEach(ex => {
        console.log(`   - ${ex.name}`);
        console.log(`     Recommendation: ${ex.recommendation}`);
    });
    console.log('\n   Applying recommendations to prevent recurrence...');
    // Apply mitigations
}
```

---

## Agents Updated with Runbook Integration

### ✅ Implemented (v1.0.0)

1. **sfdc-orchestrator** (`agents/sfdc-orchestrator.md`)
   - Pre-operation context loading
   - Delegation with context injection
   - Full context awareness

2. **sfdc-planner** (`agents/sfdc-planner.md`)
   - Pre-planning runbook check
   - Plan enrichment with recommendations
   - Risk identification from exceptions

### 📋 Recommended for Future Updates

**High Priority** (Operations that benefit most):
1. **sfdc-deployment-validator** - Prevent deployment failures
2. **sfdc-metadata-manager** - Avoid metadata conflicts
3. **sfdc-conflict-resolver** - Learn from past conflict resolutions
4. **sfdc-data-operations** - Prevent data quality issues

**Medium Priority** (Beneficial but not critical):
5. **sfdc-field-analyzer** - Understand field usage patterns
6. **sfdc-workflow-analyzer** - Map workflow dependencies
7. **sfdc-dependency-analyzer** - Historical dependency patterns

**Low Priority** (Read-only agents):
8. **sfdc-state-discovery** - Could use context but not critical
9. **sfdc-query-specialist** - Mostly stateless operations

---

## Testing Agent Runbook Awareness

### Test Scenario 1: Agent Loads Context

**Setup**:
```bash
# Ensure runbook exists
/generate-runbook
```

**Test**:
```bash
# Run agent that should load runbook
# Check for log output:
# "📚 Loaded runbook context (X observations, last updated: YYYY-MM-DD)"
```

**Expected**: Agent logs show runbook was loaded

### Test Scenario 2: Agent Avoids Known Exception

**Setup**:
```bash
# Create runbook with known exception
# (Simulate by manually adding exception to RUNBOOK.md)
```

**Test**:
```bash
# Run agent operation that would trigger exception
# Check if agent proactively avoids or warns about exception
```

**Expected**: Agent references known exception and applies mitigation

### Test Scenario 3: No Runbook Graceful Handling

**Setup**:
```bash
# Delete runbook
rm instances/delta-sandbox/RUNBOOK.md
```

**Test**:
```bash
# Run agent
# Should not fail, just log warning
```

**Expected**: Agent logs "⚠️ No runbook available" and continues

---

## Troubleshooting

### Issue: Agent Not Loading Runbook

**Symptoms**: No "📚 Loaded runbook" logs

**Solutions**:
1. Check runbook exists: `ls instances/{org}/RUNBOOK.md`
2. Verify agent has runbook integration section
3. Check agent is calling `extractRunbookContext()`

### Issue: Context Empty Despite Runbook Existing

**Symptoms**: `context.exists === true` but all arrays empty

**Solutions**:
1. Check runbook format matches expected structure
2. Verify observations have been captured: `ls instances/{org}/observations/`
3. Regenerate runbook: `/generate-runbook`

### Issue: Agent Ignoring Runbook Recommendations

**Symptoms**: Agent proceeds despite known exceptions

**Solutions**:
1. Check agent actually reads `context.knownExceptions`
2. Verify exception names match operation (case-sensitive)
3. Add explicit exception checking in agent logic

---

## Performance Considerations

### Context Loading Speed

- **Full context**: ~50-100ms (typical runbook with 10-20 observations)
- **Condensed summary**: ~20-50ms (recommended for most operations)
- **Filtered context**: ~10-30ms (when filtering by objects/operation)

### Caching (Future Enhancement)

Currently, context is extracted fresh on each call. Future optimization could cache context:

```javascript
// Potential future implementation
const contextCache = new Map();

function extractRunbookContextCached(org, options) {
    const cacheKey = `${org}-${JSON.stringify(options)}`;

    if (contextCache.has(cacheKey)) {
        const cached = contextCache.get(cacheKey);
        if (Date.now() - cached.timestamp < 60000) { // 1 minute TTL
            return cached.context;
        }
    }

    const context = extractRunbookContext(org, options);
    contextCache.set(cacheKey, { context, timestamp: Date.now() });
    return context;
}
```

---

## Version History

- **v1.0.0** (2025-10-20) - Initial release
  - Context extractor utility
  - sfdc-orchestrator integration
  - sfdc-planner integration
  - Complete documentation

---

## References

- **Living Runbook System**: `docs/LIVING_RUNBOOK_SYSTEM.md`
- **Context Extractor**: `scripts/lib/runbook-context-extractor.js`
- **Runbook Differ**: `scripts/lib/runbook-differ.js`
- **Runbook Versioner**: `scripts/lib/runbook-versioner.js`

---

**Generated by RevPal OpsPal Living Runbook System v2.0.0**
*Making agents context-aware through historical knowledge.*
