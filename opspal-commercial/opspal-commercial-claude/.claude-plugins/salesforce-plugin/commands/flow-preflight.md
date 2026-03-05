---
description: Run pre-flight validation checks before Flow execution or deployment
---

Run comprehensive pre-flight validation checks on a Salesforce Flow before execution or deployment to production.

The pre-flight check will:
- **Verify org connectivity** and authentication
- **Validate Flow metadata** (exists, active version, trigger configuration)
- **Detect competing automation** (triggers, workflow rules, Process Builder, other Flows)
- **Identify blocking validation rules** that could prevent Flow execution
- **Configure debug logging** (trace flags for detailed execution logs)
- **Generate readiness report** with go/no-go recommendation

**Target Flow**: {flow-api-name}
**Target Org**: {org-alias} (optional, uses default if not specified)

**Options** (optional flags):
- `--object <ObjectName>`: Object for competing automation check (e.g., Account, Opportunity)
- `--trigger-type <type>`: Trigger type - `before-save`, `after-save`, `before-delete`, `after-delete`
- `--skip-logging`: Skip debug logging setup
- `--json`: Output results as JSON instead of markdown

**Output Location**: `instances/{org-alias}/flow-diagnostics/{flow-name}/preflight-{timestamp}.json`

**Generated Artifacts**:
- Pre-flight check results (JSON)
- Recommendations report (Markdown)
- Competing automation inventory (if object specified)
- Validation rules analysis (if object specified)

**Runbook Reference**: See [Runbook 7, Section 1](../../docs/runbooks/flow-xml-development/07-testing-and-diagnostics.md#section-1-pre-flight-checks)

**Estimated Duration**: 1-2 minutes

**Exit Codes**:
- `0` - All checks passed, ready to proceed
- `1` - Critical issues found, cannot proceed
- `2` - Warnings present, review before proceeding

**Examples**:
```bash
# Basic pre-flight check
/flow-preflight Account_Validation_Flow neonone

# Check with competing automation detection
/flow-preflight Account_Validation_Flow neonone --object Account --trigger-type after-save

# JSON output for CI/CD
/flow-preflight Account_Validation_Flow neonone --json

# Skip debug logging setup
/flow-preflight Account_Validation_Flow neonone --skip-logging
```

**Programmatic Usage**:
```bash
# Direct script invocation
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-preflight-checker.js neonone run-all Account_Validation_Flow

# With options (JSON)
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-preflight-checker.js neonone run-all Account_Validation_Flow \
  --object Account --trigger-type after-save
```

**What Gets Checked**:

1. **Org Connectivity** (10 seconds)
   - SF CLI authentication
   - Org access and permissions
   - API version compatibility

2. **Flow Metadata** (15 seconds)
   - Flow exists in org
   - Active version available
   - Trigger configuration valid
   - Process type matches expected

3. **Competing Automation** (20 seconds, if --object specified)
   - Apex Triggers on same object/operation
   - Workflow Rules (active)
   - Process Builder flows
   - Other record-triggered Flows
   - Order of execution conflicts

4. **Validation Rules** (15 seconds, if --object specified)
   - Active validation rules on object
   - Rules that could block Flow execution
   - Required field enforcement
   - Formula-based validations

5. **Debug Logging** (10 seconds, if not skipped)
   - Trace flag setup for current user
   - Log level configuration (FINEST for Apex/Workflow/Validation)
   - Expiration time (24 hours default)

**Post-Check Actions**:
```bash
# View detailed results
cat instances/{org-alias}/flow-diagnostics/{flow-name}/preflight-latest.json | jq

# Review recommendations
cat instances/{org-alias}/flow-diagnostics/{flow-name}/recommendations.md

# Proceed to execution (if passed)
/flow-test {flow-name} {org-alias}
```

**Integration with CI/CD**:
```yaml
# GitLab CI example
flow-preflight:
  script:
    - /flow-preflight $FLOW_NAME $ORG_ALIAS --json
  only:
    - merge_requests
  allow_failure: false
```

**Use the flow-preflight-checker script to validate the {flow-api-name} Flow on the {org-alias} Salesforce org. Run all pre-flight checks and generate a readiness report with recommendations.**
