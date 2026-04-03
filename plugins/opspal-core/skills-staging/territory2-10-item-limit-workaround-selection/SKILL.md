---
name: territory2-10-item-limit-workaround-selection
description: "When territory requires >10 assignment criteria (states, zips, etc.), evaluate workarounds in this order: (1) Formula field consolidation (preferred - single rule, scalable, no AND issue), (2) BooleanFilter creative reference (experimental - needs testing), (3) Separate sub-territories (violates business requirements), (4) Custom Apex (last resort). Never use multi-rule approach without explicit AND limitation acknowledgment."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-territory-architect
---

# Territory2 10 Item Limit Workaround Selection

When territory requires >10 assignment criteria (states, zips, etc.), evaluate workarounds in this order: (1) Formula field consolidation (preferred - single rule, scalable, no AND issue), (2) BooleanFilter creative reference (experimental - needs testing), (3) Separate sub-territories (violates business requirements), (4) Custom Apex (last resort). Never use multi-rule approach without explicit AND limitation acknowledgment.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. When territory requires >10 assignment criteria (states, zips, etc
2. ), evaluate workarounds in this order: (1) Formula field consolidation (preferred - single rule, scalable, no AND issue), (2) BooleanFilter creative reference (experimental - needs testing), (3) Separate sub-territories (violates business requirements), (4) Custom Apex (last resort)
3. Never use multi-rule approach without explicit AND limitation acknowledgment

## Source

- **Reflection**: 47c83e67-fb76-4ce8-88ad-541497845ad1
- **Agent**: sfdc-territory-architect
- **Enriched**: 2026-04-03
