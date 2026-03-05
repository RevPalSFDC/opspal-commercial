# Sandbox to CLI Deployment Runbook

## Scope

This runbook covers Salesforce metadata deployments from a sandbox to production using the Salesforce CLI. It standardizes staging, validation, test execution for code coverage, quick deploy, and verification.

## Required Inputs

- Sandbox org alias and production org alias
- Manifest path (package.xml)
- Deployment staging directory
- Instance identifier (optional, used for folder naming)
- Apex test class list for coverage
- Target validation and quick deploy job IDs

## Required Tools and Sub-Agents

Tools:
- `.claude-plugins/opspal-salesforce/scripts/lib/runbook-context-extractor.js`
- `.claude-plugins/opspal-salesforce/scripts/validate-file-placement.sh`
- `.claude-plugins/opspal-salesforce/scripts/lib/flow-xml-validator.js`
- `.claude-plugins/opspal-salesforce/scripts/lib/validators/assignment-rule-validator.js`
- `.claude-plugins/opspal-salesforce/hooks/pre-deployment-comprehensive-validation.sh`
- `.claude-plugins/opspal-core/scripts/lib/pdf-capability-checker.js`

Recommended sub-agents:
- `opspal-salesforce:sfdc-orchestrator` (overall coordination)
- `opspal-salesforce:sfdc-deployment-manager` (validation/quick deploy)
- `opspal-salesforce:sfdc-metadata-manager` (manifest staging)
- `opspal-salesforce:sfdc-assignment-rules-manager` (assignment rule validation)
- `opspal-salesforce:flow-diagnostician` (flow validation)
- `opspal-salesforce:sfdc-cli-executor` (CLI execution)
- `opspal-core:pdf-generator` (optional report PDF)

## Model Guidance

- Stay instance-agnostic; never assume org aliases, instance names, or file paths.
- Ask for missing inputs (aliases, manifest path, test classes) before running commands.
- Delegate work to sub-agents for flow diagnostics, assignment rules, metadata staging, and CLI execution.
- Always stage from a manifest into a clean deploy directory before validation or deployment.
- Run validation with explicit test classes to secure code coverage (`--test-level RunSpecifiedTests` + repeated `--tests`).
- Capture the validation job ID and use it for quick deploy; never quick deploy without a successful validation run.
- Record evidence outputs in `<staging>/logs/` and summarize in a runbook note under `docs/`.
- Treat PDF output as optional; preflight dependencies before attempting PDF generation.
- Fail fast on any validation error or non-zero CLI exit code; do not proceed without explicit approval.

## Standard Paths

- Staging root: `instances/<instance>/deploy-staging/<YYYYMMDD-HHMM>/`
- Deployment manifest: `<staging>/manifest/package.xml`
- CLI output logs: `<staging>/logs/`
- Reports: `reports/` (git-ignored)
- Runbook notes: `docs/` (commit manual validation logs)

## Environment Verification (First Step)

- Confirm org aliases resolve to the intended sandbox and production orgs.
- Verify org IDs and instance URLs are distinct (sandbox and production must not match).

```bash
sf org display --target-org <sandbox-alias> --json
sf org display --target-org <prod-alias> --json
```

## Input Validation and Guardrails

1. Validate manifest file exists and is well-formed:
   - `node .claude-plugins/opspal-salesforce/scripts/lib/deployment-source-validator.js validate-manifest <manifest>`
2. Confirm staging directory is new/empty (avoid mixed artifacts).
3. Ensure sandbox and production aliases are not identical.
4. Ensure test class list is not empty when using `RunSpecifiedTests`.
   - If no tests are provided, stop and request input.
   - Never fall back to `RunLocalTests` for this runbook.
5. Avoid non-atomic flags:
   - Do not use `--ignore-errors` or `--ignore-warnings` for production deployments.
6. Confirm tool availability:
   - `sf --version`
   - `node --version`

## Preflight Checklist

1. Load runbook context:
   - `node .claude-plugins/opspal-salesforce/scripts/lib/runbook-context-extractor.js --org <alias> --operation-type metadata --format summary`
2. Stage from manifest into a clean directory:
   - Retrieve sandbox metadata into `<staging>` using the manifest.
   - Avoid deploying directly from `force-app/` or mixed directories.
3. Validate source structure and manifest:
   - `node .claude-plugins/opspal-salesforce/scripts/lib/deployment-source-validator.js validate-source <staging>`
4. Validate file placement:
   - `bash .claude-plugins/opspal-salesforce/scripts/validate-file-placement.sh`
