# Workflow Testing Patterns

## Pre-Deployment Testing

### 1. Validate Configuration Before API Call

```javascript
async function validateBeforeCreate(workflowConfig, portalId) {
  const errors = [];
  const warnings = [];

  // Check workflow type
  if (workflowConfig.objectType !== 'CONTACTS') {
    errors.push('API only supports contact-based workflows');
  }

  // Check for unsupported features
  const hasListBranch = workflowConfig.actions?.some(
    a => a.actionTypeId === 'LIST_BRANCH'
  );
  if (hasListBranch) {
    errors.push('LIST_BRANCH not supported via API - use UI');
  }

  // Validate property references
  const properties = await getContactProperties(portalId);
  const propertyNames = new Set(properties.map(p => p.name));

  for (const action of workflowConfig.actions || []) {
    if (action.propertyName && !propertyNames.has(action.propertyName)) {
      errors.push(`Unknown property: ${action.propertyName}`);
    }
  }

  // Validate list references
  const lists = await getLists(portalId);
  const listIds = new Set(lists.map(l => l.listId.toString()));

  for (const action of workflowConfig.actions || []) {
    if (action.listId && !listIds.has(action.listId.toString())) {
      errors.push(`Unknown list ID: ${action.listId}`);
    }
  }

  return { errors, warnings, valid: errors.length === 0 };
}
```

### 2. Test in Sandbox Portal First

```javascript
const testPortalId = 12345678;  // Sandbox
const prodPortalId = 87654321;  // Production

async function testAndDeployWorkflow(workflowConfig) {
  // 1. Create in sandbox
  const testWorkflow = await createWorkflow(testPortalId, workflowConfig);
  console.log(`Created test workflow: ${testWorkflow.flowId}`);

  // 2. Verify structure
  const verification = await verifyWorkflowStructure(
    testPortalId,
    testWorkflow.flowId,
    workflowConfig
  );
  if (!verification.valid) {
    throw new Error(`Verification failed: ${verification.errors.join(', ')}`);
  }

  // 3. Test with sample data
  await testWithSampleContact(testPortalId, testWorkflow.flowId);

  // 4. Check execution history
  await waitForExecution(testPortalId, testWorkflow.flowId);
  const history = await getExecutionHistory(testPortalId, testWorkflow.flowId);

  if (history.failed > 0) {
    throw new Error(`Test executions failed: ${history.failed}`);
  }

  console.log('✅ Sandbox testing passed');

  // 5. Deploy to production
  const prodWorkflow = await createWorkflow(prodPortalId, workflowConfig);
  console.log(`Created production workflow: ${prodWorkflow.flowId}`);

  return prodWorkflow;
}
```

## Post-Creation Verification

### 1. Verify Workflow Structure

```javascript
async function verifyWorkflowStructure(portalId, flowId, expectedConfig) {
  const actual = await getWorkflow(portalId, flowId);
  const errors = [];

  // Check enrollment criteria
  if (expectedConfig.enrollmentCriteria) {
    if (JSON.stringify(actual.enrollmentCriteria) !==
        JSON.stringify(expectedConfig.enrollmentCriteria)) {
      errors.push('Enrollment criteria mismatch');
    }
  }

  // Check action count
  if (actual.actions.length !== expectedConfig.actions.length) {
    errors.push(`Action count mismatch: expected ${expectedConfig.actions.length}, got ${actual.actions.length}`);
  }

  // Check for specific action types
  for (const expectedAction of expectedConfig.actions) {
    const matchingAction = actual.actions.find(
      a => a.actionTypeId === expectedAction.actionTypeId
    );
    if (!matchingAction) {
      errors.push(`Missing action type: ${expectedAction.actionTypeId}`);
    }
  }

  // Check graph connectivity
  const connectivity = validateActionGraph(actual.actions);
  if (!connectivity.valid) {
    errors.push(`Graph connectivity issue: ${connectivity.error}`);
  }

  return { valid: errors.length === 0, errors };
}
```

### 2. Validate Branch Logic

