# 01 - Deployment Lifecycle

## Purpose

Define a structured deployment lifecycle that prevents state confusion through explicit verification at each stage.

## The Problem

From reflection data: "Deployment treats operations as isolated transactions rather than stateful operations requiring verification checkpoints."

### Symptoms of Poor State Management

- "Which flow version is currently active?"
- "Did my deployment actually succeed?"
- "Why is the old version still running?"
- "I deployed three times but nothing changed"

## The Six-Stage Deployment Lifecycle

### Stage 1: RETRIEVE - Capture Current State

**Purpose**: Establish baseline understanding of org state before making changes.

```bash
# Retrieve specific component
sf project retrieve start --target-org production --metadata Flow:My_Flow

# Retrieve multiple components
sf project retrieve start --target-org production --manifest package.xml

# Query flow activation status
sf data query --query "
  SELECT FlowDefinition.DeveloperName, Status, VersionNumber
  FROM FlowVersionView
  WHERE FlowDefinition.DeveloperName = 'My_Flow'
  ORDER BY VersionNumber DESC
  LIMIT 5
" --use-tooling-api --target-org production
```

**Output to Capture**:
```json
{
  "stage": "RETRIEVE",
  "timestamp": "2025-12-21T10:00:00Z",
  "components": [
    {
      "type": "Flow",
      "name": "My_Flow",
      "currentVersion": 5,
      "activeVersion": 4,
      "status": "Active"
    }
  ]
}
```

### Stage 2: COMPARE - Generate Diff

**Purpose**: Understand exactly what will change before deploying.

```bash
# Compare local to org
sf project deploy preview --target-org production --manifest package.xml

# Detailed diff (if using source tracking)
sf project deploy report --use-most-recent
```

**JavaScript Diff Generator**:
```javascript
async function generateDeploymentDiff(localPath, orgAlias) {
  const localMetadata = await readLocalMetadata(localPath);
  const orgMetadata = await retrieveOrgMetadata(orgAlias);

  const diff = {
    added: [],
    modified: [],
    deleted: [],
    unchanged: []
  };

  for (const component of localMetadata) {
    const orgVersion = orgMetadata.find(o => o.name === component.name);
    if (!orgVersion) {
      diff.added.push(component);
    } else if (hasChanges(component, orgVersion)) {
      diff.modified.push({
        local: component,
        org: orgVersion,
        changes: computeChanges(component, orgVersion)
      });
    } else {
      diff.unchanged.push(component);
    }
  }

  return diff;
}
```

### Stage 3: VALIDATE - Pre-Deploy Checks

**Purpose**: Ensure deployment will succeed before attempting.

```bash
# Validate without deploying
sf project deploy start --target-org production --manifest package.xml --dry-run --ignore-conflicts

# Check dependencies
sf project deploy validate --target-org production --manifest package.xml
```

**Validation Checklist**:
```javascript
const validationChecks = [
  {
    name: 'Dependencies Present',
    check: async () => await verifyDependencies(manifest),
    blocking: true
  },
  {
    name: 'API Version Compatible',
    check: async () => await checkApiVersions(manifest, orgAlias),
    blocking: true
  },
  {
    name: 'No Destructive Conflicts',
    check: async () => await checkDestructiveChanges(manifest),
    blocking: true
  },
  {
    name: 'Test Coverage Sufficient',
    check: async () => await checkTestCoverage(manifest, 75),
    blocking: false
  },
  {
    name: 'No Active References',
    check: async () => await checkActiveReferences(manifest),
    blocking: true
  }
];
```

### Stage 4: DEPLOY - Execute Changes

**Purpose**: Apply changes to target org with progress tracking.

```bash
# Deploy with progress
sf project deploy start --target-org production --manifest package.xml --wait 30

# Deploy and run tests
sf project deploy start --target-org production --manifest package.xml --test-level RunLocalTests
```

**Progress Tracking**:
```javascript
async function deployWithProgress(manifest, orgAlias) {
  const deployId = await startDeployment(manifest, orgAlias);

  while (true) {
    const status = await getDeploymentStatus(deployId);

    console.log(`[${status.status}] ${status.numberComponentsDeployed}/${status.numberComponentsTotal} components`);

    if (status.done) {
      return {
        success: status.success,
        deployId,
        componentResults: status.details.componentSuccesses,
        errors: status.details.componentFailures
      };
    }

    await sleep(2000);
  }
}
```

