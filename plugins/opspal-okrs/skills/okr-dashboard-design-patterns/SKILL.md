---
name: okr-dashboard-design-patterns
description: Design patterns for OKR executive dashboards including RAG heatmaps, confidence bands, audience modes, and brand compliance.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# OKR Dashboard Design Patterns

This skill provides canonical design rules for generating OKR cycle dashboards. Any agent producing HTML dashboards for OKR data MUST follow these patterns.

## Component Selection Rules

Map data types to dashboard components:

| Data Type | Component | Example |
|-----------|-----------|---------|
| Single metric with trend | KPI card | ARR growth, NRR, pipeline coverage |
| Status per objective/KR | Heatmap table with RAG badges | Objective health grid |
| Distribution or comparison | Bar chart (horizontal or vertical) | KR confidence bands |
| Time series | Line chart with fill | Weekly KR completion trend |
| Ranked list with metadata | Sortable table | Initiative watchlist |
| Score with thresholds | Gauge | Overall cycle health |

## RAG Heatmap Design Rules

1. **Color thresholds** follow the canonical `okr-confidence-rating-reference.yaml`:
   - Green (`.status-green`, `#22C55E`): On Track — completion ≥70%
   - Yellow (`.status-yellow`, `#F59E0B`): At Risk — completion 40-69%
   - Red (`.status-red`, `#EF4444`): Off Track — completion <40%
2. **Always pair color with text** — Never rely on color alone. Every RAG cell must display the status label (e.g., "On Track") alongside the color.
3. **Use CSS classes, not inline colors** — Reference `.status-green`, `.status-yellow`, `.status-red` from the RevPal dashboard theme.
4. **Trend arrows** — Show directional movement with unicode arrows (↑ improving, → stable, ↓ declining).

## Five-Number Scoreline

The board-level scoreline always appears in row 1 as four KPI cards:

| Position | Metric | Format |
|----------|--------|--------|
| Col 1-3 | ARR Growth | Percent with trend |
| Col 4-6 | Net Revenue Retention | Percent with trend |
| Col 7-9 | Pipeline Coverage | Number with "x" suffix |
| Col 10-12 | KR Completion Rate | Percent with trend |

These four KPIs are the minimum for any OKR dashboard regardless of audience mode.

## Confidence Band Display

When showing P10/P50/P90 confidence bands:
- Use horizontal bar chart with three stacked/grouped bars per KR
- P10 = light gray (`#94A3B8`), P50 = grape (`#5F3B8C`), P90 = apricot (`#E99560`)
- Add a vertical target line at 100% for reference
- Label tooltip with stance names: "Conservative", "Expected", "Aggressive"

## Audience Mode Differences

### Board Mode
- Show: Five-number scoreline + objective health heatmap ONLY
- Hide: Initiative watchlist, detailed KR table, health trend
- Simplify: Reduce columns in heatmap to objective + overall status + trend

### Executive Mode
- Show: All components (full dashboard)
- Default mode when no audience is specified

### Department Mode
- Show: All components + expanded KR detail table
- Add: Per-KR breakdown with current value, target, baseline, progress bar
- Filter: Only show objectives relevant to the selected department

## Brand Compliance

- **Always** reference `opspal-core/templates/web-viz/themes/revpal-dashboard.css`
- **Never** inline brand colors — use CSS variables: `--brand-grape`, `--brand-apricot`, `--brand-indigo`, `--brand-sand`, `--brand-green`
- **Typography**: Montserrat for headings, Figtree for body
- **Structure**: `dashboard-container` → `dashboard-header` → `dashboard-content` → `dashboard-grid`
- **Component classes**: `.viz-kpi`, `.viz-chart`, `.viz-table`, `.viz-component`

## Anti-Patterns

- Never create a dashboard with only charts and no KPI cards
- Never use more than 3 colors for RAG status (green/yellow/red only)
- Never show raw JSON data in a dashboard component
- Never omit the five-number scoreline for board or executive audiences
- Never use custom CSS that overrides the RevPal theme
