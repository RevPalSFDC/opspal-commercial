---
name: parallel-hubspot-assessment-data-collection
description: "Launch 4 parallel agents targeting different API domains (metadata, workflows, pipelines, integrations) to collect assessment data concurrently. Reduces total collection time from ~30min sequential to ~12min parallel."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:general-purpose (multiple instances)
---

# Parallel Hubspot Assessment Data Collection

Launch 4 parallel agents targeting different API domains (metadata, workflows, pipelines, integrations) to collect assessment data concurrently. Reduces total collection time from ~30min sequential to ~12min parallel.

## When to Use This Skill

- When performing audits or assessments of the target system
- When working with Salesforce Flows or automation

**Category**: assessment
**Discovered from**: reflection analysis

## Workflow

1. Launch 4 parallel agents targeting different API domains (metadata, workflows, pipelines, integrations) to collect assessment data concurrently
2. Reduces total collection time from ~30min sequential to ~12min parallel

## Source

- **Reflection**: 242ad172-ece7-4696-b3f2-8f25f8b60950
- **Agent**: general-purpose (multiple instances)
- **Enriched**: 2026-04-03
