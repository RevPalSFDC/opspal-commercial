# OKR Strategy Plugin — Usage Guide

## Installation

```bash
/plugin marketplace add RevPalSFDC/opspal-internal-plugins
/plugin install opspal-okrs@revpal-internal-plugins
```

## Prerequisites

1. **Salesforce org connected** — The minimum requirement for OKR generation
2. **ORG_SLUG set** — `export ORG_SLUG=acme-corp`
3. **opspal-core installed** — For KPI benchmark definitions
4. **opspal-salesforce installed** — For Salesforce data queries
5. (Recommended) **opspal-hubspot installed** — For marketing funnel data
6. (Recommended) **opspal-gtm-planning installed** — For forecast and retention analysis

## Common Workflows

### Generate and Approve a New Cycle

```bash
# Step 1: Set your org context
export ORG_SLUG=acme-corp

# Step 2: Generate OKRs
/okr-generate --org acme-corp --cycle Q3-2026

# Step 3: Review the draft
# The system will present a summary table and wait for approval

# Step 4: Approve
# Say "APPROVED: OKR-Q3-2026" to activate the OKR set
```

### Prioritize Initiatives Before Approval

```bash
# Rank a full backlog
/okr-prioritize --org acme-corp --cycle Q3-2026 --backlog ./initiative-backlog.json

# Score one idea in detail
/okr-score-initiative --org acme-corp --cycle Q3-2026 --initiative ./initiative.json

# Compare proposed targets with benchmark context
/okr-benchmark --org acme-corp --cycle Q3-2026 --focus growth
```

### Review PLG and Hybrid-Motion Signals

```bash
# Pull PLG signals and recommended KRs
/okr-plg-signals --org acme-corp --cycle Q3-2026

# Export machine-readable hybrid-motion guidance
/okr-plg-signals --org acme-corp --format json
```

### Quick Revenue Snapshot

```bash
# Pull current state without generating OKRs
/okr-snapshot --org acme-corp

# Compare with a previous snapshot
node plugins/opspal-okrs/scripts/lib/okr-snapshot-normalizer.js compare \
  orgs/acme-corp/platforms/okr/snapshots/snapshot-2026-02-01.json \
  orgs/acme-corp/platforms/okr/snapshots/snapshot-2026-03-01.json
```

### Check OKR Cycle Status

```bash
# List all cycles for an org
node plugins/opspal-okrs/scripts/lib/okr-state-manager.js list acme-corp

# Check specific cycle status
node plugins/opspal-okrs/scripts/lib/okr-state-manager.js status acme-corp Q3-2026
```

### Close the Loop After a Cycle

```bash
# Record final outcomes and calibration updates
/okr-retrospective --org acme-corp --cycle Q3-2026

# Review historical target accuracy
/okr-history --org acme-corp

# Inspect the calibration store directly
node plugins/opspal-okrs/scripts/lib/okr-outcome-calibrator.js report acme-corp
```

## Understanding the Output

### Revenue Snapshot

The snapshot contains metrics organized by category:
- **revenue**: ARR, MRR, bookings
- **pipeline**: Coverage ratio, stage distribution, deal velocity
- **efficiency**: Win rate, sales cycle, quota attainment
- **retention**: NRR, GRR, churn rate
- **acquisition**: MQL volume, SQL conversion, lead velocity
- **plg**: PQL count, activation rate, free-to-paid (if applicable)
- **competitive**: Win/loss themes (if Gong connected)

### OKR Draft

Each draft includes:
- **3-5 objectives** covering key strategic themes
- **2-5 key results** per objective with:
  - Real baseline from platform data
  - Three target stances (aggressive/base/conservative)
  - `confidence_band` with P10/P50/P90 framing
  - Weight within the objective
  - Reference to canonical metric definition
- **Summary report** with benchmark comparisons
- **Initiative metadata** such as `funnel_leverage_estimate` and `board_summary` where applicable

### Retrospective and History

Close-cycle output includes:
- **KR outcome classification** as `hit`, `partial`, or `miss`
- **Variance tracking** between planned target and actual result
- **Smoothed attainment history** per metric
- **Beta-prior calibration state** with P10/P50/P90 confidence framing
- **Warnings** when fewer than 4 completed cycles exist and the learning is still provisional

### PLG Signals

