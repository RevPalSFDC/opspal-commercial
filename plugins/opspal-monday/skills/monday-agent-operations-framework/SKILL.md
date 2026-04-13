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

- Executing a multi-step Monday.com workflow that touches more than one board or group (e.g., syncing items across a project board and a CRM-linked board)
- Running a bulk item operation — status updates, owner reassignment, date shifts — across more than 25 items
- Extracting files or attachments from Monday boards for downstream processing or archiving
- Coordinating a board restructure (column additions, group reordering, board duplication) that requires a pre-change snapshot
- Orchestrating a Monday.com operation triggered by an external event (CRM field change, Marketo program launch, Salesforce opportunity stage update)

**Not for**: single-item edits or ad-hoc reads that can be done directly through the Monday UI without risk of data loss.

## Operation Safety Reference

| Operation Type | Batch Limit | Pre-Snapshot Required | Rollback Method |
|---------------|-------------|----------------------|----------------|
| Bulk status update | 50 items/batch | Yes | Restore from snapshot |
| Column schema change | 1 at a time | Yes | Manual revert (destructive) |
| Item move between boards | 25 items/batch | Yes | Re-move from destination |
| File extraction | No limit | No | N/A (read-only) |
| Board duplication | 1 at a time | No | Delete duplicate |
| Owner reassignment | 100 items/batch | Yes | Re-assign from snapshot |

## Required Inputs

- Board IDs and item/group scope
- Description of change intent and expected outcome
- Confirmation of rollback ownership if the operation is destructive

## Output Artifacts

- Deterministic operation plan with ordered steps
- Batch execution checklist with per-batch success criteria
- Rollback readiness notes with specific reversal instructions

## Workflow

1. **Read and scope**: retrieve board metadata, column schemas, and item counts for all boards in scope; confirm the operation plan matches the actual board structure before proceeding.
2. **Snapshot pre-change state**: for any destructive or bulk operation, export a structured snapshot of affected items (IDs, column values, owners) that can be used to drive a rollback.
3. **Build batched execution plan**: divide the operation into safe batch sizes; define the success signal for each batch (expected item count updated, column value confirmed).
4. **Execute with validation gates**: run each batch, validate the outcome before proceeding to the next; abort if any batch produces unexpected results.
5. **Handle schema mismatches**: if a column is missing or has an unexpected type, halt the operation and surface the discrepancy for human review before continuing.
6. **Produce final artifacts**: deliver the operation summary (items affected, batches executed, any exceptions) along with rollback instructions for the operations owner.

## Safety Checks

- Enforce batch-size limits to avoid Monday API rate throttling
- Snapshot board state before any mutation that cannot be undone via API
- Abort on schema mismatches — never silently skip mismatched columns
