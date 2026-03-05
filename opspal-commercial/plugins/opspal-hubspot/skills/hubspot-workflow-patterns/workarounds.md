# Workflow Workarounds

## Workaround #1: Playwright Browser Automation for LIST_BRANCH

### Concept

1. Detect when LIST_BRANCH modification is needed
2. Switch from API to browser automation
3. Use Playwright to manipulate HubSpot UI
4. Verify result via API GET

### Pros & Cons

**Pros:**
- Enables full automation of complex branching
- Reliable once UI selectors are mapped
- Can handle any UI-only feature

**Cons:**
- Slower than API (30s vs 2s)
- Brittle if HubSpot changes UI
- Requires browser/headless setup
- Authentication complexity

### Implementation Sketch

```javascript
const { chromium } = require('playwright');

async function addListBranchViaUI(workflowId, branchConfig) {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // 1. Login to HubSpot
  await page.goto('https://app.hubspot.com/login');
  await page.fill('#username', process.env.HUBSPOT_USERNAME);
  await page.fill('#password', process.env.HUBSPOT_PASSWORD);
  await page.click('#loginBtn');

  // 2. Navigate to workflow editor
  await page.goto(`https://app.hubspot.com/workflows/${portalId}/flow/${workflowId}/edit`);

  // 3. Add branch action
  await page.click('[data-test-id="add-action"]');
  await page.click('[data-action-type="if-then-branch"]');

  // 4. Configure filters
  for (const filter of branchConfig.filters) {
    await page.click('[data-test-id="add-filter"]');
    await page.selectOption('[data-test-id="filter-property"]', filter.property);
    await page.selectOption('[data-test-id="filter-operation"]', filter.operation);
    await page.fill('[data-test-id="filter-value"]', filter.value);
  }

  // 5. Save
  await page.click('[data-test-id="save-workflow"]');

  await browser.close();
}
```

### Hybrid Approach (Recommended)

```javascript
async function modifyWorkflow(workflowId, modifications) {
  // Try API first (fast path)
  try {
    return await updateWorkflowViaAPI(workflowId, modifications);
  } catch (error) {
    if (error.status === 400 && modifications.containsListBranch) {
      // Fallback to UI automation
      console.log('API failed, using UI automation...');
      return await updateWorkflowViaUI(workflowId, modifications);
    }
    throw error;
  }
}
```

## Workaround #2: Pre-Flight Validation

### Concept

- Validate all identifiers before API call
- Cross-reference with HubSpot metadata APIs
- Fail fast with clear error messages

### Implementation

```javascript
async function validateWorkflowConfig(workflowConfig) {
  const errors = [];

  // 1. Validate pipeline stage IDs
  for (const action of workflowConfig.actions) {
    if (action.type === 'DEAL_STAGE_UPDATE') {
      const stageExists = await checkPipelineStageExists(action.stageId);
      if (!stageExists) {
        errors.push(`Invalid pipeline stage ID: ${action.stageId}`);
      }
    }
  }

  // 2. Validate property names
  for (const action of workflowConfig.actions) {
    if (action.type === 'SET_PROPERTY_VALUE') {
      const propertyExists = await checkPropertyExists(action.propertyName);
      if (!propertyExists) {
        errors.push(`Property does not exist: ${action.propertyName}`);
      }
    }
  }

  // 3. Validate list IDs
  for (const action of workflowConfig.actions) {
    if (action.type === 'ADD_TO_LIST') {
      const listExists = await checkListExists(action.listId);
      if (!listExists) {
        errors.push(`List does not exist: ${action.listId}`);
      }
    }
  }

  // 4. Check for unsupported features
  if (workflowConfig.actions.some(a => a.actionTypeId === 'LIST_BRANCH')) {
    errors.push('LIST_BRANCH actions are not supported via API');
  }

  return errors;
}
```

### Usage

```javascript
// ❌ Bad
await client.createWorkflow(workflowConfig);

// ✅ Good
const errors = await validateWorkflowConfig(workflowConfig);
if (errors.length > 0) {
  throw new Error(`Validation failed:\n${errors.join('\n')}`);
}
await client.createWorkflow(workflowConfig);
```

## Workaround #3: Transaction Pattern with Backups

### Concept

- Always create backup before modification
- Verify result after modification
- Rollback on failure

### Implementation

```javascript
async function safeWorkflowUpdate(workflowId, modifications) {
  // 1. Create backup
  const backup = await client.getWorkflow(workflowId);
  const backupPath = `backups/workflow-${workflowId}-${Date.now()}.json`;
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));

  try {
    // 2. Apply modifications
    await client.updateWorkflow(workflowId, modifications);

    // 3. Verify result
    const updated = await client.getWorkflow(workflowId);
    const isValid = await validateWorkflow(updated);

    if (!isValid) {
      throw new Error('Post-modification validation failed');
    }

    console.log(`✅ Workflow updated successfully. Backup: ${backupPath}`);
    return updated;

  } catch (error) {
    // 4. Rollback on failure
    console.error(`❌ Update failed: ${error.message}`);
    console.log('Rolling back from backup...');

    await client.updateWorkflow(workflowId, backup);
    console.log('✅ Rollback complete');

    throw error;
  }
}
```

## Workaround #4: Post-Execution Auditing

### Concept

- Validate operations **after** execution using evidence-based auditing
- Catch validation gaps before they cause runtime failures
- Provide actionable recommendations for fixing issues

### Validation Categories (P1 = Critical)

1. **Endpoint & Scope (P1)** - Used /automation/v4/flows, object type = contact
2. **Sequence (P1)** - Proper flow: create → GET validation → enable
3. **Proof of Success (P1)** - GET response shows actual workflow
4. **Branching Rules (P1)** - LIST_BRANCH detection (unsupported)
5. **Data Validation (P1)** - All IDs validated, no placeholders
6. **Error Handling (P2)** - 4xx/5xx not silently ignored
7. **Enablement (P2)** - Enabled state matches intent
8. **Logging (P3)** - Response bodies captured

### CLI Usage

```bash
node scripts/audit-workflow-execution.js \
  --task "Create lifecycle workflow" \
  --payload payload.json \
  --http-log execution.json \
  --threshold 70 \
  --output report.json
```

## Workaround #5: Retry with Exponential Backoff

```javascript
async function updateWorkflowWithRetry(workflowId, modifications, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await client.updateWorkflow(workflowId, modifications);
    } catch (error) {
      if (error.status === 429 || error.status >= 500) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        console.log(`Attempt ${attempt} failed, retrying in ${backoffMs}ms...`);
        await sleep(backoffMs);
      } else {
        throw error;  // Don't retry on client errors
      }
    }
  }
  throw new Error(`Failed after ${maxRetries} attempts`);
}
```

## Best Practices Summary

1. **Always Validate Before Creating** - Use pre-flight validation
2. **Use Hybrid API + UI Approach** - API first, UI fallback
3. **Create Backups Before Modifications** - Enable rollback
4. **Test in Sandbox First** - Verify before production
5. **Implement Retry Logic** - Handle transient errors gracefully
