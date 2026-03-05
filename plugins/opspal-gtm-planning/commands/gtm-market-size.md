---
name: gtm-market-size
description: Calculate TAM/SAM/SOM market opportunity sizing with penetration analysis
argument-hint: "[--method bottom-up|top-down] [--segments true]"
---

# TAM/SAM/SOM Market Sizing

Calculate Total Addressable Market, Serviceable Addressable Market, and Serviceable Obtainable Market.

## Usage

```
/gtm-market-size [options]
```

## Options

- `--method` - Calculation method: bottom-up, top-down (default: bottom-up)
- `--segments` - Break down by market segments
- `--sources` - Show data sources used
- `--penetration` - Calculate current market penetration

## Market Definitions

### TAM (Total Addressable Market)
Maximum potential market demand at 100% market share.
```
TAM = Potential Customers × Average Revenue per Customer
```

### SAM (Serviceable Addressable Market)
Portion of TAM reachable given product scope, geography, and ICP.
```
SAM = TAM × ICP Filter Percentage
```

### SOM (Serviceable Obtainable Market)
Realistic near-term capture based on capacity and competition.
```
SOM = SAM × Realistic Market Share %
```

## Output

### Market Funnel
```
TAM:     $50B   ████████████████████████████████████████████████████
SAM:     $12B   ████████████ (24% of TAM)
SOM:     $1.2B  █ (10% of SAM)
Current: $25M   (2.1% of SOM)
```

### Segment Breakdown
| Segment | TAM | SAM | Current | Penetration |
|---------|-----|-----|---------|-------------|
| Enterprise | $30B | $8B | $15M | 0.19% |
| Mid-Market | $15B | $3B | $7M | 0.23% |
| SMB | $5B | $1B | $3M | 0.30% |

### Penetration Benchmarks
| Stage | TAM Penetration | SAM Penetration |
|-------|-----------------|-----------------|
| Early | <1% | <5% |
| Growth | 1-5% | 5-20% |
| Mature | 5-15% | 20-50% |

## Data Sources

Market sizing uses:
- Industry analyst reports (Gartner, Forrester, IDC)
- Internal customer data for bottom-up validation
- Competitor market share estimates

## Example

```bash
# Basic market sizing
/gtm-market-size

# Bottom-up with segment breakdown
/gtm-market-size --method bottom-up --segments true

# Show penetration with sources
/gtm-market-size --penetration --sources
```

---

This command routes to the `gtm-market-intelligence` agent.
