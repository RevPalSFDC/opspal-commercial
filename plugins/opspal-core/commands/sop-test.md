---
name: sop-test
description: Dry-run lifecycle events against SOP config to preview what would happen without mutations
argument-hint: "[event-type] [--classification <type>] [--org <slug>] [--all-events]"
visibility: user-invocable
tags:
  - sop
  - testing
  - dry-run
allowed-tools:
  - Read
  - Bash
  - Glob
---

# SOP Test — Dry-Run Events

## Purpose

Non-mutating preview of SOP policy evaluation. Shows what the SOP runtime would do for sample or real events without making any changes.

## Behavior

### Single Event Mode (default)

Run the SOP runtime in dry-run mode for the specified event:

```bash
node "${PLUGIN_ROOT}/scripts/lib/sop/sop-runtime.js" \
  --event <event-type> \
  --confidence inferred_high \
  --context '{"org_slug":"<org>","classification":"<classification>"}' \
  --dry-run
```

Parse the JSON output and render a human-readable summary.

### All Events Mode (`--all-events`)

Iterate over all 6 core event types (`work.started`, `work.completed`, `work.blocked`, `work.logged`, `intake.created`, `task_graph.created`) and produce a coverage report:

| Event | Policies Matched | Actions Planned | Warnings |
|-------|-----------------|-----------------|----------|

### Real Context Mode (`--real`)

Load real context from the work index and Asana links for a live preview:
1. Read `ORG_SLUG` from env or `--org` flag
2. Load `WORK_INDEX.yaml` for the org
3. Load `.asana-links.json`
4. Run SOP runtime with this real context (still non-mutating)

## Output

All output is prefixed with `[DRY RUN — no changes made]` to make it clear this is a simulation.

The output mirrors `/sop-explain` format but includes the DRY RUN header and shows results for multiple events when using `--all-events`.
