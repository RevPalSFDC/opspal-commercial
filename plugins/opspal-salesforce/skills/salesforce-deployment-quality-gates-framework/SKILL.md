---
name: salesforce-deployment-quality-gates-framework
description: Salesforce deployment quality-gate framework for pre-deploy validation orchestration, report/flow checks, and post-deploy state verification. Use when hardening deployment safety hooks.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Salesforce Deployment Quality Gates Framework

## When to Use This Skill

Use this skill when:
- Establishing pre-deployment validation checks for CI/CD pipelines
- Enforcing test coverage and code quality requirements before production deployment
- Building hook-driven safety controls around `sf project deploy`
- Verifying post-deploy state (active versions, permissions, data integrity)
- Defining gate pass/fail criteria for different deployment types

**Not for**: Metadata validation logic (use `deployment-validation-framework`), multi-cycle stateful deployments (use `deployment-state-management-framework`), or general org readiness (use `operations-readiness-framework`).

## Quality Gate Matrix

| Gate | Check | Production | Sandbox | Trigger |
|------|-------|-----------|---------|---------|
| **G1: Source Validation** | XML well-formed, no orphaned elements | Required | Required | Pre-deploy |
| **G2: Dependency Check** | All referenced fields/objects exist in target | Required | Required | Pre-deploy |
| **G3: Test Coverage** | >=75% Apex code coverage | Required | Optional | Pre-deploy |
| **G4: Test Execution** | All specified tests pass | Required | Recommended | Pre-deploy |
| **G5: Flow Validation** | No hardcoded IDs, fault paths present | Required | Required | Pre-deploy |
| **G6: Field History** | <=20 tracked fields per object | Required | Required | Pre-deploy |
| **G7: Version Verify** | Deployed version matches expected | Required | Required | Post-deploy |
| **G8: Smoke Test** | Critical path operations succeed | Required | Recommended | Post-deploy |

## Workflow

### Step 1: Pre-Deploy Validation

```bash
# Run the enhanced deployment validator (20 checks)
node scripts/lib/enhanced-deployment-validator.js <org-alias> <deployment-path>

# Or the base validator (8 checks) for faster feedback
node scripts/sfdc-pre-deployment-validator.js <org-alias> <deployment-path>

# Validate deployment source structure
node scripts/lib/deployment-source-validator.js validate-source ./force-app
```

### Step 2: Test Level Selection

| Deployment Type | Test Level | Flag |
|----------------|------------|------|
| Production (any Apex) | Run local tests | `--test-level RunLocalTests` |
| Production (metadata only) | No test run | `--test-level NoTestRun` |
| Sandbox | No test run (default) | `--test-level NoTestRun` |
| Validation only | Run specified tests | `--test-level RunSpecifiedTests --tests MyTest` |

```bash
# Validate without deploying (dry run)
sf project deploy validate --source-dir force-app --target-org <org> --test-level RunLocalTests

# Deploy with required test level
sf project deploy start --source-dir force-app --target-org <org> --test-level RunLocalTests
```

### Step 3: Post-Deploy Verification

```bash
# Check that deployed Flows are active
sf data query --query "SELECT DeveloperName, ActiveVersion.VersionNumber, LatestVersion.VersionNumber FROM FlowDefinition WHERE DeveloperName IN ('Flow_A','Flow_B')" --target-org <org> --use-tooling-api

# Verify Apex test coverage still meets threshold
sf apex get test --code-coverage --target-org <org> --json
```

### Step 4: Gate Outcome Recording

Record pass/fail for each gate with timestamp, deployer identity, and component list. Failed gates must block the deployment pipeline — never override gate failures without documented exception approval.

## Routing Boundaries

Use this skill for hook enforcement around deployments.
Use `deployment-validation-framework` for metadata deployment strategy.

## References

- [comprehensive predeploy validation](./comprehensive-predeploy-validation.md)
- [report and flow quality gates](./report-flow-quality-gates.md)
- [postdeploy state verification](./postdeploy-state-verification.md)
