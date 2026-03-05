# Runbook 5: Testing and Deployment for XML Flow Development

**Version**: 1.0.0
**Last Updated**: 2025-11-12
**Audience**: Salesforce Agents, Flow Developers, Release Managers
**Prerequisite Reading**: Runbook 4 (Validation and Best Practices)

---

## Overview

This runbook covers end-to-end Flow testing and deployment strategies, from initial development through production release and post-deployment verification.

### Testing Lifecycle

```
Development � Unit Testing � Integration Testing � UAT � Staging � Production
    �            �               �                �        �          �
 Sandbox    Sandbox        Sandbox        Sandbox   Sandbox   Production
   Dev        Dev            QA             UAT      Stage      Prod
```

### When to Use This Runbook

Use this runbook when you need to:
- Develop comprehensive test plans for Flows
- Execute testing across multiple environments
- Prepare Flows for production deployment
- Perform zero-downtime deployments
- Verify post-deployment success
- Rollback failed deployments

---

## Testing Strategy

### Testing Levels

| Level | Scope | Responsibility | Environment | Coverage Target |
|-------|-------|---------------|-------------|-----------------|
| **Unit Testing** | Individual Flow logic paths | Developer | Dev Sandbox | 100% paths |
| **Integration Testing** | Flow + Related automation | Developer/QA | QA Sandbox | All integrations |
| **System Testing** | Flow + Full org context | QA Team | QA Sandbox | End-to-end scenarios |
| **User Acceptance Testing** | Business requirements | Business Users | UAT Sandbox | Business workflows |
| **Staging Testing** | Production-like validation | Release Manager | Stage Sandbox | Production scenarios |

### Test Scenario Categories

1. **Happy Path** - Expected behavior with valid inputs
2. **Edge Cases** - Boundary conditions, null values, empty collections
3. **Error Paths** - Invalid inputs, fault conditions, DML failures
4. **Performance** - Large data volumes, concurrent execution
5. **Security** - Field-level security, sharing rules
6. **Integration** - Other automation, Apex triggers, external systems

---

## Unit Testing Flows

### Test Scenario Development

For each Flow decision and branch, create at least one test scenario.

**Example Flow**: Account Territory Assignment

**Test Scenarios**:

| Scenario ID | Description | Test Data | Expected Outcome |
|-------------|-------------|-----------|------------------|
| UT-001 | California, Tech, > $10M | State=CA, Industry=Technology, Revenue=$15M | Territory=West_Enterprise |
| UT-002 | California, Tech, $500K-$1M | State=CA, Industry=Technology, Revenue=$750K | Territory=West_SMB |
| UT-003 | Texas, Finance, > $10M | State=TX, Industry=Finance, Revenue=$20M | Territory=Southwest_Enterprise |
| UT-004 | Null State | State=null, Industry=Technology, Revenue=$5M | Territory=Default_Territory |
| UT-005 | Invalid Industry | State=CA, Industry=null, Revenue=$5M | Territory=Default_Territory |
| UT-006 | Negative Revenue | State=CA, Industry=Technology, Revenue=-$100 | Territory=Default_Territory |

### Test Data Creation

**Script**: `create-flow-test-data.js` *(Planned Tool - Coming Soon)*

```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/create-flow-test-data.js \
  --flow Account_Territory_Assignment \
  --scenarios ./test/scenarios/territory-assignment.json \
  --org dev

# Creates test records based on scenarios
# Output:
#  Created 6 test Accounts
#  Test data ready for Flow execution
```

**Test Scenario JSON** (`territory-assignment.json`):
```json
{
  "scenarios": [
    {
      "id": "UT-001",
      "description": "California, Tech, > $10M",
      "object": "Account",
      "fields": {
        "Name": "Test Account UT-001",
        "BillingState": "CA",
        "Industry": "Technology",
        "AnnualRevenue": 15000000
      },
      "expectedOutcome": {
        "Territory__c": "West_Enterprise"
      }
    }
    // ... more scenarios
  ]
}
```

### Executing Unit Tests

#### Manual Testing (Flow Builder)

