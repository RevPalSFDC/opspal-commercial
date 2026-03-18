---
name: salesforce-hook-governance-framework
description: Salesforce hook governance framework for risk scoring, approval gating, tiered tool restrictions, and audit-trail enforcement across agent operations. Use when defining or troubleshooting policy enforcement hooks.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Salesforce Hook Governance Framework

Use this skill for governance hooks that enforce safety policy at runtime.

## Workflow

1. Classify operation risk and required controls.
2. Enforce approval and tier restrictions.
3. Capture audit records for decisions and outcomes.
4. Validate governance behavior after policy changes.

## Routing Boundaries

Use this skill for hook-level policy enforcement.
Use `security-governance-framework` for org security model design.

## References

- [risk and approval gating](./risk-approval-gating.md)
- [tier restriction enforcement](./tier-restriction-enforcement.md)
- [audit trail operations](./audit-trail-operations.md)
