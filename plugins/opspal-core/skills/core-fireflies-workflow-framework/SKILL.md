---
name: core-fireflies-workflow-framework
description: Standardize Fireflies transcript sync, action extraction, and QA workflows for reliable operations.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:fireflies-sync-orchestrator
version: 1.0.0
---

# core-fireflies-workflow-framework

## When to Use This Skill

Use for meeting intelligence ingestion and action-item operationalization.

## Required Inputs

- Meeting source scope\n- Action taxonomy\n- Sync window

## Output Artifacts

- Normalized transcript/action package\n- QA findings\n- Follow-up queue

## Workflow

1. Collect scope, constraints, and success criteria.
2. Build a deterministic execution plan with explicit checks.
3. Run read-first diagnostics and capture baseline evidence.
4. Propose safe execution steps with rollback or abort criteria.
5. Produce final artifacts with owners and next actions.

## Safety Checks

- Apply transcript retention limits\n- Redact confidential content\n- Require confidence thresholds for actions
