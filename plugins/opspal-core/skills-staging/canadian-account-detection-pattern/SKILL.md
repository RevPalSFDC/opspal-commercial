---
name: canadian-account-detection-pattern
description: "Multi-signal detection of Canadian accounts using: (1) Province prefix in account name (AB:, BC:, ON:, etc.), (2) .ca website domain, (3) .ca contact email domains, (4) BillingState containing Canadian province names"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:Direct execution with sf data query
---

# Canadian Account Detection Pattern

Multi-signal detection of Canadian accounts using: (1) Province prefix in account name (AB:, BC:, ON:, etc.), (2) .ca website domain, (3) .ca contact email domains, (4) BillingState containing Canadian province names

## When to Use This Skill

- When encountering errors that match this pattern

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Multi-signal detection of Canadian accounts using: (1) Province prefix in account name (AB:, BC:, ON:, etc
2. ca website domain, (3)
3. ca contact email domains, (4) BillingState containing Canadian province names

## Source

- **Reflection**: c7ca7143-a790-413f-9225-9f557a0fa960
- **Agent**: Direct execution with sf data query
- **Enriched**: 2026-04-03
