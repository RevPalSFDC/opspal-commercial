---
name: contact-account-mismatch-org-scan
description: "Export accounts+contacts, build domain index, classify contacts by email-vs-website domain match, aggregate by account with severity tiers, detect bulk import signals"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
agent: opspal-core:direct execution (Python scripts)
---

# Contact Account Mismatch Org Scan

Export accounts+contacts, build domain index, classify contacts by email-vs-website domain match, aggregate by account with severity tiers, detect bulk import signals

## When to Use This Skill

- During data import or bulk operations

**Category**: assessment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Export accounts+contacts, build domain index, classify contacts by email-vs-website domain match, aggregate by account with severity tiers, detect bulk import signals
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 8ebcce08-e26d-41e7-992b-231ce1fda7a8
- **Agent**: direct execution (Python scripts)
- **Enriched**: 2026-04-03
