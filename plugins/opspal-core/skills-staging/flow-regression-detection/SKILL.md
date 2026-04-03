---
name: flow-regression-detection
description: "When a client iterates on a flow we previously fixed (v5 fix lost in v8), compare current active version against our last-deployed version to detect regression of defensive guards."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:flow-diagnostician
---

# Flow Regression Detection

When a client iterates on a flow we previously fixed (v5 fix lost in v8), compare current active version against our last-deployed version to detect regression of defensive guards.

## When to Use This Skill

- When deploying metadata that involves the patterns described here
- When encountering errors that match this pattern
- When working with Salesforce Flows or automation

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When a client iterates on a flow we previously fixed (v5 fix lost in v8), compare current active version against our last-deployed version to detect regression of defensive guards.
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 6dcc677e-a05c-4dab-b82a-79aa86a558a7
- **Agent**: opspal-salesforce:flow-diagnostician
- **Enriched**: 2026-04-03
