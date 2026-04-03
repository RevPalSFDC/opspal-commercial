---
name: wsl-scheduled-task-recovery
description: "When WSL cron jobs miss execution due to WSL being inactive, manually identify the script, determine required parameters from documentation/code, and execute with full parameters rather than using wrapper scripts that may have incomplete defaults"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:direct-execution
---

# Wsl Scheduled Task Recovery

When WSL cron jobs miss execution due to WSL being inactive, manually identify the script, determine required parameters from documentation/code, and execute with full parameters rather than using wrapper scripts that may have incomplete defaults

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When WSL cron jobs miss execution due to WSL being inactive, manually identify the script, determine required parameters from documentation/code, and execute with full parameters rather than using wrapper scripts that may have incomplete defaults
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 484c8d68-a0da-4f18-ad3c-bc182f333836
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
