---
description: Run pre-flight validation checks before Flow execution or deployment
argument-hint: "Account_Validation_Flow gamma-corp"
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
- `--proposed-action <mode>`: Requested change mode - `update`, `new`, or `auto` (default)
- `--capability-domain <domain>`: Capability ownership domain for overlap scoring (recommended)
- `--entry-criteria "<criteria>"`: Proposed entry criteria summary for overlap/maintainability analysis
- `--requires-async-ordering <true|false>`: Mark if design depends on strict async sequencing
- `--enforcement <mode>`: Decision gate mode - `risk-based` (default), `strict`, `advisory`
- `--expands-privileged-scope <true|false>`: Mark if change broadens privileged/system-context behavior
- `--has-guard-conditions <true|false>`: Confirm privileged logic is gated by explicit guard conditions
- `--json`: Output results as JSON instead of markdown

**Output Location**: `instances/{org-alias}/flow-diagnostics/{flow-name}/preflight-{timestamp}.json`

**Generated Artifacts**:
- Pre-flight check results (JSON)
- Recommendations report (Markdown)
- Competing automation inventory (if object specified)
- Validation rules analysis (if object specified)
- Change strategy decision payload (update vs net-new vs refactor)

**Runbook Reference**: See [Runbook 7, Section 1](../../docs/runbooks/flow-xml-development/07-testing-and-diagnostics.md#section-1-pre-flight-checks)

**Estimated Duration**: 1-2 minutes

**Exit Codes**:
- `0` - All checks passed, ready to proceed
- `1` - Critical issues found, cannot proceed
- `2` - Warnings present, review before proceeding

**Examples**:
```bash
# Basic pre-flight check
/flow-preflight Account_Validation_Flow gamma-corp

# Check with competing automation detection
/flow-preflight Account_Validation_Flow gamma-corp --object Account --trigger-type after-save

# JSON output for CI/CD
/flow-preflight Account_Validation_Flow gamma-corp --json

# Skip debug logging setup
/flow-preflight Account_Validation_Flow gamma-corp --skip-logging

# Explicitly evaluate update vs net-new with risk-based blocking
/flow-preflight Account_Validation_Flow gamma-corp \
  --object Account \
  --trigger-type after-save \
  --proposed-action auto \
  --capability-domain account_enrichment \
  --entry-criteria "Type = 'Customer' AND Status__c = 'Active'" \
  --enforcement risk-based
```

**Programmatic Usage**:
```bash
# Direct script invocation
node scripts/lib/flow-preflight-checker.js gamma-corp run-all Account_Validation_Flow

# With options (JSON)
node scripts/lib/flow-preflight-checker.js gamma-corp run-all Account_Validation_Flow \
  --object Account --trigger-type after-save --json
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

6. **Change Strategy Decision** (10-20 seconds)
   - Weighted decision matrix output for `update_existing`, `create_new`, or `refactor_with_subflow`
   - Critical blocking issues (risk-based/strict/advisory enforcement aware)
   - Required actions and decision rationale

**Decision Output (JSON)**:
```json
{
  "decision": {
    "recommendedStrategy": "create_new",
    "weightedScores": { "update": 67.5, "new": 72.0 },
    "blockingIssues": [],
    "warnings": ["Entry criteria not provided; overlap risk cannot be fully evaluated."],
    "requiredActions": ["Document explicit entry criteria to reduce overlap risk."],
    "confidence": 0.74
  }
}
```

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
