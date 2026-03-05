---
name: gtm-revenue-mix
description: Analyze revenue composition by source (New vs Expansion vs Renewal)
argument-hint: "[--period 2025] [--trend true]"
---

# Revenue Mix Analysis

Break down revenue by source: New Business, Expansion, and Renewals.

## Usage

```
/gtm-revenue-mix [options]
```

## Options

- `--period` - Analysis period (default: current year)
- `--trend` - Show mix evolution over time
- `--compare-benchmark` - Compare to stage benchmarks
- `--by-segment` - Break down by customer segment

## Revenue Categories

### New Business ARR
Revenue from first-time customers (no prior ARR).

### Expansion ARR
Revenue growth from existing customers:
- Upsells (more of same product)
- Cross-sells (additional products)

### Renewal ARR
Recurring revenue from renewed contracts (at same value).

## Output

### Current Mix
```
Total ARR: $33M

New Business:  $18M (55%)  ████████████████████████████
Expansion:     $12M (36%)  ███████████████████
Renewal:        $3M (9%)   █████
```

### Mix Trend
| Year | New | Expansion | Renewal |
|------|-----|-----------|---------|
| 2023 | 80% | 15% | 5% |
| 2024 | 65% | 25% | 10% |
| 2025 | 55% | 35% | 10% |

### Stage Benchmarks
| Stage | New | Expansion | Renewal |
|-------|-----|-----------|---------|
| Early | 80% | 15% | 5% |
| Growth | 60% | 30% | 10% |
| Mature | 40% | 45% | 15% |

## Insights

The analysis identifies:
- Is expansion becoming a larger growth driver (healthy maturation)?
- Are we over-reliant on new business?
- Is renewal base stable?

## Example

```bash
# Current year mix
/gtm-revenue-mix

# 3-year trend with benchmarks
/gtm-revenue-mix --trend --compare-benchmark --period 2023,2024,2025

# Mix by segment
/gtm-revenue-mix --by-segment
```

---

This command routes to the `gtm-retention-analyst` agent.
