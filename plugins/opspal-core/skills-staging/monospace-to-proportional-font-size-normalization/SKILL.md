---
name: monospace-to-proportional-font-size-normalization
description: "When mixing monospace and proportional fonts in PDFs, monospace needs to be ~0.68em of body size for visual parity due to wider glyph width and taller x-height"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
agent: opspal-core:pdf-generator
---

# Monospace To Proportional Font Size Normalization

When mixing monospace and proportional fonts in PDFs, monospace needs to be ~0.68em of body size for visual parity due to wider glyph width and taller x-height

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. When mixing monospace and proportional fonts in PDFs, monospace needs to be ~0
2. 68em of body size for visual parity due to wider glyph width and taller x-height

## Source

- **Reflection**: b9aa4f56-9c09-4392-b626-7d22096d8626
- **Agent**: pdf-generator
- **Enriched**: 2026-04-03
