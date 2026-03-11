# Changelog

All notable changes to the OKR Strategy Plugin will be documented in this file.

## [3.0.0] - 2026-03-10

### Added — Phase 4: "Dashboard, Cadence & Alignment"

#### Agents
- `okr-dashboard-generator` (sonnet) — Interactive HTML dashboards with RAG heatmaps and confidence bands
- `okr-cadence-manager` (sonnet) — Operating rhythm: weekly check-ins, monthly scorecards, quarterly reviews
- `okr-alignment-auditor` (sonnet) — Cascade integrity audit with 100-point alignment scoring

#### Commands
- `/okr-dashboard` — Generate interactive HTML dashboard for an OKR cycle
- `/okr-cadence` — Manage operating rhythm (setup, review, rollout)
- `/okr-align-check` — Audit cascade integrity and alignment scoring

#### Skills
- `okr-dashboard-design-patterns` — RAG heatmap rules, audience modes, brand compliance
- `okr-change-management` — Nine-step rollout playbook, cadence tiers, anti-patterns

#### Templates
- `templates/pdf-covers/okr-executive-report.md` — EJS cover page for OKR cycle reports
- `templates/web-viz/okr-cycle-dashboard.json` — Dashboard component layout and data bindings
- `templates/web-viz/demo-data/okr-cycle-dashboard-demo.json` — Simulated demo data for dashboard
- `templates/reports/weekly-kr-update.md` — Weekly KR check-in template
- `templates/reports/monthly-scorecard.md` — Monthly executive scorecard template
- `templates/reports/quarterly-review.md` — End-of-quarter review template

#### Shared Agent Fragments
- `agents/shared/okr-confidence-rating-reference.yaml` — Canonical RAG and confidence band definitions
- `agents/shared/okr-alignment-cascade-reference.yaml` — Cascade levels, alignment rules, scoring

#### Hooks
- `hooks/session-start-okr-context-loader.sh` — Auto-load active OKR cycle on session start
- `hooks/pre-write-okr-path-validator.sh` — Validate OKR output paths
- `hooks/post-task-okr-telemetry.sh` — Capture OKR agent telemetry to JSONL

#### Documentation
- `docs/okr-rollout-playbook.md` — Client-deliverable nine-step rollout guide
- `docs/okr-cadence-guide.md` — Operational cadence tier reference
- `docs/okr-platform-comparison.md` — opspal-okrs vs Lattice/Gtmhub/Notion comparison

#### Bug Fixes
- Fixed version footer in `okr-strategy-orchestrator` (was 1.0.0, now 3.0.0)
- Added telemetry frontmatter to `/okr-generate` and `/okr-snapshot` commands
- Added `_instructions` and `calibration_settings` to `config/okr-outcomes.json`
- Updated orchestrator dependencies and routing entries for 3 new agents

## [2.0.0] - 2026-03-10

### Added — Phase 3: "Adaptive Intelligence + PLG"

#### Agents
- `okr-learning-engine` (sonnet) — Outcome capture, calibration, and historical accuracy analysis
- `okr-plg-specialist` (sonnet) — PLG and hybrid-motion OKR design from product funnel signals

#### Commands
- `/okr-plg-signals` — PLG health and PQL signal analysis
- `/okr-retrospective` — Close-cycle learning capture and calibration review
- `/okr-benchmark` — Benchmark comparison for OKR targets and initiatives
- `/okr-history` — Historical OKR accuracy and calibration view

#### Skills
- `plg-slg-hybrid-okr-patterns` — PLG/SLG hybrid benchmarks, handoff logic, and attribution
- `okr-benchmark-calibration` — Benchmark adjustment by stage, momentum, and GTM model
- `okr-retrospective-framework` — Structured learning capture, classification, and root-cause review

#### Calibration And Routing
- `scripts/lib/okr-outcome-calibrator.js` now supports outcome classification, exponential smoothing, Beta-prior calibration, and P10/P50/P90 confidence intervals
- `config/okr-outcomes.json` now stores learning settings and metric priors
- `config/okr-routing-keywords.json` and core routing now cover PLG and learning-engine entry points

#### Workflow Updates
- `okr-strategy-orchestrator` is being extended to include retrospective, history, and PLG signal workflows
- Plugin version advanced to `2.0.0` for the Phase 3 rollout

