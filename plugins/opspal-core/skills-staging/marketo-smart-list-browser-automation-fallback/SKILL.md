---
name: marketo-smart-list-browser-automation-fallback
description: "When Marketo REST API returns 703 for [COMPANY] List operations, use Playwright browser automation to configure via UI"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:playwright-browser-controller
---

# Marketo Smart List Browser Automation Fallback

When Marketo REST API returns 703 for [COMPANY] List operations, use Playwright browser automation to configure via UI

## When to Use This Skill

- When working with Salesforce Flows or automation

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When Marketo REST API returns 703 for [COMPANY] List operations, use Playwright browser automation to configure via UI
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: c9f4a752-d28f-49a7-a9bd-6736279ef29d
- **Agent**: opspal-core:playwright-browser-controller
- **Enriched**: 2026-04-03
