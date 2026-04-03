---
name: industry-segment-compatibility-validation
description: "Check Industry values against Segment2__c whitelist (government segments should only have government-related Industries), then drill into Sub_Segment__c for edge case detection (university police, hospital EMS, fire marshals)"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Industry Segment Compatibility Validation

Check Industry values against Segment2__c whitelist (government segments should only have government-related Industries), then drill into Sub_Segment__c for edge case detection (university police, hospital EMS, fire marshals)

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Check Industry values against Segment2__c whitelist (government segments should only have government-related Industries), then drill into Sub_Segment__c for edge case detection (university police, hospital EMS, fire marshals)
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 728fd241-d396-4d87-ba69-d8c2e0ffb41b
- **Agent**: manual workflow
- **Enriched**: 2026-04-03
