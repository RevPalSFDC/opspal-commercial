---
name: hook-event-coverage-auditor
description: Audit hook event registrations against implemented scripts and identify undercovered lifecycle events.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:plugin-doctor
version: 1.0.0
---

# hook-event-coverage-auditor

## When to Use This Skill

Use before hook refactors, releases, or when hook behavior appears inconsistent.

## Required Inputs

- Target plugin(s)\n- Hook config paths\n- Event scope

## Output Artifacts

- Event coverage matrix\n- Unregistered-script findings\n- Priority remediation list

## Workflow

1. Collect scope, constraints, and success criteria.
2. Build a deterministic execution plan with explicit checks.
3. Run read-first diagnostics and capture baseline evidence.
4. Propose safe execution steps with rollback or abort criteria.
5. Produce final artifacts with owners and next actions.

## Safety Checks

- Read-only by default\n- Distinguish runtime vs project hooks\n- Flag unsafe assumptions explicitly
