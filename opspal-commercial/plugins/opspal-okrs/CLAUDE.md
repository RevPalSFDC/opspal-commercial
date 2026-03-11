# OKR Strategy Plugin - User Guide

This file provides guidance when using the OKR Strategy Plugin with Claude Code.

## Plugin Overview

The **OKR Strategy Plugin** generates, scores, approves, tracks, calibrates, and reports OKRs from live revenue, funnel, and product signals across Salesforce, HubSpot, Gong, product analytics, and Asana. OKRs are grounded in real baselines, confidence-aware targets, initiative prioritization, benchmark context, and close-cycle learning rather than static spreadsheet planning.

**Version**: 3.0.0 (Phase 4)
**Status**: Production
**Repository**: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace

## What Makes This Different

- Baselines come from live SOQL queries and API calls, not manual guesses
- Targets carry Aggressive, Base, Conservative, and `confidence_band` framing
- Initiative scoring uses a five-dimension rubric with stage modifiers, GTM bonuses, and funnel leverage
- Executive reporting follows BLUF+4 with a five-number board scoreline
- PLG and hybrid-motion planning translate PQL, activation, conversion, and expansion signals into KRs
- Closed cycles feed a learning engine that records outcomes, smooths attainment, and calibrates future targets
- Approved cycles can sync into Asana for execution tracking

## Quick Start

```bash
# Generate a new OKR draft
/okr-generate --org acme-corp --cycle Q3-2026

# Rank backlog initiatives for the cycle
/okr-prioritize --org acme-corp --cycle Q3-2026 --backlog ./initiative-backlog.json

# Review PLG and hybrid-motion signals before approval
/okr-plg-signals --org acme-corp --cycle Q3-2026

# Approve and activate the cycle
/okr-approve --org acme-corp --cycle Q3-2026 --activate-asana

# Close the loop after the cycle ends
/okr-retrospective --org acme-corp --cycle Q3-2026
```

## Available Agents

| Agent | Model | Description | Trigger Keywords |
|-------|-------|-------------|------------------|
| `okr-strategy-orchestrator` | opus | End-to-end OKR lifecycle coordination | "okr", "objective", "key result", "approve okr" |
| `okr-data-aggregator` | sonnet | Multi-platform revenue snapshot collection | "revenue snapshot", "okr snapshot" |
| `okr-generator` | sonnet | Draft OKR creation with stance and confidence framing | "generate okr", "draft okr", "set targets" |
| `okr-initiative-prioritizer` | opus | Portfolio scoring and backlog ranking | "prioritize initiatives", "okr prioritize", "backlog ranking" |
| `okr-initiative-evaluator` | sonnet | One-off initiative scorecards and benchmark checks | "score initiative", "evaluate initiative", "okr score" |
| `okr-progress-tracker` | sonnet | KR and objective health monitoring | "okr status", "okr progress", "kr health" |
| `okr-executive-reporter` | sonnet | BLUF+4 board and executive reporting | "okr report", "board update", "bluf okr" |
| `okr-asana-bridge` | sonnet | Asana project and task sync for approved OKRs | "asana sync", "okr asana", "project tracking" |
| `okr-funnel-analyst` | sonnet | Funnel bottleneck and leverage analysis | "funnel leverage", "okr funnel", "conversion leverage" |
| `okr-learning-engine` | sonnet | Historical accuracy, calibration, and retrospective learning | "okr retrospective", "okr history", "target calibration" |
| `okr-plg-specialist` | sonnet | PLG and hybrid-motion OKR design from product signals | "okr plg", "pql signals", "hybrid motion" |
| `okr-dashboard-generator` | sonnet | Interactive HTML dashboards with RAG heatmaps | "okr dashboard", "visualize okr", "okr heatmap" |
| `okr-cadence-manager` | sonnet | Operating rhythm: weekly/monthly/quarterly cadence | "okr cadence", "operating rhythm", "okr schedule" |
| `okr-alignment-auditor` | sonnet | Cascade integrity audit with alignment scoring | "okr alignment", "cascade audit", "orphan objective" |

## Available Commands

