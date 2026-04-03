---
name: field-reference-cross-validation
description: "After multi-batch deployment, extract field references from active flows and VRs, cross-reference against sobject describe, and flag orphaned references before functional testing begins."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:uat-orchestrator
---

# Field Reference Cross Validation

After multi-batch deployment, extract field references from active flows and VRs, cross-reference against sobject describe, and flag orphaned references before functional testing begins.

## When to Use This Skill

- Before executing the operation described in this skill
- When deploying metadata that involves the patterns described here
- When working with Salesforce Flows or automation

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: After multi-batch deployment, extract field references from active flows and VRs, cross-reference against sobject describe, and flag orphaned references before functional testing begins.
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: e29b5d80-3be5-48bd-b0ed-3bd737144f3f
- **Agent**: opspal-core:uat-orchestrator
- **Enriched**: 2026-04-03
