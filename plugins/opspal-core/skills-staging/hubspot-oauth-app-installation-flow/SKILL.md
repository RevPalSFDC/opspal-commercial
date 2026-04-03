---
name: hubspot-oauth-app-installation-flow
description: "Start localhost:3000 callback server, user clicks OAuth URL, capture code, exchange for tokens via /oauth/v1/token"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Hubspot Oauth App Installation Flow

Start localhost:3000 callback server, user clicks OAuth URL, capture code, exchange for tokens via /oauth/v1/token

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Start localhost:3000 callback server, user clicks OAuth URL, capture code, exchange for tokens via /oauth/v1/token
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: d784f53f-29c7-4eda-b745-25fd1d859467
- **Agent**: manual (oauth-complete.js)
- **Enriched**: 2026-04-03
