---
name: runbook-linkage-linter
description: Validate runbook-to-agent-to-skill linkage integrity and detect stale references before release or docs CI.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:solution-runbook-generator
version: 1.0.0
---

# runbook-linkage-linter

## When to Use This Skill

Use when runbooks, agents, skills, or catalogs are updated and linkage may drift.

## Required Inputs

- Runbook paths or plugin scope\n- Agent and skill scope\n- Catalog source of truth

## Output Artifacts

- Broken-link report\n- Missing linkage matrix\n- Suggested remediations

## Workflow

1. Collect scope, constraints, and success criteria.
2. Build a deterministic execution plan with explicit checks.
3. Run read-first diagnostics and capture baseline evidence.
4. Propose safe execution steps with rollback or abort criteria.
5. Produce final artifacts with owners and next actions.

## Safety Checks

- Fail closed on unresolved references\n- Do not mutate references automatically\n- Require human confirmation for deletions
