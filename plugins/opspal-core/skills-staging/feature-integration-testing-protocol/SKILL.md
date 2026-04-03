---
name: feature-integration-testing-protocol
description: "For new Claude Code features: (1) Test scripts individually with CLI, (2) Validate hook syntax with bash -n, (3) Test hook execution with mock inputs, (4) End-to-end test by triggering actual events (Task, PR, session end)"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Feature Integration Testing Protocol

For new Claude Code features: (1) Test scripts individually with CLI, (2) Validate hook syntax with bash -n, (3) Test hook execution with mock inputs, (4) End-to-end test by triggering actual events (Task, PR, session end)

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: plugin-validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: For new Claude Code features: (1) Test scripts individually with CLI, (2) Validate hook syntax with bash -n, (3) Test hook execution with mock inputs, (4) End-to-end test by triggering actual events (Task, PR, session end)
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 75877dc2-09ec-4791-bf47-a7376e704520
- **Agent**: unknown
- **Enriched**: 2026-04-03
