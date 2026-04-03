---
name: bulk-flow-metadata-retrieve-and-search
description: "Use 'sf project retrieve start --metadata Flow --output-dir' to bulk-retrieve all org flows, then grep across the XML files for specific action patterns. Much faster than querying each flow individually via API."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Bulk Flow Metadata Retrieve And Search

Use 'sf project retrieve start --metadata Flow --output-dir' to bulk-retrieve all org flows, then grep across the XML files for specific action patterns. Much faster than querying each flow individually via API.

## When to Use This Skill

- During data import or bulk operations
- When working with Salesforce Flows or automation

**Category**: query
**Discovered from**: reflection analysis

## Workflow

1. Use 'sf project retrieve start --metadata Flow --output-dir' to bulk-retrieve all org flows, then grep across the XML files for specific action patterns
2. Much faster than querying each flow individually via API

## Source

- **Reflection**: baa9e054-0ef1-4636-ad6d-c9c8943d7d39
- **Agent**: manual-execution
- **Enriched**: 2026-04-03