1. Open Flow in Flow Builder
2. Click "Debug"
3. Select test record
4. Click "Run"
5. Review debug log
6. Verify expected outcomes

#### Automated Testing (CLI)

```bash
# Run all test scenarios
flow test Account_Territory_Assignment.flow-meta.xml \
  --scenarios ./test/scenarios/territory-assignment.json \
  --org dev

# Output:
# Running 6 test scenarios...
#  UT-001: PASSED (Territory = West_Enterprise)
#  UT-002: PASSED (Territory = West_SMB)
#  UT-003: PASSED (Territory = Southwest_Enterprise)
#  UT-004: PASSED (Territory = Default_Territory)
#  UT-005: PASSED (Territory = Default_Territory)
#  UT-006: FAILED (Expected: Default_Territory, Got: West_SMB)
#
# Results: 5/6 passed (83%)
```

### Test Coverage Report

```bash
flow test Account_Territory_Assignment.flow-meta.xml \
  --scenarios ./test/scenarios/territory-assignment.json \
  --coverage-report

# Output:
# Coverage Report:
# - Decision paths: 8/8 covered (100%)
# - Assignment branches: 4/4 covered (100%)
# - Fault paths: 2/3 covered (67%)
# - Record operations: 3/3 covered (100%)
#
# Overall coverage: 94%
# Uncovered paths:
# - Territory_Update_Failed (fault path not triggered)
```

---

## Integration Testing

### Integration Test Scope

Test Flow interactions with:
- Other Flows (Flow chaining)
- Process Builders (legacy)
- Workflow Rules (legacy)
- Apex Triggers
- Validation Rules
- External Systems (API callouts)

### Test Scenario: Flow + Validation Rule

**Flow**: Account Before-Save Validation
**Validation Rule**: `Account.Status__c = 'Active' requires Industry not null`

**Test Scenario**:
```json
{
  "id": "IT-001",
  "description": "Flow validation + Validation Rule both triggered",
  "setup": {
    "validationRule": "Active_Account_Industry_Required",
    "flow": "Account_Before_Save_Validation"
  },
  "testData": {
    "Status__c": "Active",
    "Industry": null
  },
  "expectedOutcome": {
    "flowBlocks": true,
    "validationRuleBlocks": false,
    "errorMessage": "Industry required for Active accounts"
  }
}
```

**Test Execution**:
```bash
flow test Account_Before_Save_Validation.flow-meta.xml \
  --integration-test \
  --scenario ./test/integration/flow-validation-rule.json \
  --org qa

# Output:
# Integration Test: IT-001
#  Flow executed before Validation Rule
#  Flow blocked record save with correct error message
#  Validation Rule did not execute (as expected)
#
# Status: PASSED
```

### Test Scenario: Flow Chaining

**Primary Flow**: Opportunity After-Save
**Subflow**: Calculate_Commission

**Test Scenario**:
```bash
# Verify subflow receives correct inputs
flow test Opportunity_After_Save.flow-meta.xml \
  --trace-subflows \
  --scenario ./test/integration/subflow-chaining.json

# Output:
# Flow execution trace:
# 1. Opportunity_After_Save START
# 2. Decision: Is_Closed_Won � TRUE
# 3. Subflow Call: Calculate_Commission
#    Inputs: OpportunityId=006..., Amount=150000
# 4. Calculate_Commission START
# 5. Formula: Commission_Amount = 150000 * 0.10 = 15000
# 6. Calculate_Commission END
#    Outputs: CommissionAmount=15000
# 7. Assignment: Set Opportunity.Commission__c = 15000
# 8. Record Update: Opportunity
# 9. Opportunity_After_Save END
#
# Status: PASSED
```

---

## User Acceptance Testing (UAT)

### UAT Test Plan Template

**Flow**: Account Territory Assignment

**Business Requirements**:
1. West Coast accounts with revenue > $10M assigned to West Enterprise rep
2. All other accounts assigned based on standard territory matrix
3. Territory updates trigger notification to rep

**UAT Scenarios**:

