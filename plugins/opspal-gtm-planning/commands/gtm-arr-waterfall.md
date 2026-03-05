---
name: gtm-arr-waterfall
description: Generate ARR waterfall analysis showing revenue movement components
argument-hint: "[--period Q4-2025] [--segments all]"
telemetry-contract: opspal-command-telemetry-v1
telemetry-enabled: true
---

# ARR Waterfall Analysis

Generate ARR waterfall showing Starting → New → Expansion → Churn → Ending movement.

## Usage

```
/gtm-arr-waterfall [options]
```

## Options

- `--period` - Analysis period (default: current quarter)
- `--segments` - Filter by segments (default: all)
- `--compare-prior` - Compare to prior period
- `--by-segment` - Break down by customer segment

## Waterfall Components

1. **Starting ARR** - Beginning of period ARR
2. **+ New ARR** - Revenue from new customers
3. **+ Expansion ARR** - Upsells and cross-sells
4. **- Churned ARR** - Lost revenue from departures
5. **- Contraction ARR** - Downgrades (optional)
6. **= Ending ARR** - End of period ARR

## Output

### Waterfall Chart
```
Starting ARR:   $10.0M  ████████████████████
+ New ARR:       $3.0M  ██████ (+30%)
+ Expansion:     $1.5M  ███ (+15%)
- Churned:      -$0.8M  ██ (-8%)
= Ending ARR:   $13.7M  ███████████████████████████
                        Net Growth: +$3.7M (+37%)
```

### Component Analysis
- New ARR contribution: 81% of gross adds
- Expansion contribution: 41% of gross adds
- Churn rate: 8% of starting ARR
- Net ARR added: $3.7M

## Reconciliation Check

The system validates: Starting + New + Expansion - Churn = Ending

## Example

```bash
# Current quarter waterfall
/gtm-arr-waterfall

# Q4 waterfall by segment
/gtm-arr-waterfall --period Q4-2025 --by-segment

# Compare Q4 to Q3
/gtm-arr-waterfall --period Q4-2025 --compare-prior
```

---

This command routes to the `gtm-revenue-modeler` agent.
