---
name: fm-territory-expansion
description: "Create Territory2 under Field Marketing parent, assign user, bulk-assign accounts via Apex OTA inserts, update FMTerritoryNameStampBatch, deploy and execute batch"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-territory-orchestrator
---

# Fm Territory Expansion

Create Territory2 under Field Marketing parent, assign user, bulk-assign accounts via Apex OTA inserts, update FMTerritoryNameStampBatch, deploy and execute batch

## When to Use This Skill

- When deploying metadata that involves the patterns described here
- During data import or bulk operations

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Create Territory2 under Field Marketing parent, assign user, bulk-assign accounts via Apex OTA inserts, update FMTerritoryNameStampBatch, deploy and execute batch
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 82e8e206-7207-4ae2-b2c0-085148dc84e2
- **Agent**: sfdc-territory-orchestrator
- **Enriched**: 2026-04-03
