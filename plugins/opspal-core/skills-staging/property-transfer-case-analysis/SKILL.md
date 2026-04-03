---
name: property-transfer-case-analysis
description: "Query open Property Transfer cases filtered by Property__c.Active__c status using semi-join subquery through Property_Association__c junction object"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: salesforce-plugin:sfdc-cli-executor
---

# Property Transfer Case Analysis

Query open Property Transfer cases filtered by Property__c.Active__c status using semi-join subquery through Property_Association__c junction object

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: query
**Discovered from**: reflection analysis

## Workflow

1. Query open Property Transfer cases filtered by Property__c
2. Active__c status using semi-join subquery through Property_Association__c junction object

## Source

- **Reflection**: abbe389c-9542-495d-83a7-fd6706107e9c
- **Agent**: salesforce-plugin:sfdc-cli-executor
- **Enriched**: 2026-04-03
