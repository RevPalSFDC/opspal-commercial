---
name: asana-file-attachment-via-rest-api
description: "When MCP attach_file tool is unavailable, use curl with multipart form upload to /api/1.0/tasks/{id}/attachments endpoint. Requires Bearer [TOKEN] auth."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:direct-execution
---

# Asana File Attachment Via Rest Api

When MCP attach_file tool is unavailable, use curl with multipart form upload to /api/1.0/tasks/{id}/attachments endpoint. Requires Bearer [TOKEN] auth.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. When MCP attach_file tool is unavailable, use curl with multipart form upload to /api/1
2. 0/tasks/{id}/attachments endpoint
3. Requires Bearer [TOKEN] auth

## Source

- **Reflection**: 86c675d8-fc30-4c3e-8436-f75007deb058
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
