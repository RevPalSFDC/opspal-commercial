---
name: cpq-renewal-linkage-bulk-audit
description: "When a second instance of the same CPQ data integrity issue is found in the same org, escalate from individual record repair to org-wide audit. Run: SELECT COUNT() FROM SBQQ__Quote__c WHERE SBQQ__Type__c = 'Renewal' AND SBQQ__MasterContract__c = null to scope the problem before fixing individual records."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-cpq-assessor
---

# Cpq Renewal Linkage Bulk Audit

When a second instance of the same CPQ data integrity issue is found in the same org, escalate from individual record repair to org-wide audit. Run: SELECT COUNT() FROM SBQQ__Quote__c WHERE SBQQ__Type__c = 'Renewal' AND SBQQ__MasterContract__c = null to scope the problem before fixing individual records.

## When to Use This Skill

- Before executing the operation described in this skill
- When performing audits or assessments of the target system
- When encountering errors that match this pattern

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. When a second instance of the same CPQ data integrity issue is found in the same org, escalate from individual record repair to org-wide audit
2. Run: SELECT COUNT() FROM SBQQ__Quote__c WHERE SBQQ__Type__c = 'Renewal' AND SBQQ__MasterContract__c = null to scope the problem before fixing individual records

## Source

- **Reflection**: 3d9302ff-b7d3-4c58-908d-acfecfd4a827
- **Agent**: sfdc-cpq-assessor
- **Enriched**: 2026-04-03