| Command | Description |
|---------|-------------|
| `/okr-generate` | Generate OKRs from current revenue data for a cycle |
| `/okr-snapshot` | Pull a live revenue snapshot without drafting OKRs |
| `/okr-score-initiative` | Score one initiative with evidence and recommendation |
| `/okr-prioritize` | Rank a backlog with a capacity-aware cut line |
| `/okr-status` | Report current objective and KR health |
| `/okr-report` | Produce a BLUF+4 executive report |
| `/okr-approve` | Approve and activate a draft OKR set |
| `/okr-plg-signals` | Review PLG, PQL, and hybrid-motion signals for OKR design |
| `/okr-retrospective` | Record close-cycle outcomes and publish planning learnings |
| `/okr-benchmark` | Compare OKR targets and initiative assumptions against peer benchmarks |
| `/okr-history` | Show historical OKR accuracy and calibration state |
| `/okr-dashboard` | Generate interactive HTML dashboard for an OKR cycle |
| `/okr-cadence` | Manage operating rhythm (setup, review, rollout) |
| `/okr-align-check` | Audit cascade integrity and alignment scoring |

## Mandatory Routing

| Keywords | Agent |
|----------|-------|
| okr/objective/key result/strategic okr/approve okr | `opspal-okrs:okr-strategy-orchestrator` |
| revenue snapshot/okr snapshot/platform data snapshot | `opspal-okrs:okr-data-aggregator` |
| generate okr/create okr/draft okr/set targets | `opspal-okrs:okr-generator` |
| okr dashboard/visualize okr/okr heatmap/okr viz | `opspal-okrs:okr-dashboard-generator` |

## Recommended Routing

| Keywords | Agent |
|----------|-------|
| score initiative/evaluate initiative/okr score | `opspal-okrs:okr-initiative-evaluator` |
| prioritize initiatives/initiative backlog/okr prioritize | `opspal-okrs:okr-initiative-prioritizer` |
| okr status/okr progress/kr health | `opspal-okrs:okr-progress-tracker` |
| okr report/board okr report/bluf okr | `opspal-okrs:okr-executive-reporter` |
| asana sync/okr asana/asana bridge | `opspal-okrs:okr-asana-bridge` |
| funnel leverage/okr funnel/conversion leverage | `opspal-okrs:okr-funnel-analyst` |
| okr retrospective/okr history/okr calibration | `opspal-okrs:okr-learning-engine` |
| okr plg/plg signals/pql signals/hybrid okr | `opspal-okrs:okr-plg-specialist` |
| okr benchmark/peer comparison/benchmark okr | `opspal-okrs:okr-initiative-evaluator` |
| okr cadence/operating rhythm/okr schedule | `opspal-okrs:okr-cadence-manager` |
| okr alignment/cascade audit/cascade check | `opspal-okrs:okr-alignment-auditor` |

## Data Flow

```text
Platform Data (Salesforce, HubSpot, Gong, Product Analytics)
    -> okr-data-aggregator -> revenue-snapshot.json
    -> okr-generator -> okr-draft-{cycle}.json
    -> okr-funnel-analyst / okr-initiative-evaluator / okr-initiative-prioritizer
    -> okr-plg-specialist (when product-led or hybrid motion matters)
    -> okr-strategy-orchestrator approval gate
    -> okr-asana-bridge (optional) -> Asana project sync
    -> okr-progress-tracker -> status snapshots
    -> okr-executive-reporter -> BLUF+4 report
    -> okr-learning-engine -> okr-outcomes.json -> future calibration guidance
```

## Output Structure

```text
orgs/{org}/platforms/okr/{cycle}/
├── snapshots/
│   └── revenue-snapshot.json
├── drafts/
│   └── okr-draft-{cycle}.json
├── approved/
│   └── okr-{cycle}.json
└── reports/
    ├── initiative-priority-stack.json
    ├── initiative-scorecard-{timestamp}.json
    ├── okr-benchmark-{date}.md
    ├── okr-executive-report-{cycle}.md
    ├── okr-plg-signals-{date}.md
    ├── okr-retrospective-{cycle}.md
    ├── okr-status-{date}.json
    ├── okr-summary-{cycle}.md
    ├── okr-dashboard-{cycle}-{date}.html
    ├── cadence-calendar.json
    ├── cadence-health-{date}.json
    ├── alignment-audit-{cycle}.json
    ├── weekly-kr-update-{date}.md
    └── monthly-scorecard-{month}.md
```

Shared learning artifacts are recorded in `config/okr-outcomes.json` and can be surfaced through `/okr-history`.

## Schema Highlights

OKR sets follow `config/okr-schema.json` and support:
- `confidence_band` on KRs with `p10`, `p50`, and `p90`
- `board_summary` on the cycle for executive rollups
- `funnel_leverage_estimate` on initiatives for prioritization context
- `asana_project_gid` for execution sync

