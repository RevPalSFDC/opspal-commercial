---
name: pre-migration-backup-with-verification
description: "Export critical objects with ownership fields, generate checksums, create manifest with rollback instructions, calculate critical field hashes for post-migration verification"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Pre Migration Backup With Verification

Export critical objects with ownership fields, generate checksums, create manifest with rollback instructions, calculate critical field hashes for post-migration verification

## When to Use This Skill

- During data import or bulk operations

**Category**: data-operations
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Export critical objects with ownership fields, generate checksums, create manifest with rollback instructions, calculate critical field hashes for post-migration verification
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 5f910a88-17d3-488c-8f14-077a311dffb9
- **Agent**: manual execution with sf data query
- **Enriched**: 2026-04-03
