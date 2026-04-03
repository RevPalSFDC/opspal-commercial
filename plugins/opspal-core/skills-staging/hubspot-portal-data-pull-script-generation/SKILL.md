---
name: hubspot-portal-data-pull-script-generation
description: "Assessment agent generates a standalone Node.js script that handles token refresh + comprehensive API data pull, saving JSON to assessments/data/. Can be re-run independently."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
agent: opspal-hubspot:hubspot-assessment-analyzer
---

# Hubspot Portal Data Pull Script Generation

Assessment agent generates a standalone Node.js script that handles token refresh + comprehensive API data pull, saving JSON to assessments/data/. Can be re-run independently.

## When to Use This Skill

- When performing audits or assessments of the target system

**Category**: assessment
**Discovered from**: reflection analysis

## Workflow

1. Assessment agent generates a standalone Node
2. js script that handles token refresh + comprehensive API data pull, saving JSON to assessments/data/
3. Can be re-run independently

## Source

- **Reflection**: 36d19292-c7c3-4a34-9d70-d70cedd80682
- **Agent**: hubspot-assessment-analyzer
- **Enriched**: 2026-04-03
