---
name: ui-verification-checkpoint
description: "Before concluding any audit, verify 2-3 critical findings in platform UI"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:user feedback
---

# Ui Verification Checkpoint

Before concluding any audit, verify 2-3 critical findings in platform UI

## When to Use This Skill

- Before executing the operation described in this skill
- When performing audits or assessments of the target system

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Before concluding any audit, verify 2-3 critical findings in platform UI
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 251e0994-df3c-4b2d-8da7-9ae898104eab
- **Agent**: user feedback
- **Enriched**: 2026-04-03