### Planned — Next
- Deeper runtime use of calibration in target generation and progress tracking
- Additional PLG benchmark automation and closed-loop attribution reporting

## [1.0.0] - 2026-03-10

### Added — Phase 2: "Full Lifecycle"

#### Agents
- `okr-initiative-prioritizer` (opus) — Portfolio scoring and backlog cut-line decisions
- `okr-initiative-evaluator` (sonnet) — One-shot initiative scorecards with confidence framing
- `okr-progress-tracker` (sonnet) — KR health and projected finish monitoring
- `okr-executive-reporter` (sonnet) — BLUF+4 executive and board reporting
- `okr-asana-bridge` (sonnet) — Approved OKR structure sync into Asana
- `okr-funnel-analyst` (sonnet) — Funnel bottleneck and leverage analysis for scoring

#### Commands
- `/okr-score-initiative` — Score a single initiative against the active cycle
- `/okr-prioritize` — Rank a cycle backlog with a capacity-aware cut line
- `/okr-status` — Report current KR and objective health with confidence bands
- `/okr-report` — Generate a BLUF+4 executive OKR report
- `/okr-approve` — Freeze, approve, and activate a draft OKR set

#### Skills
- `initiative-scoring-methodology` — Five-dimension scoring, WSJF-style urgency, funnel leverage
- `executive-okr-communication` — Board/executive communication standard with BLUF+4

#### Configuration And Scripts
- `scripts/lib/okr-initiative-scorer.js` — CLI scorer with `score`, `batch-score`, and `rank`
- `config/initiative-scoring-rubric.json` — Funnel leverage and Gong timing signal extensions
- `config/okr-schema.json` — Confidence bands, board summary, funnel leverage, and Asana fields
- `config/okr-routing-keywords.json` — Phase 2 routing coverage for prioritization, reporting, and sync workflows

#### Workflow Updates
- `okr-strategy-orchestrator` now sequences generate -> score -> prioritize -> approve -> sync -> track
- Core routing registry now includes OKR-specific patterns and slash-command mappings

### Planned — Phase 3 (v2.0.0)
- Learning engine and PLG specialist agents
- Adaptive target calibration from outcome history
- `/okr-plg-signals`, `/okr-retrospective`, `/okr-benchmark`, `/okr-history` commands
- `plg-slg-hybrid-okr-patterns`, `okr-benchmark-calibration`, `okr-retrospective-framework` skills

## [0.1.0] - 2026-03-09

### Added — Phase 1 MVP: "Data-Driven OKR Draft"

#### Agents
- `okr-strategy-orchestrator` (opus) — Master coordinator for OKR lifecycle
- `okr-data-aggregator` (sonnet) — Multi-platform data collection via existing agents
- `okr-generator` (sonnet) — OKR creation from snapshots with three stances

#### Commands
- `/okr-generate` — Generate OKRs from live revenue data
- `/okr-snapshot` — Pull revenue snapshot across all platforms

#### Skills
- `okr-methodology-framework` — OKR writing discipline, anti-patterns, targets
- `okr-data-sourcing-protocol` — Platform-to-metric mapping, fallback strategies

#### Configuration
- `okr-schema.json` — Complete OKR data model (cycles, objectives, KRs, initiatives)
- `initiative-scoring-rubric.json` — 5-dimension scoring with stage modifiers
- `okr-outcomes.json` — Learning store seed (empty)
- `okr-routing-keywords.json` — Plugin routing registration

#### Scripts
- `okr-state-manager.js` — OKR cycle lifecycle (create, status, transition, list)
- `okr-snapshot-normalizer.js` — Snapshot validation and comparison
- `okr-outcome-calibrator.js` — Outcome recording and calibration (seed)

#### Documentation
- `CLAUDE.md` — Plugin user guide with routing tables
- `USAGE.md` — Detailed usage examples and FAQ
- `CHANGELOG.md` — This file

### Planned — Phase 2 (v1.0.0)
- Initiative prioritizer and evaluator agents
- Progress tracker and executive reporter
- Asana bridge for OKR project tracking
- `/okr-score-initiative`, `/okr-prioritize`, `/okr-status`, `/okr-report`, `/okr-approve` commands
- `initiative-scoring-methodology` and `executive-okr-communication` skills
