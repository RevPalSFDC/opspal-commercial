---
name: gtm-icp-analysis
description: Analyze ICP (Ideal Customer Profile) win rates and identify winning deal profiles
argument-hint: "[--period Q4-2025] [--attributes industry,size,use-case]"
---

# ICP Performance & Win Profile Analysis

Analyze ICP deal win rates and identify common attributes of winning deals.

## Usage

```
/gtm-icp-analysis [options]
```

## Options

- `--period` - Analysis period (default: trailing 12 months)
- `--attributes` - Attributes to analyze (default: industry, size, use_case)
- `--min-sample` - Minimum sample size for attribute (default: 10)
- `--include-expansion` - Include ICP impact on expansion

## Key Metrics

### ICP Win Rate Comparison
```
ICP Deals:     42% win rate (120 won / 285 total)
Non-ICP Deals: 28% win rate (65 won / 232 total)
Win Rate Lift: 1.5x
```

### Win Rate Lift Thresholds
| Lift | Assessment |
|------|------------|
| ≥1.5x | Significant - ICP targeting is effective |
| 1.2-1.5x | Marginal - Some ICP benefit |
| <1.2x | Not significant - Re-evaluate ICP definition |

## Output

### ICP vs Non-ICP Summary
```
                    ICP        Non-ICP    Lift
Win Rate:           42%        28%        1.5x
Avg Deal Size:      $45K       $28K       1.6x
Sales Cycle:        45 days    62 days    0.7x (faster)
```

### Win Profile Attributes

**Industry (Top 3 by Win Rate)**
| Industry | Win Rate | Deal Count |
|----------|----------|------------|
| Technology | 48% | 120 |
| Financial Services | 44% | 85 |
| Healthcare | 38% | 62 |

**Company Size**
| Size | Win Rate | Deal Count |
|------|----------|------------|
| 500-1000 employees | 52% | 90 |
| 1000-5000 employees | 45% | 75 |
| 100-500 employees | 35% | 110 |

**Use Case**
| Use Case | Win Rate | Deal Count |
|----------|----------|------------|
| Revenue Operations | 55% | 65 |
| Sales Automation | 42% | 88 |
| Customer Success | 38% | 54 |

### Recommendations

Based on win profile analysis:
1. **Refine ICP** - Focus on Tech/FinServ, 500-5000 employees
2. **Use Case Alignment** - Lead with RevOps positioning
3. **Expansion Opportunity** - Healthcare showing growth potential

## Example

```bash
# Basic ICP analysis
/gtm-icp-analysis

# Analyze specific attributes
/gtm-icp-analysis --attributes industry,size,region,champion_title

# Recent quarter with expansion impact
/gtm-icp-analysis --period Q4-2025 --include-expansion
```

---

This command routes to the `gtm-market-intelligence` agent.
