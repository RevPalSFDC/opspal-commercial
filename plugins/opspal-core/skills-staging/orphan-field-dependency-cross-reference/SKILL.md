---
name: orphan-field-dependency-cross-reference
description: "For fields not on any layout, check (1) Analytics API report describe for field references in recently-modified reports, (2) Tooling API for [COMPANY] XML field references, (3) ValidationRule formulas, (4) WorkflowRule references. Produces safe-to-delete vs has-dependencies classification."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-reports-dashboards
---

# Orphan Field Dependency Cross Reference

For fields not on any layout, check (1) Analytics API report describe for field references in recently-modified reports, (2) Tooling API for [COMPANY] XML field references, (3) ValidationRule formulas, (4) WorkflowRule references. Produces safe-to-delete vs has-dependencies classification.

## When to Use This Skill

- When working with Salesforce Flows or automation
- When building or modifying reports and dashboards

**Category**: assessment
**Discovered from**: reflection analysis

## Workflow

1. For fields not on any layout, check (1) Analytics API report describe for field references in recently-modified reports, (2) Tooling API for [COMPANY] XML field references, (3) ValidationRule formulas, (4) WorkflowRule references
2. Produces safe-to-delete vs has-dependencies classification

## Source

- **Reflection**: 04799434-c782-4aeb-86c1-73c7512c17a4
- **Agent**: opspal-salesforce:sfdc-reports-dashboards
- **Enriched**: 2026-04-03
