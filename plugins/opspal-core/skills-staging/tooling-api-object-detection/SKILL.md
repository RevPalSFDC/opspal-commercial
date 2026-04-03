---
name: tooling-api-object-detection
description: "When querying ValidationRule, Flow, ApexTrigger, ApexClass - these require --use-tooling-api flag. Standard sf data query returns empty results silently without the flag."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
---

# Tooling Api Object Detection

When querying ValidationRule, Flow, ApexTrigger, ApexClass - these require --use-tooling-api flag. Standard sf data query returns empty results silently without the flag.

## When to Use This Skill

- When working with Salesforce Flows or automation

**Category**: query
**Discovered from**: reflection analysis

## Workflow

1. When querying ValidationRule, Flow, ApexTrigger, ApexClass - these require --use-tooling-api flag
2. Standard sf data query returns empty results silently without the flag

## Source

- **Reflection**: aee686bc-c1a0-47b7-ba8e-edae792abcbb
- **Agent**: manual investigation
- **Enriched**: 2026-04-03
