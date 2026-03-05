---
name: core-gong-intelligence-operations
description: Operational framework for Gong sync quality, intelligence extraction, and downstream reliability checks.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:gong-sync-orchestrator
version: 1.0.0
---

# core-gong-intelligence-operations

## When to Use This Skill

Use for Gong ingestion health, enrichment QA, and insight delivery workflows.

## Required Inputs

- Account or deal scope\n- Time window\n- Required insight schema

## Output Artifacts

- Sync quality report\n- Extraction validation checklist\n- Delivery readiness summary

## Workflow

1. Collect scope, constraints, and success criteria.
2. Build a deterministic execution plan with explicit checks.
3. Run read-first diagnostics and capture baseline evidence.
4. Propose safe execution steps with rollback or abort criteria.
5. Produce final artifacts with owners and next actions.

## Safety Checks

- Enforce source attribution\n- Redact sensitive conversation data\n- Flag low-confidence insights
