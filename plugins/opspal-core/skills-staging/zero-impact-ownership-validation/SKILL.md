---
name: zero-impact-ownership-validation
description: "Before deployments that could affect record ownership: 1) Capture baseline Account.OwnerId distribution, 2) Perform deployment, 3) Re-query ownership distribution, 4) Compare and fail if any changes detected. Provides mathematical proof of zero ownership impact for compliance/audit purposes."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-validation-testing
---

# Zero Impact Ownership Validation

Before deployments that could affect record ownership: 1) Capture baseline Account.OwnerId distribution, 2) Perform deployment, 3) Re-query ownership distribution, 4) Compare and fail if any changes detected. Provides mathematical proof of zero ownership impact for compliance/audit purposes.

## When to Use This Skill

- Before executing the operation described in this skill
- When deploying metadata that involves the patterns described here
- When performing audits or assessments of the target system

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Before deployments that could affect record ownership: 1) Capture baseline Account
2. OwnerId distribution, 2) Perform deployment, 3) Re-query ownership distribution, 4) Compare and fail if any changes detected
3. Provides mathematical proof of zero ownership impact for compliance/audit purposes

## Source

- **Reflection**: 1566c1a7-aa6a-4212-8572-f1a9687152f8
- **Agent**: sfdc-validation-testing
- **Enriched**: 2026-04-03
