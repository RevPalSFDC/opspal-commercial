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

- After a Fireflies-synced meeting, extracting and operationalizing action items into Asana or CRM tasks
- Running `/fireflies-sync` to pull transcripts from the Fireflies API and normalize them into the OpsPal transcript format
- Diagnosing sync failures where transcripts are missing, partial, or duplicated
- Setting up the meeting-to-action pipeline for the first time (auth + taxonomy configuration)
- QA-reviewing AI-extracted action items for accuracy before committing them to downstream systems

**Not for**: Live meeting transcription — Fireflies handles recording; this skill operates on completed transcripts.

## Required Inputs

| Input | Description |
|-------|-------------|
| Meeting source scope | Space ID, user filter, or date range |
| Action taxonomy | Configured categories (follow-up, blocker, decision, commitment) |
| Sync window | Start/end timestamps for the pull |

## Output Artifacts

- Normalized transcript package (speaker-attributed, timestamped)
- Action-item extraction results with confidence scores
- QA findings report (low-confidence items flagged for human review)
- Follow-up queue ready for Asana task creation

## Workflow

1. Run `/fireflies-auth` to confirm API credentials are valid and quota is available.
2. Scope the sync: specify meeting space, date window, and participant filter using `/fireflies-sync`.
3. Review the normalized transcript package — confirm speaker attribution is correct and redact any confidential content per retention policy.
4. Run action extraction: apply the configured taxonomy to surface follow-ups, decisions, and commitments.
5. QA extracted items: flag any with confidence < 0.75 for human review before promoting to Asana or CRM.
6. Deliver the follow-up queue via `/fireflies-action-items` and confirm owners are assigned.

## Safety Checks

- Apply transcript retention limits (default: 90 days; configurable per space)
- Redact PII and confidential deal terms before storing normalized output
- Require confidence threshold >= 0.75 for auto-promoted action items