| Scenario | Business User Action | Expected Result | Acceptance Criteria |
|----------|---------------------|-----------------|---------------------|
| UAT-001 | Create CA account with $15M revenue | Territory = West Enterprise, Notification sent | Rep receives email within 5 minutes |
| UAT-002 | Update existing account to CA with $15M revenue | Territory changes to West Enterprise | Territory change logged in history |
| UAT-003 | Create account with incomplete data | Error message displayed | User can correct and resubmit |

### UAT Execution Process

1. **Prepare UAT Sandbox**:
   ```bash
   # Deploy Flow to UAT sandbox
   flow deploy Account_Territory_Assignment.flow-meta.xml \
     --org uat \
     --activate

   # Create test data for business users
   node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/create-flow-test-data.js \
     --flow Account_Territory_Assignment \
     --scenarios ./test/uat/territory-assignment-uat.json \
     --org uat
   ```

2. **Provide UAT Instructions**:
   - Document business workflows
   - Provide test account credentials
   - List expected outcomes for each scenario

3. **Collect UAT Feedback**:
   - Test scenario pass/fail
   - Business logic correctness
   - User experience issues
   - Performance concerns

4. **UAT Sign-Off**:
   - All scenarios passed
   - Business requirements met
   - No critical issues
   - Stakeholder approval documented

---

## Deployment Preparation

### Pre-Deployment Checklist

#### 1. Code Freeze

- [ ] All development complete
- [ ] All tests passing (unit, integration, UAT)
- [ ] No open defects (severity: critical/high)
- [ ] Code reviewed and approved

#### 2. Dependency Check

**Note**: *The following scripts are planned automation tools - use manual verification until available.*

```bash
# Check Flow dependencies (Planned Tool)
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-dependency-analyzer.js \
  Account_Territory_Assignment.flow-meta.xml

# Output:
# Dependencies found:
# - Custom Fields:
#   - Account.Territory__c (deployed: )
#   - Account.Territory_Score__c (deployed: )
# - Custom Objects:
#   - None
# - Apex Classes:
#   - None
# - Other Flows:
#   - Calculate_Territory_Score (deployed: )
# - Validation Rules:
#   - Active_Account_Industry_Required (deployed: )
#
# Status: All dependencies deployed
```

#### 3. Environment Validation

```bash
# Validate target org is ready (Planned Tool)
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/org-readiness-checker.js --org production

# Output:
# Checking production org readiness...
#  Org accessible
#  API version compatible (62.0)
#  Active Flow limit: 1,847/2,000 (OK)
#  User permissions valid
#  Required fields exist
#  Validation rules compatible
#
# Status: READY FOR DEPLOYMENT
```

#### 4. Rollback Plan

- [ ] Current production Flow backed up
- [ ] Rollback script tested
- [ ] Rollback timeline defined (< 15 minutes)
- [ ] Stakeholders notified of rollback procedure

### Deployment Package Preparation

**Create Deployment Package**:

```bash
# Generate package.xml
flow package Account_Territory_Assignment.flow-meta.xml \
  --include-dependencies \
  --output ./deploy/package

# Generated files:
# deploy/package/
#      package.xml
#      flows/
#          Account_Territory_Assignment.flow-meta.xml
```

**Sample package.xml**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>Account_Territory_Assignment</members>
        <name>Flow</name>
    </types>
    <types>
        <members>Calculate_Territory_Score</members>
        <name>Flow</name>
    </types>
    <version>62.0</version>
</Package>
```

---

## Deployment Execution

### Deployment Strategies

| Strategy | Use Case | Downtime | Risk | Rollback Time |
|----------|----------|----------|------|---------------|
| **Direct Activation** | Low-traffic Flows | None | Medium | Immediate |
| **Staged Activation** | High-traffic Flows | None | Low | 5-15 min |
| **Blue-Green** | Critical Flows | None | Very Low | Immediate |
| **Canary** | Uncertain Flows | None | Low | Progressive |

### Opspal Flow Deploy Script (Alias Override)

Use the validation script for Contract Creation Flow deployments. It resolves the instance alias from the folder, but you can override the target org when needed.

```bash
# Uses instance alias by default
SFDC_INSTANCE=peregrine-staging python3 .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/validate_and_deploy_flow.py

