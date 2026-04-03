---
name: scheduled-job-lifecycle-management-during-deploy
description: "Abort CronTrigger jobs -> Deploy -> Reschedule jobs pattern for [COMPANY] classes with active scheduled jobs"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Scheduled Job Lifecycle Management During Deploy

Abort CronTrigger jobs -> Deploy -> Reschedule jobs pattern for [COMPANY] classes with active scheduled jobs

## When to Use This Skill

- When deploying metadata that involves the patterns described here

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Abort CronTrigger jobs -> Deploy -> Reschedule jobs pattern for [COMPANY] classes with active scheduled jobs
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: f70ece73-654c-46f0-bdd8-b803f4f8638c
- **Agent**: manual
- **Enriched**: 2026-04-03
