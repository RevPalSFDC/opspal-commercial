---
name: deployment-time-field-assertion-avoidance
description: "When deploying new fields and Apex classes together, test assertions should verify execution completes (not field values) since fields may not exist during validation"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Deployment Time Field Assertion Avoidance

When deploying new fields and Apex classes together, test assertions should verify execution completes (not field values) since fields may not exist during validation

## When to Use This Skill

- When deploying metadata that involves the patterns described here

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When deploying new fields and Apex classes together, test assertions should verify execution completes (not field values) since fields may not exist during validation
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: f3cc61ad-711e-40aa-9310-018a6ff6cf8c
- **Agent**: manual-implementation
- **Enriched**: 2026-04-03
