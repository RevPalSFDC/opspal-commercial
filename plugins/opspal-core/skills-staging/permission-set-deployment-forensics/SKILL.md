---
name: permission-set-deployment-forensics
description: "When field permissions are unexpectedly missing: (1) Check [SFDC_ID] for FieldPermissions changes, (2) Identify the actor and timestamp, (3) Correlate with session reflections from that timeframe, (4) Check if permission set XML was created from scratch (low line count) vs retrieved (high line count), (5) Verify local XML against org state for drift."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Permission Set Deployment Forensics

When field permissions are unexpectedly missing: (1) Check [SFDC_ID] for FieldPermissions changes, (2) Identify the actor and timestamp, (3) Correlate with session reflections from that timeframe, (4) Check if permission set XML was created from scratch (low line count) vs retrieved (high line count), (5) Verify local XML against org state for drift.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When field permissions are unexpectedly missing: (1) Check [SFDC_ID] for FieldPermissions changes, (2) Identify the actor and timestamp, (3) Correlate with session reflections from that timeframe, (4) Check if permission set XML was created from scratch (low line count) vs retrieved (high line count), (5) Verify local XML against org state for drift.
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: fa7ce0b1-d258-4c1c-ac0d-7b0834a0fae5
- **Agent**: manual
- **Enriched**: 2026-04-03
