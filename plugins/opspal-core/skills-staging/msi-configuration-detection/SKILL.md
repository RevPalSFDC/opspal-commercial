---
name: msi-configuration-detection
description: "Look for 'Interesting Moment' trigger campaigns to verify Marketo Sales Insight is configured"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-marketo:marketo-instance-discovery
---

# Msi Configuration Detection

Look for 'Interesting Moment' trigger campaigns to verify Marketo Sales Insight is configured

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: assessment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Look for 'Interesting Moment' trigger campaigns to verify Marketo Sales Insight is configured
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 1ca87d16-fd98-4e23-8ddb-78813e3665eb
- **Agent**: marketo-instance-discovery
- **Enriched**: 2026-04-03
