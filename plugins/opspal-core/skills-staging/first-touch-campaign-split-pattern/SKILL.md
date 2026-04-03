---
name: first-touch-campaign-split-pattern
description: "Query existing First_Touch_Campaign__c before upload, split contacts into last-touch-only vs both-touches. Prevents overwriting existing First Touch attribution."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
---

# First Touch Campaign Split Pattern

Query existing First_Touch_Campaign__c before upload, split contacts into last-touch-only vs both-touches. Prevents overwriting existing First Touch attribution.

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: data-quality
**Discovered from**: reflection analysis

## Workflow

1. Query existing First_Touch_Campaign__c before upload, split contacts into last-touch-only vs both-touches
2. Prevents overwriting existing First Touch attribution

## Source

- **Reflection**: 6181da08-9c5b-4d95-98df-70790dcdcbc7
- **Agent**: manual
- **Enriched**: 2026-04-03
