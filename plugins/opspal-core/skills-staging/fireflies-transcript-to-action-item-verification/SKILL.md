---
name: fireflies-transcript-to-action-item-verification
description: "Pull meeting transcripts via Fireflies GraphQL API, extract action items, then systematically verify each against live Salesforce org state using sfdc-state-discovery. Produces a gap analysis showing prepared-but-undeployed, not-started, and completed items."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-state-discovery
---

# Fireflies Transcript To Action Item Verification

Pull meeting transcripts via Fireflies GraphQL API, extract action items, then systematically verify each against live Salesforce org state using sfdc-state-discovery. Produces a gap analysis showing prepared-but-undeployed, not-started, and completed items.

## When to Use This Skill

- When deploying metadata that involves the patterns described here

**Category**: assessment
**Discovered from**: reflection analysis

## Workflow

1. Pull meeting transcripts via Fireflies GraphQL API, extract action items, then systematically verify each against live Salesforce org state using sfdc-state-discovery
2. Produces a gap analysis showing prepared-but-undeployed, not-started, and completed items

## Source

- **Reflection**: 82df7fe5-ad0a-4102-8c80-887dfa758808
- **Agent**: opspal-salesforce:sfdc-state-discovery
- **Enriched**: 2026-04-03
