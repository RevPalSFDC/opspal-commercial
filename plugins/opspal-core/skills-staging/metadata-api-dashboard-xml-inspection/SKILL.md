---
name: metadata-api-dashboard-xml-inspection
description: "Retrieve dashboard XML via sf project retrieve start --metadata Dashboard and parse <dashboardType> for definitive running user classification"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-cli-executor
---

# Metadata Api Dashboard Xml Inspection

Retrieve dashboard XML via sf project retrieve start --metadata Dashboard and parse <dashboardType> for definitive running user classification

## When to Use This Skill

- When building or modifying reports and dashboards

**Category**: assessment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Retrieve dashboard XML via sf project retrieve start --metadata Dashboard and parse <dashboardType> for definitive running user classification
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: eacded47-3ba9-49bd-b51c-9a3a3c151f32
- **Agent**: sfdc-cli-executor
- **Enriched**: 2026-04-03
