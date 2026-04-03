---
name: gong-scorecard-object-discovery
description: "When building Gong-related reports, first discover Gong custom objects via sf sobject list and describe Gong__Gong_Scorecard__c. Use SOQL GROUP BY with [COMPANY]() on Gong__Scorecard_Question_Answer_Score__c WHERE Is_Overall = true for per-AM quality averages."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Gong Scorecard Object Discovery

When building Gong-related reports, first discover Gong custom objects via sf sobject list and describe Gong__Gong_Scorecard__c. Use SOQL GROUP BY with [COMPANY]() on Gong__Scorecard_Question_Answer_Score__c WHERE Is_Overall = true for per-AM quality averages.

## When to Use This Skill

- When building or modifying reports and dashboards

**Category**: query
**Discovered from**: reflection analysis

## Workflow

1. When building Gong-related reports, first discover Gong custom objects via sf sobject list and describe Gong__Gong_Scorecard__c
2. Use SOQL GROUP BY with [COMPANY]() on Gong__Scorecard_Question_Answer_Score__c WHERE Is_Overall = true for per-AM quality averages

## Source

- **Reflection**: 4b9ec434-8117-46d3-b1e5-bceb31a8528b
- **Agent**: manual-execution
- **Enriched**: 2026-04-03
