---
name: campaign-report-screenshot-to-pdf-pipeline
description: "Use Playwright to screenshot Salesforce reports, embed as base64 in markdown, generate branded PDF via pdf-generator agent"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
agent: opspal-core:playwright-browser-controller + pdf-generator
---

# Campaign Report Screenshot To Pdf Pipeline

Use Playwright to screenshot Salesforce reports, embed as base64 in markdown, generate branded PDF via pdf-generator agent

## When to Use This Skill

- When building or modifying reports and dashboards

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Use Playwright to screenshot Salesforce reports, embed as base64 in markdown, generate branded PDF via pdf-generator agent
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: ed5fbdbc-ff6e-4c53-85f5-6eec41dad74c
- **Agent**: playwright-browser-controller + pdf-generator
- **Enriched**: 2026-04-03
