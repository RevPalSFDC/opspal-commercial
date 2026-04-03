---
name: public-group-creation-via-metadata-api
description: "Create Public Groups by deploying Group metadata XML via sf project deploy start, then add members via sf data create record on GroupMember object"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-cli-executor
---

# Public Group Creation Via Metadata Api

Create Public Groups by deploying Group metadata XML via sf project deploy start, then add members via sf data create record on GroupMember object

## When to Use This Skill

- When deploying metadata that involves the patterns described here

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Create Public Groups by deploying Group metadata XML via sf project deploy start, then add members via sf data create record on GroupMember object
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 882e3ac5-b0c2-4f34-ab3d-cc094d1a4481
- **Agent**: sfdc-cli-executor
- **Enriched**: 2026-04-03
