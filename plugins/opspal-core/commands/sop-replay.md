---
name: sop-replay
description: Replay historical events through current SOP policies for debugging, backfill, or validation
argument-hint: "[--event-id <id>] [--event-type <type>] [--since <duration>] [--org <slug>] [--execute] [--explain]"
visibility: user-invocable
tags:
  - sop
  - debugging
  - backfill
allowed-tools:
  - Read
  - Bash
  - Glob
  - AskUserQuestion
---

# SOP Replay — Event Replay and Backfill

## Purpose

Replay events from the SOP audit log through the current policy set. Use for debugging, backfilling new policies onto recent work, or validating policy changes.

## Usage

```bash
# Replay a specific event (dry-run by default)
node "${PLUGIN_ROOT}/scripts/lib/sop/sop-replay.js" --event-id <id>

# Replay all work.completed events from last 7 days
node "${PLUGIN_ROOT}/scripts/lib/sop/sop-replay.js" --event-type work.completed --since 7d

# Explain mode: show detailed per-event breakdown
node "${PLUGIN_ROOT}/scripts/lib/sop/sop-replay.js" --org acme-corp --since 30d --explain

# Execute mode: actually perform mutations (requires confirmation)
node "${PLUGIN_ROOT}/scripts/lib/sop/sop-replay.js" --since 7d --execute
```

## Behavior

### Default (dry-run)
Replay events without mutations. Show summary of what would happen.

### Explain mode (`--explain`)
Show per-event detail: matched policies, planned actions, warnings.

### Execute mode (`--execute`)
Before proceeding, use `AskUserQuestion` to confirm: "This will execute {N} actions across {M} events. Idempotency prevents duplicate mutations from the original run. Proceed?"

Only proceed on explicit confirmation.

## Safety

- Default mode is always dry-run (non-mutating)
- `--execute` requires interactive confirmation
- Idempotency keys prevent duplicate mutations — actions already executed in the original run are skipped
- All replayed events are audited with `source: 'replay'`
