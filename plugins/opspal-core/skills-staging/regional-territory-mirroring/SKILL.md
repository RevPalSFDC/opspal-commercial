---
name: regional-territory-mirroring
description: "When a segment needs territory coverage, mirror an existing regional hierarchy by creating leaf territories under each region parent with matching state assignments. Deploy all territories and rules in a single metadata package."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-territory-orchestrator
---

# Regional Territory Mirroring

When a segment needs territory coverage, mirror an existing regional hierarchy by creating leaf territories under each region parent with matching state assignments. Deploy all territories and rules in a single metadata package.

## When to Use This Skill

- When deploying metadata that involves the patterns described here

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. When a segment needs territory coverage, mirror an existing regional hierarchy by creating leaf territories under each region parent with matching state assignments
2. Deploy all territories and rules in a single metadata package

## Source

- **Reflection**: b3ce86e8-bf51-4392-8ea4-75296b15bfdd
- **Agent**: sfdc-territory-orchestrator
- **Enriched**: 2026-04-03
