# 02 - State Verification

## Purpose

Provide patterns for verifying deployment state to prevent "did it actually deploy?" confusion.

## State Verification Queries

### Flow Verification

```sql
-- Verify specific flow version is active
SELECT
  FlowDefinition.DeveloperName,
  VersionNumber,
  Status,
  LastModifiedDate
FROM FlowVersionView
WHERE FlowDefinition.DeveloperName = 'My_Flow'
  AND Status = 'Active'

-- Get version history
SELECT
  VersionNumber,
  Status,
  LastModifiedDate,
  Description
FROM FlowVersionView
WHERE FlowDefinition.DeveloperName = 'My_Flow'
ORDER BY VersionNumber DESC
LIMIT 10
```

### Apex Verification

```sql
-- Verify trigger is active
SELECT Name, Status, Body
FROM ApexTrigger
WHERE Name = 'AccountTrigger'

-- Verify class deployed
SELECT Name, Status, LastModifiedDate
FROM ApexClass
WHERE Name = 'AccountTriggerHandler'
```

### Validation Rule Verification

```sql
-- Verify validation rule is active
SELECT
  ValidationName,
  Active,
  ErrorMessage,
  EntityDefinition.QualifiedApiName
FROM ValidationRule
WHERE ValidationName = 'Require_Amount_On_Close'
```

## Automated State Verification

```javascript
// scripts/lib/deployment-verifier.js
class DeploymentVerifier {
  constructor(orgAlias) {
    this.orgAlias = orgAlias;
  }

  async verifyFlow(flowName, expectedVersion, expectedStatus = 'Active') {
    const query = `
      SELECT VersionNumber, Status
      FROM FlowVersionView
      WHERE FlowDefinition.DeveloperName = '${flowName}'
      AND Status = '${expectedStatus}'
    `;

    const result = await this.executeQuery(query);

    if (result.records.length === 0) {
      return {
        verified: false,
        reason: `No ${expectedStatus} version found for flow ${flowName}`
      };
    }

    const activeVersion = result.records[0].VersionNumber;
    if (expectedVersion && activeVersion !== expectedVersion) {
      return {
        verified: false,
        reason: `Expected version ${expectedVersion}, found ${activeVersion}`
      };
    }

    return {
      verified: true,
      flowName,
      activeVersion,
      status: expectedStatus
    };
  }

  async verifyDeploymentManifest(manifest) {
    const results = { verified: [], failed: [] };

    for (const component of manifest.components) {
      let verification;

      switch (component.type) {
        case 'Flow':
          verification = await this.verifyFlow(component.name);
          break;
        case 'ApexTrigger':
          verification = await this.verifyApexTrigger(component.name);
          break;
        case 'ApexClass':
          verification = await this.verifyApexClass(component.name);
          break;
        case 'ValidationRule':
          verification = await this.verifyValidationRule(component.name);
          break;
        default:
          verification = await this.verifyGenericComponent(component);
      }

      if (verification.verified) {
        results.verified.push(verification);
      } else {
        results.failed.push(verification);
      }
    }

    return {
      success: results.failed.length === 0,
      total: manifest.components.length,
      verified: results.verified.length,
      failed: results.failed.length,
      details: results
    };
  }
}
```

## Verification Timing

### When to Verify

| Event | Verification Required | Timeout |
|-------|----------------------|---------|
| Immediate post-deploy | Yes | Wait for deploy job completion |
| After flow activation | Yes | Poll every 5s for 30s |
| After test execution | Yes | After tests complete |
| Before handoff | Yes | Final verification |

### Polling Pattern

```javascript
async function waitForDeploymentState(componentName, expectedState, options = {}) {
  const { maxWait = 60000, pollInterval = 5000 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    const currentState = await queryComponentState(componentName);

    if (matchesExpected(currentState, expectedState)) {
      return { success: true, state: currentState };
    }

    await sleep(pollInterval);
  }

  return {
    success: false,
    reason: 'Timeout waiting for expected state',
    lastState: await queryComponentState(componentName)
  };
}
```

## Common Verification Failures

### Failure: Flow Shows Draft Instead of Active

**Symptom**: Flow deployed but still shows as Draft

**Diagnosis**:
```sql
SELECT VersionNumber, Status
FROM FlowVersionView
WHERE FlowDefinition.DeveloperName = 'My_Flow'
ORDER BY VersionNumber DESC
LIMIT 3
```

**Causes**:
1. Deploy succeeded but activation failed (check deployment errors)
2. Another version was activated after deployment
3. Deployment included `--run-tests` that failed

**Resolution**:
```bash
# Activate specific version
sf flow resume --flow-api-name My_Flow --target-org production
```

### Failure: Validation Rule Shows Inactive

**Symptom**: Validation rule deployed but not enforcing

**Diagnosis**:
```sql
SELECT ValidationName, Active
FROM ValidationRule
WHERE ValidationName = 'My_Rule'
```

**Causes**:
1. Deployed with `<active>false</active>` in XML
2. Org setting deactivates rules during deploy

**Resolution**:
Check XML and ensure `<active>true</active>`:
```xml
<ValidationRule>
  <fullName>My_Rule</fullName>
  <active>true</active>
  <!-- ... -->
</ValidationRule>
```

## Success Criteria

- [ ] All deployments include mandatory verification step
- [ ] Verification queries document expected vs actual state
- [ ] Polling used for async deployments (max 60s timeout)
- [ ] Failure reasons clearly identified and logged
- [ ] Zero "did it deploy?" confusion incidents