PLG reviews include:
- **Visitor to signup**, activation, PQL, and paid conversion baselines
- **Benchmark framing** for product-led and hybrid motions
- **Attribution split** across product-sourced, sales-assisted, and sales-sourced revenue
- **Handoff rules** for when usage should remain self-serve or move to sales-assisted / sales-led

### Three Stances

| Stance | Description | Probability |
|--------|-------------|-------------|
| Conservative | High confidence target | 70-80% |
| Base | Expected outcome | ~50% |
| Aggressive | Stretch target | 20-30% |

## Configuration

### OKR Schema
All OKR sets conform to `config/okr-schema.json`. This ensures consistency and enables automated validation.

### Initiative Scoring Rubric
`config/initiative-scoring-rubric.json` defines the 5-dimension scoring model with stage-specific modifiers.

### Outcomes Store
`config/okr-outcomes.json` stores historical KR outcomes, smoothed attainment ratios, and Bayesian priors for future calibration.

## Dashboard Generation (Phase 4)

Generate interactive HTML dashboards with RAG heatmaps, confidence bands, and initiative watchlists.

```bash
# Full executive dashboard
/okr-dashboard --org acme-corp --cycle Q3-2026

# Board-level summary (minimal view)
/okr-dashboard --org acme-corp --cycle Q3-2026 --audience board

# Department view with KR detail
/okr-dashboard --org acme-corp --cycle Q3-2026 --audience department

# Open in browser after generation
/okr-dashboard --org acme-corp --cycle Q3-2026 --open
```

The dashboard outputs a self-contained HTML file to `orgs/{org}/platforms/okr/{cycle}/reports/okr-dashboard-{cycle}-{date}.html`.

**Audience modes:**
- **Board** — KPI scoreline + objective heatmap only
- **Exec** (default) — Full dashboard with all components
- **Department** — Full dashboard + per-KR detail table

## Cadence Setup (Phase 4)

Establish the weekly/monthly/quarterly operating rhythm for OKR tracking.

```bash
# Set up cadence with Asana tasks
/okr-cadence --org acme-corp --cycle Q3-2026 --action setup --activate-asana

# Check cadence health (missed check-ins, stale data)
/okr-cadence --org acme-corp --cycle Q3-2026 --action review

# Execute 9-step rollout playbook
/okr-cadence --org acme-corp --cycle Q3-2026 --action rollout
```

See `docs/okr-cadence-guide.md` for the complete cadence tier reference and `docs/okr-rollout-playbook.md` for the step-by-step rollout guide.

## Alignment Auditing (Phase 4)

Validate that OKRs cascade correctly from company → department → team.

```bash
# Full alignment audit
/okr-align-check --org acme-corp --cycle Q3-2026

# Audit specific level
/okr-align-check --org acme-corp --cycle Q3-2026 --level department

# Markdown output
/okr-align-check --org acme-corp --cycle Q3-2026 --format markdown
```

The audit scores alignment on a 100-point scale:
- **Cascade completeness** (40 pts) — Parent-child links
- **DRI coverage** (25 pts) — Every objective has an owner
- **No orphans** (20 pts) — No unlinked objectives
- **No circular deps** (15 pts) — No cycles in parent chain

## Platform Guidance

See `docs/okr-platform-comparison.md` for when to use this plugin vs dedicated OKR tools (Lattice, Gtmhub, Notion), migration considerations, and hybrid approaches.

## FAQ

**Q: What if I don't have HubSpot connected?**
A: OKRs will still generate from Salesforce data. Marketing-specific KRs (MQL volume, lead velocity) will be flagged as needing manual baselines.

**Q: Can I edit the generated OKRs?**
A: Yes. Edit the draft JSON directly at `orgs/{org}/platforms/okr/{cycle}/drafts/okr-draft-{cycle}.json`, then approve.

**Q: How are targets calculated?**
A: Targets use current org baselines first, then benchmark context from `revops-kpi-definitions.json`, and finally historical calibration when at least 4 completed cycles exist for the metric.

**Q: What's the minimum data needed?**
A: At least Salesforce Opportunity data. More platforms = richer OKRs with higher confidence baselines.

**Q: Can I use the plugin for PLG or hybrid motions?**
A: Yes, but `/okr-plg-signals` needs product analytics evidence and a documented PQL definition to be reliable.

**Q: When should I trust the learning engine?**
A: Treat it as directional for the first 1-3 cycles. It becomes decision-grade only after 4 or more completed cycles are recorded.
