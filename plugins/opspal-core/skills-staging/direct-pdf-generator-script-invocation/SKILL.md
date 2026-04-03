---
name: direct-pdf-generator-script-invocation
description: "When pdf-generator agent produces wrong branding, bypass the agent entirely and invoke generate-pdf.sh wrapper script directly via Bash. This ensures the canonical StyleManager CSS pipeline is used."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
agent: opspal-core:direct-bash-invocation
---

# Direct Pdf Generator Script Invocation

When pdf-generator agent produces wrong branding, bypass the agent entirely and invoke generate-pdf.sh wrapper script directly via Bash. This ensures the canonical StyleManager CSS pipeline is used.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. When pdf-generator agent produces wrong branding, bypass the agent entirely and invoke generate-pdf
2. sh wrapper script directly via Bash
3. This ensures the canonical StyleManager CSS pipeline is used

## Source

- **Reflection**: dcb92de5-c341-4c10-8415-0077122d5581
- **Agent**: direct-bash-invocation
- **Enriched**: 2026-04-03
