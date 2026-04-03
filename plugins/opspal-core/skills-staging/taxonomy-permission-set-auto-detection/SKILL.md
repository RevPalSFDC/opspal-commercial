---
name: taxonomy-permission-set-auto-detection
description: "When deploying taxonomy-related fields, grep existing permission sets for [COMPANY]__c or Market__c to find taxonomy perm sets that should be updated"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:main-conversation
---

# Taxonomy Permission Set Auto Detection

When deploying taxonomy-related fields, grep existing permission sets for [COMPANY]__c or Market__c to find taxonomy perm sets that should be updated

## When to Use This Skill

- When deploying metadata that involves the patterns described here

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When deploying taxonomy-related fields, grep existing permission sets for [COMPANY]__c or Market__c to find taxonomy perm sets that should be updated
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: daeff285-4154-4eda-8518-6a2caeb4971b
- **Agent**: main-conversation
- **Enriched**: 2026-04-03
