---
name: cross-plugin-coupling-detector
description: Map cross-plugin dependencies in scripts/hooks and surface high-risk coupling edges.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:cross-platform-pipeline-orchestrator
version: 1.0.0
---

# cross-plugin-coupling-detector

## When to Use This Skill

Use during architecture boundary reviews and pre-release governance checks.

## Required Inputs

- Plugin scope\n- Allowed dependency edges\n- Baseline exceptions

## Output Artifacts

- Coupling graph\n- Severity-ranked violations\n- Decoupling action plan

## Workflow

1. Collect scope, constraints, and success criteria.
2. Build a deterministic execution plan with explicit checks.
3. Run read-first diagnostics and capture baseline evidence.
4. Propose safe execution steps with rollback or abort criteria.
5. Produce final artifacts with owners and next actions.

## Safety Checks

- Fail closed for new unapproved edges\n- Separate detection from enforcement\n- Require rollback path for remediation
