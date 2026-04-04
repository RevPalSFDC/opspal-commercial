---
name: sop-explain
description: Explain which SOP policies apply to a specific event or work item and why
argument-hint: "[event-type] [--work-id <id>] [--classification <type>] [--org <slug>]"
visibility: user-invocable
tags:
  - sop
  - debugging
  - observability
allowed-tools:
  - Read
  - Bash
  - Glob
  - AskUserQuestion
---

# SOP Explain — Policy Trace

## Purpose

Show exactly which policies apply to an event or work item and why. Displays matched/skipped policies, confidence handling, planned actions, targets, and idempotency keys.

## Behavior

If no event-type argument provided, ask using `AskUserQuestion`: "Which event type do you want to explain?"
- Options: `work.started`, `work.completed`, `work.blocked`, `work.logged`, `intake.created`, `task_graph.created`

Build context from provided flags (`--org`, `--classification`, `--work-id`) and run the SOP runtime in dry-run mode:

```bash
node "${PLUGIN_ROOT}/scripts/lib/sop/sop-runtime.js" \
  --event <event-type> \
  --confidence explicit \
  --context '{"org_slug":"<org>","classification":"<type>"}' \
  --dry-run --verbose
```

## Output Format

```
Event: work.completed
Context: classification=audit, org=acme-corp, confidence=explicit

MATCHED POLICIES (N):
  1. sop-client-work-completed [recommend]
     Conditions met: classification in [audit,build,support], confidence in [explicit,inferred_high]
     Actions: add_asana_comment (template: completion-update), update_work_index (status: completed)
     Target: [Project: Acme RevOps] / [Section: Done]
     Mode: recommend (no mutations — system message only)

SKIPPED POLICIES (N):
  1. sop-revpal-work-completed [recommend]
     Skipped: scope mismatch (policy=revpal-internal, context=client-delivery)

PLANNED ACTIONS (if enforce):
  1. POST comment to Asana task
  2. SET work index status to completed
  3. LOG event

CONFIDENCE: Event confidence is 'explicit' — all modes allowed.
IDEMPOTENCY: Key <hash> not yet seen — would execute on enforce.
```

If `--verbose` is not provided, show a shorter version with just the matched/skipped summary.
