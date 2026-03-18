---
name: okr-retrospective-framework
description: Structured OKR retrospective framework for classifying hit/partial/miss outcomes, tracing root causes, and feeding calibration back into the next cycle. Use when closing a cycle, capturing learning, or separating execution failure from target-setting error.
allowed-tools: Read, Grep, Glob
---

# OKR Retrospective Framework

## When to Use This Skill

- Closing an OKR cycle
- Classifying KR outcomes as hit, partial, or miss
- Capturing root causes and calibration implications
- Deciding whether a miss reflects execution failure, dependency failure, or target-setting error

## Outcome Classification

Every KR should be classified with:

- target
- actual
- variance percentage
- normalized attainment ratio
- outcome class: `hit`, `partial`, or `miss`

## Root Cause Taxonomy

Use a small set of clear root-cause buckets:

- `execution_gap`
- `dependency_blocker`
- `data_quality_gap`
- `target_setting_error`
- `external_market_change`
- `definition_change`

Do not let “miscellaneous” become the default answer.

## Retrospective Workflow

1. Confirm final actuals and metric lineage
2. Classify each KR as hit, partial, or miss
3. Assign a primary root-cause bucket for misses and meaningful partials
4. Separate target-setting issues from execution issues
5. Feed valid metric outcomes into calibration
6. Capture what changes next cycle as a result

## Calibration Guardrails

- Fewer than 4 cycles means the calibration is provisional
- Do not narrow confidence ranges aggressively on small samples
- Reset or split history when metric definitions change
- Store learning in `config/okr-outcomes.json`, not just in prose

## Output Expectations

A strong retrospective should answer:

- What landed?
- What missed?
- Why?
- What changes in next-cycle target-setting?
- Which metrics now have enough history to influence stance selection?

## References

- Learning store: `config/okr-outcomes.json`
- Calibrator: `scripts/lib/okr-outcome-calibrator.js`
- History command: `commands/okr-history.md`
