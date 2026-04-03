---
name: documentation-driven-assessment
description: "Use existing documentation (NotebookLM, field definitions) as input context for assessment agents to focus analysis"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-hubspot:hubspot-assessment-analyzer
---

# Documentation Driven Assessment

Use existing documentation (NotebookLM, field definitions) as input context for assessment agents to focus analysis

## When to Use This Skill

- When performing audits or assessments of the target system

**Category**: assessment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Use existing documentation (NotebookLM, field definitions) as input context for assessment agents to focus analysis
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 6dd64b89-3fa4-4fc7-8a03-fd0634b802b9
- **Agent**: hubspot-assessment-analyzer
- **Enriched**: 2026-04-03
