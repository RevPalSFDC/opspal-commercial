---
name: flow-deactivation-forensics
description: "Combine [SFDC_ID] history → Tooling API LastModifiedBy → local logs → NotebookLM institutional knowledge to fully reconstruct who/when/why a flow was disabled"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-salesforce:sfdc-query-specialist + notebooklm
---

# Flow Deactivation Forensics

Combine [SFDC_ID] history → Tooling API LastModifiedBy → local logs → NotebookLM institutional knowledge to fully reconstruct who/when/why a flow was disabled

## When to Use This Skill

- When working with Salesforce Flows or automation

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Combine [SFDC_ID] history → Tooling API LastModifiedBy → local logs → NotebookLM institutional knowledge to fully reconstruct who/when/why a flow was disabled
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 2d0b6a65-31fb-4e57-8248-d5730a585e9d
- **Agent**: sfdc-query-specialist + notebooklm
- **Enriched**: 2026-04-03
