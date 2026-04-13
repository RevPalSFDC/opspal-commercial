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

- Running `/gong-sync` to push Gong call data into Salesforce or HubSpot and validating that `Gong_Call_ID__c` idempotency is working
- Generating a deal risk report via `/gong-risk-report` — interpreting risk signals (going dark, single-threaded, competitor mentions)
- Diagnosing Gong API quota issues: daily budget at 80%+ triggers warnings; 95%+ blocks new calls
- Producing competitive intelligence reports with `/gong-competitive-intel` from tracker data
- QA-reviewing enrichment extraction — validating that call summaries, next steps, and speaker attribution are accurate before CRM write

**Not for**: Configuring Gong trackers or recording settings — those are managed in the Gong platform UI.

## Required Inputs

| Input | Description |
|-------|-------------|
| Account / deal scope | Pipeline segment, deal IDs, or `--min-amount` filter |
| Time window | `--since 7d`, `--since 30d`, or explicit date range |
| Required insight schema | Risk signals, competitive trackers, or engagement metrics |

## Output Artifacts

- Sync quality report (call count synced, duplicates skipped, errors logged)
- Extraction validation checklist (speaker attribution, summary accuracy, tracker hits)
- Delivery readiness summary (deals flagged for risk, competitive signals surfaced)

## Workflow

1. Run `/gong-auth status` to confirm API quota headroom before any bulk sync operation.
2. Define scope: select pipeline segment and time window; use `--dry-run` to preview sync volume without writing.
3. Execute `/gong-sync` and review the quality report — confirm `Gong_Call_ID__c` matches prevent duplicates in CRM.
4. For risk analysis, run `/gong-risk-report` and validate each flagged deal against the risk signal thresholds (see CLAUDE.md risk signal table).
5. Review low-confidence extractions: flag insights where speaker attribution is ambiguous or tracker matches are borderline.
6. Deliver the competitive intelligence report via `/gong-competitive-intel` with source attribution for every claim.

## Safety Checks

- Enforce source attribution: every insight must cite the call ID and timestamp
- Redact sensitive negotiation details before committing summaries to CRM fields
- Flag and hold low-confidence insights (< 0.70 score) for human review before CRM write