# Override target org alias explicitly (still uses the instance folder for files)
SFDC_INSTANCE=peregrine-staging python3 .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/validate_and_deploy_flow.py \
  --target-org peregrine-staging \
  --activate
```

### Strategy 1: Direct Activation

**Use Case**: Low-traffic Flows, non-critical business processes

**Process**:
```bash
# Deploy and activate immediately
flow deploy Account_Territory_Assignment.flow-meta.xml \
  --org production \
  --activate \
  --run-tests

# Output:
# Validating deployment package...
#  Package valid
# Deploying to production...
#  Flow deployed
# Running tests...
#  All tests passed
# Activating Flow...
#  Flow activated
#
# Deployment complete in 45 seconds
```

### Strategy 2: Staged Activation

**Use Case**: High-traffic Flows, gradual rollout needed

**Process**:

```bash
# Step 1: Deploy as Draft (inactive)
flow deploy Account_Territory_Assignment.flow-meta.xml \
  --org production \
  --status Draft

# Step 2: Verify deployment success
flow verify Account_Territory_Assignment \
  --org production

# Step 3: Manual testing in production (off-hours)
# ... perform manual tests ...

# Step 4: Activate Flow
flow activate Account_Territory_Assignment \
  --org production \
  --scheduled-time "2025-11-12T02:00:00Z"

# Output:
# Flow activation scheduled for 2025-11-12 02:00:00 UTC
# Stakeholders notified
```

### Strategy 3: Blue-Green Deployment

**Use Case**: Critical Flows, zero downtime required, instant rollback needed

**Process**:

```bash
# Current Flow: Account_Territory_Assignment (Blue)
# New Flow: Account_Territory_Assignment_v2 (Green)

# Step 1: Deploy new version as separate Flow
flow deploy Account_Territory_Assignment_v2.flow-meta.xml \
  --org production \
  --activate

# Step 2: Route traffic to new Flow
# Update Process Builder or calling Apex to use v2

# Step 3: Monitor new Flow for issues
flow monitor Account_Territory_Assignment_v2 \
  --duration 24h \
  --alert-on-error

# Step 4: If successful, deactivate old Flow
flow deactivate Account_Territory_Assignment \
  --org production

# Step 5: If issues, instant rollback to Blue
# Revert routing to original Flow (< 1 minute)
```

### Strategy 4: Canary Deployment

**Use Case**: Uncertain Flows, gradual traffic shift, progressive validation

**Process**:

```bash
# Deploy new Flow with percentage-based routing
# 5% traffic � New Flow, 95% traffic � Old Flow

# Step 1: Deploy new Flow
flow deploy Account_Territory_Assignment_v2.flow-meta.xml \
  --org production \
  --activate

# Step 2: Configure canary routing
flow canary start \
  --old-flow Account_Territory_Assignment \
  --new-flow Account_Territory_Assignment_v2 \
  --percentage 5

# Step 3: Monitor and progressively increase
# After 24h: 5% � 25%
flow canary adjust --percentage 25

# After 48h: 25% � 50%
flow canary adjust --percentage 50

# After 72h: 50% � 100%
flow canary complete

# Step 4: Deactivate old Flow
flow deactivate Account_Territory_Assignment
```

---

## Post-Deployment Verification

### Verification Steps

#### 1. Activation Confirmation

```bash
# Verify Flow is active
sf data query \
  --query "SELECT DeveloperName, Status, VersionNumber, ActiveVersionNumber
           FROM FlowDefinition
           WHERE DeveloperName = 'Account_Territory_Assignment'" \
  --use-tooling-api \
  --org production

# Expected output:
# DeveloperName                    Status  VersionNumber  ActiveVersionNumber
# Account_Territory_Assignment     Active  5              5
```

#### 2. Functional Testing

```bash
# Run smoke tests in production
flow test Account_Territory_Assignment.flow-meta.xml \
  --scenarios ./test/smoke/territory-assignment-smoke.json \
  --org production \
  --smoke-test

