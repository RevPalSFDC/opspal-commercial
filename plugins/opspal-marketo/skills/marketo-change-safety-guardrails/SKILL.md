---
name: marketo-change-safety-guardrails
description: Apply hook guardrails for high-impact Marketo mutation operations with preflight checks and rollback safety.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# marketo-change-safety-guardrails

## When to Use This Skill

- Before executing any write operation that affects more than 100 leads (bulk updates, mass status changes, score resets)
- When a hook is about to trigger `campaign_activate`, `campaign_delete`, or `list_add_leads` in a production workspace
- Reviewing a script that modifies Marketo assets (emails, programs, smart campaigns) without an explicit approval gate
- Implementing or auditing a pre-tool-use hook that must block unsafe Marketo mutations
- After a near-miss where a change executed without the expected confirmation step

**Not for**: read-only diagnostics, analytics queries, or designing campaign logic — only applies when a write path is involved.

## Mutation Risk Classification

| Operation | Risk Level | Required Gate |
|-----------|-----------|---------------|
| `campaign_activate` on >500 leads | High | Dry-run count + explicit approval |
| `lead_create` / `lead_update` bulk | High | Schema validation + sample review |
| `campaign_delete` | Critical | Confirmation + backup snapshot |
| `list_add_leads` | Medium | Audience size check + suppression verify |
| `program_clone` | Low | Name collision check |
| Token update on active program | Medium | Impact scope review |

## Workflow

1. **Identify mutation surface**: determine which MCP tool call will fire and the estimated scope (record count, asset type, workspace).
2. **Run preflight checks**: validate that all required inputs are present, schema is correct, and size limits are within safe thresholds (300 records per batch, 10 concurrent imports).
3. **Check rollback feasibility**: confirm a reversal path exists — for activations, record campaign ID; for list operations, snapshot the list membership before modification.
4. **Apply guardrail logic**: if the operation exceeds risk thresholds, emit a blocking advisory with the exact scope and require explicit written approval before proceeding.
5. **Execute with monitoring**: run the mutation, capture the API response, and verify the expected outcome matches the actual state via a follow-up read.
6. **Log the change event**: record operation type, timestamp, affected asset IDs, operator, and outcome for the governance audit trail.

## Routing Boundaries

Use this skill for mutation safety gating and preflight enforcement.
Defer to `marketo-rollout-gates-framework` for structured go/no-go campaign launches.
Defer to `marketo-incident-response-playbook` if a guardrail-bypassed operation has already caused damage.

## References

- [Mutation Preflight Controls](./preflight-mutation.md)
- [Campaign Operation Guards](./campaign-guards.md)
- [Rollback Safety Expectations](./rollback-safety.md)
