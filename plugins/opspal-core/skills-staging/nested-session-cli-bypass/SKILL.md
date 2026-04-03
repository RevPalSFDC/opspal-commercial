---
name: nested-session-cli-bypass
description: "When Claude CLI commands fail inside a Claude Code session due to CLAUDECODE env var, use `env -u CLAUDECODE` to temporarily unset it for the subprocess"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:direct-execution
---

# Nested Session Cli Bypass

When Claude CLI commands fail inside a Claude Code session due to CLAUDECODE env var, use `env -u CLAUDECODE` to temporarily unset it for the subprocess

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When Claude CLI commands fail inside a Claude Code session due to CLAUDECODE env var, use `env -u CLAUDECODE` to temporarily unset it for the subprocess
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: e351bc29-882e-40b3-a638-f888043c6f9a
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
