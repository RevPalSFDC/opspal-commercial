---
name: line-based-xml-layout-parsing
description: "Parse Salesforce layout XML line-by-line to safely remove field references while preserving structure. Track layoutItems blocks by detecting opening/closing tags and only discard blocks where field name matches deprecation list."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Line Based Xml Layout Parsing

Parse Salesforce layout XML line-by-line to safely remove field references while preserving structure. Track layoutItems blocks by detecting opening/closing tags and only discard blocks where field name matches deprecation list.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Parse Salesforce layout XML line-by-line to safely remove field references while preserving structure
2. Track layoutItems blocks by detecting opening/closing tags and only discard blocks where field name matches deprecation list

## Source

- **Reflection**: 2431495d-04e1-4c93-83db-47e64e824eb5
- **Agent**: manual implementation
- **Enriched**: 2026-04-03