# Output:
# Running smoke tests...
#  Happy path scenario: PASSED
#  Edge case scenario: PASSED
#  Integration scenario: PASSED
#
# All smoke tests passed
```

#### 3. Monitor Debug Logs

```bash
# Monitor Flow executions for first 24 hours
flow monitor Account_Territory_Assignment \
  --org production \
  --duration 24h \
  --alert-on-error \
  --email alerts@company.com

# Output:
# Monitoring started...
# Threshold alerts:
# - Error rate > 1% � Send alert
# - Execution time > 2000ms � Send alert
# - DML exception � Send alert immediately
```

#### 4. Business Metrics Validation

**Metrics to Track**:

| Metric | Target | Alert Threshold | Critical Threshold |
|--------|--------|-----------------|-------------------|
| Execution count | Baseline � 10% | � 20% | � 50% |
| Error rate | < 0.5% | > 1% | > 5% |
| Avg execution time | < 500ms | > 1000ms | > 2000ms |
| Success rate | > 99% | < 98% | < 95% |

**Monitor Command**:
```bash
# Generate metrics report
flow metrics Account_Territory_Assignment \
  --org production \
  --period 24h \
  --compare-baseline

# Output:
# Metrics (last 24 hours vs baseline):
# - Executions: 1,247 (baseline: 1,198, +4%)
# - Error rate: 0.3% (baseline: 0.2%, +50% relative)
# - Avg execution time: 387ms (baseline: 412ms, -6%)
# - Success rate: 99.7% (baseline: 99.8%, -0.1%)
#
# Status: HEALTHY (all metrics within thresholds)
```

---

## Rollback Procedures

### Rollback Decision Criteria

**Immediate Rollback Required**:
- Error rate > 5%
- Data corruption detected
- Critical business process blocked
- Security vulnerability exposed

**Scheduled Rollback**:
- Error rate 2-5% (rollback within 2 hours)
- Performance degradation > 50% (rollback within 4 hours)
- Business metrics off target (rollback within 24 hours)

### Rollback Execution

#### Method 1: Reactivate Previous Version

```bash
# List Flow versions
sf data query \
  --query "SELECT VersionNumber, Status FROM FlowVersion
           WHERE DefinitionId IN
           (SELECT Id FROM FlowDefinition WHERE DeveloperName = 'Account_Territory_Assignment')
           ORDER BY VersionNumber DESC" \
  --use-tooling-api \
  --org production

# Output:
# VersionNumber  Status
# 5              Active
# 4              Obsolete
# 3              Obsolete

# Rollback to version 4
flow rollback Account_Territory_Assignment \
  --version 4 \
  --org production

# Output:
#  Version 4 reactivated
#  Version 5 set to Obsolete
#  Rollback complete in 8 seconds
```

#### Method 2: Deploy Previous Version from Backup

```bash
# Restore from backup (if version history not available)
flow deploy ./backups/Account_Territory_Assignment_v4.flow-meta.xml \
  --org production \
  --activate \
  --force

# Output:
#  Flow deployed from backup
#  Flow activated
#  Rollback complete in 32 seconds
```

#### Method 3: Blue-Green Rollback

```bash
# If using Blue-Green deployment, simply revert traffic routing
# Instant rollback (< 1 minute)

# Revert routing configuration in Process Builder or Apex
# No Flow deployment needed
```

### Post-Rollback Actions

1. **Verify Rollback Success**:
   ```bash
   flow verify Account_Territory_Assignment \
     --org production \
     --version 4

   # Run smoke tests to confirm functionality
   flow test Account_Territory_Assignment.flow-meta.xml \
     --scenarios ./test/smoke/territory-assignment-smoke.json \
     --org production
   ```

2. **Notify Stakeholders**:
   - Deployment rolled back
   - Root cause analysis in progress
   - Timeline for fix and redeployment

3. **Root Cause Analysis**:
   - Review debug logs for failures
   - Identify code defects or environment issues
   - Document findings and corrective actions

4. **Fix and Redeploy**:
   - Address root cause
   - Test fix in sandbox
   - Redeploy with enhanced monitoring

---

## Continuous Integration/Deployment (CI/CD)

### Automated Deployment Pipeline

```yaml
# .github/workflows/flow-deployment.yml

