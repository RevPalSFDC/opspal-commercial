---
name: high-watermark-picklist-progression
description: "Convert picklist values to ordinal numbers via CASE formula, compare current ordinal against target, only update if target > current. Prevents stage regression across multiple competing flows."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-metadata-manager (Batch 11)
---

# High Watermark Picklist Progression

Convert picklist values to ordinal numbers via CASE formula, compare current ordinal against target, only update if target > current. Prevents stage regression across multiple competing flows.

## When to Use This Skill

- When working with Salesforce Flows or automation

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. Convert picklist values to ordinal numbers via CASE formula, compare current ordinal against target, only update if target > current
2. Prevents stage regression across multiple competing flows

## Source

- **Reflection**: 33c1d941-02ad-4767-b8be-0d507aeb4640
- **Agent**: sfdc-metadata-manager (Batch 11)
- **Enriched**: 2026-04-03
