---
name: dual-interface-hook-design
description: "Hooks that support both event-driven (stdin JSON) and manual CLI invocation. Read stdin if available, fall back to arguments, exit gracefully when called without data."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Dual Interface Hook Design

Hooks that support both event-driven (stdin JSON) and manual CLI invocation. Read stdin if available, fall back to arguments, exit gracefully when called without data.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: hook-development
**Discovered from**: reflection analysis

## Workflow

1. Hooks that support both event-driven (stdin JSON) and manual CLI invocation
2. Read stdin if available, fall back to arguments, exit gracefully when called without data

## Source

- **Reflection**: 0dfa30e2-4e43-47ef-8e94-f6aee443f94a
- **Agent**: unknown
- **Enriched**: 2026-04-03
