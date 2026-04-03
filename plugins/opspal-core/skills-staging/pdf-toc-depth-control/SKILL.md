---
name: pdf-toc-depth-control
description: "Pass autoTOC.maxDepth in options to limit TOC to H1+H2 for comprehensive reports"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
agent: opspal-core:pdf-generator
---

# Pdf Toc Depth Control

Pass autoTOC.maxDepth in options to limit TOC to H1+H2 for comprehensive reports

## When to Use This Skill

- When building or modifying reports and dashboards

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Pass autoTOC
2. maxDepth in options to limit TOC to H1+H2 for comprehensive reports

## Source

- **Reflection**: 0054b8bd-8331-48b7-b8ab-eddb701c1cb1
- **Agent**: pdf-generator
- **Enriched**: 2026-04-03
