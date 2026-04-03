---
name: territory-scoped-dashboard-clone
description: "Clone source dashboard reports via Analytics REST API clone+patch, generate dashboard XML by swapping report references, deploy via Metadata API"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Territory Scoped Dashboard Clone

Clone source dashboard reports via Analytics REST API clone+patch, generate dashboard XML by swapping report references, deploy via Metadata API

## When to Use This Skill

- When deploying metadata that involves the patterns described here
- When building or modifying reports and dashboards

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Clone source dashboard reports via Analytics REST API clone+patch, generate dashboard XML by swapping report references, deploy via Metadata API
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 55e2f887-ed2c-4997-9008-774cd7195ca9
- **Agent**: manual orchestration with general-purpose sub-agents
- **Enriched**: 2026-04-03
