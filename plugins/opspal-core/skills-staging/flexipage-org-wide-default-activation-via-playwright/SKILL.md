---
name: flexipage-org-wide-default-activation-via-playwright
description: "Use Playwright to navigate to /visualEditor/[DOMAIN], click Activation, select Assign as Org Default, choose form factor, and Save. Required because no API exists."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-metadata-manager
---

# Flexipage Org Wide Default Activation Via Playwright

Use Playwright to navigate to /visualEditor/[DOMAIN], click Activation, select Assign as Org Default, choose form factor, and Save. Required because no API exists.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. Use Playwright to navigate to /visualEditor/[DOMAIN], click Activation, select Assign as Org Default, choose form factor, and Save
2. Required because no API exists

## Source

- **Reflection**: bf9ca1b2-c11b-4303-8f6a-c0fe714d95b5
- **Agent**: sfdc-metadata-manager
- **Enriched**: 2026-04-03
