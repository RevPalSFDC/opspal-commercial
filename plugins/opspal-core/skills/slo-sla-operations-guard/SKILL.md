---
name: slo-sla-operations-guard
description: Classify SLO and SLA breaches, assign response priority, and map remediation workflows.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:realtime-dashboard-coordinator
version: 1.0.0
---

# slo-sla-operations-guard

## When to Use This Skill

Use when alerts indicate latency, failure-rate, or freshness objective breaches.

## Required Inputs

- SLO/SLA definitions\n- Current metrics\n- Service criticality

## Output Artifacts

- Breach classification\n- Priority response plan\n- Escalation decision record

## Workflow

1. Collect scope, constraints, and success criteria.
2. Build a deterministic execution plan with explicit checks.
3. Run read-first diagnostics and capture baseline evidence.
4. Propose safe execution steps with rollback or abort criteria.
5. Produce final artifacts with owners and next actions.

## Safety Checks

- Apply policy thresholds consistently\n- Separate transient from sustained breaches\n- Require objective evidence