5. Validate Flow XML:
   - `node .claude-plugins/opspal-salesforce/scripts/lib/flow-xml-validator.js <flow-file>`
6. Validate assignment rules (handles ID and name-based assignees):
   - `node .claude-plugins/opspal-salesforce/scripts/lib/validators/assignment-rule-validator.js <assignmentRules.xml> <object> <org>`
7. Field history tracking gate:
   - Block only if new tracked fields would push an object over 20.
8. Run comprehensive pre-deployment hook explicitly:
   - `SF_TARGET_ORG=<prod-alias> SF_DEPLOY_DIR=<staging>/force-app/main/default bash .claude-plugins/opspal-salesforce/hooks/pre-deployment-comprehensive-validation.sh`
9. Confirm CLI test flag usage:
   - Use repeated `--tests` flags (avoid comma-separated lists).

## Validation and Quick Deploy

### Production Validation (check-only)

```bash
sf project deploy validate \
  --manifest <staging>/manifest/package.xml \
  --target-org <prod-alias> \
  --test-level RunSpecifiedTests \
  --tests TestClassOne \
  --tests TestClassTwo \
  --coverage-formatters text \
  --results-dir <staging>/logs \
  --verbose \
  --wait 30
```

Notes:
- Include new test classes in the manifest if they are part of the deployment.
- Capture the validation job ID immediately after it returns.
- If validation times out, poll the job ID until completion using `sf project deploy report --job-id <validation-job-id> --target-org <prod-alias> --wait 10`.
- Abort if the validation command exits non-zero or reports a failed status.
- Review coverage output and confirm org coverage remains >= 75%.

### Quick Deploy

```bash
sf project deploy quick \
  --job-id <validation-job-id> \
  --target-org <prod-alias> \
  --wait 30
```

Notes:
- Proceed only if validation status is `Succeeded`.
- If quick deploy fails (expired job ID or org drift), rerun validation and capture a fresh job ID.

## Rollback and Recovery

- Salesforce metadata deploys are atomic by default; do not disable rollback behavior.
- Keep the staged package and logs until verification completes.
- If a rollback/backout is required, deploy the last known good metadata from version control or a pre-deploy retrieve.

## Logging and Observability

- Use a dedicated logs directory per run: `<staging>/logs/`.
- Prefer both human-readable and JSON logs for key steps:
  - `01_environment.json`, `02_preflight.log`, `03_validate.json`, `04_quick_deploy.json`, `05_evidence.json`.
- Always record:
  - Validation job ID, quick deploy ID, test results, and any warnings/errors.
  - A summary of why a deployment stopped (validation failure, test failure, coverage shortfall).

## Evidence-Based Checks (Production)

Record all evidence outputs in `<staging>/logs/` and summarize in `docs/`.

- Queue and user resolution:
  - `sf data query --query "SELECT Id, DeveloperName, Name FROM Group WHERE Type='Queue'" --target-org <prod-alias> --json`
  - `sf data query --query "SELECT Id, Name, Username, IsActive FROM User WHERE Username = '<username>'" --target-org <prod-alias> --json`
- Field history tracking:
  - `sf data query --query "SELECT COUNT() FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '<Object>' AND IsFieldHistoryTracked = true" --use-tooling-api --target-org <prod-alias> --json`

## Idempotency and Clean State

- Use a fresh staging directory every run.
- Do not reuse validation job IDs.
- Archive or delete old staging directories after confirmation.

## Security and Access

- Use non-interactive auth (JWT) for headless execution.
- Never log tokens or auth URLs.
- Use a dedicated deployment user with least-privilege access for metadata deployment and test execution.

## Optional Enhancements

- Generate a minimal manifest based on actual changes to reduce deploy time.
- Split large deployments into phases (schema, automation, permissions).
- Deploy Flows inactive, verify, then activate as a controlled step.
- Schedule quick deploy for low-usage windows when needed.

## Optional PDF Generation

Preflight:
- `node .claude-plugins/opspal-core/scripts/lib/pdf-capability-checker.js`

If dependencies are missing:
- `bash setup-pdf-generation.sh`

## Deployment Summary Template

Use the template below for the deployment summary and store it in `docs/`:

```
Title: Sandbox to Production Deployment Summary
Date:
Sandbox Alias:
Production Alias:
Manifest Path:
Validation Job ID:
Quick Deploy Job ID:
Tests Executed:
Code Coverage Notes:
Exceptions/Warnings:
Evidence Artifacts:
Manual Validation Performed By:
```

## Post-Deployment Manual Validation

Capture any manual verification steps in a dated doc under `docs/` and link it to the deployment summary.
