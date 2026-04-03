---
name: low-risk-account-smoke-testing
description: "Find accounts with no open opps, no recent activity, or owned by non-sales users for safe smoke testing. Run basic sync, first-write-wins, and cleanup scenarios."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-orchestrator
---

# Low Risk Account Smoke Testing

Find accounts with no open opps, no recent activity, or owned by non-sales users for safe smoke testing. Run basic sync, first-write-wins, and cleanup scenarios.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Find accounts with no open opps, no recent activity, or owned by non-sales users for safe smoke testing
2. Run basic sync, first-write-wins, and cleanup scenarios

## Source

- **Reflection**: daeff285-4154-4eda-8518-6a2caeb4971b
- **Agent**: sfdc-orchestrator
- **Enriched**: 2026-04-03
