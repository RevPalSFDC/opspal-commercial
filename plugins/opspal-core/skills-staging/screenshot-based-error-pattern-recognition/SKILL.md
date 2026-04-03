---
name: screenshot-based-error-pattern-recognition
description: "User shares a screenshot of a CPQ error on a different record. Read the screenshot, extract the error message, match against known error signatures from previous investigations in the same org, and immediately correlate to the systemic root cause without re-running the full investigation."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-cpq-assessor
---

# Screenshot Based Error Pattern Recognition

User shares a screenshot of a CPQ error on a different record. Read the screenshot, extract the error message, match against known error signatures from previous investigations in the same org, and immediately correlate to the systemic root cause without re-running the full investigation.

## When to Use This Skill

- When encountering errors that match this pattern

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. User shares a screenshot of a CPQ error on a different record
2. Read the screenshot, extract the error message, match against known error signatures from previous investigations in the same org, and immediately correlate to the systemic root cause without re-running the full investigation

## Source

- **Reflection**: 3d9302ff-b7d3-4c58-908d-acfecfd4a827
- **Agent**: sfdc-cpq-assessor
- **Enriched**: 2026-04-03
