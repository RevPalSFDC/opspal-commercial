---
name: dual-platform-root-cause-analysis
description: "When routing fails, check both platforms systematically: Marketo campaign flow steps (UI-only), SFDC assignment rules, LeanData status, and manual reassignment patterns."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:team-lead coordination
---

# Dual Platform Root Cause Analysis

When routing fails, check both platforms systematically: Marketo campaign flow steps (UI-only), SFDC assignment rules, LeanData status, and manual reassignment patterns.

## When to Use This Skill

- When working with Salesforce Flows or automation

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When routing fails, check both platforms systematically: Marketo campaign flow steps (UI-only), SFDC assignment rules, LeanData status, and manual reassignment patterns.
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 14c455e9-df60-48cc-93e4-7ab35e8e9815
- **Agent**: team-lead coordination
- **Enriched**: 2026-04-03
