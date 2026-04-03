---
name: wsl-oauth-callback-completion
description: "When OAuth callback fails in WSL, copy the localhost:1717/OauthRedirect URL from browser, use curl from within WSL to hit the callback endpoint"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Wsl Oauth Callback Completion

When OAuth callback fails in WSL, copy the localhost:1717/OauthRedirect URL from browser, use curl from within WSL to hit the callback endpoint

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When OAuth callback fails in WSL, copy the localhost:1717/OauthRedirect URL from browser, use curl from within WSL to hit the callback endpoint
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 2f310a1e-c2c6-495b-a72f-bfb5307b9011
- **Agent**: manual/[SFDC_ID]
- **Enriched**: 2026-04-03
