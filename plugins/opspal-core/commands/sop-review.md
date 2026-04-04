---
name: sop-review
description: Show the effective SOP configuration in plain English — active policies, targets, modes, gaps, and conflicts
argument-hint: "[--verbose] [--json] [--org <slug>]"
visibility: user-invocable
tags:
  - sop
  - review
  - observability
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
---

# SOP Review — Configuration Summary

## Purpose

Render a human-readable summary of the current SOP configuration. Shows active policies, target mappings, coverage gaps, and potential conflicts.

## Pre-check

If `config/sop/sop-config.yaml` does not exist, print: "SOP subsystem not initialized. Run `/sop-init` to get started." and stop.

## Behavior

Read all files under the opspal-core plugin's `config/sop/` directory. Use the SOP registry to load and validate:

```bash
node "${PLUGIN_ROOT}/scripts/lib/sop/sop-runtime.js" --event _review --dry-run 2>/dev/null || true
```

Or directly read and parse the YAML files to produce the report.

## Report Sections

### 1. SOP Status
- Enabled/disabled (`SOP_ENABLED` env var)
- Deployment mode (internal/client)
- Initialized date

### 2. Active Policies

Table:
| Policy | Event | Scope | Mode | Priority | Actions |
|--------|-------|-------|------|----------|---------|

### 3. Target Mappings

Table:
| Mapping | Board | Classifications | Section |
|---------|-------|----------------|---------|

### 4. Coverage Analysis
- Which event types have at least one policy
- Which event types have NO policy (gap)
- Which classifications have no mapping target

### 5. Conflict Detection
Flag any cases where:
- Two `enforce` policies target the same event + target with incompatible mutations
- A policy references a mapping_ref that doesn't exist
- A policy has `mode: enforce` but targets are unconfigured (`CONFIGURE_VIA_SOP_MAP`)

Severity: error (blocks execution), warning (logged but non-blocking)

### 6. Mode Summary
- Count of policies per mode: off / recommend / enforce / dry_run

## Output Formats

- Default: Markdown tables and bullet lists
- `--json`: Raw JSON structure
- `--verbose`: Include policy file paths and raw YAML snippets
- `--org <slug>`: Filter effective view for a specific org (applies org-level overrides)
