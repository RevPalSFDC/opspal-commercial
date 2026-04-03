---
name: mermaid-png-pre-rendering-for-pdf
description: "Extract Mermaid blocks from markdown, render to PNG with mermaid-cli -i input.mmd -o output.png -b white [-w width] [-H height], replace blocks with ![alt](images/diagram.png), then generate PDF"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
agent: cross-platform-plugin:pdf-generator
---

# Mermaid Png Pre Rendering For Pdf

Extract Mermaid blocks from markdown, render to PNG with mermaid-cli -i input.mmd -o output.png -b white [-w width] [-H height], replace blocks with ![alt](images/diagram.png), then generate PDF

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Extract Mermaid blocks from markdown, render to PNG with mermaid-cli -i input
2. mmd -o output
3. png -b white [-w width] [-H height], replace blocks with ![alt](images/diagram
4. png), then generate PDF

## Source

- **Reflection**: 254aae57-544a-4242-93b0-611609e3d540
- **Agent**: cross-platform-plugin:pdf-generator
- **Enriched**: 2026-04-03
