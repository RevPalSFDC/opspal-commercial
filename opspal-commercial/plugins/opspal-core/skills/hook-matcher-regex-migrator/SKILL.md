---
name: hook-matcher-regex-migrator
description: Validate and migrate fragile hook matcher patterns to robust regex forms with compatibility notes.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:plugin-doctor
version: 1.0.0
---

# hook-matcher-regex-migrator

## When to Use This Skill

Use when hook matchers fail silently or legacy wildcard syntax is present.

## Required Inputs

- Hook config file paths\n- Event/matcher entries\n- Compatibility constraints

## Output Artifacts

- Matcher validation report\n- Proposed regex replacements\n- Risk and rollback notes

## Workflow

1. Collect scope, constraints, and success criteria.
2. Build a deterministic execution plan with explicit checks.
3. Run read-first diagnostics and capture baseline evidence.
4. Propose safe execution steps with rollback or abort criteria.
5. Produce final artifacts with owners and next actions.

## Safety Checks

- Compile-test all proposed matchers\n- Do not auto-apply broad patterns\n- Keep fallback matcher list
