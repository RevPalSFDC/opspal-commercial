---
name: handoff-document-generation
description: "Generate standardized deployment handoff documents with Executive Summary, Schema, Permission Model, Testing Results, Rollback Procedure sections"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: salesforce-plugin:sfdc-planner
---

# Handoff Document Generation

Generate standardized deployment handoff documents with Executive Summary, Schema, Permission Model, Testing Results, Rollback Procedure sections

## When to Use This Skill

- When deploying metadata that involves the patterns described here

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Generate standardized deployment handoff documents with Executive Summary, Schema, Permission Model, Testing Results, Rollback Procedure sections
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 9594333a-25d6-4900-91df-6ae7c83136c4
- **Agent**: salesforce-plugin:sfdc-planner
- **Enriched**: 2026-04-03
