---
name: pdf-diagram-verification
description: "After PDF generation, verify: 1) File size is appropriate, 2) Mermaid diagram count matches source, 3) Cover template is correct branded version"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
---

# Pdf Diagram Verification

After PDF generation, verify: 1) File size is appropriate, 2) Mermaid diagram count matches source, 3) Cover template is correct branded version

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: After PDF generation, verify: 1) File size is appropriate, 2) Mermaid diagram count matches source, 3) Cover template is correct branded version
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 75fd8bf4-41b9-489d-ae98-245f4da7aee0
- **Agent**: manual workflow
- **Enriched**: 2026-04-03
