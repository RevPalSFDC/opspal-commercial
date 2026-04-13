# Risk and Approval Gating

Primary source: `hooks/universal-agent-governance.sh`.

## Risk Score Thresholds

| Score | Level | Hook Action |
|-------|-------|-------------|
| 0–30 | LOW | Log and allow |
| 31–50 | MEDIUM | Log with enhanced monitoring |
| 51–70 | HIGH | Advisory warning + optional approval request |
| 71–100 | CRITICAL | Block with remediation guidance |

These thresholds are defined in `scripts/lib/agent-risk-scorer.js` and enforced by `universal-agent-governance.sh`.

## Computing Risk Score

The risk scorer factors in:
- **Operation type**: DELETE/TRUNCATE > INSERT/UPDATE > SELECT
- **Environment**: `production` > `sandbox` > `scratch`
- **Record count**: >10,000 raises risk; >100,000 raises significantly
- **Agent tier**: Higher tier agents score higher risk for the same operation
- **Component type**: Apex/Flow/Permission changes score higher than metadata reads

```bash
RISK_CMD="node \"$RISK_SCORER\" \
  --type \"$OPERATION_TYPE\" \
  --agent \"$AGENT_NAME\" \
  --environment \"$ENVIRONMENT\" \
  --record-count \"$RECORD_COUNT\" \
  --component-count \"$COMPONENT_COUNT\""

RISK_OUTPUT=$(eval $RISK_CMD 2>&1) || {
  echo "Risk calculation failed — proceeding with caution" >&2
  exit 0
}
RISK_SCORE=$(echo "$RISK_OUTPUT" | jq -r '.riskScore // 0')
RISK_LEVEL=$(echo "$RISK_OUTPUT" | jq -r '.riskLevel // "UNKNOWN"')
```

## Approval Gating by Tier

```bash
# Tier 4-5 always require approval
if [[ "$AGENT_TIER" -ge 4 ]]; then
  TIER_REQUIRES_APPROVAL="true"
fi

# Tier 3 requires approval in production only
if [[ "$AGENT_TIER" -eq 3 ]] && [[ "$ENVIRONMENT" == *"production"* ]]; then
  TIER_REQUIRES_APPROVAL="true"
fi
```

Approval is advisory (exit 0) in the current implementation — the hook surfaces the requirement and logs it, but does not block execution. This follows the routing-advisory-only policy documented in `feedback_routing_advisory.md`.

## Approval Request File Format

```json
{
  "requestId": "APPROVAL-20260412-001",
  "agent": "sfdc-deployment-manager",
  "tier": 4,
  "operation": "sf project deploy --source-dir force-app --target-org acme-prod",
  "environment": "production",
  "riskScore": 68,
  "riskLevel": "HIGH",
  "requestedApprovers": ["team-lead", "security-lead"],
  "rollbackPlan": "sf project deploy --source-dir force-app/previous --target-org acme-prod",
  "submittedAt": "2026-04-12T14:30:00Z"
}
```

Submit via:
```bash
node scripts/lib/human-in-the-loop-controller.js request approval-request.json
```

## Override Mechanism

For break-glass situations (documented incidents):

```bash
export AGENT_GOVERNANCE_OVERRIDE=true
export OVERRIDE_REASON="Emergency fix for incident INC-12345"
export OVERRIDE_APPROVER="sre-lead@company.com"
```

Overrides are logged to the audit trail with full context.

## Disabling Governance

```bash
export AGENT_GOVERNANCE_ENABLED=false   # Bypass all governance checks
```

Only for development/scratch environments — never set in production pipelines.
