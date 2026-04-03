---
name: recordcreate-storeoutputautomatically-reference
description: "When RecordCreate uses storeOutputAutomatically=true, reference as {!ElementName} not {!ElementName.Id}"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
agent: opspal-core:direct-execution
---

# Recordcreate Storeoutputautomatically Reference

When RecordCreate uses storeOutputAutomatically=true, reference as {!ElementName} not {!ElementName.Id}

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When RecordCreate uses storeOutputAutomatically=true, reference as {!ElementName} not {!ElementName.Id}
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 4bc1a9d6-e0cf-41f4-8058-b9cdffa3c504
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
