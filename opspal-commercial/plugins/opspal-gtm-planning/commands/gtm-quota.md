---
name: gtm-quota
description: Model and distribute sales quotas with scenario analysis and attainability scoring
argument-hint: "[--target <amount>] [--growth <percent>] [--scenario p10|p50|p90]"
visibility: user-invocable
aliases:
  - quota-model
  - capacity-plan
tags:
  - gtm
  - quota
  - planning
---

# /gtm-quota Command

Create quota models with scenario analysis, attainability scoring, and distribution optimization.

## Usage

```bash
# Model quotas with growth target
/gtm-quota --target 50M --growth 20%

# Generate P10/P50/P90 scenarios
/gtm-quota --scenarios

# Distribute across territories
/gtm-quota --distribute --territories territory-design.json

# Check attainability
/gtm-quota --validate-attainability
```

## Scenario Modeling

| Scenario | Confidence | Description |
|----------|------------|-------------|
| P10 | 10% | Aggressive stretch target |
| P50 | 50% | Most likely outcome |
| P90 | 90% | Conservative baseline |

## Attainability Scoring

Quotas are validated against historical performance:

```
Attainability Analysis
├── Historical hit rate: 62%
├── Avg over-attainment: 108%
├── Recommended quota: $2.1M (P50)
└── Risk: Medium (22% may miss)
```

**Thresholds:**
- >70% hit rate = Low risk
- 50-70% hit rate = Medium risk
- <50% hit rate = High risk (requires adjustment)

## Distribution Methods

| Method | Description |
|--------|-------------|
| `potential` | Based on territory potential |
| `historical` | Based on past performance |
| `equal` | Even distribution |
| `weighted` | Custom weights per rep |

## Output

- `quota-model.json` - Full quota model
- `scenarios.csv` - P10/P50/P90 by rep
- `attainability-report.md` - Risk analysis

## Routing

This command invokes the `gtm-quota-capacity` agent.

## Example

```bash
# Create $10M quota model with 15% growth
/gtm-quota --target 10M --growth 15% --distribute

# Output:
# Quota Model: FY2026
# - Total target: $10M (+15% YoY)
# - Distribution method: Territory potential
# - Average quota: $625K per rep
# - Attainability score: 68% (Medium risk)
# - Files: quota-model.json, scenarios.csv
```
