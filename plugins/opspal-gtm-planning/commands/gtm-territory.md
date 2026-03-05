---
name: gtm-territory
description: Design and validate sales territories with fairness scoring and workload balancing
argument-hint: "[--region <name>] [--reps <count>] [--method geography|industry|named]"
visibility: user-invocable
aliases:
  - design-territories
  - territory-plan
tags:
  - gtm
  - territory
  - planning
---

# /gtm-territory Command

Design, validate, and optimize sales territory assignments with built-in fairness validation.

## Usage

```bash
# Design territories for a region
/gtm-territory --region EMEA --reps 15

# Named account carveout
/gtm-territory --method named --accounts enterprise-list.csv

# Validate existing territories
/gtm-territory --validate

# Rebalance for fairness
/gtm-territory --rebalance --target-gini 0.25
```

## Territory Methods

| Method | Description | Best For |
|--------|-------------|----------|
| `geography` | State/region boundaries | Field sales, SMB |
| `industry` | Vertical segmentation | Specialists |
| `named` | Named account lists | Enterprise |
| `hybrid` | Combination approach | Complex orgs |

## Fairness Validation

Territories are validated against:
- **Gini coefficient** ≤0.3 (configurable)
- **Potential variance** ≤20% across reps
- **Workload balance** based on account count and engagement

```
Fairness Score: A (Gini: 0.18)
├── Territory 1: $2.1M potential, 45 accounts
├── Territory 2: $2.3M potential, 52 accounts
├── Territory 3: $1.9M potential, 48 accounts
└── Average: $2.1M ±9%
```

## Output

- `territory-design.json` - Full territory definitions
- `territory-map.csv` - Rep-to-account assignments
- `territory-fairness-report.md` - Validation results

## Routing

This command invokes the `gtm-territory-designer` agent.

## Example

```bash
# Design EMEA territories for 15 reps using geography
/gtm-territory --region EMEA --reps 15 --method geography

# Output:
# Territory design complete for EMEA
# - 15 territories created
# - Gini coefficient: 0.22 (PASS)
# - Total potential: $31.5M
# - Files: territory-design.json, territory-map.csv
```
