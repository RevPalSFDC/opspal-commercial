---
name: post-merge-customer-impact-assessment
description: "After Account merges, identify groups where Customer/Former Customer accounts were merged as non-survivors into Prospect survivors. Compare 40+ customer-specific writable fields between backup and live state, classify into RESTORE/SKIP/FLAG_CONFLICT, and tier by urgency (active customer vs former customer vs questionable merge)."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Post Merge Customer Impact Assessment

After Account merges, identify groups where Customer/Former Customer accounts were merged as non-survivors into Prospect survivors. Compare 40+ customer-specific writable fields between backup and live state, classify into RESTORE/SKIP/FLAG_CONFLICT, and tier by urgency (active customer vs former customer vs questionable merge).

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. After Account merges, identify groups where Customer/Former Customer accounts were merged as non-survivors into Prospect survivors
2. Compare 40+ customer-specific writable fields between backup and live state, classify into RESTORE/SKIP/FLAG_CONFLICT, and tier by urgency (active customer vs former customer vs questionable merge)

## Source

- **Reflection**: 84c4e5a8-8fb1-4c84-a53a-61e046ceaa2d
- **Agent**: manual (restore_customer_fields.py)
- **Enriched**: 2026-04-03
