---
name: hook-shell-safety-hardener
description: Harden shell-based hooks with strict mode, bounded external calls, and deterministic failure behavior.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:plugin-doctor
version: 1.0.0
---

# hook-shell-safety-hardener

## When to Use This Skill

Use for hook reliability and shell safety cleanup initiatives.

## Required Inputs

- Hook script list\n- Allowed command set\n- Runtime constraints

## Output Artifacts

- Hardening checklist\n- Script-by-script risk report\n- Safe patch plan

## Workflow

1. Collect scope, constraints, and success criteria.
2. Build a deterministic execution plan with explicit checks.
3. Run read-first diagnostics and capture baseline evidence.
4. Propose safe execution steps with rollback or abort criteria.
5. Produce final artifacts with owners and next actions.

## Safety Checks

- Preserve non-blocking hooks where required\n- Add timeouts to network calls\n- Avoid destructive commands
