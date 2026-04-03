---
name: event-lead-import-waterfall
description: "Match event attendees in order: Email exact → Name+Company fuzzy → Company fuzzy → Lead creation fallback"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:custom Python script
---

# Event Lead Import Waterfall

Match event attendees in order: Email exact → Name+Company fuzzy → Company fuzzy → Lead creation fallback

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Match event attendees in order: Email exact → Name+Company fuzzy → Company fuzzy → Lead creation fallback
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: f481c1bb-2f81-4ff6-95f4-e071921a6311
- **Agent**: custom Python script
- **Enriched**: 2026-04-03
