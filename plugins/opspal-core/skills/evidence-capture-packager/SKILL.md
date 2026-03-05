---
name: evidence-capture-packager
description: Package operational evidence artifacts into a review-ready bundle with index and retention metadata.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:ui-documentation-generator
version: 1.0.0
---

# evidence-capture-packager

## When to Use This Skill

Use for audits, incidents, release gates, and governance reviews.

## Required Inputs

- Evidence paths\n- Review context\n- Retention policy

## Output Artifacts

- Evidence index\n- Timestamped artifact manifest\n- Redaction checklist

## Workflow

1. Collect scope, constraints, and success criteria.
2. Build a deterministic execution plan with explicit checks.
3. Run read-first diagnostics and capture baseline evidence.
4. Propose safe execution steps with rollback or abort criteria.
5. Produce final artifacts with owners and next actions.

## Safety Checks

- Redact secrets and PII\n- Preserve source integrity\n- Flag missing required artifacts
