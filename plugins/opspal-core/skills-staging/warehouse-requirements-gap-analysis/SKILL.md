---
name: warehouse-requirements-gap-analysis
description: "Extract warehouse team requirements from business document, cross-reference against deployed staging metadata XML, produce gap table with [COMPANY] 3 (fixes needed) and Section 4 (new fields), then execute deployment in metadata-manager → layout → permissions sequence"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:parent-orchestration
---

# Warehouse Requirements Gap Analysis

Extract warehouse team requirements from business document, cross-reference against deployed staging metadata XML, produce gap table with [COMPANY] 3 (fixes needed) and Section 4 (new fields), then execute deployment in metadata-manager → layout → permissions sequence

## When to Use This Skill

- When deploying metadata that involves the patterns described here
- When encountering errors that match this pattern

**Category**: assessment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Extract warehouse team requirements from business document, cross-reference against deployed staging metadata XML, produce gap table with [COMPANY] 3 (fixes needed) and Section 4 (new fields), then execute deployment in metadata-manager → layout → permissions sequence
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 33e730bd-688b-4b65-8b69-6ff7258698af
- **Agent**: parent-orchestration
- **Enriched**: 2026-04-03
