---
name: tooling-api-post-deployment-verification
description: "Use EntityParticle Tooling API query to verify field creation immediately after deployment, bypassing standard describe cache delay"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct execution
---

# Tooling Api Post Deployment Verification

Use EntityParticle Tooling API query to verify field creation immediately after deployment, bypassing standard describe cache delay

## When to Use This Skill

- When deploying metadata that involves the patterns described here

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Use EntityParticle Tooling API query to verify field creation immediately after deployment, bypassing standard describe cache delay
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 4b4fb509-51fb-4274-9078-a6ee0f21384e
- **Agent**: direct execution
- **Enriched**: 2026-04-03
