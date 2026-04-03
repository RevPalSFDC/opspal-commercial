---
name: multi-flow-chain-deployment-with-sandbox-validation
description: "Deploy related flow chain to sandbox, validate with test records for each decision path, then promote to production with rollback commands documented"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:release-coordinator
---

# Multi Flow Chain Deployment With Sandbox Validation

Deploy related flow chain to sandbox, validate with test records for each decision path, then promote to production with rollback commands documented

## When to Use This Skill

- When deploying metadata that involves the patterns described here
- When working with Salesforce Flows or automation

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Deploy related flow chain to sandbox, validate with test records for each decision path, then promote to production with rollback commands documented
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 1aec1679-ed9b-4a87-81f2-34e387519a09
- **Agent**: release-coordinator
- **Enriched**: 2026-04-03
