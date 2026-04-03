---
name: plan-to-routing-compliance-mapper
description: "Before executing a prescriptive plan, parse each step and map it against CLAUDE.md routing table to identify which agents must be invoked. Flag any steps that match mandatory routing but lack agent delegation."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:direct observation
---

# Plan To Routing Compliance Mapper

Before executing a prescriptive plan, parse each step and map it against CLAUDE.md routing table to identify which agents must be invoked. Flag any steps that match mandatory routing but lack agent delegation.

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Before executing a prescriptive plan, parse each step and map it against CLAUDE
2. md routing table to identify which agents must be invoked
3. Flag any steps that match mandatory routing but lack agent delegation

## Source

- **Reflection**: f3058671-e530-4203-be2c-05db0644ad4c
- **Agent**: direct observation
- **Enriched**: 2026-04-03
