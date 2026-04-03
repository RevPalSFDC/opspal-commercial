---
name: slack-flow-pattern-replication
description: "When building Slack notification flows: 1) Find existing Slack flow in org, 2) Identify action (slackv2__invokePostMessage), 3) Extract messageDestinationId format, 4) Replicate pattern with new trigger object and message template"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
---

# Slack Flow Pattern Replication

When building Slack notification flows: 1) Find existing Slack flow in org, 2) Identify action (slackv2__invokePostMessage), 3) Extract messageDestinationId format, 4) Replicate pattern with new trigger object and message template

## When to Use This Skill

- When working with Salesforce Flows or automation

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When building Slack notification flows: 1) Find existing Slack flow in org, 2) Identify action (slackv2__invokePostMessage), 3) Extract messageDestinationId format, 4) Replicate pattern with new trigger object and message template
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 205e24da-57d8-4aa4-b8d0-2972072c1fb5
- **Agent**: manual investigation
- **Enriched**: 2026-04-03
