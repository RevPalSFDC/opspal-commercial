---
name: okr-dashboard
description: Generate an interactive HTML dashboard for an active OKR cycle
argument-hint: "--org <org-slug> --cycle <cycle> [--audience board|exec|department] [--open]"
intent: Produce a self-contained HTML dashboard visualizing OKR health, confidence bands, and initiative status.
dependencies: [opspal-okrs:okr-dashboard-generator, opspal-okrs:okr-progress-tracker]
failure_modes: [org_not_provided, no_active_cycle, missing_status_data]
visibility: user-invocable
aliases:
  - okr-viz
  - okr-html
tags:
  - okr
  - dashboard
  - visualization
telemetry-contract: opspal-command-telemetry-v1
telemetry-enabled: true
---

# /okr-dashboard Command

Generate an interactive HTML dashboard for an OKR cycle with RAG heatmaps, confidence bands, and initiative watchlists.

## Usage

```bash
# Full executive dashboard
/okr-dashboard --org acme-corp --cycle Q3-2026

# Board-level summary (scoreline + heatmap only)
/okr-dashboard --org acme-corp --cycle Q3-2026 --audience board

# Department view with KR detail
/okr-dashboard --org acme-corp --cycle Q3-2026 --audience department

# Open in browser after generation
/okr-dashboard --org acme-corp --cycle Q3-2026 --open

# Use current org (ORG_SLUG env var)
/okr-dashboard --cycle Q3-2026
```

## What This Does

1. **Refreshes health data** — Runs progress tracker to get current KR status
2. **Loads template** — Uses `templates/web-viz/okr-cycle-dashboard.json`
3. **Generates HTML** — Self-contained file with Chart.js, RevPal branding, and interactive components
4. **Applies audience mode** — Board (minimal), Exec (full), Department (full + KR detail)

## Output

| File | Location | Description |
|------|----------|-------------|
| HTML Dashboard | `orgs/{org}/platforms/okr/{cycle}/reports/okr-dashboard-{cycle}-{date}.html` | Interactive dashboard |

## Audience Modes

| Mode | Components Shown |
|------|-----------------|
| `board` | KPI scoreline + objective health heatmap |
| `exec` (default) | All components: KPIs, heatmap, confidence chart, watchlist, trend |
| `department` | All exec components + per-KR detail table |

## Execution

```javascript
Task({
  subagent_type: 'opspal-okrs:okr-dashboard-generator',
  prompt: `Generate OKR dashboard for org: ${org || process.env.ORG_SLUG}
    Cycle: ${cycle}
    Audience: ${audience || 'exec'}
    Open after generation: ${open || false}`
});
```

## Related Commands

- `/okr-status` — Check KR health (text output)
- `/okr-report` — Generate BLUF+4 executive report (Markdown/PDF)
- `/okr-cadence` — Manage operating rhythm
