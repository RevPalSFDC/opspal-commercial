---
name: base64-image-embedding-for-puppeteer-pdfs
description: "Read image file as Buffer, convert to base64, embed as data:image/png;base64,... URI for reliable rendering in Puppeteer-generated PDFs"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
---

# Base64 Image Embedding For Puppeteer Pdfs

Read image file as Buffer, convert to base64, embed as data:image/png;base64,... URI for reliable rendering in Puppeteer-generated PDFs

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Read image file as Buffer, convert to base64, embed as data:image/png
2. URI for reliable rendering in Puppeteer-generated PDFs

## Source

- **Reflection**: c80df080-e3bb-4f7d-8c89-4117d644b7a8
- **Agent**: manual (scripts/generate-branded-pdf.js)
- **Enriched**: 2026-04-03
