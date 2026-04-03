---
name: custom-routing-architecture-discovery
description: "When standard SFDC Assignment Rules are absent, systematically query custom objects with 'Queue', 'Assignment', 'Routing', or 'Round_Robin' in the name to discover custom routing systems"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:direct-execution
---

# Custom Routing Architecture Discovery

When standard SFDC Assignment Rules are absent, systematically query custom objects with 'Queue', 'Assignment', 'Routing', or 'Round_Robin' in the name to discover custom routing systems

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: assessment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When standard SFDC Assignment Rules are absent, systematically query custom objects with 'Queue', 'Assignment', 'Routing', or 'Round_Robin' in the name to discover custom routing systems
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 66603b54-e8d3-4b48-8507-a4cd0ca6bae2
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
