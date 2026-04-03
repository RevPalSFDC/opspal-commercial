---
name: asana-oauth-token-refresh
description: "When Asana API returns 401, refresh JWT access token via POST to /-/oauth_token with refresh_token, client_id, and client_secret from .env. Update .env with new token."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:direct-execution
---

# Asana Oauth Token Refresh

When Asana API returns 401, refresh JWT access token via POST to /-/oauth_token with refresh_token, client_id, and client_secret from .env. Update .env with new token.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. When Asana API returns 401, refresh JWT access token via POST to /-/oauth_token with refresh_token, client_id, and client_secret from
2. env with new token

## Source

- **Reflection**: 86c675d8-fc30-4c3e-8436-f75007deb058
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