### Stage 5: VERIFY - Post-Deploy State Check

**Purpose**: Confirm org state matches expectations after deployment.

```bash
# Verify flow is active
sf data query --query "
  SELECT Status, VersionNumber
  FROM FlowVersionView
  WHERE FlowDefinition.DeveloperName = 'My_Flow'
  AND Status = 'Active'
" --use-tooling-api --target-org production

# Verify metadata deployed
sf project retrieve start --target-org production --metadata Flow:My_Flow
# Then compare to local
```

**Verification Script**:
```javascript
async function verifyDeployment(expectedState, orgAlias) {
  const results = { verified: [], failed: [] };

  for (const component of expectedState.components) {
    const orgState = await queryComponentState(component, orgAlias);

    if (matchesExpected(orgState, component)) {
      results.verified.push({
        component: component.name,
        expected: component.expectedState,
        actual: orgState
      });
    } else {
      results.failed.push({
        component: component.name,
        expected: component.expectedState,
        actual: orgState,
        reason: determineFailureReason(component, orgState)
      });
    }
  }

  return {
    success: results.failed.length === 0,
    ...results
  };
}
```

### Stage 6: CONFIRM - Success Handoff

**Purpose**: Document successful deployment and clear rollback state.

```javascript
async function confirmDeployment(deploymentId, verificationResult) {
  if (!verificationResult.success) {
    return {
      confirmed: false,
      action: 'ROLLBACK_RECOMMENDED',
      failures: verificationResult.failed
    };
  }

  // Clear rollback checkpoint
  await clearRollbackCheckpoint(deploymentId);

  // Update deployment log
  await logDeployment({
    id: deploymentId,
    status: 'CONFIRMED',
    timestamp: new Date().toISOString(),
    components: verificationResult.verified
  });

  // Update runbook observations
  await updateRunbookObservations(deploymentId, {
    success: true,
    observations: generateObservations(verificationResult)
  });

  return {
    confirmed: true,
    deploymentId,
    summary: generateDeploymentSummary(verificationResult)
  };
}
```

## State Verification Queries

### Flow State Queries

```sql
-- Get all versions of a flow
SELECT
  FlowDefinition.DeveloperName,
  VersionNumber,
  Status,
  LastModifiedDate,
  Description
FROM FlowVersionView
WHERE FlowDefinition.DeveloperName = 'My_Flow'
ORDER BY VersionNumber DESC

-- Get only active flows
SELECT
  FlowDefinition.DeveloperName,
  VersionNumber
FROM FlowVersionView
WHERE Status = 'Active'
AND FlowDefinition.DeveloperName LIKE 'My_%'
```

### Metadata State Queries

```sql
-- Check validation rule status
SELECT
  Id,
  ValidationName,
  Active,
  EntityDefinition.QualifiedApiName
FROM ValidationRule
WHERE ValidationName = 'My_Validation_Rule'

-- Check trigger status
SELECT
  Name,
  Status,
  TableEnumOrId
FROM ApexTrigger
WHERE Name = 'MyTrigger'
```

## Rollback Checkpoints

### Creating Checkpoints

```javascript
async function createRollbackCheckpoint(deploymentId, components) {
  const checkpoint = {
    id: deploymentId,
    timestamp: new Date().toISOString(),
    components: []
  };

  for (const component of components) {
    // Retrieve current state
    const currentState = await retrieveComponent(component);

    checkpoint.components.push({
      type: component.type,
      name: component.name,
      state: currentState,
      metadata: await readMetadataFile(component)
    });
  }

  await saveCheckpoint(checkpoint);
  return checkpoint.id;
}
```

### Executing Rollback

```javascript
async function executeRollback(checkpointId) {
  const checkpoint = await loadCheckpoint(checkpointId);

  for (const component of checkpoint.components) {
    await restoreComponent(component);
  }

  // Verify rollback
  const verification = await verifyDeployment(checkpoint, orgAlias);

  return {
    success: verification.success,
    restoredComponents: verification.verified
  };
}
```

## Success Criteria

- [ ] Every deployment follows all 6 stages
- [ ] Post-deployment verification mandatory (no deploy without verify)
- [ ] Rollback checkpoints created before destructive changes
- [ ] State queries used to confirm active versions
- [ ] Zero "which version is active?" confusion incidents
