# Audit Trail Operations

Primary source: `hooks/post-agent-operation.sh`.

## Requirements

- Log operation metadata, risk level, and outcome for every governed operation.
- Update approval status lifecycle where applicable.
- Preserve timestamped evidence for governance reviews.
- Log entries must be JSONL (one JSON object per line) so they are grep/jq queryable.

## Log Entry Schema

```json
{
  "ts": "2026-04-12T14:30:00Z",
  "hook": "post-agent-operation",
  "agent": "sfdc-deployment-manager",
  "tier": 3,
  "operation": "sf project deploy --source-dir force-app --target-org acme-prod",
  "tool": "Bash",
  "environment": "production",
  "org": "acme-prod",
  "risk_score": 62,
  "risk_level": "HIGH",
  "decision": "allow",
  "outcome": "success",
  "duration_ms": 42300,
  "approval_id": "APPROVAL-20260412-001",
  "approver": "team-lead@company.com"
}
```

## Writing to Audit Log

```bash
AUDIT_LOG="${HOME}/.claude/logs/audit-log.jsonl"
mkdir -p "$(dirname "$AUDIT_LOG")"

ENTRY=$(jq -n \
  --arg ts "$(date -u +%FT%TZ)" \
  --arg hook "post-agent-operation" \
  --arg agent "$AGENT_NAME" \
  --argjson tier "$AGENT_TIER" \
  --arg op "$OPERATION_TYPE" \
  --arg env "$ENVIRONMENT" \
  --argjson risk "$RISK_SCORE" \
  --arg level "$RISK_LEVEL" \
  --arg decision "$DECISION" \
  --arg outcome "$OUTCOME" \
  '{ts:$ts, hook:$hook, agent:$agent, tier:$tier, operation:$op,
    environment:$env, risk_score:$risk, risk_level:$level,
    decision:$decision, outcome:$outcome}')

printf '%s\n' "$ENTRY" >> "$AUDIT_LOG"
```

## Querying the Audit Log

```bash
# All production operations in the last 7 days
jq 'select(.environment == "production")' ~/.claude/logs/audit-log.jsonl \
  | jq 'select(.ts > "2026-04-05")'

# All HIGH/CRITICAL risk operations
jq 'select(.risk_level == "HIGH" or .risk_level == "CRITICAL")' ~/.claude/logs/audit-log.jsonl

# Blocked operations only
jq 'select(.decision == "deny")' ~/.claude/logs/audit-log.jsonl

# Summarize by agent
jq -s 'group_by(.agent) | map({agent: .[0].agent, count: length})' ~/.claude/logs/audit-log.jsonl
```

## Approval Status Lifecycle

When an operation requires approval, the audit entry tracks the lifecycle:

| Status | Meaning |
|--------|---------|
| `pending` | Approval requested, not yet received |
| `approved` | Human approved; operation allowed |
| `denied` | Human denied; operation blocked |
| `auto_approved` | Below approval threshold; auto-allowed |
| `override` | Break-glass override applied |

```bash
# Update approval status (append new entry referencing approval_id)
UPDATE=$(jq -n \
  --arg ts "$(date -u +%FT%TZ)" \
  --arg id "$APPROVAL_ID" \
  --arg status "approved" \
  --arg approver "$APPROVER" \
  '{ts:$ts, event:"approval_update", approval_id:$id, status:$status, approver:$approver}')
printf '%s\n' "$UPDATE" >> "$AUDIT_LOG"
```

## Retention for Audit Logs

Audit logs have stricter retention than operational logs:

| Policy | Value |
|--------|-------|
| Max file size | 10 MB |
| Max archives | 10 |
| Max age | 90 days (compliance) |
| Compression | gzip archives after 30 days |

Apply the `enforce_retention` function from `hook-log-retention-and-rotation-framework` with these audit-specific values.