name: Flow Deployment Pipeline

on:
  push:
    branches: [ main ]
    paths:
      - 'force-app/main/default/flows/**'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v2

      - name: Validate Flow XML
        run: |
          flow validate force-app/main/default/flows/*.flow-meta.xml \
            --checks all

  test-dev:
    needs: validate
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Dev Sandbox
        run: |
          flow deploy force-app/main/default/flows/*.flow-meta.xml \
            --org dev \
            --activate

      - name: Run Unit Tests
        run: |
          flow test force-app/main/default/flows/*.flow-meta.xml \
            --scenarios ./test/unit/ \
            --org dev

  test-qa:
    needs: test-dev
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to QA Sandbox
        run: |
          flow deploy force-app/main/default/flows/*.flow-meta.xml \
            --org qa \
            --activate

      - name: Run Integration Tests
        run: |
          flow test force-app/main/default/flows/*.flow-meta.xml \
            --scenarios ./test/integration/ \
            --org qa

  deploy-staging:
    needs: test-qa
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Staging
        run: |
          flow deploy force-app/main/default/flows/*.flow-meta.xml \
            --org staging \
            --activate

      - name: Run Smoke Tests
        run: |
          flow test force-app/main/default/flows/*.flow-meta.xml \
            --scenarios ./test/smoke/ \
            --org staging

  deploy-production:
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Backup Current Flows
        run: |
          flow backup force-app/main/default/flows/*.flow-meta.xml \
            --org production \
            --output ./backups/$(date +%Y%m%d)

      - name: Deploy to Production
        run: |
          flow deploy force-app/main/default/flows/*.flow-meta.xml \
            --org production \
            --activate

      - name: Monitor Deployment
        run: |
          flow monitor force-app/main/default/flows/*.flow-meta.xml \
            --org production \
            --duration 4h \
            --alert-on-error
```

---

## Deployment Checklist

**Pre-Deployment** (T-24h):
- [ ] All tests passing (unit, integration, UAT)
- [ ] Code reviewed and approved
- [ ] Dependencies deployed to target org
- [ ] Rollback plan documented and tested
- [ ] Stakeholders notified of deployment window
- [ ] Backup of current production Flows created

**Deployment** (T-0h):
- [ ] Deployment package validated
- [ ] Deployed to production
- [ ] Flow activated (or scheduled activation)
- [ ] Smoke tests executed
- [ ] Debug log monitoring enabled

**Post-Deployment** (T+24h):
- [ ] Functional verification complete
- [ ] Business metrics within thresholds
- [ ] No critical errors in debug logs
- [ ] Stakeholders notified of successful deployment
- [ ] Documentation updated

**Post-Deployment** (T+1week):
- [ ] Monitor error rates and performance
- [ ] Review user feedback
- [ ] Decommission old Flow versions (if applicable)
- [ ] Update runbooks with lessons learned

---

## Summary

**Testing and deployment are iterative processes**:

1. **Test Thoroughly** - Unit, integration, UAT, staging
2. **Deploy Strategically** - Choose deployment strategy based on risk
3. **Verify Continuously** - Monitor for 24-48 hours post-deployment
4. **Rollback Decisively** - Don't hesitate if metrics exceed thresholds
5. **Automate Everything** - CI/CD reduces human error

**Key Metrics**:
- Test coverage: > 90%
- Deployment success rate: > 95%
- Rollback time: < 15 minutes
- Post-deployment error rate: < 1%

---

## Next Steps

- **Runbook 6**: Monitoring, Maintenance, and Rollback (advanced topics)

---

## Related Documentation

- **Runbook 4**: Validation and Best Practices
- **Deployment Manager**: `.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-deployment-manager.js`
- **Order of Operations**: `.claude-plugins/opspal-core-plugin/packages/domains/salesforce/docs/ORDER_OF_OPERATIONS_LIBRARY.md`
- **CI/CD Pipeline**: `.claude-plugins/opspal-core-plugin/packages/domains/salesforce/docs/FLOW_CICD_GUIDE.md`

---

**Questions or Issues?** Submit feedback via `/reflect` command to help improve this runbook.
