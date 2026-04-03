---
name: county-account-territory-linking
description: "Create County__c records with state/country, then bulk update Account.County2__c lookup field based on Agency_County__c text matching"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct-execution
---

# County Account Territory Linking

Create County__c records with state/country, then bulk update Account.County2__c lookup field based on Agency_County__c text matching

## When to Use This Skill

- During data import or bulk operations

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Create County__c records with state/country, then bulk update Account
2. County2__c lookup field based on Agency_County__c text matching

## Source

- **Reflection**: 3fae6ab4-04f3-4eea-b5a1-364499f4db68
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
