---
name: cpq-bundle-integrity-validation
description: "For bundle child records (quote lines and subscriptions): verify (1) Bundle flag = false, (2) ProductOption is populated and belongs to the correct parent bundle's ConfiguredSKU, (3) RequiredBy/RequiredById points to a valid parent, (4) product on the line matches the ProductOption's OptionalSKU"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-cpq-assessor
---

# Cpq Bundle Integrity Validation

For bundle child records (quote lines and subscriptions): verify (1) Bundle flag = false, (2) ProductOption is populated and belongs to the correct parent bundle's ConfiguredSKU, (3) RequiredBy/RequiredById points to a valid parent, (4) product on the line matches the ProductOption's OptionalSKU

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: For bundle child records (quote lines and subscriptions): verify (1) Bundle flag = false, (2) ProductOption is populated and belongs to the correct parent bundle's ConfiguredSKU, (3) RequiredBy/RequiredById points to a valid parent, (4) product on the line matches the ProductOption's OptionalSKU
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: ac2a260f-0163-4882-9447-d29b7cc7ad37
- **Agent**: sfdc-cpq-assessor
- **Enriched**: 2026-04-03
