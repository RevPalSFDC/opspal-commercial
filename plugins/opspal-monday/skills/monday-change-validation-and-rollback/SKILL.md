---
name: monday-change-validation-and-rollback
description: Validate Monday changes with before/after diffing and generate deterministic rollback procedures.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-monday:monday-batch-operator
version: 1.0.0
---

# monday-change-validation-and-rollback

## When to Use This Skill

- Validating a completed bulk Monday operation by diffing pre- and post-change board state
- Before a production board cutover where the new structure must exactly match a defined specification
- Generating a rollback playbook after any destructive change (column deletion, group archive, board restructure)
- Confirming that an automation-driven Monday update produced the correct item values and ownership assignments
- Identifying residual risks when a partial rollback is the only available recovery option

**Not for**: planning or executing new Monday operations (use `monday-agent-operations-framework`) or debugging Monday automations at the logic level.

## Validation Diff Reference

| Change Type | What to Diff | Rollback Feasibility |
|-------------|-------------|---------------------|
| Item status update | `status` column value per item ID | Full — re-apply original values from snapshot |
| Column added | Column schema before vs. after | Full — delete added column |
| Column deleted | Snapshot values vs. current state | Partial — values lost if not snapshotted |
| Owner reassignment | `person` column per item | Full — re-assign from snapshot |
| Item moved between boards | Item presence by board | Full — move back |
| Group archived | Group item count before vs. after | Full — unarchive group |

## Required Inputs

- Baseline snapshot (structured export of board state before the change)
- Post-change snapshot (board state after the operation completed)
- Acceptance criteria (the specific column values and item states that define a successful change)

## Output Artifacts

- Validation diff report showing matched, diverged, and missing items per acceptance criterion
- Rollback playbook with ordered, board-specific reversal steps and ownership assignment
- Residual risk list identifying any irreversible changes and recommended mitigations

## Workflow

1. **Load and normalize snapshots**: parse baseline and post-change snapshots into a common item-keyed structure (item ID → column values) to enable deterministic diffing.
2. **Run structural diff**: compare column schemas between snapshots; flag any columns added, removed, or type-changed that were not part of the intended change.
3. **Run value diff**: for each item in scope, compare column values between baseline and post-change; classify each delta as expected, unexpected, or missing.
4. **Validate against acceptance criteria**: map diff results to the defined success criteria; produce a pass/fail result per criterion with supporting evidence.
5. **Generate rollback playbook**: for any failed criteria or unexpected changes, produce a step-by-step reversal procedure using the baseline snapshot as the target state; assign ownership for each rollback step.
6. **Identify residual risks**: flag any changes that cannot be fully reversed (e.g., deleted column data not captured in the snapshot) and recommend compensating controls.

## Safety Checks

- Require baseline and post-change snapshots before generating any rollback playbook
- Block irreversible operations (column delete, item archive) without prior explicit approval and snapshot confirmation
- Capture a named rollback owner for each step in the playbook before delivering it
