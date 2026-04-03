---
name: flow-xml-api-version-validation
description: "Before deploying screen flows, retrieve current org version and validate local XML for API version compatibility issues"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-deployment-manager
---

# Flow Xml Api Version Validation

Before deploying screen flows, retrieve current org version and validate local XML for API version compatibility issues

## When to Use This Skill

- Before executing the operation described in this skill
- When deploying metadata that involves the patterns described here
- When working with Salesforce Flows or automation

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Before deploying screen flows, retrieve current org version and validate local XML for API version compatibility issues
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: eafb6e6c-cb94-4471-b8d0-3f4733cecdf9
- **Agent**: sfdc-deployment-manager
- **Enriched**: 2026-04-03
