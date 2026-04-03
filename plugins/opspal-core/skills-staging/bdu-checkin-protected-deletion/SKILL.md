---
name: bdu-checkin-protected-deletion
description: "Query BDU_Checkin__c records before Opportunity deletion; block if records exist"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
---

# Bdu Checkin Protected Deletion

Query BDU_Checkin__c records before Opportunity deletion; block if records exist

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Query BDU_Checkin__c records before Opportunity deletion
2. block if records exist

## Source

- **Reflection**: 1209b25f-1ae2-4939-9bf0-6b8b0050471d
- **Agent**: manual implementation during session
- **Enriched**: 2026-04-03
