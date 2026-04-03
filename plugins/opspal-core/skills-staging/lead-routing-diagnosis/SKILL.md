---
name: lead-routing-diagnosis
description: "When leads aren't being assigned: 1) Query leads by owner to find stuck leads, 2) Group by status to identify lifecycle stage issues, 3) Check assignment flows/triggers, 4) Trace the full routing chain"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-salesforce:sfdc-query-specialist
---

# Lead Routing Diagnosis

When leads aren't being assigned: 1) Query leads by owner to find stuck leads, 2) Group by status to identify lifecycle stage issues, 3) Check assignment flows/triggers, 4) Trace the full routing chain

## When to Use This Skill

- When working with Salesforce Flows or automation

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When leads aren't being assigned: 1) Query leads by owner to find stuck leads, 2) Group by status to identify lifecycle stage issues, 3) Check assignment flows/triggers, 4) Trace the full routing chain
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 4a8fbad5-3579-47b7-9b05-c1e9b08d7f70
- **Agent**: sfdc-query-specialist
- **Enriched**: 2026-04-03
