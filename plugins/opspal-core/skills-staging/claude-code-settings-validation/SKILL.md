---
name: claude-code-settings-validation
description: "When encountering Claude Code startup validation errors: (1) Read error message for schema requirements, (2) Consult JSON schema at json.schemastore.org, (3) Make targeted fix, (4) Validate with jq, (5) Force-add to git if gitignored"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Claude Code Settings Validation

When encountering Claude Code startup validation errors: (1) Read error message for schema requirements, (2) Consult JSON schema at json.schemastore.org, (3) Make targeted fix, (4) Validate with jq, (5) Force-add to git if gitignored

## When to Use This Skill

- When encountering errors that match this pattern

**Category**: documentation
**Discovered from**: reflection analysis

## Workflow

1. When encountering Claude Code startup validation errors: (1) Read error message for schema requirements, (2) Consult JSON schema at json
2. schemastore
3. org, (3) Make targeted fix, (4) Validate with jq, (5) Force-add to git if gitignored

## Source

- **Reflection**: 2be18591-77d3-4327-a6e1-23582c9ff78b
- **Agent**: unknown
- **Enriched**: 2026-04-03