Historical calibration is stored in `config/okr-outcomes.json` with:
- metric-level attainment history
- smoothed target-vs-actual ratios
- Beta priors and posterior confidence framing
- a minimum 4-cycle warning before calibration is treated as decision-grade

## Skills

| Skill | Purpose |
|-------|---------|
| `okr-methodology-framework` | Core OKR quality and anti-pattern guardrails |
| `okr-data-sourcing-protocol` | Platform-to-metric mapping and evidence requirements |
| `initiative-scoring-methodology` | Five-dimension scoring, urgency logic, and funnel leverage |
| `executive-okr-communication` | BLUF+4 reporting and audience-specific communication |
| `plg-slg-hybrid-okr-patterns` | PQL scoring, activation-to-expansion patterns, and hybrid handoff rules |
| `okr-benchmark-calibration` | Stage-aware benchmark interpretation and posture calibration |
| `okr-retrospective-framework` | Close-cycle learning capture, root-cause taxonomy, and feedback loops |
| `okr-dashboard-design-patterns` | RAG heatmap rules, audience modes, confidence band display, brand compliance |
| `okr-change-management` | Nine-step rollout playbook, cadence tiers, adoption anti-patterns |

## Templates

| Template | Purpose |
|----------|---------|
| `templates/pdf-covers/okr-executive-report.md` | EJS cover page for OKR cycle reports |
| `templates/web-viz/okr-cycle-dashboard.json` | Dashboard component layout and data bindings |
| `templates/web-viz/demo-data/okr-cycle-dashboard-demo.json` | Demo data for dashboard preview |
| `templates/reports/weekly-kr-update.md` | Weekly KR progress check-in template |
| `templates/reports/monthly-scorecard.md` | Monthly executive scorecard template |
| `templates/reports/quarterly-review.md` | End-of-quarter review template |

## Hooks

| Hook | Event | Purpose |
|------|-------|---------|
| `session-start-okr-context-loader.sh` | SessionStart | Auto-load active OKR cycle when ORG_SLUG is set |
| `pre-write-okr-path-validator.sh` | PreToolUse/Write | Validate OKR output paths follow convention |
| `post-task-okr-telemetry.sh` | PostToolUse/Task | Capture agent telemetry to JSONL |

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/lib/okr-state-manager.js` | OKR cycle lifecycle management |
| `scripts/lib/okr-snapshot-normalizer.js` | Snapshot validation and comparison |
| `scripts/lib/okr-initiative-scorer.js` | Initiative scoring CLI for single and batch ranking |
| `scripts/lib/okr-outcome-calibrator.js` | Outcome recording, Bayesian calibration, and history reporting |

## Requirements

- **Minimum**: Salesforce org connected
- **Recommended**: HubSpot portal connected
- **Optional**: Gong, product analytics, Asana
- **Environment**: `ORG_SLUG` set for automatic org detection
- **PLG workflows**: Product analytics access is required for `/okr-plg-signals`

## Roadmap

| Phase | Version | Features |
|-------|---------|----------|
| Phase 1 | v0.1.0 | Data-driven draft generation and snapshots |
| Phase 2 | v1.0.0 | Initiative prioritization, progress tracking, executive reports, Asana bridge |
| Phase 3 | v2.0.0 | Learning engine, PLG specialist, benchmarks, retrospectives |
| **Phase 4 (Current)** | v3.0.0 | Interactive dashboards, cadence management, alignment auditing, templates, hooks, docs |

## Troubleshooting

### "Insufficient data for OKR generation"
**Cause**: Salesforce org has limited pipeline or opportunity data.
**Fix**: Ensure at least 12 months of Opportunity data exists. Connect HubSpot for enrichment.

### "Initiative score confidence is low"
**Cause**: The proposal lacks query evidence, benchmark coverage, or funnel analysis.
**Fix**: Run `/okr-score-initiative` with a stronger evidence pack or collect funnel diagnostics first.

### "Calibration is still provisional"
**Cause**: Fewer than 4 completed OKR cycles have been recorded for the org or metric.
**Fix**: Use the learning output directionally, not as a hard target-setting rule, until more cycles are captured.

### "PLG signal review cannot complete"
**Cause**: Product analytics or PQL definitions are missing.
**Fix**: Connect Pendo, Amplitude, or Mixpanel and document the PQL rule before using `/okr-plg-signals`.

### "Schema validation failed"
**Cause**: Generated OKR output does not match `config/okr-schema.json`.
**Fix**: Retry generation after correcting missing fields such as `confidence_band`, `board_summary`, or initiative metadata.

---

**Version**: 3.0.0
**Last Updated**: 2026-03-10
