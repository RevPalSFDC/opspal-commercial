---
name: flow-entry-criteria-analysis
description: "Analyze flow <start> element for missing filterLogic/filters that could cause cascade failures on unrelated records"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Flow Entry Criteria Analysis

Analyze flow <start> element for missing filterLogic/filters that could cause cascade failures on unrelated records

## When to Use This Skill

- When performing audits or assessments of the target system
- When working with Salesforce Flows or automation

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Analyze flow <start> element for missing filterLogic/filters that could cause cascade failures on unrelated records
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 1b6ea1b0-ccd1-4efd-b33b-5d5b03b9cf1e
- **Agent**: manual implementation
- **Enriched**: 2026-04-03
