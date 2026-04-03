---
name: flow-xml-authoring-from-existing-pattern
description: "Read existing flow XML as reference, adapt trigger criteria and decision/update nodes for new record type with different stage progression, validate via dry-run before proposing"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:direct (manual XML construction)
---

# Flow Xml Authoring From Existing Pattern

Read existing flow XML as reference, adapt trigger criteria and decision/update nodes for new record type with different stage progression, validate via dry-run before proposing

## When to Use This Skill

- Before executing the operation described in this skill
- When working with Salesforce Flows or automation

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Read existing flow XML as reference, adapt trigger criteria and decision/update nodes for new record type with different stage progression, validate via dry-run before proposing
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: a78e817a-2d26-48dd-89a7-bd62365129b1
- **Agent**: direct (manual XML construction)
- **Enriched**: 2026-04-03
