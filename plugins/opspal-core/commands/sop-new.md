---
name: sop-new
description: Create a new SOP policy with an interactive wizard
argument-hint: "[policy-name] [--event <event-type>] [--scope <scope>]"
visibility: user-invocable
tags:
  - sop
  - policy
  - configuration
allowed-tools:
  - AskUserQuestion
  - Read
  - Write
  - Bash
  - Glob
---

# SOP New — Create a Policy

## Purpose

Interactively create a new SOP policy. Guides the user through event selection, scope, conditions, actions, mapping, and mode. Shows a dry-run preview before saving.

## Pre-check

Verify `config/sop/sop-config.yaml` exists. If not, advise: "Run `/sop-init` first."

## Interactive Wizard

If flags are provided (`--event`, `--scope`), pre-fill those values and skip the corresponding questions.

**Question 1**: "Which lifecycle event should this policy respond to?"
- Options: `work.started`, `work.completed`, `work.blocked`, `work.logged`, `intake.created`, `task_graph.created`
- User can also type a custom event name

**Question 2**: "What scope should this policy apply to?"
- Options: `global` (all work), `revpal-internal`, `client-delivery`

**Question 3**: "Which work classifications should trigger this policy? (comma-separated, or 'all')"
- Suggest: audit, build, report, migration, configuration, consultation, support

**Question 4**: "What confidence levels should this policy accept?"
- Options: `explicit + inferred_high` (recommended), `all (including inferred_low)`, `explicit only`

**Question 5**: "What actions should this policy take?" (multi-select)
- Options:
  - `log` — Write structured event log
  - `asana.add_comment` — Add comment to linked Asana task
  - `asana.create_task` — Create new Asana task
  - `asana.update_task` — Update existing Asana task
  - `work-index.update_status` — Update work index status

**Question 6** (if Asana action selected): "Use the default target mapping from `/sop-map`, or specify a custom target?"
- Options: `default mapping`, `custom GID`

**Question 7** (if Asana comment action): "Use an existing Asana update template?"
- List available templates from `templates/asana-updates/`
- Options: select one, or skip

**Question 8**: "Policy mode?"
- `recommend` — Log and inject system message, no mutations (safest)
- `enforce` — Execute actions (requires Asana targets configured)
- `dry_run` — Evaluate but never execute

**Question 9**: "Policy name?" (auto-suggested from event + scope)

**Question 10**: Preview the YAML. Ask: "Save this policy?"

## Output

Write to `config/sop/{scope}/{policy-name}.yaml` using the SOP policy schema.

## Post-Create

Print: "Policy created. Run `/sop-explain {event}` to see how it evaluates. Run `/sop-test --event {event}` for a dry-run."
