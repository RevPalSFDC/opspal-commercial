---
name: gtm-strategy
description: Analyze market strategy including TAM/SAM/SOM, competitive positioning, and growth targets
argument-hint: "[--tam] [--competitors <list>] [--growth-target <percent>]"
visibility: user-invocable
aliases:
  - market-strategy
  - tam-analysis
tags:
  - gtm
  - strategy
  - planning
---

# /gtm-strategy Command

Analyze market strategy including TAM/SAM/SOM sizing, competitive positioning, and growth target validation.

## Usage

```bash
# Full market analysis
/gtm-strategy --tam --competitors

# Set growth target and validate
/gtm-strategy --growth-target 25%

# Focus on specific segment
/gtm-strategy --segment enterprise --region NA

# Generate board presentation
/gtm-strategy --presentation
```

## TAM/SAM/SOM Analysis

| Metric | Description |
|--------|-------------|
| TAM | Total Addressable Market - entire market opportunity |
| SAM | Serviceable Addressable Market - reachable with current offering |
| SOM | Serviceable Obtainable Market - realistic capture with resources |

```
Market Sizing: Enterprise SaaS
├── TAM: $50B (global enterprise software)
├── SAM: $8B (target verticals + regions)
├── SOM: $400M (realistic 5-year capture)
└── Current: $50M (12.5% of SOM)
```

## Competitive Analysis

| Factor | Weight | Analysis |
|--------|--------|----------|
| Market share | 25% | Position vs top 5 competitors |
| Feature parity | 20% | Gap analysis |
| Pricing power | 20% | Price position in market |
| Brand strength | 15% | Awareness and perception |
| Sales efficiency | 20% | CAC/LTV vs competitors |

## Growth Target Validation

```
Growth Target Analysis: 25% YoY
├── Market growth rate: 12%
├── Required share gain: 13%
├── Historical share gain: 8%
├── Gap to target: 5%
└── Feasibility: Stretch (requires new segment)

Recommendations:
1. Expand to mid-market (adds 3% growth)
2. Launch product extension (adds 2% growth)
3. Increase sales capacity 15%
```

## Output

- `market-strategy.json` - Full analysis
- `tam-sam-som.csv` - Market sizing breakdown
- `competitive-matrix.md` - Competitor comparison
- `growth-model.xlsx` - Target validation model

## Routing

This command invokes the `gtm-strategy-planner` agent.

## Example

```bash
# Full market strategy analysis with 20% growth target
/gtm-strategy --tam --competitors --growth-target 20%

# Output:
# Market Strategy Analysis: FY2026
# - TAM: $50B | SAM: $8B | SOM: $400M
# - Current market share: 6.25%
# - Target growth: 20% ($60M → $72M)
# - Feasibility: Achievable
# - Key initiatives: 3 identified
# - Files: market-strategy.json, competitive-matrix.md
```
