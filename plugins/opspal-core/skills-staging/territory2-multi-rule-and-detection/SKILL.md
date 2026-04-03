---
name: territory2-multi-rule-and-detection
description: "When Territory2 assignments fail unexpectedly, compare single-rule vs multi-rule territory results. If single-rule territories work (100% assignment) but multi-rule territories fail (0% assignment), root cause is multi-rule AND evaluation. Evidence: West_FY26 (2 rules, 1 manual assignment only), Northeast_FY26 (2 rules, 0 assignments) vs South (1 rule, 17 assignments), Midwest (1 rule, 13 assignments)."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-orchestrator
---

# Territory2 Multi Rule And Detection

When Territory2 assignments fail unexpectedly, compare single-rule vs multi-rule territory results. If single-rule territories work (100% assignment) but multi-rule territories fail (0% assignment), root cause is multi-rule AND evaluation. Evidence: West_FY26 (2 rules, 1 manual assignment only), Northeast_FY26 (2 rules, 0 assignments) vs South (1 rule, 17 assignments), Midwest (1 rule, 13 assignments).

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. When Territory2 assignments fail unexpectedly, compare single-rule vs multi-rule territory results
2. If single-rule territories work (100% assignment) but multi-rule territories fail (0% assignment), root cause is multi-rule AND evaluation
3. Evidence: West_FY26 (2 rules, 1 manual assignment only), Northeast_FY26 (2 rules, 0 assignments) vs South (1 rule, 17 assignments), Midwest (1 rule, 13 assignments)

## Source

- **Reflection**: 47c83e67-fb76-4ce8-88ad-541497845ad1
- **Agent**: sfdc-orchestrator
- **Enriched**: 2026-04-03
