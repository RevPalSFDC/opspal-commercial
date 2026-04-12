---
description: View current Attio workspace health metrics
argument-hint: "[--compare-previous] [--format summary|detail]"
---

# /attio-observability-dashboard

View current Attio workspace health metrics from the latest monitoring snapshot. Supports delta comparison against the previous snapshot and full metric breakdowns.

## Usage

```
/attio-observability-dashboard [--compare-previous] [--format summary|detail]
```

## What Is Displayed

The dashboard surfaces metrics collected by scheduled monitors configured via `/attio-observability-setup`:

**Health Score** — Composite workspace health score (0–100) derived from:
- Record completeness across core objects
- Attribute fill rates for required fields
- Recent member activity levels
- Webhook reliability status

**Pipeline Drift Indicators** — Changes in deal flow vs. prior period:
- Stage velocity deltas (deals moving faster or slower than baseline)
- Coverage ratio trend (improving, stable, or degrading)
- Stale deal count and aging breakdown

**Data Quality Score** — Attribute health across workspace objects:
- Missing required field rate by object type
- Duplicate signal count (pending deduplication)
- Enrichment gap rate (records missing key contextual data)

**Member Activity** — Workspace engagement metrics:
- Active members in period
- Note and task creation rates
- Last-seen timestamps for inactive members

**Webhook Status** — Integration health:
- Active webhook count vs. configured
- Recent delivery failure rate
- Last successful delivery timestamp per endpoint

## Flags

**`--compare-previous`** — Show delta values against the prior snapshot. Highlights metric improvements and regressions with directional indicators (up/down/stable).

```
/attio-observability-dashboard --compare-previous
```

**`--format detail`** — Expand all metrics to full breakdown. Default is `summary`, which shows top-level scores with flagged issues only.

```
/attio-observability-dashboard --format detail
```

Both flags can be combined:

```
/attio-observability-dashboard --compare-previous --format detail
```

## Requirements

At least one monitoring schedule must be configured via `/attio-observability-setup` before snapshot data is available.

## Delegation

Delegates to the **attio-observability-orchestrator** agent for snapshot retrieval, metric calculation, delta computation, and formatted dashboard output.
