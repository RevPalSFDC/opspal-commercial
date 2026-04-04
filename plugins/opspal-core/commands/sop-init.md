---
name: sop-init
description: Bootstrap SOP configuration for this workspace with an interactive wizard
argument-hint: "[--reset] [--internal] [--client]"
visibility: user-invocable
tags:
  - sop
  - configuration
  - onboarding
allowed-tools:
  - AskUserQuestion
  - Read
  - Write
  - Bash
  - Glob
  - Grep
---

# SOP Init — Bootstrap Standard Operating Procedures

## Purpose

Initialize the SOP subsystem for this workspace. Creates the `config/sop/` directory structure, starter policies, and baseline configuration. Run this once before using any other `/sop-*` commands.

## Behavior

### Pre-check

Before starting, check if `config/sop/sop-config.yaml` already exists in the opspal-core plugin directory. If it does:
- Warn: "SOP already initialized. Run `/sop-init --reset` to overwrite, or use `/sop-new` to add individual policies."
- If `--reset` flag is present, proceed with overwrite.
- Otherwise, stop.

### Interactive Wizard

If `--internal` or `--client` flag is provided, skip question 1. Otherwise, ask all questions sequentially using `AskUserQuestion`.

**Question 1**: "Is this workspace for RevPal internal operations or client delivery?"
- Options: `internal`, `client`
- Sets `deployment_mode`

**Question 2**: "Should the SOP system automatically sync updates to Asana when work lifecycle events fire?"
- Options: `yes`, `no`
- Sets `asana_sync_enabled`

**Question 3** (if Asana sync enabled): "Do you use a single Asana board for all work, or separate boards per work classification (audit, build, support, etc.)?"
- Options: `single`, `per-classification`
- Sets `asana_board_strategy`

**Question 4**: "Should work index status be automatically updated when lifecycle events fire (e.g., mark in-progress when work starts, completed when work finishes)?"
- Options: `yes`, `no`
- Sets `work_index_integration`

**Question 5**: "Enable automatic blocker tracking? This captures `work.blocked` events and logs them centrally."
- Options: `yes`, `no`
- Sets `blocker_tracking_enabled`

### Output

After collecting answers, show a preview of the planned file structure:

```
config/sop/
  sop-config.yaml                     (master config)
  global/
    work-blocked.yaml                 (starter: log blocked events)
  revpal-internal/                    (if deployment_mode = internal)
    work-started.yaml                 (starter: log + work-index update)
    work-completed.yaml               (starter: log + work-index update)
  client-delivery/                    (if deployment_mode = client)
    work-started.yaml                 (starter: Asana + work-index + log)
    work-completed.yaml               (starter: Asana + work-index + log)
  mappings/
    standard-client-boards.yaml       (placeholder — configure via /sop-map)
  templates/                          (empty, for future use)
  orgs/                               (empty, for org-specific overrides)
  sop-agent-event-mappings.json       (agent-to-event type mappings)
  SCHEMA_CHANGELOG.md                 (schema version history)
```

Ask: "Create these files?" — proceed only on confirmation.

Write `config/sop/sop-config.yaml`:

```yaml
schema_version: "1.0.0"
enabled: false
deployment_mode: <wizard answer>
asana_sync_enabled: <wizard answer>
asana_board_strategy: <wizard answer or null>
work_index_integration: <wizard answer>
blocker_tracking_enabled: <wizard answer>
initialized_at: "<current ISO timestamp>"
```

The starter policy files should already exist from the plugin distribution. If they don't (e.g., fresh clone), write them using the standard policy YAML schema with `mode: recommend`.

### Post-Init

Print:
- "SOP initialized. Starter policies are in `recommend` mode (no mutations)."
- "Next steps:"
  - "Run `/sop-map` to configure Asana board targets."
  - "Run `/sop-review` to see the effective configuration."
  - "Run `/sop-test --all-events` to preview what would happen."
  - "Run `/sop-enable` when ready to activate."

## Options

| Flag | Effect |
|------|--------|
| `--reset` | Overwrite existing SOP config |
| `--internal` | Skip question 1, set `deployment_mode: internal` |
| `--client` | Skip question 1, set `deployment_mode: client` |
