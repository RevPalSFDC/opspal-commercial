---
name: classification-confidence-scoring
description: "Categorize accounts by HIGH/MEDIUM/LOW confidence based on keyword patterns, show examples before bulk updates, only auto-update HIGH confidence"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-data-operations
---

# Classification Confidence Scoring

Categorize accounts by HIGH/MEDIUM/LOW confidence based on keyword patterns, show examples before bulk updates, only auto-update HIGH confidence

## When to Use This Skill

- Before executing the operation described in this skill
- During data import or bulk operations

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Categorize accounts by HIGH/MEDIUM/LOW confidence based on keyword patterns, show examples before bulk updates, only auto-update HIGH confidence
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 503a3710-ebec-4c23-9bf3-78d6b5f6dc23
- **Agent**: sfdc-data-operations
- **Enriched**: 2026-04-03
