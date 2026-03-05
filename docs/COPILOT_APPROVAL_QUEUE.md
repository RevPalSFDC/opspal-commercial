# Copilot Approval Queue (Maintainer Tool)

## Purpose

The Copilot Approval Queue is an internal control plane for production-impacting AI recommendations.
It enforces explicit human decisions with risk-based approval thresholds and an append-only decision log.

## Scope

- Internal maintainer workflow only.
- Not exposed as end-user runtime plugin commands.
- Works from repository state and writes queue/log files in `state/`.

## Files

- Queue state: `state/copilot-approval-queue.json`
- Decision log: `state/copilot-approval-decisions.ndjson`
- Command telemetry log: `state/command-telemetry.ndjson`
- Request schema: `docs/contracts/opspal-copilot-approval-request.schema.json`
- CLI: `scripts/copilot-approval-queue.js`

## CLI Commands

```bash
# Submit a recommendation for approval
npm run copilot:approval -- submit --input .temp/approval-request.json

# List pending requests (default output: table)
npm run copilot:approval -- list --status pending

# Show a specific request
npm run copilot:approval -- show --id apr-1234567890000-abc123

# Approve a request (supports multi-approver policies)
npm run copilot:approval -- decide \
  --id apr-1234567890000-abc123 \
  --decision approve \
  --by "chris" \
  --role "platform-owner" \
  --reason "Validated rollback and blast radius."

# Reject a request
npm run copilot:approval -- decide \
  --id apr-1234567890000-abc123 \
  --decision reject \
  --by "security-reviewer" \
  --role "security-owner" \
  --reason "Insufficient mitigation details."

# Queue stats
npm run copilot:approval -- stats
```

## Promotion to Execution Work Items

Use the promotion workflow to convert approved requests into execution-ready work items
without mutating queue state or writing to external systems.

```bash
# Preview promoted work items (no files written)
npm run next-actions:promote -- --dry-run

# Export approved items (default)
npm run next-actions:promote

# Export custom status/top-N slice
npm run next-actions:promote -- --status pending --top 10
```

Exports are written to:
- `reports/exec/runtime/opspal-approved-work-items.json`
- `reports/exec/runtime/opspal-approved-work-items.md`
- `reports/exec/runtime/opspal-approved-work-items.csv`

Operational safety:
- Queue source of truth remains `state/copilot-approval-queue.json`.
- Promotion is read-only against queue state.
- Runtime exports are gitignored to avoid CI/docs drift and normal workflow disruption.

## Request Payload Example

```json
{
  "title": "Deploy automated remediation for assignment-rule drift",
  "source_plugin": "opspal-salesforce",
  "source_agent": "sfdc-agent-governance",
  "action_summary": "Apply low-risk metadata update with rollback checkpoint",
  "risk_class": "high",
  "confidence_score": 0.82,
  "rollback_plan": "Restore metadata snapshot and rerun validation gates",
  "artifacts": [
    "reports/exec/opspal-gap-priority-matrix.csv"
  ],
  "requested_by": "copilot-orchestrator",
  "approval_policy": {
    "required_approver_count": 2,
    "required_roles": [
      "domain-owner",
      "platform-owner"
    ]
  }
}
```

## Default Policy by Risk Class

- `low`: 1 approver (`domain-owner`)
- `medium`: 1 approver (`domain-owner`)
- `high`: 2 approvers (`domain-owner`, `platform-owner`)
- `critical`: 3 approvers (`domain-owner`, `platform-owner`, `security-owner`)

## Operational Rules

- Every `submit`, `approve`, and `reject` action appends a line to `state/copilot-approval-decisions.ndjson`.
- Command executions append telemetry envelopes to `state/command-telemetry.ndjson` (unless `OPSPAL_COMMAND_TELEMETRY_ENABLED=0`).
- Duplicate approvals by the same approver are blocked.
- Rejection immediately sets request status to `rejected`.
- Approval transitions to `approved` only when required approval count is met.
