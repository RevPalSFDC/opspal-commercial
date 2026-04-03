---
name: canadian-address-reconstruction
description: "Detect numeric-only BillingStreet + street-name-in-BillingCity pattern, reconstruct proper address fields"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-data-operations
---

# Canadian Address Reconstruction

Detect numeric-only BillingStreet + street-name-in-BillingCity pattern, reconstruct proper address fields

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: data-quality
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Detect numeric-only BillingStreet + street-name-in-BillingCity pattern, reconstruct proper address fields
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 3f3dddf0-cc84-42ab-a851-c252339f4f4c
- **Agent**: sfdc-data-operations
- **Enriched**: 2026-04-03
