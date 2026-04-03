---
name: enhanced-folder-sharing-access-diagnostic
description: "When REST API returns NOT_FOUND for reports, verify with [COMPANY] ROWS keyword and check folder ownership (unfiled$ pattern) before concluding deletion. Recommend admin impersonation to verify and fix."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
agent: opspal-salesforce:sfdc-reports-dashboards
---

# Enhanced Folder Sharing Access Diagnostic

When REST API returns NOT_FOUND for reports, verify with [COMPANY] ROWS keyword and check folder ownership (unfiled$ pattern) before concluding deletion. Recommend admin impersonation to verify and fix.

## When to Use This Skill

- Before executing the operation described in this skill
- When encountering errors that match this pattern
- When building or modifying reports and dashboards

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. When REST API returns NOT_FOUND for reports, verify with [COMPANY] ROWS keyword and check folder ownership (unfiled$ pattern) before concluding deletion
2. Recommend admin impersonation to verify and fix

## Source

- **Reflection**: 882e3ac5-b0c2-4f34-ab3d-cc094d1a4481
- **Agent**: sfdc-reports-dashboards
- **Enriched**: 2026-04-03
