---
name: gtm-comp
description: Design sales compensation plans with OTE modeling, accelerators, and UAT validation
argument-hint: "[--ote <amount>] [--split <base/variable>] [--accelerators]"
telemetry-contract: opspal-command-telemetry-v1
telemetry-enabled: true
visibility: user-invocable
aliases:
  - comp-plan
  - compensation
tags:
  - gtm
  - compensation
  - planning
---

# /gtm-comp Command

Design and validate sales compensation plans with OTE modeling, accelerator structures, and UAT validation.

## Usage

```bash
# Design compensation plan with OTE
/gtm-comp --ote 200K --split 50/50

# Add accelerators for over-attainment
/gtm-comp --accelerators --multipliers 1.5x,2x,3x

# Validate with UAT scenarios
/gtm-comp --uat --scenarios edge-cases.json

# Compare plan variants
/gtm-comp --compare planA.json planB.json
```

## OTE Structure

| Component | Description |
|-----------|-------------|
| Base Salary | Fixed compensation (typically 50-70%) |
| Variable | At-risk compensation tied to quota |
| Accelerators | Multipliers for over-attainment |
| Decelerators | Reduced rate below threshold |
| SPIFs | Short-term performance incentives |

## Accelerator Modeling

```
Payout Curve Example:
├── 0-50% attainment: 0.5x rate (decelerator)
├── 50-100% attainment: 1.0x rate (standard)
├── 100-125% attainment: 1.5x rate (accelerator)
├── 125-150% attainment: 2.0x rate (super accelerator)
└── 150%+ attainment: 3.0x rate (uncapped)
```

## UAT Validation

Before finalizing, validate with:

| Scenario | Test |
|----------|------|
| Floor case | Rep at 50% attainment |
| Target case | Rep at 100% attainment |
| Stretch case | Rep at 150% attainment |
| Windfall case | Large deal impact |
| Churn case | Clawback scenarios |

## Output

- `comp-plan.json` - Full compensation structure
- `payout-curves.csv` - Payout at each attainment level
- `uat-results.md` - Validation test results
- `earnings-calculator.html` - Interactive calculator

## Routing

This command invokes the `gtm-comp-planner` agent.

## Example

```bash
# Create $200K OTE plan with 60/40 split and accelerators
/gtm-comp --ote 200K --split 60/40 --accelerators

# Output:
# Compensation Plan: FY2026 AE
# - OTE: $200,000
# - Base: $120,000 (60%)
# - Variable: $80,000 (40%)
# - Accelerators: 1.5x @ 100%, 2x @ 125%, 3x @ 150%
# - UAT: All scenarios passed
# - Files: comp-plan.json, payout-curves.csv
```