```javascript
async function verifyBranchCreated(flowId, expectedBranchType) {
  const response = await hubspotClient.get(`/automation/v4/flows/${flowId}`);
  const workflow = response.data;

  const branches = workflow.actions.filter(a =>
    a.actionTypeId === expectedBranchType
  );

  if (branches.length === 0) {
    return {
      valid: false,
      error: `No ${expectedBranchType} found in workflow`
    };
  }

  // For STATIC_BRANCH, verify split property
  if (expectedBranchType === 'STATIC_BRANCH') {
    const branch = branches[0];
    if (!branch.splitOnProperty) {
      return {
        valid: false,
        error: 'STATIC_BRANCH missing splitOnProperty'
      };
    }
  }

  return { valid: true, branches };
}
```

## Test Case Patterns

### Test Case: Simple Property Update

```javascript
const testCase = {
  name: 'Property Update Workflow',
  config: {
    name: 'Test - Set Lead Status',
    type: 'CONTACTS',
    enrollmentCriteria: {
      filterGroups: [{
        filters: [{
          propertyName: 'lifecyclestage',
          operator: 'EQ',
          value: 'lead'
        }]
      }]
    },
    actions: [{
      actionTypeId: 'SET_PROPERTY_VALUE',
      propertyName: 'hs_lead_status',
      newValue: 'NEW'
    }]
  },
  assertions: [
    { type: 'actionCount', expected: 1 },
    { type: 'hasAction', actionTypeId: 'SET_PROPERTY_VALUE' }
  ]
};
```

### Test Case: Branch Logic

```javascript
const testCase = {
  name: 'Lifecycle Stage Branching',
  config: {
    name: 'Test - Stage Branch',
    type: 'CONTACTS',
    actions: [{
      actionTypeId: 'STATIC_BRANCH',
      splitOnProperty: 'lifecyclestage',
      branches: [
        { propertyValue: 'lead', actions: [] },
        { propertyValue: 'customer', actions: [] }
      ]
    }]
  },
  assertions: [
    { type: 'hasAction', actionTypeId: 'STATIC_BRANCH' },
    { type: 'branchProperty', expected: 'lifecyclestage' },
    { type: 'branchCount', expected: 2 }
  ]
};
```

## Integration Testing

### End-to-End Workflow Test

```javascript
async function e2eWorkflowTest(workflowId, portalId) {
  // 1. Create test contact
  const testContact = await createContact(portalId, {
    email: `test-${Date.now()}@example.com`,
    firstname: 'Test',
    lastname: 'Contact',
    lifecyclestage: 'lead'
  });

  try {
    // 2. Manually enroll in workflow
    await enrollContact(portalId, workflowId, testContact.vid);

    // 3. Wait for workflow execution
    await waitForExecution(portalId, workflowId, testContact.vid, {
      timeout: 60000,
      pollInterval: 5000
    });

    // 4. Verify contact was updated
    const updatedContact = await getContact(portalId, testContact.vid);

    // 5. Check expected outcomes
    const passed = verifyOutcomes(updatedContact, expectedOutcomes);

    return {
      status: passed ? 'PASS' : 'FAIL',
      contact: updatedContact,
      workflowId
    };

  } finally {
    // Cleanup: Delete test contact
    await deleteContact(portalId, testContact.vid);
  }
}
```

### Batch Testing

```bash
# Run all workflow tests
for testFile in tests/workflows/*.json; do
  node .claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/test-workflow.js "$testFile" \
    --portal-id $TEST_PORTAL_ID \
    --cleanup
done
```

## Monitoring and Alerting

### Execution History Check

```javascript
async function checkWorkflowHealth(workflowId, portalId, threshold = 0.95) {
  const history = await getExecutionHistory(portalId, workflowId, {
    days: 7
  });

  const successRate = history.succeeded / (history.succeeded + history.failed);

  if (successRate < threshold) {
    return {
      healthy: false,
      successRate,
      failedCount: history.failed,
      topErrors: history.errors.slice(0, 5)
    };
  }

  return {
    healthy: true,
    successRate,
    executionCount: history.succeeded + history.failed
  };
}
```

### Alerting Pattern

```javascript
async function monitorWorkflows(portalId, workflows) {
  for (const workflow of workflows) {
    const health = await checkWorkflowHealth(workflow.id, portalId);

    if (!health.healthy) {
      await sendAlert({
        type: 'WORKFLOW_UNHEALTHY',
        workflowId: workflow.id,
        workflowName: workflow.name,
        successRate: health.successRate,
        topErrors: health.topErrors
      });
    }
  }
}
```
