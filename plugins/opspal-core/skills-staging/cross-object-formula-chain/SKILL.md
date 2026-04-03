---
name: cross-object-formula-chain
description: "Create Text field on child object (User.Territory_Name__c), then formula on parent referencing it (Account.Owner_Territory__c = Owner.Territory_Name__c), then use that formula field in other formulas on same object for layered classification."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-metadata-manager
---

# Cross Object Formula Chain

Create Text field on child object (User.Territory_Name__c), then formula on parent referencing it (Account.Owner_Territory__c = Owner.Territory_Name__c), then use that formula field in other formulas on same object for layered classification.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Create Text field on child object (User
2. Territory_Name__c), then formula on parent referencing it (Account
3. Owner_Territory__c = Owner
4. Territory_Name__c), then use that formula field in other formulas on same object for layered classification

## Source

- **Reflection**: 8d620f82-ea28-481e-a50b-b8f40e6059b2
- **Agent**: sfdc-metadata-manager
- **Enriched**: 2026-04-03
