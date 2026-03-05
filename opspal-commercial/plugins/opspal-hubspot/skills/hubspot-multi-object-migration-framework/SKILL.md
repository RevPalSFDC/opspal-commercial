---
name: hubspot-multi-object-migration-framework
description: Plan and execute staged multi-object HubSpot migrations with reconciliation controls.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-hubspot:hubspot-data-operations-manager
version: 1.0.0
---

# hubspot-multi-object-migration-framework

## When to Use This Skill

Use for object schema moves, bulk remapping, or dedupe migration initiatives.

## Required Inputs

- Source/target object maps\n- Dedupe keys\n- Migration windows

## Output Artifacts

- Migration execution plan\n- Checkpointed runbook\n- Reconciliation report

## Workflow

1. Collect scope, constraints, and success criteria.
2. Build a deterministic execution plan with explicit checks.
3. Run read-first diagnostics and capture baseline evidence.
4. Propose safe execution steps with rollback or abort criteria.
5. Produce final artifacts with owners and next actions.

## Safety Checks

- Enforce staged cutover\n- Require rollback checkpoints\n- Validate referential integrity before promotion
