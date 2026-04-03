---
name: direct-pdf-generation-with-custom-css-overrides
description: "When sub-agent PDF generation produces incorrect styling, write a temporary Node.js script that directly invokes PDFGenerator with explicit options and customCSS overrides, then delete the script after successful generation"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
agent: opspal-core:pdf-generator
---

# Direct Pdf Generation With Custom Css Overrides

When sub-agent PDF generation produces incorrect styling, write a temporary Node.js script that directly invokes PDFGenerator with explicit options and customCSS overrides, then delete the script after successful generation

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. When sub-agent PDF generation produces incorrect styling, write a temporary Node
2. js script that directly invokes PDFGenerator with explicit options and customCSS overrides, then delete the script after successful generation

## Source

- **Reflection**: c4a08214-319d-4f18-a707-d90b3e391fe8
- **Agent**: opspal-core:pdf-generator
- **Enriched**: 2026-04-03
