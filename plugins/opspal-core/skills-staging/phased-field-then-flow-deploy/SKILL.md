---
name: phased-field-then-flow-deploy
description: "When deploying flows that reference custom fields to a new org, deploy fields first in a separate package, verify via describe, then deploy the flow. Prevents 'field not found' deployment failures."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-deployment-manager
---

# Phased Field Then Flow Deploy

When deploying flows that reference custom fields to a new org, deploy fields first in a separate package, verify via describe, then deploy the flow. Prevents 'field not found' deployment failures.

## When to Use This Skill

- When deploying metadata that involves the patterns described here
- When working with Salesforce Flows or automation

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. When deploying flows that reference custom fields to a new org, deploy fields first in a separate package, verify via describe, then deploy the flow
2. Prevents 'field not found' deployment failures

## Source

- **Reflection**: dbafd749-f4a4-4846-b526-c70796628d7b
- **Agent**: sfdc-deployment-manager
- **Enriched**: 2026-04-03
