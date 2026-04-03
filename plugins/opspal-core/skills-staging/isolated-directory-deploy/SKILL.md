---
name: isolated-directory-deploy
description: "Create a temp directory with only target metadata components + minimal sfdx-project.json to avoid subtree contamination from broken pre-existing components during sf project deploy"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Isolated Directory Deploy

Create a temp directory with only target metadata components + minimal sfdx-project.json to avoid subtree contamination from broken pre-existing components during sf project deploy

## When to Use This Skill

- Before executing the operation described in this skill
- When deploying metadata that involves the patterns described here

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. Create a temp directory with only target metadata components + minimal sfdx-project
2. json to avoid subtree contamination from broken pre-existing components during sf project deploy

## Source

- **Reflection**: a3148c08-d296-4b29-89ad-c910bfc9b374
- **Agent**: manual (parent agent workaround)
- **Enriched**: 2026-04-03
