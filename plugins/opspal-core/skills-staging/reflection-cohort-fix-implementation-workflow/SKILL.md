---
name: reflection-cohort-fix-implementation-workflow
description: "When /[SFDC_ID] outputs approved fix plan: (1) implement simpler fixes first, (2) verify with node -e tests, (3) single commit with all changes + version bumps, (4) push, (5) run process-reflections.js --execute to update Supabase and create Asana tasks"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
---

# Reflection Cohort Fix Implementation Workflow

When /[SFDC_ID] outputs approved fix plan: (1) implement simpler fixes first, (2) verify with node -e tests, (3) single commit with all changes + version bumps, (4) push, (5) run process-reflections.js --execute to update Supabase and create Asana tasks

## When to Use This Skill

- When encountering errors that match this pattern

**Category**: plugin-development
**Discovered from**: reflection analysis

## Workflow

1. When /[SFDC_ID] outputs approved fix plan: (1) implement simpler fixes first, (2) verify with node -e tests, (3) single commit with all changes + version bumps, (4) push, (5) run process-reflections
2. js --execute to update Supabase and create Asana tasks

## Source

- **Reflection**: 801602bd-8229-4f11-aee2-32f5baf03447
- **Agent**: unknown
- **Enriched**: 2026-04-03
