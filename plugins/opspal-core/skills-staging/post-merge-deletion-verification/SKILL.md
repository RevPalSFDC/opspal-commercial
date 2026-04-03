---
name: post-merge-deletion-verification
description: "After merge, query non-survivor WITHOUT --all-rows flag. If record returns, merge failed. Never rely on Apex debug output or sf apex run exit code as merge confirmation."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
---

# Post Merge Deletion Verification

After merge, query non-survivor WITHOUT --all-rows flag. If record returns, merge failed. Never rely on Apex debug output or sf apex run exit code as merge confirmation.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. After merge, query non-survivor WITHOUT --all-rows flag
2. If record returns, merge failed
3. Never rely on Apex debug output or sf apex run exit code as merge confirmation

## Source

- **Reflection**: f9150f4e-1415-4055-bc71-55848222bda0
- **Agent**: manual execution
- **Enriched**: 2026-04-03
