---
name: direct-html-to-pdf-conversion
description: "When pdf-generator agent fails to follow instructions, bypass it with direct puppeteer conversion: render Mermaid to PNG via mmdc, embed as base64 in HTML, convert to PDF with puppeteer"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
---

# Direct Html To Pdf Conversion

When pdf-generator agent fails to follow instructions, bypass it with direct puppeteer conversion: render Mermaid to PNG via mmdc, embed as base64 in HTML, convert to PDF with puppeteer

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: documentation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When pdf-generator agent fails to follow instructions, bypass it with direct puppeteer conversion: render Mermaid to PNG via mmdc, embed as base64 in HTML, convert to PDF with puppeteer
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: e9484eac-26a0-4c2f-8ccf-61af1adf97e3
- **Agent**: manual
- **Enriched**: 2026-04-03
