---
name: multi-tier-disambiguation-pipeline
description: "Sequential tier processing for multi-match resolution: generic collapse → title matching → domain defaults → web research → residual fallback, with contact-level tier selection based on available data signals"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:phase2d_bucket_d_processor.py
---

# Multi Tier Disambiguation Pipeline

Sequential tier processing for multi-match resolution: generic collapse → title matching → domain defaults → web research → residual fallback, with contact-level tier selection based on available data signals

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Sequential tier processing for multi-match resolution: generic collapse → title matching → domain defaults → web research → residual fallback, with contact-level tier selection based on available data signals
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 1d1712ec-dda1-4ca4-9f2c-d18eed00f7d8
- **Agent**: phase2d_bucket_d_processor.py
- **Enriched**: 2026-04-03
