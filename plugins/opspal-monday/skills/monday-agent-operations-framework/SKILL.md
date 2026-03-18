---
name: monday-agent-operations-framework
description: Operate monday.com board/item/file workflows with safe batching, validation, and rollback-aware execution.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-monday:monday-board-manager
version: 1.0.0
---

# monday-agent-operations-framework

## When to Use This Skill

Use for multi-step Monday board operations or bulk item/file changes.

## Required Inputs

- Board IDs\n- Item/file scope\n- Change intent

## Output Artifacts

- Operation plan\n- Batch execution checklist\n- Rollback readiness notes

## Workflow

1. Collect scope, constraints, and success criteria.
2. Build a deterministic execution plan with explicit checks.
3. Run read-first diagnostics and capture baseline evidence.
4. Propose safe execution steps with rollback or abort criteria.
5. Produce final artifacts with owners and next actions.

## Safety Checks

- Enforce batch-size limits\n- Snapshot state before mutation\n- Abort on schema mismatches
